/**
 * Shared utility for resolving the system Python binary on Windows.
 * Probes candidates in order and caches the result for the process lifetime.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";

const isWin = process.platform === "win32";

// Standard Python.org installer adds `python`; Windows Python Launcher adds `py`.
// Try `python` first as it is more common on standard installations.
const WIN_CANDIDATES = ["python", "py"];

function probeCandidate(bin) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${bin} timed out`));
    }, 3000);
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { out += d.toString(); }); // Python 2 wrote to stderr
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      // MS Store alias exits with 9009 (non-zero), so this check rejects it automatically.
      if (code === 0 && /Python \d+\.\d+/.test(out)) resolve(bin);
      else reject(new Error(`${bin} not usable (exit ${code})`));
    });
  });
}

// Cache the Promise itself so concurrent callers share one probe run.
let _probe = null;

/**
 * Returns a Promise<string> for the best available Windows Python fallback binary.
 * Tries "python" then "py"; caches the winner for the process lifetime.
 * On non-Windows, resolves immediately with "python3".
 */
export function resolveFallbackPythonBin() {
  if (!isWin) return Promise.resolve("python3");
  if (_probe !== null) return _probe;

  let chain = Promise.reject(new Error("no candidates"));
  for (const bin of WIN_CANDIDATES) {
    chain = chain.catch(() => probeCandidate(bin));
  }
  _probe = chain.catch(() => WIN_CANDIDATES[0]); // best-effort last resort
  return _probe;
}

const VENV_PYTHON = join(
  os.homedir(), ".node-trans", "venv",
  isWin ? "Scripts\\python.exe" : "bin/python3"
);

/**
 * Returns the path to the shared venv Python binary.
 * Throws if the venv has not been created yet (user must run Setup in Settings).
 */
export function getVenvPython() {
  if (!existsSync(VENV_PYTHON)) {
    throw new Error("Python environment not found. Please run Whisper/Diarization setup in Settings first.");
  }
  return VENV_PYTHON;
}
