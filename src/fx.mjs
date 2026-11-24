// Small shared effects, one draw call each: cold-gas air-jet puffs / water spray / wake (pooled instanced puffs),
// the charging cable that reaches out and plugs into the vehicle, and a floating battery bar while charging.
import * as THREE from '../vendor/three.module.js';
export function createFx(scene) {
  const N = 110, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf1f5f9, transparent: true, opacity: 0.45, depthWrite: false }), N);
  im.frustumCulled = false; im.renderOrder = 3; im.count = 0; scene.add(im);
  const P = []; for (let i = 0; i < N; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, flat: false, drag: 2 });
  let head = 0; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  function emit(px, py, pz, vx, vy, vz, size = 0.5, life = 0.55, flat = false, drag = 2.5) { const p = P[head]; head = (head + 1) % N; Object.assign(p, { x: px, y: py, z: pz, vx, vy, vz, s: size, life, max: life, flat, drag }); }
  function update(dt) { let n = 0;
    for (const p of P) { if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue; const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; if (!p.flat) p.vy += 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.life / p.max, s = p.s * (0.35 + 1.4 * k) * (k < 0.7 ? 1 : (1 - k) / 0.3); sc.set(s, p.flat ? s * 0.18 : s, s); m.compose(v.set(p.x, p.y, p.z), q, sc); im.setMatrixAt(n++, m); }
    im.count = n; im.instanceMatrix.needsUpdate = true; }
  // cable: two segments (gentle sag) + an orange plug head
  const cm = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6 }), cg = new THREE.CylinderGeometry(0.035, 0.035, 1, 6); cg.translate(0, 0.5, 0);
  const seg = [new THREE.Mesh(cg, cm), new THREE.Mesh(cg, cm)], plug = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.22), new THREE.MeshStandardMaterial({ color: 0xf7931a, emissive: 0x6a3000 }));
  for (const o of [...seg, plug]) { o.visible = false; scene.add(o); }
  const up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();
  function rodBetween(o, a, b) { const d = B.copy(b).sub(a), L = d.length(); o.position.copy(a); o.quaternion.setFromUnitVectors(up, d.normalize()); o.scale.set(1, Math.max(L, 0.01), 1); o.visible = true; }
  function setCable(from, to, k) { A.copy(from); const end = v.copy(from).lerp(to, k), sag = Math.min(1.2, from.distanceTo(end) * 0.12);
    M.copy(A).lerp(end, 0.5); M.y -= sag; const e = end.clone(); rodBetween(seg[0], A, M); rodBetween(seg[1], M, e); plug.position.copy(e); plug.visible = true; }
  function hideCable() { for (const o of [...seg, plug]) o.visible = false; }
  // battery bar sprite
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true })); bar.scale.set(3.2, 0.8, 1); bar.visible = false; bar.renderOrder = 4; scene.add(bar); let lastPct = -1;
  function setBar(pos, pct, scale = 1) { bar.visible = true; bar.position.copy(pos); bar.scale.set(3.2 * scale, 0.8 * scale, 1); const p = Math.round(pct); if (p === lastPct) return; lastPct = p;
    const c = cv.getContext('2d'); c.clearRect(0, 0, 256, 64); c.fillStyle = 'rgba(8,8,10,.82)'; c.fillRect(0, 0, 256, 64); c.strokeStyle = '#F7931A'; c.lineWidth = 4; c.strokeRect(2, 2, 252, 60);
    c.fillStyle = '#2a2a2e'; c.fillRect(54, 16, 186, 32); c.fillStyle = '#F7931A'; c.fillRect(54, 16, 186 * p / 100, 32); c.fillStyle = '#fff'; c.font = 'bold 22px monospace'; c.fillText(p + '%', 122, 40);
    c.fillStyle = '#F7931A'; c.font = 'bold 30px sans-serif'; c.fillText('⚡', 12, 43); tex.needsUpdate = true; }
  function hideBar() { bar.visible = false; }
  return { emit, update, setCable, hideCable, setBar, hideBar, puffs: im, get alive() { return im.count; } };
}
