#!/usr/bin/env python3
"""
Download a faster-whisper (CTranslate2) model via HuggingFace Hub with JSON
progress reporting.

Usage: python whisper-download.py <model-name>

Output (stdout, newline-delimited JSON):
  {"progress": 45, "downloaded": 67.2, "total": 149.4}   -- during download
  {"progress": 100, "done": true}                         -- when complete
  {"error": "..."}                                        -- on failure
"""

import sys
import os
import json


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) < 2:
        emit({"error": "Usage: whisper-download.py <model-name>"})
        sys.exit(1)

    model_name = sys.argv[1]

    try:
        from huggingface_hub import snapshot_download, HfApi
    except ImportError:
        emit({"error": "huggingface_hub is not installed. Install faster-whisper first."})
        sys.exit(1)

    repo_id = f"Systran/faster-whisper-{model_name}"

    # Check if model already cached
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub",
                             f"models--Systran--faster-whisper-{model_name}")
    if os.path.exists(cache_dir):
        # Verify it has the model file
        for root, _dirs, files in os.walk(cache_dir):
            if "model.bin" in files or "config.json" in files:
                emit({"progress": 100, "done": True})
                return

    # Get total repo size for progress reporting
    total_bytes = 0
    try:
        api = HfApi()
        model_info = api.model_info(repo_id)
        for sibling in getattr(model_info, "siblings", []):
            total_bytes += getattr(sibling, "size", 0) or 0
    except Exception:
        pass  # proceed without size info

    total_mb = round(total_bytes / (1024 * 1024), 1) if total_bytes > 0 else 0

    print(f"[whisper-download] Downloading {repo_id}", file=sys.stderr, flush=True)

    if total_mb > 0:
        emit({"progress": 0, "downloaded": 0, "total": total_mb})

    try:
        snapshot_download(
            repo_id,
            # faster-whisper only needs these files from the repo
            allow_patterns=["model.bin", "config.json", "tokenizer.json",
                            "vocabulary.*", "preprocessor_config.json"],
        )
    except Exception as e:
        emit({"error": f"Download failed: {e}"})
        sys.exit(1)

    emit({"progress": 100, "done": True})


if __name__ == "__main__":
    main()
