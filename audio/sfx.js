// SKYCHARGE audio: engine, charging, cues and music crossfade. Plain Web Audio, no sound files needed.
// Usage (ES module):
//   import { createAudio } from './audio/sfx.js';
//   const audio = createAudio(ctx);          // ctx = AudioContext made on the first button press
//   every frame: audio.setVehicle('plane'|'blimp'|'glider'|'seaplane'); audio.setLift(climb -1..1); audio.setOnWater(bool);
//                audio.setVehicle('plane'); audio.setThrottle(t); audio.setSpeed(mps);
//                audio.setCharging(on, battery01); audio.setCabin(chillOn); audio.setPaused(paused);
//   events:      audio.coin(); audio.missionComplete(); audio.crash(); audio.lowBattery();
//   music:       audio.loadMusic({ cabin: 'audio/music/cabin_chill_loop.ogg', flight: 'audio/music/flight_theme_loop.ogg' });
// The per-frame setters are idempotent and cheap: no nodes are created there, automation is only
// scheduled when a target actually changes, and one-shot cues fire only on state transitions.
// All nodes are built once in createAudio(); only short one-shot cues make (and drop) a few nodes.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

function stub() {
  const noop = () => {}, api = { ctx: null, ready: false };
  for (const k of ['setVehicle', 'setThrottle', 'setLift', 'setVario', 'setOnWater', 'setSpeed', 'setEngine', 'setCharging', 'setCabin', 'setPaused', 'setJets', 'coin',
    'missionComplete', 'vehicleSwitch', 'chargeComplete', 'chillOn', 'chillOff', 'crash', 'lowBattery', 'setMasterVolume',
    'setMusicVolume', 'setSfxVolume', 'setWeather', 'mute', 'toggleMute', 'resume', 'dispose']) api[k] = noop;
  api.loadMusic = async () => ({ cabin: false, flight: false }); api.loadWeatherLayers = async () => ({}); api.isMuted = () => false; api.state = () => ({});
  return api;
}

export function createAudio(ctx, opts = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!ctx) {
    if (!AC) return stub();
    ctx = new AC();
    // No context passed in: unlock on the first user input (browsers start contexts suspended).
    const unlock = () => { if (ctx.state !== 'running') ctx.resume(); if (ctx.state === 'running') for (const e of EVS) removeEventListener(e, unlock, true); };
    const EVS = ['pointerdown', 'keydown', 'touchstart', 'gamepadconnected'];
    for (const e of EVS) addEventListener(e, unlock, true);
  }
  const now = () => ctx.currentTime;

  // ---- glide(): setTargetAtTime only when the target changed (keeps per-frame calls cheap) ----
  const last = new Map();
  function glide(param, value, tc = 0.12, eps = 1e-3) {
    const prev = last.get(param);
    if (prev !== undefined && Math.abs(prev - value) <= eps * Math.max(1, Math.abs(value))) return;
    last.set(param, value); param.setTargetAtTime(value, now(), tc);
  }
  function setNow(param, value) { last.set(param, value); param.cancelScheduledValues(now()); param.setValueAtTime(value, now()); }
  const gain = (v = 1, dest) => { const g = ctx.createGain(); g.gain.value = v; last.set(g.gain, v); if (dest) g.connect(dest); return g; };
  const osc = (type, f, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; last.set(o.frequency, f); if (dest) o.connect(dest); o.start(); return o; };
  const biquad = (type, f, q, dest) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; last.set(b.frequency, f); if (q != null) b.Q.value = q; if (dest) b.connect(dest); return b; };

  // ---- buses: engine / charge / sfx / music -> master -> limiter -> out ----
  const out = opts.destination || ctx.destination;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  limiter.connect(out);
  const master = gain(opts.masterVolume ?? 0.8, limiter);
  const sfxBus = gain(opts.sfxVolume ?? 1, master);
  const musicBus = gain(opts.musicVolume ?? 0.55, master);
  const pauseDuck = gain(1, master);                       // engine + charging go silent while paused
  const engineVol = gain(1, pauseDuck), engineLP = biquad('lowpass', 18000, 0.5, engineVol);
  const engineBus = gain(1, engineLP);                     // cabin = muffled + quieter
  const chargeBus = gain(1, pauseDuck);

  // shared white-noise buffer (2 s, looped)
  const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = nbuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 4294967296) * 2 - 1; } }
  const noise = (dest) => { const n = ctx.createBufferSource(); n.buffer = nbuf; n.loop = true; n.loopStart = Math.random(); if (dest) n.connect(dest); n.start(0, Math.random() * 2); return n; };

  // ---- plane: electric motor whine + prop hum + prop "chop" ----
  const planeBus = gain(1, engineBus);
  const whineG = gain(0, planeBus), whineBP = biquad('bandpass', 900, 2.5, whineG);
  const whine = osc('sawtooth', 420, whineBP);
  const whine2G = gain(0, planeBus), whine2 = osc('sine', 845, whine2G);
  const propLP = biquad('lowpass', 380, 0.8, null), propG = gain(0, planeBus); propLP.connect(propG);
  const prop = osc('sawtooth', 20, propLP);
  const chopG = gain(0, planeBus), chopLP = biquad('lowpass', 900, 0.7, chopG); noise(chopLP);
  const chopLfo = osc('sine', 20, null), chopDepth = gain(0, chopG.gain); chopLfo.connect(chopDepth);

  // ---- seaplane: lower, chunkier piston/prop voice (persistent nodes, retuned on setVehicle/throttle) ----
  const seaBus = gain(0, engineBus);
  const pistLP = biquad('lowpass', 220, 1.2, null), pistG = gain(0, seaBus); pistLP.connect(pistG);
  const piston = osc('sawtooth', 60, pistLP), firing = osc('square', 120, pistLP);
  const fireG = gain(0.35, null); firing.disconnect(); firing.connect(fireG); fireG.connect(pistLP);
  const sChopG = gain(0, seaBus), sChopLP = biquad('lowpass', 650, 0.9, sChopG); noise(sChopLP);
  const sChopLfo = osc('square', 30, null), sChopDepth = gain(0, sChopG.gain); sChopLfo.connect(sChopDepth);
  const sWhineG = gain(0, seaBus), sWhine = osc('sine', 700, sWhineG);

  // ---- blimp: soft slow hum + gentle rotor whoosh + faint motor ----
  const blimpBus = gain(0, engineBus);
  const humLP = biquad('lowpass', 300, 0.6, null), humG = gain(0, blimpBus); humLP.connect(humG);
  const humA = osc('sine', 58, humLP), humB = osc('triangle', 87.3, humLP);
  const rotorG = gain(0, blimpBus), rotorLP = biquad('lowpass', 520, 0.7, rotorG); noise(rotorLP);
  const rotorLfo = osc('sine', 3, null), rotorDepth = gain(0, rotorG.gain); rotorLfo.connect(rotorDepth);
  const bMotorG = gain(0, blimpBus), bMotor = osc('triangle', 180, bMotorG);

  // ---- wind (shared, follows airspeed) ----
  const windG = gain(0, engineBus), windBP = biquad('bandpass', 500, 0.6, windG); noise(windBP);
  // ---- cold-gas air jets (roadster / sky scooter): a soft high hiss, never a rocket roar ----
  const jetG = gain(0, engineBus), jetHP = biquad('highpass', 2200, 0.7, jetG), jetLP = biquad('lowpass', 7000, 0.5, jetHP); noise(jetLP);

  // ---- charging: electric hum with buzz + rising arpeggio ----
  const chHumG = gain(0, chargeBus), chHumLP = biquad('lowpass', 900, 1, chHumG);
  const chHum = osc('sawtooth', 90, chHumLP), chHum2 = osc('sine', 180, chHumG);
  const buzzLfo = osc('sine', 6, null), buzzDepth = gain(0, chHumG.gain); buzzLfo.connect(buzzDepth);
  const arpEnv = gain(0, chargeBus), arpLP = biquad('lowpass', 3200, 0.5, arpEnv);
  const arp = osc('triangle', 523, arpLP);
  const ARP = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];      // C major pentatonic steps above C5

  // ---- vario (glider climb/sink meter): soft rising chirps when climbing, faint low hum when sinking ----
  const varioBus = gain(opts.vario === false ? 0 : 1, engineVol);   // follows the SFX slider + pause
  const chirpEnv = gain(0, varioBus), chirpLP = biquad('lowpass', 2500, 0.5, chirpEnv);
  const chirp = osc('sine', 600, chirpLP);
  const sinkG = gain(0, varioBus), sinkLP = biquad('lowpass', 260, 0.5, sinkG);
  const sink = osc('triangle', 150, sinkLP);

  // ---- water (seaplane on the water): gentle lapping + speed-dependent hull hiss. Own bus, independent of charging ----
  const waterBus = gain(0, engineVol);                     // follows the SFX slider + pause
  const lapG = gain(0.05, waterBus), lapLP = biquad('lowpass', 500, 0.7, lapG); noise(lapLP);
  const lapLfo = osc('sine', 0.35, null), lapDepth = gain(0.035, lapG.gain); lapLfo.connect(lapDepth);
  const hissG = gain(0, waterBus), hissBP = biquad('bandpass', 1400, 0.8, hissG); noise(hissBP);

  // ---- music (optional buffers) ----
  // Weather chain (1.0.8): flight loop + weather layers -> low-pass -> dry + small generated reverb -> weather volume -> music bus.
  // The cabin loop bypasses it (inside the cabin it stays the same cozy mix in any weather).
  const wxVol = gain(1, musicBus), wxDry = gain(1, wxVol), wxWet = gain(0, wxVol), wxLP = biquad('lowpass', 18000, 0.4, wxDry);
  const verb = ctx.createConvolver ? ctx.createConvolver() : null; if (verb) { const sr = ctx.sampleRate, n = Math.floor(sr * 1.9), ir = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let r = 0x2468ace + c * 977; for (let i = 0; i < n; i++) { r = (r * 1103515245 + 12345) & 0x7fffffff; d[i] = (r / 0x3fffffff - 1) * Math.pow(1 - i / n, 3.2); } }
    verb.buffer = ir; wxLP.connect(verb); verb.connect(wxWet); }
  const musCabinG = gain(0, musicBus), musFlightG = gain(0, wxLP);
  const music = { cabin: null, flight: null, srcCabin: null, srcFlight: null, flightT0: 0 };
  // weather layers: rain / fog / cloudy, 128 s and sample-aligned with the flight loop; each starts on the flight loop's phase.
  // Mix while a weather is on (Sonic Rift lead's numbers, ~-16 LUFS): flight -2.5 dB, rain/cloudy -4 dB, fog -5 dB.
  const db = (x) => Math.pow(10, x / 20);
  const WX = { clear: { lp: 18000, wet: 0, vol: 1, flight: 1, layer: null },
    cloudy: { lp: 9000, wet: 0.06, vol: 1, flight: db(-2.5), layer: 'cloudy', lg: db(-4) },
    rain: { lp: 2600, wet: 0.16, vol: db(-1.5), flight: db(-2.5), layer: 'rain', lg: db(-4) },
    fog: { lp: 1700, wet: 0.22, vol: db(-2), flight: db(-2.5), layer: 'fog', lg: db(-5) } };
  const layers = {}; // k -> { buf, g, src, loopStart, loopEnd }
  for (const k of ['rain', 'fog', 'cloudy']) layers[k] = { buf: null, enc: null, loading: null, g: gain(0, wxLP), src: null, loopStart: 0, loopEnd: 0 };

  // ---- state ----
  const st = { vehicle: null, throttle: 0, speed: 0, charging: false, level: 0, armed: false, cabin: null, paused: false,
    muted: false, volume: master.gain.value, climb: 0, vario: opts.vario !== false, varioNext: 0, onWater: false, arpNext: 0, arpStep: 0, autoCues: opts.autoCues !== false, fallback: opts.musicFallback !== false };

  function updateEngine() {
    const t = st.throttle, sp = st.speed, plane = st.vehicle !== 'blimp', glider = st.vehicle === 'glider', sea = st.vehicle === 'seaplane';
    glide(planeBus.gain, plane && !glider && !sea ? 1 : 0, 0.25); glide(seaBus.gain, sea ? 1 : 0, 0.25); glide(blimpBus.gain, plane ? 0 : 1, 0.25);
    if (sea) {
      const f = 62 + 80 * t, blade = 2 * f / 3;               // ~62 Hz idle -> ~142 Hz full; 3-cyl-ish firing, 2-blade chop
      glide(piston.frequency, f, 0.2, 2e-3); glide(firing.frequency, 2 * f, 0.2, 2e-3); glide(pistLP.frequency, 180 + 420 * t, 0.2, 2e-3);
      glide(pistG.gain, 0.10 + 0.20 * t, 0.15);
      glide(sChopLfo.frequency, blade, 0.2, 2e-3); glide(sChopG.gain, 0.04 + 0.12 * t, 0.15); glide(sChopDepth.gain, 0.04 + 0.12 * t, 0.15);
      glide(sWhine.frequency, 600 + 500 * t, 0.2, 2e-3); glide(sWhineG.gain, 0.003 + 0.008 * t, 0.15);
    } else if (plane) {
      const blade = 18 + 95 * t;
      glide(whine.frequency, 420 + 1500 * t + 4 * sp, 0.15, 2e-3); glide(whineBP.frequency, 700 + 1900 * t, 0.15, 2e-3);
      glide(whineG.gain, t > 0.005 ? 0.012 + 0.07 * t : 0.004, 0.12);
      glide(whine2.frequency, 2 * (420 + 1500 * t) * 1.006, 0.15, 2e-3); glide(whine2G.gain, 0.01 + 0.03 * t, 0.12);
      glide(prop.frequency, blade, 0.18, 2e-3); glide(propLP.frequency, 260 + 500 * t, 0.18, 2e-3); glide(propG.gain, 0.03 + 0.22 * t, 0.12);
      glide(chopLfo.frequency, blade, 0.18, 2e-3); glide(chopG.gain, 0.02 + 0.07 * t, 0.12); glide(chopDepth.gain, 0.02 + 0.07 * t, 0.12);
    } else {
      glide(humA.frequency, 58 + 10 * t, 0.4); glide(humB.frequency, 87.3 + 15 * t, 0.4); glide(humG.gain, 0.08 + 0.12 * t, 0.3);
      glide(rotorLfo.frequency, 2.5 + 7 * t, 0.4); glide(rotorG.gain, 0.015 + 0.07 * t, 0.3); glide(rotorDepth.gain, 0.012 + 0.06 * t, 0.3);
      glide(bMotor.frequency, 170 + 260 * t, 0.3); glide(bMotorG.gain, 0.004 + 0.02 * t, 0.3);
    }
    if (st.onWater) { const h = clamp(sp / 30, 0, 1); glide(hissG.gain, 0.12 * h * h, 0.2); glide(hissBP.frequency, 900 + 1400 * h, 0.25, 2e-3); }
    const w = clamp(sp / 60, 0, 1.3);
    // glider: wind is the whole soundtrack
    glide(windG.gain, (glider ? 0.05 : 0) + (glider ? 0.40 : 0.32) * w * w, 0.25);
    glide(windBP.frequency, 350 + 1100 * clamp(w, 0, 1), 0.3, 2e-3);
  }

  // ---- one-shot helpers (only used by cues, never per frame) ----
  function tone(f, t0, dur, { type = 'sine', vol = 0.2, attack = 0.005, dest = sfxBus, glideTo = null, partials = null } = {}) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); g.connect(dest);
    for (const [m, a] of partials || [[1, 1]]) {
      const o = ctx.createOscillator(), pg = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f * m, t0);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo * m, t0 + dur * 0.8);
      pg.gain.value = a; o.connect(pg); pg.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
      o.onended = () => { o.disconnect(); pg.disconnect(); g.disconnect(); };
    }
  }
  const bell = (f, t0, dur = 1.2, vol = 0.18) => tone(f, t0, dur, { vol, partials: [[1, 1], [2.01, 0.35], [3.98, 0.15], [5.43, 0.06]] });
  function whoosh(t0, dur, f0, f1, vol = 0.15) {
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = nbuf;
    bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp); bp.connect(g); g.connect(sfxBus); n.start(t0, Math.random()); n.stop(t0 + dur + 0.05);
    n.onended = () => { n.disconnect(); bp.disconnect(); g.disconnect(); };
  }

  // ---- cues ----
  const cues = {
    coin() { const t = now(); tone(mtof(83), t, 0.09, { type: 'square', vol: 0.06 }); tone(mtof(88), t + 0.07, 0.35, { type: 'square', vol: 0.06 }); bell(mtof(100), t + 0.07, 0.4, 0.04); },
    chargeComplete() { const t = now(); [72, 76, 79, 84].forEach((n, i) => bell(mtof(n), t + i * 0.09, 1.4, 0.13)); bell(mtof(96), t + 0.36, 1.8, 0.05); },
    missionComplete() {
      const t = now(); [60, 64, 67, 72].forEach((n, i) => tone(mtof(n), t + i * 0.12, 0.5, { type: 'triangle', vol: 0.12 }));
      [72, 76, 79].forEach((n) => tone(mtof(n), t + 0.5, 1.6, { type: 'triangle', vol: 0.07, attack: 0.02 }));
      tone(mtof(48), t + 0.5, 1.6, { vol: 0.15, attack: 0.02 }); bell(mtof(88), t + 0.5, 1.8, 0.08);
    },
    vehicleSwitch() { const t = now(); whoosh(t, 0.45, 300, 2500, 0.12); tone(mtof(67), t + 0.12, 0.18, { type: 'triangle', vol: 0.08 }); tone(mtof(74), t + 0.24, 0.3, { type: 'triangle', vol: 0.08 }); },
    chillOn() { const t = now(); whoosh(t, 0.7, 2200, 260, 0.06); bell(mtof(76), t + 0.05, 1.4, 0.07); bell(mtof(72), t + 0.3, 1.8, 0.07); },
    chillOff() { const t = now(); whoosh(t, 0.5, 300, 2400, 0.06); bell(mtof(72), t + 0.02, 0.9, 0.07); bell(mtof(79), t + 0.18, 1.1, 0.07); },
    crash() { const t = now(); whoosh(t, 0.9, 1200, 80, 0.3); tone(55, t, 0.8, { vol: 0.3, glideTo: 30 }); },
    lowBattery() { const t = now(); tone(mtof(81), t, 0.14, { type: 'square', vol: 0.045 }); tone(mtof(76), t + 0.18, 0.2, { type: 'square', vol: 0.045 }); },
  };

  function scheduleArp() {
    const t = now(); if (st.arpNext < t - 0.25) st.arpNext = t + 0.02;   // tab was hidden, or a fresh start
    const step = 0.24 - 0.13 * st.level, base = Math.floor(st.level * 6);
    while (st.arpNext < t + 0.12) {
      const n = 72 + ARP[Math.min(ARP.length - 1, base + (st.arpStep % 4))], t0 = st.arpNext;
      arp.frequency.setValueAtTime(mtof(n), t0);
      arpEnv.gain.setValueAtTime(0, t0); arpEnv.gain.linearRampToValueAtTime(0.05 + 0.03 * st.level, t0 + 0.01);
      arpEnv.gain.exponentialRampToValueAtTime(0.0005, t0 + step * 0.9);
      st.arpNext += step; st.arpStep++;
    }
  }

  function scheduleVario() {
    const c = st.climb, t = now();
    if (c <= 0.08) return;
    if (st.varioNext < t - 0.25) st.varioNext = t + 0.02;
    const interval = 0.65 - 0.48 * c, f0 = 520 + 520 * c, len = Math.min(0.09, interval * 0.5);
    while (st.varioNext < t + 0.12) {
      const t0 = st.varioNext;
      chirp.frequency.setValueAtTime(f0, t0); chirp.frequency.linearRampToValueAtTime(f0 * 1.12, t0 + len);
      chirpEnv.gain.setValueAtTime(0, t0); chirpEnv.gain.linearRampToValueAtTime(0.03 + 0.02 * c, t0 + 0.008);
      chirpEnv.gain.exponentialRampToValueAtTime(0.0005, t0 + len);
      st.varioNext += interval;
    }
  }

  function applyMusicMix(tc = 0.7, wtc = tc) {
    const has = { cabin: !!music.cabin, flight: !!music.flight }, cab = !!st.cabin;
    let c = cab ? 1 : 0, f = cab ? 0 : 1;
    if (st.fallback) { if (!has.cabin && has.flight) { f = 1; c = 0; } if (!has.flight && has.cabin) { c = 1; f = 0; } }
    const w = WX[st.weather] || WX.clear, lay = w.layer && layers[w.layer] && layers[w.layer].buf ? w.layer : null;
    glide(musCabinG.gain, has.cabin ? c : 0, tc); glide(musFlightG.gain, has.flight ? f * (lay ? w.flight : 1) : 0, Math.max(tc, wtc));
    for (const k in layers) glide(layers[k].g.gain, has.flight && k === lay ? f * w.lg : 0, Math.max(tc, wtc));
    // the filter / reverb / volume act on the flight loop even when that weather's layer isn't there
    glide(wxLP.frequency, w.lp, wtc, 2e-3); glide(wxWet.gain, w.wet, wtc); glide(wxVol.gain, w.vol, wtc);
  }
  // MP3 fallback: encoder padding (~26 ms) makes a click at the wrap, so loop only the 128 s of music: skip leading near-silence
  // (max 60 ms) and end exactly one flight-loop length later. WAV / gapless-trimmed buffers loop whole.
  function loopWindow(buf, want) {
    if (!want || Math.abs(buf.duration - want) < 0.002) return [0, 0];
    const d = buf.getChannelData(0), lim = Math.min(d.length, Math.floor(buf.sampleRate * 0.06)); let i = 0; while (i < lim && Math.abs(d[i]) < 1e-4) i++;
    // the standard LAME encoder delay is 1105 samples (576 + 529 decoder delay); use it when the leading silence covers it
    const extra = buf.duration - want, lame = 1105 / 44100, lead = i / buf.sampleRate, a = Math.min(Math.max(0, extra), lead >= lame ? lame : lead); return [a, a + Math.min(want, buf.duration - a)];
  }
  // BUG-021 (1.0.8.1, Director): opts.lazyLayers (Xbox) keeps each weather layer as its small encoded bytes and decodes only
  // the layer the current weather plays; the others' decoded buffers are dropped once the crossfade is over. Decoded PCM is
  // ~4x the WAV size, so this cuts resident audio from all 3 layers to at most 1 (2 during a change).
  let dropT = 0;
  const wantedLayer = () => (WX[st.weather] || WX.clear).layer || null;
  function ensureLayer(k) {
    const L = layers[k]; if (!L || L.buf || !L.enc || L.loading) return;
    L.loading = decode(L.enc).then((b) => { L.loading = null; if (b && wantedLayer() === k && !L.buf) { L.buf = b; startLayer(k); applyMusicMix(0.7, 1.5); } })
      .catch((e) => { L.loading = null; if (opts.debug) console.warn('[sfx] weather layer', k, 'decode failed:', e && e.message); });
  }
  function dropLayers() {
    const keep = wantedLayer();
    for (const k in layers) { const L = layers[k]; if (k === keep || !L.buf || !L.enc) continue;
      if (L.src) { try { L.src.stop(); } catch (e) {} L.src.disconnect(); L.src = null; } L.buf = null; }
  }
  async function encodedBytes(src) {
    // XHR first: EdgeHTML can't fetch() ms-appx package files (Flow, 1.0.8.2). fetch is only the fallback.
    if (typeof src === 'string') return await new Promise((res, rej) => { try { const x = new XMLHttpRequest(); x.open('GET', src, true); x.responseType = 'arraybuffer';
      x.onload = () => ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength ? res(x.response) : rej(new Error(x.status + ' ' + src))); x.onerror = () => rej(new Error('xhr ' + src)); x.send(); }
      catch (e) { fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status + ' ' + src)))).then(res, rej); } });
    if (ArrayBuffer.isView(src)) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
    return src;
  }
  function startLayer(k) {
    const L = layers[k]; if (!L.buf) return; if (L.src) { try { L.src.stop(); } catch (e) {} L.src.disconnect(); }
    const n = ctx.createBufferSource(); n.buffer = L.buf; n.loop = true; const fl = music.flight ? music.flightLen : (opts.loopLen || 128);
    [L.loopStart, L.loopEnd] = loopWindow(L.buf, fl); if (L.loopEnd) { n.loopStart = L.loopStart; n.loopEnd = L.loopEnd; }
    // start on the flight loop's phase so the layer is bar-locked with it (the flight loop started at music.flightT0)
    const phase = music.flight ? (ctx.currentTime - music.flightT0) % fl : 0; n.connect(L.g); n.start(0, L.loopStart + phase); L.src = n;
  }

  async function decode(src) {
    if (!src) return null;
    if (typeof AudioBuffer !== 'undefined' && src instanceof AudioBuffer) return src;
    let ab = src;
    if (ArrayBuffer.isView(src)) ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);   // e.g. esbuild binary loader
    if (typeof src === 'string') { const r = await fetch(src); if (!r.ok) throw new Error(r.status + ' ' + src); ab = await r.arrayBuffer(); }
    return await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab.slice ? ab.slice(0) : ab, res, rej); if (p && p.then) p.then(res, rej); });
  }
  function startLoop(key) {
    const s = key === 'cabin' ? 'srcCabin' : 'srcFlight'; if (music[s]) { try { music[s].stop(); } catch {} music[s].disconnect(); }
    const n = ctx.createBufferSource(); n.buffer = music[key]; n.loop = true; n.connect(key === 'cabin' ? musCabinG : musFlightG); n.start(); music[s] = n;
    if (key === 'flight') { // nominal loop 128 s: an MP3 decoded with its padding (no gapless trim, e.g. EdgeHTML) loops just the music window
      const [a, e] = loopWindow(music.flight, opts.loopLen || 128); music.flightLen = e ? e - a : music.flight.duration;
      if (e) { n.loopStart = a; n.loopEnd = e; try { n.stop(); } catch (x) {} n.disconnect(); const m = ctx.createBufferSource(); m.buffer = music.flight; m.loop = true; m.loopStart = a; m.loopEnd = e; m.connect(musFlightG); m.start(0, a); music[s] = m; }
      music.flightT0 = ctx.currentTime; for (const k in layers) if (layers[k].buf) startLayer(k); }
  }

  const api = {
    ctx, ready: true, cues,
    // --- per-frame setters (idempotent) ---
    setVehicle(kind) { kind = ['blimp', 'glider', 'seaplane'].includes(kind) ? kind : 'plane'; if (kind === st.vehicle) return; const first = st.vehicle === null; st.vehicle = kind; updateEngine(); if (!first && st.autoCues) cues.vehicleSwitch(); },
    setThrottle(t) { t = clamp(+t || 0, 0, 1); if (Math.abs(t - st.throttle) < 1e-3 && st.vehicle !== null) return; st.throttle = t; if (st.vehicle === null) st.vehicle = 'plane'; updateEngine(); },
    setSpeed(mps) { mps = Math.abs(+mps || 0); if (Math.abs(mps - st.speed) < 0.05) return; st.speed = mps; if (st.vehicle === null) st.vehicle = 'plane'; updateEngine(); },
    setEngine(vehicle, throttle, speed = st.speed) { api.setVehicle(vehicle); api.setThrottle(throttle); api.setSpeed(speed); },
    setCharging(on, level = st.level) {
      on = !!on; level = clamp(+level || 0, 0, 1);
      if (on && !st.charging) { st.armed = level < 0.995; st.arpStep = 0; st.arpNext = 0; }
      st.charging = on; st.level = level;
      glide(chHumG.gain, on ? 0.035 + 0.03 * level : 0, on ? 0.08 : 0.15); glide(buzzDepth.gain, on ? 0.012 : 0, 0.1);
      glide(chHum.frequency, 90 + 150 * level, 0.2, 2e-3); glide(chHum2.frequency, 2 * (90 + 150 * level) * 1.004, 0.2, 2e-3);
      glide(chHumLP.frequency, 500 + 1500 * level, 0.2, 2e-3); glide(buzzLfo.frequency, 5 + 9 * level, 0.2, 2e-3);
      if (on && level < 0.995) scheduleArp();
      if (on && st.armed && level >= 0.995) { st.armed = false; if (st.autoCues) cues.chargeComplete(); }
    },
    startCharging(level = st.level) { api.setCharging(true, level); },
    setChargeLevel(level) { api.setCharging(st.charging, level); },
    stopCharging() { api.setCharging(false, st.level); },
    setCabin(on) {
      on = !!on; if (on === st.cabin) return; const first = st.cabin === null; st.cabin = on;
      glide(engineLP.frequency, on ? 650 : 18000, first ? 0.01 : 0.35, 2e-3); glide(engineBus.gain, on ? 0.4 : 1, first ? 0.01 : 0.35);
      glide(windBP.Q, on ? 0.4 : 0.6, 0.3);
      applyMusicMix(first ? 0.05 : 0.7);
      if (!first && st.autoCues) (on ? cues.chillOn : cues.chillOff)();
    },
    setLift(climb) {   // signed climb rate, about -1..1 (true/false also accepted: 0.5 / 0)
      climb = climb === true ? 0.5 : climb === false ? 0 : clamp(+climb || 0, -1, 1);
      if (Math.abs(climb - st.climb) >= 0.01) st.climb = climb;
      const c = st.climb;
      glide(sinkG.gain, c < -0.15 ? 0.006 + 0.014 * Math.min(1, (-c - 0.15) / 0.85) : 0, 0.3);
      glide(sink.frequency, 160 - 40 * Math.max(0, -c), 0.3, 2e-3);
      if (st.vario && !st.paused) scheduleVario();
    },
    setJets(level) { level = clamp(+level || 0, 0, 1); if (Math.abs(level - (st.jets || 0)) < 0.01) return; st.jets = level; glide(jetG.gain, 0.09 * level, 0.08); glide(jetHP.frequency, 2600 - 900 * level, 0.15, 2e-3); },
    setVario(on) { on = !!on; if (on === st.vario) return; st.vario = on; glide(varioBus.gain, on ? 1 : 0, 0.1); },
    setOnWater(on) {
      on = !!on; if (on === st.onWater) return; st.onWater = on;
      glide(waterBus.gain, on ? 1 : 0, 0.3); if (!on) glide(hissG.gain, 0, 0.2); else { last.delete(hissG.gain); updateEngine(); }
    },
    setPaused(on) { on = !!on; if (on === st.paused) return; st.paused = on; glide(pauseDuck.gain, on ? 0 : 1, 0.08); glide(musicBus.gain, (on ? 0.4 : 1) * (st.musicVol ?? (opts.musicVolume ?? 0.55)), 0.2); },
    // --- music ---
    async loadMusic(urls = {}) {
      if (Array.isArray(urls)) urls = { cabin: urls[0], flight: urls[1] };
      const res = {};
      await Promise.all(['cabin', 'flight'].map(async (k) => {
        try { const b = await decode(urls[k]); if (b) { music[k] = b; startLoop(k); res[k] = true; } else res[k] = false; }
        catch (e) { res[k] = false; if (opts.debug) console.warn('[sfx] music', k, 'not loaded:', e && e.message); }
      }));
      if (st.cabin === null) st.cabin = false; applyMusicMix(1.0); return res;
    },
    // weather: 'clear' | 'cloudy' | 'rain' | 'fog'; crossfades over `fade` seconds (time constant fade/3)
    setWeather(name, fade = 4) { name = WX[name] ? name : 'clear'; if (name === st.weather) return; const first = st.weather == null; st.weather = name; applyMusicMix(0.7, first ? 0.05 : fade / 3);
      if (opts.lazyLayers) { const k = wantedLayer(); if (k) ensureLayer(k); clearTimeout(dropT); dropT = setTimeout(dropLayers, (fade + 1) * 1000); } },
    // optional layers, e.g. { rain: 'audio/music/out/weather_rain_layer.wav', ... }; any that load are picked up automatically
    async loadWeatherLayers(urls = {}) {
      const res = {};
      if (opts.lazyLayers) { // one at a time so peak memory stays at about one decoded layer
        for (const k of Object.keys(layers)) {
          if (!urls[k]) { res[k] = !!(layers[k].buf || layers[k].enc); continue; }
          try { const enc = await encodedBytes(urls[k]), b = await decode(enc);
            if (b) { layers[k].enc = enc; if (wantedLayer() === k) { layers[k].buf = b; startLayer(k); } res[k] = true; } else res[k] = false; }
          catch (e) { res[k] = false; if (opts.debug) console.warn('[sfx] weather layer', k, 'not loaded:', e && e.message); }
        }
        applyMusicMix(0.7, 1.5); return res;
      }
      await Promise.all(Object.keys(layers).map(async (k) => {
        if (!urls[k]) { res[k] = !!layers[k].buf; return; }
        try { const b = await decode(urls[k]); if (b) { layers[k].buf = b; startLayer(k); res[k] = true; } else res[k] = false; }
        catch (e) { res[k] = false; if (opts.debug) console.warn('[sfx] weather layer', k, 'not loaded:', e && e.message); }
      }));
      applyMusicMix(0.7, 1.5); return res;
    },
    // --- cues (call on events) ---
    coin: () => cues.coin(), missionComplete: () => cues.missionComplete(), vehicleSwitch: () => cues.vehicleSwitch(),
    chargeComplete: () => cues.chargeComplete(), chillOn: () => cues.chillOn(), chillOff: () => cues.chillOff(),
    crash: () => cues.crash(), lowBattery: () => cues.lowBattery(),
    // --- volume ---
    setMasterVolume(v) { st.volume = clamp(+v, 0, 1); if (!st.muted) glide(master.gain, st.volume, 0.05); },
    setMusicVolume(v) { st.musicVol = clamp(+v, 0, 1); glide(musicBus.gain, st.musicVol * (st.paused ? 0.4 : 1), 0.1); },
    setSfxVolume(v) { const x = clamp(+v, 0, 1); glide(sfxBus.gain, x, 0.05); glide(chargeBus.gain, x, 0.05); glide(engineVol.gain, x, 0.05); },
    mute(on = true) { st.muted = !!on; glide(master.gain, st.muted ? 0 : st.volume, 0.05); },
    toggleMute() { api.mute(!st.muted); return st.muted; }, isMuted: () => st.muted,
    resume() { return ctx.state !== 'running' ? ctx.resume() : Promise.resolve(); },
    state: () => ({ ...st, music: { cabin: !!music.cabin, flight: !!music.flight }, layers: Object.keys(layers).reduce((o, k) => { const L = layers[k]; o[k] = { loaded: !!L.buf, encoded: !!L.enc, gain: L.g.gain.value, target: last.get(L.g.gain) || 0, playing: !!L.src, loopStart: L.loopStart, loopEnd: L.loopEnd }; return o; }, {}),
      wx: { lp: last.get(wxLP.frequency), wet: last.get(wxWet.gain), vol: last.get(wxVol.gain), flight: last.get(musFlightG.gain) }, ctxState: ctx.state }),
    dispose() { try { master.disconnect(); limiter.disconnect(); } catch {} },
  };
  updateEngine();
  return api;
}
export default createAudio;
