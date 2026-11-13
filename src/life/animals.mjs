// Animals: the signature COWS + sheep, horses, deer and ground birds (LIFE_DESIGN.md counts).
//  - 1.0.8.2: up to 360 cows (was 120-180); home herds 250-450 m off Home Field + cottage field. 120-180 cows (calves included, at ~0.55 scale beside their mums): the main herds at Ridge Farms, plus wild meadow
//    herds, a shaggy highland herd up high and two beach herds with cows wading in the shallows. Coats: black-and-white,
//    brown, black, cream, belted, highland ginger. Secret cows: a GOLDEN cow alone on the highest summit near Summit
//    Launch (chime + onSecret callback within 60 m) and one on the Harbor Town rooftop (the cow on a boat is in sea.mjs).
//  - Animation runs on the GPU (lifekit shader): heads dip to graze and lift to look at a low flyer, tails swish, legs
//    swing while walking. JS only walks animals within NEAR m, about 1/7 of them per frame, and only while heads are up.
//  - Draw calls: cows (all looks, one geometry with variants), sheep, horses, deer, birds + one far-LOD box mesh = 6 max,
//    and pools with nothing in range are hidden (0 calls).
//  - Moo: within 250 m of a herd and below ~150 m above it, a nearby cow moos every 8-16 s (max 2 at once). Sheep baa.
import * as THREE from '../../vendor/three.module.js';
import { Builder, lifeMaterial, tickMaterial, Pool, rng, grazeAmt, PART } from './lifekit.mjs';
import { getLayout } from './layout.mjs';
import { moo, baa, chime, spatial } from './sounds.mjs';

const NEAR = 220, FAR = 1600;
const A = { pools: {}, all: [], movers: [], t: 0, refreshT: 0, mooT: 3, lastP: null, vel: { x: 0, z: -1 }, root: null, cursor: 0 };
export const animals = A;
const COAT = { holstein: [0xf7f4ee], brown: [0x8b5a2b, 0xa0522d, 0x7a4a26, 0xc68a4e], black: [0x2b2b2b, 0x3a3230], cream: [0xe9d8b4, 0xf0e2c4], belted: [0x2b2b2b, 0x6b3f22], highland: [0xc2672f, 0xb35a26, 0xd9893e, 0x8e4a22] };
export const COW_MAX = 360;
const SPOTS = 0x1e1e1e;

// --------------------------------------------------------------- geometries (forward = +Z)
// one cow geometry, four looks picked per instance (variant bits): 0 plain coat, 1 black-and-white patches, 2 shaggy highland, 3 belted
export const COWV = { plain: 0, holstein: 1, highland: 2, belted: 3 };
export function cowGeom() {
  const B = new Builder(), T = { tint: 1 }, head = { part: PART.HEAD, pivot: [0, 1.3, 0.85] }, headT = { ...head, tint: 1 }, STD = 1 | 2 | 8, HL = 4;
  B.variant(STD).box(1.0, 0.95, 1.9, 0, 1.15, 0, 0xffffff, { ...T, shade: [1.0, 0.8] });
  B.variant(HL).box(1.15, 1.0, 1.95, 0, 1.15, 0, 0xffffff, { ...T, shade: [1.0, 0.75] }); B.box(1.25, 0.35, 1.7, 0, 0.62, 0, 0xffffff, { ...T, shade: [0.9, 0.7] });
  B.variant(2).box(1.04, 0.5, 0.55, 0, 1.3, 0.25, SPOTS); B.box(1.04, 0.45, 0.4, 0.0, 1.0, -0.55, SPOTS); B.box(0.6, 0.06, 0.6, -0.15, 1.64, -0.2, SPOTS); B.box(0.5, 0.3, 0.3, 0, 1.4, 1.38, SPOTS, head);
  B.variant(8).box(1.05, 0.99, 0.5, 0, 1.15, 0.05, 0xf4f1ea);
  B.variant(STD).box(0.38, 0.18, 0.35, 0, 0.62, -0.5, 0xf2a6a6); B.variant(0);
  for (const [x, z, part] of [[-0.33, 0.68, PART.LEG_L], [0.33, 0.68, PART.LEG_R], [-0.33, -0.68, PART.LEG_R], [0.33, -0.68, PART.LEG_L]]) {
    B.box(0.22, 0.75, 0.22, x, 0.42, z, 0xffffff, { part, pivot: [x, 0.8, z], tint: 1 }); B.box(0.24, 0.12, 0.24, x, 0.06, z, 0x2b2420, { part, pivot: [x, 0.8, z] }); }
  B.box(0.45, 0.45, 0.45, 0, 1.33, 1.0, 0xffffff, headT); B.box(0.5, 0.55, 0.62, 0, 1.4, 1.35, 0xffffff, { ...headT, shade: [1, 0.85] });
  B.variant(STD).box(0.44, 0.3, 0.2, 0, 1.24, 1.72, 0xe8b0a0, head); B.variant(HL).box(0.44, 0.3, 0.2, 0, 1.24, 1.72, 0x5a3a2a, head); B.variant(0);
  B.box(0.08, 0.08, 0.04, -0.15, 1.5, 1.67, 0x111111, head); B.box(0.08, 0.08, 0.04, 0.15, 1.5, 1.67, 0x111111, head);
  B.box(0.28, 0.12, 0.14, -0.38, 1.55, 1.25, 0xffffff, { ...headT, rz: 0.3 }); B.box(0.28, 0.12, 0.14, 0.38, 1.55, 1.25, 0xffffff, { ...headT, rz: -0.3 });
  B.variant(HL); for (const s of [-1, 1]) { B.cone(0.07, 0.75, 5, s * 0.55, 1.78, 1.2, 0xeee2c0, { ...head, rz: -s * 1.1 }); B.cone(0.06, 0.35, 5, s * 0.82, 2.03, 1.2, 0xeee2c0, { ...head, rz: -s * 0.2 }); }
  B.box(0.56, 0.3, 0.2, 0, 1.62, 1.68, 0xffffff, { ...headT, rx: 0.4 });
  B.variant(STD); for (const s of [-1, 1]) B.cone(0.05, 0.22, 5, s * 0.2, 1.75, 1.2, 0xeee2c0, head); B.variant(0);
  const tail = { part: PART.TAIL, pivot: [0, 1.55, -0.95] }; B.box(0.07, 0.85, 0.07, 0, 1.15, -0.98, 0xffffff, { ...tail, tint: 1 }); B.box(0.14, 0.22, 0.14, 0, 0.72, -0.98, 0x222222, tail);
  return B.build();
}
export function deerGeom() { const B = new Builder(), T = { tint: 1 }, head = { part: PART.HEAD, pivot: [0, 1.25, 0.6] }, hT = { ...head, tint: 1 };
  B.box(0.45, 0.55, 1.3, 0, 1.05, 0, 0xffffff, { ...T, shade: [1, 0.8] }); B.box(0.3, 0.2, 0.2, 0, 1.0, -0.66, 0xf4efe6);
  for (const [x, z, part] of [[-0.15, 0.5, PART.LEG_L], [0.15, 0.5, PART.LEG_R], [-0.15, -0.5, PART.LEG_R], [0.15, -0.5, PART.LEG_L]]) B.box(0.09, 0.85, 0.09, x, 0.42, z, 0xffffff, { part, pivot: [x, 0.85, z], tint: 1 });
  B.box(0.2, 0.6, 0.22, 0, 1.45, 0.7, 0xffffff, { ...hT, rx: 0.4 }); B.box(0.22, 0.24, 0.45, 0, 1.75, 0.9, 0xffffff, hT); B.box(0.1, 0.1, 0.06, 0, 1.7, 1.13, 0x222222, head);
  B.box(0.18, 0.08, 0.06, -0.15, 1.9, 0.8, 0xffffff, { ...hT, rz: 0.5 }); B.box(0.18, 0.08, 0.06, 0.15, 1.9, 0.8, 0xffffff, { ...hT, rz: -0.5 });
  B.variant(2); for (const s of [-1, 1]) { B.box(0.05, 0.5, 0.05, s * 0.12, 2.1, 0.82, 0xd9c7a2, { ...head, rz: -s * 0.35 }); B.box(0.05, 0.25, 0.05, s * 0.22, 2.2, 0.92, 0xd9c7a2, { ...head, rx: 0.6 }); }
  return B.build(); }
export function sheepGeom() { const B = new Builder(), head = { part: PART.HEAD, pivot: [0, 0.9, 0.5] };
  B.ball(0.62, 0, 0.95, 0, 0xffffff, { detail: 1, sx: 0.95, sy: 0.75, sz: 1.2, tint: 1 }); B.ball(0.3, 0, 1.2, 0.45, 0xffffff, { detail: 0, tint: 1 });
  B.box(0.3, 0.32, 0.42, 0, 0.98, 0.78, 0x2b2622, head); B.box(0.2, 0.08, 0.1, -0.2, 1.05, 0.7, 0x2b2622, { ...head, rz: 0.4 }); B.box(0.2, 0.08, 0.1, 0.2, 1.05, 0.7, 0x2b2622, { ...head, rz: -0.4 });
  for (const [x, z, part] of [[-0.22, 0.35, PART.LEG_L], [0.22, 0.35, PART.LEG_R], [-0.22, -0.35, PART.LEG_R], [0.22, -0.35, PART.LEG_L]]) B.box(0.1, 0.55, 0.1, x, 0.28, z, 0x2b2622, { part, pivot: [x, 0.55, z] });
  B.box(0.12, 0.18, 0.1, 0, 1.0, -0.7, 0xffffff, { part: PART.TAIL, pivot: [0, 1.05, -0.68], tint: 1 }); return B.build(); }
export function horseGeom() { const B = new Builder(), T = { tint: 1 }, head = { part: PART.HEAD, pivot: [0, 1.75, 0.85] }, hT = { ...head, tint: 1 };
  B.box(0.7, 0.8, 2.0, 0, 1.55, 0, 0xffffff, { ...T, shade: [1, 0.8] });
  for (const [x, z, part] of [[-0.24, 0.75, PART.LEG_L], [0.24, 0.75, PART.LEG_R], [-0.24, -0.75, PART.LEG_R], [0.24, -0.75, PART.LEG_L]]) { B.box(0.16, 1.2, 0.16, x, 0.6, z, 0xffffff, { part, pivot: [x, 1.2, z], tint: 1 }); B.box(0.18, 0.12, 0.18, x, 0.06, z, 0x222222, { part, pivot: [x, 1.2, z] }); }
  B.box(0.36, 0.95, 0.42, 0, 2.05, 1.05, 0xffffff, { ...hT, rx: 0.55 }); B.box(0.34, 0.34, 0.8, 0, 2.38, 1.5, 0xffffff, { ...hT, rx: 0.25 }); B.box(0.08, 0.6, 0.5, 0, 2.3, 0.95, 0x2a1c14, { ...head, rx: 0.55 });
  B.box(0.07, 0.2, 0.08, -0.1, 2.62, 1.25, 0x2a1c14, head); B.box(0.07, 0.2, 0.08, 0.1, 2.62, 1.25, 0x2a1c14, head);
  B.box(0.18, 0.9, 0.16, 0, 1.25, -1.05, 0x2a1c14, { part: PART.TAIL, pivot: [0, 1.85, -1.0], rx: -0.15 }); return B.build(); }
export function birdGeom() { const B = new Builder(), head = { part: PART.PECK, pivot: [0, 0.32, 0.12] };
  B.ball(0.2, 0, 0.3, 0, 0xffffff, { detail: 0, sz: 1.3, tint: 1 }); B.ball(0.11, 0, 0.5, 0.18, 0xffffff, { ...head, tint: 1 }); B.cone(0.04, 0.12, 4, 0, 0.5, 0.31, 0xf2a03a, { ...head, rx: Math.PI / 2 });
  B.box(0.05, 0.1, 0.1, 0, 0.62, 0.17, 0xe0402e, head); B.box(0.03, 0.18, 0.03, -0.06, 0.09, 0, 0xf2a03a); B.box(0.03, 0.18, 0.03, 0.06, 0.09, 0, 0xf2a03a); B.box(0.15, 0.18, 0.06, 0, 0.42, -0.24, 0xffffff, { tint: 1, rx: -0.5 }); return B.build(); }
export function farGeom() { const B = new Builder(), T = { tint: 1 }, D = { tint: 1, shade: [0.72, 0.55] }; B.box(0.95, 0.85, 2.0, 0, 1.25, 0, 0xffffff, T); B.box(0.5, 0.5, 0.65, 0, 1.45, 1.25, 0xffffff, T); for (const [lx, lz] of [[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.7], [0.3, -0.7]]) B.box(0.22, 0.85, 0.22, lx, 0.42, lz, 0xffffff, D); B.box(0.12, 0.6, 0.12, 0, 1.15, -1.05, 0xffffff, D);
  // black-and-white cows only: dark saddle + head patch so they read as patched from afar (no extra draw calls)
  B.variant(2).box(1.07, 0.62, 0.75, 0, 1.42, 0.3, 0x262626); B.box(1.07, 0.55, 0.5, 0, 1.18, -0.6, 0x262626); B.box(0.6, 0.36, 0.42, 0, 1.6, 1.25, 0x262626); B.variant(0); return B.build(); }

// --------------------------------------------------------------- init
export function init(scene, tq, opts = {}) {
  const L = getLayout(tq), R = rng(777), H = tq.heightAt; A.H = H; A.root = new THREE.Group(); A.root.name = 'life-animals'; A.onSecret = opts.onSecret || null;
  A.mat = lifeMaterial({ nearR: 140, lowH: 120 }); A.farMat = lifeMaterial({ grow: [NEAR, 1000, 2.0] });
  const P = A.pools; P.cow = new Pool(cowGeom(), A.mat, 240, { far: NEAR, name: 'life-cows' }); P.sheep = new Pool(sheepGeom(), A.mat, 48, { far: NEAR, name: 'life-sheep' });
  P.horse = new Pool(horseGeom(), A.mat, 12, { far: NEAR, name: 'life-horses' }); P.deer = new Pool(deerGeom(), A.mat, 10, { far: NEAR, name: 'life-deer' });
  P.bird = new Pool(birdGeom(), A.mat, 48, { far: 260, name: 'life-birds' }); P.far = new Pool(farGeom(), A.farMat, 520, { far: FAR, name: 'life-animals-far' });
  for (const k in P) A.root.add(P[k].mesh);
  const spot = (h, r, okWater) => { for (let k = 0; k < 14; k++) { const a = R() * 6.283, d = Math.sqrt(R()) * r, x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d, y = H(x, z); if (okWater ? y > -0.85 && y < 3 : y > 0.6) return { x, z }; } return null; };
  const add = (kind, it) => { it.kind = kind; it.y = Math.max(-0.85, H(it.x, it.z)); it.ry = it.ry ?? R() * 6.283; it.ph = R() * 6.283; it.tx = it.x; it.tz = it.z; it.wait = R() * 6; A.all.push(it);
    P[kind === 'calf' ? 'cow' : kind].add(it); if (kind !== 'bird') P.far.add(it.far = { x: it.x, y: it.y, z: it.z, ry: it.ry, s: it.s, col: it.col, ph: 0, v: (kind === 'cow' || kind === 'calf') ? (it.v || 0) : 0, src: it }); return it; };
  let cows = 0, calves = 0, wading = 0; const room = () => cows + calves < COW_MAX - L.secrets.length;
  const look = (variant) => (variant === 'mixed' ? ['holstein', 'brown', 'black', 'cream', 'belted', 'holstein'][Math.floor(R() * 6)] : variant);
  for (const h of L.herds) { const beach = h.beach != null;
    for (let i = 0; i < h.n && room(); i++) { const p = spot(h, h.r, beach); if (!p) continue; const variant = look(h.variant), coats = COAT[variant], col = coats[Math.floor(R() * coats.length)];
      const v = variant === 'holstein' ? COWV.holstein : variant === 'highland' ? COWV.highland : variant === 'belted' ? COWV.belted : COWV.plain;
      const cow = add('cow', { ...p, s: 0.95 + R() * 0.15, col, v, home: h, speed: 0.32 }); cows++; if (cow.y < 0) wading++;
      if (R() < 0.25 && room()) { const a = cow.ry + Math.PI / 2, c = add('calf', { x: p.x + Math.sin(a) * 1.7, z: p.z + Math.cos(a) * 1.7, s: 0.55, col: v === COWV.plain ? coats[(coats.indexOf(col) + 1) % coats.length] : col, v, mum: cow, speed: 0.5, ry: cow.ry }); calves++; c.home = h; } } }
  for (const b of L.beaches) for (let k = 0; k < 3 && room(); k++) { const d = 6 + k * 5, a = b.ang + (k - 1) * 0.35, x = b.sx + Math.cos(a) * d, z = b.sz + Math.sin(a) * d; if (H(x, z) > -0.85 && H(x, z) < 0.1) { add('cow', { x, z, s: 1, col: COAT.brown[k % 4], v: 0, home: { x, z, r: 4, beach: b.ang }, speed: 0.15 }); cows++; wading++; } }
  A.secrets = []; for (const sc of L.secrets) { const c = add('cow', { x: sc.x, z: sc.z, s: 1, col: sc.col, v: sc.kind === 'golden' ? 0 : COWV.holstein, home: { x: sc.x, z: sc.z, r: 0 }, speed: 0, secret: sc.kind, ry: 2.3 });
    c.y = sc.y; c.far.y = sc.y; c.farMul = 3; c.far.farMul = 3; cows++; A.secrets.push(c); }
  for (const f of L.flocks) for (let i = 0; i < f.n; i++) { const p = spot(f, f.r, false); if (p) add('sheep', { ...p, s: 0.9 + R() * 0.2, col: R() < 0.12 ? 0x3a3330 : 0xf3efe6, home: f, speed: 0.4 }); }
  const HC = [0x8b4a2b, 0x5a3825, 0xf0ece4, 0x2a2a2a, 0xa8743f];
  for (const h of L.horses) for (let i = 0; i < h.n; i++) { const p = spot(h, h.r, false); if (p) add('horse', { ...p, s: 1, col: HC[Math.floor(R() * HC.length)], home: h, speed: 0.7 }); }
  for (const d of L.deer) for (let i = 0; i < d.n; i++) { const p = spot(d, d.r, false); if (p) add('deer', { ...p, s: 1, col: 0xa8703f, v: i === 0 ? 1 : 0, home: d, speed: 0.6, shy: true }); }
  for (const b of L.birds) for (let i = 0; i < b.n; i++) { const p = spot(b, b.r, false); if (p) add('bird', { ...p, s: b.kind === 'chicken' ? 1 : 0.75, col: b.kind === 'chicken' ? [0xffffff, 0xc8742f, 0x8a5a3a][i % 3] : 0x9aa4b0, home: b, speed: 0.6 }); }
  const n = (k) => A.all.filter((a) => a.kind === k).length;
  A.counts = { cows: cows + calves, adults: cows, calves, wading, secretCows: A.secrets.map((c) => c.secret), herds: L.herds.length, sheep: n('sheep'), horses: n('horse'), deer: n('deer'), birds: n('bird') };
  A.root.traverse((o) => { o.matrixAutoUpdate = false; }); scene.add(A.root);
  return A;
}

// --------------------------------------------------------------- update
const _near = { p: null, n2: 0 }; function nearF(it) { const dx = it.x - _near.p.x, dz = it.z - _near.p.z; return dx * dx + dz * dz < _near.n2 * (it.farMul || 1); }
function farF(f) { return !nearF(f.src); }
export function update(dt, p) {
  if (!A.root) return; A.t += dt; const t = A.t; tickMaterial(A.mat, t, p); tickMaterial(A.farMat, t, p);
  if (A.lastP) { const vx = (p.x - A.lastP.x) / Math.max(dt, 1e-3), vz = (p.z - A.lastP.z) / Math.max(dt, 1e-3); if (vx * vx + vz * vz > 1) { A.vel.x = vx; A.vel.z = vz; } A.lastP.x = p.x; A.lastP.z = p.z; } else A.lastP = { x: p.x, z: p.z };
  const P = A.pools;
  if ((A.refreshT -= dt) <= 0) { A.refreshT = 0.4; _near.p = p; _near.n2 = NEAR * NEAR;
    P.cow.refresh(p, nearF); P.sheep.refresh(p, nearF); P.horse.refresh(p, nearF); P.deer.refresh(p, nearF); P.bird.refresh(p);
    for (const f of P.far.items) { const s = f.src; f.x = s.x; f.z = s.z; f.y = s.y; f.ry = s.ry; }
    P.far.refresh(p, farF);
    A.movers.length = 0; for (const a of A.all) if (a.speed > 0 && a.slot >= 0) A.movers.push(a); }
  const agl = p.y - Math.max(0, A.H(p.x, p.z));
  // walk a slice of the near animals each frame (each one is updated about 7x a second)
  const M = A.movers, n = M.length, slice = Math.ceil(n / 7), step = dt * 7;
  for (let k = 0; k < slice && n; k++) { const a = M[(A.cursor + k) % n]; const g = grazeAmt(t, a.ph);
    if (a.shy && agl < 120 && Math.hypot(a.x - p.x, a.z - p.z) < 160) { const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz) || 1; a.tx = a.home.x + dx / d * a.home.r; a.tz = a.home.z + dz / d * a.home.r; a.wait = 3; a.run = 2.5; } // deer trot off
    else if (a.mum) { const m = a.mum, side = m.ry + Math.PI / 2; a.tx = m.x + Math.sin(side) * 1.8 - Math.sin(m.ry) * 0.6; a.tz = m.z + Math.cos(side) * 1.8 - Math.cos(m.ry) * 0.6; }
    else if ((a.wait -= step) <= 0 && Math.hypot(a.tx - a.x, a.tz - a.z) < 0.5) { const h = a.home, r = (h.r || 10) * 0.9; for (let q = 0; q < 6; q++) { const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r, x = h.x + Math.cos(ang) * d, z = h.z + Math.sin(ang) * d, y = A.H(x, z);
        if (h.beach != null ? y > -0.85 && y < 3 : y > 0.6) { a.tx = x; a.tz = z; break; } } a.wait = 4 + Math.random() * 10; a.run = 1; }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz), moving = a.kind === 'bird' || a.mum || a.run > 1 ? d > 0.4 : g < 0.2 && d > 0.4;
    if (moving) { const want = Math.atan2(dx, dz); let dr = want - a.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); a.ry += Math.max(-1.2 * step, Math.min(1.2 * step, dr));
      const sp = Math.min(d, a.speed * (a.run || 1) * step * (Math.abs(dr) < 0.8 ? 1 : 0.3) * (a.mum && d > 3 ? 2 : 1)); a.x += Math.sin(a.ry) * sp; a.z += Math.cos(a.ry) * sp; a.y = Math.max(-0.85, A.H(a.x, a.z));
      P[a.kind === 'calf' ? 'cow' : a.kind].touch(a); } }
  A.cursor = n ? (A.cursor + slice) % n : 0;
  for (const k in P) P[k].flush();
  if ((A.mooT -= dt) <= 0) { A.mooT = 0.5; let best = null, bd = 1e9;
    for (const a of A.all) { if (a.slot < 0 || a.kind === 'bird' || a.kind === 'horse' || a.kind === 'deer' || a.secret) continue; const dx = a.x - p.x, dz = a.z - p.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = a; } }
    bd = Math.sqrt(bd); A.playing = (A.playing || []).filter((e) => e > t);
    if (best && bd < 250 && p.y - best.y < 150 && A.playing.length < 2) { const s = spatial(p.x, p.z, A.vel.x, A.vel.z, best.x, best.z, 300), g = 0.3 + 0.7 * s.gain;
      const ok = best.kind === 'sheep' ? baa({ gain: g * 0.8, pan: s.pan }) : moo({ gain: g, pan: s.pan, pitch: best.kind === 'calf' ? 1.55 : best.v === COWV.highland ? 0.85 : 1 });
      if (ok) A.playing.push(t + 1.6); A.mooT = ok ? 8 + Math.random() * 8 : 1.5; A.lastMoo = { kind: best.kind, d: Math.round(bd), played: ok, t: +t.toFixed(1) }; } }
  // secret cows: a little chime + callback the first time you fly within 60 m (the game can toast / save it)
  for (const c of A.secrets) if (!c.found && Math.hypot(c.x - p.x, c.z - p.z, c.y - p.y) < 60) { c.found = true; chime(); if (A.onSecret) A.onSecret(c.secret, c); }
}
export function stats() { const c = {}; for (const k in A.pools) c[k] = A.pools[k].mesh.count; return { ...A.counts, live: c, lastMoo: A.lastMoo || null }; }
