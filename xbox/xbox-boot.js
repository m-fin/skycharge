// SKYCHARGE Xbox boot diagnostics (backup EdgeHTML package). Loads before everything else as an external file.
// Shows a small status panel (top right) with WebGL info, every error, console.error/warn, and a frame / pixel check.
// Hides itself 25 s after a healthy start; stays up if anything went wrong. Press the View button twice fast... no: it is passive.
(function () {
  var W = window, lines = [], bad = false, box = null, t0 = Date.now(), DIAG = /[?&]diag=1/.test(location.search);
  W.__XBOX = /Xbox/i.test(navigator.userAgent);
  try { if (!W.__XBOX && W.Windows && Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily === 'Windows.Xbox') W.__XBOX = true; } catch (e) {}
  function paint() {
    if (!document.body) return;
    if (!box) { box = document.createElement('pre'); box.id = 'xbox-dbg';
      box.style.cssText = 'position:fixed;right:3%;top:5%;max-width:46%;max-height:70%;overflow:hidden;z-index:99999;color:#9f9;background:rgba(0,0,0,.82);font:13px/1.3 Consolas,monospace;white-space:pre-wrap;padding:8px;margin:0;border:1px solid #F7931A';
      document.body.appendChild(box); }
    box.style.color = bad ? '#ffb070' : '#9f9'; box.style.display = (bad || DIAG) ? '' : 'none';
    box.textContent = 'SKYCHARGE 1.0.8.2 diag\n' + lines.slice(-40).join('\n');
  }
  var seen = {};
  function log(m, isBad) { m = String(m); if (/X3571/.test(m)) { seen.pow = (seen.pow || 0) + 1; if (seen.pow > 1) return; m = 'WARN: shader pow() X3571 warnings (harmless)'; } if (isBad) bad = true; lines.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + String(m).slice(0, 400)); paint(); }
  if (W.__XBOX) try { var d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (d && d.set && d.get) Object.defineProperty(Node.prototype, 'textContent', { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { v = v == null ? '' : String(v); if (d.get.call(this) !== v) d.set.call(this, v); } });
  } catch (e) {}
  W.__boot = function (m) { log(m); };
  W.__bootErr = function (e) { log('FATAL: ' + (e && (e.stack || e.message) || e), true); };
  W.addEventListener('error', function (e) { log('ERR: ' + (e.message || e.error) + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '') + ':' + (e.colno || ''), true); });
  W.addEventListener('unhandledrejection', function (e) { log('REJECT: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason), true); });
  ['error', 'warn'].forEach(function (k) { var o = console[k]; console[k] = function () { try { log(k.toUpperCase() + ': ' + Array.prototype.map.call(arguments, function (a) { return typeof a === 'string' ? a : (a && a.message) || JSON.stringify(a); }).join(' '), k === 'error'); } catch (_) {} if (o) return o.apply(console, arguments); }; });
  // WebGL probe on a throwaway canvas
  function probe() {
    log('UA: ' + navigator.userAgent);
    log('href: ' + location.href + '  xbox=' + W.__XBOX + '  view ' + innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio);
    ['webgl2', 'webgl', 'experimental-webgl'].forEach(function (n) {
      try { var c = document.createElement('canvas'), g = c.getContext(n);
        if (!g) { log(n + ': null'); return; }
        var info = g.getExtension('WEBGL_debug_renderer_info'), r = info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
        log(n + ': OK ' + r + ' | ' + g.getParameter(g.VERSION) + ' | maxTex ' + g.getParameter(g.MAX_TEXTURE_SIZE) + ' | vtxTex ' + g.getParameter(g.MAX_VERTEX_TEXTURE_IMAGE_UNITS) + ' | ext ' + (g.getSupportedExtensions() || []).length);
        var lose = g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      } catch (e) { log(n + ': threw ' + e.message, true); }
    });
  }
  // frame counter + pixel check of the game canvas
  // rAF frame counter + perf monitor (JS time per frame vs frame interval). On Xbox, if it stays slow and the
  // main thread is not the bottleneck, drop the 3D render size one step (1280x720 -> 960x540 -> 768x432).
  var frames = 0, fallbacks = 0, beats = 0, raf = W.requestAnimationFrame.bind(W), pf = { n: 0, js: 0, t0: 0 }, steps = [[960, 540], [768, 432]], step = 0;
  W.__perf = '';
  W.requestAnimationFrame = function (cb) { return raf(function (t) { frames++;
    if (frames === 2 || frames === 3 || frames === 10) log('frame ' + frames);
    var s0 = performance.now(); cb(t); var s1 = performance.now();
    if (frames > 30) { if (!pf.n) pf.t0 = s0; pf.n++; pf.js += s1 - s0;
      if (pf.n === 120) { var fps = 120000 / (s1 - pf.t0), js = pf.js / 120; W.__perf = 'fps ' + fps.toFixed(1) + ' js ' + js.toFixed(1) + 'ms';
        var r = W.pg && W.pg.renderer, sz = r ? r.getSize(new W.pg.THREE.Vector2()) : null; log(W.__perf + (sz ? ' render ' + sz.x + 'x' + sz.y : '') + (W.pg && W.pg.music ? ' music ' + (W.pg.music.cabin ? 'C' : '-') + (W.pg.music.flight ? 'F' : '-') + ' ' + W.pg.music.source : ''));
        if (W.__XBOX && r && fps < 28 && step < steps.length && js < 0.7 * (1000 / fps) && !/[?&]fixed=1/.test(location.search)) { r.setSize(steps[step][0], steps[step][1], false); log('auto: render size -> ' + steps[step].join('x')); step++; }
        pf.n = 0; pf.js = 0; } }
  }); };
  setInterval(function () { beats++; var b = document.getElementById('xbox-beat'); if (!b && document.body) { b = document.createElement('div'); b.id = 'xbox-beat'; b.style.cssText = 'position:fixed;right:3%;top:2%;z-index:99999;color:#9f9;font:12px Consolas,monospace;background:rgba(0,0,0,.6);padding:1px 6px'; document.body.appendChild(b); }
    if (b) { b.style.display = (bad || DIAG) ? '' : 'none'; b.textContent = 'frames ' + frames + ' ' + W.__perf; } }, 1000);
  document.addEventListener('visibilitychange', function () { log('visibility: ' + document.visibilityState); });
  try { if (W.Windows) { var A = Windows.UI.WebUI.WebUIApplication; A.addEventListener('suspending', function () { log('SUSPENDING'); }); A.addEventListener('resuming', function () { log('resuming'); }); } } catch (e) { log('no WebUIApplication: ' + e.message); }
  function check() {
    var c = document.getElementById('c'), msg = 'frames ' + frames;
    try {
      var pg = W.pg; if (pg && pg.renderer) { var i = pg.renderer.info; msg += ' | calls ' + i.render.calls + ' tris ' + i.render.triangles + ' progs ' + (i.programs ? i.programs.length : '?') + ' | canvas ' + c.width + 'x' + c.height; }
      if (pg && pg.renderer && pg.renderer.getContext().isContextLost()) msg += ' | CONTEXT LOST';
    } catch (e) { msg += ' | check threw ' + e.message; }
    log(msg);
  }
  document.addEventListener('DOMContentLoaded', function () { paint(); probe(); });
  setTimeout(check, 3000); setTimeout(check, 8000); setTimeout(check, 15000); setTimeout(check, 22000);
  setTimeout(function () { if (!bad && box) box.style.display = 'none'; }, 25000);
})();
