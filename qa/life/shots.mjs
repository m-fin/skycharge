// node qa/life/shots.mjs [names...] -> qa/life/<name>.png (1280x720, headless Chrome, three r186 harness)
import puppeteer from '/workspace/games/xbox-sideload/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname);
// helpers available in page: L (layout), at(x,z) ground height, look(px,py,pz, tx,ty,tz), go(frames)
const PRE = `const L = H.life.getLayout(H.tq), at = (x, z) => Math.max(0, H.tq.heightAt(x, z)); const look = (x, y, z, tx, ty, tz, p) => H.cam(x, y, z, tx, ty, tz, p); const go = (n) => H.step(n);
  const A = H.life.modules.animals.animals, W = H.life.modules.sea.sea, T = H.life.modules.traffic.traffic;`;
const SCENES = {
  cow_herd: `const hd = L.herds.filter(h => h.ridge).sort((a,b)=>b.n-a.n)[0]; const g = at(hd.x, hd.z); look(hd.x - 34, g + 13, hd.z + 30, hd.x, g + 1, hd.z); go(3); look(hd.x - 34, g + 13, hd.z + 30, hd.x, g + 1, hd.z, new H.THREE.Vector3(hd.x, g + 400, hd.z)); go(200);`,
  cow_variety: `const hs = L.herds.filter(h => h.variant === 'mixed' || h.beach != null); const hd = hs[0]; const g = at(hd.x, hd.z); look(hd.x + 22, g + 7, hd.z - 18, hd.x, g + 1, hd.z, new H.THREE.Vector3(hd.x, g + 400, hd.z)); go(160);`,
  cows_wading: `const hd = L.herds.find(h => h.beach != null); const sx = hd.x, sz = hd.z, a = hd.beach; look(sx + Math.cos(a) * 45 + Math.sin(a) * 20, 9, sz + Math.sin(a) * 45 - Math.cos(a) * 20, sx, 0.5, sz, new H.THREE.Vector3(sx, 400, sz)); go(120);`,
  golden_cow: `const c = A.secrets.find(s => s.secret === 'golden'); look(c.x + 9, c.y + 4, c.z + 7, c.x, c.y + 1, c.z, new H.THREE.Vector3(c.x, c.y + 500, c.z)); go(60);`,
  village: `const v = L.village; const g = at(v.x, v.z); look(v.x + 95, g + 48, v.z + 85, v.x, g, v.z); go(90);`,
  village_close: `const v = L.village; const g = at(v.x, v.z); look(v.x + 26, g + 9, v.z + 22, v.x, g + 2, v.z, new H.THREE.Vector3(v.x, g + 20, v.z)); go(120);`,
  people_fishing: `const p = L.town.pier, c = Math.cos(p.ang), s = Math.sin(p.ang), ex = p.x0 + c * (p.len - 4), ez = p.z0 + s * (p.len - 4); look(ex - s * 14 - c * 10, 6, ez + c * 14 - s * 10, ex, 1.5, ez, new H.THREE.Vector3(ex, 300, ez)); go(90);`,
  boats: `const T2 = L.town, p = T2.pier, c = Math.cos(p.ang), s = Math.sin(p.ang), ex = p.x0 + c * 25, ez = p.z0 + s * 25; look(ex + c * 30 - s * 34, 12, ez + s * 30 + c * 34, ex + c * 20, 1, ez + s * 20); go(90);`,
  sailboats: `const b = W.boats.find(b => b.mode === 'loop' && b.v === 0); go(1); look(b.x + 60, 22, b.z + 50, b.x, 3, b.z); go(1); const b2=b; look(b2.x + 45, 16, b2.z + 40, b2.x, 4, b2.z); H.render();`,
  whale_breach: `const sp = L.sailLoops[0]; const cx = sp.x + sp.r + 300, cz = sp.z; look(cx, 40, cz, cx + 300, 0, cz, new H.THREE.Vector3(cx, 40, cz)); H.life.triggerWhale(H.player, { x: 1, z: 0 }); const e = W.ev; const aim = () => { const w = W.whale.position; look(e.x + Math.cos(e.ry) * 75, 14, e.z - Math.sin(e.ry) * 75, w.x, w.y, w.z, H.player.clone()); }; aim(); for (let i = 0; i < 400 && W.ev && (W.ev.t < 2.3 || W.whale.position.y < 2); i++) { go(1); } aim(); go(1); aim(); H.render(); window.__dbg = { t: W.ev && W.ev.t, y: W.whale.position.y, vis: W.whale.visible, cam: H.camera.position.toArray() };`,
  dolphins: `const b = W.boats.find(b => b.mode === 'loop' && b.v === 0); H.life.triggerDolphins(H.player, b); go(60 * 2.2); look(b.x + 40, 9, b.z + 35, b.x, 1, b.z, new H.THREE.Vector3(b.x, 120, b.z)); go(20);`,
  farm_solar: `const f = L.farms[0], sn = Math.sin(f.ang), cs = Math.cos(f.ang), u = f.solarSpot.u, v = f.solarSpot.v, px = f.x + u * cs + v * sn, pz = f.z - u * sn + v * cs; const g = at(px, pz); look(px + (sn * 30 - cs * 14), g + 40, pz + (cs * 30 + sn * 14), f.x * 0.35 + px * 0.65, g, f.z * 0.35 + pz * 0.65); go(90);`,
  solar_array: `const s = L.solar; const g = at(s.x, s.z); look(s.x + 90, g + 45, s.z + 110, s.x, g, s.z); go(60);`,
  city: `const t = L.town; const g = at(t.x, t.z); look(t.x + 170, g + 95, t.z + 140, t.x, g + 10, t.z); go(60);`,
  suburb: `const sb = L.suburb; const g = at(sb.x, sb.z); look(sb.x + 120, g + 70, sb.z + 100, sb.x, g, sb.z); go(60);`,
  skies: `go(60 * 12); const c = T.craft.find(c => c.kind === 'plane'); const s = Math.sin(c.ry), k = Math.cos(c.ry); look(c.x - s * 70 + k * 30, c.y + 14, c.z - k * 70 - s * 30, c.x + s * 200, c.y - 20, c.z + k * 200); H.render();`,
  balloons: `go(60 * 5); const c = T.craft.find(c => c.kind === 'balloon'); look(c.x + 70, c.y + 8, c.z + 70, c.x, c.y, c.z); H.render();`,
  blimp: `go(60 * 5); const c = T.craft.find(c => c.kind === 'blimp'); look(c.x + 120, c.y + 20, c.z + 100, c.x, c.y, c.z); H.render();`,
  hopper: `go(60 * 5); const c = T.craft.find(c => c.kind === 'hopper'); look(c.x + 40, c.y + 10, c.z + 35, c.x, c.y, c.z); H.render();`,
  topdown: `look(0, 5200, 1, 0, 0, 0); go(10);`,
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--window-size=1280,720'] });
try { for (const n of names) { const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); await p.setViewport({ width: 1280, height: 720 });
    await p.goto('file://' + here + '/harness.html?w=1280&h=720'); await p.waitForFunction(() => window.H && H.ready, { timeout: 120000 });
    const info = await p.evaluate(`(()=>{ ${PRE} ${SCENES[n]} const r = H.render(); return { calls: r.calls, tris: r.triangles, dbg: window.__dbg }; })()`).catch((e) => ({ err: e.message }));
    await p.screenshot({ path: `${here}/${n}.png` }); console.log(n, JSON.stringify(info), errs.length ? 'ERR ' + errs.join(' | ') : ''); await p.close(); } }
finally { await b.close(); }
