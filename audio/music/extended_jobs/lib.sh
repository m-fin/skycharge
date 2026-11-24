# Shared helpers: plain ffmpeg + awk only (no Python). Sourced by the render scripts.
FF=/opt/homebrew/bin/ffmpeg
SR=44100
# meas FILE TARGET_I [LRA] -> "I TP LRA THRESH OFFSET" (loudnorm pass 1)
meas() { $FF -hide_banner -nostats -i "$1" -af "loudnorm=I=$2:TP=-1.5:LRA=${3:-11}:print_format=json" -f null - 2>&1 |
  awk -F'"' '/"input_i"/{i=$4}/"input_tp"/{tp=$4}/"input_lra"/{l=$4}/"input_thresh"/{th=$4}/"target_offset"/{o=$4}END{print i,tp,l,th,o}'; }
# rms FILE START DUR [prefilter] -> RMS dBFS of a window
rms() { $FF -hide_banner -nostats -ss "$2" -t "$3" -i "$1" -af "${4:+$4,}astats=measure_perchannel=none:measure_overall=RMS_level" -f null - 2>&1 |
  awk '/RMS level dB/{print $NF}' | tail -1; }
# edge SAMPLES: first 3 and last 3 samples (seam check)
edge() { echo "first: $($FF -v error -i "$1" -af atrim=end_sample=3 -f f32le - | od -An -f | xargs)  last: $($FF -v error -i "$1" -af areverse,atrim=end_sample=3,areverse -f f32le - | od -An -f | xargs)"; }
# norm IN OUT TARGET_I CODEC LRA: two-pass, constant gain (= loudnorm linear mode). Lowers target if TP would pass -1.5.
norm() {
  local in=$1 out=$2 tgt=$3 codec=${4:-pcm_s24le} lra=${5:-11} I TP L TH O I2 TP2 L2
  read I TP L TH O < <(meas "$in" "$tgt" "$lra")
  local used=$tgt
  if awk -v tp="$TP" -v i="$I" -v t="$tgt" 'BEGIN{exit !(tp+(t-i) > -1.6)}'; then
    used=$(awk -v tp="$TP" -v i="$I" 'BEGIN{printf "%.2f", -1.6-tp+i}'); echo "  NOTE $out: peak too high for $tgt LUFS linear, target lowered to $used"; fi
  local g=$(awk -v i="$I" -v t="$used" 'BEGIN{printf "%.4f", t-i}')
  local lin=$($FF -hide_banner -nostats -i "$in" -af "loudnorm=I=$used:TP=-1.5:LRA=$lra:measured_I=$I:measured_TP=$TP:measured_LRA=$L:measured_thresh=$TH:offset=$O:linear=true:print_format=json" -f null - 2>&1 | awk -F'"' '/normalization_type/{print $4}')
  $FF -hide_banner -nostats -loglevel error -y -i "$in" -af "volume=${g}dB:precision=double" -c:a $codec "$out"
  read I2 TP2 L2 _ < <(meas "$out" "$used" "$lra")
  echo "  $out: in I=$I TP=$TP LRA=$L | gain ${g} dB | loudnorm pass2 check=$lin | OUT I=$I2 LUFS TP=$TP2 dBTP LRA=$L2 LU"
}
