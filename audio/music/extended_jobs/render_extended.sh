#!/bin/bash
# SKYCHARGE extended mixes on Frog's Mac: plain ffmpeg + awk only.  usage: bash render_extended.sh [cabin_chill|flight_theme]
cd "$(dirname "$0")"; . ./lib.sh; ONLY=$1; FF="$FF -nostdin"
while read cue rest; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$cue" ] && continue
  set -- $rest; n=$#; loops=${!n}; stems=("${@:1:$((n-1))}")
  echo "== $cue: ${#stems[@]} stems  start $(date +%T)"
  if [ ! -s ${cue}_mix_raw.wav ]; then
    maps=(); for s in "${stems[@]}"; do maps+=(-map "[st_$s]" -c:a pcm_f32le "stem_${cue}_$s.wav"); done
    /usr/bin/time -p nice -n 10 $FF -hide_banner -nostats -y -/filter_complex ${cue}_stems.fg "${maps[@]}" > ${cue}_stems.log 2>&1 || { echo "  STEMS FAILED"; tail -5 ${cue}_stems.log; continue; }
    echo "  stems $(grep '^real' ${cue}_stems.log)"
    ins=(); for s in "${stems[@]}"; do ins+=(-stream_loop $loops -i "stem_${cue}_$s.wav"); done
    $FF -hide_banner -nostats -loglevel error -y "${ins[@]}" -/filter_complex ${cue}_arrange.fg -map '[out]' -ac 1 -ar $SR -c:a pcm_f32le ${cue}_mix_raw.wav || { echo "  ARRANGE FAILED"; continue; }
  fi
  read I TP LR _ < <(meas ${cue}_mix_raw.wav -16 20)
  C=$(awk -v i=$I 'BEGIN{printf "%.2f", 13.8+i-8}')
  echo "  raw mix I=$I TP=$TP LRA=$LR -> gentle peak limit at $C dBFS after -8 dB pre-gain"
  $FF -hide_banner -nostats -loglevel error -y -i ${cue}_mix_raw.wav -af "aformat=sample_fmts=dbl,volume=-8dB,alimiter=limit=$(awk -v c=$C 'BEGIN{print 10^(c/20)}'):attack=3:release=80:level=0:latency=1" -c:a pcm_f32le ${cue}_mix_lim.wav
  norm ${cue}_mix_lim.wav ${cue}_extended.wav -16 pcm_s24le 20
  echo "  length $(ffprobe -v error -show_entries format=duration -of csv=p=0 ${cue}_extended.wav) s; last 0.5 s RMS $(rms ${cue}_extended.wav $(awk -v d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ${cue}_extended.wav) 'BEGIN{print d-0.5}') 0.5) dB"
  echo "== $cue done $(date +%T)"
done < stems_cmds.txt
