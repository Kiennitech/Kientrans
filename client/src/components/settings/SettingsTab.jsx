import { useState, useEffect, useRef } from "react";
import { useSocketActions } from "../../context/SocketContext";
import { fetchSettings, fetchDevices, saveSettings } from "../../utils/api";
import { LANGUAGE_OPTIONS, CONTEXT_PRESETS, WHISPER_MODEL_OPTIONS, OLLAMA_MODEL_OPTIONS } from "../../utils/constants";
import { useI18n } from "../../i18n/I18nContext";
import OverlaySettings from "./OverlaySettings";
import { ConfirmDialog } from "../Modal";

const selectCls = "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-xl w-full text-sm outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 hover:border-indigo-400 dark:hover:border-indigo-400";
const labelCls = "block text-xs text-gray-400 dark:text-gray-600 mb-1.5 font-medium uppercase tracking-wider";
const hintCls = "text-xs text-gray-400 dark:text-gray-600 mt-1";
const dividerCls = "border-gray-200/50 dark:border-indigo-500/10";
const sectionTitleCls = "text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3";

const UI_LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

export default function SettingsModal({ onClose }) {
  const { t, lang, setLang } = useI18n();
  const { dispatch } = useSocketActions();
  const [activeTab, setActiveTab] = useState("audio");

  const [audioSource, setAudioSource] = useState("mic");
  const [micTargetLanguage, setMicTargetLanguage] = useState("vi");
  const [systemTargetLanguage, setSystemTargetLanguage] = useState("vi");
  const [micWhisperLanguage, setMicWhisperLanguage] = useState("auto");
  const [systemWhisperLanguage, setSystemWhisperLanguage] = useState("auto");
  const [micDeviceIndex, setMicDeviceIndex] = useState("");
  const [systemDeviceIndex, setSystemDeviceIndex] = useState("");
  const [devices, setDevices] = useState([]);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true);
  const [sonioxApiKey, setSonioxApiKey] = useState("");
  const [transcriptionEngine, setTranscriptionEngine] = useState("soniox");
  const [whisperModel, setWhisperModel] = useState("base");
  const [localTranslationEngine, setLocalTranslationEngine] = useState("none");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [ollamaModel, setOllamaModel] = useState("llama3.2");
  const [enableDiarization, setEnableDiarization] = useState(false);
  const [hfToken, setHfToken] = useState("");
  const [whisperStatus, setWhisperStatus] = useState(null);
  const [checkingWhisper, setCheckingWhisper] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [libreStatus, setLibreStatus] = useState(null);
  const [checkingLibre, setCheckingLibre] = useState(false);
  const [diarizeStatus, setDiarizeStatus] = useState(null);
  const [checkingDiarize, setCheckingDiarize] = useState(false);
  const [defaultContext, setDefaultContext] = useState("none");
  const [defaultCustomContext, setDefaultCustomContext] = useState("");
  const [setupLog, setSetupLog] = useState([]);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [setupError, setSetupError] = useState(null);
  const [setupLogFile, setSetupLogFile] = useState(null);
  const setupLogRef = useRef(null);

  const [confirmRemoveModel, setConfirmRemoveModel] = useState(false);
  const [whisperSetupLog, setWhisperSetupLog] = useState([]);
  const [whisperSetupRunning, setWhisperSetupRunning] = useState(false);
  const [whisperSetupDone, setWhisperSetupDone] = useState(false);
  const [whisperSetupError, setWhisperSetupError] = useState(null);
  const [whisperSetupLogFile, setWhisperSetupLogFile] = useState(null);
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState(null);
  const whisperSetupLogRef = useRef(null);

  const engineStatusFetched = useRef(false);
  useEffect(() => {
    fetchSettings().then((settings) => {
      setAudioSource(settings.audioSource || "mic");
      const defaultTarget = settings.targetLanguage || "vi";
      setMicTargetLanguage(settings.micTargetLanguage || defaultTarget);
      setSystemTargetLanguage(settings.systemTargetLanguage || defaultTarget);
      setMicWhisperLanguage(settings.micWhisperLanguage || "auto");
      setSystemWhisperLanguage(settings.systemWhisperLanguage || "auto");
      setMicDeviceIndex(settings.micDeviceIndex != null ? String(settings.micDeviceIndex) : "");
      setSystemDeviceIndex(settings.systemDeviceIndex != null ? String(settings.systemDeviceIndex) : "");
      setSonioxApiKey(settings.sonioxApiKey || "");
      setTranscriptionEngine(settings.transcriptionEngine || "soniox");
      setWhisperModel(settings.whisperModel || "base");
      setLocalTranslationEngine(settings.localTranslationEngine || "none");
      setGeminiApiKey(settings.geminiApiKey || "");
      const savedModel = settings.ollamaModel || "llama3.2";
      setOllamaModel(OLLAMA_MODEL_OPTIONS.find((o) => o.value === savedModel) ? savedModel : "llama3.2");
      setEnableDiarization(!!settings.enableDiarization);
      setHfToken(settings.hfToken || "");
      setDefaultContext(settings.defaultContext || "none");
      setDefaultCustomContext(settings.defaultCustomContext || "");
    }).catch(() => {});
    fetchDevices().then((devData) => {
      setDevices(devData.input || []);
      setFfmpegAvailable(devData.ffmpegAvailable !== false);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch engine status lazily when Engine tab is opened with local-whisper
  useEffect(() => {
    if (activeTab === "engine" && transcriptionEngine === "local-whisper" && !engineStatusFetched.current) {
      engineStatusFetched.current = true;
      fetchWhisperStatus();
      fetchOllamaStatus();
      fetchLibreStatus();
      fetchDiarizeStatus();
    }
  }, [activeTab, transcriptionEngine]);

  useEffect(() => {
    if (setupLogRef.current) setupLogRef.current.scrollTop = setupLogRef.current.scrollHeight;
  }, [setupLog]);

  useEffect(() => {
    if (whisperSetupLogRef.current) whisperSetupLogRef.current.scrollTop = whisperSetupLogRef.current.scrollHeight;
  }, [whisperSetupLog]);

  const fetchWhisperStatus = (model = whisperModel) => {
    setCheckingWhisper(true);
    fetch(`/api/local/status/whisper?model=${encodeURIComponent(model)}`)
      .then((r) => r.json())
      .then((data) => { setWhisperStatus(data); setCheckingWhisper(false); })
      .catch(() => setCheckingWhisper(false));
  };

  const fetchOllamaStatus = (model = ollamaModel) => {
    setCheckingOllama(true);
    fetch(`/api/local/status/ollama?model=${encodeURIComponent(model)}`)
      .then((r) => r.json())
      .then((data) => { setOllamaStatus(data); setCheckingOllama(false); })
      .catch(() => setCheckingOllama(false));
  };

  const fetchLibreStatus = () => {
    setCheckingLibre(true);
    fetch("/api/local/status/libretranslate")
      .then((r) => r.json())
      .then((data) => { setLibreStatus(data); setCheckingLibre(false); })
      .catch(() => setCheckingLibre(false));
  };

  const fetchDiarizeStatus = () => {
    setCheckingDiarize(true);
    fetch("/api/local/status/diarize")
      .then((r) => r.json())
      .then((data) => { setDiarizeStatus(data); setCheckingDiarize(false); })
      .catch(() => setCheckingDiarize(false));
  };

  const startWhisperSetup = () => {
    if (whisperSetupRunning) return;
    setWhisperSetupLog([]);
    setWhisperSetupRunning(true);
    setWhisperSetupDone(false);
    setWhisperSetupError(null);
    setWhisperSetupLogFile(null);
    setWhisperDownloadProgress(null);
    const es = new EventSource(`/api/local/whisper-setup?model=${encodeURIComponent(whisperModel)}`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line !== undefined) {
        setWhisperSetupLog((prev) => [...prev, data.line]);
      } else if (data.progress !== undefined) {
        setWhisperDownloadProgress(data);
        if (data.done) {
          setWhisperSetupRunning(false);
          setWhisperSetupDone(true);
          setWhisperDownloadProgress({ progress: 100, done: true });
          es.close();
          fetchWhisperStatus();
        }
      } else if (data.done) {
        setWhisperSetupRunning(false);
        setWhisperSetupDone(true);
        es.close();
        fetchWhisperStatus();
      } else if (data.error) {
        setWhisperSetupRunning(false);
        setWhisperSetupError(data.error);
        if (data.logFile) setWhisperSetupLogFile(data.logFile);
        es.close();
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setWhisperSetupRunning(false);
        if (!whisperSetupDone) setWhisperSetupError("Connection lost");
        es.close();
      }
    };
  };

  const startSetup = () => {
    if (setupRunning) return;
    setSetupLog([]);
    setSetupRunning(true);
    setSetupDone(false);
    setSetupError(null);
    setSetupLogFile(null);
    const es = new EventSource("/api/local/diarize-setup");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.line !== undefined) {
        setSetupLog((prev) => [...prev, data.line]);
      } else if (data.done) {
        setSetupRunning(false);
        setSetupDone(true);
        es.close();
        fetchDiarizeStatus();
      } else if (data.error) {
        setSetupRunning(false);
        setSetupError(data.error);
        if (data.logFile) setSetupLogFile(data.logFile);
        es.close();
      }
    };
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setSetupRunning(false);
        if (!setupDone) setSetupError("Connection lost");
        es.close();
      }
    };
  };

  const handleSave = async () => {
    try {
      await saveSettings({
        audioSource,
        targetLanguage: micTargetLanguage,
        micTargetLanguage,
        systemTargetLanguage,
        micWhisperLanguage,
        systemWhisperLanguage,
        micDeviceIndex: micDeviceIndex ? parseInt(micDeviceIndex) : null,
        systemDeviceIndex: systemDeviceIndex ? parseInt(systemDeviceIndex) : null,
        sonioxApiKey: sonioxApiKey || null,
        transcriptionEngine,
        whisperModel,
        localTranslationEngine,
        geminiApiKey: geminiApiKey || null,
        ollamaModel,
        enableDiarization,
        hfToken: hfToken || null,
        defaultContext,
        defaultCustomContext: defaultCustomContext || "",
      });
      dispatch({ type: "TOAST", payload: { message: t("saved"), type: "success" } });
      onClose(); // Close modal on success
    } catch {
      dispatch({ type: "TOAST", payload: { message: t("saveFailed"), type: "error" } });
    }
  };

  const showMic = audioSource !== "system";
  const showSystem = audioSource !== "mic";
  const isLocalWhisper = transcriptionEngine === "local-whisper";

  const TABS = [
    { key: "audio",   label: t("settingsTabAudio") },
    { key: "engine",  label: t("settingsTabEngine") },
    { key: "context", label: t("settingsTabContext") },
    { key: "overlay", label: t("settingsTabOverlay") },
  ];

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div
        className="flex flex-col w-full max-w-[580px] max-h-[88vh] rounded-2xl bg-[#f0f2f8] dark:bg-[#0c0d15] border border-gray-200/80 dark:border-indigo-500/15 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-0">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("tabSettings")}</h2>
          <div className="flex items-center gap-2">
            <select
              className="bg-transparent text-xs text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-indigo-500/10 px-2 py-1 rounded-lg outline-none cursor-pointer hover:border-gray-300 dark:hover:border-indigo-500/20"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {UI_LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200/60 dark:hover:bg-white/10 text-base leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="shrink-0 flex gap-1 px-5 py-3 border-b border-gray-200/60 dark:border-indigo-500/10">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── AUDIO TAB ── */}
          {activeTab === "audio" && (
            <>
              {!ffmpegAvailable && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                  <strong>{t("ffmpegNotFound")}</strong> {t("ffmpegInstall")}
                  <br /><span className="text-xs opacity-75">{t("ffmpegWindows")}</span>
                </div>
              )}
              {ffmpegAvailable && devices.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-yellow-400">
                  {t("noDevices")}
                </div>
              )}


              <div>
                <label className={labelCls}>{t("audioSource")}</label>
                <select className={`${selectCls} max-w-xs`} value={audioSource} onChange={(e) => setAudioSource(e.target.value)}>
                  <option value="mic">{t("srcMic")}</option>
                  <option value="system">{t("srcSystem")}</option>
                  <option value="both">{t("srcBoth")}</option>
                </select>
              </div>

              {showMic && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>{t("micDevice")}</label>
                    <select className={selectCls} value={micDeviceIndex} onChange={(e) => setMicDeviceIndex(e.target.value)}>
                      <option value="">{t("none")}</option>
                      {devices.map((d) => (
                        <option key={d.index} value={String(d.index)}>[{d.index}] {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("sourceLang")}</label>
                    <select className={selectCls} value={micWhisperLanguage} onChange={(e) => setMicWhisperLanguage(e.target.value)}>
                      <option value="auto">{t("autoDetect")}</option>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("targetLanguage")}</label>
                    <select className={selectCls} value={micTargetLanguage} onChange={(e) => setMicTargetLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {showSystem && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>{t("systemDevice")}</label>
                    <select className={selectCls} value={systemDeviceIndex} onChange={(e) => setSystemDeviceIndex(e.target.value)}>
                      <option value="">{t("autoDetect")}</option>
                      {devices.map((d) => (
                        <option key={d.index} value={String(d.index)}>[{d.index}] {d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("sourceLang")}</label>
                    <select className={selectCls} value={systemWhisperLanguage} onChange={(e) => setSystemWhisperLanguage(e.target.value)}>
                      <option value="auto">{t("autoDetect")}</option>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t("targetLanguage")}</label>
                    <select className={selectCls} value={systemTargetLanguage} onChange={(e) => setSystemTargetLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── ENGINE TAB ── */}
          {activeTab === "engine" && (
            <>
              {/* Engine selector */}
              <div>
                <label className={labelCls}>{t("sectionEngine")}</label>
                <div className="flex gap-2">
                  {[
                    { value: "soniox", label: t("engineSoniox") },
                    { value: "local-whisper", label: t("engineLocalWhisper") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTranscriptionEngine(opt.value);
                        if (opt.value === "local-whisper" && !engineStatusFetched.current) {
                          engineStatusFetched.current = true;
                          fetchWhisperStatus();
                          fetchOllamaStatus();
                          fetchLibreStatus();
                          fetchDiarizeStatus();
                        }
                      }}
                      className={`cursor-pointer px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                        transcriptionEngine === opt.value
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                          : "bg-white/60 dark:bg-white/5 border-gray-200/50 dark:border-indigo-500/10 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Soniox */}
              {!isLocalWhisper && (
                <div>
                  <label className={labelCls}>{t("sonioxApiKey")}</label>
                  <input
                    type="password"
                    className={selectCls}
                    value={sonioxApiKey}
                    onChange={(e) => setSonioxApiKey(e.target.value)}
                    placeholder={t("enterApiKey")}
                  />
                  <p className={hintCls}>
                    {t("getApiKey")}{" "}
                    <a href="https://soniox.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">soniox.com</a>
                  </p>
                </div>
              )}

              {/* Local Whisper */}
              {isLocalWhisper && (
                <>
                  <div>
                    <label className={labelCls}>{t("whisperModel")}</label>
                    <select className={`${selectCls} max-w-xs`} value={whisperModel} onChange={(e) => { setWhisperModel(e.target.value); fetchWhisperStatus(e.target.value); setWhisperSetupDone(false); setWhisperDownloadProgress(null); }}>
                      {WHISPER_MODEL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className={hintCls}>{WHISPER_MODEL_OPTIONS.find((o) => o.value === whisperModel)?.[lang] ?? ""}</p>

                    {/* Status + setup inline */}
                    <div className="mt-2 space-y-2">
                      {checkingWhisper ? (
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                      ) : whisperStatus && (
                        <div className="space-y-0.5">
                          {whisperStatus.pythonAvailable === false && !whisperStatus.whisperPyReady && (
                            <div className="flex items-center gap-2 text-xs text-red-400">
                              <span>✗ {t("pythonNotFound")}</span>
                              <a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-500 hover:underline transition-colors">
                                {t("pythonDownloadHint")}
                              </a>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-medium ${whisperStatus.whisperPyReady ? "text-green-500" : "text-amber-500"}`}>
                              {whisperStatus.whisperPyReady ? "✓ " : "○ "}{t(whisperStatus.whisperPyReady ? "whisperPyReady" : "whisperPyMissing")}
                            </p>
                            {!whisperStatus.whisperPyReady && !whisperSetupRunning && whisperStatus.pythonAvailable !== false && (
                              <button onClick={startWhisperSetup} className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-500 hover:underline transition-colors">
                                {t("whisperSetup")}
                              </button>
                            )}
                          </div>
                          {whisperStatus.whisperPyReady && (
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-medium ${whisperStatus.whisperModelDownloaded ? "text-green-500" : "text-amber-500"}`}>
                                {whisperStatus.whisperModelDownloaded ? "✓ " : "○ "}{t(whisperStatus.whisperModelDownloaded ? "whisperModelDownloaded" : "whisperModelNotDownloaded")}
                              </p>
                              {whisperStatus.whisperModelDownloaded && (
                                <button onClick={() => setConfirmRemoveModel(true)} className="cursor-pointer text-xs text-red-400 hover:text-red-500 hover:underline transition-colors">
                                  {t("whisperRemoveModel")}
                                </button>
                              )}
                              {!whisperStatus.whisperModelDownloaded && !whisperSetupRunning && (
                                <button onClick={startWhisperSetup} className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-500 hover:underline transition-colors">
                                  {t("whisperSetup")}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {whisperSetupRunning && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                            {whisperDownloadProgress ? (
                              <>
                                <span>{t("whisperDownloadingModel")}…</span>
                                <span>
                                  {whisperDownloadProgress.downloaded != null
                                    ? `${whisperDownloadProgress.downloaded} / ${whisperDownloadProgress.total} MB`
                                    : `${whisperDownloadProgress.progress}%`}
                                </span>
                              </>
                            ) : (
                              <span className="animate-pulse">Installing…</span>
                            )}
                          </div>
                          <div className="w-full bg-gray-200/60 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                            {whisperDownloadProgress ? (
                              <div
                                className="h-2 rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                                style={{ width: `${whisperDownloadProgress.progress}%` }}
                              />
                            ) : (
                              <div className="h-2 w-full rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 animate-pulse" />
                            )}
                          </div>
                        </div>
                      )}

                      {whisperSetupError && (
                        <div className="text-xs text-red-400 space-y-0.5">
                          <p>{t("whisperSetupError")}: {whisperSetupError}</p>
                          {whisperSetupLogFile && (
                            <p className="text-gray-400 dark:text-gray-500">Log: {whisperSetupLogFile}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <hr className={dividerCls} />
                </>
              )}

              {/* Translation */}
              <div>
                    <p className={sectionTitleCls}>{t("sectionTranslation")}</p>
                    <div className="space-y-3">

                      {/* Toggle */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={localTranslationEngine !== "none"}
                          onClick={() => setLocalTranslationEngine(localTranslationEngine === "none" ? "ollama" : "none")}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            localTranslationEngine !== "none"
                              ? "bg-indigo-500"
                              : "bg-gray-300 dark:bg-white/10"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              localTranslationEngine !== "none" ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                          {t("enableTranslation")}
                        </span>
                      </div>

                      {localTranslationEngine !== "none" && (
                        <>
                          <div>
                            <label className={labelCls}>{t("localTranslationEngine")}</label>
                            <select
                              className={`${selectCls} max-w-xs`}
                              value={localTranslationEngine}
                              onChange={(e) => {
                                setLocalTranslationEngine(e.target.value);
                                if (e.target.value === "ollama") fetchOllamaStatus();
                                else if (e.target.value === "libretranslate") fetchLibreStatus();
                              }}
                            >
                              <option value="gemini">Gemini API</option>
                              <option value="soniox">Soniox (Built-in)</option>
                              <option value="ollama">Ollama</option>
                              <option value="libretranslate">LibreTranslate</option>
                            </select>
                            {checkingOllama || checkingLibre ? (
                              <p className="text-xs font-medium mt-1 text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                            ) : (<>
                              {ollamaStatus && localTranslationEngine === "ollama" && (
                                <p className={`text-xs font-medium mt-1 ${ollamaStatus.ollamaAvailable ? "text-green-500" : "text-amber-500"}`}>
                                  {ollamaStatus.ollamaAvailable ? "✓ " : "○ "}{ollamaStatus.ollamaAvailable ? t("ollamaRunning") : t(ollamaStatus.platform === "win32" ? "ollamaNotRunningWin" : "ollamaNotRunning")}
                                </p>
                              )}
                              {libreStatus && localTranslationEngine === "libretranslate" && (
                                <p className={`text-xs font-medium mt-1 ${libreStatus.libreTranslateAvailable ? "text-green-500" : "text-amber-500"}`}>
                                  {libreStatus.libreTranslateAvailable ? "✓ " : "○ "}{libreStatus.libreTranslateAvailable ? t("libreTranslateOnline") : t("libreTranslateOffline")}
                                </p>
                              )}
                            </>)}
                          </div>
                          {localTranslationEngine === "ollama" && (
                            <div>
                              <label className={labelCls}>{t("ollamaModel")}</label>
                              <select className={`${selectCls} max-w-xs`} value={ollamaModel} onChange={(e) => { setOllamaModel(e.target.value); fetchOllamaStatus(e.target.value); }}>
                                {OLLAMA_MODEL_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <p className={hintCls}>{OLLAMA_MODEL_OPTIONS.find((o) => o.value === ollamaModel)?.[lang] ?? ""}</p>
                              {checkingOllama ? (
                                <p className="text-xs font-medium mt-1 text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                              ) : ollamaStatus && ollamaStatus.ollamaAvailable && (
                                <p className={`text-xs font-medium mt-1 ${ollamaStatus.ollamaModelReady ? "text-green-500" : "text-amber-500"}`}>
                                  {ollamaStatus.ollamaModelReady ? "✓ " : "○ "}{ollamaStatus.ollamaModelReady ? t("ollamaModelReady") : t("ollamaModelMissing", { model: ollamaModel })}
                                </p>
                              )}
                            </div>
                          )}
                          {localTranslationEngine === "gemini" && (
                            <div>
                              <label className={labelCls}>Gemini 1.5/2.0 API Key</label>
                              <input
                                type="password"
                                className={selectCls}
                                value={geminiApiKey}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                placeholder="Enter Google Gemini API Key"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <hr className={dividerCls} />

                  {/* Diarization */}
                  <div>
                    <p className={sectionTitleCls}>{t("sectionDiarization")}</p>
                    <div className="space-y-3">
                      <p className={hintCls}>{t("diarizationHint")}</p>

                      {/* Toggle */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enableDiarization}
                          onClick={() => setEnableDiarization(!enableDiarization)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                            enableDiarization
                              ? "bg-indigo-500"
                              : "bg-gray-300 dark:bg-white/10"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              enableDiarization ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                          {t("enableDiarization")}
                        </span>
                      </div>

                      {enableDiarization && (
                        <div>
                          <label className={labelCls}>{t("hfToken")}</label>
                          <input
                            type="password"
                            className={selectCls}
                            value={hfToken}
                            onChange={(e) => setHfToken(e.target.value)}
                            placeholder={t("hfTokenPlaceholder")}
                          />
                          <p className={hintCls}>
                            {t("hfTokenHint")}{" "}
                            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                              huggingface.co/settings/tokens
                            </a>
                            {". "}
                            {t("hfTokenModelAccess")}{" "}
                            <a href="https://huggingface.co/pyannote/speaker-diarization-3.1" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                              pyannote/speaker-diarization-3.1
                            </a>
                          </p>
                          {checkingDiarize ? (
                            <p className="text-xs mt-1.5 font-medium text-gray-400 dark:text-gray-500 animate-pulse">⟳ Checking...</p>
                          ) : diarizeStatus && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <p className={`text-xs font-medium ${diarizeStatus.diarizePyReady ? "text-green-500" : "text-amber-500"}`}>
                                {diarizeStatus.diarizePyReady ? "✓ " : "○ "}{diarizeStatus.diarizePyReady ? t("diarizePyReady") : t("diarizePyMissing")}
                              </p>
                              {!diarizeStatus.diarizePyReady && !setupRunning && (
                                <button onClick={startSetup} className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-500 hover:underline transition-colors">
                                  {t("diarizeSetup")}
                                </button>
                              )}
                            </div>
                          )}

                          {setupRunning && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Installing…</p>
                              <div className="w-full bg-gray-200/60 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                                <div className="h-2 w-full rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 animate-pulse" />
                              </div>
                            </div>
                          )}

                          {setupError && (
                            <div className="text-xs mt-1.5 text-red-400 space-y-0.5">
                              <p>{t("diarizeSetupError")}: {setupError}</p>
                              {setupLogFile && (
                                <p className="text-gray-400 dark:text-gray-500">Log: {setupLogFile}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
            </>
          )}

          {/* ── CONTEXT TAB ── */}
          {activeTab === "context" && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t("defaultContext")}</label>
                <select
                  className={selectCls}
                  value={defaultContext}
                  onChange={(e) => setDefaultContext(e.target.value)}
                >
                  {CONTEXT_PRESETS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
                <p className={hintCls}>{t("defaultContextHint")}</p>
              </div>
              {defaultContext === "custom" && (
                <div>
                  <label className={labelCls}>{t("contextCustomLabel")}</label>
                  <textarea
                    className={`${selectCls} resize-none`}
                    rows={4}
                    placeholder={t("contextPlaceholder")}
                    value={defaultCustomContext}
                    onChange={(e) => setDefaultCustomContext(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── OVERLAY TAB ── */}
          {activeTab === "overlay" && <OverlaySettings />}

        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 flex justify-end gap-2 px-5 py-3 border-t border-gray-200/60 dark:border-indigo-500/10">
          <button
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-xl text-sm font-medium border border-gray-200/50 dark:border-indigo-500/10 text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-white/5 transition-all duration-200"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleSave}
            className="bg-linear-to-r from-indigo-600 to-cyan-500 text-white border-none px-6 py-2 rounded-xl cursor-pointer text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-95"
          >
            {t("saveSettings")}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      open={confirmRemoveModel}
      title={t("whisperRemoveModel")}
      message={t("whisperRemoveModelConfirm")}
      confirmColor="red"
      onConfirm={() => {
        setConfirmRemoveModel(false);
        fetch(`/api/local/whisper-model?model=${encodeURIComponent(whisperModel)}`, { method: "DELETE" })
          .then((r) => r.json())
          .then(() => fetchWhisperStatus());
      }}
      onCancel={() => setConfirmRemoveModel(false)}
    />
    </>
  );
}
