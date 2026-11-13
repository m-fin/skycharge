#!/bin/bash
# Linear-only can't reach -16 LUFS (peaks 17-19 dB above loudness). Seamless option: peak-limit a 3x periodic copy
# (middle copy kept, so the limiter state at the wrap is steady-state), then constant gain to -16 LUFS.
cd "$(dirname "$0")"; . ./lib.sh
NS=5644800
for c in cabin_chill_loop flight_theme_loop; do
  [ -f ${c}_linear.wav ] || mv ${c}.wav ${c}_linear.wav
  read I TP _ < <(meas ${c}_raw.wav -16)
  C=$(awk -v i=$I 'BEGIN{printf "%.2f", 13.8+i-8}')   # ceiling after an -8 dB pre-gain
  echo "== $c: raw I=$I TP=$TP; limit ceiling $C dBFS after -8 dB pre-gain"
  $FF -hide_banner -nostats -loglevel error -y -stream_loop 2 -i ${c}_raw.wav -af "aformat=sample_fmts=dbl,volume=-8dB,alimiter=limit=$(awk -v c=$C 'BEGIN{print 10^(c/20)}'):attack=2:release=60:level=0:latency=1,atrim=start_sample=$NS:end_sample=$((2*NS)),asetpts=PTS-STARTPTS" -c:a pcm_f32le ${c}_lim.wav
  norm ${c}_lim.wav ${c}.wav -16
  echo "  samples $(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 ${c}.wav)  seam $(edge ${c}.wav)"
done
