/**
 * Install Python dependencies for speaker diarization into a venv.
 * Usage: npm run diarize:setup
 *
 * Creates venv at ~/.node-trans/diarize-venv
 * Installs: torch, torchaudio, openai-whisper, pyannote.audio==3.1.1
 *
 * NOTE: pyannote.audio 3.1.1 requires Python 3.10-3.12.
 * If your default python3 is 3.13+, set DIARIZE_PYTHON to python3.11 or python3.12:
 *   DIARIZE_PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11 npm run diarize:setup
 */

import { execSync } from "child_process";
import { mkdirSync } from "fs";
import { join } from "path";
import os from "os";

const isWin = process.platform === "win32";

// Prefer Python 3.11/3.12 for ML compatibility; fall back to DIARIZE_PYTHON or python3
function findPython() {
  if (process.env.DIARIZE_PYTHON) return process.env.DIARIZE_PYTHON;
  // Try well-known compatible versions first (Homebrew paths on macOS)
  const candidates = isWin
    ? ["python", "py", "python3.12", "python3.11", "python3"]
    : [
        "/opt/homebrew/opt/python@3.12/bin/python3.12",
        "/opt/homebrew/opt/python@3.11/bin/python3.11",
        "python3.12",
        "python3.11",
        "python3",
      ];
  for (const bin of candidates) {
    try {
      const out = execSync(`"${bin}" --version 2>&1`).toString().trim();
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m) {
        const [, maj, min] = m.map(Number);
        if (maj === 3 && min >= 10 && min <= 12) {
          console.log(`Using ${bin} (${out})`);
          return bin;
        }
      }
    } catch {}
  }
  return isWin ? "python" : "python3"; // last resort
}

const pythonBin = findPython();

// Venv location
const VENV_DIR = join(os.homedir(), ".node-trans", "diarize-venv");
const venvPython = isWin
  ? join(VENV_DIR, "Scripts", "python.exe")
  : join(VENV_DIR, "bin", "python3");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Check Python version
let versionStr;
try {
  versionStr = execSync(`"${pythonBin}" --version 2>&1`).toString().trim();
} catch {
  console.error(`ERROR: '${pythonBin}' not found.`);
  console.error(isWin
    ? "Install Python 3.11 from: https://www.python.org/downloads/"
    : "Install Python 3.11 via: brew install python@3.11");
  process.exit(1);
}

console.log(`Python: ${versionStr}`);
const match = versionStr.match(/Python (\d+)\.(\d+)/);
if (!match) { console.error("Could not parse Python version"); process.exit(1); }
const [, major, minor] = match.map(Number);
if (major < 3 || (major === 3 && minor < 10)) {
  console.error(`Python 3.10+ required. Found: ${versionStr}`);
  process.exit(1);
}
if (major === 3 && minor > 12) {
  console.warn(`Warning: Python ${major}.${minor} detected. pyannote.audio 3.1.1 is tested`);
  console.warn(`on Python 3.10-3.12. Install Python 3.11 for best compatibility:`);
  if (isWin) {
    console.warn(`  Download from https://www.python.org/downloads/`);
  } else {
    console.warn(`  brew install python@3.11`);
    console.warn(`  DIARIZE_PYTHON=/opt/homebrew/opt/python@3.11/bin/python3.11 npm run diarize:setup`);
  }
}

// Create venv
console.log(`\nCreating virtual environment at: ${VENV_DIR}`);
mkdirSync(join(os.homedir(), ".node-trans"), { recursive: true });
run(`"${pythonBin}" -m venv "${VENV_DIR}"`);

// Install packages into venv
run(`"${venvPython}" -m pip install --upgrade pip`);
run(`"${venvPython}" -m pip install torch torchaudio`);
run(`"${venvPython}" -m pip install openai-whisper`);
run(`"${venvPython}" -m pip install matplotlib`);
// Pin to 3.1.1 — newer versions pull in speaker-diarization-community-1 (restricted)
run(`"${venvPython}" -m pip install "pyannote.audio==3.1.1"`);

console.log("\nVerifying...");
try {
  // Use short-circuit expressions (no 'if' statements after semicolons in -c)
  const verifyScript = [
    "import torchaudio",
    "hasattr(torchaudio,'set_audio_backend') or setattr(torchaudio,'set_audio_backend',lambda *a,**kw:None)",
    "import numpy as np",
    "hasattr(np,'NaN') or setattr(np,'NaN',np.nan)",
    "import torch, whisper, pyannote.audio",
    "print('OK')",
  ].join("; ");
  execSync(`"${venvPython}" -c "${verifyScript}"`, { stdio: "inherit" });
  console.log("\nAll dependencies installed successfully.");
  console.log(`\nVenv location: ${VENV_DIR}`);
  console.log("\nNext steps:");
  console.log("1. Create a Hugging Face READ token at https://huggingface.co/settings/tokens");
  console.log("2. Accept the model license at https://huggingface.co/pyannote/speaker-diarization-3.1");
  console.log("3. Also accept https://huggingface.co/pyannote/segmentation-3.0");
  console.log("4. In Settings → Local Whisper → enable Speaker Diarization → paste token → Save");
} catch {
  console.error("\nVerification failed. Check errors above.");
  process.exit(1);
}
