/**
 * Diarize session — same public interface as whisper-session.js.
 *
 * Spawns diarize.py as a persistent subprocess. Audio is sent as base64-encoded
 * JSON lines over stdin. Utterances with real speaker labels arrive over stdout.
 *
 * Fallback: if Python crashes or times out before emitting 'ready', automatically
 * falls back to whisper-session.js (speaker: null) without breaking the session.
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { translateText } from "./translate.js";
import { createSession as createWhisperSession } from "./whisper-session.js";
import { createLogger } from "../logger.js";
import { getVenvPython } from "./python-utils.js";

const log = createLogger("diarize");

const __dirname = dirname(fileURLToPath(import.meta.url));

// In packaged Electron, __dirname is inside app.asar (virtual filesystem).
// Python is an external process and cannot read files from ASAR.
// We resolve the real path via app.asar.unpacked when available.
function resolveDiarizePy() {
  const base = join(__dirname, "diarize.py");
  const unpacked = base.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
  return existsSync(unpacked) ? unpacked : base;
}

const DIARIZE_PY = resolveDiarizePy();

// How long to wait for Python 'ready' before falling back (covers model download)
const READY_TIMEOUT_MS = 120_000;


export function createSession({
  targetLanguage = "vi",
  whisperLanguage = "auto",
  whisperModel = "base",
  localTranslationEngine = "none",
  ollamaBaseUrl = "http://localhost:11434",
  ollamaModel = "llama3.2",
  libreTranslateUrl = "http://localhost:5000",
  languageHints = ["en"],
  hfToken = "",
  context = null,
} = {}) {
  let _onPartial = null;
  let _onUtterance = null;
  let _onError = null;

  let pyProcess = null;
  let stdoutBuf = "";
  let stopped = false;
  let ready = false;
  let readyResolve = null;
  let fallbackSession = null;
  let useFallback = false;

  const detectedLang = whisperLanguage === "auto"
    ? (languageHints[0] || "en")
    : whisperLanguage;

  const translationSettings = {
    localTranslationEngine,
    ollamaBaseUrl,
    ollamaModel,
    libreTranslateUrl,
    targetLanguage,
    context,
  };

  // Translation debouncing for partials (same pattern as whisper-session)
  let partialDebounceTimer = null;
  let lastPartialTranslation = "";
  const PARTIAL_DEBOUNCE_MS = 500;

  async function handlePartial({ text }) {
    if (!text) return;

    // Emit immediately with last known translation (responsive UI)
    _onPartial?.({ originalText: text, translatedText: lastPartialTranslation, speaker: null });

    // Debounce the actual translation call
    clearTimeout(partialDebounceTimer);
    partialDebounceTimer = setTimeout(async () => {
      try {
        const { translated } = await translateText(text, detectedLang, translationSettings);
        if (translated) {
          lastPartialTranslation = translated;
          _onPartial?.({ originalText: text, translatedText: translated, speaker: null });
        }
      } catch (err) {
        log.warn("Partial translation error", err);
      }
    }, PARTIAL_DEBOUNCE_MS);
  }

  async function handleUtterance({ text, speaker }) {
    if (!text) return;
    clearTimeout(partialDebounceTimer);
    lastPartialTranslation = "";  // Reset for next cycle
    const { translated, lang } = await translateText(text, detectedLang, translationSettings);
    _onUtterance?.({
      originalText: text,
      translatedText: translated,
      originalLanguage: detectedLang,
      translationLanguage: lang || null,
      speaker: speaker || null,
      timestamp: new Date().toISOString(),
    });
  }

  function parseLine(line) {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    switch (msg.type) {
      case "ready":
        ready = true;
        readyResolve?.();
        readyResolve = null;
        log.info("Python worker ready");
        break;
      case "partial":
        handlePartial(msg).catch((err) =>
          log.warn("Partial handling error", err)
        );
        break;
      case "utterance":
        handleUtterance(msg).catch((err) =>
          log.error("Translation error", err)
        );
        break;
      case "error":
        log.error("Python error", new Error(msg.message));
        _onError?.(new Error(msg.message));
        break;
    }
  }

  async function activateFallback() {
    if (useFallback) return;
    readyResolve?.();
    readyResolve = null;
    log.warn("Activating fallback (whisper, no speaker labels)");
    useFallback = true;
    fallbackSession = createWhisperSession({
      targetLanguage, whisperLanguage, whisperModel,
      localTranslationEngine, ollamaBaseUrl, ollamaModel,
      libreTranslateUrl, languageHints, context,
    });
    fallbackSession.onPartial((p) => _onPartial?.(p));
    fallbackSession.onUtterance((u) => _onUtterance?.(u));
    fallbackSession.onError((e) => _onError?.(e));
    await fallbackSession.connect();
    await fallbackSession.startStreaming();
  }

  function sendToPython(obj) {
    if (!pyProcess || stopped || useFallback) return;
    try {
      pyProcess.stdin.write(JSON.stringify(obj) + "\n");
    } catch (err) {
      log.error("Stdin write failed", err);
    }
  }

  return {
    async connect() {
      const pythonBin = getVenvPython();
      const pyArgs = [
        DIARIZE_PY,
        "--hf-token", hfToken,
        "--whisper-model", whisperModel,
      ];

      log.info(`Spawning ${pythonBin} diarize.py`);

      try {
        pyProcess = spawn(pythonBin, pyArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            TOKENIZERS_PARALLELISM: "false",
            TRANSFORMERS_VERBOSITY: "error",
          },
        });
      } catch (err) {
        log.error("Spawn failed", err);
        await activateFallback();
        return;
      }

      // Accumulate stderr for error diagnosis
      let stderrBuf = "";
      pyProcess.stderr.on("data", (d) => {
        stderrBuf += d.toString("utf8");
        if (stderrBuf.length > 10240) stderrBuf = stderrBuf.slice(-10240);
      });

      pyProcess.stdout.on("data", (data) => {
        stdoutBuf += data.toString("utf8");
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop();
        for (const line of lines) parseLine(line);
      });

      pyProcess.on("exit", (code, signal) => {
        if (!stopped) {
          if (stderrBuf.trim()) log.debug("diarize.py stderr", { stderr: stderrBuf.trim() });
          log.error("Python exited unexpectedly", { code, signal });
          activateFallback().catch((err) => log.error("activateFallback failed", err));
        }
      });

      pyProcess.on("error", (err) => {
        log.error("Process error", err);
        activateFallback().catch((err) => log.error("activateFallback failed", err));
      });

      // Wait for 'ready' or timeout → fallback
      await new Promise((resolve) => {
        const timeout = setTimeout(async () => {
          if (!ready && !useFallback) {
            log.warn("Ready timeout — activating fallback");
            if (stderrBuf.trim()) log.debug("diarize.py stderr at timeout", { stderr: stderrBuf.trim() });
            await activateFallback();
          }
          resolve();
        }, READY_TIMEOUT_MS);
        readyResolve = () => {
          clearTimeout(timeout);
          resolve();
        };
        if (ready || useFallback) readyResolve();
      });
    },

    async startStreaming() {
      // Python is already in its stdin loop after load_models()
      // Fallback starts streaming inside activateFallback()
    },

    sendAudio(chunk) {
      if (stopped) return;
      if (useFallback) {
        fallbackSession?.sendAudio(chunk);
        return;
      }
      // Drop audio before Python is ready (avoids unbounded buffering)
      if (!ready) return;
      sendToPython({ type: "audio", data: chunk.toString("base64") });
    },

    async stop() {
      if (stopped) return;
      stopped = true;

      if (useFallback && fallbackSession) {
        await fallbackSession.stop();
        return;
      }

      if (pyProcess) {
        sendToPython({ type: "shutdown" });
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            try { pyProcess.kill("SIGTERM"); } catch {}
            resolve();
          }, 10_000);
          pyProcess.on("exit", () => { clearTimeout(timeout); resolve(); });
        });
      }
    },

    onPartial(cb) { _onPartial = cb; },
    onUtterance(cb) { _onUtterance = cb; },
    onError(cb) { _onError = cb; },
  };
}
