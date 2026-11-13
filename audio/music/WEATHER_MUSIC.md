# SKYCHARGE weather music (1.0.8)

The game is always daytime; there is **no sunset layer**. Four weather moods drive the music:

| weather | layer played over the flight loop | flight loop | layer gain | music filter (low-pass) | reverb send | weather volume |
|---|---|---|---|---|---|---|
| clear ("bright clear") | none: the full flight theme | 0 dB | – | open (18 kHz) | 0 | 0 dB |
| cloudy (breezy) | `weather_cloudy_layer` | −2.5 dB | −4 dB | 9 kHz | 0.06 | 0 dB |
| rain | `weather_rain_layer` | −2.5 dB | −4 dB | 2.6 kHz (softer) | 0.16 | −1.5 dB |
| fog | `weather_fog_layer` | −2.5 dB | −5 dB | 1.7 kHz (softer) | 0.22 | −2 dB |

- The flight and layer gains come from Sonic Rift lead's mix (~−16 LUFS with the layer on).
- Changes crossfade smoothly: `setTargetAtTime` with a time constant of fade/3 and a default fade of 4 s, so about 95 % of the change happens in 4 s.
- The visuals blend over ~7 s.
- The cabin loop (`cabin_chill_loop`) bypasses the weather chain, so the cabin stays the same cozy mix in any weather.

## Signal path (audio/sfx.js)
```
flight loop ─┐
rain layer  ─┤
fog layer   ─┼─> low-pass ─┬─> dry ─────────────┬─> weather volume ─> music bus ─> master
cloudy layer┘              └─> reverb (1.9 s) ─> wet ┘
cabin loop ───────────────────────────────────────────────────────────> music bus
```
- The reverb is a small generated stereo impulse, so no file is needed.
- Every node is built once in `createAudio()`. Weather changes only schedule gain/frequency automation.

## Layer files (auto-picked up)
The layers are all optional. Whatever loads gets used, and a missing layer just means that weather uses the filter, reverb and volume on the flight loop alone.

| build | where the game looks |
|---|---|
| single file `out/PlaneGame_play.html` | embedded by build.mjs as `window.__SKYCHARGE_MUSIC.rain/fog/cloudy`. These are 96 kbps gapless MP3s encoded from the WAVs into `audio/music/out/build96k/`; the delivered files are untouched. `NO_WX_MUSIC=1` skips them. |
| served over http / Xbox package (`ms-appx:`) | `audio/music/out/weather_<rain|fog|cloudy>_layer.wav`, then `.mp3` if the WAV is missing |
| Xbox package (pack-legacy.sh) | copies `audio/music/out/xbox22k/weather_*_layer.wav`: 16-bit, 22.05 kHz, mono, exactly 2,822,400 samples = 128.000 s |

To add or replace a layer, drop the file in with the same name. No code change is needed.

## Sync and seamless looping
- All layers are 128 s, 105 BPM, in D, and sample-aligned with `flight_theme_loop`.
- Each layer source starts at the flight loop's current phase, `(now − flightStart) mod loopLength`, so it stays bar-locked however late it loads.
- **WAVs loop whole**. The 22.05 kHz versions were made by resampling a 3× periodic copy and keeping the middle third, so the wrap is seamless.
- **MP3 fallback:** an MP3 decoded without gapless trimming (EdgeHTML may keep the ~26 ms LAME padding) would click at the wrap.
  - When the decoded length isn't 128 s, sfx.js sets `loopStart`/`loopEnd` to the 128 s music window: it starts at the standard 1105-sample LAME delay, or at the measured leading silence if that is shorter.
  - The flight loop gets the same treatment, so flight and layers keep one phase.
- Chrome honours the LAME gapless header, so the MP3s decode to exactly 128 s there and loop whole.

## API
- `audio.setWeather('clear'|'cloudy'|'rain'|'fog', fade = 4)`: main.mjs calls it every frame from `syncAudio()` with the current weather. It's idempotent.
- `audio.loadWeatherLayers({ rain, fog, cloudy })`: takes URLs, ArrayBuffers or AudioBuffers and returns `{ rain: bool, ... }`.
- `audio.state().layers` / `.wx`: loaded/playing state, gain targets, loop window and filter targets, for tests.

## Memory note (Xbox)
Decoded audio is held at the AudioContext rate (usually 48 kHz float), whatever the file rate:
- each 128 s mono layer is ~24.6 MB decoded;
- the three layers plus the two loops come to ~120 MB.

If memory is tight on the console, the first thing to try is loading only the current weather's layer.
