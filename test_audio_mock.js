// Mock Web Audio for headless tests (injected before page scripts). Counts calls in window.__audio; any missing API would throw.
(() => {
  const log = window.__audio = { created: 0, ctx: 0, calls: {}, errors: 0 };
  const bump = (k) => (log.calls[k] = (log.calls[k] || 0) + 1);
  const param = (v = 0) => ({ value: v, setTargetAtTime(x) { bump('setTargetAtTime'); this.value = x; }, setValueAtTime(x) { bump('setValueAtTime'); this.value = x; },
    linearRampToValueAtTime() { bump('ramp'); }, exponentialRampToValueAtTime() { bump('ramp'); }, cancelScheduledValues() {} });
  const node = (extra = {}) => { log.created++; return { connect() { return this; }, disconnect() {}, start() { bump('start'); }, stop() {}, onended: null, ...extra }; };
  class MockAudioContext {
    constructor() { log.ctx++; this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 0; this.destination = node(); }
    resume() { this.state = 'running'; bump('resume'); return Promise.resolve(); }
    createGain() { return node({ gain: param(1) }); }
    createOscillator() { return node({ type: 'sine', frequency: param(440), detune: param(0) }); }
    createConvolver() { return node({ buffer: null, normalize: true }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBuffer(ch, len, sr) { const d = new Float32Array(len); return { length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: () => d }; }
    createBufferSource() { return node({ buffer: null, loop: false, loopStart: 0, playbackRate: param(1) }); }
    decodeAudioData(ab, ok, bad) { const e = new Error('mock: no decoder'); if (bad) bad(e); return Promise.reject(e); }
  }
  window.AudioContext = MockAudioContext; window.webkitAudioContext = MockAudioContext;
})();
