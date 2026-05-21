#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

LOG=.reencode.log
> "$LOG"

mapfile -d '' files < <(find public/sounds -newer .gitignore -name "*.mp4" -size +10M -print0 | sort -z)
total=${#files[@]}
echo "[reencode] $total files to process" | tee -a "$LOG"

i=0
fail=0
saved=0
for f in "${files[@]}"; do
  i=$((i + 1))
  before=$(stat -c %s "$f")
  if ffmpeg -hide_banner -loglevel error -y -i "$f" \
       -c:v libx264 -crf 23 -preset fast -vf "scale=-2:720" \
       -c:a aac -b:a 96k -movflags +faststart "$f.new.mp4" 2>>"$LOG"; then
    after=$(stat -c %s "$f.new.mp4")
    mv "$f.new.mp4" "$f"
    saved=$((saved + before - after))
    printf "[reencode] %3d/%d  %5.1fM -> %4.1fM  %s\n" \
      "$i" "$total" "$(echo "scale=1; $before/1048576" | bc)" \
      "$(echo "scale=1; $after/1048576" | bc)" "$f" | tee -a "$LOG"
  else
    fail=$((fail + 1))
    rm -f "$f.new.mp4"
    echo "[reencode] FAIL  $f" | tee -a "$LOG"
  fi
done

echo "[reencode] done. ${i} processed, ${fail} failed, $(echo "scale=1; $saved/1073741824" | bc)GB freed" | tee -a "$LOG"
