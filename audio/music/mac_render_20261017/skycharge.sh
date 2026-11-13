#!/bin/bash
# SKYCHARGE cabin + flight loops: synth (A), then two-pass linear normalize to -16 LUFS. Final WAVs only; OGG is encoded on the box.
cd "$(dirname "$0")"; . ./lib.sh
for c in cabin_chill_loop flight_theme_loop; do
  echo "== $c  start $(date +%T)"
  if [ ! -s ${c}_raw.wav ]; then
    /usr/bin/time -p nice -n 10 $FF -hide_banner -nostats -y -/filter_complex $c.fg -map '[out]' -ac 1 -ar $SR -c:a pcm_f32le ${c}_raw.wav > ${c}_A.log 2>&1 || { echo "  A FAILED"; tail -5 ${c}_A.log; continue; }
    grep -E '^real' ${c}_A.log | sed 's/^/  synth time /'
  fi
  echo "  samples: $(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 ${c}_raw.wav 2>/dev/null || echo ?)"
  norm ${c}_raw.wav ${c}.wav -16 pcm_s24le 11
  echo "  seam $(edge ${c}.wav)"
  echo "  RMS first 2s $(rms ${c}.wav 0 2) dB, last 2s $(rms ${c}.wav 126 2) dB"
done
echo "== SKYCHARGE DONE $(date +%T)"
