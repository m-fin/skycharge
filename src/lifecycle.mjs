// src/lifecycle.mjs (Flow, polish pass). Keeps SKYCHARGE calm when the app is hidden, suspended, loses focus, loses its
// controller or loses its WebGL context, and makes sure one bad frame can't stop the loop.
// Plain ES2017 on purpose (no ?. or ??) so old EdgeHTML on Xbox One parses it.
//
// Two kinds of hold:
//   sleep  (hidden, suspend, background, context): frames are skipped, the AudioContext is suspended, onSleep fires
//          (Director: call persist() there). On wake the clock re-syncs so the first frame has dt = 0, with no jump.
//   pause  (blur, pad): frames keep running; onPauseRequest(reason) fires once so the game can open the pause menu.
//          The player resumes from the menu as usual; nothing auto-resumes under them.
//
// Wiring (Director, main.mjs), replacing the bare requestAnimationFrame loop:
//   import { createLifecycle } from './lifecycle.mjs';
//   const life2 = createLifecycle({ canvas, getAudioCtx: () => audioCtx, onSleep: () => persist(),
//                                   onPauseRequest: () => { if (!G.paused) openMenu(); } });
//   if (!manual) life2.loop((dt) => frame(dt, merged()));
export function createLifecycle(opts) {
  opts = opts || {};
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const nav = opts.nav || (typeof navigator !== 'undefined' ? navigator : null);
  const canvas = opts.canvas || null;
  const now = opts.now || function () { return (win && win.performance ? win.performance : performance).now(); };
  const raf = opts.raf || function (f) { return win.requestAnimationFrame(f); };
  const log = opts.log || function (m) { try { console.log('[lifecycle] ' + m); } catch (e) { /* no console */ } };
  const cb = function (name, a) { const f = opts[name]; if (typeof f === 'function') { try { f(a); } catch (e) { log(name + ' failed: ' + (e && e.message)); } } };
  const SLEEP = { hidden: 1, suspend: 1, background: 1, context: 1 };
  const held = {};
  const offs = [];
  const stats = { frames: 0, skipped: 0, errors: 0, sleeps: 0, wakes: 0, pauseRequests: 0, contextLost: 0, contextRestored: 0 };
  let last = null, resync = true, padSeen = false, padPollAt = 0, msg = null, running = false;

  const on = function (t, ev, f, cap) { if (t && t.addEventListener) { t.addEventListener(ev, f, !!cap); offs.push(function () { t.removeEventListener(ev, f, !!cap); }); } };
  const asleep = function () { for (const k in held) if (held[k] && SLEEP[k]) return true; return false; };
  const audioCtx = function () { try { return typeof opts.getAudioCtx === 'function' ? opts.getAudioCtx() : null; } catch (e) { return null; } };

  function hold(reason) {
    if (held[reason]) return;
    const wasAsleep = asleep(); held[reason] = true; log('hold ' + reason);
    if (SLEEP[reason]) {
      if (!wasAsleep) {
        stats.sleeps++; const c = audioCtx();
        if (c && c.suspend && c.state === 'running') { try { const p = c.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
        cb('onSleep', reason);
      }
    } else { stats.pauseRequests++; cb('onPauseRequest', reason); }
  }
  function release(reason) {
    if (!held[reason]) return;
    held[reason] = false; log('release ' + reason);
    if (SLEEP[reason] && !asleep()) {
      stats.wakes++; resync = true;
      const c = audioCtx();
      if (c && c.resume && c.state !== 'running' && c.state !== 'closed') { try { const p = c.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
      cb('onWake', reason);
    }
  }

  // ---- window / tab / app
  if (doc) {
    const vis = function () { if (doc.visibilityState === 'hidden' || doc.hidden) hold('hidden'); else release('hidden'); };
    on(doc, 'visibilitychange', vis); vis();
  }
  if (win) {
    on(win, 'blur', function () { hold('blur'); });
    on(win, 'focus', function () { held.blur = false; }); // the menu stays open; focus only re-arms the next blur
    on(win, 'pagehide', function () { hold('hidden'); });
    on(win, 'pageshow', function () { release('hidden'); });
  }
  // UWP (Xbox / PC Store package): suspend/resume and background (constrained mode on console).
  const W = win && win.Windows;
  const app = W && W.UI && W.UI.WebUI && W.UI.WebUI.WebUIApplication;
  if (app && app.addEventListener) {
    on(app, 'suspending', function () { hold('suspend'); });
    on(app, 'resuming', function () { release('suspend'); });
    on(app, 'enteredbackground', function () { hold('background'); });
    on(app, 'leavingbackground', function () { release('background'); });
  }

  // ---- controller: events where they exist, plus a slow poll because EdgeHTML doesn't always fire them
  const padsConnected = function () {
    if (!nav || typeof nav.getGamepads !== 'function') return 0;
    let n = 0; const list = Array.prototype.slice.call(nav.getGamepads() || []);
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected !== false) n++;
    return n;
  };
  const checkPads = function () {
    const n = padsConnected();
    if (n > 0) { padSeen = true; held.pad = false; }
    else if (padSeen) { padSeen = false; hold('pad'); }
  };
  if (win) { on(win, 'gamepadconnected', checkPads); on(win, 'gamepaddisconnected', checkPads); }

  // ---- WebGL context loss: hold, show a calm note, recover when the browser gives the context back
  function note(text) {
    if (!doc || !doc.body) return;
    if (!text) { if (msg && msg.parentNode) msg.parentNode.removeChild(msg); msg = null; return; }
    if (!msg) {
      msg = doc.createElement('div'); msg.id = 'lifecycle-note';
      msg.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 28px;border-radius:14px;' +
        'background:rgba(20,40,60,.78);color:#fff;font:600 22px system-ui,sans-serif;z-index:60;pointer-events:none';
      doc.body.appendChild(msg);
    }
    msg.textContent = text;
  }
  if (canvas) {
    on(canvas, 'webglcontextlost', function (e) { if (e && e.preventDefault) e.preventDefault(); stats.contextLost++; hold('context'); note('Graphics paused, restoring…'); cb('onContextLost'); });
    on(canvas, 'webglcontextrestored', function () { stats.contextRestored++; note(null); release('context'); cb('onContextRestored'); });
  }

  // ---- clock + guarded frame
  function tick(t) {
    if (t == null) t = now();
    if (resync || last == null) { resync = false; last = t; return 0; }
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t; return dt;
  }
  function step(frameFn, t) {
    if (t == null) t = now();
    if (t - padPollAt > 500) { padPollAt = t; checkPads(); }
    if (asleep()) { stats.skipped++; resync = true; return false; }
    const dt = tick(t);
    try { frameFn(dt); stats.frames++; return true; }
    catch (e) {
      stats.errors++;
      if (stats.errors <= 5 || stats.errors % 300 === 0) log('frame error #' + stats.errors + ': ' + (e && (e.stack || e.message)));
      cb('onError', e); return false;
    }
  }
  function loop(frameFn) {
    if (running) return; running = true;
    const go = function (t) { if (!running) return; step(frameFn, t); raf(go); }; // re-arm no matter what step did
    raf(go);
  }

  return {
    loop, step, tick, hold, release, checkPads, stats,
    asleep, reasons: function () { return Object.keys(held).filter(function (k) { return held[k]; }); },
    stop: function () { running = false; },
    dispose: function () { running = false; note(null); while (offs.length) offs.pop()(); },
  };
}
