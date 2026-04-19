/**
 * Centralized logger — writes structured log lines to:
 *   - Electron: <userData>/data/logs/app.log  (same root as settings & history)
 *   - Web/dev:  ~/.node-trans/logs/app.log
 *
 * Format:  2026-03-29T14:05:23.441Z [INFO ] [server] Message {"key":"value"}
 *
 * Rotation: when app.log exceeds MAX_SIZE (10 MB), it is renamed to app.log.1
 *           and a fresh app.log is opened (keeps at most 2 files).
 *
 * Console mirror: active only when NODE_ENV === "development" (npm run dev:server).
 *   - Packaged Electron has no terminal → console mirror is off.
 *   - npm run start runs without NODE_ENV → off (logs go to file only).
 */

import { mkdirSync, createWriteStream, statSync, renameSync } from "fs";
import { join } from "path";
import os from "os";

// Mirror the same data-directory logic used by storage/settings.js and storage/history.js
const DATA_DIR = process.env.ELECTRON_USER_DATA
  ? join(process.env.ELECTRON_USER_DATA, "data")
  : join(os.homedir(), ".node-trans");

const LOGS_DIR = join(DATA_DIR, "logs");
const LOG_FILE = join(LOGS_DIR, "app.log");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

mkdirSync(LOGS_DIR, { recursive: true });

// Track bytes written so we can rotate without a stat call on every line
let bytesWritten = 0;
try { bytesWritten = statSync(LOG_FILE).size; } catch { /* file may not exist yet */ }

let stream = createWriteStream(LOG_FILE, { flags: "a", encoding: "utf8" });

// Mirror to console only in explicit dev mode — not in packaged Electron or npm start
const IS_DEV = process.env.NODE_ENV === "development";

function rotate() {
  stream.end();
  try {
    // renameSync overwrites the destination on Unix/macOS.
    // On Windows it may fail if the backup is still open — swallow to keep logging running.
    renameSync(LOG_FILE, LOG_FILE + ".1");
  } catch { /* ignore rotation failures */ }
  stream = createWriteStream(LOG_FILE, { flags: "a", encoding: "utf8" });
  bytesWritten = 0;
}

function write(level, tag, message, extra) {
  const ts = new Date().toISOString();
  const levelPad = level.padEnd(5);
  let line = `${ts} [${levelPad}] [${tag}] ${message}`;

  if (extra !== undefined) {
    if (extra instanceof Error) {
      line += `\n${extra.stack || extra.message}`;
    } else {
      try {
        line += ` ${JSON.stringify(extra)}`;
      } catch {
        line += ` [unstringifiable]`;
      }
    }
  }
  line += "\n";

  stream.write(line);
  bytesWritten += Buffer.byteLength(line, "utf8");
  if (bytesWritten >= MAX_SIZE) rotate();

  if (IS_DEV && level !== "DEBUG") {
    const out = level === "ERROR" || level === "WARN" ? process.stderr : process.stdout;
    out.write(line);
  }
}

/**
 * Returns a tagged child logger with info / warn / error / debug methods.
 *
 * @param {string} tag  Short module name shown in every log line, e.g. "server"
 */
export function createLogger(tag) {
  return {
    info:  (msg, extra) => write("INFO",  tag, msg, extra),
    warn:  (msg, extra) => write("WARN",  tag, msg, extra),
    error: (msg, extra) => write("ERROR", tag, msg, extra),
    debug: (msg, extra) => write("DEBUG", tag, msg, extra),
  };
}

export default createLogger("app");
