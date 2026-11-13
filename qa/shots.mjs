// node qa/shots.mjs [game.html] -> qa/cabins/*.png (4+2 interiors) and qa/v107/*.png (vehicles, station mid-charge, dock ring, coin, seaplane water)
import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import fs from 'fs'; import path from 'path';
const game = path.resolve(process.argv[2] || 'out/PlaneGame_play.html'), only = process.argv[3] || '';
fs.mkdirSync('qa/cabins', { recursive: true }); fs.mkdirSync('qa/v107', { recursive: true }); fs.mkdirSync('qa/v108', { recursive: true });
const b = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.evaluateOnNewDocument(fs.readFileSync('test_audio_mock.js', 'utf8'));
await p.goto('file://' + game + '?manual=1&w=1280&h=720&hud=0'); await p.waitForFunction(() => window.pg && window.pg.ready, { timeout: 120000 });
const shotCam = async (name, code) => { if (only && !name.includes(only)) return; const r = await p.evaluate(code); await p.evaluate((r) => { pg.toast(); r[1] = Math.max(r[1], Math.max(0, pg.world.heightAt(r[0], r[2])) + 25); pg.shotFrom(r[0], r[1], r[2], r[3], r[4], r[5]); }, r); await p.screenshot({ path: name }); console.log(name, r[6] ?? ''); };
const shot = async (name, code) => { if (only && !name.includes(only)) return; const r = await p.evaluate(code); await p.evaluate(() => { pg.toast(); pg.render(); }); await p.screenshot({ path: name }); console.log(name, r || ''); };
// --- interiors (cabin button)
await shot('qa/cabins/plane_airliner_cabin.png', () => { pg.respawn(0, 'plane'); pg.set({ grounded: false, agl: 260, speed: 46, throttle: 0.5, heading: 2.2, pitch: 0 }); pg.step(30); pg.chill(true); pg.step(40); return pg.info().y; });
await shot('qa/cabins/blimp_cozy_cabin_unchanged.png', () => { pg.chill(false); pg.respawn(0, 'blimp'); pg.set({ agl: 120, heading: 1 }); pg.chill(true); pg.step(30); });
await shot('qa/cabins/seaplane_floatplane_cockpit.png', () => { pg.chill(false); pg.respawn(0, 'seaplane'); pg.step(30); pg.chill(true); pg.step(30); });
await shot('qa/cabins/glider_harness_view.png', () => { pg.chill(false); pg.respawn(0, 'glider'); pg.step(60); pg.chill(true); pg.step(60); });
await shot('qa/cabins/roadster_cockpit.png', () => { pg.chill(false); pg.respawn(0, 'roadster'); pg.step(200, { pitch: -0.6 }); pg.chill(true); pg.step(10); });
await shot('qa/cabins/scooter_handlebar_view.png', () => { pg.chill(false); pg.respawn(2, 'scooter'); pg.step(150, { pitch: -1 }); pg.step(40, { pitch: -1, roll: 0.5 }); pg.chill(true); pg.step(5); });
// --- vehicles + world
await shotCam('qa/v107/station_mid_charge_roadster.png', () => { pg.chill(false); pg.respawn(0, 'roadster'); pg.set({ battery: 35 }); pg.step(100); const R = pg.G.roadster, b = R.chargeAt, dx = R.pos.x - b.ax, dz = R.pos.z - b.az, L = Math.hypot(dx, dz), nx = dx / L, nz = dz / L;
  return [R.pos.x + nx * 5 - nz * 7, R.pos.y + 2.4, R.pos.z + nz * 5 + nx * 7, (R.pos.x + b.ax) / 2, R.pos.y + 0.4, (R.pos.z + b.az) / 2, R.charging]; });
await shot('qa/v107/station_overview.png', () => { pg.respawn(1, 'roadster'); pg.set({ battery: 50 }); pg.step(90); pg.set({ look: { x: -0.35, y: 0.5 }, zoom: 4.5 }); return pg.info().charging; });
await shot('qa/v107/roadster_hover_air_jets.png', () => { pg.set({ look: { x: 0, y: 0 }, zoom: 1 }); pg.respawn(3, 'roadster'); pg.step(80, { pitch: -1 }); pg.step(100, { up: 1, pitch: -0.6 }); pg.set({ look: { x: 0.32, y: -0.08 }, zoom: 0.8 }); pg.step(1, { up: 1, pitch: -0.6 }); return pg.G.roadster.hover + ' puffs ' + pg.fx.alive; });
await shot('qa/v107/scooter_lean_and_puffs.png', () => { pg.respawn(2, 'scooter'); pg.step(150, { pitch: -1 }); pg.step(40, { pitch: -1, roll: 1 }); pg.step(30, { up: 1, pitch: -1, roll: 1 }); pg.set({ look: { x: 0.25, y: 0.05 }, zoom: 0.9 }); return pg.G.scooter.lean.toFixed(2); });
await shot('qa/v107/dock_ring_over_water.png', () => { pg.respawn(0, 'seaplane'); pg.step(40); pg.set({ look: { x: -0.3, y: 0.45 }, zoom: 2.4 }); });
await shot('qa/v107/seaplane_touchdown_splash.png', () => { pg.set({ look: { x: 0, y: 0 }, zoom: 1 }); const w = pg.world, D = w.dock, s = pg.G.seaplane; pg.set({ x: D.x + Math.sin(D.hd) * 700, z: D.z - Math.cos(D.hd) * 700, y: 9, grounded: false, speed: 30, heading: D.hd + 0.3, pitch: -0.06, throttle: 0.1 });
  let k = 0; for (; k < 600 && !s.grounded; k++) pg.step(1, { pitch: s.vel.y < -2 ? 0.3 : 0 }); pg.step(8); pg.set({ look: { x: 0.35, y: 0.08 } }); return pg.info().lastEvent; });
await shot('qa/v107/seaplane_floating_wake.png', () => { pg.step(150, { up: 0.5 }); pg.set({ look: { x: 0.8, y: 0.15 } }); return pg.fx.alive; });
await shotCam('qa/v107/bitcoin_coin_closeup.png', () => { const c = pg.coins.list.find((x) => x.kind === 'route' && !x.collected); c.mesh.rotation.y = 0.3; c.mesh.position.y = c.y; return [c.x + 2.2, c.y + 1.2, c.z + 8.5, c.x, c.y, c.z]; });
await shotCam('qa/v107/bitcoin_coin_blimp_white.png', () => { const c = pg.coins.list.find((x) => x.kind === 'blimp' && !x.collected); c.mesh.rotation.y = -0.4; c.mesh.position.y = c.y; return [c.x - 3, c.y + 1.5, c.z + 12, c.x, c.y, c.z]; });
// ---- 1.0.8 weather (always daytime)
const wx = (w) => `pg.chill(false); pg.respawn(0, 'plane'); pg.setWeather('${w}', { instant: true }); pg.step(700); const W = pg.weather, st = pg.world.stations[0], X = st.padX, Z = st.padZ;`;
await shotCam('qa/v108/clear_cumulus_wisps_shadows.png', new Function(wx('clear') + "return [X - 300, 230, Z - 200, X + 1400, 300, Z + 700, JSON.stringify(W.info())];"));
await shotCam('qa/v108/cloudy_breezy_sun_shafts.png', new Function(wx('cloudy') + "return [X - 300, 470, Z - 400, X + 1300, 330, Z + 500, JSON.stringify(W.info())];"));
await shotCam('qa/v108/cloud_shadows_from_above.png', new Function(wx('cloudy') + "return [X, 700, Z - 900, X + 300, 0, Z + 300, JSON.stringify(W.info())];"));
await shotCam('qa/v108/rain_showers_under_dark_clouds.png', new Function(wx('rain') + "const s = W.showers[0]; return [s.x - 1100, 420, s.z - 700, s.x, 140, s.z, JSON.stringify(W.info())];"));
await shotCam('qa/v108/rain_inside_shower.png', new Function(wx('rain') + "const s = W.showers[0], g = Math.max(0, pg.world.heightAt(s.x, s.z)); pg.set({ x: s.x, z: s.z, y: g + 60 }); pg.step(90); return [s.x, g + 60, s.z, s.x + 400, g + 30, s.z + 200, JSON.stringify(W.info())];"));
await shotCam('qa/v108/fog_valley_mist.png', new Function(wx('fog') + "return [X - 200, 150, Z - 300, X + 900, 30, Z + 500, JSON.stringify(W.info())];"));
await shotCam('qa/v108/fly_through_cumulus.png', new Function(wx('cloudy') + "const c = W.clouds.filter((k) => k.k > 0.9 && k.base > 300)[0]; return [c.wx - c.s * 0.3, c.base + c.s * 0.45, c.wz, c.wx + 500, c.base + c.s * 0.3, c.wz + 80, JSON.stringify(W.info())];"));
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors'); await b.close();
