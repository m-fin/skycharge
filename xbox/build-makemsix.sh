#!/usr/bin/env bash
# Build Microsoft's open-source makemsix (msix-packaging) and install a wrapper
# at xbox/.tools/makemsix/makemsix. No signing toolkit. Re-run is a no-op when
# the pinned commit is already built.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PIN="${MSIX_PACKAGING_COMMIT:-25a65f5c1690930813bcc10cdf1d59fa865f2bb1}"
PREFIX="$HERE/.tools/makemsix"
WRAPPER="$PREFIX/makemsix"
STAMP="$PREFIX/PIN"

if [[ -n "${MAKEMSIX:-}" && -x "${MAKEMSIX}" ]]; then
  echo "$MAKEMSIX"
  exit 0
fi
if [[ -x "$WRAPPER" && -f "$STAMP" && "$(cat "$STAMP")" == "$PIN" ]]; then
  echo "$WRAPPER"
  exit 0
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "makemsix build needs '$1' on PATH. On Ubuntu: sudo apt-get install -y build-essential clang python3 python3-venv libicu-dev zlib1g-dev pkg-config" >&2
    exit 1
  fi
}
need clang
need clang++
need git
need python3
need make
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
    "$VENV/bin/pip" install --disable-pip-version-check 'cmake==3.31.8'
  fi
  export PATH="$VENV/bin:$PATH"
  cmake_ok || { echo "cmake >= 3.29 is required" >&2; exit 1; }
fi

SRC="$HERE/.tools/msix-packaging-src"
rm -rf "$SRC" "$PREFIX"
mkdir -p "$SRC"
git -C "$SRC" init -q
git -C "$SRC" remote add origin https://github.com/microsoft/msix-packaging.git
git -C "$SRC" fetch --depth 1 origin "$PIN"
git -C "$SRC" checkout --detach FETCH_HEAD
test "$(git -C "$SRC" rev-parse HEAD)" = "$PIN"

# Their Linux script builds inside the source tree (.vs). Pack support is off
# unless --pack is passed, and --pack turns schema validation on.
( cd "$SRC" && ./makelinux.sh --pack --skip-tests --skip-samples )

BIN="$(find "$SRC/.vs" -type f -name makemsix -perm -111 | head -n 1)"
if [[ -z "$BIN" ]]; then
  echo "makemsix binary was not produced under $SRC/.vs" >&2
  exit 1
fi
mkdir -p "$PREFIX"
cp -a "$BIN" "$PREFIX/makemsix.bin"
# Shared libraries the binary links, if any, sit next to the wrapper.
ldd "$PREFIX/makemsix.bin" | awk '/=>/ {print $3}' | while read -r lib; do
  case "$lib" in
    "$SRC"/*) cp -a "$lib" "$PREFIX/" ;;
  esac
done
cat > "$WRAPPER" <<'EOF'
#!/usr/bin/env bash
# ld.so --library-path wins over an absolute DT_RPATH left from the build tree,
# so a cached binary still loads the libmsix.so copied next to it.
HERE="$(cd "$(dirname "$0")" && pwd)"
exec /lib64/ld-linux-x86-64.so.2 --library-path "$HERE" "$HERE/makemsix.bin" "$@"
EOF
chmod +x "$WRAPPER"
printf '%s\n' "$PIN" > "$STAMP"
echo "$WRAPPER"
