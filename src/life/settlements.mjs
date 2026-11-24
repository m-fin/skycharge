// Settlements (LIFE_DESIGN.md pockets): Home Village (cottages, green, benches, market stall, pond, gardens, chimney
// smoke), Ridge Farms (2 farmsteads: patchwork fields, barns, silos, farmhouses, fenced paddocks, hay bales, tractors),
// North Cove Solar (~200 panels, Bitcoin-orange trim, maintenance shed, fence), Harbor Town (mid-rise blocks <= 5 floors,
// plaza with fountain, roads, a pier), Lagoon Suburb (2 curved streets, yards, picket fences, a playground) and a lone
// fishing shack. Draw calls: ALL buildings are ONE merged mesh (each pocket collapses on the GPU beyond CULL metres),
// all draped ground (fields, lawns, roads, pond, plaza) is one more, tractors one instanced mesh, smoke one Points = 4.
import * as THREE from '../../vendor/three.module.js';
import { Builder, lifeMaterial, tickMaterial, Pool, trs, rng, dotTexture, PART } from './lifekit.mjs';
import { getLayout } from './layout.mjs';

export const CULL = 3200; // LIFE_DESIGN: pockets hidden beyond ~3000 m (Harbor Town gets a little longer, it's taller)
const S = { mesh: null, drape: null, tractors: null, smoke: null, mat: null, dmat: null, t: 0, root: null, layout: null, refreshT: 0, tractorList: [], chimneys: [] };
export const settlements = S;

// ---------------------------------------------------------------- templates (local origin = ground centre, front = +Z)
export function houseInto(B, h, m) {
  const L = new Builder(), H = 3.2 * (h.floors || 1), base = -(h.rise || 0) - 1.2, w = h.w, d = h.d;
  L.box(w, H - base, d, 0, (H + base) / 2, 0, h.wall); L.box(w + 0.15, 0.35, d + 0.15, 0, 0.2, 0, 0x8c8478);
  L.roof(w + 0.9, d + 1.0, 2.6, 0, H, 0, h.roof); L.box(1.2, 2.1, 0.12, 0, 1.05, d / 2 + 0.03, 0x6b4a2e);
  for (let f = 0; f < (h.floors || 1); f++) { const y = 1.6 + f * 3.2;
    for (const x of [-w * 0.3, w * 0.3]) { L.box(1.1, 1.0, 0.1, x, y, d / 2 + 0.03, 0xbfe3f2); L.box(1.35, 0.15, 0.14, x, y - 0.55, d / 2 + 0.05, 0xffffff); }
    for (const z of [-d * 0.2, d * 0.2]) for (const sx of [-1, 1]) L.box(0.1, 1.0, 1.0, sx * (w / 2 + 0.03), y, z, 0xbfe3f2); }
  if (h.chimney) L.box(0.8, 2.2, 0.8, w * 0.25, H + 1.6, d * 0.15, 0x9a5b45);
  if (h.flowerBox) L.box(1.3, 0.3, 0.35, -w * 0.3, 1.0, d / 2 + 0.2, 0xff6f91);
  return B.stamp(L, m); }
function treeInto(B, x, y, z, s = 1, col = 0x4e8f3a) { B.cyl(0.25 * s, 0.35 * s, 2.2 * s, 5, x, y + 1.1 * s, z, 0x6b4a2e); B.ball(1.9 * s, x, y + 3.2 * s, z, col); }
function benchInto(B, x, y, z, ry) { const L = new Builder(); L.box(2.2, 0.12, 0.6, 0, 0.5, 0, 0x8a5a36); L.box(2.2, 0.5, 0.1, 0, 0.85, -0.28, 0x8a5a36, { rx: -0.15 });
  for (const sx of [-0.9, 0.9]) L.box(0.12, 0.5, 0.5, sx, 0.25, 0, 0x333333); B.stamp(L, trs(x, y, z, ry)); }
function fountainInto(B, x, y, z, s = 1) { B.cyl(3.4 * s, 3.6 * s, 0.8, 14, x, y + 0.3, z, 0xd9d2c3); B.cyl(3.0 * s, 3.0 * s, 0.1, 14, x, y + 0.66, z, 0x7cc6e0);
  B.cyl(0.35, 0.5, 1.8, 8, x, y + 1.2, z, 0xd9d2c3); B.cyl(1.1, 0.6, 0.35, 10, x, y + 2.1, z, 0xd9d2c3); B.ball(0.45, x, y + 2.6, z, 0xbfe9f7, { detail: 1 }); }
function fenceLine(B, x0, z0, x1, z1, y0, y1, col = 0xffffff, post = 3) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / post)), ry = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) { const t = i / n; B.box(0.18, 1.2, 0.18, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.4, z0 + (z1 - z0) * t, col); }
  for (const hy of [0.55, 0.95]) B.box(0.08, 0.12, L, (x0 + x1) / 2, (y0 + y1) / 2 + hy, (z0 + z1) / 2, col, { ry }); }
function ringFence(B, cx, cz, r, H, col = 0xe8dcc0) { const n = Math.max(10, Math.round(r * 6.283 / 6)); for (let i = 1; i < n; i++) { const a0 = i / n * 6.283, a1 = (i + 1) / n * 6.283, x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
  fenceLine(B, x0, z0, x1, z1, H(x0, z0), H(x1, z1), col, 6); } }
function pierInto(B, p) { const M = new Builder(); M.box(p.w, 0.3, p.len, 0, 0.95, p.len / 2, 0x9a6a40); for (let z = 0; z <= p.len; z += 4) for (const sx of [-1, 1]) M.cyl(0.18, 0.18, 4.5, 6, sx * (p.w / 2), -1.2, z, 0x6b4a2e);
  M.cyl(0.08, 0.08, 3, 6, p.w / 2 - 0.2, 2.5, p.len - 0.5, 0x333333); M.ball(0.3, p.w / 2 - 0.2, 4.0, p.len - 0.5, 0xffe9a8, { detail: 1 }); M.box(1.0, 0.6, 0.7, -0.8, 1.4, p.len - 5, 0x2f7c7a);
  for (let z = 6; z < p.len - 4; z += 11) for (const sx of [-1, 1]) M.cyl(0.15, 0.15, 0.5, 6, sx * (p.w / 2 - 0.2), 1.35, z, 0x333333); // bollards
  B.stamp(M, trs(p.x0, 0, p.z0, Math.atan2(p.x1 - p.x0, p.z1 - p.z0))); }
export function tractorGeom() { const B = new Builder();
  B.box(1.6, 1.0, 2.6, 0, 1.2, 0.2, 0x3f9b4a); B.box(1.3, 0.8, 1.2, 0, 1.4, 1.6, 0x3f9b4a); B.box(1.5, 1.4, 1.2, 0, 2.3, -0.5, 0xd8eef7); B.box(1.7, 0.12, 1.4, 0, 3.05, -0.5, 0xf3f3f3);
  B.cyl(0.08, 0.08, 1.2, 5, 0.45, 2.4, 1.6, 0x333333);
  for (const sx of [-1, 1]) { B.cyl(0.85, 0.85, 0.5, 12, sx * 1.0, 0.85, -0.6, 0x2a2a2a, { rz: Math.PI / 2 }); B.cyl(0.45, 0.45, 0.35, 10, sx * 0.85, 0.45, 1.7, 0x2a2a2a, { rz: Math.PI / 2 });
    B.cyl(0.4, 0.4, 0.52, 8, sx * 1.0, 0.85, -0.6, 0xf2c94c, { rz: Math.PI / 2 }); }
  return B.build(); }

// ---------------------------------------------------------------- build
// split a merged non-indexed geometry into meshes by vertex ranges (gaps become their own chunks). All share the same attributes.
function splitRanges(g, ranges, mat) { const total = g.attributes.position.count, pos = g.attributes.position.array, all = []; let at = 0;
  for (const r of ranges.slice().sort((a, b) => a.i0 - b.i0)) { if (r.i0 > at) all.push({ i0: at, i1: r.i0 }); if (r.i1 > r.i0) all.push(r); at = Math.max(at, r.i1); } if (at < total) all.push({ i0: at, i1: total });
  return all.map((r) => { const n = r.i1 - r.i0, c = new THREE.Vector3(); for (let i = r.i0; i < r.i1; i++) c.x += pos[i * 3], c.y += pos[i * 3 + 1], c.z += pos[i * 3 + 2]; c.divideScalar(n);
    let rad = 0; for (let i = r.i0; i < r.i1; i++) rad = Math.max(rad, Math.hypot(pos[i * 3] - c.x, pos[i * 3 + 1] - c.y, pos[i * 3 + 2] - c.z));
    const cg = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(g.attributes)) cg.setAttribute(k, a); cg.setDrawRange(r.i0, n); cg.boundingSphere = new THREE.Sphere(c, rad);
    const m = new THREE.Mesh(cg, mat); m.name = 'life-buildings'; m.userData.cull = { x: c.x, z: c.z, r: rad }; return m; }); }
const _cullOn = (m, p) => { const u = m.userData.cull; return Math.hypot(u.x - p.x, u.z - p.z) - u.r < CULL; };

export function init(scene, tq) {
  const L = getLayout(tq); S.layout = L; S.H = tq.heightAt; S.root = new THREE.Group(); S.root.name = 'life-settlements';
  S.mat = lifeMaterial({ cull: CULL }); S.dmat = lifeMaterial({ offset: true, cull: CULL }); const H = (x, z) => Math.max(0, tq.heightAt(x, z));
  const B = new Builder(), D = new Builder(), R = rng(4242);
  const ranges = [], pocket = (p, fn) => { if (!p) return; const i0 = B.part.length, j0 = D.part.length; fn(); B.cullCentre(i0, p.x, p.z); D.cullCentre(j0, p.x, p.z); ranges.push({ i0, i1: B.part.length }); };

  pocket(L.village, () => { const v = L.village;
    for (const h of v.houses) houseInto(B, { ...h, flowerBox: R() < 0.5 }, trs(h.x, h.y, h.z, h.ry));
    D.drape(v.x - v.green.r, v.z - v.green.r, v.x + v.green.r, v.z + v.green.r, 4, H, 0x8fd06a, 0.28);
    { const p = v.pond; for (let k = 0; k < 12; k++) { const a0 = k / 12 * 6.283; D.drapeRect(p.x + Math.cos(a0) * p.r * 0.5, p.z + Math.sin(a0) * p.r * 0.5, -a0, p.r * 0.55, p.r * 1.02, 4, () => p.y, 0x5fa9c9, 0.45); }
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, x = p.x + Math.cos(a) * (p.r + 0.6), z = p.z + Math.sin(a) * (p.r + 0.6); B.ball(0.55, x, H(x, z) + 0.2, z, 0x9a958a); }
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5; B.cyl(1.0, 1.0, 0.08, 8, p.x + Math.cos(a) * p.r * 0.5, p.y + 0.55, p.z + Math.sin(a) * p.r * 0.5, 0x4f9a3c); } } // lily pads
    { const st = v.stall, M = new Builder(); for (const [x, z] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) M.box(0.15, 2.6, 0.15, x, 1.3, z, 0x8a5a36);
      M.box(4.2, 0.9, 1.4, 0, 0.45, 0.4, 0xa87a4f); for (let i = 0; i < 6; i++) M.box(0.72, 0.12, 2.6, -1.8 + i * 0.72, 2.7 - 0.1 * (i % 2), 0, i % 2 ? 0xffffff : 0xe2574c, { rx: 0.18 });
      const fruit = [0xff6b3d, 0xffd23f, 0x7ac74f, 0xd94a6a]; for (let i = 0; i < 4; i++) { M.box(0.85, 0.3, 0.7, -1.5 + i, 1.05, 0.5, 0x9a6a40); for (let k = 0; k < 3; k++) M.ball(0.17, -1.7 + i + k * 0.2, 1.3, 0.4 + (k % 2) * 0.25, fruit[i]); }
      B.stamp(M, trs(st.x, st.y, st.z, st.ry)); }
    for (const f of v.flowers) B.ball(0.35, f.x, f.y + 0.3, f.z, f.c);
    for (const g of v.gardens) { D.drapeRect(g.x, g.z, g.ry, g.w, g.l, 3, H, 0x6e4a2c, 0.3); const s = Math.sin(g.ry), c = Math.cos(g.ry);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { const u = -g.w * 0.35 + k * g.w * 0.23, w = -1.6 + r * 1.6, x = g.x + u * c + w * s, z = g.z - u * s + w * c; B.ball(0.45, x, H(x, z) + 0.35, z, r === 1 ? 0xff8c42 : 0x5fae3e); } }
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3, x = v.x + Math.cos(a) * 15, z = v.z + Math.sin(a) * 15; if (Math.hypot(x - v.pond.x, z - v.pond.z) > 12 && Math.hypot(x - v.stall.x, z - v.stall.z) > 4) treeInto(B, x, H(x, z), z, 0.8, 0x5a9e45); } });
  for (const b of L.people.benches) benchInto(B, b.x, b.y, b.z, b.ry); // benches belong to the village / town (culled with nearest pocket centre below)

  for (const f of L.farms) pocket(f, () => {
    for (const fl of f.fields) { const n = fl.rows, s = Math.sin(fl.ang), c = Math.cos(fl.ang); for (let i = 0; i < n; i++) { const u = -fl.w / 2 + (i + 0.5) * fl.w / n; D.drapeRect(fl.x + u * c, fl.z - u * s, fl.ang, fl.w / n, fl.l, 8, H, fl.crop[i % 2], 0.28); }
      if (R() < 0.5) for (let k = 0; k < 5; k++) { const u = (R() - 0.5) * fl.w * 0.7, w = (R() - 0.5) * fl.l * 0.7, x = fl.x + u * c + w * s, z = fl.z - u * s + w * c; B.cyl(0.8, 0.8, 1.2, 10, x, H(x, z) + 0.8, z, 0xe0c46c, { rz: Math.PI / 2, ry: R() * 3 }); } }
    { const b = f.barn, M = new Builder(); M.box(12, 9, 16, 0, 3, 0, 0xb83a2e); M.roof(16.8, 12.8, 4.5, 0, 7.5, 0, 0x4d4d4d, { ry: Math.PI / 2 });
      M.box(5, 5, 0.2, 0, 2.5, 8.05, 0x8f2a20); M.box(0.3, 7, 0.25, 0, 2.5, 8.15, 0xffffff, { rz: 0.785 }); M.box(0.3, 7, 0.25, 0, 2.5, 8.15, 0xffffff, { rz: -0.785 }); M.box(5.4, 0.3, 0.25, 0, 5.05, 8.15, 0xffffff);
      M.box(2, 1.6, 0.2, 0, 9, 8.05, 0xffffff); B.stamp(M, trs(b.x, b.y, b.z, b.ry)); }
    for (const sl of f.silos) { B.cyl(3, 3, 16, 14, sl.x, sl.y + 7, sl.z, 0xc9ccd1); B.ball(3.05, sl.x, sl.y + 15, sl.z, 0x9aa3ad, { detail: 1, sy: 0.6 }); for (let k = 1; k < 5; k++) B.cyl(3.05, 3.05, 0.2, 14, sl.x, sl.y + k * 3.2, sl.z, 0x9aa3ad); }
    houseInto(B, { w: 9, d: 7, floors: 2, wall: f.house.wall, roof: f.house.roof, chimney: true, rise: 1 }, trs(f.house.x, f.house.y, f.house.z, f.house.ry));
    B.cyl(1.6, 1.6, 0.8, 10, f.yard.x + 6, H(f.yard.x + 6, f.yard.z) + 0.4, f.yard.z, 0x7d8a92);
    { const cx = f.yard.x - 5, cz = f.yard.z + 4; B.box(3, 2, 2.4, cx, H(cx, cz) + 1, cz, 0xf3e6c8, { ry: f.ang }); B.roof(3.4, 2.8, 1, cx, H(cx, cz) + 2, cz, 0xb5523b, { ry: f.ang }); } // hen house
    for (const pd of f.paddocks) ringFence(B, pd.x, pd.z, pd.r, H);
    { const sn = Math.sin(f.ang), cs = Math.cos(f.ang); // the farm's own little solar array: first spot clear of fields, paddocks, barn, house and silos
      const clear = (cu, cv) => { const px = f.x + cu * cs + cv * sn, pz = f.z - cu * sn + cv * cs;
        for (const fl of f.fields) { const fs = Math.sin(fl.ang), fc = Math.cos(fl.ang), dx = px - fl.x, dz = pz - fl.z, a = dx * fc - dz * fs, b = dx * fs + dz * fc; if (Math.abs(a) < fl.w / 2 + 18 && Math.abs(b) < fl.l / 2 + 10) return false; }
        for (const pd of f.paddocks) if (Math.hypot(px - pd.x, pz - pd.z) < pd.r + 20) return false;
        for (const o of [f.barn, f.house, ...f.silos]) if (Math.hypot(px - o.x, pz - o.z) < 26) return false; return true; };
      let U = 42, V = -29; outer: for (const rad of [36, 48, 60, 72]) for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; if (clear(Math.cos(a) * rad, Math.sin(a) * rad)) { U = Math.cos(a) * rad; V = Math.sin(a) * rad; break outer; } }
      f.solarSpot = { u: U, v: V }; for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) { const u = U - 12.25 + c * 3.5, v = V + 3 - r * 6, x = f.x + u * cs + v * sn, z = f.z - u * sn + v * cs, y = H(x, z); // the farm's own little solar array
      B.box(3.3, 0.12, 2.2, x, y + 1.7, z, 0x1d3557, { ry: f.ang, rx: -0.45 }); B.box(3.4, 0.07, 0.1, x, y + 1.79, z, 0xf7931a, { ry: f.ang, rx: -0.45 }); B.box(0.12, 1.4, 0.12, x, y + 0.7, z, 0x8a8f96, { ry: f.ang }); } } });

  pocket(L.solar, () => { const s = L.solar, sn = Math.sin(s.ang), cs = Math.cos(s.ang);
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) { const u = (c - (s.cols - 1) / 2) * 3.5, v = (r - (s.rows - 1) / 2) * 7, x = s.x + u * cs + v * sn, z = s.z - u * sn + v * cs, y = H(x, z);
      B.box(3.3, 0.12, 2.2, x, y + 1.7, z, 0x1d3557, { ry: s.ang, rx: -0.45 }); B.box(3.4, 0.07, 0.1, x, y + 1.79, z, 0xf7931a, { ry: s.ang, rx: -0.45 }); B.box(0.12, 1.4, 0.12, x, y + 0.7, z, 0x8a8f96, { ry: s.ang }); }
    { const x = s.x + ((s.cols + 3) / 2) * 3.5 * cs, z = s.z - ((s.cols + 3) / 2) * 3.5 * sn, y = H(x, z); B.box(5, 3, 4, x, y + 1.5, z, 0xeeeeee, { ry: s.ang }); B.roof(5.4, 4.6, 1.2, x, y + 3, z, 0x5d6b7a, { ry: s.ang });
      B.box(1.2, 2, 0.1, x + Math.sin(s.ang) * 0, y + 1, z + 2.02, 0xf7931a, { ry: s.ang }); }
    const hw = s.cols * 1.75 + 10, hl = s.rows * 3.5 + 6, cn = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => [s.x + u * cs + v * sn, s.z - u * sn + v * cs]);
    for (let k = 0; k < 4; k++) { const a = cn[k], b = cn[(k + 1) % 4]; fenceLine(B, a[0], a[1], b[0], b[1], H(a[0], a[1]), H(b[0], b[1]), 0x9aa0a6, 5); } });

  pocket(L.suburb, () => { const sb = L.suburb;
    for (const st of sb.streets) for (let k = 0; k < st.pts.length - 1; k++) { const a = st.pts[k], b = st.pts[k + 1], mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, ang = Math.atan2(b[0] - a[0], b[2] - a[2]), l = Math.hypot(b[0] - a[0], b[2] - a[2]) + 1;
      D.drapeRect(mx, mz, ang, 7, l, 6, H, 0x55595e, 0.3); if (k % 2 === 0) D.drapeRect(mx, mz, ang, 0.35, l * 0.45, 4, H, 0xf2f2f2, 0.36); }
    for (const h of sb.houses) { const s = Math.sin(h.ry), c = Math.cos(h.ry); D.drapeRect(h.x - s * 2, h.z - c * 2, h.ry, h.w + 8, h.d + 11, 6, H, 0x8ccf5c, 0.29);
      houseInto(B, { ...h, chimney: R() < 0.4 }, trs(h.x, h.y, h.z, h.ry));
      const fx = h.x + s * (h.d / 2 + 3.5), fz = h.z + c * (h.d / 2 + 3.5), hx = c * (h.w / 2 + 3.5), hz = -s * (h.w / 2 + 3.5);
      fenceLine(B, fx - hx, fz - hz, fx - hx * 0.25, fz - hz * 0.25, H(fx - hx, fz - hz), H(fx, fz), 0xffffff, 1.2); fenceLine(B, fx + hx * 0.25, fz + hz * 0.25, fx + hx, fz + hz, H(fx, fz), H(fx + hx, fz + hz), 0xffffff, 1.2);
      B.box(0.12, 1.1, 0.12, fx + hx * 0.15, H(fx, fz) + 0.55, fz + hz * 0.15, 0x666666); B.box(0.5, 0.35, 0.3, fx + hx * 0.15, H(fx, fz) + 1.2, fz + hz * 0.15, 0x2e5fa3, { ry: h.ry });
      const tx = h.x - s * 7 - c * (h.w * 0.3), tz = h.z - c * 7 + s * (h.w * 0.3); treeInto(B, tx, H(tx, tz), tz, 0.9 + R() * 0.4, R() < 0.5 ? 0x4e8f3a : 0x6aa84f);
      if (R() < 0.3) { const gx = h.x - s * 6 + c * (h.w * 0.25), gz = h.z - c * 6 - s * (h.w * 0.25); D.drapeRect(gx, gz, h.ry, 3, 2.4, 3, H, 0x6e4a2c, 0.32); for (let k = 0; k < 3; k++) B.ball(0.35, gx + c * (k - 1), H(gx, gz) + 0.4, gz - s * (k - 1), 0xff6f91); } }
    { const pg = sb.playground, M = new Builder(); // swings, a slide and a sandbox
      for (const x of [-2, 2]) { M.box(0.15, 3, 0.15, x, 1.5, -0.8, 0xe2574c, { rx: 0.25 }); M.box(0.15, 3, 0.15, x, 1.5, 0.8, 0xe2574c, { rx: -0.25 }); } M.box(4.3, 0.15, 0.15, 0, 2.9, 0, 0xe2574c);
      for (const x of [-1, 1]) { M.box(0.03, 2.2, 0.03, x - 0.25, 1.8, 0, 0x555555); M.box(0.03, 2.2, 0.03, x + 0.25, 1.8, 0, 0x555555); M.box(0.7, 0.08, 0.3, x, 0.7, 0, 0xf2c94c); }
      M.box(1.2, 2.2, 1.2, 6, 1.1, 0, 0x4a90d9); M.box(0.9, 0.1, 3.6, 6, 1.1, 2.3, 0xf2c94c, { rx: 0.55 }); M.box(3.2, 0.3, 3.2, -6, 0.15, 0, 0xe8d9a8); B.stamp(M, trs(pg.x, pg.y, pg.z, pg.ry)); } });

  pocket(L.town, () => { const T = L.town;
    for (const r of T.roads) { D.drapeRect(r.x, r.z, r.ang, r.w, r.l, 6, H, 0x4c5056, 0.3); for (let k = -r.l / 2 + 4; k < r.l / 2; k += 9) { const x = r.x + Math.sin(r.ang) * k, z = r.z + Math.cos(r.ang) * k; D.drapeRect(x, z, r.ang, 0.35, 4, 4, H, 0xf2e9a8, 0.36); } }
    D.drapeRect(T.x, T.z, T.ang, 32, 32, 6, H, 0xd8cdb4, 0.33); fountainInto(B, T.plaza.x, T.plaza.y, T.plaza.z, 1.2);
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + 0.2, x = T.x + Math.cos(a) * 14.5, z = T.z + Math.sin(a) * 14.5; treeInto(B, x, H(x, z), z, 0.85, 0x5a9e45); }
    const KIND = { glass: [0x8fc3dd, 0x2f5f86], stone: [0xe2d4b7, 0x6d6255], white: [0xf4f4f2, 0x4d6a85], brick: [0xb86b4b, 0x3d3a3a], pastel: [0xf6c3a0, 0x5d6b7a] };
    for (const t of T.blocks) { const [body, band] = KIND[t.kind], M = new Builder(), h = t.h + (t.top - t.y);
      M.box(t.w, h, t.d, 0, h / 2, 0, body, { shade: [1.05, 0.8] }); for (let y = h - t.h + 2.2; y < h - 1; y += 3.4) M.box(t.w + 0.25, 1.3, t.d + 0.25, 0, y, 0, band);
      M.box(t.w + 0.6, 0.6, t.d + 0.6, 0, h + 0.3, 0, 0x9a9a9a); M.box(2.4, 1.6, 2, -t.w * 0.25, h + 0.8, t.d * 0.2, 0xd6d6d6); M.box(4.6, 3.2, 0.3, 0, h - t.h + 1.6, t.d / 2 + 0.1, 0x30475e);
      M.box(t.w * 0.9, 0.2, 1.6, 0, h - t.h + 3.6, t.d / 2 + 0.8, [0xe2574c, 0x2f7c7a, 0xf2c94c][Math.floor(R() * 3)]); // shop awning
      if (t.garden && !t.tallest) { M.box(t.w * 0.5, 0.5, t.d * 0.5, t.w * 0.15, h + 0.5, -t.d * 0.15, 0x5fae3e); M.ball(1.3, t.w * 0.2, h + 1.6, -t.d * 0.1, 0x4e8f3a); }
      if (t.solar && !t.tallest) for (let k = 0; k < 4; k++) M.box(2.4, 0.1, 1.5, -t.w * 0.25 + (k % 2) * 3, h + 1.0, -t.d * 0.25 + Math.floor(k / 2) * 2.2, 0x1d3557, { rx: -0.4 });
      if (t.tallest) { M.box(t.w * 0.7, 0.4, t.d * 0.7, 0, h + 0.75, 0, 0x7cc35a); M.cyl(0.1, 0.1, 6, 6, t.w * 0.3, h + 3.5, t.d * 0.3, 0xdddddd); M.box(1.6, 1, 0.05, t.w * 0.3 + 0.8, h + 5.8, t.d * 0.3, 0xf7931a, { part: PART.FLAG, pivot: [t.w * 0.3, h + 5.8, t.d * 0.3] }); }
      B.stamp(M, trs(t.x, t.y, t.z, t.ry)); }
    if (T.pier) pierInto(B, T.pier); });

  pocket(L.shack, () => { const s = L.shack; houseInto(B, { w: 5, d: 4, floors: 1, wall: 0x9a7b5a, roof: 0x5d6b7a, chimney: true, rise: 1 }, trs(s.x, s.y, s.z, s.ry)); pierInto(B, s.pier);
    for (let k = 0; k < 3; k++) B.cyl(0.35, 0.35, 0.9, 8, s.x + 3.5, s.y + 0.45, s.z + k - 1, 0x2f7c7a); });

  // (benches were stamped outside pocket(): stamp() moves their pivot to the bench itself, so each culls on its own position)
  S.mesh = new THREE.Mesh(B.build(), S.mat); S.mesh.name = 'life-buildings'; S.drape = new THREE.Mesh(D.build(), S.dmat); S.drape.name = 'life-ground'; S.root.add(S.drape);
  // one draw per pocket (shared GPU buffers, own draw range + bounding sphere): CPU distance cull + three's frustum cull, so far pockets cost nothing
  S.chunks = splitRanges(S.mesh.geometry, ranges, S.mat); for (const c of S.chunks) S.root.add(c);
  S.tractors = new Pool(tractorGeom(), S.mat, 4, { far: 2600, name: 'life-tractors' }); S.tractorList = L.farms.map((f, i) => S.tractors.add({ ...f.tractor, k: i * 0.31, x: f.tractor.cx, y: 0, z: f.tractor.cz, col: 0xffffff }));
  S.root.add(S.tractors.mesh);
  S.chimneys = L.chimneys; const PER = 6, n = Math.max(1, S.chimneys.length * PER);
  { const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3).fill(-1e4), col = new Float32Array(n * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    S.smoke = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.2, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })); S.smoke.frustumCulled = false; S.smoke.name = 'life-smoke'; S.root.add(S.smoke); S.smokePer = PER; }
  S.root.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; }); scene.add(S.root);
  S.counts = { buildingVerts: S.mesh.geometry.attributes.position.count, buildingChunks: S.chunks.length, groundVerts: S.drape.geometry.attributes.position.count, houses: (L.village ? L.village.houses.length : 0) + (L.suburb ? L.suburb.houses.length : 0) + L.farms.length * 2 + (L.town ? L.town.blocks.length : 0) + (L.shack ? 1 : 0), panels: L.solar ? L.solar.rows * L.solar.cols : 0, chimneys: S.chimneys.length };
  return S;
}

const _sky = new THREE.Color(0xcfe2f2), _sm = new THREE.Color(0xf4f4f4), _tc = new THREE.Color();
export function update(dt, p) {
  if (!S.root) return; S.t += dt; const t = S.t; tickMaterial(S.mat, t, p); tickMaterial(S.dmat, t, p);
  for (const tr of S.tractorList) { const per = 2 * (tr.w + tr.l), s = ((t * 3 + tr.k * per) % per + per) % per; let u, v, hd;
    if (s < tr.l) { u = -tr.w / 2; v = -tr.l / 2 + s; hd = 0; } else if (s < tr.l + tr.w) { u = -tr.w / 2 + (s - tr.l); v = tr.l / 2; hd = Math.PI / 2; } else if (s < 2 * tr.l + tr.w) { u = tr.w / 2; v = tr.l / 2 - (s - tr.l - tr.w); hd = Math.PI; } else { u = tr.w / 2 - (s - 2 * tr.l - tr.w); v = -tr.l / 2; hd = -Math.PI / 2; }
    const sn = Math.sin(tr.ang), cs = Math.cos(tr.ang); tr.x = tr.cx + u * cs + v * sn; tr.z = tr.cz - u * sn + v * cs; tr.y = Math.max(0, S.H(tr.x, tr.z)) + 0.25; tr.ry = tr.ang + hd; S.tractors.touch(tr); }
  if ((S.refreshT -= dt) <= 0) { S.refreshT = 0.5; S.tractors.refresh(p); for (const c of S.chunks) c.visible = _cullOn(c, p); } else S.tractors.flush();
  const pos = S.smoke.geometry.attributes.position, col = S.smoke.geometry.attributes.color, PER = S.smokePer; let any = false;
  for (let c = 0; c < S.chimneys.length; c++) { const ch = S.chimneys[c], near = Math.abs(ch.x - p.x) < 2500 && Math.abs(ch.z - p.z) < 2500;
    for (let k = 0; k < PER; k++) { const i = c * PER + k; if (!near) { pos.setXYZ(i, 0, -1e4, 0); continue; } any = true; const f = ((t * 0.16 + k / PER + c * 0.37) % 1);
      pos.setXYZ(i, ch.x + f * 9 + Math.sin(t * 0.8 + k + c) * 0.6 * f, ch.y + f * 14, ch.z + Math.cos(t * 0.6 + k * 2) * 0.8 * f); _tc.copy(_sm).lerp(_sky, f * f); col.setXYZ(i, _tc.r, _tc.g, _tc.b); } }
  pos.needsUpdate = true; col.needsUpdate = true; S.smoke.visible = any;
}
export function stats() { return { ...S.counts }; }
