# SKYCHARGE audio (Sonic Rift)

Free tools only. Nothing here has been committed, published or uploaded. The game code has not been edited; hooking it up is Crave Builder's job.

| Path | What |
|---|---|
| `sfx.js` | ES module, `export function createAudio(ctx, opts?)` (also the default export). All sound is synthesized live with Web Audio, so no sound files are needed. |
| `sfx_test.html` | Test page with sliders and buttons. It calls the per-frame setters every animation frame, the same way the game does. Serve over http: `python3 -m http.server 8765` in `plane-game/`, then open `/audio/sfx_test.html`. |
| `music/gen_jobs.py`, `music/jobs/*.fg` + `*.json`, `music/fill_pass2.py`, `music/MAC_JOBS.md` | The two music loops as ffmpeg-only HomeRender jobs. **Not rendered yet; they need Frog's OK.** The OGGs will land in `music/out/`. |

## API
```js
import { createAudio } from '../audio/sfx.js';
const audio = createAudio(ctx, { vario: true, masterVolume: 0.8, musicVolume: 0.55, sfxVolume: 1, autoCues: true, musicFallback: true });
```
- `ctx`: an existing `AudioContext` (Builder creates it on the first button press). If you omit it, sfx.js makes its own and resumes it on the
  first pointer, key or touch input. If Web Audio is missing entirely, you get a no-op object, so the game never crashes.

**Per-frame setters.** These are idempotent and cheap. They create no nodes, and automation (`setTargetAtTime`) is only scheduled when a target
actually changes. A mock-context test confirmed it: 600 identical frames created 0 nodes and made 0 automation calls.
| Call | Notes |
|---|---|
| `setVehicle('plane' \| 'blimp' \| 'glider' \| 'seaplane')` | Crossfades the engine sounds. `glider` has no motor, only wind (plus the vario). `seaplane` has its own lower, chunkier piston/prop voice (~62 Hz idle → ~142 Hz full, strong blade-pass chop, little whine). On a *change* (not the first call) it plays the `vehicleSwitch` cue automatically. |
| `setThrottle(0..1)` | Plane: motor whine pitch and level, prop hum and prop "chop" rate. Blimp: slow hum, rotor whoosh rate, faint motor. |
| `setSpeed(m/s)` | Wind rush (shared by both vehicles). It gets loud around 40–70 m/s. |
| `setEngine(vehicle, throttle, speed)` | Shorthand for the three calls above. |
| `setCharging(on, battery0to1)` | Electric hum and buzz, plus a rising pentatonic arpeggio that gets higher and faster as the battery fills. The **charge-complete ding plays once** when the battery reaches ≥ 99.5% during a session that started below that. It doesn't play when you park on a pad already full. `startCharging()` / `setChargeLevel()` / `stopCharging()` are aliases. |
| `setCabin(on)` | Muffles the engine (650 Hz low-pass, −8 dB) and **crossfades the music**: cabin loop when on, flight loop when off, with a time constant of about 0.7 s (roughly 2 s to settle). On a *change* it plays `chillOn` / `chillOff` automatically. |
| `setLift(climb)` | Glider vario. `climb` is a signed climb rate of about −1..1 (values outside are clamped; `true`/`false` are also accepted as 0.5 / 0). Above +0.08 it plays soft rising chirps: about 1.5 per second at a gentle climb, up to about 6 per second at +1, with pitch about 520 Hz → 1 kHz. Between −0.15 and +0.08 it's silent. Below −0.15 it plays a very soft low hum (150 → 120 Hz) that gets slightly louder as you sink faster. It's kept quiet on purpose, and it goes silent while paused. Chirps are scheduled on one persistent oscillator, so there are no new nodes per frame (a 10 s climb test created 0 nodes). |
| `setVario(on)` | Turns the vario on or off at runtime. The default is `opts.vario` (on unless `vario: false`). |
| `setOnWater(on)` | Seaplane on the water: gentle lapping, plus hull hiss that rises with `setSpeed`. It has its own bus, so it doesn't conflict with `setCharging`. Charging at the water dock works the same as on land (hum, arpeggio, one ding when full), and a mock test confirmed this. Call it every frame with the "floating" flag. |
| `setPaused(on)` | Silences the engine and charging, and ducks the music to 40%. |

**Event cues.** Call these once, on the event: `coin()`, `missionComplete()`, `crash()`, `lowBattery()`. The automatic cues can also be called directly:
`chargeComplete()`, `vehicleSwitch()`, `chillOn()`, `chillOff()`. With `autoCues: false` the setters never play cues, and you call them yourself.

**Music.** `await audio.loadMusic({ cabin, flight })` (or `[cabin, flight]`). Each value can be a URL, a `data:` URL, an `ArrayBuffer`, a
`Uint8Array` or an `AudioBuffer`. Missing or bad files don't throw. It resolves to `{ cabin: bool, flight: bool }`, and the sound effects keep working regardless. Both loops
play continuously (looped), and `setCabin` only moves their gains. If only one loads and `musicFallback` is on, that one plays in both modes.

**Volume.** `setMasterVolume(0..1)`, `setMusicVolume(0..1)`, `setSfxVolume(0..1)`, `mute(bool)`, `toggleMute()`, `isMuted()`, `resume()`, `state()`.
Everything runs through a soft limiter.

## Hookup in `src/main.mjs` (suggested; Builder decides)
```js
import { createAudio } from '../audio/sfx.js';
let audio = null, wasLow = false;
function initAudio() {               // call from the first button press / key / click handler
  if (audio) return; const ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
  audio = createAudio(ctx);
  audio.loadMusic({ cabin: 'audio/music/out/cabin_chill_loop.ogg', flight: 'audio/music/out/flight_theme_loop.ogg' });
}

// at the end of frame(dt, inp), after the sim ticks:
if (audio) {
  const v = cur(), plane = G.vehicle === 'plane', power = v.battery > 0 && !(plane && v.crashed);
  audio.setVehicle(G.vehicle);
  audio.setThrottle(!power ? 0 : plane ? v.throttle : Math.min(1, Math.abs(v.thrust) + Math.abs(v.vy) / 3));
  audio.setSpeed(plane ? v.v : Math.abs(v.v));
  audio.setCharging(v.charging, v.battery / 100);
  audio.setCabin(G.chill);
  audio.setLift(G.vehicle === 'glider' ? climbMeter : 0);   // the same signed −1..1 value the climb/sink meter shows
  audio.setOnWater(G.vehicle === 'seaplane' && v.onWater);   // field names are guesses: glider/seaplane aren't in src/ yet
  audio.setPaused(G.paused || G.panel);
  const low = v.battery < 20 && v.battery > 0; if (low && !wasLow) audio.lowBattery(); wasLow = low;
}
```
- **Crash:** in `simTick`, where `ev.startsWith('crash')`, call `audio?.crash()`.
- **Coins / missions (not built yet):** call `audio.coin()` on pickup and `audio.missionComplete()` on job completion.
- **Vehicle switch (X) and chill (Y):** nothing extra is needed. `setVehicle` and `setCabin` play the cues on the state change, so they also fire when
  chill turns off because a stick moved, or when a respawn resets chill. Don't also call `vehicleSwitch()` / `chillOn()` manually (or set `autoCues: false`).
- **Note:** `respawn()` calls `setChill(false, true)`, so leaving chill through a crash or respawn also plays `chillOff`. If that feels wrong, track it and
  pass `autoCues: false`, then fire the cues from `setChill(..)` when `!quiet`.

### Music in the single-file build (`out/PlaneGame_play.html` runs from `file://`)
Chrome/Edge block `fetch()` of local files from `file://`, so URLs only work from http (the dev server, itch.io, the PWA). For the
self-contained file, inline the OGGs. For example, with esbuild's `--loader:.ogg=binary`, `import cabinOgg from '../audio/music/out/cabin_chill_loop.ogg'`
then `audio.loadMusic({ cabin: cabinOgg, flight: flightOgg })` (a Uint8Array is accepted). Expect roughly 1–1.5 MB per loop (mono Vorbis q5, 128 s;
an estimate, not measured), or about 33% more as a data URL. Ogg Vorbis decodes in Chrome and Edge. Safari support is older and patchy, which doesn't matter for Xbox/Edge.

## Loop lengths
| Loop | Tempo / key | Length |
|---|---|---|
| `cabin_chill_loop.ogg` | 75 BPM, F major, 40 bars | 128.0 s (5,644,800 samples), seamless |
| `flight_theme_loop.ogg` | 105 BPM, D major, 56 bars | 128.0 s (5,644,800 samples), seamless |
Both are normalized to −16 LUFS (two-pass, linear) so they crossfade at matching loudness. Default music bus volume is 0.55 under the sound effects.

## Uncertain / to check
- **Nothing has been listened to.** The SFX levels, the engine character and the cue tones were designed on paper and checked only by a mock-context logic test.
  Expect a tuning pass by ear (the gains live in `updateEngine()` and `cues`).
- **Audio unlock on Xbox:** browsers only let audio start after a "user activation". Gamepad button presses may **not** count in Chrome/Edge, so
  `ctx.resume()` from a gamepad press might stay suspended until a key, click or tap. Check this on the console. A WebView2 host can allow autoplay.
- The music renders, render time and real loudness numbers are all still pending (see `music/MAC_JOBS.md`).
