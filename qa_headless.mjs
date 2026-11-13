// node qa_headless.mjs <name> <url> [webgl1] [xboxUA] [secs]  -> QA helper: loads a page headless (SwiftShader), captures
// console errors/warnings (env NO_FROMENTRIES=1 deletes Object.fromEntries like Edge 18), page errors, failed requests, the WebGL version actually used, and rAF fps. Writes nothing.
import puppeteer from 'puppeteer-core';
const [name, url, wg1, xua, secsArg] = process.argv.slice(2); const secs = +(secsArg || 20);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
const out = { name, url, forcedWebGL1: wg1 === '1', xboxUA: xua === '1', console: [], pageErrors: [], failedRequests: [] };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  if (xua === '1') await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041');
  page.on('console', (m) => { if (['error', 'warning', 'warn', 'assert'].includes(m.type())) out.console.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.pageErrors.push(String(e.message).slice(0, 300)));
  page.on('requestfailed', (r) => out.failedRequests.push(r.url().slice(-100) + ' ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) out.failedRequests.push(r.status() + ' ' + r.url().slice(-100)); });
  await page.evaluateOnNewDocument((wg1, NOFE) => {
    window.__qa = { ctx: [], frames: 0 };
    if (window.name === '' && NOFE) { try { delete Object.fromEntries; } catch (e) {} } // emulate Edge 18 (no Object.fromEntries)
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) { window.__qa.ctx.push(type); if (wg1 && type === 'webgl2') return null; return orig.call(this, type, ...a); };
    if (wg1) { try { Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined, configurable: true }); } catch (e) {} }
    const raf = window.requestAnimationFrame.bind(window); const tick = () => { window.__qa.frames++; raf(tick); }; raf(tick);
  }, wg1 === '1', process.env.NO_FROMENTRIES === '1');
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000)); const f0 = await page.evaluate(() => window.__qa.frames); const t0 = Date.now();
  // nudge input once (audio unlock path) then let it run
  await page.keyboard.press('Shift'); await new Promise((r) => setTimeout(r, (secs - 3) * 1000));
  const f1 = await page.evaluate(() => window.__qa.frames); out.rafFps = +((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1);
  out.state = await page.evaluate(() => { const c = document.querySelector('canvas'); let gl = null; try { gl = c && (c.getContext('webgl2') || c.getContext('webgl')); } catch (e) {}
    const pg = window.pg; return { contextsRequested: [...new Set(window.__qa.ctx)], canvas: c ? c.width + 'x' + c.height : null, glVersion: gl ? gl.getParameter(gl.VERSION) : null,
      pgReady: !!(pg && pg.ready), isWebGL2: pg && pg.renderer ? pg.renderer.capabilities.isWebGL2 : undefined, drawCalls: pg && pg.renderer ? pg.renderer.info.render.calls : undefined, tris: pg && pg.renderer ? pg.renderer.info.render.triangles : undefined,
      xbox: !!window.__XBOX, onScreenErr: (document.getElementById('xbox-err') || {}).textContent || null, glLabel: (document.getElementById('xbox-gl-version') || {}).textContent || null, diag: ((document.getElementById('xbox-dbg') || {}).textContent || '').slice(0, 1200), music: pg && pg.music };
  });
} catch (e) { out.harnessError = String(e.message || e); }
await browser.close(); console.log(JSON.stringify(out, null, 1));
