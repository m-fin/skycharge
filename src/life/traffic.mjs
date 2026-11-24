// AI air traffic: 9 calm aircraft. 3 small electric planes on gentle loops (300-700 m), 1 slow blimp, 2 hot-air
// balloons drifting with the westerly, 1 hang glider circling a thermal, and a flying car + a flying scooter that hop
// between pockets and drop down to rest beside the charging stations and the seaplane dock.
// Rules: simple steering (turn-rate limited, look-ahead terrain clearance), always yield to the player (steer away
// inside 260 m, hard keep-out bubble at 90 m, so they never touch you), friendly wing-wave when you fly close, and nothing
// crosses a runway approach (+-600 m along the runway axis, +-90 m to the side) below 200 m: the car and scooter come
// straight down beside the pad, off the runway axis.
// Two instanced meshes (small craft / blimp + balloons), 6 looks via variant bits = 2 draw calls.
import * as THREE from '../../vendor/three.module.js';
import { Builder, lifeMaterial, tickMaterial, Pool, rng, PART } from './lifekit.mjs';
import { getLayout } from './layout.mjs';

const K = { PLANE: 0, BLIMP: 1, BALLOON: 2, GLIDER: 3, CAR: 4, SCOOTER: 5 };
const T = { t: 0, pool: null, craft: [], root: null, refreshT: 0, waves: 0 };
export const traffic = T;

export function aircraftGeom() {
  const B = new Builder(), O = 0xf7931a;
  B.variant(1 << K.PLANE); B.box(1.1, 1.1, 6.5, 0, 0, 0, 0xffffff, { shade: [1, 0.8] }); B.cone(0.78, 1.4, 4, 0, 0, 3.9, 0xffffff, { rx: Math.PI / 2, ry: Math.PI / 4 }); B.box(1.12, 0.4, 1.8, 0, 0.35, 1.4, 0x8fc3dd);
  B.box(10, 0.14, 1.4, 0, 0.45, 0.6, 0xffffff, { tint: 1 }); for (const s of [-1, 1]) B.box(0.8, 0.16, 1.42, s * 4.7, 0.46, 0.6, O); B.box(3.6, 0.1, 0.9, 0, 0.2, -3.0, 0xffffff); B.box(0.12, 1.5, 1.0, 0, 0.9, -3.0, 0xffffff, { tint: 1 });
  B.box(0.18, 2.2, 0.06, 0, 0, 4.65, 0x333333, { part: PART.SPIN, pivot: [0, 0, 4.65] }); B.box(1.12, 0.12, 4.0, 0, -0.3, -0.5, O);
  B.variant(1 << K.BLIMP); B.ball(1, 0, 0, 0, 0xf5f5f0, { detail: 1, sx: 4.2, sy: 4.2, sz: 15, shade: [1, 0.8] }); B.cyl(4.25, 4.25, 1.2, 10, 0, 0, 2, O, { rx: Math.PI / 2, open: true });
  B.box(1.6, 1.4, 4, 0, -4.6, 1.5, 0xffffff); B.box(1.62, 0.5, 3.2, 0, -4.4, 1.7, 0x8fc3dd); for (const s of [-1, 1]) { B.box(0.2, 3.2, 3, s * 2.6, s * 0, -12.5, O, { rz: s * 0.8 }); B.cyl(0.4, 0.4, 1.2, 6, s * 1.6, -4.3, -0.4, 0x666666, { rx: Math.PI / 2 }); B.box(0.12, 1.6, 0.06, s * 1.6, -4.3, -1.05, 0x333333, { part: PART.SPIN, pivot: [s * 1.6, -4.3, -1.05] }); }
  B.box(0.2, 3.2, 3, 0, 3.4, -12.5, O); B.box(0.2, 3.2, 3, 0, -3.4, -12.5, O);
  B.variant(1 << K.BALLOON); for (let i = 0; i < 12; i++) B.add(new THREE.SphereGeometry(8, 1, 5, i / 12 * 6.283, 6.283 / 12, 0, Math.PI * 0.78), new THREE.Matrix4().makeTranslation(0, 13, 0), i % 2 ? 0xffffff : 0xffffff, { tint: i % 2 ? 0 : 1 });
  B.cone(3.0, 3.2, 8, 0, 4.6, 0, 0xffffff, { rx: Math.PI, tint: 1 }); B.box(1.8, 1.2, 1.8, 0, 0.6, 0, 0x9a6a40); for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.box(0.05, 2.6, 0.05, x, 2.4, z, 0x444444);
  B.ball(0.3, 0.4, 1.6, 0, 0xe8b894); B.ball(0.3, -0.4, 1.6, 0.2, 0xe8b894); B.box(0.12, 0.6, 0.12, 0.6, 1.9, 0, 0xe8b894, { part: PART.ARM, pivot: [0.6, 1.6, 0] });
  B.variant(1 << K.GLIDER); { const s = new THREE.Shape([new THREE.Vector2(-5, -1.2), new THREE.Vector2(0, 2.2), new THREE.Vector2(5, -1.2), new THREE.Vector2(0, -0.4)]); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
    const g2 = g.clone(); g2.rotateZ(Math.PI); B.add(g, new THREE.Matrix4().makeTranslation(0, 1.6, 0), 0xffffff, { tint: 1 }); B.add(g2, new THREE.Matrix4().makeTranslation(0, 1.6, 0), 0xffffff, { tint: 1 }); }
  B.box(0.06, 1.6, 0.06, 0, 0.8, 0.2, 0x555555); B.box(1.4, 0.06, 0.06, 0, 0, 0.6, 0x555555); B.box(0.4, 0.35, 1.6, 0, 0.3, -0.2, 0x2f5f86); B.ball(0.18, 0, 0.35, 0.65, 0xf2c94c);
  B.variant(1 << K.CAR); B.box(2.0, 0.6, 4.4, 0, 0, 0, 0xffffff, { tint: 1, shade: [1, 0.75] }); B.box(1.6, 0.5, 2.0, 0, 0.5, -0.3, 0x2c3e50); B.box(1.9, 0.2, 0.6, 0, 0.25, 2.1, 0xffffff, { tint: 1 });
  for (const [x, z] of [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]]) { B.cyl(0.36, 0.36, 0.3, 6, x, -0.25, z, 0x222222, { rz: Math.PI / 2 }); B.cyl(0.32, 0.22, 0.25, 5, x * 1.05, -0.45, z, 0xdfe8ee); B.cyl(0.18, 0.05, 0.3, 4, x * 1.05, -0.7, z, 0xbfe9f7); }
  B.box(1.9, 0.12, 0.08, 0, 0.12, -2.22, 0xe2574c); B.box(0.5, 0.12, 0.05, -0.7, 0.12, 2.42, 0xffffe0); B.box(0.5, 0.12, 0.05, 0.7, 0.12, 2.42, 0xffffe0);
  B.variant(1 << K.SCOOTER); B.box(0.45, 0.15, 1.6, 0, 0, 0, 0xffffff, { tint: 1 }); B.box(0.08, 1.1, 0.08, 0, 0.55, 0.75, 0x333333, { rx: -0.15 }); B.box(0.7, 0.07, 0.07, 0, 1.12, 0.85, 0x333333);
  for (const z of [-0.65, 0.75]) { B.cyl(0.2, 0.2, 0.1, 6, 0, -0.1, z, 0x222222, { rz: Math.PI / 2 }); } for (const s of [-1, 1]) { B.cyl(0.18, 0.12, 0.5, 5, s * 0.38, -0.05, -0.4, 0xdfe8ee, { rx: Math.PI / 2 }); B.cyl(0.08, 0.02, 0.25, 4, s * 0.38, -0.05, -0.75, 0xbfe9f7, { rx: Math.PI / 2 }); }
  B.variant(0); return B.build();
}

// keep only the triangles whose variant mask overlaps `mask` (or shows on every variant)
function variantSubset(g, mask) { const v = g.attributes.aVar.array, keep = []; for (let i = 0; i < v.length; i += 3) if (!v[i] || (v[i] & mask)) keep.push(i);
  const out = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) { const n = a.itemSize, src = a.array, dst = new Float32Array(keep.length * 3 * n); let o = 0;
    for (const i of keep) for (let j = i * n; j < (i + 3) * n; j++) dst[o++] = src[j]; out.setAttribute(k, new THREE.BufferAttribute(dst, n)); }
  out.computeBoundingSphere(); return out; }

export function init(scene, tq) {
  const L = getLayout(tq), R = rng(5150), H = tq.heightAt; T.H = H; T.tq = tq; T.L = L; T.root = new THREE.Group(); T.root.name = 'life-traffic';
  T.mat = lifeMaterial({ nearR: 200, lowH: 9999 }); const AG = aircraftGeom(), BIG = (1 << K.BLIMP) | (1 << K.BALLOON);
  // two pools so each craft only draws its own look's triangles: small craft (plane, glider, car, scooter) and big ones (blimp, balloons). 2 draw calls.
  T.pool = new Pool(variantSubset(AG, ~BIG & 63), T.mat, 8, { far: 6500, name: 'life-traffic' }); T.big = new Pool(variantSubset(AG, BIG), T.mat, 4, { far: 6500, name: 'life-traffic-big' }); AG.dispose(); T.root.add(T.pool.mesh, T.big.mesh);
  const P = L.pockets.filter((p) => p.type !== 'shack'), st = tq.stations;
  const wp = [...P.map((p) => ({ x: p.x, z: p.z })), ...st.map((s) => ({ x: s.x, z: s.z }))]; if (wp.length < 3) wp.push({ x: 1500, z: 1500 }, { x: -1500, z: 800 }, { x: 600, z: -1800 });
  T.wp = wp; const add = (c) => { c.vy = 0; c.bank = 0; c.waveT = 0; c.waveCd = 0; c.ry = c.ry ?? R() * 6.283; c.rx = 0; c.rz = 0; c.pool = (1 << c.v) & BIG ? T.big : T.pool; T.craft.push(c.pool.add(c)); return c; };
  const PCOL = [0x2f7c7a, 0xe2574c, 0x4a90d9];
  for (let i = 0; i < 3; i++) { const w = wp[(i * 2) % wp.length]; add({ v: K.PLANE, kind: 'plane', x: w.x + 400, z: w.z, y: 360 + i * 120, alt: 360 + i * 120, speed: 34 + i * 3, turn: 0.22, wi: (i * 2 + 1) % wp.length, col: PCOL[i] }); }
  add({ v: K.BLIMP, kind: 'blimp', x: 0, z: -2200, y: 330, alt: 330, speed: 8, turn: 0.05, orbit: { r: 2100, a: -Math.PI / 2, dir: 1 }, s: 1, col: 0xffffff });
  for (let i = 0; i < 2; i++) add({ v: K.BALLOON, kind: 'balloon', x: -2600 + i * 1700, z: -900 + i * 1500, y: 320 + i * 90, alt: 320 + i * 90, speed: 2.2, col: [0xe2574c, 0xf7931a][i], s: 1 });
  if (tq.thermals && tq.thermals.length) { const th = tq.thermals[Math.min(1, tq.thermals.length - 1)]; add({ v: K.GLIDER, kind: 'glider', th, a: 0, x: th.x, z: th.z, y: th.base + 300, speed: 12, col: 0xf2c94c }); }
  add({ v: K.CAR, kind: 'hopper', x: 300, z: 600, y: 320, alt: 320, speed: 24, turn: 0.4, state: 'cruise', col: 0x4a90d9 });
  add({ v: K.SCOOTER, kind: 'hopper', x: -500, z: -300, y: 300, alt: 300, speed: 18, turn: 0.5, state: 'cruise', col: 0xf2f2f2, dockOk: true });
  for (const c of T.craft) if (c.kind === 'hopper') pickHop(c, R);
  T.counts = { aircraft: T.craft.length, kinds: T.craft.map((c) => c.kind) };
  T.root.traverse((o) => { o.matrixAutoUpdate = false; }); scene.add(T.root); return T;
}
// hoppers alternate: a pocket fly-over, then a rest beside a charging pad (or, for the scooter, beside the seaplane dock)
function pickHop(c, R = Math.random) {
  const tq = T.tq; c.hops = (c.hops || 0) + 1;
  if (c.hops % 2 === 0) { const useDock = c.dockOk && tq.dock && R() < 0.4; let x, z, ax = 0, az = 0;
    if (useDock) { x = tq.dock.x + Math.cos(tq.dock.hd || 0) * 45; z = tq.dock.z + Math.sin(tq.dock.hd || 0) * 45; }
    else { const s = tq.stations[Math.floor(R() * tq.stations.length)]; const side = R() < 0.5 ? -1 : 1, cs = Math.cos(s.hd || 0), sn = Math.sin(s.hd || 0); x = (s.padX ?? s.x) + cs * side * (s.wid / 2 + 60); z = (s.padZ ?? s.z) + sn * side * (s.wid / 2 + 60); ax = s.x; az = s.z; }
    c.target = { x, z, rest: true, water: useDock }; }
  else { const w = T.wp[Math.floor(R() * T.wp.length)]; c.target = { x: w.x + (R() - 0.5) * 300, z: w.z + (R() - 0.5) * 300, rest: false }; }
  c.state = 'cruise';
}
// within a runway approach corridor (+-600 m past each runway end, +-90 m sideways)?
function inApproach(x, z) { for (const s of T.tq.stations) { const dx = x - s.x, dz = z - s.z, sn = Math.sin(s.hd || 0), cs = Math.cos(s.hd || 0), al = dx * sn - dz * cs, sd = dx * cs + dz * sn; if (Math.abs(al) < s.len / 2 + 600 && Math.abs(sd) < s.wid / 2 + 90) return true; } return false; }

const MIN_SEP = 90, AVOID = 260;
export function update(dt, p) {
  if (!T.root) return; T.t += dt; const t = T.t; tickMaterial(T.mat, t, p); const H = T.H;
  for (const c of T.craft) {
    let wantHd = c.ry, wantY = c.alt ?? c.y, speed = c.speed;
    if (c.kind === 'plane') { const w = T.wp[c.wi]; if (Math.hypot(w.x - c.x, w.z - c.z) < 260) c.wi = (c.wi + 1 + Math.floor(Math.random() * 2)) % T.wp.length; wantHd = Math.atan2(w.x - c.x, w.z - c.z); }
    else if (c.kind === 'blimp') { const o = c.orbit; o.a += o.dir * c.speed / o.r * dt; const tx = Math.cos(o.a + 0.15) * o.r, tz = Math.sin(o.a + 0.15) * o.r; wantHd = Math.atan2(tx - c.x, tz - c.z); }
    else if (c.kind === 'balloon') { c.x += 2.2 * dt; if (c.x > 3400) c.x = -3400; c.z += Math.sin(t * 0.02 + c.ph) * 0.4 * dt; c.y = c.alt + Math.sin(t * 0.05 + c.ph) * 40; c.ry += 0.02 * dt; c.rz = 0; c.rx = 0; }
    else if (c.kind === 'glider') { const th = c.th; c.a += dt * c.speed / 70; c.x = th.x + Math.cos(c.a) * 70; c.z = th.z + Math.sin(c.a) * 70; c.y = th.base + 300 + Math.sin(t * 0.01) * 120; c.ry = Math.atan2(-Math.sin(c.a), Math.cos(c.a)); c.rz = 0.45; c.rx = 0; }
    else if (c.kind === 'hopper') { const tg = c.target, d = Math.hypot(tg.x - c.x, tg.z - c.z);
      if (c.state === 'cruise') { wantHd = Math.atan2(tg.x - c.x, tg.z - c.z); if (d < 40 && tg.rest) c.state = 'descend'; else if (d < 120 && !tg.rest) pickHop(c); speed = Math.min(c.speed, 4 + d * 0.2); }
      if (c.state === 'descend') { speed = 0; const gy = (tg.water ? 0 : Math.max(0, H(tg.x, tg.z))) + (c.v === K.SCOOTER ? 1.0 : 1.4); c.x += (tg.x - c.x) * Math.min(1, dt); c.z += (tg.z - c.z) * Math.min(1, dt); wantY = gy;
        if (c.y - gy < 0.3) { c.state = 'rest'; c.restT = 14 + Math.random() * 10; } }
      if (c.state === 'rest') { speed = 0; wantY = (tg.water ? 0 : Math.max(0, H(tg.x, tg.z))) + (c.v === K.SCOOTER ? 1.0 : 1.4) + Math.sin(t * 2) * 0.08; if ((c.restT -= dt) <= 0) { c.state = 'climb'; } }
      if (c.state === 'climb') { speed = 0; wantY = c.alt + 40; if (c.y > Math.max(H(c.x, c.z) + 150, 260)) pickHop(c); } }
    if (c.kind === 'balloon' || c.kind === 'glider') { avoidPlayer(c, p, dt); continue; }
    // terrain look-ahead + runway approach rule (cruise only)
    if (c.state !== 'descend' && c.state !== 'rest') { const s = Math.sin(c.ry), co = Math.cos(c.ry); let g = 0; for (const a of [0, 150, 300, 500]) g = Math.max(g, H(c.x + s * a, c.z + co * a)); wantY = Math.max(wantY, g + (c.kind === 'blimp' ? 140 : 160));
      if (inApproach(c.x + s * 200, c.z + co * 200) || inApproach(c.x, c.z)) wantY = Math.max(wantY, Math.max(0, H(c.x, c.z)) + 220); }
    // steer: limited turn rate, bank into turns, gentle climbs
    let dh = wantHd - c.ry; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); const tr = Math.max(-c.turn, Math.min(c.turn, dh * 0.6)); c.ry += tr * dt;
    c.bank += ((c.kind === 'plane' ? -tr * 2.2 : -tr * 0.8) - c.bank) * Math.min(1, dt * 1.5);
    const vyMax = c.kind === 'hopper' ? 6 : c.kind === 'blimp' ? 1.5 : 4; c.vy += (Math.max(-vyMax, Math.min(vyMax, (wantY - c.y) * 0.3)) - c.vy) * Math.min(1, dt); c.y += c.vy * dt;
    c.x += Math.sin(c.ry) * speed * dt; c.z += Math.cos(c.ry) * speed * dt; c.rx = c.kind === 'plane' ? -c.vy / Math.max(10, speed) : 0;
    // friendly wing-wave when the player passes close
    const dp = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z); c.waveCd -= dt; if (dp < 220 && c.waveCd <= 0 && c.kind === 'plane') { c.waveT = 2.6; c.waveCd = 25; T.waves++; }
    c.rz = c.bank + (c.waveT > 0 ? Math.sin((2.6 - c.waveT) * 7) * 0.45 * Math.min(1, c.waveT) : 0); if (c.waveT > 0) c.waveT -= dt;
    avoidPlayer(c, p, dt); }
  for (const c of T.craft) if (c.slot >= 0) c.pool.touch(c);
  if ((T.refreshT -= dt) <= 0) { T.refreshT = 0.5; T.pool.refresh(p); T.big.refresh(p); } else { T.pool.flush(); T.big.flush(); }
}
// yield to the player: steer away inside AVOID metres; never let anything inside MIN_SEP metres (pushes it out)
function avoidPlayer(c, p, dt) {
  const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z, d = Math.hypot(dx, dy, dz); if (d > AVOID || d < 1e-3) return;
  const k = (1 - d / AVOID), up = dy >= 0 || p.y - Math.max(0, T.H(c.x, c.z)) < 120 ? 1 : -1;
  if (c.state !== 'rest' && c.state !== 'descend') { c.x += dx / d * k * 18 * dt; c.z += dz / d * k * 18 * dt; c.y += up * k * 10 * dt; if (c.kind === 'plane' || c.kind === 'hopper') { const away = Math.atan2(dx, dz); let dh = away - c.ry; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.ry += Math.sign(dh) * Math.min(Math.abs(dh), 0.3 * k) * dt; } }
  if (d < MIN_SEP) { const s = MIN_SEP / d; c.x = p.x + dx * s; c.y = Math.max(p.y + dy * s, Math.max(0, T.H(c.x, c.z)) + 1); c.z = p.z + dz * s; T.pushes = (T.pushes || 0) + 1; }
}
export function stats() { return { ...T.counts, waves: T.waves, pushes: T.pushes || 0, hoppers: T.craft.filter((c) => c.kind === 'hopper').map((c) => c.state) }; }
