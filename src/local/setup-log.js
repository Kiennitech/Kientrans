/**
 * Persistent setup logger — writes all setup events to a log file
 * at ~/.node-trans/logs/<name>.log for post-mortem debugging.
 *
 * Each run overwrites the previous log (keeps only the latest attempt).
 */

import { mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import os from "os";

const LOGS_DIR = join(os.homedir(), ".node-trans", "logs");

/**
 * Creates a log-aware wrapper around an onEvent callback.
 *
 * @param {string} name  — log file stem, e.g. "whisper-setup" → whisper-setup.log
 * @param {Function} onEvent — original event callback to pass through
 * @returns {{ onEvent: Function, logPath: string, close: Function }}
 */
export function createSetupLogger(name, onEvent) {
  mkdirSync(LOGS_DIR, { recursive: true });

  const logPath = join(LOGS_DIR, `${name}.log`);
  const stream = createWriteStream(logPath, { flags: "w", encoding: "utf8" });
  const ts = () => new Date().toISOString();

  stream.write(`=== ${name} started at ${ts()} ===\n\n`);

  const wrappedOnEvent = (event) => {
    // Write to log file
    if (event.line !== undefined) {
      stream.write(`${event.line}\n`);
    } else if (event.error) {
      stream.write(`[ERROR] ${event.error}\n`);
    } else if (event.progress !== undefined) {
      // Only log progress at milestones to avoid flooding the log
      if (event.done || event.progress % 10 === 0) {
        stream.write(`[PROGRESS] ${event.progress}%${event.done ? " — done" : ""}\n`);
      }
    }

    // Pass through to original callback
    onEvent(event);
  };

  const close = (error) => {
    if (error) {
      stream.write(`\n[FAILED] ${error}\n`);
    }
    stream.write(`\n=== ${name} finished at ${ts()} ===\n`);
    stream.end();
  };

  return { onEvent: wrappedOnEvent, logPath, close };
}
