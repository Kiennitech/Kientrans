import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";

import apiRoutes from "./routes/api.js";
import { loadSettings } from "./storage/settings.js";
import { createLogger } from "./logger.js";

const log = createLogger("server");

// Set FFMPEG_PATH from ffmpeg-static when not already set (Electron sets it in main.js)
if (!process.env.FFMPEG_PATH) {
  try {
    const require = createRequire(import.meta.url);
    process.env.FFMPEG_PATH = require("ffmpeg-static");
  } catch {
    // ffmpeg-static not installed — fall back to system ffmpeg
  }
}

// Add ffmpeg directory to PATH so subprocesses (Python whisper etc.) can find it
if (process.env.FFMPEG_PATH) {
  const ffmpegDir = path.dirname(process.env.FFMPEG_PATH);
  process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;
}

// Lazy-loaded modules — cache the Promise itself so concurrent callers share one load
let _historyP, _sonioxP, _captureP, _whisperP, _diarizeP, _devicesP;

function getHistory() {
  if (!_historyP) _historyP = import("./storage/history.js");
  return _historyP;
}
function getSonioxSession() {
  if (!_sonioxP) _sonioxP = import("./soniox/session.js").then((m) => m.createSession);
  return _sonioxP;
}
function getCapture() {
  if (!_captureP) _captureP = import("./audio/capture.js").then((m) => m.startCapture);
  return _captureP;
}
function getWhisperSession() {
  if (!_whisperP) _whisperP = import("./local/whisper-session.js").then((m) => m.createSession);
  return _whisperP;
}
function getDiarizeSession() {
  if (!_diarizeP) _diarizeP = import("./local/diarize-session.js").then((m) => m.createSession);
  return _diarizeP;
}
function getDevices() {
  if (!_devicesP) _devicesP = import("./audio/devices.js").then((m) => m.listInputDevices);
  return _devicesP;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../dist"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-store");
    }
  },
}));
app.use("/api", apiRoutes);

// Active sessions per socket
const activeSessions = new Map();

// Log and emit an error event to the client in one call
function emitError(socket, payload) {
  log.warn(`Emit error: ${payload.key}`, { socketId: socket.id, ...payload.params && { params: payload.params } });
  socket.emit("error", payload);
}

io.on("connection", (socket) => {
  log.info("Client connected", { socketId: socket.id });

  socket.on("start-listening", async (opts) => {
    // Fire-and-forget cleanup of any existing session (captures are stopped synchronously)
    stopSession(socket.id).catch(() => {});

    try {
      const [history, startCapture, listInputDevices] = await Promise.all([
        getHistory(), getCapture(), getDevices(),
      ]);

      const settings = loadSettings();
      const engine = settings.transcriptionEngine || "soniox";
      const currentApiKey = settings.sonioxApiKey?.trim();

      if (engine === "soniox" && !currentApiKey) {
        emitError(socket, { key: "errNoApiKey" });
        return;
      }


      const resumeSessionId = opts?.sessionId;
      const requestedContext = typeof opts?.context === "string" && opts.context.trim() ? opts.context.trim() : null;
      let audioSource, micTargetLanguage, systemTargetLanguage, sessionContext;

      if (resumeSessionId) {
        // Resume existing session and re-use prior context unless overridden
        const existing = history.getSession(resumeSessionId);
        if (!existing || !existing.ended_at) {
          emitError(socket, { key: "errSessionNotFound" });
          return;
        }
        history.reopenSession(resumeSessionId);
        audioSource = existing.audio_source;
        const targetLang = existing.target_language;
        if (targetLang.includes(",")) {
          const [mic, sys] = targetLang.split(",");
          micTargetLanguage = mic;
          systemTargetLanguage = sys;
        } else {
          micTargetLanguage = targetLang;
          systemTargetLanguage = targetLang;
        }
        sessionContext = requestedContext || existing.context || null;
        if (requestedContext && requestedContext !== existing.context) {
          history.updateSessionContext(resumeSessionId, requestedContext);
        }
      } else {
        audioSource = settings.audioSource;
        const targetLanguage = settings.targetLanguage;
        micTargetLanguage = settings.micTargetLanguage ?? targetLanguage;
        systemTargetLanguage = settings.systemTargetLanguage ?? targetLanguage;
        sessionContext = requestedContext || null;
      }

      const languageHints = settings.languageHints || ["en"];

      const sttMode = engine === "local-whisper"
        ? (settings.enableDiarization && settings.hfToken ? "diarize" : "whisper")
        : "soniox";

      // Pre-fetch STT module (resolves while doing device/DB work below)
      const sttFactoryP = sttMode === "diarize" ? getDiarizeSession()
        : sttMode === "whisper" ? getWhisperSession()
        : getSonioxSession();

      // Resolve devices
      const devices = await listInputDevices();
      const isWin = process.platform === "win32";
      const micIndex = settings.micDeviceIndex ?? 0;
      const micDevice = devices.find((d) => d.index === micIndex);

      // On Windows, dshow needs device name; on macOS, avfoundation uses index
      const micCaptureDev = isWin ? micDevice?.name : micIndex;

      // System device: use manual setting or auto-detect virtual loopback input device
      let systemCaptureDev = null;
      if (audioSource === "system" || audioSource === "both") {
        const systemIndex = settings.systemDeviceIndex;
        if (systemIndex != null) {
          // Manual selection from settings
          const systemDevice = devices.find((d) => d.index === systemIndex);
          if (systemDevice) {
            systemCaptureDev = isWin ? systemDevice.name : systemDevice.index;
          } else {
            emitError(socket, { key: "errSystemDeviceNotFound", params: { index: systemIndex } });
          }
        } else {
          // Auto-detect: macOS: BlackHole, Windows: VB-CABLE / Stereo Mix / CABLE Output
          const loopbackPattern = isWin
            ? /cable|stereo mix|virtual|vb-audio/i
            : /blackhole/i;
          const loopback = devices.find((d) => loopbackPattern.test(d.name));
          if (loopback) {
            systemCaptureDev = isWin ? loopback.name : loopback.index;
          } else {
            emitError(socket, { key: isWin ? "errNoLoopbackWin" : "errNoLoopbackMac" });
          }
        }
      }

      const deviceName = micDevice?.name || `Device ${micIndex}`;

      // Create or reuse history session
      let dbSessionId;
      if (resumeSessionId) {
        dbSessionId = resumeSessionId;
      } else {
        const historyTargetLang = audioSource === "both" && micTargetLanguage !== systemTargetLanguage
          ? `${micTargetLanguage},${systemTargetLanguage}`
          : (audioSource === "system" ? systemTargetLanguage : micTargetLanguage);
        dbSessionId = history.createSession(audioSource, historyTargetLang, deviceName, sessionContext);
      }

      log.info("Session starting", {
        socketId: socket.id,
        sessionId: dbSessionId,
        engine: sttMode,
        source: audioSource,
        micLang: micTargetLanguage,
        systemLang: systemTargetLanguage,
        resume: !!resumeSessionId,
      });

      const state = {
        dbSessionId,
        audioSource,
        paused: false,
        captures: [],
        sttSessions: [],
      };

      const sources = audioSource === "both"
        ? ["mic", "system"]
        : [audioSource];

      // Register state and ACK the client immediately — STT setup continues below
      activeSessions.set(socket.id, state);
      socket.emit("status", { listening: true, sessionId: dbSessionId, audioSource });

      const createSTT = await sttFactoryP;

      await Promise.all(sources.map(async (source) => {
        const captureDev = source === "mic" ? micCaptureDev : systemCaptureDev;
        if (captureDev == null) {
          emitError(socket, { key: "errNoDevice", params: { source } });
          return;
        }

        // Start audio capture
        const capture = startCapture(captureDev);
        capture.onError((err) => {
          emitError(socket, { key: "errAudioCapture", params: { source, detail: err.message } });
        });

        // Create STT session
        const sourceTargetLang = source === "mic" ? micTargetLanguage : systemTargetLanguage;
        let stt;
        if (engine === "local-whisper") {
          const sessionOpts = {
            targetLanguage: sourceTargetLang,
            languageHints,
            whisperModel: settings.whisperModel || "base",
            whisperLanguage: source === "mic"
              ? (settings.micWhisperLanguage || "auto")
              : (settings.systemWhisperLanguage || "auto"),
            localTranslationEngine: settings.localTranslationEngine || "none",
            ollamaBaseUrl: settings.ollamaBaseUrl,
            ollamaModel: settings.ollamaModel,
            geminiApiKey: settings.geminiApiKey,
            libreTranslateUrl: settings.libreTranslateUrl,
            context: sessionContext,
          };
          stt = sttMode === "diarize"
            ? createSTT({ ...sessionOpts, hfToken: settings.hfToken })
            : createSTT(sessionOpts);
        } else {
          stt = createSTT({
            targetLanguage: sourceTargetLang,
            languageHints,
            apiKey: currentApiKey || undefined,
            context: sessionContext,
            geminiApiKey: settings.geminiApiKey?.trim(),
            localTranslationEngine: settings.localTranslationEngine
          });
        }

        // In "both" mode, prefix speaker IDs with source to avoid collisions
        // between independent STT sessions (e.g. spk_0 from mic vs spk_0 from system)
        const prefixSpeaker = (obj) => {
          if (audioSource !== "both" || !obj.speaker) return obj;
          return { ...obj, speaker: `${source}:${obj.speaker}` };
        };

        stt.onPartial((partial) => {
          socket.emit("partial-result", { source, ...prefixSpeaker(partial) });
        });

        stt.onUtterance(async (utterance) => {
          const prefixed = prefixSpeaker(utterance);
          
          if (utterance.isUpdate) {
            socket.emit("translation-result", { 
              id: prefixed.timestamp, 
              translated: prefixed.translatedText, 
              lang: prefixed.translationLanguage 
            });
            const h = await getHistory();
            h.updateUtteranceTranslation(prefixed.timestamp, prefixed.translatedText, prefixed.translationLanguage);
          } else {
            socket.emit("utterance", { source, ...prefixed });
            if (utterance.originalText) {
              const h = await getHistory();
              h.addUtterance(dbSessionId, { ...prefixed, source });
            }
          }
        });

        stt.onError((err) => {
          const key = engine === "local-whisper" ? "errWhisper" : "errSoniox";
          emitError(socket, { key, params: { detail: err.message } });
        });

        await stt.connect();

        // Abort if session was stopped or replaced while connecting
        if (activeSessions.get(socket.id) !== state) {
          capture.stop();
          stt.stop().catch(() => {});
          return;
        }

        await stt.startStreaming();

        capture.stream.on("data", (chunk) => stt.sendAudio(chunk));
        capture.stream.on("end", () => stt.stop().catch(() => {}));

        state.captures.push(capture);
        state.sttSessions.push(stt);
      }));

      log.info("All sources connected", { socketId: socket.id, sessionId: dbSessionId });
    } catch (err) {
      // Revert to stopped state on failure
      stopSession(socket.id).catch(() => {});
      socket.emit("status", { listening: false });
      const key = err.message?.includes("authenticate") || err.message?.includes("401") || err.message?.includes("Unauthorized")
        ? "errInvalidApiKey"
        : err.message?.includes("ENOTFOUND") || err.message?.includes("ECONNREFUSED")
        ? "errNetwork"
        : "errStartFailed";
      emitError(socket, { key, params: { detail: err.message } });
      log.error("Start error", err);
    }
  });

  socket.on("pause-listening", () => {
    const state = activeSessions.get(socket.id);
    if (!state || state.paused) return;

    for (const capture of state.captures) {
      capture.pause();
    }
    state.paused = true;
    socket.emit("status", { listening: true, paused: true, sessionId: state.dbSessionId, audioSource: state.audioSource });
    log.info("Paused", { socketId: socket.id });
  });

  socket.on("resume-listening", () => {
    const state = activeSessions.get(socket.id);
    if (!state || !state.paused) return;

    for (const capture of state.captures) {
      capture.resume();
    }
    state.paused = false;
    socket.emit("status", { listening: true, paused: false, sessionId: state.dbSessionId, audioSource: state.audioSource });
    log.info("Resumed", { socketId: socket.id });
  });

  socket.on("stop-listening", () => {
    socket.emit("status", { listening: false });
    stopSession(socket.id).catch((err) => log.error("Stop error", err));
  });

  socket.on("manual-translate", async ({ id, text, sourceLang }) => {
    try {
      const settings = loadSettings();
      let engine = settings.localTranslationEngine;
      
      // If user clicked manual translate but their general setting is 'none', smart fallback
      if (!engine || engine === "none" || engine === "soniox") {
        engine = settings.ollamaModel ? "ollama" : "gemini";
      }

      if (engine === "gemini" && !settings.geminiApiKey) {
        return socket.emit("translation-result", { id, error: "Missing Gemini API Key" });
      }

      // Use the configured BrSE translator (Ollama, Gemini, etc.)
      const { translateText } = await import("./local/translate.js");
      const { translated, lang } = await translateText(text, sourceLang, { ...settings, localTranslationEngine: engine });
      
      if (translated) {
        // Update history in DB
        const h = await getHistory();
        h.updateUtteranceTranslation(id, translated, lang);
        
        // Broadcast to client
        socket.emit("translation-result", { id, translated, lang });
      }
    } catch (err) {
      log.error("Manual translation error", err);
      socket.emit("translation-result", { id, error: err.message });
    }
  });



  socket.on("edit-utterance", async ({ id, newSpeaker, newOriginalText }) => {
    try {
      const h = await getHistory();
      h.updateUtterance(id, newSpeaker, newOriginalText);
      // Let other clients know if they exist (or re-emit to self)
      io.emit("utterance-updated", { id, newSpeaker, newOriginalText });
    } catch (err) {
      log.error("Edit utterance error", err);
    }
  });

  socket.on("disconnect", async () => {
    await stopSession(socket.id);
    log.info("Client disconnected", { socketId: socket.id });
  });
});

async function stopSession(socketId) {
  const state = activeSessions.get(socketId);
  if (!state) return;

  // Remove immediately to prevent double-stop from concurrent disconnect + stop-listening
  activeSessions.delete(socketId);

  log.info("Stopping session", { socketId, sessionId: state.dbSessionId });

  for (const capture of state.captures) {
    capture.stop();
  }

  // End DB session + stop all STT sessions in parallel
  await Promise.all([
    getHistory().then((h) => h.endSession(state.dbSessionId)),
    ...state.sttSessions.map((stt) => stt.stop().catch(() => {})),
  ]);
}

// Start server
export async function startServer(overridePort) {
  const settings = loadSettings();
  const PORT = overridePort || process.env.PORT || settings.port || 3000;
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      log.info(`Server running at http://localhost:${PORT}`);
      resolve(PORT);
    });
  });
}

// Auto-start when running directly (not via Electron)
if (!process.env.ELECTRON) {
  startServer();
}
