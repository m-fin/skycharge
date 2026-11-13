# SKYCHARGE

SKYCHARGE: a cozy always-daytime sky-exploration game by Matthew "Frog" Finley and the SKYCHARGE Studio team (current build: 1.0.8.x "Always Daylight").

Fly a little electric plane (and a blimp) over islands, villages, farms, and harbor towns. Keep your battery topped up at charging stations, collect coins, run missions, chill in your cabin, and hunt for the secret cows. No combat, just flying.

Built with plain JavaScript ES modules and [three.js](https://threejs.org/) 0.186.1 (vendored in `vendor/`, no CDN). Plays with an Xbox controller or keyboard.

## Run it
ES modules need to be served over http:

```sh
python3 -m http.server 8765
# then open http://127.0.0.1:8765/index.html in Chrome or Edge
```

Plug in or pair an Xbox controller and press any button so the browser detects it, or use the keyboard (press `?` or `H` for the controls panel).

### Single-file build
`node build.mjs` bundles everything (needs esbuild; set `ESBUILD` to its path) into `out/PlaneGame_play.html`, one self-contained file that runs from `file://`. `NO_MUSIC=1 node build.mjs` skips the music.

### Tests
`node test.mjs` and the `qa/` scripts run headless checks with headless Chrome (puppeteer-core).

See [TECHNICAL.md](TECHNICAL.md) for controls, systems, and implementation notes, plus the design docs (`SKY_DESIGN.md`, `LIFE_DESIGN.md`, `STYLE_GUIDE.md`, `VEHICLES_ROADMAP.md`).

## Not in this repo
Build output (`out/`), QA screenshots, videos, packaged builds, and Xbox signing certificates are intentionally kept out of git.

---
By Matthew "Frog" Finley. All rights reserved.
