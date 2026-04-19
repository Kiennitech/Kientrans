# Development & Build Guide

## Prerequisites

- **Node.js** >= 20 LTS (uses built-in `fetch` and `node --watch`; Node 22 recommended)
- **ffmpeg**: web mode uses `ffmpeg-static` automatically; Electron bundles its own binary
- **Python 3.10–3.12**: required for Local Whisper STT and speaker diarization

---

## Running the Web App

```bash
npm install       # Install dependencies
npm run dev       # Dev mode (Express + Vite with hot-reload)
npm start         # Production mode (build frontend then start server)
```

- Frontend dev: http://localhost:5173
- Backend: http://localhost:3000

---

## Running the Electron App

```bash
npm run electron:dev   # Dev mode (Vite + Electron with hot-reload)
```

---

## Building the Electron App

```bash
npm run electron:build:mac   # Build for macOS
npm run electron:build:win   # Build for Windows
npm run electron:build       # Build for current platform
```

**Build flow (automated):**
1. `npm run build` — build frontend (Vite) into `dist/`
2. `npm run native:electron` — rebuild `better-sqlite3` for the correct Electron ABI
3. `electron-builder` — package the app into `release/`

**Output:**
- `release/Node Trans-x.x.x-arm64-mac.zip` — macOS
- `release/Node Trans Setup x.x.x.exe` — Windows installer
- `release/Node Trans x.x.x.exe` — Windows portable

---

## One-time Setup Scripts

These only need to be run once:

| Command | When needed |
|---------|-------------|
| `npm run setup:ffmpeg` | Before building Electron for the first time (copies ffmpeg into `ffmpeg-bin/`) |
| `npm run setup:diarize` | To enable speaker diarization (installs Python venv + pyannote.audio into `~/.node-trans/venv`) |

> **Note**: Both Whisper and Diarization setup can be triggered from the UI: Settings → Engine.
> - **Setup Whisper**: installs `openai-whisper` into `~/.node-trans/venv` and downloads the selected model
> - **Setup Diarization**: installs `pyannote.audio` into the same shared venv (also runs `setup:whisper` steps)

---

## Internal Scripts

| Command | Purpose |
|---------|---------|
| `npm run native:node` | Rebuild `better-sqlite3` for Node.js (run after building Electron to restore web mode) |
| `npm run native:electron` | Rebuild `better-sqlite3` for Electron (run before packaging) |

---

## Common Issues

### 1. `NODE_MODULE_VERSION` mismatch (better-sqlite3)

**Symptom:**
```
was compiled against NODE_MODULE_VERSION 127.
This version of Node.js requires NODE_MODULE_VERSION 145.
```

**Cause:** `better-sqlite3` is a native module that must be compiled separately for Node.js and Electron — they use different ABI versions.

**Fix:** This is now handled automatically — `npm run native:electron` uses `@electron/rebuild -f` to always compile from source. If it still fails:
```bash
rm -rf node_modules/better-sqlite3/build
npm run electron:build:mac
```

### 2. Web app fails after building Electron

**Cause:** After an Electron build, `better-sqlite3` in `node_modules` is the Electron version and is incompatible with plain Node.js.

**Fix:**
```bash
npm run native:node   # Restore the Node.js-compatible version
```

### 3. Error: "No such file or directory: ffmpeg"

**Cause:** A Python subprocess cannot find ffmpeg in `PATH`.

**Fix:** `electron/main.js` and `src/server.js` automatically add the ffmpeg directory to `PATH`. If the error persists, ensure `npm install` has been run (installs `ffmpeg-static`).

---

## Key Files

```
electron-builder.config.js
  npmRebuild: false        — IMPORTANT: keep false to prevent overwriting the correctly rebuilt binary
  asarUnpack               — Keeps native modules and Python scripts on the real filesystem (outside ASAR)

electron/main.js           — Sets FFMPEG_PATH and adds it to PATH before importing the server
src/server.js              — Sets FFMPEG_PATH from ffmpeg-static (web mode) and adds it to PATH
src/local/whisper-session.js  — Spawns whisper-worker.py; resolves ASAR-unpacked path for Electron
src/local/whisper-setup.js    — Creates ~/.node-trans/venv, installs openai-whisper, downloads model
src/local/whisper-worker.py   — Persistent Python STT worker (openai-whisper, sliding window)
src/local/whisper-download.py — Downloads Whisper model with JSON progress reporting
src/local/diarize-session.js  — Spawns diarize.py; resolves ASAR-unpacked path for Electron
src/local/diarize-setup.js    — Creates shared ~/.node-trans/venv, installs pyannote.audio + deps
```
