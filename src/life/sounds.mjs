// Procedural animal + sea sounds with plain WebAudio nodes only (OscillatorNode, BiquadFilterNode, GainNode,
// AudioBufferSourceNode, optional StereoPannerNode), created through the ctx.createX() factories so EdgeHTML 18
// (Xbox UWP) can play them. No samples, no AudioWorklet, no node constructors.
// Wiring: setAudio(ctx[, destinationNode]) once the game's AudioContext exists; setVolume(v) follows the game's
// volume / mute. Until setAudio is called every sound call is a silent no-op.
const A = { ctx: null, out: null, vol: 0.9, noise: null, last: 0 };
export function setAudio(ctx, dest) {
  if (!ctx || A.ctx === ctx) return; A.ctx = ctx; A.out = ctx.createGain(); A.out.gain.value = A.vol; A.out.connect(dest || ctx.destination);
  const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; A.noise = n;
}
export function setVolume(v) { A.vol = Math.max(0, Math.min(1, +v || 0)); if (A.out) A.out.gain.value = A.vol; }
export const audioReady = () => !!(A.ctx && A.ctx.state === 'running');
function panNode(pan) { const c = A.ctx; if (typeof c.createStereoPanner === 'function') { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(A.out); return p; } return A.out; }

// moo: two detuned saw/triangle voices with a slow vibrato, through a moving formant (mmm -> ooo -> fade). ~1.3 s.
export function moo({ gain = 0.5, pitch = 1, pan = 0 } = {}) {
  if (!audioReady()) return false; const c = A.ctx, t = c.currentTime + 0.02, dur = 1.05 + Math.random() * 0.5, f0 = (105 + Math.random() * 25) * pitch;
  const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(gain * 0.55, t + 0.18); out.gain.setValueAtTime(gain * 0.55, t + dur * 0.65); out.gain.exponentialRampToValueAtTime(0.0001, t + dur); out.connect(panNode(pan));
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(320, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.35); lp.frequency.linearRampToValueAtTime(520, t + dur); lp.connect(out);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.setValueAtTime(420, t); bp.frequency.linearRampToValueAtTime(720, t + dur * 0.4); bp.frequency.linearRampToValueAtTime(380, t + dur); const bg = c.createGain(); bg.gain.value = 0.8; bp.connect(bg); bg.connect(out);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 4.5 + Math.random(); lg.gain.value = f0 * 0.025; lfo.connect(lg);
  for (const [type, det, g] of [['sawtooth', 1, 0.5], ['triangle', 1.006, 0.6]]) { const o = c.createOscillator(), og = c.createGain(); o.type = type; og.gain.value = g;
    o.frequency.setValueAtTime(f0 * 0.82 * det, t); o.frequency.linearRampToValueAtTime(f0 * det, t + 0.22); o.frequency.linearRampToValueAtTime(f0 * 0.78 * det, t + dur);
    lg.connect(o.frequency); o.connect(og); og.connect(lp); og.connect(bp); o.start(t); o.stop(t + dur + 0.05); }
  lfo.start(t); lfo.stop(t + dur + 0.05); return true;
}
// baa: a short bleat with a fast tremolo
export function baa({ gain = 0.35, pan = 0 } = {}) {
  if (!audioReady()) return false; const c = A.ctx, t = c.currentTime + 0.02, dur = 0.55 + Math.random() * 0.2, f0 = 300 + Math.random() * 60;
  const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(gain * 0.4, t + 0.06); out.gain.exponentialRampToValueAtTime(0.0001, t + dur); out.connect(panNode(pan));
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5; bp.connect(out);
  const trem = c.createOscillator(), tg = c.createGain(); trem.frequency.value = 22; tg.gain.value = 0.5; trem.connect(tg); const vg = c.createGain(); vg.gain.value = 0.6; tg.connect(vg.gain); vg.connect(bp);
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur); o.connect(vg); o.start(t); o.stop(t + dur + 0.05); trem.start(t); trem.stop(t + dur + 0.05); return true;
}
// splash / whale spout: filtered noise burst
export function splash({ gain = 0.5, pan = 0, dur = 1.2, freq = 900 } = {}) {
  if (!audioReady() || !A.noise) return false; const c = A.ctx, t = c.currentTime + 0.02, s = c.createBufferSource(); s.buffer = A.noise; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 2.5, t); f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * 0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(panNode(pan)); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return true;
}
// distance / bearing helpers for callers: louder when close, panned by where the source sits relative to the player's motion
export function spatial(px, pz, hx, hz, sx, sz, maxD = 160) { const dx = sx - px, dz = sz - pz, d = Math.hypot(dx, dz); const g = Math.max(0, 1 - d / maxD);
  const hl = Math.hypot(hx, hz) || 1, rx = -hz / hl, rz = hx / hl; return { gain: g * g, pan: d > 1 ? (dx * rx + dz * rz) / d : 0 }; }
// chime: three soft bell partials (secret cow found)
export function chime({ gain = 0.35 } = {}) {
  if (!audioReady()) return false; const c = A.ctx, t0 = c.currentTime + 0.02;
  [[784, 0], [988, 0.12], [1319, 0.24]].forEach(([f, dt]) => { const o = c.createOscillator(), g = c.createGain(), t = t0 + dt; o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * 0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); o.connect(g); g.connect(A.out); o.start(t); o.stop(t + 1.5); });
  return true;
}
