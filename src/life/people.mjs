// People (LIFE_DESIGN: 30-40): villagers strolling slow loops, folks sitting on benches, and 6-8 anglers fishing from
// the town pier, the shack jetty and the village pond with rods and bobbing lines. Everyone waves up at you when you
// fly low and close (vertex shader, no JS). Fishing boats carry their own baked angler (sea.mjs).
// One person geometry with three looks (variant bits): 1 walker (legs swing), 2 sitter (bent legs), 3 angler (rod).
// Draw calls: people 1 + fishing lines/bobbers 1.
import * as THREE from '../../vendor/three.module.js';
import { Builder, lifeMaterial, tickMaterial, Pool, rng, PART } from './lifekit.mjs';
import { getLayout } from './layout.mjs';

const NEAR = 450, WALK = 1, SIT = 2, FISH = 3, STAND = (1 << WALK) | (1 << FISH);
const P = { t: 0, pool: null, list: [], walkers: [], fishers: [], refreshT: 0, root: null };
export const people = P;
const SHIRTS = [0xe2574c, 0x4a90d9, 0xf2c94c, 0x5fbf8f, 0xb07cff, 0xff8c42, 0xffffff, 0x2f7c7a, 0xf6a5c0];
const ROD_TIP = new THREE.Vector3(0, 3.46, 2.85);

export function personGeom() {
  const B = new Builder(), skin = 0xe8b894, pants = 0x3b4a6b;
  B.variant(STAND); for (const [x, part] of [[-0.11, PART.LEG_L], [0.11, PART.LEG_R]]) { B.box(0.17, 0.82, 0.19, x, 0.41, 0, pants, { part, pivot: [x, 0.84, 0] }); B.box(0.18, 0.1, 0.28, x, 0.05, 0.05, 0x3a2a20, { part, pivot: [x, 0.84, 0] }); }
  B.variant(1 << SIT); for (const x of [-0.11, 0.11]) { B.box(0.17, 0.18, 0.5, x, 0.82, 0.22, pants); B.box(0.17, 0.5, 0.18, x, 0.6, 0.45, pants); B.box(0.18, 0.1, 0.28, x, 0.36, 0.5, 0x3a2a20); }
  B.variant(0); B.box(0.44, 0.62, 0.25, 0, 1.15, 0, 0xffffff, { tint: 1, shade: [1, 0.85] }); B.box(0.12, 0.1, 0.12, 0, 1.5, 0, skin);
  B.ball(0.15, 0, 1.66, 0, skin, { detail: 1 }); B.box(0.3, 0.1, 0.3, 0, 1.79, -0.02, 0x4a3426); B.box(0.3, 0.16, 0.08, 0, 1.7, -0.13, 0x4a3426);
  B.variant((1 << WALK) | (1 << SIT)); B.box(0.11, 0.56, 0.12, -0.28, 1.15, 0, 0xffffff, { tint: 1 }); B.box(0.11, 0.56, 0.12, 0.28, 1.15, 0, 0xffffff, { tint: 1, part: PART.ARM, pivot: [0.28, 1.42, 0] });
  B.variant(1 << FISH); for (const x of [-0.24, 0.24]) B.box(0.11, 0.12, 0.5, x * 0.7, 1.22, 0.25, 0xffffff, { tint: 1, ry: -x * 0.6 });
  B.cyl(0.015, 0.03, 3.3, 4, 0, 2.34, 1.65, 0x3a3a3a, { part: PART.ROD, pivot: [0, 1.22, 0.45], rx: 0.82 }); B.box(0.08, 0.08, 0.1, 0.06, 1.25, 0.5, 0xc0c0c0, { part: PART.ROD, pivot: [0, 1.22, 0.45] });
  B.variant(0); return B.build();
}

export function init(scene, tq) {
  const L = getLayout(tq), R = rng(1234), H = tq.heightAt; P.H = H; P.root = new THREE.Group(); P.root.name = 'life-people';
  P.mat = lifeMaterial({ nearR: 170, lowH: 130, walk: 1 }); P.pool = new Pool(personGeom(), P.mat, 64, { far: NEAR, name: 'life-people' }); P.root.add(P.pool.mesh);
  const add = (it) => { it.col = it.col ?? SHIRTS[Math.floor(R() * SHIRTS.length)]; it.s = 0.92 + R() * 0.16; P.list.push(it); return P.pool.add(it); };
  for (const loop of L.people.walkLoops) { const pts = loop.pts, seg = []; let tot = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[2] - a[2]); seg.push(l); tot += l; }
    for (let k = 0; k < loop.n; k++) P.walkers.push(add({ v: WALK, pts, seg, tot, d: tot * (k / loop.n + R() * 0.1), speed: (0.9 + R() * 0.4) * (R() < 0.5 ? 1 : -1), x: pts[0][0], y: pts[0][1], z: pts[0][2] })); }
  L.people.benches.forEach((b, i) => { if (i % 3 === 2) return; add({ v: SIT, x: b.x, y: b.y + 0.5 - 0.84 + 0.02, z: b.z, ry: b.ry }); });
  for (const f of L.people.fishers) { const it = add({ v: FISH, x: f.x, y: f.y, z: f.z, ry: f.ry, water: f.waterY ?? 0 }); P.fishers.push(it); }
  P.walkers.forEach((w) => place(w, 0));
  // fishing lines: tip -> bobber + a little red bobber cross, rewritten only while the anglers are near
  const n = P.fishers.length, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 6 * 3), col = new Float32Array(n * 6 * 3);
  for (let i = 0; i < n; i++) { for (let k = 0; k < 6; k++) col.set(k < 2 ? [0.85, 0.85, 0.85] : [0.95, 0.15, 0.1], (i * 6 + k) * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  P.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })); P.lines.frustumCulled = false; P.lines.name = 'life-fishing-lines'; P.root.add(P.lines);
  P.counts = { walkers: P.walkers.length, sitters: P.list.filter((x) => x.v === SIT).length, anglers: P.fishers.length, total: P.list.length };
  P.root.traverse((o) => { o.matrixAutoUpdate = false; }); scene.add(P.root); return P;
}
function place(w, dt) {
  w.d = ((w.d + w.speed * dt) % w.tot + w.tot) % w.tot; let d = w.d, i = 0; while (d > w.seg[i]) { d -= w.seg[i]; i = (i + 1) % w.seg.length; }
  const a = w.pts[i], b = w.pts[(i + 1) % w.pts.length], f = d / (w.seg[i] || 1); w.x = a[0] + (b[0] - a[0]) * f; w.z = a[2] + (b[2] - a[2]) * f; w.y = Math.max(0.2, P.H(w.x, w.z));
  w.ry = Math.atan2(b[0] - a[0], b[2] - a[2]) + (w.speed < 0 ? Math.PI : 0);
}
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function update(dt, p) {
  if (!P.root) return; P.t += dt; tickMaterial(P.mat, P.t, p);
  if ((P.refreshT -= dt) <= 0) { P.refreshT = 0.5; P.pool.refresh(p); }
  for (const w of P.walkers) if (w.slot >= 0) { place(w, dt); P.pool.touch(w); }
  P.pool.flush();
  const pos = P.lines.geometry.attributes.position; let any = false;
  for (let i = 0; i < P.fishers.length; i++) { const f = P.fishers[i], o = i * 18; if (f.slot < 0) { for (let k = 0; k < 18; k++) pos.array[o + k] = 0; continue; } any = true;
    _e.set(0, f.ry, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_s.set(f.x, f.y, f.z), _q, _v.set(f.s, f.s, f.s)); _v.copy(ROD_TIP).applyMatrix4(_m);
    const fx = Math.sin(f.ry), fz = Math.cos(f.ry), bx = _v.x + fx * 2.2, bz = _v.z + fz * 2.2, by = f.water + 0.05 + Math.sin(P.t * 2.3 + i) * 0.06;
    const a = pos.array; a[o] = _v.x; a[o + 1] = _v.y; a[o + 2] = _v.z; a[o + 3] = bx; a[o + 4] = by + 0.12; a[o + 5] = bz; a[o + 6] = bx; a[o + 7] = by - 0.1; a[o + 8] = bz;
    a[o + 9] = bx; a[o + 10] = by + 0.14; a[o + 11] = bz; a[o + 12] = bx - 0.12; a[o + 13] = by + 0.04; a[o + 14] = bz; a[o + 15] = bx + 0.12; a[o + 16] = by + 0.04; a[o + 17] = bz; }
  pos.needsUpdate = any || P._was; P.lines.visible = any; P._was = any;
}
export function stats() { return { ...P.counts, live: P.pool ? P.pool.mesh.count : 0 }; }
