import { useState, useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext";

const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-[fadeIn_150ms_ease-out]";
const panel = "bg-white/95 dark:bg-[#0d0f1a]/95 backdrop-blur-xl border border-gray-200/50 dark:border-indigo-500/15 rounded-2xl shadow-2xl shadow-indigo-500/10 w-full max-w-md mx-4 p-6 animate-[scaleIn_150ms_ease-out]";

export default function StartupCheck() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [missing, setMissing] = useState([]); // ["whisper", "diarize", "ollama"]
  const [installing, setInstalling] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(null); // { progress, downloaded, total }
  const [step, setStep] = useState(""); // current install step label
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const logRef = useRef(null);
  const checked = useRef(false);

  // Settings cache for checks
  const settingsRef = useRef(null);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then(async (settings) => {
        if (settings.transcriptionEngine !== "local-whisper") return;
        settingsRef.current = settings;

        const model = settings.whisperModel || "base";
        const checks = await Promise.all([
          fetch(`/api/local/status/whisper?model=${encodeURIComponent(model)}`).then((r) => r.json()).catch(() => null),
          settings.enableDiarization && settings.hfToken
            ? fetch("/api/local/status/diarize").then((r) => r.json()).catch(() => null)
            : null,
          settings.localTranslationEngine === "ollama"
            ? fetch(`/api/local/status/ollama?model=${encodeURIComponent(settings.ollamaModel || "")}`).then((r) => r.json()).catch(() => null)
            : null,
        ]);

        const [whisper, diarize, ollama] = checks;
        const needs = [];

        if (!whisper?.whisperPyReady) needs.push("whisper");
        else if (!whisper?.whisperModelDownloaded) needs.push("whisper-model");
        if (diarize && !diarize.diarizePyReady) needs.push("diarize");
        if (ollama && !ollama.ollamaAvailable) needs.push("ollama");

        if (needs.length > 0) {
          setMissing(needs);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const startInstall = async () => {
    setInstalling(true);
    setError(null);
    setLog([]);

    const settings = settingsRef.current;
    const model = settings?.whisperModel || "base";
    const steps = [...missing]; // copy

    for (const s of steps) {
      if (s === "ollama") continue; // can't auto-install ollama

      const label = s === "whisper" || s === "whisper-model"
        ? t("startupStepWhisper") : t("startupStepDiarize");
      setStep(label);
      setProgress(null);

      const url = s === "whisper" || s === "whisper-model"
        ? `/api/local/whisper-setup?model=${encodeURIComponent(model)}`
        : "/api/local/diarize-setup";

      const ok = await new Promise((resolve) => {
        const es = new EventSource(url);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.line !== undefined) {
            setLog((prev) => [...prev, data.line]);
          } else if (data.progress !== undefined) {
            setProgress(data);
            if (data.done) { es.close(); resolve(true); }
          } else if (data.done) {
            es.close();
            resolve(true);
          } else if (data.error) {
            setError(data.error);
            es.close();
            resolve(false);
          }
        };
        es.onerror = () => {
          es.close();
          setError("Connection lost");
          resolve(false);
        };
      });

      if (!ok) { setInstalling(false); return; }
    }

    setStep("");
    setDone(true);
    setInstalling(false);
  };

  if (!visible) return null;

  const hasOllamaOnly = missing.length === 1 && missing[0] === "ollama";
  const installable = missing.filter((m) => m !== "ollama");

  return (
    <div className={overlay}>
      <div className={panel}>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t("startupTitle")}
        </h3>

        {!installing && !done && !error && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {t("startupDesc")}
            </p>
            <ul className="text-sm space-y-1.5 mb-4">
              {(missing.includes("whisper") || missing.includes("whisper-model")) && (
                <li className="flex items-center gap-2 text-amber-500">
                  <span className="text-xs">○</span> {t(missing.includes("whisper") ? "startupMissingWhisper" : "startupMissingWhisperModel")}
                </li>
              )}
              {missing.includes("diarize") && (
                <li className="flex items-center gap-2 text-amber-500">
                  <span className="text-xs">○</span> {t("startupMissingDiarize")}
                </li>
              )}
              {missing.includes("ollama") && (
                <li className="flex items-center gap-2 text-amber-500">
                  <span className="text-xs">○</span> {t("startupMissingOllama")}
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVisible(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-95 bg-gray-100/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-indigo-500/10 hover:bg-gray-200/80 dark:hover:bg-white/10"
              >
                {t("startupSkip")}
              </button>
              {installable.length > 0 && (
                <button
                  onClick={startInstall}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all duration-200 active:scale-95 bg-linear-to-r from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20"
                >
                  {t("startupInstall")}
                </button>
              )}
            </div>
          </>
        )}

        {installing && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
              {step || t("startupInstalling")}
            </p>
            {progress && progress.total > 0 && (
              <div>
                <div className="w-full bg-gray-200/60 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {progress.downloaded} / {progress.total} MB
                </p>
              </div>
            )}
            {!progress && (
              <div className="w-full bg-gray-200/60 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="h-2 w-full rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 animate-pulse" />
              </div>
            )}
            <div
              ref={logRef}
              className="max-h-32 overflow-y-auto text-[0.7rem] font-mono text-gray-400 dark:text-gray-600 bg-gray-50/80 dark:bg-white/3 rounded-lg p-2 space-y-px"
            >
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}

        {done && (
          <>
            <p className="text-sm text-green-500 font-medium mb-4">
              {t("startupDone")}
            </p>
            {hasOllamaOnly && (
              <p className="text-sm text-amber-500 mb-4">{t("startupMissingOllama")}</p>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setVisible(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all duration-200 active:scale-95 bg-linear-to-r from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20"
              >
                {t("startupClose")}
              </button>
            </div>
          </>
        )}

        {error && !installing && (
          <>
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVisible(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 active:scale-95 bg-gray-100/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-indigo-500/10"
              >
                {t("startupSkip")}
              </button>
              <button
                onClick={() => { setError(null); startInstall(); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all duration-200 active:scale-95 bg-linear-to-r from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20"
              >
                {t("startupRetry")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
