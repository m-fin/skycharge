// Sea life: sailboats on slow loops, anchored fishing boats (with a baked angler and bobbing line), boats moored at the
// Harbor Town pier, a cow drifting about in a little rowboat (secret cow #3), a message in a bottle off a beach, rare
// whale breaches (spout, leap, big splash; more likely when you fly low over open sea) and dolphin pods leaping beside
// boats or under you. Draw calls: boats + bottle 1 (one geometry, 5 variants), whale 1, dolphins 1, spray 1, and the last
// three only while an event is playing.
import * as THREE from '../../vendor/three.module.js';
import { Builder, lifeMaterial, tickMaterial, Pool, Particles, rng, PART } from './lifekit.mjs';
import { getLayout } from './layout.mjs';
import { splash, spatial } from './sounds.mjs';

const V = { SAIL: 0, FISH: 1, COWBOAT: 2, BOTTLE: 3, DINGHY: 4 };
const W = { t: 0, pool: null, boats: [], whale: null, dol: null, spray: null, root: null, refreshT: 0, whaleT: 150, dolT: 40, lastP: null, vel: { x: 0, z: -1 }, events: [] };
export const sea = W;

function hull(B, w, l, h, col, deck = 0xe9e2d0, y = 0) {
  B.box(w, h, l * 0.78, 0, y + h / 2, -l * 0.11, col, { shade: [1, 0.75] }); B.cone(w / 2 * 1.41, l * 0.32, 4, 0, y + h / 2, l * 0.39, col, { rx: Math.PI / 2, sx: 0.72, sz: h / w * 0.72 });
  B.box(w * 0.92, 0.06, l * 0.74, 0, y + h + 0.02, -l * 0.1, deck); B.box(w + 0.04, 0.12, l * 0.78, 0, y + h * 0.35, -l * 0.11, 0xffffff); }
function sail(B, x, y0, z0, z1, hgt, col = 0xfdfaf2) { for (const flip of [0, Math.PI]) { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(z1 - z0, 0), new THREE.Vector2(0, hgt)]);
  const g = new THREE.ShapeGeometry(s); g.rotateY(-Math.PI / 2 + flip); B.add(g, new THREE.Matrix4().makeTranslation(x, y0, z0), col); } }
export function boatGeom() {
  const B = new Builder();
  B.variant(1 << V.SAIL); hull(B, 2.4, 8, 1.0, 0xffffff, 0xc9a66b); B.cyl(0.08, 0.1, 9, 6, 0, 5.5, 0.6, 0xdddddd); sail(B, 0, 1.4, 0.4, -3.2, 8.4); sail(B, 0, 1.4, 0.8, 3.7, 7.6, 0xf3efe6);
  B.box(0.05, 0.05, 3.6, 0, 1.5, -1.2, 0x999999); B.box(1.2, 0.5, 1.6, 0, 1.25, -1.6, 0x2f5f86);
  B.variant(1 << V.FISH); hull(B, 3.0, 9, 1.3, 0x2f7c7a); B.box(2.0, 1.8, 2.4, 0, 2.2, 1.2, 0xffffff); B.box(2.05, 0.5, 2.0, 0, 2.6, 1.2, 0xbfe3f2); B.box(2.4, 0.15, 2.8, 0, 3.15, 1.2, 0xe2574c);
  B.cyl(0.06, 0.06, 4, 5, 0.6, 4.6, 1.8, 0xdddddd); B.box(0.6, 0.6, 0.6, -0.9, 1.6, -2.5, 0xf2c94c); // mast + buoy crate
  { const ang = { part: PART.ROD, pivot: [0.6, 2.2, -3.0] }; B.box(0.42, 0.55, 0.26, 0.6, 1.95, -3.2, 0xe2574c); B.ball(0.15, 0.6, 2.4, -3.2, 0xe8b894, { detail: 1 }); B.box(0.3, 0.1, 0.3, 0.6, 2.55, -3.2, 0xf2c94c);
    B.cyl(0.015, 0.03, 3.4, 4, 1.4, 3.2, -3.9, 0x333333, { ...ang, rz: -0.6, rx: -0.5 }); B.box(0.02, 3.4, 0.02, 2.4, 1.7, -4.6, 0xdddddd, ang); B.ball(0.12, 2.4, 0.08, -4.6, 0xe0402e, { part: PART.BOB, pivot: [2.4, 0, -4.6] }); }
  B.variant(1 << V.COWBOAT); hull(B, 1.8, 4.2, 0.6, 0x9a6a40, 0xc9a66b); B.box(1.7, 0.08, 0.3, 0, 0.62, 0.9, 0x8a5a36); // rowboat + seat
  { const c = (w, h, d, x, y, z, col, o) => B.box(w * 0.8, h * 0.8, d * 0.8, x * 0.8, 0.55 + y * 0.8, z * 0.8 - 0.3, col, o); const head = { part: PART.HEAD, pivot: [0, 0.55 + 1.3 * 0.8, 0.85 * 0.8 - 0.3] };
    c(1.0, 0.95, 1.9, 0, 1.15, 0, 0xf7f4ee); c(1.04, 0.5, 0.55, 0, 1.3, 0.25, 0x1e1e1e); c(1.04, 0.45, 0.4, 0, 1.0, -0.55, 0x1e1e1e); for (const [x, z] of [[-0.33, 0.68], [0.33, 0.68], [-0.33, -0.68], [0.33, -0.68]]) c(0.22, 0.75, 0.22, x, 0.42, z, 0xf7f4ee);
    c(0.5, 0.55, 0.62, 0, 1.4, 1.35, 0xf7f4ee, head); c(0.44, 0.3, 0.2, 0, 1.24, 1.72, 0xe8b0a0, head); c(0.28, 0.12, 0.14, -0.38, 1.55, 1.25, 0xf7f4ee, head); c(0.28, 0.12, 0.14, 0.38, 1.55, 1.25, 0xf7f4ee, head);
    B.cyl(0.03, 0.03, 2.4, 4, 0.5, 1.7, -1.4, 0x8a5a36); B.cone(1.1, 0.5, 8, 0.5, 2.9, -1.4, 0xf7931a); /* a tiny sun umbrella */ }
  B.variant(1 << V.BOTTLE); B.cyl(0.13, 0.13, 0.5, 8, 0, 0.05, 0, 0x5fa86a, { rx: Math.PI / 2 }); B.cyl(0.06, 0.1, 0.18, 6, 0, 0.05, 0.33, 0x5fa86a, { rx: Math.PI / 2 }); B.cyl(0.05, 0.05, 0.08, 6, 0, 0.05, 0.45, 0x8a5a36, { rx: Math.PI / 2 }); B.box(0.12, 0.12, 0.3, 0, 0.05, 0, 0xf3ead2);
  B.variant(1 << V.DINGHY); hull(B, 2.0, 5.2, 0.8, 0xf2c94c); B.box(1.4, 0.7, 1.2, 0, 1.2, 0.2, 0xffffff); B.box(0.35, 0.7, 0.35, 0, 0.9, -2.4, 0x333333);
  B.variant(0); return B.build();
}
export function whaleGeom() { const B = new Builder(), top = 0x3d4f63, belly = 0xd9dde2;
  B.ball(1, 0, 0, 0, top, { detail: 1, sx: 2.4, sy: 2.2, sz: 7.5, shade: [1, 0.85] }); B.ball(1, 0, -0.9, 0.5, belly, { detail: 1, sx: 2.0, sy: 1.4, sz: 6.2 });
  for (let k = 0; k < 6; k++) B.box(0.15, 0.05, 5.2, -0.9 + k * 0.36, -2.0, 1.2, 0xb8bec6); // throat grooves
  B.ball(1, 0, -0.2, -8, top, { detail: 0, sx: 1.0, sy: 1.0, sz: 2.8 });
  for (const s of [-1, 1]) { B.box(4.6, 0.25, 1.1, s * 3.6, -0.9, 2.6, belly, { rz: s * 0.35, ry: s * 0.35 }); B.box(3.2, 0.2, 1.6, s * 1.5, -0.2, -10.6, top, { ry: -s * 0.5 }); }
  B.box(0.3, 0.6, 1.0, 0, 2.0, -3.5, top); return B.build(); }
export function dolphinGeom() { const B = new Builder(), top = 0x7a8fa3;
  B.ball(1, 0, 0, 0, top, { detail: 1, sx: 0.45, sy: 0.45, sz: 1.3, shade: [1, 0.7] }); B.cone(0.12, 0.5, 5, 0, -0.05, 1.45, 0x9fb1c2, { rx: Math.PI / 2 }); B.box(0.06, 0.45, 0.35, 0, 0.5, -0.1, top, { rx: -0.5 });
  B.box(0.9, 0.05, 0.3, 0, 0, -1.35, top); for (const s of [-1, 1]) B.box(0.45, 0.04, 0.2, s * 0.4, -0.2, 0.45, top, { rz: s * 0.4 }); return B.build(); }

export function init(scene, tq) {
  const L = getLayout(tq), R = rng(9090), H = tq.heightAt; W.H = H; W.L = L; W.R = R; W.root = new THREE.Group(); W.root.name = 'life-sea';
  W.mat = lifeMaterial(); W.pool = new Pool(boatGeom(), W.mat, 16, { far: 4200, name: 'life-boats' }); W.root.add(W.pool.mesh);
  const add = (b) => { b.y = 0; b.ry = b.ry ?? R() * 6.283; W.boats.push(W.pool.add(b)); return b; };
  for (const s of L.sailLoops) add({ v: V.SAIL, mode: 'loop', cx: s.x, cz: s.z, r: s.r, dir: s.dir, a: R() * 6.283, speed: 3.5 + R() * 1.5, x: s.x + s.r, z: s.z });
  for (const f of L.fishingSpots) add({ v: V.FISH, mode: 'anchor', cx: f.x, cz: f.z, x: f.x, z: f.z });
  if (L.town && L.town.moored) L.town.moored.forEach((m, i) => add({ v: i % 2 ? V.SAIL : V.DINGHY, mode: 'moored', cx: m.x, cz: m.z, x: m.x, z: m.z, ry: m.ry }));
  if (L.cowBoat) W.cowBoat = add({ v: V.COWBOAT, mode: 'loop', cx: L.cowBoat.x, cz: L.cowBoat.z, r: L.cowBoat.r, dir: 1, a: 0, speed: 1.0, x: L.cowBoat.x, z: L.cowBoat.z, farMul: 0.5 });
  if (L.bottle) W.bottle = add({ v: V.BOTTLE, mode: 'float', cx: L.bottle.x, cz: L.bottle.z, x: L.bottle.x, z: L.bottle.z, s: 2, farMul: 0.02 });
  W.whale = new THREE.Mesh(whaleGeom(), new THREE.MeshLambertMaterial({ vertexColors: true })); W.whale.visible = false; W.whale.name = 'life-whale'; W.root.add(W.whale);
  W.dmat = lifeMaterial(); W.dol = new Pool(dolphinGeom(), W.dmat, 5, { far: 9000, name: 'life-dolphins' }); W.root.add(W.dol.mesh); W.pod = [];
  W.spray = new Particles(260, { size: 1.6, color: 0xf4fbff, opacity: 0.85, gravity: -9.8, drag: 0.6 }); W.spray.points.name = 'life-spray'; W.root.add(W.spray.points);
  W.counts = { sailboats: W.boats.filter((b) => b.v === V.SAIL).length, fishingBoats: W.boats.filter((b) => b.v === V.FISH).length, moored: W.boats.filter((b) => b.mode === 'moored').length, cowBoat: !!W.cowBoat, bottle: !!W.bottle };
  W.root.traverse((o) => { o.matrixAutoUpdate = false; }); W.whale.matrixAutoUpdate = true; scene.add(W.root); return W;
}

// ---------------------------------------------------------------- events
export function triggerWhale(p, ahead = null) { // p: player position; spawns 250-600 m ahead in deep water. Returns the spot or null.
  const hx = ahead ? ahead.x : W.vel.x, hz = ahead ? ahead.z : W.vel.z, hl = Math.hypot(hx, hz) || 1;
  for (let k = 0; k < 40; k++) { const d = 250 + Math.random() * 350, a = Math.atan2(hx / hl, hz / hl) + (Math.random() - 0.5) * 0.9, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    if (W.L.deep(x, z, 30)) { W.ev = { kind: 'whale', t: 0, x, z, ry: Math.random() * 6.283, splashed: false, p0: p }; return { x, z }; } }
  return null; }
export function triggerDolphins(p, near = null) {
  let c = near; if (!c) { let bd = 1e9; for (const b of W.boats) if (b.mode === 'loop' && b.v === V.SAIL) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; c = b; } } if (!c || bd > 1500) c = null; }
  if (!c) { const hl = Math.hypot(W.vel.x, W.vel.z) || 1; c = { x: p.x + W.vel.x / hl * 120, z: p.z + W.vel.z / hl * 120, ry: Math.atan2(W.vel.x, W.vel.z) }; }
  if (W.H(c.x, c.z) > -4) return null; const hd = c.ry ?? 0; W.pod.length = 0;
  for (let i = 0; i < 4; i++) W.pod.push(W.dol.add({ x: c.x, y: -3, z: c.z, ry: hd, hd, off: (i - 1.5) * 4, lag: i * 0.45, ox: c.x + Math.cos(hd) * 14, oz: c.z - Math.sin(hd) * 14, t: -i * 0.3 }));
  W.dolEv = { t: 0, follow: near || (c.mode ? c : null) }; return c; }

const _e = new THREE.Euler();
export function update(dt, p) {
  if (!W.root) return; W.t += dt; const t = W.t; tickMaterial(W.mat, t, p); tickMaterial(W.dmat, t, p);
  if (W.lastP) { const vx = (p.x - W.lastP.x) / Math.max(dt, 1e-3), vz = (p.z - W.lastP.z) / Math.max(dt, 1e-3); if (vx * vx + vz * vz > 1) { W.vel.x = vx; W.vel.z = vz; } W.lastP.x = p.x; W.lastP.z = p.z; } else W.lastP = { x: p.x, z: p.z };
  for (const b of W.boats) { const ph = b.ph || 0;
    if (b.mode === 'loop') { b.a += b.dir * b.speed / b.r * dt; b.x = b.cx + Math.cos(b.a) * b.r; b.z = b.cz + Math.sin(b.a) * b.r; b.ry = Math.atan2(-Math.sin(b.a) * b.dir, Math.cos(b.a) * b.dir); b.rz = b.v === V.SAIL ? 0.12 * b.dir : 0; }
    else if (b.mode === 'anchor') { b.ry = ph + Math.sin(t * 0.05 + ph) * 0.8; b.x = b.cx + Math.sin(b.ry) * 6; b.z = b.cz + Math.cos(b.ry) * 6; }
    else if (b.mode === 'float') { b.ry = t * 0.1 + ph; b.x = b.cx + Math.sin(t * 0.07 + ph) * 3; b.z = b.cz + Math.cos(t * 0.05) * 3; }
    b.y = Math.sin(t * 1.3 + ph) * (b.v === V.BOTTLE ? 0.06 : 0.18) - (b.v === V.BOTTLE ? 0 : 0.1); b.rx = Math.sin(t * 0.9 + ph * 2) * 0.03; if (b.mode !== 'loop') b.rz = Math.sin(t * 1.1 + ph) * 0.04;
    if (b.slot >= 0) W.pool.touch(b); }
  if ((W.refreshT -= dt) <= 0) { W.refreshT = 0.5; W.pool.refresh(p); } else W.pool.flush();
  // ---- whale breach timer: every 2-4 min on average, 3x faster when you're low over open sea; only over / near the sea
  const gh = W.H(p.x, p.z), agl = p.y - Math.max(0, gh), overSea = gh < -15;
  if (!W.ev) { W.whaleT -= dt * (overSea && agl < 200 ? 3 : overSea ? 1 : 0.35); if (W.whaleT <= 0) { W.whaleT = 120 + Math.random() * 120; if (triggerWhale(p) == null) W.whaleT = 20; } }
  if (W.ev) { const e = W.ev; e.t += dt; const wh = W.whale; wh.visible = true; const s = Math.sin(e.ry), c = Math.cos(e.ry);
    if (e.t < 2.2) { wh.visible = false; if (Math.random() < dt * 60) W.spray.emit(e.x + (Math.random() - 0.5), 0.5, e.z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 9 + Math.random() * 4, (Math.random() - 0.5) * 2, 2.2); // spout: "pfff"
      if (!e.spouted) { e.spouted = true; const sp = spatial(p.x, p.z, W.vel.x, W.vel.z, e.x, e.z, 900); if (sp.gain > 0) splash({ gain: sp.gain * 0.5, pan: sp.pan, dur: 1.0, freq: 2400 }); } }
    else { const k = (e.t - 2.2) / 3.2; // leap: up out of the water nose-first, roll, fall back on its side
      const y = -14 + Math.sin(Math.min(1, k) * Math.PI) * 22 - (k > 1 ? (k - 1) * 30 : 0), fwd = k * 18, pitch = (0.5 - k) * 2.2, roll = Math.min(1, k) * 1.4;
      wh.position.set(e.x + s * fwd, y, e.z + c * fwd); _e.set(-Math.max(-1.3, Math.min(1.3, pitch)), e.ry, roll, 'YXZ'); wh.quaternion.setFromEuler(_e);
      if (k > 0.05 && k < 0.25 && Math.random() < dt * 40) W.spray.emit(wh.position.x, 0.3, wh.position.z, (Math.random() - 0.5) * 6, 6 + Math.random() * 6, (Math.random() - 0.5) * 6, 2);
      if (k > 0.82 && !e.splashed) { e.splashed = true; for (let i = 0; i < 150; i++) { const a = Math.random() * 6.283, r = Math.random() * 7; W.spray.emit(wh.position.x + Math.cos(a) * r, 0.4, wh.position.z + Math.sin(a) * r, Math.cos(a) * (3 + Math.random() * 7), 7 + Math.random() * 14, Math.sin(a) * (3 + Math.random() * 7), 3); }
        const sp = spatial(p.x, p.z, W.vel.x, W.vel.z, wh.position.x, wh.position.z, 900); if (sp.gain > 0) splash({ gain: 0.3 + sp.gain * 0.7, pan: sp.pan, dur: 1.8, freq: 700 }); W.events.push({ kind: 'whale', t: +t.toFixed(1) }); }
      if (k > 1.6) { wh.visible = false; W.ev = null; } } }
  // ---- dolphins: a pod of 4 arcing alongside a sailboat or under you, every 40-90 s while you're low over the sea
  if (!W.dolEv) { W.dolT -= dt * (overSea && agl < 250 ? 1 : 0.15); if (W.dolT <= 0) { W.dolT = 40 + Math.random() * 50; if (!triggerDolphins(p)) W.dolT = 10; } }
  if (W.dolEv) { const e = W.dolEv; e.t += dt; let any = false;
    for (const d of W.pod) { d.t += dt; if (e.follow) { d.ox = e.follow.x; d.oz = e.follow.z; d.hd = e.follow.ry; }
      const s = Math.sin(d.hd), c = Math.cos(d.hd), run = d.t * 9, cyc = (d.t % 1.8) / 1.8, jump = cyc < 0.55, k = cyc / 0.55;
      d.x = d.ox + s * (run * (e.follow ? 0 : 1) + 8 - d.lag * 3) + c * d.off; d.z = d.oz + c * (run * (e.follow ? 0 : 1) + 8 - d.lag * 3) - s * d.off;
      d.y = jump ? Math.sin(k * Math.PI) * 2.6 - 0.4 : -1.5; d.rx = jump ? (k - 0.5) * 1.6 : 0; d.ry = d.hd;
      if (jump && (k < 0.06 || k > 0.94) && Math.random() < 0.5) for (let i = 0; i < 4; i++) W.spray.emit(d.x, 0.2, d.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 1);
      if (d.t > 0) any = true; }
    W.dol.refresh(p); if (e.t > 14) { W.dolEv = null; W.dol.items.length = 0; W.dol.refresh(p); } }
  W.spray.update(dt);
}
export function stats() { return { ...W.counts, live: W.pool ? W.pool.mesh.count : 0, whaleActive: !!W.ev, dolphinsActive: !!W.dolEv, events: W.events.slice(-3) }; }
