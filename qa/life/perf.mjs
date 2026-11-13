// node qa/life/perf.mjs [r162] -> per-frame cost and draw calls WITHOUT vs WITH src/life at 6 viewpoints (headless,
// SwiftShader CPU rendering, 1280x720). updateMs = world.update + life.update JS; renderMs = renderer.render + gl.finish.
import puppeteer from '/workspace/games/xbox-sideload/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import path from 'path'; import fs from 'fs';
const here = path.dirname(new URL(import.meta.url).pathname), legacy = process.argv[2] === 'r162';
const VIEWS = {
  overview_600m: `look(-1500, 600, 2600, 0, 0, 0);`,
  ridge_herd_low: `const hd = L.herds.filter(h => h.ridge)[0]; const g = at(hd.x, hd.z); look(hd.x - 80, g + 40, hd.z + 60, hd.x, g, hd.z);`,
  village_low: `const v = L.village; const g = at(v.x, v.z); look(v.x + 95, g + 48, v.z + 85, v.x, g, v.z);`,
  harbor_town: `const t = L.town; const g = at(t.x, t.z); look(t.x + 170, g + 95, t.z + 140, t.x, g + 10, t.z);`,
  open_sea_low: `const s = L.sailLoops[0]; look(s.x + s.r + 200, 60, s.z, s.x, 0, s.z);`,
  home_field: `const s = H.tq.stations[0]; look(s.padX + 150, s.h + 60, s.padZ + 150, s.padX, s.h, s.padZ);`,
};
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', ...(legacy ? ['--disable-webgl2', '--disable-es3-apis'] : [])] });
const rows = [];
try { for (const life of [0, 1]) { const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); await p.setViewport({ width: 1280, height: 720 });
    await p.goto('file://' + here + (legacy ? '/harness_r162.html' : '/harness.html') + `?w=1280&h=720&life=${life}`); await p.waitForFunction(() => window.H && H.ready, { timeout: 120000 });
    for (const [n, js] of Object.entries(VIEWS)) { const r = await p.evaluate(`(()=>{ const L = H.life.getLayout(H.tq), at = (x, z) => Math.max(0, H.tq.heightAt(x, z)), look = (...a) => H.cam(...a); ${js}
        H.step(30); H.perf(10); const r = H.perf(60, { x: 30, z: 0 }); return { ...r, gl: H.gl, initMs: H.withLife ? H.life.stats().initMs : 0 }; })()`);
      rows.push({ view: n, life, ...r }); }
    if (errs.length) console.log('ERRORS', errs); await p.close(); } }
finally { await b.close(); }
const out = []; for (const n of Object.keys(VIEWS)) { const a = rows.find((r) => r.view === n && !r.life), c = rows.find((r) => r.view === n && r.life);
  out.push({ view: n, gl: a.gl, calls: `${a.calls} -> ${c.calls} (+${c.calls - a.calls})`, tris: `${a.tris} -> ${c.tris} (+${c.tris - a.tris})`, updateMs: `${a.updateMs} -> ${c.updateMs} (+${(c.updateMs - a.updateMs).toFixed(3)})`, renderMs: `${a.renderMs} -> ${c.renderMs}` }); }
console.table(out); console.log('life init ms', rows.find((r) => r.life).initMs);
fs.writeFileSync(here + `/perf_${legacy ? 'r162_webgl1' : 'r186_webgl2'}.json`, JSON.stringify(out, null, 1));
