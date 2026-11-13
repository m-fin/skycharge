// SKYCHARGE Xbox shim (added for the Xbox package; not in the original game).
// Runs before the game. Harmless in a normal browser: every step is guarded.
(function () {
  // 5) EdgeHTML 18 lacks Object.fromEntries (ES2019); the music loader needs it (BUG-001).
  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function (it) {
      var o = {};
      if (it == null) throw new TypeError('Object.fromEntries requires an iterable');
      if (typeof Symbol !== 'undefined' && typeof it[Symbol.iterator] === 'function') {
        var i = it[Symbol.iterator](), r;
        while (!(r = i.next()).done) o[r.value[0]] = r.value[1];
      } else {
        for (var k = 0; k < it.length; k++) o[it[k][0]] = it[k][1];
      }
      return o;
    };
  }
  // 6) Optional: show the WebGL version in a small bottom-left label (readable off the TV).
  //    Off by default; turn on with ?glver=1 or window.__XBOX_SHOW_GL = true before this file.
  var SHOW_GL_VERSION = !!window.__XBOX_SHOW_GL || /[?&]glver=1/.test(location.search);
  if (SHOW_GL_VERSION) {
    try {
      var origGetContext = HTMLCanvasElement.prototype.getContext, glShown = false;
      HTMLCanvasElement.prototype.getContext = function (type) {
        var ctx = origGetContext.apply(this, arguments);
        if (!glShown && ctx && /webgl/i.test(String(type))) {
          glShown = true;
          var txt = 'GL: ' + type;
          try { txt = String(ctx.getParameter(ctx.VERSION)); } catch (e) {}
          var put = function () {
            var d = document.createElement('div');
            d.id = 'xbox-gl-version';
            d.textContent = txt;
            d.style.cssText = 'position:fixed;left:6px;bottom:4px;z-index:99999;font:11px/1.2 "Segoe UI",sans-serif;color:#fff;opacity:.55;text-shadow:0 0 2px #000;pointer-events:none;';
            document.body.appendChild(d);
          };
          if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
        }
        return ctx;
      };
    } catch (e) {}
  }
  // 1) Let the game read the controller through the Gamepad API instead of the
  //    controller driving a mouse cursor (EdgeHTML / UWP JavaScript apps).
  try { if ('gamepadInputEmulation' in navigator) navigator.gamepadInputEmulation = 'gamepad'; } catch (e) {}
  var W = window.Windows;
  // 0) On the console, render the 3D view at 1280x720 and stretch it to the TV
  //    (the HUD text stays sharp). Xbox One apps get a limited share of the GPU.
  //    Open with ?w=1920&h=1080 to override.
  try {
    var onXbox = /Xbox/i.test(navigator.userAgent) || !!(W && W.System && W.System.Profile && W.System.Profile.AnalyticsInfo.versionInfo.deviceFamily === 'Windows.Xbox');
    if (onXbox && !/[?&]w=/.test(location.search)) history.replaceState(null, '', location.pathname + (location.search ? location.search + '&' : '?') + 'w=1280&h=720' + location.hash);
  } catch (e) {}
  if (W && W.UI) {
    try {
      var V = W.UI.ViewManagement;
      // 2) Lay out at the TV's real 1920x1080 (no automatic 2x scaling). The app keeps
      //    the system's TV-safe border, so the HUD corners are never cut off by overscan.
      if (V.ApplicationViewScaling && V.ApplicationViewScaling.trySetDisableLayoutScaling) V.ApplicationViewScaling.trySetDisableLayoutScaling(true);
    } catch (e) {}
    try {
      // 3) B starts missions in SKYCHARGE, so don't let it act as the system Back
      //    button (which would close the app).
      W.UI.Core.SystemNavigationManager.getForCurrentView().addEventListener('backrequested', function (e) { e.handled = true; });
    } catch (e) {}
  }
  // 4) Show load errors on screen (there is no dev console on the TV).
  window.addEventListener('error', function (e) {
    try {
      var d = document.getElementById('xbox-err') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'xbox-err' }));
      d.style.cssText = 'position:fixed;left:4%;bottom:6%;right:4%;z-index:99999;color:#F7931A;background:rgba(0,0,0,.85);font:14px monospace;white-space:pre-wrap;padding:8px';
      d.textContent += (e.message || e.error) + ' @ ' + (e.filename || '') + ':' + (e.lineno || '') + '\n';
    } catch (_) {}
  });
})();
