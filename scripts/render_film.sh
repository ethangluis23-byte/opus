#!/usr/bin/env bash
# Render the whole film in 30 s parts with two parallel workers, then join the parts and add the mix.
#   bash scripts/render_film.sh [crf] [preset]
# Parts that already exist (build/video/part_NN.mp4 with a .done marker) are skipped, so the script can be resumed.
set -uo pipefail
cd "$(dirname "$0")/.."
CRF="${1:-15}"
PRESET="${2:-slow}"
mkdir -p build/video build/logs

worker() {
  local w="$1"
  local i
  for i in $(seq 0 19); do
    if [ $((i % 2)) -ne "$w" ]; then continue; fi
    local n
    n=$(printf '%02d' "$i")
    if [ -f "build/video/part_$n.done" ]; then continue; fi
    if node src/cli/render.js --from $((i * 30)) --to $((i * 30 + 30)) --out "build/video/part_$n.mp4" --crf "$CRF" --preset "$PRESET" > "build/logs/part_$n.log" 2>&1; then
      touch "build/video/part_$n.done"
    else
      echo "part $n FAILED (see build/logs/part_$n.log)"
    fi
  done
}

worker 0 &
worker 1 &
wait

: > build/video/parts.txt
for i in $(seq 0 19); do
  n=$(printf '%02d' "$i")
  if [ ! -f "build/video/part_$n.done" ]; then echo "missing part $n"; exit 1; fi
  echo "file 'part_$n.mp4'" >> build/video/parts.txt
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i build/video/parts.txt -c copy -movflags +faststart build/video/picture.mp4 || exit 1
echo "picture: build/video/picture.mp4"
