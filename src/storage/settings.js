import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = process.env.ELECTRON_USER_DATA
  ? path.join(process.env.ELECTRON_USER_DATA, "data")
  : path.join(os.homedir(), ".node-trans");
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");

const DEFAULTS = {
  audioSource: "mic",
  micDeviceIndex: null,
  systemDeviceIndex: null,
  targetLanguage: "vi",
  micTargetLanguage: null,
  systemTargetLanguage: null,
  micWhisperLanguage: "auto",
  systemWhisperLanguage: "auto",
  languageHints: ["ja"],
  port: 3000,
  sonioxApiKey: null,
  enableDiarization: false,
  hfToken: null,
  transcriptionEngine: "soniox",
  whisperModel: "base",
  whisperLanguage: "auto",
  localTranslationEngine: "none",
  geminiApiKey: null,
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  defaultContext: "it",
  defaultCustomContext: "",
  overlay: {
    opacity: 0.8,
    scale: 1,
    textAlign: "left",
    bgColor: "dark",
    maxLines: 5,
    fontFamily: "system-ui, sans-serif",
    finalContent: "both",
    partialContent: "both",
    translatedFontSize: 1,
    translatedColor: "",
    originalFontSize: 0.8,
    originalColor: "",
  },
};

export function loadSettings() {
  let settings = { ...DEFAULTS };
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      settings = { ...DEFAULTS, ...data, overlay: { ...DEFAULTS.overlay, ...(data.overlay || {}) } };
      
      // Force override cache if it was "none"
      if (settings.defaultContext === "none") {
        settings.defaultContext = "it";
      }
    }
  } catch {
    // Corrupt file — fall back to defaults
  }
  return settings;
}

export function saveSettings(settings) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const existing = loadSettings();
  const merged = { ...existing, ...settings };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
