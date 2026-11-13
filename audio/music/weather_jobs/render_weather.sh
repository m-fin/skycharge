#!/bin/bash
# SKYCHARGE weather layers on Frog's Mac: plain ffmpeg + awk only.
cd "$(dirname "$0")"; . ./lib.sh; FF="$FF -nostdin"; NS=5644800
FLIGHT=../skycharge_music/flight_theme_loop.wav
pk() { $FF -hide_banner -nostats -i "$1" -af "$2,astats=measure_perchannel=none:measure_overall=Peak_level" -f null - 2>&1 | awk '/Peak level dB/{print $NF}' | tail -1; }
for c in weather_rain_layer weather_fog_layer weather_cloudy_layer; do
  echo "== $c start $(date +%T)"
  /usr/bin/time -p nice -n 10 $FF -hide_banner -nostats -y -/filter_complex $c.fg -map '[out]' -ac 1 -ar $SR -c:a pcm_f32le ${c}_raw.wav > ${c}_A.log 2>&1 || { echo "  SYNTH FAILED"; tail -5 ${c}_A.log; continue; }
  echo "  synth $(grep '^real' ${c}_A.log); samples $(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 ${c}_raw.wav)"
  norm ${c}_raw.wav $c.wav -20 pcm_s24le 11
  # seam: biggest sample-to-sample step within +-5 ms of the wrap (2 copies joined) vs the biggest step anywhere in the loop
  echo "  seam: max step at wrap $($FF -hide_banner -nostats -stream_loop 1 -i $c.wav -af "aderivative,atrim=start_sample=$((NS-220)):end_sample=$((NS+220)),astats=measure_perchannel=none:measure_overall=Peak_level" -f null - 2>&1 | awk '/Peak level dB/{print $NF}' | tail -1) dB | max step in whole loop $(pk $c.wav aderivative) dB | $(edge $c.wav)"
  # loop + layer, both at unity, sample-aligned
  m=flight_plus_${c%_layer}; m=${m/weather_/}
  $FF -hide_banner -nostats -loglevel error -y -i $FLIGHT -i $c.wav -filter_complex "[0:a][1:a]amix=inputs=2:normalize=0:duration=longest[o]" -map '[o]' -c:a pcm_f32le ${m}_raw.wav
  read I TP LR _ < <(meas ${m}_raw.wav -16)
  echo "  loop+layer at unity: I=$I LUFS TP=$TP dBTP LRA=$LR ($(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 ${m}_raw.wav) samples)"
  g=$(awk -v tp=$TP 'BEGIN{printf "%.2f", (tp > -1.5) ? -1.6-tp : 0}')
  $FF -hide_banner -nostats -loglevel error -y -i ${m}_raw.wav -af "volume=${g}dB:precision=double" -c:a pcm_s24le ${m}_preview.wav
  read I2 TP2 _ < <(meas ${m}_preview.wav -16); echo "  preview mix: gain $g dB -> I=$I2 TP=$TP2"
done
read I TP _ < <(meas $FLIGHT -16); echo "== flight loop alone: I=$I TP=$TP"
echo "== done $(date +%T)"
