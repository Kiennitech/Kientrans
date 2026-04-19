import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const CONFIG_DIR = process.env.ELECTRON_USER_DATA
  ? path.join(process.env.ELECTRON_USER_DATA, "data")
  : path.join(os.homedir(), ".node-trans");
const DB_PATH = path.join(CONFIG_DIR, "history.db");

let db;

export function getDb() {
  if (db) return db;

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      audio_source TEXT NOT NULL,
      target_language TEXT NOT NULL DEFAULT 'vi',
      device_name TEXT,
      context TEXT
    );

    CREATE TABLE IF NOT EXISTS utterances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      speaker TEXT,
      original_text TEXT NOT NULL,
      original_language TEXT,
      translated_text TEXT,
      translation_language TEXT,
      source TEXT DEFAULT 'mic',
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS speaker_aliases (
      session_id INTEGER NOT NULL,
      speaker TEXT NOT NULL,
      alias TEXT NOT NULL,
      PRIMARY KEY (session_id, speaker),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
  `);

  // Migrate: add title column if missing
  const cols = db.prepare("PRAGMA table_info(sessions)").all();
  if (!cols.some((c) => c.name === "title")) {
    db.exec("ALTER TABLE sessions ADD COLUMN title TEXT");
  }
  // Migrate: add context column if missing
  if (!cols.some((c) => c.name === "context")) {
    db.exec("ALTER TABLE sessions ADD COLUMN context TEXT");
  }

  return db;
}

export function createSession(audioSource, targetLanguage, deviceName, context = null) {
  getDb();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const dd = pad(now.getDate());
  const mt = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const autoTitle = `Phiên ${hh}:${mm} - ${dd}/${mt}/${yyyy}`;
  const result = db.prepare(
    "INSERT INTO sessions (title, audio_source, target_language, device_name, context) VALUES (?, ?, ?, ?, ?)"
  ).run(autoTitle, audioSource, targetLanguage, deviceName || null, context || null);
  return result.lastInsertRowid;
}

export function endSession(sessionId) {
  getDb();
  db.prepare("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);
}

export function reopenSession(sessionId) {
  getDb();
  db.prepare("UPDATE sessions SET ended_at = NULL WHERE id = ?").run(sessionId);
}

export function updateSessionContext(sessionId, context) {
  getDb();
  db.prepare("UPDATE sessions SET context = ? WHERE id = ?").run(context || null, sessionId);
}

export function addUtterance(sessionId, data) {
  getDb();
  db.prepare(
    `INSERT INTO utterances (session_id, speaker, original_text, original_language, translated_text, translation_language, source, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    data.speaker || null,
    data.originalText,
    data.originalLanguage || null,
    data.translatedText || null,
    data.translationLanguage || null,
    data.source || "mic",
    data.timestamp || new Date().toISOString()
  );
}

export function updateUtteranceTranslation(idOrTimestamp, translatedText, translationLanguage) {
  getDb();
  // We match against timestamp since the UI uses the JS-generated timestamp as an ID
  db.prepare(
    "UPDATE utterances SET translated_text = ?, translation_language = ? WHERE timestamp = ?"
  ).run(translatedText, translationLanguage, idOrTimestamp);
}

export function updateUtterance(idOrTimestamp, newSpeaker, newOriginalText) {
  getDb();
  db.prepare(
    "UPDATE utterances SET speaker = ?, original_text = ? WHERE timestamp = ?"
  ).run(newSpeaker || null, newOriginalText, idOrTimestamp);
}

export function getSessions(limit = 50, offset = 0) {
  getDb();
  return db.prepare(
    `SELECT s.*,
      COUNT(u.id) AS utterance_count,
      COUNT(DISTINCT u.speaker) AS speaker_count
    FROM sessions s
    LEFT JOIN utterances u ON u.session_id = s.id
    GROUP BY s.id
    ORDER BY s.started_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);
}

export function getSession(sessionId) {
  getDb();
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
}

export function getSpeakerAliases(sessionId) {
  getDb();
  return db.prepare("SELECT speaker, alias FROM speaker_aliases WHERE session_id = ?").all(sessionId);
}

export function setSpeakerAlias(sessionId, speaker, alias) {
  getDb();
  db.prepare(
    "INSERT INTO speaker_aliases (session_id, speaker, alias) VALUES (?, ?, ?) ON CONFLICT(session_id, speaker) DO UPDATE SET alias = ?"
  ).run(sessionId, speaker, alias, alias);
}

export function getUtterances(sessionId) {
  getDb();
  return db.prepare(
    "SELECT * FROM utterances WHERE session_id = ? ORDER BY timestamp ASC"
  ).all(sessionId);
}

export function renameSession(sessionId, title) {
  getDb();
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
}

export function deleteSession(sessionId) {
  getDb();
  const del = db.transaction(() => {
    db.prepare("DELETE FROM speaker_aliases WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM utterances WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });
  del();
}
