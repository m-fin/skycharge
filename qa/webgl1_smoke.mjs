// node qa/webgl1_smoke.mjs [index.html] -> legacy r162 bundle with WebGL2 disabled (like the Xbox): every weather + vehicle renders, no GL/shader errors
import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import path from 'path'; import fs from 'fs';
const game = path.resolve(process.argv[2] || '/workspace/games/xbox-sideload/skycharge/www-legacy/index.html');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-webgl2', '--window-size=960,540'] });
const p = await b.newPage(); await p.setViewport({ width: 960, height: 540 }); const errs = [], warn = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { const t = m.text(); if (/error|shader|WebGL|GL_/i.test(t)) warn.push(t.slice(0, 300)); });
await p.goto('file://' + game + '?manual=1&w=960&h=540'); await p.waitForFunction(() => window.pg && window.pg.ready, { timeout: 120000 });
const r = await p.evaluate(() => { const out = { gl: pg.renderer ? (pg.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1') : '?' };
  for (const w of pg.weatherNames) { pg.setWeather(w, { instant: true }); pg.step(300); pg.render(); out[w] = pg.weather.info(); }
  for (const v of ['plane', 'blimp', 'glider', 'seaplane', 'roadster', 'scooter']) { pg.respawn(0, v); pg.chill(true); pg.step(5); pg.render(); pg.chill(false); pg.step(5); pg.render(); }
  out.programs = pg.renderer ? pg.renderer.info.programs.length : -1; out.calls = pg.renderer ? pg.renderer.info.render.calls : -1; return out; });
fs.mkdirSync('qa/v108', { recursive: true }); await p.evaluate(() => { pg.respawn(0, 'plane'); pg.setWeather('cloudy', { instant: true }); pg.step(200); pg.render(); }); await p.screenshot({ path: 'qa/v108/webgl1_legacy_cloudy.png' });
console.log(JSON.stringify(r)); console.log('warnings:', warn.length ? warn.join(' | ') : 'none'); console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await b.close();
