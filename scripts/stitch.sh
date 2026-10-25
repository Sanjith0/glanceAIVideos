#!/usr/bin/env bash
# Stitches video-only slices rendered in parallel
# (`npx remotion render GlanceFilm out/part-N.mp4 --frames=A-B --muted`)
# into one MP4 without re-encoding, then muxes the synthesized audio stems.
#
#   scripts/stitch.sh out/parts out/glance-launch-film.mp4
#
# The slices must be named part-1.mp4 … part-N.mp4 in frame order.
set -euo pipefail

PARTS_DIR=${1:-out/parts}
OUT=${2:-out/glance-launch-film.mp4}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

LIST=$(mktemp)
n=1
while [ -f "$PARTS_DIR/part-$n.mp4" ]; do
  echo "file '$(cd "$PARTS_DIR" && pwd)/part-$n.mp4'" >>"$LIST"
  n=$((n + 1))
done
[ -s "$LIST" ] || { echo "no parts found in $PARTS_DIR" >&2; exit 1; }

VIDEO=$(mktemp --suffix=.mp4)
ffmpeg -v error -y -f concat -safe 0 -i "$LIST" -c copy "$VIDEO"

A="$ROOT/public/audio"
ffmpeg -v error -y -i "$VIDEO" \
  -i "$A/ambience.wav" -i "$A/footsteps.wav" -i "$A/glasses.wav" \
  -i "$A/recognition.wav" -i "$A/connection.wav" -i "$A/resolution.wav" \
  -filter_complex "[1:a][2:a][3:a][4:a][5:a][6:a]amix=inputs=6:normalize=0:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest "$OUT"

rm -f "$LIST" "$VIDEO"
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate,nb_read_frames \
  -show_entries format=duration -of default=nw=1 "$OUT"
