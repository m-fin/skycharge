#!/usr/bin/env bash
# Build Microsoft's open-source makemsix (msix-packaging). No signing toolkit.
# Re-run is a no-op when the pinned commit is already built.
#
# Stdout is exactly one line: the absolute path of the ELF at
# <prefix>/bin/makemsix (the cmake target, not a shell wrapper). pack-legacy.sh
# captures this script's stdout and execs it, so build logs must stay on stderr.
# A log on stdout becomes the command name and exec fails with "File name too long".
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PIN="${MSIX_PACKAGING_COMMIT:-25a65f5c1690930813bcc10cdf1d59fa865f2bb1}"
PREFIX="$HERE/.tools/makemsix"
BIN_OUT="$PREFIX/bin/makemsix"
STAMP="$PREFIX/PIN"

is_elf() {
  [[ -f "$1" && -x "$1" ]] || return 1
  head -c 4 -- "$1" | cmp -s - <(printf '\177ELF')
}

if [[ -n "${MAKEMSIX:-}" ]] && is_elf "$MAKEMSIX"; then
  echo "$MAKEMSIX"
  exit 0
fi
if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$PIN" ]] && is_elf "$BIN_OUT"; then
  ldd_out="$(ldd "$BIN_OUT" 2>&1 || true)"
  if [[ "$ldd_out" != *"not found"* ]]; then
    echo "$BIN_OUT"
    exit 0
  fi
  echo "cached makemsix cannot load its libraries; rebuilding" >&2
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "makemsix build needs '$1' on PATH. On Ubuntu: sudo apt-get install -y build-essential clang python3 python3-venv libicu-dev zlib1g-dev pkg-config patchelf" >&2
    exit 1
  fi
}
need clang
need clang++
need git
need python3
need make
if ! command -v patchelf >/dev/null 2>&1 && [[ -n "${GITHUB_ACTIONS:-}" ]] && command -v sudo >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y patchelf
fi
need patchelf
if ! command -v pkg-config >/dev/null 2>&1 || ! pkg-config --exists icu-uc; then
  echo "makemsix build needs libicu-dev (pkg-config icu-uc). sudo apt-get install -y libicu-dev zlib1g-dev pkg-config" >&2
  exit 1
fi

# This image sometimes has clang++ pointed at a GCC that is not installed.
# Fall back to the installed g++ headers and libstdc++ when the probe fails.
if ! echo 'int main(){return 0;}' | clang++ -x c++ - -o /tmp/msix-clang-probe >/dev/null 2>&1; then
  if ! command -v g++ >/dev/null 2>&1; then
    echo "clang++ cannot link C++ and g++ is not installed" >&2
    exit 1
  fi
  gcc_ver="$(g++ -dumpversion | cut -d. -f1)"
  gcc_triple="$(g++ -dumpmachine)"
  export CPLUS_INCLUDE_PATH="/usr/include/c++/${gcc_ver}:/usr/include/${gcc_triple}/c++/${gcc_ver}${CPLUS_INCLUDE_PATH:+:$CPLUS_INCLUDE_PATH}"
  export LIBRARY_PATH="$(dirname "$(g++ -print-file-name=libstdc++.so)")${LIBRARY_PATH:+:$LIBRARY_PATH}"
  if ! echo 'int main(){return 0;}' | clang++ -x c++ - -o /tmp/msix-clang-probe >/dev/null 2>&1; then
    echo "clang++ still cannot compile C++ (CPLUS_INCLUDE_PATH=$CPLUS_INCLUDE_PATH)" >&2
    exit 1
  fi
fi
rm -f /tmp/msix-clang-probe

cmake_ok() {
  command -v cmake >/dev/null 2>&1 && python3 - "$("cmake" --version | awk 'NR==1{print $3}')" <<'PY'
import sys
parts = [int(x) for x in sys.argv[1].split('.')[:3]]
while len(parts) < 3:
    parts.append(0)
sys.exit(0 if tuple(parts) >= (3, 29, 0) else 1)
PY
}
if ! cmake_ok; then
  VENV="$HERE/.tools/cmake-venv"
  if [[ ! -x "$VENV/bin/cmake" ]]; then
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --disable-pip-version-check 'cmake==3.31.8' >&2
  fi
  export PATH="$VENV/bin:$PATH"
  cmake_ok || { echo "cmake >= 3.29 is required" >&2; exit 1; }
fi

SRC="$HERE/.tools/msix-packaging-src"
rm -rf "$SRC" "$PREFIX"
mkdir -p "$SRC"
git -C "$SRC" init -q
git -C "$SRC" remote add origin https://github.com/microsoft/msix-packaging.git
git -C "$SRC" fetch --depth 1 origin "$PIN" >&2
git -C "$SRC" checkout --detach FETCH_HEAD >&2
test "$(git -C "$SRC" rev-parse HEAD)" = "$PIN"

# Their Linux script builds inside the source tree (.vs). Pack support is off
# unless --pack is passed, and --pack turns schema validation on.
# makelinux.sh prints the cmake log on stdout; keep it off our stdout.
( cd "$SRC" && ./makelinux.sh --pack --skip-tests --skip-samples ) >&2

# CMAKE_RUNTIME_OUTPUT_DIRECTORY is <build>/bin, and makelinux.sh builds in .vs.
# The link line is "Linking CXX executable ../../bin/makemsix".
BIN="$SRC/.vs/bin/makemsix"
if ! is_elf "$BIN"; then
  echo "makemsix ELF was not produced at $BIN" >&2
  find "$SRC/.vs" -name 'makemsix' -o -name 'libmsix.so*' >&2 || true
  exit 1
fi
mkdir -p "$PREFIX/bin" "$PREFIX/lib"
cp -a "$BIN" "$BIN_OUT"
shopt -s nullglob
libs=( "$SRC/.vs/lib"/*.so "$SRC/.vs/lib"/*.so.* )
shopt -u nullglob
if ((${#libs[@]} == 0)); then
  echo "no shared libraries under $SRC/.vs/lib (expected libmsix.so)" >&2
  exit 1
fi
cp -a "${libs[@]}" "$PREFIX/lib/"
# Flatten symlinks (cmake sometimes points libmsix.so at an absolute build path)
# so a cached copy still loads after the source tree is gone.
for lib in "$PREFIX/lib"/*; do
  if [[ -L "$lib" ]]; then
    target="$(readlink -f "$lib")"
    rm -f "$lib"
    cp -a "$target" "$lib"
  fi
done
# $ORIGIN/../lib beats a DT_RPATH that still points into the cmake build tree,
# including after .tools/makemsix is restored from cache without the source tree.
patchelf --set-rpath '$ORIGIN/../lib' "$BIN_OUT"
while read -r needed arrow path _; do
  [[ "$arrow" == "=>" && "$path" == "$SRC"/* && -e "$path" ]] || continue
  if [[ ! -e "$PREFIX/lib/$needed" ]]; then
    cp -aL "$path" "$PREFIX/lib/$needed"
  fi
done < <(ldd "$BIN_OUT" || true)
ldd_out="$(ldd "$BIN_OUT" 2>&1 || true)"
if [[ "$ldd_out" == *"not found"* || "$ldd_out" != *"libmsix"* ]]; then
  echo "built makemsix cannot load libmsix.so:" >&2
  printf '%s\n' "$ldd_out" >&2
  exit 1
fi
printf '%s\n' "$PIN" > "$STAMP"
echo "$BIN_OUT"
