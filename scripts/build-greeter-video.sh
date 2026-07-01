#!/usr/bin/env bash
# Build the home-page mascot greeter assets (public/greeter/) from a source
# waving-avatar render.
#
# The greeter is a one-shot, NOT a loop. We take the first DURATION seconds
# of the source, scale + transcode them forward to mp4 + webm (broad support
# + a smaller webm), strip audio, and grab the opening frame as the poster /
# reduced-motion still. The clip holds on its final frame, so DURATION also
# decides the resting pose.
#
# Usage: scripts/build-greeter-video.sh <source.mp4> [duration_seconds]
set -euo pipefail

SRC="${1:?usage: scripts/build-greeter-video.sh <source.mp4> [duration_seconds]}"
DURATION="${2:-2.6}"
OUT="public/greeter"
SIZE=320
VF="scale=${SIZE}:${SIZE},format=yuv420p"

mkdir -p "$OUT"
echo "building first ${DURATION}s of $SRC → $OUT"

ffmpeg -y -loglevel error -i "$SRC" -t "$DURATION" -vf "$VF" -an \
  -c:v libx264 -crf 23 -preset slow -movflags +faststart "$OUT/wave.mp4"

ffmpeg -y -loglevel error -i "$SRC" -t "$DURATION" -vf "$VF" -an \
  -c:v libvpx-vp9 -crf 34 -b:v 0 "$OUT/wave.webm"

ffmpeg -y -loglevel error -i "$SRC" -frames:v 1 -vf "scale=${SIZE}:${SIZE}" -q:v 3 \
  "$OUT/wave-poster.jpg"

echo "built:"
ls -la "$OUT"/wave.mp4 "$OUT"/wave.webm "$OUT"/wave-poster.jpg
