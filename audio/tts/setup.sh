#!/usr/bin/env bash
# One-time setup for the narration toolchain: creates .venv-tts (CPU-only torch + Kokoro + analysis tools).
# Usage: bash audio/tts/setup.sh
# System tools expected on PATH: ffmpeg, rubberband (CLI), espeak-ng.
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=.venv-tts/bin/python
[ -x "$PY" ] || uv venv .venv-tts --python 3.12
uv pip install --python "$PY" --index-url https://download.pytorch.org/whl/cpu torch
uv pip install --python "$PY" -r audio/tts/requirements.txt
"$PY" -c "import torch, kokoro, misaki, spacy, faster_whisper, librosa, soxr, soundfile; print('torch', torch.__version__, '| kokoro', kokoro.__version__, '| spacy', spacy.__version__)"
