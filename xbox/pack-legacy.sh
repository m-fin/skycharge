#!/usr/bin/env bash
# pack-legacy.sh <version>
# Build an UNSIGNED Xbox One Dev Mode package (EdgeHTML / UWP .msix).
# Signing is deliberately not done here. No .pfx, no signtool, no signing secret.
#
#   ./pack-legacy.sh 1.0.9.0
#
# Writes:
#   dist/SKYCHARGE_EdgeHTML_x64_<version>_unsigned.msix
#   dist/SKYCHARGE_EdgeHTML_x64_<version>_unsigned.msix.sha256
set -euo pipefail
cd "$(dirname "$0")"
VER="${1:-}"
if [[ ! "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: pack-legacy.sh <version>   version is four numeric parts, e.g. 1.0.9.0" >&2
  exit 1
fi
IFS=. read -r major minor build rev <<< "$VER"
for part in "$major" "$minor" "$build" "$rev"; do
  if (( part > 65535 )); then
    echo "Appx version part $part is above 65535" >&2
    exit 1
  fi
done

REPO="$(cd .. && pwd)"
BUILD="$PWD/build"
WWW="$BUILD/www-legacy"
LAYOUT="$BUILD/layout"
DIST="$PWD/dist"
DISPLAY="SKYCHARGE $VER"
MUS="${SKYCHARGE_MUSIC_DIR:-$REPO/audio/music/out}"

if [[ ! -d node_modules/esbuild || ! -d node_modules/three || ! -d node_modules/acorn ]]; then
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
fi

python3 sync-game-src.py
if git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git -C "$REPO" diff --quiet -- src index.html audio vendor; then
    echo "refusing to pack: sync changed game sources in the repo (src, index.html, audio, or vendor)" >&2
    git -C "$REPO" diff --stat -- src index.html audio vendor >&2
    exit 1
  fi
fi
node build-legacy.mjs

rm -rf "$LAYOUT"
mkdir -p "$LAYOUT"
cp -a layout/. "$LAYOUT/"
python3 - "$LAYOUT/AppxManifest.xml" "$VER" "$DISPLAY" <<'PY'
import re, sys
path, version, display = sys.argv[1], sys.argv[2], sys.argv[3]
xml = open(path, encoding='utf-8').read()
xml2, n = re.subn(
    r'(<Identity\b[^>]*\bName="FrogFinley\.SKYCHARGE"[^>]*\bVersion=")[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(")',
    rf'\g<1>{version}\2', xml, count=1)
if n != 1:
    sys.exit('Identity Version was not updated (Name FrogFinley.SKYCHARGE must stay, with Version on the same tag)')
for required in (
    'Name="FrogFinley.SKYCHARGE"',
    'Publisher="CN=Frog Finley"',
    'PhoneProductId="5b1d6c2e-7a4f-4c1e-9a8e-2f6d3c9b7a10"',
):
    if required not in xml2:
        sys.exit(f'manifest lost required identity field: {required}')
xml3, n = re.subn(r'(<DisplayName>)[^<]*(</DisplayName>)', rf'\g<1>{display}\2', xml2, count=1)
if n != 1:
    sys.exit('Properties DisplayName was not updated')
xml4, n = re.subn(
    r'(<uap:VisualElements\b[^>]*\bDisplayName=")[^"]*(")',
    rf'\g<1>{display}\2', xml3, count=1)
if n != 1:
    sys.exit('uap:VisualElements DisplayName was not updated')
if xml4.count(display) != 2:
    sys.exit(f'expected exactly 2 display-name occurrences of {display!r}, found {xml4.count(display)}')
open(path, 'w', encoding='utf-8').write(xml4)
print(f'manifest stamped {display}')
PY

# On-screen boot diag in the packaged copy only. The committed boot.js stays as-is.
if grep -q 'SKYCHARGE 1.0.8.2 diag' "$WWW/boot.js"; then
  sed -i "s/SKYCHARGE 1.0.8.2 diag/SKYCHARGE ${VER} diag/" "$WWW/boot.js"
fi
rm -f "$LAYOUT"/*.html "$LAYOUT"/*.js
cp "$WWW/index.html" "$WWW/boot.js" "$WWW/shim.js" "$WWW/game.js" "$LAYOUT/"

# Music, same selection as the old pack-legacy.sh: the two loop MP3s are required,
# 22.05 kHz weather WAVs are included when present. Never copy OGG/Opus.
rm -rf "$LAYOUT/audio"
mkdir -p "$LAYOUT/audio/music/out"
missing=()
for f in cabin_chill_loop.mp3 flight_theme_loop.mp3; do
  [[ -f "$MUS/$f" ]] || missing+=("$MUS/$f")
done
if ((${#missing[@]})); then
  echo "missing music the EdgeHTML package loads (MP3 only):" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "Put the loops in audio/music/out/ (or set SKYCHARGE_MUSIC_DIR). Weather layers are optional: audio/music/out/xbox22k/weather_{rain,fog,cloudy}_layer.wav" >&2
  exit 1
fi
python3 - "$MUS/cabin_chill_loop.mp3" "$MUS/flight_theme_loop.mp3" <<'PY'
import sys
for path in sys.argv[1:]:
    sig = open(path, 'rb').read(4)
    if sig[:3] == b'ID3' or (len(sig) >= 2 and sig[0] == 0xFF and (sig[1] & 0xE0) == 0xE0):
        continue
    sys.exit(f'{path} is not an MP3 (header {sig!r}). EdgeHTML cannot play Ogg; do not substitute an .ogg file.')
PY
cp "$MUS/cabin_chill_loop.mp3" "$MUS/flight_theme_loop.mp3" "$LAYOUT/audio/music/out/"
for k in rain fog cloudy; do
  wav="$MUS/xbox22k/weather_${k}_layer.wav"
  if [[ -f "$wav" ]]; then
    sig="$(od -An -tx1 -N4 "$wav" | tr -d ' ')"
    if [[ "$sig" != "52494646" ]]; then
      echo "weather layer is not a WAV (RIFF): $wav" >&2
      exit 1
    fi
    cp "$wav" "$LAYOUT/audio/music/out/"
  fi
done
if find "$LAYOUT" -type f \( -iname '*.ogg' -o -iname '*.oga' -o -iname '*.opus' \) | grep -q .; then
  echo "OGG/Opus file in the package layout" >&2
  exit 1
fi

echo "auditing $LAYOUT"
python3 compat/xbox_audit.py "$LAYOUT" | tee "$BUILD/audit.txt"

# stdout of build-makemsix.sh is only the ELF path. Do not word-split it.
MAKEMSIX="$(./build-makemsix.sh)"
if [[ "$MAKEMSIX" == *$'\n'* || "$MAKEMSIX" != /* || ! -f "$MAKEMSIX" || ! -x "$MAKEMSIX" ]]; then
  echo "build-makemsix.sh did not print the built makemsix binary:" >&2
  printf '%s\n' "$MAKEMSIX" >&2
  exit 1
fi
if ! head -c 4 -- "$MAKEMSIX" | cmp -s - <(printf '\177ELF'); then
  echo "refusing to run $MAKEMSIX (not the ELF from cmake bin/)" >&2
  exit 1
fi
msix_bindir="$(dirname "$MAKEMSIX")"
msix_libdir="$(dirname "$msix_bindir")/lib"
ld_parts=()
if [[ -d "$msix_libdir" ]] && compgen -G "$msix_libdir/libmsix.so*" >/dev/null; then
  ld_parts+=("$msix_libdir")
fi
if compgen -G "$msix_bindir/libmsix.so*" >/dev/null; then
  ld_parts+=("$msix_bindir")
fi
if ((${#ld_parts[@]})); then
  joined="$(IFS=:; printf '%s' "${ld_parts[*]}")"
  export LD_LIBRARY_PATH="${joined}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
echo "using makemsix $MAKEMSIX"
echo "LD_LIBRARY_PATH=${LD_LIBRARY_PATH-}"
mkdir -p "$DIST"
OUT="$DIST/SKYCHARGE_EdgeHTML_x64_${VER}_unsigned.msix"
rm -f "$OUT" "${OUT}.sha256"
"$MAKEMSIX" pack -d "$LAYOUT" -p "$OUT"

UNPACK="$(mktemp -d)"
trap 'rm -rf "$UNPACK"' EXIT
"$MAKEMSIX" unpack -p "$OUT" -d "$UNPACK" -ss
ROOT="$UNPACK"
if [[ ! -f "$ROOT/index.html" ]]; then
  ROOT="$(find "$UNPACK" -name index.html -printf '%h\n' -quit)"
fi
for f in index.html boot.js shim.js game.js AppxManifest.xml; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "unpacked package is missing $f (looked in $ROOT)" >&2
    find "$UNPACK" -maxdepth 3 -type f -print >&2
    exit 1
  fi
done
if find "$ROOT" -type f \( -iname '*.ogg' -o -iname '*.oga' -o -iname '*.opus' -o -iname '*.pfx' -o -iname '*.cer' -o -iname '*.p12' \) | grep -q .; then
  echo "unpacked package contains ogg or a certificate" >&2
  exit 1
fi
if [[ -f "$ROOT/AppxSignature.p7x" ]]; then
  echo "package is signed; this pipeline must produce an unsigned .msix" >&2
  exit 1
fi
python3 - "$ROOT" "$VER" "$DISPLAY" <<'PY'
import re, sys
from pathlib import Path
root, version, display = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
html = (root / 'index.html').read_text(encoding='utf-8')
for src in ('boot.js', 'shim.js', 'game.js'):
    if f'<script src="{src}"></script>' not in html:
        sys.exit(f'index.html is missing external script {src}')
if re.search(r'<script\b(?![^>]*\bsrc=)[^>]*>\s*\S', html, re.I):
    sys.exit('index.html has an inline script')
manifest = (root / 'AppxManifest.xml').read_text(encoding='utf-8')
if f'Version="{version}"' not in manifest:
    sys.exit('unpacked manifest version mismatch')
if manifest.count(display) != 2:
    sys.exit(f'unpacked manifest display name count != 2 ({display})')
for required in (
    'Name="FrogFinley.SKYCHARGE"',
    'Publisher="CN=Frog Finley"',
    'PhoneProductId="5b1d6c2e-7a4f-4c1e-9a8e-2f6d3c9b7a10"',
):
    if required not in manifest:
        sys.exit('unpacked manifest lost ' + required)
for name in ('cabin_chill_loop.mp3', 'flight_theme_loop.mp3'):
    if not (root / 'audio' / 'music' / 'out' / name).is_file():
        sys.exit('unpacked package is missing ' + name)
print('unpacked package OK', display)
PY

# Hash file sits next to the .msix and names it relatively, so `sha256sum -c` works in dist/.
(
  cd "$DIST"
  sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256"
)
echo "wrote $OUT"
cat "${OUT}.sha256"
