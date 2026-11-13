# SKYCHARGE on Xbox One (EdgeHTML, Dev Mode)

This folder builds the backup package that sideloads onto an Xbox One in Dev Mode. The console's browser is EdgeHTML 18: WebGL1, ES2017, no inline scripts, no Ogg, and `fetch` of files inside the package is unreliable. The game in the repository stays as it is. Packaging copies it into `xbox/build/` and applies the Xbox patches there.

Signing does not happen in this repository or in GitHub Actions. There is no `.pfx`, `.cer`, or signing secret here. A different machine downloads the unsigned asset, signs it, and uploads the signed package to the same GitHub release.

## Release assets

A tag `v1.0.9.0` (four numeric parts) runs `.github/workflows/xbox-release.yml`. The version in the names below is the tag without the leading `v`.

| File | Who creates it |
|---|---|
| `SKYCHARGE_EdgeHTML_x64_1.0.9.0_unsigned.msix` | This workflow. Also uploaded as an Actions artifact. |
| `SKYCHARGE_EdgeHTML_x64_1.0.9.0_unsigned.msix.sha256` | This workflow, beside the unsigned package. `sha256sum -c` checks it. |
| `SKYCHARGE_EdgeHTML_x64_1.0.9.0.msix` | The external signer, after a local sign. Upload this to the **same** release. |

The workflow creates the GitHub release as a **draft** when the tag does not already have one, then attaches the two unsigned files. `workflow_dispatch` (input `version`, for example `1.0.9.0`) builds the same artifacts and does not create a release.

Identity is left alone so an install upgrades in place:

- Name `FrogFinley.SKYCHARGE`
- Publisher `CN=Frog Finley`
- PhoneProductId `5b1d6c2e-7a4f-4c1e-9a8e-2f6d3c9b7a10`

Both display names become `SKYCHARGE <version>`: the Properties `<DisplayName>` and `uap:VisualElements DisplayName`.

## What the external signer does

1. Open the draft release for `v<version>`.
2. Download `SKYCHARGE_EdgeHTML_x64_<version>_unsigned.msix` and the `.sha256` file. Check the hash.
3. Sign that file on the machine that holds the certificate. Do not add the certificate to this repo or to GitHub.
4. Upload the signed package as `SKYCHARGE_EdgeHTML_x64_<version>.msix` on that same release.

## Local build

Requirements: Node 20, Python 3, and the compilers `build-makemsix.sh` uses (`build-essential`, `clang`, `libicu-dev`, `zlib1g-dev`, `pkg-config`, `python3-venv`, `patchelf`). `makemsix` comes from [microsoft/msix-packaging](https://github.com/microsoft/msix-packaging) commit `25a65f5c1690930813bcc10cdf1d59fa865f2bb1`, built on demand into `xbox/.tools/makemsix/bin/makemsix` (the cmake ELF, not committed). `libmsix.so` is loaded from the sibling `lib/` directory via `LD_LIBRARY_PATH`.

```bash
cd xbox
npm ci
./pack-legacy.sh 1.0.9.0
```

Music is required, and it is MP3/WAV only, matching the old pack script:

- `audio/music/out/cabin_chill_loop.mp3`
- `audio/music/out/flight_theme_loop.mp3`
- optional `audio/music/out/xbox22k/weather_rain_layer.wav`, `weather_fog_layer.wav`, `weather_cloudy_layer.wav` (16-bit 22.05 kHz). Those are copied to `audio/music/out/` inside the package, which is where the game looks.

`SKYCHARGE_MUSIC_DIR` overrides that directory. The rendered loops are not in git today; the pack fails with the missing paths rather than shipping a silent package. `compat/xbox_audit.py` then scans the layout and the build fails if it reports any blocker.

The package contains `index.html`, `boot.js`, `shim.js`, and `game.js` as separate files. `game.js` is esbuild targeting ES2017 against three **0.162.0** (`build/three.module.js`, WebGL1). `xbox-shim.js` and `xbox-boot.js` in this folder are the copies that ship. `compat/shared/` from the old tree is not used.

## Patches applied to the copy

`sync-game-src.py` stops if any anchor string is gone, and it prints each miss. It does not change `src/`, `index.html`, or `audio/` in the repo.

- `src/input.mjs` — gamepads via `Array.prototype.slice` (no spread)
- `src/world.mjs` — simpler cloud spheres when `window.__XBOX`
- `src/main.mjs` — no antialias on Xbox, `ms-appx:` music paths, HUD every other frame, boot logs, `renderer` on `window.pg`
- `audio/sfx.js` — XHR for package bytes, `fetch` only as the fallback

`build-legacy.mjs` also rewrites the copied `index.html`: external scripts only, and a few EdgeHTML CSS fallbacks (`inset`, `place-items`, Segoe UI).
