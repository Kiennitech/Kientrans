/**
 * Local Whisper STT session — same interface as src/soniox/session.js.
 *
 * Spawns whisper-worker.py as a persistent subprocess (model loaded once),
 * then streams audio chunks via stdin. Results arrive as newline-delimited
 * JSON on stdout: "partial" for live text, "utterance" for final commits.
 *
 * Requires Python with faster-whisper installed. Reuses the venv created by
 * Whisper/Diarization setup at ~/.node-trans/venv (or legacy diarize-venv/whisper-venv).
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { translateText } from "./translate.js";
import { createLogger } from "../logger.js";
import { getVenvPython } from "./python-utils.js";
const log = createLogger("whisper");

const __dirname = dirname(fileURLToPath(import.meta.url));

// Wait up to 60 s for the model to load before giving up
const READY_TIMEOUT_MS = 60_000;


function resolveWorkerScript() {
  // When packaged in Electron, source files live inside app.asar (virtual FS).
  // Python cannot read from ASAR — use the unpacked path when available.
  const base = join(__dirname, "whisper-worker.py");
  const unpacked = base.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
  return existsSync(unpacked) ? unpacked : base;
}

export function createSession({
  targetLanguage = "vi",
  whisperLanguage = "auto",
  whisperModel = "base",
  localTranslationEngine = "none",
  ollamaBaseUrl = "http://localhost:11434",
  ollamaModel = "llama3.2",
  libreTranslateUrl = "http://localhost:5000",
  languageHints = ["en"],
  context = null,
  geminiApiKey = null,
} = {}) {
  let _onPartial = null;
  let _onUtterance = null;
  let _onError = null;

  let pyProcess = null;
  let stdoutBuf = "";
  let stopped = false;
  let ready = false;
  let readyResolve = null;

  const translateToEnglish = targetLanguage === "en" && localTranslationEngine !== "none";
  const detectedLang = whisperLanguage === "auto"
    ? (languageHints[0] || "en")
    : whisperLanguage;

  // Sliding context to retain the history of translations gracefully.
  const slidingContext = [];
  const MAX_CONTEXT_LINES = 5;

  const translationSettings = {
    localTranslationEngine, ollamaBaseUrl, ollamaModel,
    libreTranslateUrl, targetLanguage, context, geminiApiKey,
  };

  async function getTranslation(text) {
    if (translateToEnglish) return { translated: text, lang: "en" };
    const dynamicContext = slidingContext.length > 0
      ? (context ? context + "\n\n" : "") + slidingContext.join("\n")
      : context;
    const currentSettings = { ...translationSettings, context: dynamicContext };
    return translateText(text, detectedLang, currentSettings);
  }

  // Translation debouncing: avoid calling Ollama on every partial result.
  // Instead, emit partial immediately with the last known translation,
  // then debounce the actual translation call.
  let partialDebounceTimer = null;
  let lastTranslation = "";
  const PARTIAL_DEBOUNCE_MS = localTranslationEngine === "gemini" ? 800 : 500;

  function sendToPython(obj) {
    if (!pyProcess || stopped) return;
    try {
      pyProcess.stdin.write(JSON.stringify(obj) + "\n");
    } catch (err) {
      log.error("stdin write failed", err);
    }
  }

  async function handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    switch (msg.type) {
      case "ready":
        ready = true;
        readyResolve?.();
        readyResolve = null;
        log.info("Whisper model loaded", { model: whisperModel });
        break;

      case "partial": {
        // Emit immediately with last known translation (responsive UI)
        _onPartial?.({ originalText: msg.text, translatedText: lastTranslation, speaker: null });

        // Debounce the actual translation call to avoid flooding Ollama
        clearTimeout(partialDebounceTimer);
        partialDebounceTimer = setTimeout(async () => {
          const { translated } = await getTranslation(msg.text).catch(() => ({ translated: "" }));
          if (translated) {
            lastTranslation = translated;
            _onPartial?.({ originalText: msg.text, translatedText: translated, speaker: null });
          }
        }, PARTIAL_DEBOUNCE_MS);
        break;
      }

      case "utterance": {
        // For final utterances, always translate the full text (no debounce)
        clearTimeout(partialDebounceTimer);
        const { translated, lang } = await getTranslation(msg.text)
          .catch(() => ({ translated: "", lang: null }));
        lastTranslation = "";  // Reset for next utterance cycle

        if (translated) {
          slidingContext.push(`Previous speech: "${msg.text}"\nTranslated as: "${translated}"`);
          if (slidingContext.length > MAX_CONTEXT_LINES) slidingContext.shift();
        }

        _onUtterance?.({
          originalText: msg.text,
          translatedText: translated,
          originalLanguage: detectedLang,
          translationLanguage: lang || null,
          speaker: null,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case "error":
        _onError?.(new Error(msg.message));
        break;
    }
  }

  return {
    async connect() {
      const pythonBin = getVenvPython();
      const workerScript = resolveWorkerScript();

      const args = [workerScript, "--model", whisperModel];
      if (whisperLanguage !== "auto") args.push("--language", whisperLanguage);
      if (translateToEnglish) args.push("--translate");

      log.info("Spawning whisper-worker", { pythonBin, model: whisperModel, language: whisperLanguage });

      try {
        pyProcess = spawn(pythonBin, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, TOKENIZERS_PARALLELISM: "false" },
        });
      } catch (err) {
        throw new Error(
          `Failed to spawn whisper-worker. Ensure faster-whisper is installed ` +
          `(run the Whisper setup, or: pip install faster-whisper). ` +
          `Detail: ${err.message}`
        );
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
        for (const line of lines) handleLine(line).catch(() => {});
      });

      let connectReject = null;

      pyProcess.on("error", (err) => {
        log.error("whisper-worker process error", err);
        const e = new Error(`whisper-worker process error: ${err.message}`);
        _onError?.(e);
        connectReject?.(e);
        connectReject = null;
      });

      pyProcess.on("exit", (code, signal) => {
        if (!stopped) {
          if (stderrBuf.trim()) log.debug("whisper-worker stderr", { stderr: stderrBuf.trim() });
          log.error("whisper-worker exited unexpectedly", { code, signal });
          const e = new Error(`whisper-worker exited unexpectedly (code=${code} signal=${signal})`);
          _onError?.(e);
          connectReject?.(e);
          connectReject = null;
        }
      });

      // Wait for 'ready' (model loaded) before returning
      await new Promise((resolve, reject) => {
        connectReject = reject;
        const timeout = setTimeout(() => {
          connectReject = null;
          reject(new Error("Timed out waiting for whisper-worker to load model"));
        }, READY_TIMEOUT_MS);
        readyResolve = () => {
          clearTimeout(timeout);
          connectReject = null;
          resolve();
        };
        if (ready) readyResolve();
      });
    },

    async startStreaming() {
      // Worker is already in its stdin loop after load() — nothing to do here.
    },

    sendAudio(chunk) {
      if (!stopped && ready) {
        sendToPython({ type: "audio", data: chunk.toString("base64") });
      }
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      if (!pyProcess) return;

      sendToPython({ type: "shutdown" });

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          try { pyProcess.kill("SIGTERM"); } catch {}
          resolve();
        }, 10_000);
        pyProcess.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    },

    onPartial(cb) { _onPartial = cb; },
    onUtterance(cb) { _onUtterance = cb; },
    onError(cb) { _onError = cb; },
  };
}
