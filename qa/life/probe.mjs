// node qa/life/probe.mjs [r162] -> loads the harness headless, prints life stats + any page errors
import puppeteer from '/workspace/games/xbox-sideload/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname), legacy = process.argv[2] === 'r162';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, protocolTimeout: 300000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', ...(legacy ? ['--disable-webgl2', '--disable-es3-apis'] : [])] });
try { const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  await p.setViewport({ width: 640, height: 360 }); await p.goto('file://' + here + (legacy ? '/harness_r162.html' : '/harness.html') + '?w=640&h=360'); await p.waitForFunction(() => window.H && H.ready, { timeout: 120000 }).catch(() => {});
  console.log(await p.evaluate(() => { if (!window.H) return 'no H'; H.cam(0, 400, 600, 0, 0, 0); H.step(30); H.render(); return JSON.stringify({ gl: H.gl, rev: H.rev, worldMs: Math.round(H.worldMs), ...H.life.stats() }, null, 1); }));
  console.log('ERRORS:', errs.slice(0, 20).join('\n'));
} finally { await b.close(); }
