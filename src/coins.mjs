// Collectible coins: route coins between stations, landmark coins (lighthouse + turbines), and blimp-only low-altitude coins.
// Each coin is collected once and remembered in the save (progress.collected).
import * as THREE from '../vendor/three.module.js';
import { rng } from './world.mjs';
const ORANGE = 0xf7931a;
export const COIN_VALUE = { route: 2, landmark: 3, blimp: 5 };
export function createCoins(world, seed = 1) {
  const list = [], group = new THREE.Group(), R = rng(seed * 97 + 3), st = world.stations, gnd = (x, z) => world.groundAt(x, z).h;
  const clearAbove = (x, z, r) => { let m = 0; for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) m = Math.max(m, gnd(x + dx, z + dz)); return m; };
  // route coins along station-to-station legs
  for (const [a, b] of [[0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [2, 3]]) {
    const A = st[a], B = st[b], len = Math.hypot(B.padX - A.padX, B.padZ - A.padZ), n = Math.max(3, Math.floor(len / 380));
    for (let k = 0; k < n; k++) { const t = (k + 0.7) / (n + 0.4), x = A.padX + (B.padX - A.padX) * t, z = A.padZ + (B.padZ - A.padZ) * t;
      const y = Math.max(A.h + (B.h - A.h) * t + 75, clearAbove(x, z, 60) + 45); list.push({ id: `r${a}${b}-${k}`, kind: 'route', x, y, z }); }
  }
  // landmark coins: a ring around the lighthouse lamp, one beside each turbine hub
  const L = world.landmarks.lighthouse; if (L) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; list.push({ id: `lh-${k}`, kind: 'landmark', x: L.x + Math.cos(a) * 55, y: L.top + 22, z: L.z + Math.sin(a) * 55 }); }
  world.landmarks.turbines.forEach((T, k) => list.push({ id: `wt-${k}`, kind: 'landmark', x: T.x + 35, y: T.top - 10, z: T.z + 35 }));
  // blimp-only coins: low over open land (12–18 m AGL)
  let nb = 0; for (let t = 0; t < 4000 && nb < 12; t++) { const x = (R() - 0.5) * 5200, z = (R() - 0.5) * 5200, h = world.heightAt(x, z); if (h < 6 || h > 140 || world.inStation(x, z, 40)) continue;
    if (Math.abs(gnd(x + 25, z) - h) > 6 || Math.abs(gnd(x, z + 25) - h) > 6) continue; list.push({ id: `bl-${nb++}`, kind: 'blimp', x, y: h + 15, z }); }
  // meshes
  const coinGeo = new THREE.CylinderGeometry(3, 3, 0.6, 28), rimGeo = new THREE.TorusGeometry(3, 0.35, 8, 28), bigGeo = new THREE.CylinderGeometry(4.6, 4.6, 0.7, 28), bigRim = new THREE.TorusGeometry(4.6, 0.55, 8, 28);
  coinGeo.rotateX(Math.PI / 2); bigGeo.rotateX(Math.PI / 2);
  // Bitcoin-style faces: a canvas texture with the ₿ symbol on both caps (in-game collectibles only, no real value).
  // The bottom cap's UVs run the other way, so it gets a mirrored copy of the face and reads correctly from both sides.
  const face = (bg, ring, fg, mirror) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, 128, 128); c.strokeStyle = ring; c.lineWidth = 7; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(64, 64, 47, 0, 7); c.stroke();
    c.translate(64, 64); c.rotate(-Math.PI / 2); if (mirror) c.scale(-1, 1); c.rotate(0.21); /* caps map the texture a quarter-turn round */ c.fillStyle = fg; c.font = 'bold 78px Arial, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B', 2, 4);
    for (const x of [-9, 5]) { c.fillRect(x, -44, 7, 14); c.fillRect(x, 30, 7, 14); } // the two strokes through the B make it ₿ (drawn, so no font needs the glyph)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t; };
  const mk = (tex, emissive, white) => new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, emissive, emissiveMap: tex, emissiveIntensity: white ? 0.45 : 0.55, metalness: white ? 0.1 : 0.45, roughness: 0.35 });
  const mOrange = new THREE.MeshStandardMaterial({ color: ORANGE, emissive: 0x8a4300, metalness: 0.5, roughness: 0.35 }), mRim = new THREE.MeshBasicMaterial({ color: 0xffc46b }),
    mWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777777, roughness: 0.4 }), mBRim = new THREE.MeshBasicMaterial({ color: ORANGE });
  const fO = [face('#F7931A', '#ffd08a', '#ffffff', false), face('#F7931A', '#ffd08a', '#ffffff', true)], fW = [face('#f4f4f2', '#F7931A', '#F7931A', false), face('#f4f4f2', '#F7931A', '#F7931A', true)];
  const matsO = [mOrange, mk(fO[0], 0xffffff), mk(fO[1], 0xffffff)], matsW = [mWhite, mk(fW[0], 0xffffff, true), mk(fW[1], 0xffffff, true)];
  // Perf 1.0.8.1 (Flow): one InstancedMesh per coin part per kind (orange: body + rim, white blimp coin: body + rim) instead of
  // 2 meshes (4 draws) per coin. The body keeps its 3-material array (edge + the two faces), so it is 3 instanced draws.
  // A coin's body and rim share one instance matrix (spin + bob); a collected coin gets a zero-scale matrix.
  // c.mesh is a small stand-in so code that reads c.mesh.visible / c.mesh.children[0].material keeps working.
  for (const c of list) c.ry = R() * 6.28; // same RNG order as before, so every coin starts at the same spin angle
  const kinds = { o: list.filter((c) => c.kind !== 'blimp'), w: list.filter((c) => c.kind === 'blimp') }, parts = [];
  for (const [k, cs] of Object.entries(kinds)) { if (!cs.length) continue; const big = k === 'w';
    const body = new THREE.InstancedMesh(big ? bigGeo : coinGeo, big ? matsW : matsO, cs.length), rim = new THREE.InstancedMesh(big ? bigRim : rimGeo, big ? mBRim : mRim, cs.length);
    for (const im of [body, rim]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = big ? 'coins-blimp' : 'coins'; group.add(im); } parts.push({ cs, body, rim });
    cs.forEach((c, i) => { c.slot = { body, rim, i }; c.collected = false; let vis = true;
      c.mesh = { children: [{ material: body.material }, { material: rim.material }], get visible() { return vis; }, set visible(v) { v = !!v; if (v !== vis) { vis = v; place(c, 0); } } }; }); }
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function place(c, t) { const { body, rim, i } = c.slot; if (c.mesh.visible) { _p.set(c.x, c.y + Math.sin(t * 1.6 + c.x) * 0.6, c.z); _q.setFromAxisAngle(_up, c.ry); _s.set(1, 1, 1); } else _s.set(0, 0, 0);
    _m.compose(_p, _q, _s); body.setMatrixAt(i, _m); rim.setMatrixAt(i, _m); body.instanceMatrix.needsUpdate = rim.instanceMatrix.needsUpdate = true; }
  for (const c of list) place(c, 0);
  for (const P of parts) for (const im of [P.body, P.rim]) { im.computeBoundingSphere(); im.boundingSphere.radius += 2; } // bob is ±0.6 m
  function sync(collectedIds) { const set = new Set(collectedIds); for (const c of list) { c.collected = set.has(c.id); c.mesh.visible = !c.collected; } }
  function update(t) { for (const c of list) if (!c.collected) { c.ry += 0.04; place(c, t); } }
  // returns coins picked up this tick by vehicle at pos
  function check(kind, pos) { const out = []; for (const c of list) { if (c.collected) continue; if (c.kind === 'blimp' && kind !== 'blimp') continue; const r = kind === 'blimp' ? 15 : 9;
    if (Math.abs(pos.x - c.x) < r && Math.abs(pos.z - c.z) < r && Math.hypot(pos.x - c.x, pos.y - c.y, pos.z - c.z) < r) { c.collected = true; c.mesh.visible = false; out.push(c); } } return out; }
  return { list, group, sync, update, check, total: list.length };
}
