// node stills.mjs <name>  -> stills/<name>.png  (one headless Chrome per still, closed right after)
import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import path from 'path';
const SCENES = {
  '01_flying_hud': `pg.respawn(0,'plane'); pg.set({grounded:false, agl:170, speed:52, throttle:0.6, heading:2.3, pitch:0.02}); pg.step(90,{roll:0.05}); pg.set({look:{x:0.12,y:0.05}});`,
  '02_cabin_chill': `pg.respawn(0,'plane'); pg.set({grounded:false, agl:220, speed:46, throttle:0.5, heading:2.3}); pg.step(30); pg.chill(true); pg.step(120);`,
  '03_charging_station': `pg.respawn(1,'plane'); pg.set({battery:31}); pg.step(90); pg.set({look:{x:0.22,y:0.12}});`,
  '04_blimp': `pg.respawn(0,'blimp'); const b=pg.G.blimp; pg.set({x:b.pos.x-260, z:b.pos.z+180}); pg.set({agl:75, heading:5.6}); pg.step(180,{pitch:-0.8, roll:0.15}); pg.set({look:{x:0.2,y:0}});`,
  '05_controls_panel': `pg.respawn(0,'plane'); pg.set({grounded:false, agl:170, speed:52, throttle:0.6, heading:4.0}); pg.step(30); pg.press('panel');`,
  '07_mission_ring_run': `pg.resetProgress(); pg.startMission('rings'); const R = pg.missions.rings; let r = R[0], hd = -r.mesh.rotation.y; pg.set({grounded:false, x:r.x-Math.sin(hd)*60, z:r.z+Math.cos(hd)*60, y:r.y, heading:hd, speed:48, throttle:0.6}); for (let k=0;k<200&&pg.G.mission.idx===0;k++) pg.step(1);
    r = R[1]; hd = -r.mesh.rotation.y; pg.set({x:r.x-Math.sin(hd)*170, z:r.z+Math.cos(hd)*170, y:r.y+4, heading:hd, pitch:-0.02, speed:48}); pg.step(20); pg.set({look:{x:0.05,y:0.06}});`,
  '08_pause_missions': `pg.resetProgress(); pg.startMission('rings'); for (const [i, r] of pg.missions.rings.entries()) { const hd = -r.mesh.rotation.y; pg.set({grounded:false, x:r.x-Math.sin(hd)*70, z:r.z+Math.cos(hd)*70, y:r.y, heading:hd, speed:48}); for (let k=0;k<200&&pg.G.mission&&pg.G.mission.idx===i;k++) pg.step(1); }
    pg.respawn(0,'plane'); pg.set({grounded:false, agl:160, speed:48, heading:4.0, throttle:0.5}); pg.step(30); pg.toast(''); pg.menuOpen();`,
  '09_coin_pickup': `pg.resetProgress(); const L = pg.coins.list, c = L.find(x=>x.id==='r04-1') || L.find(x=>x.kind==='route'), n = L.find(x=>x.id==='r04-2') || c; const hd = Math.atan2(n.x-c.x, -(n.z-c.z));
    pg.respawn(0,'plane'); pg.set({grounded:false, x:c.x-Math.sin(hd)*60, z:c.z+Math.cos(hd)*60, y:c.y-1, heading:hd, speed:46, throttle:0.55}); for (let k=0;k<120&&!c.collected;k++) pg.step(1); pg.step(4);`,
  '10_glider_thermal': `pg.vehicle('glider'); const T = pg.world.thermals[0], g = pg.G.glider, r = new pg.THREE.Vector3(); pg.set({x:T.x-18, z:T.z, y:T.base+230, speed:12, heading:0, pitch:-0.08});
    for (let k=0;k<540;k++) { r.set(1,0,0).applyQuaternion(g.quat); pg.step(1,{roll:Math.max(-1,Math.min(1,(0.5+r.y)*2))}); } const hd = Math.atan2(r.set(0,0,-1).applyQuaternion(g.quat).x, -r.z), yaw = Math.atan2(T.x-g.pos.x, -(T.z-g.pos.z)); let dy = yaw-hd; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    pg.set({zoom:5.2, look:{x:dy/(0.9*Math.PI), y:0.12}}); /* camera outside the core, looking past the glider into the column */`,
  '11_seaplane_lagoon': `pg.vehicle('seaplane'); pg.respawn(0,'seaplane'); pg.set({battery:62}); pg.step(90); pg.set({look:{x:-0.22,y:0.1}});`,
  '06_low_battery': `pg.respawn(2,'plane'); pg.set({grounded:false, agl:140, speed:50, throttle:0.5, heading:0.6, battery:14}); pg.step(60);`,
};
const name = process.argv[2], W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720), src = process.argv[5] || 'out/PlaneGame_play.html';
if (!SCENES[name]) { console.error('scenes:', Object.keys(SCENES).join(' ')); process.exit(1); }
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', `--window-size=${W},${H}`] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.setViewport({ width: W, height: H });
  await page.goto('file://' + path.resolve(src) + `?manual=1&w=${W}&h=${H}`); await page.waitForFunction(() => window.pg && window.pg.ready, { timeout: 60000 });
  const info = await page.evaluate(`(()=>{ ${SCENES[name]} if (!${JSON.stringify(name)}.startsWith('01')) pg.toast(''); pg.render(); return pg.info(); })()`);
  await page.screenshot({ path: `stills/${name}.png` });
  console.log(name, JSON.stringify(info), errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors');
} finally { await browser.close(); }
