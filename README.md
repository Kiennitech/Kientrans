# Node Trans

Real-time audio transcription and translation app. Captures audio from microphone, system audio, or both. Supports two transcription modes: **Soniox** (cloud, built-in translation) and **Local Whisper** (fully offline).

Runs as a **web app** (browser) or **desktop app** (Electron). Supports **macOS** and **Windows**.

---

## Features

- Real-time speech-to-text with live partial results
- Automatic translation (cloud via Soniox, or local via Ollama / LibreTranslate)
- Speaker diarization — identifies who is speaking (`Speaker 1`, `Speaker 2`, ...)
- Session history with speaker renaming and Markdown export
- Always-on-top overlay window (Electron)
- Bilingual UI (English / Vietnamese)

---

## Quick Start

```bash
npm install
npm run start      # web app — open http://localhost:3000
```

For Electron:

```bash
npm run electron:dev
```

See [DEV-BUILD.md](DEV-BUILD.md) for build instructions and troubleshooting.

---

## Hardware Requirements

> Only relevant for **Local Whisper** mode. Soniox only needs an internet connection.

### macOS

| Config      | RAM                 | Usable features                                                |
| ----------- | ------------------- | -------------------------------------------------------------- |
| Minimum     | 8 GB                | Whisper tiny/base + Ollama gemma3:1b, no diarization           |
| Recommended | Apple Silicon 16 GB | Whisper medium/large-v3-turbo + Ollama gemma3:4b + diarization |
| Optimal     | Apple Silicon 32 GB | All features with large models, very smooth                    |

**Apple Silicon recommended** (M1+): unified memory allows CPU and GPU to share RAM — Whisper (Metal), Ollama (Metal), and diarization (MPS) are all hardware-accelerated, 4–6× faster than Intel at the same model size.

### Windows

| Config      | RAM   | GPU                               | Usable features                                         |
| ----------- | ----- | --------------------------------- | ------------------------------------------------------- |
| Minimum     | 16 GB | None                              | Whisper tiny/base + small Ollama (slow), no diarization |
| Recommended | 16 GB | NVIDIA 8 GB VRAM (RTX 3060+)      | Whisper medium + Ollama gemma3:4b + diarization         |
| Optimal     | 32 GB | NVIDIA 12 GB+ VRAM (RTX 4070 Ti+) | All features comfortably                                |

AMD GPUs are not supported. Without an NVIDIA GPU, diarization cannot run in real-time. Install [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) for GPU acceleration.

### Disk space (Local Whisper)

| Component                           | Size          |
| ----------------------------------- | ------------- |
| Whisper base model                  | ~150 MB       |
| Whisper large-v3-turbo model        | ~1.6 GB       |
| Ollama + gemma3:4b model            | ~3.5 GB       |
| Python venv for diarization (torch) | ~4–6 GB       |
| pyannote diarization model          | ~1 GB         |
| **Total (full setup)**              | **~10–12 GB** |

---

## Soniox (Cloud)

Requires a free API key from [soniox.com](https://soniox.com).

Configure in **Settings → Engine → Soniox API Key**, or via `.env`:

```
SONIOX_API_KEY=your_api_key_here
```

Soniox handles transcription, translation, and speaker diarization out of the box — no additional setup needed.

---

## Local Whisper (Offline)

No API key required. All processing happens on-device.

**1. Build whisper.cpp** (one-time):

```bash
npm run setup:whisper
```

**2. Download a model:**

```bash
cd node_modules/nodejs-whisper/cpp/whisper.cpp
bash models/download-ggml-model.sh base   # or: tiny, small, medium, large-v3-turbo
```

**3. Select in app:** Settings → Engine → Local Whisper → choose your model.

**4. Translation** (optional): configure Ollama or LibreTranslate in Settings → Engine.

### Whisper Models

| Model            | Size    | RAM   | Speed     | Quality   |
| ---------------- | ------- | ----- | --------- | --------- |
| `tiny`           | ~75 MB  | ~1 GB | Very fast | Low       |
| `base`           | ~150 MB | ~1 GB | Fast      | Medium    |
| `small`          | ~500 MB | ~2 GB | Medium    | Good      |
| `medium`         | ~1.5 GB | ~5 GB | Slow      | High      |
| `large-v3-turbo` | ~1.6 GB | ~4 GB | Medium    | Very high |
| `large`          | ~3 GB   | ~8 GB | Slowest   | Best      |

Recommended: `large-v3-turbo` on Apple Silicon, `base` on low-end hardware.

---

## Speaker Diarization (Local Whisper)

Identifies individual speakers using [pyannote-audio](https://github.com/pyannote/pyannote-audio). Requires Python 3.10–3.12 and a free HuggingFace token.

**1. Install Python dependencies:**

```bash
npm run setup:diarize
```

Or via the UI: Settings → Engine → Setup Diarization.

**2. Create a HuggingFace READ token** at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), then accept terms for:

- [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
- [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

**3. Enter the token** in Settings → Engine → HuggingFace Token.

On first use, the app downloads ~1 GB of models. Subsequent starts are ready in ~10–15 seconds.

---

## System Audio Capture

To capture audio from other apps (Zoom, Meet, YouTube, etc.), a virtual audio driver is required.

See **[AUDIO-CAPTURE.md](AUDIO-CAPTURE.md)** for setup instructions:

- **macOS**: BlackHole + Aggregate Device
- **Windows**: VB-CABLE or Stereo Mix

---

## Documentation

| File                                 | Contents                                           |
| ------------------------------------ | -------------------------------------------------- |
| [DEV-BUILD.md](DEV-BUILD.md)         | Development setup, build commands, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md)   | System architecture, data flow, component overview |
| [AUDIO-CAPTURE.md](AUDIO-CAPTURE.md) | System audio capture setup (BlackHole / VB-CABLE)  |

---

## Tech Stack

| Layer               | Technology                                        |
| ------------------- | ------------------------------------------------- |
| Frontend            | React 19, Vite, Tailwind CSS v4, Socket.IO Client |
| Backend             | Node.js, Express 5, Socket.IO                     |
| Desktop             | Electron                                          |
| Audio capture       | ffmpeg (avfoundation / dshow)                     |
| STT (cloud)         | Soniox API                                        |
| STT (local)         | nodejs-whisper (whisper.cpp)                      |
| Speaker diarization | pyannote-audio 3.1 (Python)                       |
| Translation (local) | Ollama / LibreTranslate                           |
| Database            | SQLite (better-sqlite3)                           |
