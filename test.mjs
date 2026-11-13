// node test.mjs  -> headless behaviour checks against out/PlaneGame_play.html (no screenshots)
import puppeteer from 'puppeteer-core';
import path from 'path'; import fs from 'fs'; import http from 'http';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--window-size=640,360'] });
// BUG-023: on a busy box or a shared CI runner, SwiftShader page loads/reloads can pass puppeteer's 30 s default and fail the
// whole run (seen twice in Actions). Give every page 180 s for navigation and default waits; explicit timeouts still apply.
{ const np = browser.newPage.bind(browser); browser.newPage = async (...a) => { const p = await np(...a); p.setDefaultNavigationTimeout(180000); p.setDefaultTimeout(180000); return p; }; }
// GAME=/path/to/www-legacy/index.html runs the same checks against the legacy r162 Xbox bundle (round 6, the single-file music embed, is skipped there)
const GAME = process.env.GAME ? path.resolve(process.env.GAME) : path.resolve('out/PlaneGame_play.html'), LEGACY = !!process.env.GAME;
// Music rounds (6 and the weather-music part of 8) need the rendered loops in audio/music/out/, which are build output and
// not in git. Without them (fresh clone, CI) those rounds are reported as skipped instead of crashing the run.
const MUSIC = !LEGACY && fs.existsSync('audio/music/out') && fs.existsSync(GAME) && /window\.__SKYCHARGE_MUSIC=/.test(fs.readFileSync(GAME, 'utf8'));
if (!LEGACY && !MUSIC) console.log('SKIP music rounds: no audio/music/out/ or no music embedded in the build');
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.evaluateOnNewDocument(fs.readFileSync('test_audio_mock.js', 'utf8'));
  await page.goto('file://' + GAME + '?manual=1&w=640&h=360'); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r = await page.evaluate(() => {
    const out = {}, ok = (k, c, d) => (out[k] = { pass: !!c, ...d });
    const st = pg.stations; out.stations = st.map(s => `${s.name} h=${s.h.toFixed(0)} hd=${(s.hd * 57.3).toFixed(0)}`);
    // 1 takeoff from Home Field
    pg.respawn(0, 'plane'); let i = 0, info; for (; i < 1200; i++) { info = pg.step(1, { up: 1, pitch: pg.G.plane.v > 28 ? 0.6 : 0 }); if (!info.grounded && info.y - info.ground > 30) break; }
    ok('takeoff', !info.grounded && !info.crashed, { secs: (i / 60).toFixed(1), info });
    // 2 climb + level cruise 20 s no crash, never below ground
    let minAgl = 1e9; for (let k = 0; k < 1200; k++) { info = pg.step(1, { up: 0.3, pitch: k < 300 ? 0.3 : 0 }); minAgl = Math.min(minAgl, info.y - info.ground); if (info.crashed) break; }
    ok('cruise', !info.crashed && minAgl > 0, { minAgl: minAgl.toFixed(1), info });
    // 3 chill autopilot 120 s holds level, no crash
    pg.chill(true); let alts = []; for (let k = 0; k < 7200; k++) { info = pg.step(1); if (k % 600 === 0) alts.push(info.y); if (info.crashed) break; }
    ok('chill_autopilot_120s', !info.crashed && info.chill, { alts, info });
    pg.chill(false);
    // 4 dive into the ground -> crash then respawn
    pg.set({ heading: 0, pitch: -0.6, speed: 60 }); for (let k = 0; k < 1800 && !pg.info().crashed; k++) pg.step(1, {}); const crashed = pg.info().crashed; pg.step(170); info = pg.info();
    ok('crash_respawn', crashed && !info.crashed && info.grounded, { info });
    // 5 approach + gentle landing on a runway (simple glideslope controller standing in for a player) -> charging
    const s1 = st[1]; pg.respawn(1, 'plane'); const p = pg.G.plane; const back = 330; p.pos.x = s1.x - Math.sin(s1.hd) * back; p.pos.z = s1.z + Math.cos(s1.hd) * back; pg.set({ grounded: false, y: s1.h + 16, speed: 33, heading: s1.hd, pitch: 0, throttle: 0.3, battery: 40 });
    let td = null; const f = new pg.THREE.Vector3();
    for (let k = 0; k < 3600; k++) { f.set(0, 0, -1).applyQuaternion(p.quat); const agl = p.pos.y - Math.max(s1.h, pg.world.groundAt(p.pos.x, p.pos.z).h); const want = agl > 6 ? -2.2 : -0.8;
      const inp = p.grounded ? { down: 1 } : { pitch: Math.max(-1, Math.min(1, (want - p.vel.y) * 0.25 - f.y * 2)), up: p.v < 28 ? 0.5 : 0, down: p.v > 34 ? 0.5 : 0 };
      info = pg.step(1, inp); if (p.grounded && !td) td = { ...info, onRunway: !!pg.world.inStation(p.pos.x, p.pos.z) }; if (info.charging && info.speed < 1) break; if (info.crashed) break; }
    const b0 = info.battery; pg.step(120); ok('land_and_charge', td && td.onRunway && !info.crashed && pg.info().battery > b0, { td, b0, b1: pg.info().battery });
    // VSI: smoothed climb rate (EMA 0.5 s) is positive in a climb and negative in a dive
    pg.respawn(0, 'plane'); pg.set({ grounded: false, agl: 300, speed: 50, pitch: 0.25, throttle: 1 }); pg.step(60, { up: 1 }); const up = pg.climb.ms;
    pg.set({ pitch: -0.3, speed: 50 }); pg.step(60); const dn = pg.climb.ms; ok('vsi_smoothed_climb', up > 3 && dn < -3 && Math.abs(pg.climb.norm) <= 1 && /m\/s|▼|▲/.test(document.getElementById('vsi').textContent), { up, dn, hud: document.getElementById('vsi').textContent });
    // 6 empty battery -> no thrust (glide)
    pg.respawn(0, 'plane'); pg.set({ grounded: false, agl: 400, speed: 45, battery: 0, throttle: 1 }); const v0 = pg.G.plane.v; pg.step(120, { up: 1 }); ok('empty_glide', pg.info().battery === 0 && !pg.info().crashed, { v0, v1: pg.G.plane.v, info: pg.info() });
    // 7 blimp: float, ground clamp, pad charging
    pg.respawn(0, 'blimp'); pg.set({ battery: 50 }); for (let k = 0; k < 900; k++) info = pg.step(1, { down: 1 }); pg.step(120); ok('blimp_pad_charge', info.charging && pg.info().battery > 50 && info.y >= info.ground, { info: pg.info() });
    pg.set({ agl: 50 }); for (let k = 0; k < 600; k++) info = pg.step(1, { pitch: -1, roll: 0.3 }); ok('blimp_move', info.speed > 20 && info.speed < 60, { info });
    // 8 vehicle switch both ways (airborne)
    // X cycles blimp -> glider -> seaplane -> plane; a seaplane more than 50 m up hands over to an airborne plane
    pg.set({ agl: 120 }); pg.press('vehicle'); pg.press('vehicle'); pg.set({ grounded: false, agl: 120, speed: 45, heading: 0 }); pg.press('vehicle'); pg.press('vehicle'); pg.press('vehicle'); const a = pg.info(); /* seaplane -> hovering roadster -> scooter -> airborne plane */ pg.step(60); ok('switch_to_plane_air', a.vehicle === 'plane' && !a.grounded && !pg.info().crashed, { info: pg.info() }); pg.press('vehicle'); ok('switch_to_blimp', pg.info().vehicle === 'blimp', {});
    return out;
  });
  // ---- round 2: coins, missions, save/load
  const r2 = await page.evaluate(() => {
    const out = {}, ok = (k, c, d = {}) => (out[k] = { pass: !!c, ...d }); pg.resetProgress();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); ok('audio_on_first_key', !!pg.audio && window.__audio.ctx === 1); const cues0 = window.__audio.created;
    const kinds = {}; pg.coins.list.forEach((c) => (kinds[c.kind] = (kinds[c.kind] || 0) + 1)); ok('coin_layout', kinds.route > 20 && kinds.landmark >= 6 && kinds.blimp >= 8, { total: pg.coins.total, kinds });
    // fly the plane through a route coin
    const rc = pg.coins.list.find((c) => c.kind === 'route'); pg.respawn(0, 'plane'); pg.set({ grounded: false, x: rc.x, z: rc.z + 40, y: rc.y, heading: 0, speed: 45, throttle: 0.5 });
    for (let k = 0; k < 120 && !rc.collected; k++) pg.step(1); ok('plane_collects_route_coin', rc.collected && pg.progress.coins === 2 && !rc.mesh.visible, { coins: pg.progress.coins });
    // plane cannot take a blimp-only coin; blimp can
    const bc = pg.coins.list.find((c) => c.kind === 'blimp'); pg.set({ x: bc.x, z: bc.z, y: bc.y, heading: 0, speed: 45 }); pg.step(1); const planeTook = bc.collected;
    pg.respawn(0, 'blimp'); pg.set({ x: bc.x, z: bc.z + 5, y: bc.y }); pg.step(2); ok('blimp_only_coin', !planeTook && bc.collected && pg.progress.coins === 7, { coins: pg.progress.coins });
    // Ring Run, full completion: flown through each ring in order (teleported to 70 m before each ring, then real physics)
    const c0 = pg.progress.coins; const started = pg.startMission('rings'); pg.step(1); ok('ring_run_started', started === 'rings' && /Ring 1\/8/.test(pg.info().objective), { objective: pg.info().objective });
    let rhist = []; for (const [i, r] of pg.missions.rings.entries()) { const hd = -r.mesh.rotation.y; pg.set({ grounded: false, x: r.x - Math.sin(hd) * 70, z: r.z + Math.cos(hd) * 70, y: r.y, heading: hd, speed: 48, throttle: 0.6 });
      let k = 0; for (; k < 200 && pg.G.mission && pg.G.mission.idx === i; k++) pg.step(1); rhist.push(k); }
    const lr = pg.info().lastResult; ok('ring_run_complete', lr && lr.id === 'rings' && lr.state === 'done' && pg.progress.coins === c0 + 60 && pg.progress.completed.rings && pg.progress.best.rings > 0, { ticksPerRing: rhist, lr, coins: pg.progress.coins });
    // repeat pays a quarter
    pg.startMission('rings'); for (const [i, r] of pg.missions.rings.entries()) { const hd = -r.mesh.rotation.y; pg.set({ grounded: false, x: r.x - Math.sin(hd) * 70, z: r.z + Math.cos(hd) * 70, y: r.y, heading: hd, speed: 48 }); for (let k = 0; k < 200 && pg.G.mission && pg.G.mission.idx === i; k++) pg.step(1); }
    ok('repeat_reward_quarter', pg.progress.coins === c0 + 60 + 15 && pg.progress.runs.rings === 2, { coins: pg.progress.coins });
    // Delivery: fail on respawn, then complete by landing at the target
    pg.startMission('delivery'); pg.press('respawn'); const f = pg.info().lastResult; ok('delivery_fail_on_respawn', f.state === 'fail' && f.reason === 'Respawned', { f });
    pg.startMission('delivery'); const to = pg.stations[pg.missions.defs[1].to]; const p = pg.G.plane; p.pos.set(to.spawnX, to.h + 0.12 + 1.7, to.spawnZ); pg.set({ grounded: true, speed: 3, heading: to.hd }); pg.step(2);
    ok('delivery_complete', pg.info().lastResult.state === 'done' && pg.progress.completed.delivery, { lr: pg.info().lastResult });
    // Eco: charging stop at a wrong station fails it
    pg.startMission('eco'); pg.step(30); const ecoOkOnStartPad = !!pg.G.mission; pg.G.plane.grounded = false; pg.step(1); const s0 = pg.stations[0]; p.pos.set(s0.spawnX, s0.h + 1.82, s0.spawnZ); pg.set({ grounded: true, speed: 0, heading: s0.hd, battery: 80 }); pg.step(3);
    ok('eco_fail_on_pitstop', ecoOkOnStartPad && pg.info().lastResult.id === 'eco' && pg.info().lastResult.state === 'fail', { lr: pg.info().lastResult });
    // Tour (blimp): visit each stop, return to the pad
    pg.startMission('tour'); const tourOk = pg.G.mission && pg.G.mission.def.id === 'tour'; for (const w of pg.missions.tour) { pg.set({ x: w.x + 20, z: w.z, y: w.top + 30 }); pg.step(2); }
    const ts = pg.stations[pg.missions.defs[2].start]; pg.set({ x: ts.padX, z: ts.padZ, y: ts.h + 9.5 }); pg.step(3);
    ok('tour_complete', tourOk && pg.info().lastResult.id === 'tour' && pg.info().lastResult.state === 'done', { lr: pg.info().lastResult });
    // menu has the mission list
    ok('audio_cues_during_missions_no_throw', window.__audio.created > cues0 && !!pg.audio.state(), { nodesFromCues: window.__audio.created - cues0 });
    pg.menuOpen(); const items = pg.menuItems(); pg.press('pause'); ok('pause_menu_lists_missions', ['Ring Run', 'Express Delivery', 'Island Sightseeing', 'Eco Flight'].every((n) => items.some((x) => x.includes(n))) && !pg.G.paused, { items });
    pg.vehicle('plane'); pg.save(); return { out, snap: JSON.parse(JSON.stringify(pg.progress)) };
  });
  await page.reload(); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r3 = await page.evaluate((snap) => {
    const out = {}, ok = (k, c, d = {}) => (out[k] = { pass: !!c, ...d }), P = pg.progress, hidden = pg.coins.list.filter((c) => !c.mesh.visible).length;
    ok('save_load_roundtrip', JSON.stringify(P) === JSON.stringify(snap) && hidden === P.collected.length && P.collected.length > 0, { coins: P.coins, completed: P.completed, best: P.best, collected: P.collected.length, hidden, lastVehicle: P.lastVehicle });
    ok('raw_localStorage', !!localStorage.getItem('skycharge.save.v1'));
    // reset via the menu with confirmation
    pg.menuOpen(); let guard = 0;
    const selLabel = () => document.querySelector('#menulist .sel div').textContent;
    for (guard = 0; guard < 40 && !selLabel().startsWith('Reset progress'); guard++) pg.press('menuDown');
    pg.press('enter'); const confirmShown = pg.menuItems().includes('RESET ALL PROGRESS?') && pg.progress.coins > 0;
    pg.press('b'); const backKept = pg.progress.coins > 0 && !pg.menuItems().includes('RESET ALL PROGRESS?');
    for (guard = 0; guard < 40 && !selLabel().startsWith('Reset progress'); guard++) pg.press('menuDown'); pg.press('enter'); pg.press('menuDown'); const yes = selLabel(); pg.press('enter');
    ok('reset_with_confirm', confirmShown && backKept && yes.startsWith('Yes') && pg.progress.coins === 0 && !localStorage.getItem('skycharge.save.v1') && pg.coins.list.every((c) => c.mesh.visible), { yes });
    ok('audio_after_reload_waits_for_input', !pg.audio && window.__audio.ctx === 0);
    pg.press('pause'); return out;
  }, r2.snap);
  // ---- round 4: hang glider + seaplane
  await page.reload(); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r4 = await page.evaluate(() => {
    const out = {}, ok = (k, c, d = {}) => (out[k] = { pass: !!c, ...d }), w = pg.world, saved = () => JSON.parse(localStorage.getItem('skycharge.save.v1') || '{}').lastVehicle;
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); const A = pg.audio, seen = { lift: [], water: [] }, oL = A.setLift.bind(A), oW = A.setOnWater.bind(A);
    A.setLift = (x) => { seen.lift.push(x); oL(x); }; A.setOnWater = (on) => { seen.water.push(on); oW(on); };
    // X / V cycles all four and saves each one
    pg.respawn(0, 'plane'); const cyc = []; for (let k = 0; k < 6; k++) { pg.press('vehicle'); pg.frame(); cyc.push(`${pg.info().vehicle}/${saved()}/${A.state().vehicle}`); }
    // roadster + scooter use the electric-motor sound bank ('plane') plus the air-jet hiss
    ok('switch_cycles_all_6_and_saves', cyc.join() === ['blimp', 'glider', 'seaplane', 'roadster', 'scooter', 'plane'].map((v) => `${v}/${v}/${['roadster', 'scooter'].includes(v) ? 'plane' : v}`).join(), { cyc });
    localStorage.setItem('skycharge.save.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('skycharge.save.v1')), lastVehicle: 'jet' })); ok('save_rejects_unknown_vehicle', pg.reload().lastVehicle === 'plane');
    // glider in still air: find a spot with no thermal or ridge lift, fly hands-off 20 s
    pg.vehicle('glider'); const lau = pg.info(); ok('glider_spawns_on_hilltop_launch', lau.vehicle === 'glider' && Math.abs(lau.x - w.launch.x) < 20 && lau.y > w.launch.h && lau.speed > 30 && !lau.grounded, { lau, launch: w.launch });
    let sx = 0, sz = 0; for (let k = 0; k < 400; k++) { sx = -1500 + (k % 20) * 150; sz = -1500 + Math.floor(k / 20) * 150; let clear = true; for (let d = -300; d <= 300; d += 50) for (let e = -300; e <= 300; e += 50) if (w.liftAt(sx + d, 600, sz + e) !== 0 || w.heightAt(sx + d, sz + e) > 300) clear = false; if (clear) break; }
    pg.set({ x: sx, z: sz, y: 600, speed: 11.5, heading: 0, pitch: -0.08 }); pg.step(120); const y0 = pg.G.glider.pos.y; let vmin = 1e9, vmax = 0;
    for (let k = 0; k < 1200; k++) { const inf = pg.step(1); vmin = Math.min(vmin, inf.speed); vmax = Math.max(vmax, inf.speed); } const sink = (y0 - pg.G.glider.pos.y) / 20;
    ok('glider_sinks_in_still_air', sink > 0.7 && sink < 1.4 && vmin >= 28 && vmax <= 56 && !pg.info().crashed, { sink: +sink.toFixed(2), kmh: [vmin, vmax], vsi: pg.climb.ms.toFixed(2) });
    // throttle does nothing and the glider uses no battery
    const g = pg.G.glider; pg.set({ speed: 12, heading: 0, pitch: -0.08 }); const s0 = { ...g.pos }; pg.step(180, {}); const vA = g.v, dA = Math.hypot(g.pos.x - s0.x, g.pos.z - s0.z);
    pg.set({ x: s0.x, z: s0.z, y: s0.y, speed: 12, heading: 0, pitch: -0.08 }); pg.step(180, { up: 1 }); const vB = g.v, dB = Math.hypot(g.pos.x - s0.x, g.pos.z - s0.z);
    ok('glider_no_battery_no_throttle', pg.info().battery === 100 && g.throttle === 0 && Math.abs(vA - vB) < 1e-6 && Math.abs(dA - dB) < 1e-6 && /no battery/.test(document.getElementById('bat').textContent) && getComputedStyle(document.getElementById('batbar')).display === 'none', { vA, vB, bat: document.getElementById('bat').textContent });
    // inside a thermal core: circle at ~30° bank (simple bank-hold standing in for a player) -> climbs, HUD VSI positive, setLift > 0.5
    const T = w.thermals[0]; pg.set({ x: T.x - 18, z: T.z, y: T.base + 260, speed: 12, heading: 0, pitch: -0.08 }); const ty0 = g.pos.y; seen.lift.length = 0; const r = new pg.THREE.Vector3();
    const bankHold = () => { r.set(1, 0, 0).applyQuaternion(g.quat); return { roll: Math.max(-1, Math.min(1, (0.5 + r.y) * 2)), pitch: 0 }; };
    for (let k = 0; k < 1140; k++) pg.step(1, bankHold()); for (let k = 0; k < 60; k++) { pg.G.hold = bankHold(); pg.frame(1 / 60); } // last second through the real frame path (HUD + audio)
    pg.G.hold = null; const gain = g.pos.y - ty0, liftMax = Math.max(...seen.lift.slice(-120)), vsiTxt = document.getElementById('vsi').textContent;
    ok('glider_climbs_in_thermal', gain > 15 && pg.climb.ms > 0.8 && /▲/.test(vsiTxt) && liftMax > 0.5 && liftMax <= 1 && Math.hypot(g.pos.x - T.x, g.pos.z - T.z) < T.r, { gain: +gain.toFixed(1), climb: +pg.climb.ms.toFixed(2), norm: +pg.climb.norm.toFixed(2), liftMax: +liftMax.toFixed(2), vsiTxt, lift: g.lift.toFixed(2) });
    ok('glider_thermals_placed_and_visible', w.thermals.length >= 4 && w.thermals.length <= 6 && w.thermalGroup.visible && w.thermals.every((t) => t.core > 2.5 && t.core < 3.6) && w.thermals.some((t) => t.kind === 'turbine') && w.thermals.some((t) => t.kind === 'field'), { n: w.thermals.length });
    // ridge lift: somewhere on the windward (west-facing) slope of the high hills there is rising air
    let ridge = 0; for (let x = -3000; x < 3000; x += 40) for (let z = -3000; z < 3000; z += 80) { const h = w.heightAt(x, z); if (h > 230) ridge = Math.max(ridge, w.liftAt(x, h + 40, z) - (w.thermals.some((t) => Math.hypot(t.x - x, t.z - z) < 300) ? 99 : 0)); }
    ok('glider_ridge_lift_windward', ridge > 1, { ridge: +ridge.toFixed(2) });
    // a crash respawns at the launch
    pg.set({ heading: 0, pitch: -0.3, speed: 15 }); pg.G.glider.pos.y = w.heightAt(g.pos.x, g.pos.z) + 3; let cr = false; for (let k = 0; k < 600 && !cr; k++) cr = pg.step(1, { pitch: -1 }).crashed; pg.step(170);
    ok('glider_crash_respawns_at_launch', cr && !pg.info().crashed && Math.hypot(g.pos.x - w.launch.x, g.pos.z - w.launch.z) < 20, { info: pg.info() });
    // no missions / blimp coins for the glider
    const bc = pg.coins.list.find((c) => c.kind === 'blimp' && !c.collected); pg.set({ x: bc.x, z: bc.z, y: bc.y, speed: 12 }); pg.step(1); pg.press('b'); ok('glider_no_blimp_coin_no_mission', !bc.collected && !pg.G.mission, {});
    // seaplane: spawns floating at the lagoon dock and charges there
    pg.vehicle('seaplane'); const sp = pg.G.seaplane, D = w.dock; pg.set({ battery: 40 }); seen.water.length = 0; pg.step(110); for (let k = 0; k < 10; k++) pg.frame(1 / 60);
    ok('seaplane_charges_at_lagoon_dock', sp.grounded && sp.onWater && pg.info().charging && sp.battery > 45 && Math.hypot(sp.pos.x - D.x, sp.pos.z - D.z) < 25 && seen.water.every((x) => x === true), { battery: sp.battery, onWater: pg.hullOnWater() });
    // gentle water landing in open water off the dock, then float + taxi
    const hd = D.hd; pg.set({ x: D.x + Math.sin(hd) * 120, z: D.z - Math.cos(hd) * 120, y: 28, grounded: false, speed: 31, heading: hd, pitch: 0, throttle: 0.25 }); seen.water.length = 0;
    const f = new pg.THREE.Vector3(); let td = null, inf;
    for (let k = 0; k < 2400; k++) { f.set(0, 0, -1).applyQuaternion(sp.quat); const agl = sp.pos.y - 2.15, want = agl > 6 ? -2.0 : -0.8;
      const inp = sp.grounded ? { down: 1 } : { pitch: Math.max(-1, Math.min(1, (want - sp.vel.y) * 0.25 - f.y * 2)), up: sp.v < 27 ? 0.5 : 0, down: sp.v > 31 ? 0.5 : 0 };
      const vy = sp.vel.y; inf = pg.step(1, inp); if (sp.grounded && !td) td = { ...inf, sink: +vy.toFixed(2) }; if (td || inf.crashed) break; }
    pg.step(230, { down: 1 }); pg.G.hold = { down: 1 }; for (let k = 0; k < 10; k++) pg.frame(1 / 60); pg.G.hold = null; const fl = pg.info();
    pg.step(30, { up: 1 }); const t0 = { ...sp.pos }, ys = []; for (let k = 0; k < 300; k++) { pg.step(1); ys.push(sp.pos.y); }
    const moved = Math.hypot(sp.pos.x - t0.x, sp.pos.z - t0.z), bobbing = Math.max(...ys) - Math.min(...ys);
    ok('seaplane_gentle_water_landing_floats_taxis', td && !fl.crashed && fl.grounded && fl.onWater && seen.water.includes(true) && moved > 20 && !pg.info().crashed && sp.onWater && bobbing > 0.02 && bobbing < 0.6, { td, moved: +moved.toFixed(1), bobbing: +bobbing.toFixed(3), kmh: pg.info().speed });
    // take off again from the water
    let lo = false; for (let k = 0; k < 1500 && !lo; k++) { inf = pg.step(1, { up: 1, pitch: sp.v > 28 ? 0.5 : 0 }); lo = !inf.grounded && inf.y > 20; } ok('seaplane_takes_off_from_water', lo && !inf.crashed && !pg.hullOnWater(), { inf });
    // hard water hit / nose-dive -> never a crash (cozy): bounces + splashes down onto the floats wherever it is
    { const hx = sp.pos.x, hz = sp.pos.z; pg.set({ y: 20, grounded: false, speed: 50, pitch: -0.5 }); let ev = null, cr = false; for (let k = 0; k < 600 && !sp.grounded; k++) { const inf2 = pg.step(1, { pitch: -0.3 }); cr = cr || inf2.crashed; ev = inf2.lastEvent; }
      const ys = []; for (let k = 0; k < 120; k++) ys.push(pg.step(1).y); const bounced = Math.max(...ys) - Math.min(...ys);
      ok('seaplane_hard_water_hit_bounces_no_crash', !cr && ev === 'splashdown:hard' && sp.onWater && !pg.info().crashed && bounced > 0.2 && Math.hypot(sp.pos.x - hx, sp.pos.z - hz) < 400, { ev, bounced: +bounced.toFixed(2), info: pg.info() }); }
    // any ground contact (land) is a crash
    const s0p = pg.stations[0]; pg.set({ x: s0p.spawnX, z: s0p.spawnZ, y: s0p.h + 2.6, grounded: false, speed: 30, heading: s0p.hd, pitch: -0.02 }); let gc = false; for (let k = 0; k < 300 && !gc; k++) gc = pg.step(1).crashed;
    ok('seaplane_ground_contact_crashes', gc && sp.crashed && sp.crashed.why === 'terrain', {}); pg.step(170);
    // existing missions stay restricted to their vehicles
    pg.respawn(0, 'seaplane'); pg.press('b'); const noSeaMission = !pg.G.mission; ok('missions_stay_vehicle_restricted', noSeaMission && pg.missions.defs.every((d) => d.vehicle === 'plane' || d.vehicle === 'blimp'), {});
    pg.vehicle('glider'); pg.save(); A.setLift = oL; A.setOnWater = oW; return out;
  });
  await page.reload(); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r5 = await page.evaluate(() => ({ glider_restored_after_reload: { pass: pg.G.vehicle === 'glider' && pg.progress.lastVehicle === 'glider' && document.getElementById('veh').textContent.includes('GLIDER') } }));
  // ---- round 6: music loops (embedded in the single file; http loader .ogg -> .mp3; quiet fallback when decoding fails)
  const r6 = {}, ok6 = (k, c, d = {}) => (r6[k] = { pass: !!c, ...d });
  if (MUSIC) {
  { const htmlTxt = fs.readFileSync('out/PlaneGame_play.html', 'utf8'), m = htmlTxt.match(/window\.__SKYCHARGE_MUSIC=(\{.*?\});<\/script>/s), emb = m ? JSON.parse(m[1]) : null;
    const det = emb ? Object.fromEntries(Object.entries(emb).map(([k, v]) => [k, { type: v.type, file: v.file, bytes: v.bytes, b64ok: Buffer.from(v.b64, 'base64').equals(fs.readFileSync('audio/music/out/' + v.file)) }])) : null;
    ok6('music_embedded_in_build', det && ['cabin', 'flight'].every((k) => det[k] && det[k].b64ok && det[k].type === 'audio/mpeg'), { det, htmlMB: +(fs.statSync('out/PlaneGame_play.html').size / 1048576).toFixed(2) }); }
  // the mocked decoder (main page) rejects every buffer: music must be skipped quietly
  await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }))); await page.waitForFunction(() => pg.music, { timeout: 30000 });
  { const m = await page.evaluate(() => ({ music: pg.music, state: pg.audio.state().music, ok: !!pg.step(5) })); ok6('music_decode_failure_is_quiet', !m.music.cabin && !m.music.flight && !m.state.cabin && m.ok && !errs.length, m); }
  // real Chrome decoder from file:// (no mock): both embedded loops decode to exactly 128 s and start looping
  { const p2 = await browser.newPage(); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message));
    await p2.goto('file://' + path.resolve('out/PlaneGame_play.html') + '?manual=1&w=320&h=180'); await p2.waitForFunction(() => window.pg && window.pg.ready);
    const dec = await p2.evaluate(async () => { const out = {}, oc = new OfflineAudioContext(1, 1, 44100);
      for (const k of ['cabin', 'flight']) { const bin = atob(window.__SKYCHARGE_MUSIC[k].b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const b = await oc.decodeAudioData(u.buffer); out[k] = { samples: b.length, secs: b.duration, ch: b.numberOfChannels }; } return out; });
    ok6('music_buffers_decode_128s', ['cabin', 'flight'].every((k) => dec[k].samples === 5644800 && dec[k].ch === 1), { dec });
    await p2.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }))); await p2.waitForFunction(() => pg.music, { timeout: 60000 });
    const st = await p2.evaluate(() => ({ music: pg.music, loops: pg.audio.state().music, freed: !window.__SKYCHARGE_MUSIC.cabin.b64 }));
    ok6('music_plays_from_file_url', st.music.cabin && st.music.flight && /embedded audio\/mpeg/.test(st.music.source) && st.loops.cabin && st.loops.flight && st.freed && !e2.length, { st, e2 });
    await p2.close(); }
  // http (separate files, index.html, no embedded music): .ogg first; with .ogg missing (404) it falls back to .mp3
  const serve = (blockOgg) => new Promise((res) => { const srv = http.createServer((q, w) => { const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(process.cwd(), u);
      if (!f.startsWith(process.cwd()) || (blockOgg && f.endsWith('.ogg')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { w.writeHead(404); return w.end(); }
      w.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(w); });
    srv.listen(0, '127.0.0.1', () => res(srv)); });
  // the .ogg loops are local build output (git has only the MP3s): without them the ogg-first case can't run
  const HAS_OGG = ['cabin_chill_loop', 'flight_theme_loop'].every((n) => fs.existsSync(`audio/music/out/${n}.ogg`)); if (!HAS_OGG) console.log('SKIP music_http_loader_ogg_first: no .ogg loops in audio/music/out/');
  for (const [name, blockOgg, want] of [['music_http_loader_ogg_first', false, 'ogg'], ['music_http_loader_falls_back_to_mp3', true, 'mp3']].filter(([n]) => HAS_OGG || n !== 'music_http_loader_ogg_first')) {
    const srv = await serve(blockOgg), p3 = await browser.newPage(); const e3 = []; p3.on('pageerror', (e) => e3.push(e.message));
    try { await p3.goto(`http://127.0.0.1:${srv.address().port}/index.html?manual=1&w=320&h=180`); await p3.waitForFunction(() => window.pg && window.pg.ready, { timeout: 60000 });
      await p3.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }))); await p3.waitForFunction(() => pg.music, { timeout: 60000 });
      const st = await p3.evaluate(() => ({ music: pg.music, loops: pg.audio.state().music, embedded: !!window.__SKYCHARGE_MUSIC }));
      ok6(name, st.music.cabin && st.music.flight && st.music.source === want && st.loops.cabin && st.loops.flight && !st.embedded && !e3.length, { st, e3 });
    } finally { await p3.close(); srv.close(); } }
  } // MUSIC
  // ---- round 7 (1.0.7): per-vehicle interiors, roadster + sky scooter (wheels + unlimited air jets), seaplane on any water,
  // skycharger stations with cable + battery bar, Bitcoin coins, dock ring drawn over the water
  await page.reload(); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r7 = await page.evaluate(() => {
    const out = {}, ok = (k, c, d = {}) => (out[k] = { pass: !!c, ...d }), w = pg.world;
    // interiors: every vehicle has its own, blimp keeps the original room
    const ids = {}; for (const k of pg.VEHICLES.concat(['roadster', 'scooter'])) ids[k] = pg.CAB[k] && pg.CAB[k].group.uuid;
    ok('each_vehicle_has_own_interior', Object.keys(ids).length === 6 && new Set(Object.values(ids)).size === 6, { ids: Object.keys(ids) });
    const seen = {}; for (const k of ['plane', 'blimp', 'glider', 'seaplane', 'roadster', 'scooter']) { pg.respawn(0, k); pg.chill(true); pg.step(2); seen[k] = pg.G.chill && pg.CAB[k].group.visible && !Object.keys(pg.CAB).some((o) => o !== k && pg.CAB[o].group.parent.visible && pg.CAB[o].group.visible); pg.chill(false); }
    ok('cabin_view_follows_active_vehicle', Object.values(seen).every(Boolean), { seen });
    pg.respawn(0, 'glider'); pg.chill(true); pg.step(600); ok('glider_sky_drift_hands_off_60s', pg.G.chill && !pg.info().crashed && document.getElementById('chillhd').textContent.includes('SKY DRIFT'), { info: pg.info() }); pg.chill(false);
    // roadster: parked in a charging bay at the station, drives, boosts on air past the motor top speed, hovers, lands on its wheels
    pg.respawn(0, 'roadster'); const R = pg.G.roadster; pg.set({ battery: 60 }); pg.step(240); for (let k = 0; k < 4; k++) pg.frame(1 / 60);
    ok('roadster_charges_in_bay_with_cable', R.charging && R.battery > 60 && pg.fx && document.getElementById('veh').textContent.includes('ROADSTER'), { bat: R.battery });
    const x0 = R.pos.x, z0 = R.pos.z; pg.step(600, { pitch: -1 }); const top = R.v * 3.6; const boost = R.jets.rear;
    ok('roadster_drives_and_air_boosts', Math.hypot(R.pos.x - x0, R.pos.z - z0) > 200 && top > 210 && boost === 1 && R.landed, { kmh: +top.toFixed(0), boost });
    pg.set({ speed: 0 }); pg.step(120, { up: 1 }); const hv = R.hover; pg.step(180); const y1 = R.pos.y; /* settle, then hands-off hold */ pg.step(600); const hold = Math.abs(R.pos.y - y1);
    ok('roadster_hovers_unlimited_air', hv && R.hover && hold < 2 && R.pos.y - w.groundAt(R.pos.x, R.pos.z).h > 8 && R.air === Infinity && document.getElementById('thr').textContent.includes('∞'), { hold: +hold.toFixed(2), agl: +(R.pos.y - w.groundAt(R.pos.x, R.pos.z).h).toFixed(1) });
    let td = false; for (let k = 0; k < 1800 && !td; k++) td = pg.step(1, { down: 1 }).lastEvent === 'touchdown' && R.landed; ok('roadster_lands_on_wheels', td && !R.hover && !pg.info().crashed, { info: pg.info() });
    // scooter: leans into turns, wheels spin, jet puffs, hover bob, lands
    pg.respawn(2, 'scooter'); const S = pg.G.scooter; pg.step(240, { pitch: -1 }); const w0 = S.wheel; pg.step(120, { pitch: -1, roll: 1 }); const lean = S.lean, spun = Math.abs(S.wheel - w0);
    ok('scooter_leans_and_wheels_spin', lean < -0.15 && spun > 20, { lean: +lean.toFixed(2), spun: +spun.toFixed(1) });
    pg.step(90, { up: 1 }); const puffs = pg.fx.alive; const bobs = []; for (let k = 0; k < 120; k++) { pg.step(1); bobs.push(S.bob); }
    ok('scooter_hovers_with_puffs_and_bob', S.hover && puffs > 3 && Math.max(...bobs) - Math.min(...bobs) > 0.1, { puffs });
    let std = false; for (let k = 0; k < 1800 && !std; k++) std = pg.step(1, { down: 1 }).lastEvent === 'touchdown'; ok('scooter_lands_on_wheels', std && S.landed, {});
    // seaplane: land on open water far from the dock, splash + wake, float, taxi, take off again
    pg.respawn(0, 'seaplane'); const sp = pg.G.seaplane, D = w.dock; let ox = null, oz = null;
    for (let r = 600; r < 2600 && ox == null; r += 100) for (let a = 0; a < 6.28 && ox == null; a += 0.4) { const x = D.x + Math.cos(a) * r, z = D.z + Math.sin(a) * r; let clear = true; for (let d = -300; d <= 300; d += 30) if (w.heightAt(x, z - d) > -2) clear = false; if (clear) { ox = x; oz = z; } }
    pg.set({ x: ox, z: oz + 140, y: 14, grounded: false, speed: 30, heading: 0, pitch: -0.05, throttle: 0.1 }); let ev = null; for (let k = 0; k < 900 && !sp.grounded; k++) ev = pg.step(1, { pitch: sp.vel.y < -2 ? 0.3 : 0 }).lastEvent;
    const wake = (pg.step(30, { up: 0.6 }), pg.fx.alive); pg.step(300, { down: 1 }); const floating = sp.onWater && !sp.crashed;
    let lo = false; for (let k = 0; k < 1500 && !lo; k++) { const inf = pg.step(1, { up: 1, pitch: sp.v > 28 ? 0.5 : 0 }); lo = !inf.grounded && inf.y > 15; }
    ok('seaplane_lands_on_any_open_water', ev && ev.startsWith('splashdown') && Math.hypot(sp.pos.x - D.x, sp.pos.z - D.z) > 400 && floating && wake > 3 && lo, { ev, distFromDock: Math.round(Math.hypot(ox - D.x, oz - D.z)), wake });
    // stations + dock + coins
    ok('skycharger_stations_have_bays', w.stations.every((s) => s.bays && s.bays.length >= 3 && s.hoverSpawn && s.pylon) && w.stations.some((s) => s.name === 'Ridge Skycharger') && !w.stations.some((s) => /supercharger/i.test(s.name)), { names: w.stations.map((s) => s.name) });
    let ring = null; w.group.traverse((o) => { if (o.geometry && o.geometry.type === 'RingGeometry' && o.renderOrder === 2) ring = o; }); const water = w.group.children.find((o) => o.name === 'water');
    ok('dock_ring_draws_over_water', ring && ring.renderOrder > water.renderOrder && ring.material.transparent && ring.material.opacity === 1 && ring.position.y >= 0.3 && ring.parent === w.group, {});
    const c0 = pg.coins.list[0].mesh.children[0]; ok('coins_are_bitcoin_faces', Array.isArray(c0.material) && c0.material.length === 3 && c0.material[1].map && c0.material[2].map && document.querySelector('.coinrow').textContent.includes('BTC'), {});
    return out; });
  // ---- round 8 (1.0.8): always-daytime weather (cumulus fly-through, wisps, cloud shadows, shafts, showers, valley mist, breeze)
  await page.reload(); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r8 = await page.evaluate(() => {
    const out = {}, ok = (k, c, d = {}) => (out[k] = { pass: !!c, ...d }), W = pg.weather, sc = pg.G && pg.world;
    ok('weather_starts_clear_daytime_no_cycle_in_tests', W.name === 'clear' && !W.auto && ['clear', 'cloudy', 'rain', 'fog'].join() === pg.weatherNames.join(), { info: W.info() });
    const seen = {}; for (const w of pg.weatherNames) { pg.setWeather(w); pg.step(700); seen[w] = W.info(); }
    ok('weather_moods_blend_in', seen.clear.visibleClouds < seen.cloudy.visibleClouds && seen.rain.showers >= 4 && seen.fog.mist > 0.9 && seen.cloudy.wind > seen.fog.wind * 2 && seen.rain.fogFar < seen.clear.fogFar && seen.fog.fogFar < 4000, { seen });
    const g = pg.world.group.getObjectByName('terrain'), wg = W.group;
    ok('weather_layers_present_and_cheap', !!g && typeof g.material.onBeforeCompile === 'function' && ['cumulus', 'wisps', 'sunshafts', 'showers', 'rainlines', 'mist'].every((n) => wg.getObjectByName(n)) && wg.children.length <= 9, { n: wg.children.length });
    // fly through a cumulus: white-out fog while inside
    pg.setWeather('cloudy'); pg.step(300); const c = W.clouds.filter((x) => x.k > 0.9 && x.base > 300)[0]; pg.respawn(0, 'blimp'); pg.chill(true);
    const put = () => pg.set({ x: c.wx, z: c.wz, y: c.base + c.s * 0.45 }); let inside = 0; for (let i = 0; i < 90; i++) { put(); pg.step(1); } inside = W.info();
    pg.chill(false); pg.respawn(0, 'blimp'); pg.step(200); const outside = W.info();
    ok('fly_through_cumulus_whites_out', inside.inCloud > 0.6 && inside.fogFar < 1500 && outside.inCloud < 0.1, { inside, outside });
    // showers fall only under the shower clouds: under one it rains on the camera
    pg.setWeather('rain'); pg.step(400); const s0 = W.showers[0], sc0 = W.clouds.find((x) => Math.abs(x.wx - s0.x) < 1 && Math.abs(x.wz - s0.z) < 1); pg.chill(true);
    for (let i = 0; i < 120; i++) { pg.set({ x: s0.x, z: s0.z, y: Math.max(60, pg.world.heightAt(s0.x, s0.z) + 60) }); pg.step(1); } const under = W.info();
    ok('rain_shower_under_its_cloud', sc0 && sc0.shower && under.rainHere > 0.6 && W.group.getObjectByName('rainlines').visible, { under, shower: s0 });
    pg.chill(false);
    // breeze pushes the blimp a little on breezy days, not on clear ones
    const drift = (w) => { pg.setWeather(w, { instant: true }); W.set(w, { instant: true }); pg.respawn(0, 'blimp'); pg.step(60, { up: 1 }); const b = pg.G.blimp, x0 = b.pos.x, z0 = b.pos.z; pg.step(300, { up: 0.3 }); return Math.hypot(b.pos.x - x0, b.pos.z - z0); };
    const dClear = drift('clear'), dBreezy = drift('cloudy');
    ok('breezy_day_nudges_blimp', dBreezy > dClear + 2, { dClear: +dClear.toFixed(1), dBreezy: +dBreezy.toFixed(1) });
    pg.setWeather('clear');
    // world life (src/life) is wired: init ran, update runs from pg.step / frame, nothing threw
    const L0 = pg.life.stats(); pg.step(120); const L1 = pg.life.stats();
    ok('life_modules_wired', L0.initMs > 0 && L0.animals && L0.animals.cows > 50 && L0.layout.length >= 5 && typeof L1.updateMs === 'number', { initMs: L0.initMs, updateMs: L1.updateMs, cows: L0.animals.cows });
    return out;
  });
  // weather music (real decoder, embedded build only): layers load, mix while weather is on, crossfade, MP3 loop window
  const r8m = {};
  // weather layers are embedded only when audio/music/out/weather_<k>_layer.wav exist (git has just the Xbox 22 kHz copies in xbox22k/)
  const WX_MUSIC = MUSIC && /"rain":\{"type"/.test(fs.readFileSync(GAME, 'utf8')); if (MUSIC && !WX_MUSIC) console.log('SKIP weather music: no weather layers embedded in the build');
  if (WX_MUSIC) { const p4 = await browser.newPage(); const e4 = []; p4.on('pageerror', (e) => e4.push(e.message));
    await p4.goto('file://' + GAME + '?manual=1&w=320&h=180'); await p4.waitForFunction(() => window.pg && window.pg.ready);
    await p4.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }))); await p4.waitForFunction(() => pg.music && pg.music.weather, { timeout: 90000 });
    const m = await p4.evaluate(async () => { const A = pg.audio, s0 = A.state(); pg.setWeather('rain'); pg.step(2); await new Promise((r) => setTimeout(r, 300)); const s1 = A.state();
      pg.setWeather('fog'); pg.step(2); const s2 = A.state(); pg.setWeather('clear'); pg.step(2); const s3 = A.state();
      return { w: pg.music.weather, s0: { wx: s0.wx, layers: s0.layers }, rain: { wx: s1.wx, rain: s1.layers.rain.target, fog: s1.layers.fog.target, w: s1.weather }, fog: { wx: s2.wx, fog: s2.layers.fog.target, rain: s2.layers.rain.target }, clear: { wx: s3.wx, rain: s3.layers.rain.target, fog: s3.layers.fog.target } }; });
    const near = (a, b) => Math.abs(a - b) < 0.01;
    r8m.weather_music_layers_load = { pass: m.w.rain && m.w.fog && m.w.cloudy && ['rain', 'fog', 'cloudy'].every((k) => m.s0.layers[k].playing) && !e4.length, m: m.w, e4 };
    r8m.weather_music_mix_levels = { pass: near(m.rain.wx.flight, Math.pow(10, -2.5 / 20)) && near(m.rain.rain, Math.pow(10, -4 / 20)) && m.rain.fog === 0 && near(m.fog.fog, Math.pow(10, -5 / 20)) && m.fog.rain === 0 && m.rain.wx.lp < 4000 && m.rain.wx.wet > 0.1 && m.rain.wx.vol < 1, m };
    r8m.weather_music_clear_is_full_theme = { pass: near(m.clear.wx.flight, 1) && m.clear.rain === 0 && m.clear.fog === 0 && m.clear.wx.lp > 15000 && m.clear.wx.wet === 0 && m.clear.wx.vol === 1, clear: m.clear };
    await p4.close(); }
  Object.assign(r, r2.out, r3, r4, r5, r6, r7, r8, r8m);
  console.log(JSON.stringify(r, null, 1)); console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
  const checks = Object.entries(r).filter(([, v]) => v && typeof v === 'object' && 'pass' in v), failed = checks.filter(([, v]) => !v.pass).map(([k]) => k);
  console.log(`${checks.length - failed.length}/${checks.length} checks passed` + (failed.length ? ' · FAILED: ' + failed.join(', ') : ''));
  if (failed.length || errs.length) process.exitCode = 1;
} finally { await browser.close(); }
