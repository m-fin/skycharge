// SKYCHARGE (working title) — browser plane game MVP. Fixed 60 Hz sim, three.js render.
// URL params: ?seed=1  &manual=1 (no RAF loop; drive with window.pg)  &w=&h= (fixed canvas size)  &hud=0
import * as THREE from '../vendor/three.module.js';
import { createWorld } from './world.mjs';
import { createWeather, WEATHERS } from './weather.mjs';
import * as life from './life/index.mjs';
import { buildPlaneMesh, buildBlimpMesh, buildGliderMesh, buildSeaplaneMesh, newPlane, newBlimp, newGlider, newSeaplane, stepPlane, stepBlimp, stepGlider, stepSeaplane, headingOf, setPlaneAttitude, PLANE, BLIMP, GLIDER, SEAPLANE, VEHICLES, MODS, buildRoadsterMesh, buildScooterMesh, newHover, stepHover, HOVER } from './vehicles.mjs';
import { buildJetCabin, buildFloatCabin, buildBlimpGondola, buildHarnessView, buildRoadsterCockpit, buildScooterView, updateCockpit, cockpitAttitude, cockpitBarShift } from './interiors.mjs';
import { createFx } from './fx.mjs';
import { createCoins, COIN_VALUE } from './coins.mjs';
import { createMissions, fmt } from './missions.mjs';
import { load, save, clear, defaults } from './progress.mjs';
import { createAudio } from '../audio/sfx.js';
import { createInput } from './input.mjs';

const q = new URLSearchParams(location.search), seed = +(q.get('seed') || 1), manual = q.get('manual') === '1';
const FW = +q.get('w') || 0, FH = +q.get('h') || 0, DT = 1 / 60;
if (q.get('hud') === '0') document.body.classList.add('nohud'); if (manual) document.body.classList.add('manual');
const $els = {}, $ = (id) => $els[id] || ($els[id] = document.getElementById(id)); // elements are static: look each up once

// ---- renderer / scene
const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: manual });
renderer.setPixelRatio(FW ? 1 : Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfe2f2, 1600, 9000);
// Depth precision: the cabin view needs a close near plane (0.08 m), but the chase cameras sit 13 m+ behind the vehicle,
// so they use 0.5 m, 6x more depth precision at the shoreline (matters on Xbox WebGL1). Far stays past the sky dome.
const NEAR_CABIN = 0.08, NEAR_CHASE = 0.5;
const camera = new THREE.PerspectiveCamera(62, 16 / 9, NEAR_CABIN, 30000);
scene.matrixAutoUpdate = false; // the scene root never moves; lets the baked world matrices (world.mjs) skip the per-frame update
function resize() { const w = FW || innerWidth, h = FH || innerHeight; renderer.setSize(w, h, !FW); if (FW) { canvas.style.width = '100vw'; canvas.style.height = '100vh'; } camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const hemi = new THREE.HemisphereLight(0xd7e8ff, 0x5d6b40, 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d4, 2.6); sun.position.set(0.55, 0.8, 0.25).multiplyScalar(1000); scene.add(sun);

const world = createWorld(seed); scene.add(world.group);
// always-daytime weather (clear / cloudy / rain / fog). Cycles on its own every few minutes; ?weather=rain starts (and holds) one.
// Test / manual runs start clear and don't cycle, so behaviour checks stay deterministic.
const weather = createWeather({ scene, world, sun, hemi, camera, seed, start: WEATHERS.indexOf(q.get('weather')) >= 0 ? q.get('weather') : 'clear', auto: !manual });
if (WEATHERS.indexOf(q.get('weather')) >= 0) weather.held = true;
// world life (src/life, other worker): herds, villages, people, boats, whales, AI traffic. The secret callback runs only during play.
life.init(scene, life.makeTerrainQuery(world), { onSecret: (kind) => toast(kind === 'golden' ? 'You found the golden cow!' : 'A cow… on a roof?') });
const planeG = buildPlaneMesh(), blimpG = buildBlimpMesh(), gliderG = buildGliderMesh(), seaG = buildSeaplaneMesh(), roadG = buildRoadsterMesh(), scootG = buildScooterMesh();
// each vehicle has its own interior for the cabin button (the blimp keeps its cozy room from cabin.mjs)
const planeCab = buildJetCabin(), blimpCab = buildBlimpGondola(), seaCab = buildFloatCabin(), gliderCab = buildHarnessView(), roadCab = buildRoadsterCockpit(), scootCab = buildScooterView();
planeG.add(planeCab.group); blimpCab.group.position.y = -6.9; blimpCab.group.scale.setScalar(1); blimpG.add(blimpCab.group); seaG.add(seaCab.group); gliderG.add(gliderCab.group); roadG.add(roadCab.group); scootG.add(scootCab.group);
scene.add(planeG, blimpG, gliderG, seaG, roadG, scootG);
const MESH = { plane: planeG, blimp: blimpG, glider: gliderG, seaplane: seaG, roadster: roadG, scooter: scootG }, CAB = { plane: planeCab, blimp: blimpCab, seaplane: seaCab, glider: gliderCab, roadster: roadCab, scooter: scootCab };
const LABEL = { plane: '✈ E-PLANE', blimp: '🎈 BLIMP', glider: '🪂 HANG GLIDER', seaplane: '🛩 SEAPLANE', roadster: '🏎 ROADSTER', scooter: '🛵 SKY SCOOTER' };
const CHILL_TITLE = { plane: '☕ CABIN CHILL', blimp: '☕ CABIN CHILL', seaplane: '☕ COCKPIT CHILL', glider: '🪂 SKY DRIFT', roadster: '🏎 CRUISE CHILL', scooter: '🛵 CRUISE CHILL' };
// 1.0.8.2: the cockpit view is its own switch (R3 / B), separate from chill autopilot. Chill still shows the cabin.
const inCab = () => G.cockpit || G.chill;
const LOOK_CAPS = { side: 1.75, up: 0.78, down: 0.52 }; // cockpit look-around caps in rad (~100° side, 45° up, 30° down); tests read pg.lookCaps
const winged = (k = G.vehicle) => k === 'plane' || k === 'glider' || k === 'seaplane'; // these share the quaternion flight state
const hovering = (k = G.vehicle) => k === 'roadster' || k === 'scooter'; // drive on wheels, hover / fly on air jets
const fx = createFx(scene);
const burst = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xf7931a, transparent: true, opacity: 0 })); scene.add(burst);

// ---- UI helpers
let toastT = 0; function toast(msg, s = 3.2) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = s; }
// ---- audio (Sonic Rift sfx.js): AudioContext made on the first key / click / controller button press
let audio = null, wasLow = false;
// climb/sink: vertical speed smoothed with an EMA (tau 0.5 s), normalized so +5 m/s (a strong thermal) reads 1. Shared by the HUD VSI and setLift.
const CLIMB_FULL = 5, CLIMB_TAU = 0.5; // glider: GLIDER.climbFull (1.6 m/s: what circling in a strong ~3 m/s thermal core nets after the glider's own sink) reads about 1
let climbEMA = 0, climbPrevY = null, climbVeh = null;
function updateClimb(dt) {
  const v = cur(); if (climbVeh !== G.vehicle || climbPrevY == null || dt <= 0) { climbVeh = G.vehicle; climbPrevY = v.pos.y; if (dt <= 0) return; climbEMA = 0; return; }
  const vs = (v.pos.y - climbPrevY) / dt; climbPrevY = v.pos.y; if (!isFinite(vs) || Math.abs(vs) > 200) return; // ignore teleports/respawns
  climbEMA += (vs - climbEMA) * (1 - Math.exp(-dt / CLIMB_TAU));
}
const climbNorm = () => Math.max(-1, Math.min(1, climbEMA / (G.vehicle === 'glider' ? GLIDER.climbFull : CLIMB_FULL)));
// hull-on-water contact: true only while the seaplane's floats are on the water (floating / taxiing / takeoff run). Plane water contact is a crash.
const hullOnWater = () => G.vehicle === 'seaplane' && !G.seaplane.crashed && !!G.seaplane.onWater;
function initAudio() {
  // Chrome only lets a real user gesture (key, click, tap) start audio; a controller button press isn't one. If the context
  // was made on a pad press it stays 'suspended', so every later key / click / button press tries to resume it.
  if (audio) { const c = audio.ctx; if (c && c.state === 'suspended' && c.resume) c.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { const ctx = new AC(); if (ctx.resume) ctx.resume(); audio = createAudio(ctx, { autoCues: true, lazyLayers: !!window.__XBOX || /[?&]lazyaudio=1/.test(location.search) }); /* BUG-021: decode only the current weather layer on Xbox */ life.setAudio(ctx); applyAudioSettings(); } catch (e) { audio = null; return; }
  loadMusic().then((r) => { musicStatus = r; }).catch(() => { musicStatus = { cabin: false, flight: false, source: 'error' }; });
}
// Music loops (Sonic Rift, 128 s, seamless). Single-file build: build.mjs embeds them as base64 (window.__SKYCHARGE_MUSIC, MP3),
// decoded with decodeAudioData, no fetch. Served over http: try the .ogg next to the game, then the .mp3 (OGG first only where
// the browser says it can play Vorbis). Anything that fails to load or decode is skipped quietly: the game just has no music.
let musicStatus = null;
const LOOPS = { cabin: 'cabin_chill_loop', flight: 'flight_theme_loop' };
const canOgg = () => { try { return !!document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"'); } catch { return false; } };
async function loadMusic() { const r = await loadLoops(); r.weather = await loadWeatherLayers(); return r; }
// Weather layers (rain / fog / cloudy, 128 s, bar-locked with the flight loop): picked up automatically when present.
// Embedded build: window.__SKYCHARGE_MUSIC.rain etc. Served / Xbox package: weather_<k>_layer.wav (16-bit 22.05 kHz on Xbox), then .mp3.
const WX_LAYERS = ['rain', 'fog', 'cloudy'];
async function loadWeatherLayers() {
  if (!audio || typeof audio.loadWeatherLayers !== 'function') return { source: 'none' };
  const emb = window.__SKYCHARGE_MUSIC, res = { source: 'none' };
  if (emb) { const bytes = {}; for (const k of WX_LAYERS) if (emb[k] && emb[k].b64) { try { const bin = atob(emb[k].b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); bytes[k] = u; } catch (e) { /* skip */ } }
    if (Object.keys(bytes).length) { const r = await audio.loadWeatherLayers(bytes); for (const k of WX_LAYERS) { res[k] = !!r[k]; if (r[k] && emb[k]) emb[k].b64 = null; } res.source = 'embedded'; } }
  if (/^(https?|ms-appx(-web)?):/.test(location.protocol)) {
    const base = location.pathname.includes('/out/') ? '../audio/music/out/' : 'audio/music/out/';
    for (const ext of ['wav', 'mp3']) { const want = WX_LAYERS.filter((k) => !res[k]); if (!want.length) break;
      const r = await audio.loadWeatherLayers(want.reduce((o, k) => { o[k] = `${base}weather_${k}_layer.${ext}`; return o; }, {})); for (const k of want) if (r[k]) { res[k] = true; res.source = ext; } }
  }
  return res;
}
async function loadLoops() {
  if (!audio || typeof audio.loadMusic !== 'function') return { cabin: false, flight: false, source: 'none' };
  const emb = window.__SKYCHARGE_MUSIC, res = { cabin: false, flight: false, source: 'none' };
  if (emb) { const bytes = {}; for (const k of Object.keys(LOOPS)) if (emb[k] && emb[k].b64) { try { const bin = atob(emb[k].b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); bytes[k] = u; } catch { /* bad data: skip */ } }
    const r = await audio.loadMusic(bytes); res.cabin = !!r.cabin; res.flight = !!r.flight; res.source = 'embedded ' + (emb.cabin || emb.flight || {}).type;
    for (const k of Object.keys(LOOPS)) if (res[k] && emb[k]) emb[k].b64 = null; // free the base64 text once decoded
    if (res.cabin && res.flight) return res; }
  if (/^https?:/.test(location.protocol)) {
    const base = location.pathname.includes('/out/') ? '../audio/music/out/' : 'audio/music/out/', exts = canOgg() ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
    for (const ext of exts) { const want = Object.keys(LOOPS).filter((k) => !res[k]); if (!want.length) break;
      const r = await audio.loadMusic(want.reduce((o, k) => { o[k] = `${base}${LOOPS[k]}.${ext}`; return o; }, {})) /* plain reduce: EdgeHTML 18 safe */; let got = false; for (const k of want) if (r[k]) { res[k] = true; got = true; } if (got) res.source = res.source === 'none' ? ext : res.source + ' + ' + ext; }
  }
  return res;
}
function applyAudioSettings() { life.setVolume(P.settings.muted ? 0 : P.settings.volume); if (!audio) return; audio.setMasterVolume(P.settings.volume); audio.mute(P.settings.muted); if (typeof audio.setVario === 'function') audio.setVario(P.settings.vario !== false); }
function syncAudio() {
  if (!audio) return; const v = cur(), plane = winged(), hov = hovering(), power = v.battery > 0 && !(plane && v.crashed) && G.vehicle !== 'glider';
  audio.setVehicle(hov ? 'plane' : G.vehicle); // hover vehicles: the electric-motor whine, plus the air-jet hiss below
  audio.setThrottle(!power ? 0 : plane ? v.throttle : hov ? Math.min(1, Math.abs(v.v) / HOVER[G.vehicle].maxDrive) * 0.7 : Math.min(1, Math.abs(v.thrust) + Math.abs(v.vy) / 3));
  if (typeof audio.setJets === 'function') { const J = hov ? v.jets : null; audio.setJets(J ? Math.max(J.rear, J.front, J.left, J.right, J.down * 0.55) : 0); }
  audio.setSpeed(plane ? (v.crashed ? 0 : v.v) : Math.abs(v.v));
  audio.setCharging(!!v.charging, v.battery / 100);
  audio.setCabin(G.chill);
  if (typeof audio.setWeather === 'function') audio.setWeather(weather.name);
  audio.setPaused(G.paused || G.panel);
  // newer sfx.js hooks, guarded with typeof so older/newer sfx.js both work.
  // setLift(climb -1..1) is the glider vario: the 0.5 s smoothed climb rate (same number as the HUD VSI), 0 for the other vehicles.
  // setOnWater(on): true only while the seaplane floats are on the water.
  if (typeof audio.setLift === 'function') audio.setLift(G.vehicle === 'glider' && !G.glider.crashed && !G.glider.grounded ? climbNorm() : 0);
  if (typeof audio.setOnWater === 'function') audio.setOnWater(hullOnWater());
  const low = v.battery < 20 && v.battery > 0; if (low && !wasLow) audio.lowBattery(); wasLow = low;
}
const input = createInput({ toast, onActivate: () => initAudio() });

// ---- game state
const G = { t: 0, vehicle: 'plane', chill: false, cockpit: true, paused: false, panel: false, plane: newPlane(), blimp: newBlimp(), glider: newGlider(), seaplane: newSeaplane(), roadster: newHover('roadster'), scooter: newHover('scooter'), ap: null, look: { x: 0, y: 0 }, hold: null, mission: null, objective: '', target: null, waypoint: null };
const cur = () => G[G.vehicle];

// ---- progress (localStorage), coins, missions
const coins = createCoins(world, seed); scene.add(coins.group);
const missions = createMissions(world); scene.add(missions.group);
const UPG = { battery: { name: 'Battery pack', sub: '−25% battery drain (more range)', cost: 150 }, charger: { name: 'Fast charger', sub: 'charges 1.75× faster on every pad', cost: 120 } };
let P = load();
function applyProgress() { coins.sync(P.collected); MODS.drain = P.upgrades.battery ? 0.75 : 1; MODS.charge = P.upgrades.charger ? 1.75 : 1; applyAudioSettings();
  G.cockpit = q.get('view') ? q.get('view') !== 'chase' : P.settings.view !== 'chase'; document.body.classList.toggle('cockpit', G.cockpit); /* 1.0.8.2: cockpit is the default view */ }
function persist() { return save(P); }
let flashT = 0, popT = 0, popTxt = '';
function collect(list) { let val = 0; for (const c of list) { val += COIN_VALUE[c.kind]; P.coins += COIN_VALUE[c.kind]; P.collected.push(c.id); } flashT = 0.45; popT = 1.1; popTxt = `+${val} ₿`; persist(); if (audio) audio.coin(); }
function missionHere() { // the mission you can start where you are parked (plane: stopped on a runway; blimp: settled on a pad)
  const v = cur(); let st = null;
  if (G.vehicle === 'plane') { if (v.crashed || !v.grounded || v.v >= 6) return null; st = world.inStation(v.pos.x, v.pos.z, 20); }
  else if (G.vehicle === 'blimp') { if (!v.charging) return null; st = world.onPad(v.pos.x, v.pos.z, 22); }
  else return null; // glider / seaplane: no missions yet (existing missions stay plane- or blimp-only)
  if (!st) return null; const i = world.stations.indexOf(st);
  return { here: missions.defs.find((d) => d.start === i && d.vehicle === G.vehicle) || null, other: missions.defs.find((d) => d.start === i && d.vehicle !== G.vehicle) || null };
}
function tryStartMission() {
  if (G.mission) return toast(`Mission already running: ${G.mission.def.name} (pause menu to abandon)`);
  const m = missionHere(), v = cur();
  if (!m || !m.here) return toast(m && m.other ? `${m.other.name} needs the ${m.other.vehicle} — press X / V to switch` : !['plane', 'blimp'].includes(G.vehicle) ? `No missions for the ${G.vehicle} yet — missions use the plane or the blimp` : 'No mission here — open the pause menu (Menu / P) to see where missions start');
  const d = m.here; if (d.minStart && v.battery < d.minStart) return toast(`Charge to ${d.minStart}% before starting ${d.name}`);
  setChill(false, true); G.mission = missions.start(d, v); G.waypoint = null; toast(`🎯 ${d.name}: ${d.desc}`, 5);
}
function finishMission(res) {
  const m = G.mission; if (!m) return; const d = m.def; missions.stop(); G.mission = null; G.objective = ''; G.target = null;
  if (res.state === 'done') {
    const first = !P.completed[d.id], reward = first ? d.reward : Math.round(d.reward / 4), best = P.best[d.id], nb = best == null || m.t < best;
    P.coins += reward; P.completed[d.id] = true; P.runs[d.id] = (P.runs[d.id] || 0) + 1; if (nb) P.best[d.id] = +m.t.toFixed(2); persist();
    flashT = 0.6; popT = 1.6; popTxt = `+${reward} ₿`; if (audio) audio.missionComplete(); toast(`🏁 ${d.name} complete! +${reward} ₿ · ${fmt(m.t)}${nb ? ' · new best!' : ` (best ${fmt(best)})`}`, 5);
  } else toast(`✖ ${d.name} failed — ${res.reason}. Head back to ${world.stations[d.start].name} to retry.`, 4.5);
  G.lastResult = { id: d.id, ...res, t: m.t };
}
const failMission = (reason) => G.mission && finishMission({ state: 'fail', reason });
const LAUNCH = { name: 'Summit Launch' }, DOCK = world.dock;
function spawnGlider() { const g = G.glider, L = world.launch; g.crashed = null; g.grounded = false; g.stalled = false; g.v = 12.5; g.lift = 0; g.vel.set(0, 0, 0); g.pos.set(L.x + Math.sin(L.hd) * 6, L.y, L.z - Math.cos(L.hd) * 6); setPlaneAttitude(g, L.hd, -0.06); return LAUNCH; }
function spawnSeaplane() { const s = G.seaplane; s.crashed = null; s.grounded = true; s.onWater = true; s.v = 0; s.throttle = 0; s.vel.set(0, 0, 0); s.hd = DOCK.hd; s.pos.set(DOCK.spawnX, SEAPLANE.float, DOCK.spawnZ); setPlaneAttitude(s, DOCK.hd, 0); return DOCK; }
function respawn(kind = G.vehicle, st = null) {
  if (G.mission) failMission('Respawned');
  if (kind === 'glider' || kind === 'seaplane') { const r = kind === 'glider' ? spawnGlider() : spawnSeaplane(); G.vehicle = kind; setChill(false, true); snapCam = true; climbPrevY = null; return r; }
  const v = cur(), pos = kind === G.vehicle ? v.pos : G.plane.pos; st = st || world.nearest(pos.x, pos.z).st;
  if (hovering(kind)) { const h = G[kind], sp = st.hoverSpawn; h.hover = false; h.landed = h.grounded = true; h.v = 0; h.vy = 0; h.yaw = sp.hd; h.lean = 0; h.pos.set(sp.x, world.groundAt(sp.x, sp.z).h + HOVER[kind].clear, sp.z);
    G.vehicle = kind; setChill(false, true); snapCam = true; return { name: st.name + ' chargers' }; }
  if (kind === 'plane') { const p = G.plane; p.crashed = null; p.grounded = true; p.v = 0; p.throttle = 0; p.vel.set(0, 0, 0); p.pos.set(st.spawnX, st.h + 0.12 + PLANE.gear, st.spawnZ); setPlaneAttitude(p, st.hd, 0); }
  else { const b = G.blimp; b.v = 0; b.vy = 0; b.yr = 0; b.yaw = st.hd; b.pos.set(st.padX, st.h + 30, st.padZ); }
  G.vehicle = kind; setChill(false, true); snapCam = true; return st;
}
// X / V cycles plane -> blimp -> glider -> seaplane -> roadster -> scooter -> plane
function switchVehicle() {
  if (cur().crashed) return;
  if (G.mission) failMission('Switched vehicle');
  if (G.vehicle === 'blimp') { spawnGlider(); G.vehicle = 'glider'; toast('🪂 Switched to HANG GLIDER at the summit launch — no motor: find the faint rising columns (thermals) and circle in them, or ride the windward ridge'); }
  else if (G.vehicle === 'glider') { spawnSeaplane(); G.vehicle = 'seaplane'; toast('🛩 Switched to SEAPLANE at the Lagoon Dock — RT for throttle, pull back above 100 km/h to lift off the water'); }
  else if (G.vehicle === 'plane') { const p = G.plane, b = G.blimp; b.pos.copy(p.pos); b.yaw = headingOf(p); b.v = Math.min(p.v, 8); b.vy = 0; b.yr = 0; b.pos.y = Math.max(b.pos.y, world.groundAt(b.pos.x, b.pos.z).h + BLIMP.clear + 4); G.vehicle = 'blimp'; toast('🎈 Switched to BLIMP — left stick to drift, RT/LT to rise and sink'); }
  else if (G.vehicle === 'seaplane') { const b = G.seaplane, r = G.roadster, agl = b.pos.y - world.groundAt(b.pos.x, b.pos.z).h - SEAPLANE.float;
    if (!b.grounded && agl > 30) { r.pos.copy(b.pos); r.yaw = headingOf(b); r.v = Math.min(b.v, 40); r.vy = 0; r.hover = true; r.landed = r.grounded = false; G.vehicle = 'roadster'; toast('🏎 Switched to ROADSTER — hovering on its air jets. LT to sink, RT to climb, land anywhere on its wheels'); }
    else { const st = respawn('roadster', world.nearest(b.pos.x, b.pos.z).st); toast(`🏎 Switched to ROADSTER at ${st.name} — stick to drive, RT fires the air jets to lift off (unlimited air)`); } }
  else if (G.vehicle === 'roadster') { const r = G.roadster, k = G.scooter; k.pos.copy(r.pos); k.pos.y += HOVER.scooter.clear - HOVER.roadster.clear; k.yaw = r.yaw; k.v = Math.min(r.v, HOVER.scooter.airTop); k.vy = 0; k.hover = r.hover; k.landed = k.grounded = !r.hover; G.vehicle = 'scooter';
    toast('🛵 Switched to SKY SCOOTER — stick to ride, RT to hop up on the jetpack air pods'); }
  else { const b = G.scooter, p = G.plane, agl = b.pos.y - world.groundAt(b.pos.x, b.pos.z).h;
    if (b.hover && agl > 50) { p.crashed = null; p.pos.copy(b.pos); p.grounded = false; p.v = 42; p.throttle = 0.5; setPlaneAttitude(p, b.yaw, 0); G.vehicle = 'plane'; toast('✈ Switched to E-PLANE — airborne'); }
    else { const st = respawn('plane', world.nearest(b.pos.x, b.pos.z).st); toast(`✈ Switched to E-PLANE — placed at ${st.name}`); } }
  setChill(false, true); snapCam = true; P.lastVehicle = G.vehicle; persist();
}
function setCockpit(on, quiet) {
  if (on === G.cockpit) return;
  G.cockpit = on; document.body.classList.toggle('cockpit', on); G.look.x = G.look.y = 0; snapCam = true;
  P.settings.view = on ? 'cockpit' : 'chase'; persist();
  if (!quiet) toast(on ? '🛩 Cockpit view · R3 / B for chase view' : '🎥 Chase view · R3 / B for cockpit view');
}
function setChill(on, quiet) {
  if (on === G.chill) return;
  G.chill = on; document.body.classList.toggle('chill', on); const ch = document.getElementById('chillhd'); if (ch) ch.textContent = CHILL_TITLE[G.vehicle];
  const v = cur(); G.ap = on ? { alt: hovering() && v.landed ? v.pos.y : Math.max(v.pos.y, world.groundAt(v.pos.x, v.pos.z).h + (winged() ? 140 : 40)), hold: winged() ? v.grounded : v.landed } : null;
  G.look.x = G.look.y = 0; snapCam = true;
  if (!quiet) toast(on ? (G.vehicle === 'glider' ? '🪂 Sky drift — hands off, the glider trims itself and circles in rising air. Move a stick to take over.' : '☕ Cabin chill — autopilot is cruising. Move a stick to take over.') : '🕹 You have control');
}
const _apF = new THREE.Vector3(), _apR = new THREE.Vector3(); // autopilot scratch vectors (runs every sim tick in chill)
// autopilot: synthesises inputs that hold a level cruise; turns back toward the island when far out
function autopilot() {
  const v = cur(), out = { pitch: 0, roll: 0, yaw: 0, up: 0, down: 0 }, ap = G.ap, toCenter = Math.atan2(-v.pos.x, v.pos.z), far = Math.hypot(v.pos.x, v.pos.z) > 2300;
  const hd = headingOf(v); let err = ((toCenter - hd + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (G.vehicle === 'glider') { // hands-off glide: trim speed (pitch 0), wings level, circle gently in rising air, steer away from high ground
    if (v.grounded) return out; const f = _apF.set(0, 0, -1).applyQuaternion(v.quat), r = _apR.set(1, 0, 0).applyQuaternion(v.quat);
    let ahead = 0; for (const d of [120, 260]) ahead = Math.max(ahead, world.groundAt(v.pos.x + f.x * d, v.pos.z + f.z * d).h);
    const want = ahead > v.pos.y - 70 ? 0.45 : v.lift > 0.6 ? 0.3 : far ? Math.max(-0.3, Math.min(0.3, err * 0.6)) : 0;
    out.roll = Math.max(-1, Math.min(1, (want + r.y) * 3)); return out; }
  if (winged()) {
    if (v.grounded) { out.down = ap.hold ? 1 : 0; return out; }
    const f = _apF.set(0, 0, -1).applyQuaternion(v.quat), r = _apR.set(1, 0, 0).applyQuaternion(v.quat);
    let ahead = 0; for (const d of [250, 500, 900]) ahead = Math.max(ahead, world.groundAt(v.pos.x + f.x * d, v.pos.z + f.z * d).h);
    ap.alt = Math.max(ap.alt, ahead + 130);
    const wantFy = Math.max(-0.12, Math.min(0.16, (ap.alt - v.pos.y) * 0.004 - v.vel.y * 0.012));
    out.pitch = Math.max(-1, Math.min(1, (wantFy - f.y) * 7));
    const wantBank = far ? Math.max(-0.3, Math.min(0.3, err * 0.6)) : 0; out.roll = Math.max(-1, Math.min(1, (wantBank + r.y) * 3));
    const wantV = 44; if (v.v < wantV - 2) out.up = 0.6; else if (v.v > wantV + 4) out.down = 0.4;
    if (v.throttle < 0.35 && v.v < wantV) out.up = 1;
  } else {
    out.up = Math.max(0, Math.min(1, (ap.alt - v.pos.y) * 0.15 - v.vy * 0.6)); out.down = Math.max(0, Math.min(1, -(ap.alt - v.pos.y) * 0.15 + v.vy * 0.6));
    if (!ap.hold) { out.pitch = -0.45; if (far) out.roll = Math.max(-1, Math.min(1, err * 1.5)); }
  }
  return out;
}

const ZERO = { pitch: 0, roll: 0, yaw: 0, up: 0, down: 0 };
let lastEvent = null;
function simTick(inp) {
  G.t += DT; world.update(G.t);
  { // breezy days: a gentle sideways push on the slow fliers (blimp, glider) while airborne; nothing on clear / foggy days
    const v = cur(), b = weather.cur.breeze; if (b > 0.5 && (G.vehicle === 'blimp' || (G.vehicle === 'glider' && !v.grounded && !v.crashed))) { const k = 0.12 * (b - 0.5) * 2 * DT; v.pos.x += weather.wind.x * k; v.pos.z += weather.wind.z * k; } }
  if (winged()) {
    const k = G.vehicle, p = G[k], where = k === 'glider' ? 'the summit launch' : k === 'seaplane' ? 'the Lagoon Dock' : 'the nearest station';
    if (p.crashed) { p.crashed.t += DT; if (p.crashed.t > 2.4) { const st = respawn(k, k === 'plane' ? world.nearest(p.crashed.pos.x, p.crashed.pos.z).st : null); toast(`Respawned at ${st.name}`); } return; }
    const ev = (k === 'glider' ? stepGlider : k === 'seaplane' ? stepSeaplane : stepPlane)(p, G.chill ? autopilot() : inp, world, DT, G.t);
    if (ev && ev.startsWith('crash')) { setChill(false, true); failMission('Crashed'); if (audio) audio.crash();
      toast({ 'crash:splash': k === 'seaplane' ? `💦 Hit the water too hard! Respawning at ${where}…` : `💦 Splashdown! Respawning at ${where}…`, 'crash:hard': `💥 Hard impact! Respawning at ${where}…`, 'crash:terrain': `💥 Hit the terrain! Respawning at ${where}…`, 'crash:tree': `🌲 Hit a tree! Respawning at ${where}…` }[ev]); }
    if (ev === 'touchdown') toast(k === 'glider' ? '🪂 Landed — press A / R to relaunch from the summit' : world.inStation(p.pos.x, p.pos.z) ? '🛬 Nice landing — slow down below 20 km/h to charge' : '🛬 Touchdown');
    if (ev === 'splashdown') toast(world.nearDock(p.pos.x, p.pos.z, 200) ? '🌊 Smooth water landing — taxi to the dock and slow down to charge' : '🌊 Smooth water landing — you can taxi and take off again');
    if (ev === 'splashdown:hard') toast('💦 Big splash! Bounced down onto the floats — you can taxi and take off again');
    if (ev && ev.startsWith('splashdown')) splashBurst(p, ev === 'splashdown:hard' ? 1.6 : 1);
    lastEvent = ev;
  } else if (hovering()) { const ev = stepHover(cur(), G.chill ? autopilot() : inp, world, DT, G.t); lastEvent = ev || lastEvent;
    if (ev === 'liftoff') toast('💨 Air jets on — hovering. Unlimited compressed air: RT climb, LT sink, stick to fly', 2.5);
    if (ev === 'touchdown') toast(world.chargeBay(cur().pos.x, cur().pos.z) ? '🛬 Landed in a charging bay — stop to plug in' : '🛬 Back on the wheels', 2.2); }
  else stepBlimp(G.blimp, G.chill ? autopilot() : inp, world, DT, G.t);
  coins.update(G.t);
  const v = cur(); if (v.crashed) return;
  const got = coins.check(G.vehicle, v.pos); if (got.length) collect(got);
  if (G.mission) { const r = missions.update(G.mission, G.vehicle, v, DT); if (r.state === 'run') { G.objective = r.objective; G.target = r.target; } else finishMission(r); }
}

// ---- camera
let snapCam = true; const _camWant = new THREE.Vector3(), _camLookT = new THREE.Vector3(); // chase-camera scratch (was 2 new Vector3s per frame)
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), te = new THREE.Euler();
function updateCamera(dt) {
  const v = cur(), g = MESH[G.vehicle], cab = CAB[G.vehicle] || planeCab;
  const k = snapCam ? 1 : 1 - Math.exp(-dt * 5);
  if (inCab()) {
    camera.fov = 70; camera.near = NEAR_CABIN; g.updateMatrixWorld(true);
    tmp.copy(cab.eye); cab.group.localToWorld(tmp); camera.position.copy(tmp);
    te.set(cab.look.pitch - G.look.y * (G.look.y < 0 ? LOOK_CAPS.up : LOOK_CAPS.down), cab.look.yaw - G.look.x * LOOK_CAPS.side, 0, 'YXZ'); /* look-around caps: ~100° side, 45° up, 30° down (STYLE_GUIDE); Flow tunes feel */ tq.setFromEuler(te); camera.quaternion.copy(g.quaternion).multiply(tq);
  } else {
    camera.fov = 62; camera.near = NEAR_CHASE * Math.min(1, G.zoom || 1); const hd = headingOf(v); let pit = 0;
    if (winged()) { tmp.set(0, 0, -1).applyQuaternion(v.quat); pit = Math.asin(Math.max(-1, Math.min(1, tmp.y))) * 0.6; }
    const zm = G.zoom || 1, dist = { plane: 21, blimp: 50, glider: 13, seaplane: 23, roadster: 9.5, scooter: 6.5 }[G.vehicle] * zm, up = { plane: 5, blimp: 7, glider: 4.2, seaplane: 5.5, roadster: 3, scooter: 2.3 }[G.vehicle] * zm, yaw = hd + G.look.x * Math.PI * 0.9, pp = pit - G.look.y * 0.6;
    const dir = tmp.set(Math.sin(yaw) * Math.cos(pp), Math.sin(pp), -Math.cos(yaw) * Math.cos(pp));
    const want = _camWant.copy(v.pos).addScaledVector(dir, -dist); want.y += up;
    want.y = Math.max(want.y, world.groundAt(want.x, want.z).h + 2.5);
    if (snapCam) camPos.copy(want); else camPos.lerp(want, k);
    const look = _camLookT.copy(v.pos).addScaledVector(dir, 15); look.y += winged() ? 1.5 : hovering() ? 0.8 : -2;
    if (snapCam) camLook.copy(look); else camLook.lerp(look, Math.min(1, k * 1.6));
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  weather.update(dt, cur().pos); updateFx(dt); camera.updateProjectionMatrix(); snapCam = false;
}
// ---- effects: air-jet puffs (hover vehicles), seaplane spray + wake, charging cable + floating battery bar
const _jp = new THREE.Vector3(), _jd = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _vq = new THREE.Quaternion();
let jetAcc = 0, wakeAcc = 0, cableK = 0, cableVeh = null;
function splashBurst(p, k = 1) { const r = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat), f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quat);
  for (let i = 0; i < 18 * k; i++) { const sx = i % 2 ? 1 : -1, a = Math.random() * 6.28; fx.emit(p.pos.x + r.x * sx * 1.3 + f.x * (Math.random() * 4 - 2), 0.4, p.pos.z + r.z * sx * 1.3 + f.z * (Math.random() * 4 - 2),
    Math.cos(a) * 4 * k + r.x * sx * 3, 3 + Math.random() * 5 * k, Math.sin(a) * 4 * k + r.z * sx * 3, 0.9 * k, 1.1, false, 1.2); } }
function updateFx(dt) {
  const v = cur(), k = G.vehicle, step = Math.min(dt, 0.1);
  if (hovering() && step > 0) { const g = MESH[k], u = g.userData, J = v.jets; jetAcc += step; g.updateMatrixWorld(true); g.getWorldQuaternion(_vq);
    const vx = Math.sin(v.yaw) * v.v, vz = -Math.cos(v.yaw) * v.v, rate = 1 / 26;
    while (jetAcc > rate) { jetAcc -= rate;
      for (const j of u.jets) { const lvl = J[j.kind] || 0; if (lvl < 0.05 || Math.random() > lvl * (j.kind === 'down' ? 0.35 : 0.8)) continue;
        _jp.copy(j.pos); u.body.localToWorld(_jp); _jd.copy(j.dir).applyQuaternion(_vq); const sp = j.kind === 'down' ? 5 : 9, sz = k === 'scooter' ? 0.28 : 0.42;
        fx.emit(_jp.x, _jp.y, _jp.z, _jd.x * sp + vx * 0.4, _jd.y * sp + v.vy * 0.3, _jd.z * sp + vz * 0.4, sz * (0.7 + lvl * 0.6), 0.5, false, 3); } } }
  else jetAcc = 0;
  if (k === 'seaplane' && v.onWater && !v.crashed && v.v > 2.5 && step > 0) { wakeAcc += step; const r = _a.set(1, 0, 0).applyQuaternion(v.quat), f = _b.set(0, 0, -1).applyQuaternion(v.quat);
    while (wakeAcc > 0.09) { wakeAcc -= 0.09; for (const sx of [-1, 1]) fx.emit(v.pos.x + r.x * sx * 1.25 - f.x * 2.6, 0.12, v.pos.z + r.z * sx * 1.25 - f.z * 2.6, r.x * sx * 0.8, 0, r.z * sx * 0.8, 0.7 + v.v * 0.02, 2.2, true, 0.6);
      if (v.v > 14) fx.emit(v.pos.x + r.x * 1.3 * (Math.random() > 0.5 ? 1 : -1) + f.x * 1.5, 0.4, v.pos.z + f.z * 1.5, r.x * 2, 1.5, r.z * 2, 0.5, 0.6, false, 2); } }
  fx.update(step);
  // charging cable: reaches out from the post / pylon and plugs into the vehicle's port
  let from = null, port = null, barH = 2.4; const g = MESH[k];
  if (v.charging && !v.crashed) {
    if (hovering() && v.chargeAt) { from = _a.set(v.chargeAt.ax, v.chargeAt.ay, v.chargeAt.az); port = _b.set(k === 'scooter' ? -0.2 : -0.95, 0.2, k === 'scooter' ? 0.45 : 1.2); barH = k === 'scooter' ? 1.9 : 2.0; }
    else if (k === 'seaplane') { from = _a.set(world.dock.anchor.x, world.dock.anchor.y, world.dock.anchor.z); port = _b.set(-0.9, 0.1, -0.3); barH = 3.2; }
    else if (k === 'plane' || k === 'blimp') { const st = world.nearest(v.pos.x, v.pos.z).st; if (st.pylon && Math.hypot(st.pylon.x - v.pos.x, st.pylon.z - v.pos.z) < 45) { from = _a.set(st.pylon.x, st.pylon.y, st.pylon.z); port = _b.set(k === 'blimp' ? 1.4 : 0.8, k === 'blimp' ? -7.6 : 0, k === 'blimp' ? 0 : 0.6); } barH = k === 'blimp' ? -4.5 : 3; }
  }
  if (from && port) { if (cableVeh !== k) { cableK = 0; cableVeh = k; } cableK = Math.min(1, cableK + step * 1.4); g.updateMatrixWorld(true); g.localToWorld(port); const e = 1 - (1 - cableK) ** 3; fx.setCable(from, port, e); }
  else { fx.hideCable(); cableK = 0; cableVeh = null; }
  if (v.charging && !v.crashed && !inCab()) fx.setBar(_jp.set(v.pos.x, v.pos.y + barH, v.pos.z), v.battery, k === 'blimp' ? 2 : k === 'scooter' ? 0.7 : 1); else fx.hideBar();
}
function syncMeshes(dt = DT) {
  const spin = Math.min(dt, 0.1) * 60; // props turn per second, not per rendered frame (was 2.4x faster on a 144 Hz screen)
  const p = G.plane, b = G.blimp, gl = G.glider, sp = G.seaplane;
  planeG.visible = G.vehicle === 'plane' && !p.crashed; planeG.position.copy(p.pos); planeG.quaternion.copy(p.quat);
  planeG.userData.prop.rotation.z += ((p.battery > 0 ? p.throttle : 0) * 1.4 + 0.02) * spin;
  gliderG.visible = G.vehicle === 'glider' && !gl.crashed; gliderG.position.copy(gl.pos); gliderG.quaternion.copy(gl.quat);
  seaG.visible = G.vehicle === 'seaplane' && !sp.crashed; seaG.position.copy(sp.pos); seaG.quaternion.copy(sp.quat);
  seaG.userData.prop.rotation.z += ((sp.battery > 0 ? sp.throttle : 0) * 1.3 + 0.02) * spin;
  world.thermalGroup.visible = G.vehicle === 'glider';
  blimpG.visible = G.vehicle === 'blimp'; blimpG.position.set(b.pos.x, b.pos.y + b.bob, b.pos.z); blimpG.rotation.set(b.tilt, -b.yaw, b.bank, 'YXZ');
  for (const pr of blimpG.userData.props) pr.rotation.z += (Math.abs(b.thrust) * 0.5 + 0.03) * spin;
  for (const k of ['roadster', 'scooter']) { const h = G[k], g = MESH[k], u = g.userData; g.visible = G.vehicle === k; if (!g.visible) continue;
    g.position.set(h.pos.x, h.pos.y + h.bob, h.pos.z); g.rotation.set(h.pitchVis, -h.yaw, h.rollVis + h.lean, 'YXZ');
    for (const w of u.wheels) if (!u.front.includes(w)) w.rotation.x = h.wheel; for (const f of u.front) f.rotation.set(f === u.fork ? 0 : h.wheel, -h.steer * 0.45, 0, 'YXZ'); if (u.fork) u.wheels[0].rotation.x = h.wheel;
    if (u.bars) u.bars.rotation.y = -h.steer * 0.45; if (k === 'scooter') scootCab.bars.rotation.y = -h.steer * 0.45;
    if (u.plate) u.plate.rotation.x += ((h.jets.rear > 0.1 ? 1.5 : 0) - u.plate.rotation.x) * (1 - Math.pow(0.8, spin)); }
  for (const [g, cab] of [[planeG, planeCab], [blimpG, blimpCab], [seaG, seaCab], [gliderG, gliderCab], [roadG, roadCab], [scootG, scootCab]]) { const ic = inCab(); cab.group.visible = ic; for (const c of g.children) if (c !== cab.group) c.visible = !ic; }
  const cv = cur(); if (winged() && cv.crashed) { const t = cv.crashed.t; burst.position.copy(cv.crashed.pos); burst.scale.setScalar(2 + t * 14); burst.material.opacity = Math.max(0, 0.85 - t * 0.5); burst.material.color.setHex(cv.crashed.why === 'splash' ? 0xd8f0ff : 0xf7931a); } else burst.material.opacity = 0;
}

// ---- HUD
const mapCtx = $('map').getContext('2d');
let gaugeT = 0;
function nearestThermal(x, z) { let b = world.thermals[0], bd = 1e9; for (const t of world.thermals) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; b = t; } } return b; }
// HUD writes go through these: they touch the DOM only when the value changed. Setting textContent / innerHTML to the
// same string still replaces the nodes and invalidates layout, ~30 times a frame (the mission prompt re-parsed its HTML every frame).
const T = (el, v) => { v = String(v); if (el.__t !== v) { el.__t = v; el.textContent = v; } }, HT = (el, v) => { if (el.__h !== v) { el.__h = v; el.innerHTML = v; } }, CL = (el, v) => { if (el.className !== v) el.className = v; };
function updateHUD(dt) {
  const v = cur(), gr = world.groundAt(v.pos.x, v.pos.z), hd = headingOf(v), kt = P.settings.units === 'kt', spd = (winged() ? v.v : Math.abs(v.v)) * (kt ? 1.944 : 3.6), gld = G.vehicle === 'glider', sea = G.vehicle === 'seaplane';
  T($('spdu'), kt ? 'kt' : 'km/h'); T($('coins'), P.coins); T($('found'), `${P.collected.length}/${coins.total} found`);
  T($('veh'), LABEL[G.vehicle]); document.body.classList.toggle('nobat', gld);
  T($('spd'), Math.round(spd)); T($('alt'), Math.round(v.pos.y)); T($('agl'), `AGL ${Math.max(0, Math.round(v.pos.y - gr.h - ({ plane: PLANE.gear, blimp: BLIMP.clear, glider: GLIDER.clear, seaplane: SEAPLANE.float, roadster: HOVER.roadster.clear, scooter: HOVER.scooter.clear })[G.vehicle]))}`);
  { const c = climbNorm(), el = $('vsibar'); T($('vsi'), (climbEMA >= 0 ? '▲ +' : '▼ ') + climbEMA.toFixed(1)); CL(el, c < 0 ? 'sink' : ''); el.style.left = (c < 0 ? 50 + c * 50 : 50) + '%'; el.style.width = Math.abs(c) * 50 + '%'; }
  T($('hdg'), String(Math.round(((hd * 180 / Math.PI) % 360 + 360) % 360) % 360).padStart(3, '0'));
  const hov = hovering(), thr = gld ? 0 : winged() ? v.throttle : hov ? Math.max(v.jets.rear, v.jets.front, v.jets.left, v.jets.right, v.jets.down) : Math.abs(v.thrust); T($('thr'), gld ? 'no motor' : hov ? 'AIR ∞' : Math.round(thr * 100) + '%'); $('thrbar').firstChild.style.width = thr * 100 + '%';
  T($('bat'), gld ? 'no battery' : Math.round(v.battery) + '%'); $('batbar').firstChild.style.width = v.battery + '%'; $('batbar').classList.toggle('low', v.battery < 20);
  const n = world.nearest(v.pos.x, v.pos.z), wp = G.waypoint != null ? world.stations[G.waypoint] : null;
  if (wp && Math.hypot(wp.padX - v.pos.x, wp.padZ - v.pos.z) < 120) G.waypoint = null;
  const nth = gld ? nearestThermal(v.pos.x, v.pos.z) : null;
  const tgt = G.mission && G.target ? { x: G.target.x, z: G.target.z, name: '🎯 ' + G.target.label } : wp ? { x: wp.padX, z: wp.padZ, name: '📍 ' + wp.name } : gld ? { x: nth.x, z: nth.z, name: '🌀 Thermal' } : hovering() ? { x: n.st.hoverSpawn.x, z: n.st.hoverSpawn.z, name: '⚡ ' + n.st.name } : sea ? { x: DOCK.chargeX, z: DOCK.chargeZ, name: '⚓ ' + DOCK.name } : { x: n.st.padX, z: n.st.padZ, name: '⚡ ' + n.st.name };
  const td = Math.hypot(tgt.x - v.pos.x, tgt.z - v.pos.z), brg = Math.atan2(tgt.x - v.pos.x, -(tgt.z - v.pos.z));
  T($('navname'), tgt.name); T($('navd'), td > 1000 ? (td / 1000).toFixed(1) + ' km' : Math.round(td) + ' m');
  document.body.classList.toggle('mission', !!G.mission);
  const ob = $('obj'); if (G.mission) { HT(ob, `<b>🎯 ${G.mission.def.name.toUpperCase()}</b> ${G.objective}`); CL(ob, 'box show'); } else CL(ob, 'box');
  const mh = !G.mission && !G.chill ? missionHere() : null, pr = $('prompt');
  if (mh && (mh.here || mh.other)) { const d = mh.here; CL(pr, 'box show');
    HT(pr, d ? (d.minStart && v.battery < d.minStart ? `⚡ Charge to ${d.minStart}% to start <b>${d.name}</b> (now ${Math.floor(v.battery)}%)` : `<kbd>B</kbd> / <kbd>Enter</kbd> start <b>${d.name}</b> · +${P.completed[d.id] ? Math.round(d.reward / 4) : d.reward} ₿${P.best[d.id] != null ? ` · best ${fmt(P.best[d.id])}` : ''}`) : `<b>${mh.other.name}</b> starts here with the ${mh.other.vehicle} — <kbd>X</kbd> / <kbd>V</kbd> to switch`);
  } else CL(pr, 'box');
  if (flashT > 0) flashT = Math.max(0, flashT - dt); $('flash').style.opacity = (flashT / 0.45 * 0.5).toFixed(3);
  const pp = $('popup'); if (popT > 0) { popT = Math.max(0, popT - dt); T(pp, popTxt); pp.style.opacity = Math.min(1, popT * 2).toFixed(2); pp.style.transform = `translate(-50%, ${(-40 * (1.1 - popT)).toFixed(1)}px)`; } else pp.style.opacity = 0;
  $('arrow').style.transform = `rotate(${(brg - hd) * 180 / Math.PI - 90}deg)`;
  let st = null, cls = 'info';
  if (winged() && v.crashed) { st = 'CRASHED — RESPAWNING'; cls = 'warn'; }
  else if (gld) { if (v.grounded) st = 'LANDED — A / R TO RELAUNCH'; else if (v.stalled) { st = 'STALL — NOSE DOWN'; cls = 'warn'; } else if (v.lift > 1.2) { st = '🌀 IN RISING AIR — CIRCLE TO CLIMB'; cls = 'good'; } }
  else if (v.charging) { st = v.battery >= 99.5 ? '⚡ FULLY CHARGED' : `⚡ CHARGING ${Math.round(v.battery)}%`; cls = 'good'; }
  else if (v.battery <= 0 && hovering()) { st = 'BATTERY EMPTY — AIR JETS STILL WORK: HOVER TO A ⚡ STATION'; cls = 'warn'; }
  else if (v.battery <= 0) { st = G.vehicle === 'plane' ? 'BATTERY EMPTY — GLIDE TO A STATION' : sea ? 'BATTERY EMPTY — GLIDE TO A GENTLE WATER LANDING' : 'BATTERY EMPTY — DRIFTING'; cls = 'warn'; }
  else if (v.battery < 20) { st = sea ? `LOW BATTERY ${Math.round(v.battery)}% — HEAD FOR THE ⚓ LAGOON DOCK` : `LOW BATTERY ${Math.round(v.battery)}% — FIND A ⚡ STATION`; cls = 'warn'; }
  else if (winged() && !v.grounded && v.stalled) { st = 'STALL — NOSE DOWN, ADD THROTTLE'; cls = 'warn'; }
  else if (sea && v.grounded && world.nearDock(v.pos.x, v.pos.z, 22) && v.v >= 6) { st = 'AT THE DOCK — SLOW DOWN TO CHARGE'; }
  else if (G.vehicle === 'plane' && v.grounded && world.inStation(v.pos.x, v.pos.z) && v.v >= 6) { st = 'ON RUNWAY — SLOW DOWN TO CHARGE'; }
  const s = $('status'); T(s, st || ''); CL(s, st ? 'show ' + cls : '');
  T($('chilltxt'), gld ? `${v.grounded ? 'Landed' : v.lift > 0.6 ? 'Circling in rising air' : 'Hands-off glide'} · ${Math.round(spd)} ${kt ? 'kt' : 'km/h'} · ${climbEMA >= 0 ? '▲' : '▼'} ${Math.abs(climbEMA).toFixed(1)} m/s · ${Math.round(v.pos.y)} m`
    : `${(winged() ? (v.grounded ? (sea ? 'Floating' : 'Parked') : 'Autopilot cruise') : hovering() ? (v.landed ? 'Parked' : 'Hover cruise · air ∞') : (G.ap && G.ap.hold ? 'Hovering' : 'Autopilot drift'))} · ${Math.round(spd)} ${kt ? 'kt' : 'km/h'} · ⚡ ${Math.round(v.battery)}%${v.charging ? ' charging' : ''}`);
  if (inCab()) { const at = cockpitAttitude(G.vehicle, v), J = hov ? v.jets : null; /* updateCockpit caps itself at 10 Hz and skips hidden cabs */
    updateCockpit(CAB[G.vehicle] || planeCab, { pitch: at.pitch, roll: at.roll, heading: hd, speed: spd, unit: kt ? 'KT' : 'KM/H', alt: v.pos.y, charge: gld ? 100 : v.battery, charging: !!v.charging, climb: climbEMA, boost: J ? Math.max(J.rear, J.front, J.left, J.right, J.down) : 0 }); }
  // minimap (north up)
  const W = 180, sc = W / world.MM_SPAN, px = (x) => (x * sc + W / 2);
  mapCtx.imageSmoothingEnabled = true; mapCtx.drawImage(world.minimap, 0, 0, W, W);
  for (const s2 of world.stations) { mapCtx.fillStyle = s2 === n.st ? '#F7931A' : '#c27012'; mapCtx.beginPath(); mapCtx.arc(px(s2.padX), px(s2.padZ), s2 === n.st ? 5 : 4, 0, 7); mapCtx.fill(); mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 1.5; mapCtx.stroke(); }
  { const dx = px(DOCK.x), dz = px(DOCK.z); mapCtx.fillStyle = sea ? '#5fd0e0' : '#2b8c99'; mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 1.5; mapCtx.fillRect(dx - 3.5, dz - 3.5, 7, 7); mapCtx.strokeRect(dx - 3.5, dz - 3.5, 7, 7); }
  if (gld) { mapCtx.strokeStyle = 'rgba(255,240,215,.8)'; mapCtx.lineWidth = 1.2; for (const t of world.thermals) { mapCtx.beginPath(); mapCtx.arc(px(t.x), px(t.z), Math.max(3, t.r * sc), 0, 7); mapCtx.stroke(); } }
  if (tgt.name[0] !== '⚡' && !(gld && !G.mission && !wp)) { mapCtx.fillStyle = '#fff'; mapCtx.strokeStyle = '#F7931A'; mapCtx.lineWidth = 2; mapCtx.beginPath(); mapCtx.arc(px(tgt.x), px(tgt.z), 5, 0, 7); mapCtx.fill(); mapCtx.stroke(); }
  mapCtx.save(); mapCtx.translate(px(v.pos.x), px(v.pos.z)); mapCtx.rotate(hd); mapCtx.fillStyle = '#fff'; mapCtx.strokeStyle = '#000'; mapCtx.lineWidth = 1.5;
  mapCtx.beginPath(); mapCtx.moveTo(0, -8); mapCtx.lineTo(5.5, 6); mapCtx.lineTo(0, 3); mapCtx.lineTo(-5.5, 6); mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke(); mapCtx.restore();
  mapCtx.fillStyle = '#F7931A'; mapCtx.font = 'bold 12px system-ui'; mapCtx.fillText('N', W / 2 - 4, 13);
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('show');
}

// ---- actions + frame
// pause menu: D-pad / ↑↓ move, A / Enter select, B / Esc back, Menu / P resume. Mouse works too.
const menu = { view: 'main', sel: 0, items: [] };
function buildMenu() {
  const it = [], H = (label) => it.push({ header: label }), I = (label, sub, act, cls = '', adj = null) => it.push({ label, sub, act, cls, adj });
  if (menu.view === 'confirm') { H('RESET ALL PROGRESS?'); it.push({ info: 'This erases your coins, collected coins, completed missions, best times, upgrades, last vehicle and settings. It cannot be undone.' });
    I('No, keep my progress', '', () => setView('main')); I('Yes, erase everything', '', resetProgress, 'danger'); return it; }
  I('▶ Resume', '', closeMenu);
  if (G.mission) I(`✖ Abandon mission: ${G.mission.def.name}`, '', () => { failMission('Abandoned'); closeMenu(); }, 'danger');
  H(`MISSIONS · ${Object.keys(P.completed).length}/${missions.defs.length} done · ₿ ${P.coins}`);
  for (const d of missions.defs) { const done = P.completed[d.id], best = P.best[d.id], s0 = world.stations[d.start];
    I(`${done ? '✓' : '○'} ${d.name}`, `${LABEL[d.vehicle].split(' ')[0]} ${d.vehicle} · starts at ${s0.name} · ${done ? `+${Math.round(d.reward / 4)} ₿ repeat` : `+${d.reward} ₿`}${best != null ? ` · best ${fmt(best)}` : ''} — ${d.desc}`,
      () => { G.waypoint = d.start; closeMenu(); toast(`📍 ${s0.name} marked — ${d.vehicle === 'blimp' ? 'settle the blimp on its pad' : 'land and stop on its runway'}, then press B / Enter`); }, done ? 'done' : ''); }
  H('UPGRADES');
  for (const k of Object.keys(UPG)) { const u = UPG[k], own = P.upgrades[k];
    I(`${own ? '✓' : '🛒'} ${u.name}`, own ? `owned · ${u.sub}` : `${u.cost} ₿ · ${u.sub}${P.coins < u.cost ? ` · need ${u.cost - P.coins} more` : ''}`, () => buyUpgrade(k), own ? 'done' : ''); }
  H('SETTINGS');
  I(`Invert pitch (plane, glider, seaplane): ${P.settings.invertPitch ? 'On' : 'Off'}`, '', () => { P.settings.invertPitch = !P.settings.invertPitch; persist(); });
  I(`Speed units: ${P.settings.units === 'kt' ? 'knots' : 'km/h'}`, '', () => { P.settings.units = P.settings.units === 'kt' ? 'kmh' : 'kt'; persist(); });
  I(`Sound: ${P.settings.muted ? 'Muted' : 'On'}`, 'mute / unmute all game audio', () => { P.settings.muted = !P.settings.muted; applyAudioSettings(); persist(); });
  I(`Volume: ${'█'.repeat(Math.round(P.settings.volume * 10))}${'░'.repeat(10 - Math.round(P.settings.volume * 10))} ${Math.round(P.settings.volume * 100)}%`, '◀ ▶ (D-pad / arrows) adjust · A / Enter steps up', () => setVolume(P.settings.volume >= 0.999 ? 0 : P.settings.volume + 0.1), '', (d) => setVolume(P.settings.volume + d * 0.1));
  I(`Vario tone: ${P.settings.vario !== false ? 'On' : 'Off'}`, 'hang glider climb/sink beeps (silent in the other vehicles)', () => { P.settings.vario = P.settings.vario === false; applyAudioSettings(); persist(); });
  I('Reset progress…', 'asks to confirm first', () => setView('confirm'), 'danger');
  return it;
}
function setVolume(x) { P.settings.volume = Math.round(Math.min(1, Math.max(0, x)) * 10) / 10; if (P.settings.volume > 0 && P.settings.muted) P.settings.muted = false; applyAudioSettings(); persist(); }
function buyUpgrade(k) { const u = UPG[k]; if (P.upgrades[k]) return toast(`${u.name} already installed`); if (P.coins < u.cost) return toast(`Need ${u.cost - P.coins} more ₿ for the ${u.name}`);
  P.coins -= u.cost; P.upgrades[k] = true; applyProgress(); persist(); toast(`🔧 ${u.name} installed!`); }
function resetProgress() { failMission('Progress reset'); clear(); P = defaults(); applyProgress(); setView('main'); toast('Progress reset — fresh start'); }
const selectable = () => menu.items.map((x, i) => (x.act ? i : -1)).filter((i) => i >= 0);
function setView(v) { menu.view = v; menu.items = buildMenu(); menu.sel = selectable()[0]; renderMenu(); }
function renderMenu() {
  menu.items = buildMenu(); if (!menu.items[menu.sel] || !menu.items[menu.sel].act) menu.sel = selectable()[0];
  const el = $('menulist'); el.innerHTML = menu.items.map((x, i) => x.header ? `<div class="mh">${x.header}</div>` : x.info ? `<div class="mi">${x.info}</div>` :
    `<div class="mo ${x.cls} ${i === menu.sel ? 'sel' : ''}" data-i="${i}"><div>${x.label}</div>${x.sub ? `<small>${x.sub}</small>` : ''}</div>`).join('');
  const s = el.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
}
$('menulist').addEventListener('click', (e) => { const o = e.target.closest('.mo'); if (!o) return; menu.sel = +o.dataset.i; menu.items[menu.sel].act(); if (G.paused) renderMenu(); });
// Auto-pause when the tab or app is hidden (alt-tab, minimise, Xbox guide): the frame loop stops in a hidden tab but
// Web Audio doesn't, so the engine kept droning in the background. Opening the pause menu ducks the audio, and you come
// back paused instead of mid-dive. Manual / test runs (?manual=1) are left alone.
if (!manual) document.addEventListener('visibilitychange', () => { if (document.hidden && !G.paused) openMenu(); });
function openMenu() { G.paused = true; $('pause').classList.add('show'); setView('main'); }
function closeMenu() { G.paused = false; $('pause').classList.remove('show'); }
function menuAction(a) {
  const sel = selectable(), k = sel.indexOf(menu.sel);
  if (a === 'menuUp') menu.sel = sel[(k - 1 + sel.length) % sel.length];
  else if (a === 'menuDown') menu.sel = sel[(k + 1) % sel.length];
  else if (a === 'respawn' || a === 'enter') { menu.items[menu.sel].act(); }
  else if ((a === 'menuLeft' || a === 'menuRight') && menu.items[menu.sel].adj) menu.items[menu.sel].adj(a === 'menuRight' ? 1 : -1);
  else if (a === 'b' || a === 'close') { if (menu.view !== 'main') setView('main'); else closeMenu(); }
  else if (a === 'pause') closeMenu();
  if (G.paused) renderMenu();
}
function handle(a) {
  if (G.paused) return menuAction(a);
  if (a === 'panel') { G.panel = !G.panel; $('panel').classList.toggle('show', G.panel); return; }
  if (a === 'close') { G.panel = false; $('panel').classList.remove('show'); return; }
  if (a === 'pause') { openMenu(); return; }
  if (G.panel) return;
  if (a === 'chill') setChill(!G.chill);
  else if (a === 'view') setCockpit(!G.cockpit);
  else if (a === 'vehicle') switchVehicle();
  else if (a === 'respawn') { const st = respawn(G.vehicle); toast(`Respawned at ${st.name}`); }
  else if (a === 'b' || a === 'enter') tryStartMission();
}
let acc = 0;
function frame(dt, inp) {
  for (const a of inp.pressed) handle(a);
  const running = !G.paused && !G.panel;
  if (running && G.chill && inp.flying) setChill(false);
  if (G.vehicle === 'glider' && inCab()) cockpitBarShift(gliderCab, running ? inp.roll || 0 : 0, running ? inp.pitch || 0 : 0, dt); // 1.0.8.3 (Look): bar follows your stick (+pitch = nose up)
  G.look.x += (inp.lookX - G.look.x) * Math.min(1, dt * 6); G.look.y += (inp.lookY - G.look.y) * Math.min(1, dt * 6);
  if (running) { acc += dt; let n = 0; while (acc >= DT && n < 6) { simTick(inp); acc -= DT; n++; } if (n === 6) acc = 0; }
  if (running) updateClimb(dt); if (running) life.update(dt, cur().pos); syncMeshes(dt); updateCamera(dt); updateHUD(dt); syncAudio(); renderer.render(scene, camera);
}
const merged = () => { const i = input.poll(); if (G.hold) Object.assign(i, G.hold); if (P.settings.invertPitch && winged()) i.pitch = -i.pitch; return i; };

applyProgress(); respawn('plane', world.stations[0]); G.blimp.pos.set(world.stations[0].padX, world.stations[0].h + 30, world.stations[0].padZ);
spawnGlider(); spawnSeaplane(); // park the other vehicles at their homes
if (P.lastVehicle === 'blimp') respawn('blimp', world.stations[0]); else if (P.lastVehicle === 'glider' || P.lastVehicle === 'seaplane') respawn(P.lastVehicle);
const anyProgress = P.coins || P.collected.length || Object.keys(P.completed).length;
toast(anyProgress ? `Welcome back! ₿ ${P.coins} coins · ${Object.keys(P.completed).length}/${missions.defs.length} missions done. Menu / P for missions.` : 'Welcome! Hold RT / Shift for throttle, pull back (S) above 100 km/h to take off. View / ? for controls.', 6);

// ---- headless/test hook
window.pg = {
  G, world, stations: world.stations, THREE, coins, missions, fx, MESH, CAB, weather, weatherNames: WEATHERS, life, setWeather: (n, o) => { const r = weather.set(n, o); syncAudio(); return r; },
  cam: camera, scn: scene, rnd: renderer, shotFrom(px, py, pz, tx, ty, tz) { syncMeshes(0); camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.near = 1; camera.updateProjectionMatrix(); for (let i = 0; i < 4; i++) weather.update(0.5, cur().pos); renderer.render(scene, camera); return true; },
  get audio() { return audio; }, initAudio() { initAudio(); return !!audio; }, get music() { return musicStatus; },
  get progress() { return P; }, save() { return persist(); }, reload() { P = load(); applyProgress(); return P; }, resetProgress() { resetProgress(); }, menuOpen() { openMenu(); }, menuItems() { return menu.items.map((x) => x.header || x.info || x.label); },
  startMission(id) { const d = missions.defs.find((x) => x.id === id), s0 = world.stations[d.start]; respawn(d.vehicle, s0); const v = cur(); v.battery = 100;
    if (d.vehicle === 'blimp') v.pos.y = s0.h + BLIMP.clear; simTick({ ...ZERO }); tryStartMission(); return G.mission ? G.mission.def.id : null; },
  get climb() { return { ms: climbEMA, norm: climbNorm() }; },
  step(n = 1, inp = {}) { for (let i = 0; i < n; i++) { simTick({ ...ZERO, ...inp }); updateClimb(DT); } life.update(Math.min(0.1, n * DT), cur().pos); syncMeshes(n * DT); updateCamera(n * DT); updateHUD(n * DT); return this.info(); },
  render() { snapCam = true; syncMeshes(0); updateCamera(0); updateHUD(0); renderer.render(scene, camera); return true; },
  press(a) { handle(a); return this.info(); },
  frame(dt = DT) { frame(dt, merged()); return this.info(); }, // one real frame through the input path (gamepad/keyboard)
  chill(on = true) { setChill(on, true); }, lookCaps: LOOK_CAPS, view(mode = 'cockpit') { setCockpit(mode === 'cockpit', true); return mode; }, vehicle(kind) { for (let k = 0; k < 6 && kind !== G.vehicle; k++) switchVehicle(); }, respawn(i = 0, kind = G.vehicle) { return respawn(kind, world.stations[i]).name; },
  VEHICLES, hullOnWater, get lift() { return G.glider.lift; },
  set(o) { const v = cur(); if (o.x != null) v.pos.x = o.x; if (o.z != null) v.pos.z = o.z; if (o.y != null) v.pos.y = o.y; if (o.agl != null) v.pos.y = world.groundAt(v.pos.x, v.pos.z).h + o.agl;
    if (o.battery != null) v.battery = o.battery; if (o.throttle != null) v.throttle = o.throttle; if (o.speed != null) v.v = o.speed;
    if (winged()) { if (o.grounded != null) { v.grounded = o.grounded; if (G.vehicle === 'seaplane') v.onWater = o.grounded; } if (o.heading != null || o.pitch != null) { setPlaneAttitude(v, o.heading ?? headingOf(v), o.pitch ?? 0); v.hd = o.heading ?? headingOf(v); } }
    else if (o.heading != null) v.yaw = o.heading;
    if (o.look) Object.assign(G.look, o.look); if (o.zoom != null) G.zoom = o.zoom; /* zoom: chase-camera distance multiplier (stills) */ snapCam = true; return this.info(); },
  hold(inp) { G.hold = inp; },
  toast(msg, secs = 3.2) { if (msg) toast(msg, secs); else { toastT = 0; $('toast').classList.remove('show'); } },
  info() { const v = cur(); return { t: +G.t.toFixed(3), vehicle: G.vehicle, chill: G.chill, view: G.cockpit ? 'cockpit' : 'chase', x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(1), z: +v.pos.z.toFixed(1), ground: +world.groundAt(v.pos.x, v.pos.z).h.toFixed(1), speed: +(v.v * 3.6).toFixed(1), battery: +v.battery.toFixed(2), charging: v.charging, grounded: v.grounded, crashed: !!v.crashed, lastEvent, onWater: hullOnWater(), lift: G.vehicle === 'glider' ? +G.glider.lift.toFixed(2) : 0, coins: P.coins, found: P.collected.length, mission: G.mission ? G.mission.def.id : null, objective: G.mission ? G.objective : '', lastResult: G.lastResult || null }; },
  ready: true,
};
// Perf 1.0.8.1 (Flow): compile every shader at load and do one warm-up render, so the first vehicle switch, first cabin
// toggle, glider thermals and weather layers don't stall on a shader compile/link mid-flight. Two light setups exist:
// chase view and cockpit view. Since 1.0.8.2 no cockpit has a light, so pass 2 only adds the shared cockpit Lambert/Basic/gauge programs.
// Everything (hidden vehicles, cabins, thermals, rain layers) is made visible and un-culled for these two frames only.
function prewarm() {
  const saved = [], cabs = new Set(Object.values(CAB).map((c) => c.group));
  scene.traverse((o) => { saved.push([o, o.visible, o.frustumCulled]); o.frustumCulled = false; if (!cabs.has(o)) o.visible = true; });
  const pass = () => { renderer.compile(scene, camera); renderer.render(scene, camera); };
  for (const c of cabs) c.visible = false; pass();          // chase view
  planeCab.group.visible = true; pass();                    // cockpit view: shared cockpit programs (all six cockpits use the same ones)
  for (const [o, v, fc] of saved) { o.visible = v; o.frustumCulled = fc; }
  if (renderer.info && renderer.info.programs) console.log('prewarm: ' + renderer.info.programs.length + ' programs');
}
prewarm(); syncMeshes(0);
if (!manual) { let last = performance.now(); const loop = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; frame(dt, merged()); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
else { pg.render(); }
document.title = document.title + (manual ? ' [manual]' : '');
