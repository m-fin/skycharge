// Deterministic placement of every life pocket (pure data, no three.js), following LIFE_DESIGN.md:
//   Home Village (300-600 m off Home Field) · Ridge Farms (2 farmsteads + the main cow herds near Ridge Skycharger)
//   North Cove Solar (array beside that station) · Harbor Town (the one small city: mid-rise blocks <= 5 floors, plaza,
//   pier with moored boats) · Lagoon Suburb (2 short curved streets above Lagoon Pad) · Wild areas (deer, a lone fishing
//   shack, free-range herds). Clearances come from terrainQuery.blocked (120 m runways/pads/dock, 200 m launch,
//   150 m thermal cores); built-up pockets keep >= 600 m of nature between their edges; slopes <= ~15 degrees.
// Computed once per terrainQuery and shared by every life module.
import { rng } from './lifekit.mjs';

const cache = new WeakMap();
export function getLayout(tq, seed = 1) { let L = cache.get(tq); if (!L) { L = buildLayout(tq, seed); cache.set(tq, L); } return L; }

const WALLS = [0xf3e6c8, 0xf2a07b, 0x9fc9e8, 0xa8dcb5, 0xf7dc7a, 0xc9b4e3, 0xf6c3a0, 0xffffff, 0xe8b4c4, 0xd4e7a1];
const ROOFS = [0xb5523b, 0x5d6b7a, 0x8a3b32, 0x2f7c7a, 0x6e4b3a, 0x3f5e8c];
const CROPS = [[0xe2c25a, 0xd2ae45], [0x7fbf4d, 0x6aa83f], [0xa6d46a, 0x93c25a], [0x8a6a44, 0x7a5c3a], [0xb59bd8, 0x9b83c4], [0xf2d23b, 0x6aa83f]];
export const GAP = 600, TAN15 = 0.27;

function buildLayout(tq, seed) {
  const R = rng(seed * 7919 + 101), H = tq.heightAt, half = tq.half || 3900;
  const pick = (a) => a[Math.floor(R() * a.length) % a.length];
  const range = (x, z, r, n = 8) => { let mn = H(x, z), mx = mn; for (let k = 0; k < n; k++) { const a = k / n * 6.283, h = H(x + Math.cos(a) * r, z + Math.sin(a) * r); if (h < mn) mn = h; if (h > mx) mx = h; } return { mn, mx, d: mx - mn }; };
  const slopeOk = (x, z, r) => { const c = [[r, r], [-r, r], [-r, -r], [r, -r]].map(([u, v]) => H(x + u, z + v)), h0 = H(x, z);
    return Math.max(Math.abs(c[0] - c[2]), Math.abs(c[1] - c[3])) / (2.83 * r) <= TAN15 && c.every((h) => Math.abs(h - h0) / (1.41 * r) <= TAN15 * 1.15); };
  const treesNear = (x, z, r) => { let n = 0; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, rr = k ? r * 0.6 : 0; if (tq.treeAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr, r * 0.35)) n++; } return n; };
  function coast(x, z, maxR = 320) { let best = null;
    for (let k = 0; k < 32; k++) { const a = k / 32 * 6.283, c = Math.cos(a), s = Math.sin(a);
      for (let d = 8; d <= maxR; d += 8) { if (H(x + c * d, z + s * d) < 0) { if (!best || d < best.dist) best = { ang: a, dist: d, x: x + c * d, z: z + s * d }; break; } } }
    return best; }
  const st = (re, i) => tq.stations.find((s) => re.test(s.name || '')) || tq.stations[i] || { x: 0, z: 0, padX: 0, padZ: 0 };
  const S = { home: st(/home/i, 0), ridge: st(/ridge/i, 1), north: st(/north|cove|solar/i, 2), lagoon: st(/lagoon/i, 3), harbor: st(/harbor|harbour/i, 4) };
  const pockets = [];
  const gapOk = (x, z, r) => pockets.every((p) => Math.hypot(p.x - x, p.z - z) - p.r - r >= GAP);
  // search a ring around a station for the best spot; relax (wider ring, looser flatness) if nothing fits
  function nearStation(type, s, r, rmin, rmax, test, score) {
    const cx = s.padX ?? s.x, cz = s.padZ ?? s.z;
    for (const relax of [1, 1.5, 2.2]) { let best = null;
      for (let d = rmin; d <= rmax * relax; d += 30) for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283 + d * 0.01, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, h = H(x, z);
        if (h < 3 || Math.abs(x) > half - r || Math.abs(z) > half - r || tq.blocked(x, z, r) || !gapOk(x, z, r) || !slopeOk(x, z, r * 0.6)) continue;
        const g = range(x, z, r * 0.7); if (g.mn < 2 || g.d > 14 * relax) continue; const t = test ? test(x, z, h, g, relax) : {}; if (!t) continue;
        const sc = score(x, z, h, g, t, d) + R() * 4; if (!best || sc < best.s) best = { x, z, h, g, ...t, s: sc }; }
      if (best) { best.type = type; best.r = r; best.station = s.name; pockets.push(best); return best; } }
    return null; }

  // ---------- Home Village first (it has the tightest ring: 300-600 m off Home Field)
  const vil = nearStation('village', S.home, 85, 300, 600, null, (x, z, h, g) => g.d * 2.5 + treesNear(x, z, 80) * 6);
  // ---------- Harbor Town (coastal: pier into the sea)
  const town = nearStation('town', S.harbor, 120, 260, 800, (x, z) => { const co = coast(x, z, 240); return co && co.dist > 60 ? { co } : null; },
    (x, z, h, g, t) => g.d * 3 + treesNear(x, z, 100) * 6 + Math.abs(t.co.dist - 120) * 0.05);
  // ---------- Ridge Farms: two farmsteads (each ~120 m) 260-420 m apart near Ridge Skycharger, then merged into one pocket
  let ridge = null; { const a = nearStation('farms', S.ridge, 120, 250, 900, (x, z, h) => (h < 170 ? {} : null), (x, z, h, g) => g.d * 2 + treesNear(x, z, 120) * 4 + h * 0.03);
    if (a) { pockets.pop(); const b = nearStation('farms', { x: a.x, z: a.z, padX: a.x, padZ: a.z, name: a.station }, 120, 260, 420, (x, z, h) => (h < 170 ? {} : null), (x, z, h, g) => g.d * 2 + treesNear(x, z, 120) * 4);
      if (b) pockets.pop(); const m = b ? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: Math.hypot(a.x - b.x, a.z - b.z) / 2 + 120 } : { x: a.x, z: a.z, r: 120 };
      ridge = { ...m, type: 'farms', station: a.station, steads: b ? [a, b] : [a] }; pockets.push(ridge); } }
  // ---------- North Cove Solar
  const solar = nearStation('solar', S.north, 110, 240, 650, null, (x, z, h, g) => g.d * 4 + treesNear(x, z, 90) * 5);
  // ---------- Lagoon Suburb (gentle slope above Lagoon Pad)
  const sub = nearStation('suburb', S.lagoon, 110, 240, 650, (x, z, h) => (h > 6 ? {} : null), (x, z, h, g) => g.d * 2.5 + treesNear(x, z, 90) * 5);

  // ---------- details
  const houseFits = (x, z, w, d, ry, list, minGap) => { const r = Math.hypot(w, d) / 2 + 1; if (tq.blocked(x, z, r) || tq.treeAt(x, z, r * 0.8)) return null;
    let mn = 1e9, mx = -1e9; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const s = Math.sin(ry), c = Math.cos(ry), px = x + (u * w / 2) * c + (v * d / 2) * s, pz = z - (u * w / 2) * s + (v * d / 2) * c, h = H(px, pz); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mn < 1.2 || mx - mn > 3.2) return null; for (const o of list) if (Math.hypot(o.x - x, o.z - z) < minGap + (o.r || 0) + r) return null; return { mn, mx, r }; };
  const loop = (cx, cz, r, n = 14, wob = 0.18) => { const pts = [], ph = R() * 6; for (let k = 0; k < n; k++) { const a = k / n * 6.283, rr = r * (1 + Math.sin(a * 3 + ph) * wob); const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; pts.push([x, Math.max(0.2, H(x, z)), z]); } return pts; };
  const chimneys = [], benches = [], fishers = [], walkLoops = [], sitters = [];
  const mkPier = (sx, sz, ang, maxLen = 46) => { const c = Math.cos(ang), s = Math.sin(ang); let x0 = sx, z0 = sz; for (let b = 0; b < 30 && H(x0, z0) < 0.4; b++) { x0 -= c * 2; z0 -= s * 2; }
    let len = 12; while (len < maxLen && H(x0 + c * len, z0 + s * len) > -2.4) len += 2; return { x0, z0, x1: x0 + c * len, z1: z0 + s * len, ang, len, w: 3.4 }; };
  const pierFishers = (p, n) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); for (let k = 0; k < n; k++) { const along = p.len - 2 - k * 4.5, side = k % 2 ? -1 : 1;
    fishers.push({ x: p.x0 + c * along - s * side * 1.2, z: p.z0 + s * along + c * side * 1.2, y: 1.1, ry: Math.atan2(-s * side, c * side), dir: [-s * side, c * side], waterY: 0 }); } };

  if (vil) { const v = vil; v.houses = []; v.gardens = []; v.flowers = []; v.chickens = { x: v.x, z: v.z, r: 30 };
    // village green (with benches + a market stall) and a little pond
    v.green = { x: v.x, z: v.z, r: 13 }; const pa = R() * 6.283; v.pond = { x: v.x + Math.cos(pa) * 34, z: v.z + Math.sin(pa) * 34, r: 9 }; v.pond.y = range(v.pond.x, v.pond.z, 9).mn;
    v.stall = { x: v.x + Math.cos(pa + 2.2) * 9, z: v.z + Math.sin(pa + 2.2) * 9 }; v.stall.y = H(v.stall.x, v.stall.z); v.stall.ry = Math.atan2(v.x - v.stall.x, v.z - v.stall.z);
    const occ = [{ x: v.x, z: v.z, r: 13 }, { ...v.pond, r: 12 }, { ...v.stall, r: 4 }];
    for (let t = 0; t < 260 && v.houses.length < 13; t++) { const a = R() * 6.283, d = 24 + R() * 52, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, w = 6.5 + R() * 3.5, dd = 5.5 + R() * 2.5;
      const ry = Math.atan2(v.x - x, v.z - z) + (R() - 0.5) * 0.4; const f = houseFits(x, z, w, dd, ry, occ, 3); if (!f) continue;
      const hs = { x, z, w, d: dd, ry, y: f.mn, rise: f.mx - f.mn, wall: pick(WALLS), roof: pick(ROOFS), floors: R() < 0.25 ? 2 : 1, chimney: R() < 0.7, r: f.r }; v.houses.push(hs); occ.push(hs);
      if (hs.chimney) { const s = Math.sin(ry), c = Math.cos(ry); chimneys.push({ x: x + c * (w * 0.25) + s * (dd * 0.15), y: hs.y + 3.2 * hs.floors + 3.0, z: z - s * (w * 0.25) + c * (dd * 0.15) }); }
      if (R() < 0.6) { const ga = ry + Math.PI, gx = x + Math.sin(ga) * (dd / 2 + 4), gz = z + Math.cos(ga) * (dd / 2 + 4); if (!tq.treeAt(gx, gz, 4) && H(gx, gz) > 1.2) v.gardens.push({ x: gx, z: gz, ry, w: w * 0.8, l: 5 }); } }
    for (let k = 0; k < 3; k++) { const a = pa + 3.6 + k * 0.9, x = v.x + Math.cos(a) * 10, z = v.z + Math.sin(a) * 10; benches.push({ x, z, y: H(x, z), ry: Math.atan2(v.x - x, v.z - z), pocket: 'village' }); }
    for (let k = 0; k < 45; k++) { const a = R() * 6.283, d = 12 + R() * 66, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, h = H(x, z); if (h > 1.5 && occ.every((o) => Math.hypot(o.x - x, o.z - z) > (o.r || 3))) v.flowers.push({ x, z, y: h, c: pick([0xff6f91, 0xffd23f, 0xffffff, 0xb07cff, 0xff8c42]) }); }
    for (const r of [20, 36, 52]) walkLoops.push({ pts: loop(v.x, v.z, r, 16), n: r === 36 ? 3 : 2, pocket: 'village' });
    for (let k = 0; k < 2; k++) { const a = pa + Math.PI + (k - 0.5) * 0.9, x = v.pond.x + Math.cos(a) * (v.pond.r + 1.2), z = v.pond.z + Math.sin(a) * (v.pond.r + 1.2); fishers.push({ x, z, y: H(x, z), ry: Math.atan2(v.pond.x - x, v.pond.z - z), dir: [(v.pond.x - x) / (v.pond.r + 1.2), (v.pond.z - z) / (v.pond.r + 1.2)], waterY: v.pond.y + 0.45, pond: true }); }
  }
  let farms = [];
  if (ridge) { for (const sd of ridge.steads) { const fx = sd.x, fz = sd.z;
      const f = { x: fx, z: fz, ang: R() * Math.PI, type: 'farm' }; const s = Math.sin(f.ang), c = Math.cos(f.ang), to = (u, w) => ({ x: f.x + u * c + w * s, z: f.z - u * s + w * c });
      f.fields = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { if (i === 0 && j === 0) continue; const p = to(i * 58, j * 72), w = 50 + R() * 6, l = 64 + R() * 6;
        if (H(p.x, p.z) < 2 || tq.blocked(p.x, p.z, 36) || range(p.x, p.z, 30).d > 10 || treesNear(p.x, p.z, 36) > 2) continue; f.fields.push({ ...p, ang: f.ang, w, l, crop: pick(CROPS), rows: 7 + Math.floor(R() * 5) }); }
      f.barn = { ...to(-10, -6), ry: f.ang }; f.house = { ...to(14, -8), ry: f.ang + Math.PI, wall: pick(WALLS), roof: pick(ROOFS) }; f.silos = [to(-24, -12), to(-24, -1)].slice(0, 1 + (R() < 0.6 ? 1 : 0));
      for (const o of [f.barn, f.house, ...f.silos]) o.y = range(o.x, o.z, 7, 6).mn;
      { const s2 = Math.sin(f.house.ry), c2 = Math.cos(f.house.ry); chimneys.push({ x: f.house.x + c2 * 2.25 + s2 * 1.05, y: f.house.y + 6.4 + 3.0, z: f.house.z - s2 * 2.25 + c2 * 1.05 }); }
      f.yard = to(-8, 6); const fp = f.fields[0] || { ...to(58, 72), w: 50, l: 64, ang: f.ang }; f.tractor = { cx: fp.x, cz: fp.z, w: fp.w - 8, l: fp.l - 8, ang: fp.ang };
      f.paddocks = []; for (let k = 0; k < 32 && f.paddocks.length < 2; k++) { const aa = f.ang + k * 0.4, rr = k < 16 ? 150 : 115, p = { x: f.x + Math.cos(aa) * rr, z: f.z + Math.sin(aa) * rr };
        if (H(p.x, p.z) < 3 || tq.blocked(p.x, p.z, 36) || range(p.x, p.z, 32).d > 11 || f.paddocks.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 80) || farms.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 140)) continue; f.paddocks.push({ ...p, r: 32 }); }
      walkLoops.push({ pts: loop(f.yard.x, f.yard.z, 12, 10), n: 1, pocket: 'farm' }); farms.push(f); } }
  if (solar) { const s = solar; s.ang = (R() - 0.5) * 0.5; s.rows = 8; s.cols = 25; s.y = range(s.x, s.z, 60).mn; }
  if (town) { const T = town; T.blocks = []; T.ang = T.co.ang; const sn = Math.sin(T.ang), cs = Math.cos(T.ang), to = (u, v) => ({ x: T.x + u * cs + v * sn, z: T.z - u * sn + v * cs });
    // blocks laid out on a 3x3 grid around the plaza, facing the sea (+u = toward the sea)
    for (const [i, j] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1], [-2, 0]]) { if (T.blocks.length >= 6) break; const p = to(i * 40, j * 40), w = 20 + R() * 8, d = 18 + R() * 8, floors = 3 + Math.floor(R() * 3);
      if (tq.blocked(p.x, p.z, 16) || H(p.x, p.z) < 1.5) continue; const g = range(p.x, p.z, 13, 6); if (g.d > 6) continue; T.blocks.push({ ...p, ry: -T.ang + Math.PI / 2, w, d, floors, h: floors * 3.4, y: g.mn - 0.6, top: g.mx, kind: pick(['glass', 'stone', 'white', 'brick', 'pastel']), solar: R() < 0.5, garden: R() < 0.4 }); }
    T.blocks.sort((a, b) => b.h - a.h); if (T.blocks[0]) T.blocks[0].tallest = true;
    T.plaza = { x: T.x, z: T.z, y: H(T.x, T.z) }; T.roads = []; for (const u of [-20, 20]) { T.roads.push({ ...to(u, 0), ang: T.ang + Math.PI / 2, w: 8, l: 170 }); T.roads.push({ ...to(0, u), ang: T.ang, w: 8, l: 170 }); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, x = T.x + Math.cos(a) * 12, z = T.z + Math.sin(a) * 12; benches.push({ x, z, y: H(x, z), ry: Math.atan2(T.x - x, T.z - z), pocket: 'town' }); }
    for (const r of [16, 24]) walkLoops.push({ pts: loop(T.x, T.z, r, 12, 0.05), n: 3, pocket: 'town' });
    T.pier = mkPier(T.co.x, T.co.z, T.co.ang, 60); pierFishers(T.pier, 3);
    { const p = T.pier, c = Math.cos(p.ang), s = Math.sin(p.ang); T.moored = []; for (let k = 0; k < 4; k++) { const along = 8 + k * 11, side = k % 2 ? -1 : 1; T.moored.push({ x: p.x0 + c * along - s * side * 7, z: p.z0 + s * along + c * side * 7, ry: Math.atan2(c, s) }); } }
    T.chickens = null; }
  if (sub) { const sb = sub; sb.houses = []; sb.streets = []; sb.ang = R() * 6.283; const occ = [];
    // two short curved streets: arcs of radius 70 m bending around a shared centre behind the pocket
    const cx = sb.x - Math.cos(sb.ang) * 70, cz = sb.z - Math.sin(sb.ang) * 70;
    for (const [rad, span] of [[52, 0.95], [92, 0.7]]) { const pts = []; for (let k = 0; k <= 14; k++) { const a = sb.ang - span / 2 + span * k / 14, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad; pts.push([x, H(x, z), z]); } sb.streets.push({ rad, span, pts });
      const n = Math.floor(rad * span / 15); for (let k = 0; k < n; k++) for (const side of [-1, 1]) { const a = sb.ang - span / 2 + span * (k + 0.5) / n, rr = rad + side * 15, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const ry = Math.atan2(-Math.cos(a) * side, -Math.sin(a) * side), w = 8.5 + R() * 2, d = 7 + R() * 1.5, f = houseFits(x, z, w, d, ry, occ, 2.5); if (!f) continue;
        const h = { x, z, w, d, ry, y: f.mn, rise: f.mx - f.mn, wall: pick(WALLS), roof: pick(ROOFS), floors: R() < 0.4 ? 2 : 1, r: f.r }; sb.houses.push(h); occ.push(h); } }
    sb.center = { x: cx, z: cz }; const pg = { x: cx + Math.cos(sb.ang) * 72, z: cz + Math.sin(sb.ang) * 72 }; sb.playground = { ...pg, y: H(pg.x, pg.z), ry: sb.ang };
    walkLoops.push({ pts: sb.streets[0].pts.concat(sb.streets[0].pts.slice().reverse()), n: 3, pocket: 'suburb', pingpong: true }); walkLoops.push({ pts: sb.streets[1].pts.concat(sb.streets[1].pts.slice().reverse()), n: 2, pocket: 'suburb' }); }

  // ---------- wild: a lone fishing shack, deer, free-range + beach + highland cows
  const farFromPockets = (x, z, d) => pockets.every((p) => Math.hypot(p.x - x, p.z - z) - p.r > d);
  const C = []; for (let x = -half + 200; x <= half - 200; x += 70) for (let z = -half + 200; z <= half - 200; z += 70) { const h = H(x, z); if (h > 1) C.push({ x, z, h }); }
  const rnd = () => C[Math.floor(R() * C.length)];
  let shack = null; for (let t = 0; t < 4000 && !shack; t++) { const c = rnd(); if (c.h > 8 || c.h < 2 || tq.blocked(c.x, c.z, 30) || !farFromPockets(c.x, c.z, 500)) continue; const co = coast(c.x, c.z, 70); if (!co || !slopeOk(c.x, c.z, 8)) continue;
    shack = { x: c.x, z: c.z, y: range(c.x, c.z, 5).mn, ry: Math.atan2(Math.cos(co.ang), Math.sin(co.ang)), co }; shack.pier = mkPier(co.x, co.z, co.ang, 30); pierFishers(shack.pier, 2);
    chimneys.push({ x: shack.x, y: shack.y + 5.2, z: shack.z }); pockets.push({ x: shack.x, z: shack.z, r: 15, type: 'shack' }); }
  const herds = []; const herdFree = (x, z, d) => herds.every((h) => Math.hypot(h.x - x, h.z - z) > d);
  for (const f of farms) for (const pd of f.paddocks) herds.push({ x: pd.x, z: pd.z, r: pd.r * 0.85, n: 14 + Math.floor(R() * 6), variant: pick(['holstein', 'holstein', 'brown', 'belted']), ridge: true });
  if (ridge) for (let t = 0; t < 400; t++) { const a = R() * 6.283, d = 230 + R() * 200, x = ridge.x + Math.cos(a) * d, z = ridge.z + Math.sin(a) * d; if (H(x, z) < 4 || tq.blocked(x, z, 30) || !herdFree(x, z, 120) || range(x, z, 25).d > 12) continue; herds.push({ x, z, r: 28, n: 16 + Math.floor(R() * 4), variant: 'mixed', ridge: true }); break; }
  const wild = (test, d = 400) => { for (let t = 0; t < 5000; t++) { const c = rnd(); if (tq.blocked(c.x, c.z, 40) || !farFromPockets(c.x, c.z, 250) || !herdFree(c.x, c.z, d) || !test(c)) continue; return c; } return null; };
  for (let k = 0; k < 2; k++) { const c = wild((c) => c.h > 8 && c.h < 160 && range(c.x, c.z, 30).d < 14 && treesNear(c.x, c.z, 30) < 3, 700); if (c) herds.push({ x: c.x, z: c.z, r: 26, n: 11 + Math.floor(R() * 4), variant: pick(['brown', 'mixed', 'holstein']) }); }
  { const c = wild((c) => c.h > 110 && c.h < 260 && range(c.x, c.z, 28).d < 20, 600); if (c) herds.push({ x: c.x, z: c.z, r: 28, n: 10, variant: 'highland' }); }
  const beaches = []; for (let t = 0; t < 8000 && beaches.length < 2; t++) { const c = rnd(); if (c.h > 5) continue; const co = coast(c.x, c.z, 60); if (!co || tq.blocked(c.x, c.z, 60) || !farFromPockets(c.x, c.z, 250)) continue;
    if (beaches.some((b) => Math.hypot(b.x - c.x, b.z - c.z) < 900) || Math.abs(H(co.x + Math.cos(co.ang) * 22, co.z + Math.sin(co.ang) * 22)) > 1.6) continue;
    beaches.push({ x: c.x, z: c.z, ang: co.ang, sx: co.x, sz: co.z }); herds.push({ x: co.x, z: co.z, r: 22, n: 8, variant: pick(['brown', 'mixed']), beach: co.ang }); }
  const deer = []; for (let k = 0; k < 2; k++) { const c = wild((c) => c.h > 25 && c.h < 260 && farFromPockets(c.x, c.z, 600) && deer.every((d) => Math.hypot(d.x - c.x, d.z - c.z) > 1000), 500); if (c) deer.push({ x: c.x, z: c.z, r: 22, n: 4 }); }
  // sheep 40 / horses 10 / chickens 30 (LIFE_DESIGN), plus a few town pigeons
  const flocks = []; if (farms[0] && farms[0].fields.length) { const fl = farms[0].fields[farms[0].fields.length - 1]; flocks.push({ x: fl.x, z: fl.z, r: 22, n: 14 }); }
  if (solar) flocks.push({ x: solar.x, z: solar.z, r: 40, n: 12, underPanels: true });
  { const c = wild((c) => c.h > 15 && c.h < 200 && range(c.x, c.z, 25).d < 14, 500); if (c) flocks.push({ x: c.x, z: c.z, r: 22, n: 14 }); }
  const horses = farms.map((f) => { const pd = f.paddocks[1] || f.paddocks[0]; return pd ? { x: pd.x + 6, z: pd.z - 6, r: 18, n: 5 } : null; }).filter(Boolean);
  const birds = farms.map((f) => ({ x: f.yard.x, z: f.yard.z, r: 9, n: 10, kind: 'chicken' })); if (vil) birds.push({ x: vil.x, z: vil.z, r: 28, n: 10, kind: 'chicken' }); if (town) birds.push({ x: town.x, z: town.z, r: 14, n: 8, kind: 'pigeon' });
  // ---------- sea
  const deep = (x, z, r) => { if (H(x, z) > -14) return false; for (let k = 0; k < 8; k++) if (H(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r) > -6) return false; return true; };
  const sailLoops = []; for (let t = 0; t < 4000 && sailLoops.length < 3; t++) { const a = R() * 6.283, d = 2400 + R() * 1200, x = Math.cos(a) * d, z = Math.sin(a) * d, r = 160 + R() * 200;
    if (Math.abs(x) > half - r || Math.abs(z) > half - r || !deep(x, z, r) || sailLoops.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r + 600)) continue; sailLoops.push({ x, z, r, dir: R() < 0.5 ? 1 : -1 }); }
  const offshore = (p, ang, d0) => { for (let d = d0; d < d0 + 600; d += 20) { const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d; if (H(x, z) < -6) return { x, z }; } return null; };
  const fishingSpots = [town && offshore(town, town.co.ang + 0.5, town.co.dist + 120), shack && offshore(shack, shack.co.ang - 0.3, 140)].filter(Boolean);
  let cowBoat = null; for (let t = 0; t < 2000 && !cowBoat; t++) { const a = R() * 6.283, d = 2000 + R() * 1200, x = Math.cos(a) * d, z = Math.sin(a) * d; if (deep(x, z, 120) && sailLoops.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 300)) cowBoat = { x, z, r: 90 }; }
  let bottle = null; { const b = beaches[1] || beaches[0]; if (b) bottle = { x: b.sx + Math.cos(b.ang) * 14, z: b.sz + Math.sin(b.ang) * 14 }; }
  // ---------- secret cows: the GOLDEN cow alone on the highest summit near Summit Launch (just outside its 200 m clear zone), + a rooftop cow in town
  const secrets = [];
  if (tq.launch) { let best = null; for (let d = 205; d <= 420; d += 15) for (let k = 0; k < 36; k++) { const a = k / 36 * 6.283, x = tq.launch.x + Math.cos(a) * d, z = tq.launch.z + Math.sin(a) * d, h = H(x, z);
      if (tq.blocked(x, z, 0) || !slopeOk(x, z, 3)) continue; if (!best || h > best.h) best = { x, z, h }; } if (best) secrets.push({ x: best.x, z: best.z, y: best.h, kind: 'golden', col: 0xffc83a }); }
  if (town && town.blocks[0]) { const t = town.blocks[0]; secrets.push({ x: t.x + 2, z: t.z - 1.5, y: t.y + t.h + (t.top - t.y) + 0.95, kind: 'rooftop', col: 0xf7f4ee }); }
  // ---------- 1.0.8.2 cow pass: herds you can SEE from Home Field, the cottage cow field, and more meadow herds.
  // Own RNG so nothing above this line moves. Clear of runways/pads (tq.blocked), pockets and the 1.0.9 home plot.
  { const R2 = rng(seed * 4241 + 977), plot = { x: 740, z: 520 }, used = herds.slice();
    const okSpot = (x, z, gap, rr = 28) => H(x, z) > 3 && !tq.blocked(x, z, 40) && farFromPockets(x, z, 50) && Math.hypot(x - plot.x, z - plot.z) > 90 && range(x, z, rr).d < 12 && used.every((h) => Math.hypot(h.x - x, h.z - z) > gap);
    const push = (h) => { herds.push(h); used.push(h); };
    const hm = S.home; let homeN = 0;
    for (let t = 0; t < 3000 && homeN < 3; t++) { const a = R2() * 6.283, d = 250 + R2() * 200, x = hm.x + Math.cos(a) * d, z = hm.z + Math.sin(a) * d;
      if (!okSpot(x, z, 140)) continue; push({ x, z, r: 30, n: 13 + Math.floor(R2() * 4), variant: ['holstein', 'mixed', 'brown'][homeN], home: true }); homeN++; }
    if (okSpot(940, 470, 120, 24)) push({ x: 940, z: 470, r: 26, n: 14, variant: 'holstein', cottage: true });
    for (let k = 0, t = 0; k < 5 && t < 6000; t++) { const c = rnd(); if (c.h < 6 || c.h > 170 || !okSpot(c.x, c.z, 650) || treesNear(c.x, c.z, 30) > 3) continue;
      push({ x: c.x, z: c.z, r: 28, n: 13 + Math.floor(R2() * 5), variant: ['mixed', 'brown', 'holstein', 'belted', 'cream'][k] }); k++; } }
  const people = { walkLoops, benches, fishers };
  return { pockets, stations: S, village: vil, farms, ridge, solar, town, suburb: sub, shack, chimneys, herds, flocks, horses, birds, deer, beaches, sailLoops, fishingSpots, cowBoat, bottle, secrets, people, deep };
}
