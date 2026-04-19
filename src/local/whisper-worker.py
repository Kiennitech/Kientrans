#!/usr/bin/env python3
"""
Persistent Whisper STT worker for node-trans.
Loads the model once at startup, then processes audio continuously via stdin.

Protocol IN  (newline-delimited JSON):
  {"type": "audio",    "data": "<base64-pcm-s16le>"}
  {"type": "flush"}
  {"type": "shutdown"}

Protocol OUT (newline-delimited JSON):
  {"type": "ready"}
  {"type": "partial",   "text": "..."}   -- growing in-progress text
  {"type": "utterance", "text": "..."}   -- final committed utterance
  {"type": "error",     "message": "..."}
"""

import sys
import json
import base64
import threading
import time

import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2

# Sliding-window parameters
WINDOW_SECS = 4.0        # inference window length (reduced from 6s for faster first result)
STRIDE_SECS = 2.5        # advance per window; keeps 1.5 s overlap for context
MIN_FLUSH_SECS = 1.0     # minimum audio required for a forced flush
SILENCE_RMS = 300        # RMS below this is considered silence
SILENCE_FLUSH_SECS = 1.5 # flush window early after this much silence
UTTERANCE_SILENCE = 2    # consecutive empty windows → emit utterance
MAX_ACCUM_CHARS  = 200   # emit utterance when accumulated text exceeds this length


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def pcm_rms(data):
    if len(data) < 2:
        return 0.0
    s = np.frombuffer(data, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(s * s)))


def detect_device():
    """Auto-detect best device for CTranslate2 inference."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda", "float16"
    except ImportError:
        pass
    return "cpu", "int8"


class WhisperWorker:
    def __init__(self, model_name, language, translate, device, compute_type):
        self.model_name = model_name
        self.language = language    # None = auto-detect
        self.translate = translate  # True → task="translate" (force output to English)
        self.device = device
        self.compute_type = compute_type

        self.buf = bytearray()
        self.window_start = 0.0    # absolute time (s) of buf[0]
        self.last_end = 0.0        # last committed segment end for dedup
        self.silence_bytes = 0
        self.empty_windows = 0
        self.accum = ""            # utterance accumulator (cleared on emit)
        self.processing = False
        self.lock = threading.Lock()

    def load(self):
        print(f"[whisper-worker] Loading model '{self.model_name}' "
              f"(device={self.device}, compute_type={self.compute_type})…",
              file=sys.stderr, flush=True)
        self.model = WhisperModel(
            self.model_name,
            device=self.device,
            compute_type=self.compute_type,
        )
        emit({"type": "ready"})

    def add_audio(self, pcm):
        with self.lock:
            self.buf.extend(pcm)

            rms = pcm_rms(pcm)
            if rms < SILENCE_RMS:
                self.silence_bytes += len(pcm)
            else:
                self.silence_bytes = 0

            win_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * WINDOW_SECS)
            stride_b = int(SAMPLE_RATE * BYTES_PER_SAMPLE * STRIDE_SECS)
            min_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            sil_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * SILENCE_FLUSH_SECS)

            full      = len(self.buf) >= win_b
            sil_flush = self.silence_bytes >= sil_b and len(self.buf) >= min_b

            if (full or sil_flush) and not self.processing:
                self.processing = True
                chunk = bytes(self.buf)
                t0 = self.window_start

                if not sil_flush:
                    # Sliding window: keep the overlap portion
                    self.buf = bytearray(self.buf[stride_b:])
                    self.window_start += STRIDE_SECS
                else:
                    self.buf = bytearray()
                self.silence_bytes = 0

                threading.Thread(
                    target=self._run,
                    args=(chunk, t0, sil_flush),
                    daemon=True,
                ).start()

    def flush(self):
        """Process whatever remains in the buffer immediately."""
        with self.lock:
            min_b = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            if self.processing or len(self.buf) < min_b:
                return
            self.processing = True
            chunk, t0 = bytes(self.buf), self.window_start
            self.buf = bytearray()
            threading.Thread(
                target=self._run, args=(chunk, t0, True), daemon=True
            ).start()

    def emit_accum(self):
        """Emit any accumulated utterance text (called from main loop on shutdown)."""
        if self.accum:
            emit({"type": "utterance", "text": self.accum})
            self.accum = ""

    def _run(self, pcm, t0, force_utterance):
        try:
            # Convert PCM s16le to float32 array (faster-whisper accepts numpy directly)
            pcm_f32 = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0

            task = "translate" if self.translate else "transcribe"
            segments, _info = self.model.transcribe(
                pcm_f32,
                language=self.language,
                task=task,
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
            )

            texts = []
            for seg in segments:
                abs_start = t0 + seg.start
                abs_end   = t0 + seg.end
                text = seg.text.strip()

                if not text:
                    continue
                # Dedup: skip segments already committed in a previous overlap window
                if abs_start < self.last_end - 0.5:
                    continue

                texts.append(text)
                self.last_end = max(self.last_end, abs_end)

            if texts:
                self.empty_windows = 0
                self.accum = (self.accum + " " + " ".join(texts)).strip()
                emit({"type": "partial", "text": self.accum})
            else:
                self.empty_windows += 1

            if self.accum and (force_utterance or self.empty_windows >= UTTERANCE_SILENCE or len(self.accum) >= MAX_ACCUM_CHARS):
                emit({"type": "utterance", "text": self.accum})
                self.accum = ""
                self.empty_windows = 0

        except Exception as e:
            emit({"type": "error", "message": str(e)})
        finally:
            with self.lock:
                self.processing = False


def main():
    args = sys.argv[1:]
    model_name = "base"
    language = None
    translate = False
    device = None
    compute_type = None

    i = 0
    while i < len(args):
        if args[i] == "--model" and i + 1 < len(args):
            model_name = args[i + 1]
            i += 2
        elif args[i] == "--language" and i + 1 < len(args):
            v = args[i + 1]
            language = None if v == "auto" else v
            i += 2
        elif args[i] == "--translate":
            translate = True
            i += 1
        elif args[i] == "--device" and i + 1 < len(args):
            device = args[i + 1]
            i += 2
        elif args[i] == "--compute-type" and i + 1 < len(args):
            compute_type = args[i + 1]
            i += 2
        else:
            i += 1

    # Auto-detect device if not specified
    if device is None or compute_type is None:
        auto_device, auto_ct = detect_device()
        device = device or auto_device
        compute_type = compute_type or auto_ct

    worker = WhisperWorker(model_name, language, translate, device, compute_type)
    worker.load()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"type": "error", "message": f"JSON decode: {e}"})
            continue

        t = msg.get("type")
        if t == "audio":
            worker.add_audio(base64.b64decode(msg["data"]))
        elif t == "flush":
            worker.flush()
        elif t == "shutdown":
            worker.flush()
            # Wait for any running inference thread (max 10 s)
            deadline = time.time() + 10
            while worker.processing and time.time() < deadline:
                time.sleep(0.1)
            worker.emit_accum()
            break

    print("[whisper-worker] Shutdown complete.", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
