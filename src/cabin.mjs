// Cozy cabin interior (attached to a vehicle). Camera sits inside, looking out the big left window.
import * as THREE from '../vendor/three.module.js';
const ORANGE = 0xf7931a;
export function buildCabin() {
  const g = new THREE.Group(); g.visible = false;
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide, ...o });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const wall = M(0xe9dcc6), wood = M(0x8a5a36), dark = M(0x5a3a22), floor = M(0x7a4e2e), fabric = M(0xcfc2aa), pill = M(ORANGE), rugM = M(0x2a2a2e);
  // room: x -1.6..1.6, y -1..1.3, z -2.5..2.5. Window on left wall: z -1.9..1.3, y -0.3..1.0
  const W0 = -1.9, W1 = 1.3, WY0 = -0.3, WY1 = 1.0, LX = -1.6;
  box(3.2, 0.06, 5, 0, -1.03, 0, floor); box(3.2, 0.06, 5, 0, 1.33, 0, wall);
  box(0.06, 2.36, 5, 1.63, 0.15, 0, wall); box(3.2, 2.36, 0.06, 0, 0.15, -2.53, wall); box(3.2, 2.36, 0.06, 0, 0.15, 2.53, wall);
  box(0.06, WY0 + 1.0, 5, LX - 0.03, (WY0 - 1.0) / 2, 0, wall); box(0.06, 1.3 - WY1, 5, LX - 0.03, (WY1 + 1.3) / 2, 0, wall);
  box(0.06, WY1 - WY0, W0 + 2.5, LX - 0.03, (WY0 + WY1) / 2, (W0 - 2.5) / 2, wall); box(0.06, WY1 - WY0, 2.5 - W1, LX - 0.03, (WY0 + WY1) / 2, (W1 + 2.5) / 2, wall);
  // window frame + mullion + sill
  box(0.14, 0.08, W1 - W0 + 0.16, LX, WY1 + 0.04, (W0 + W1) / 2, dark); box(0.14, 0.08, W1 - W0 + 0.16, LX, WY0 - 0.04, (W0 + W1) / 2, dark);
  box(0.14, WY1 - WY0, 0.08, LX, (WY0 + WY1) / 2, W0 - 0.04, dark); box(0.14, WY1 - WY0, 0.08, LX, (WY0 + WY1) / 2, W1 + 0.04, dark);
  box(0.1, WY1 - WY0, 0.05, LX, (WY0 + WY1) / 2, (W0 + W1) / 2, dark);
  box(0.34, 0.05, W1 - W0 + 0.3, LX + 0.17, WY0 - 0.06, (W0 + W1) / 2, wood);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W1 - W0, WY1 - WY0), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })); glass.rotation.y = Math.PI / 2; glass.position.set(LX - 0.01, (WY0 + WY1) / 2, (W0 + W1) / 2); g.add(glass);
  // window seat with cushion + pillows
  box(0.75, 0.42, W1 - W0, LX + 0.38, -0.8, (W0 + W1) / 2, wood); box(0.72, 0.14, W1 - W0 - 0.05, LX + 0.38, -0.52, (W0 + W1) / 2, fabric);
  const p1 = box(0.16, 0.36, 0.5, LX + 0.18, -0.27, -1.4, pill); p1.rotation.x = 0.2; const p2 = box(0.16, 0.32, 0.45, LX + 0.2, -0.29, 0.85, M(0x2f6f73)); p2.rotation.x = -0.2;
  // side table + mug + book stack
  box(0.55, 0.05, 0.55, 0.15, -0.35, -1.5, wood); box(0.05, 0.65, 0.05, 0.15, -0.68, -1.5, dark);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 14), M(ORANGE, { roughness: 0.4 })); mug.position.set(0.05, -0.26, -1.42); g.add(mug);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 14), M(0x3a2112)); coffee.rotation.x = -Math.PI / 2; coffee.position.set(0.05, -0.205, -1.42); g.add(coffee);
  box(0.26, 0.04, 0.19, 0.27, -0.31, -1.6, M(0x2f4f7f)); box(0.24, 0.04, 0.18, 0.26, -0.27, -1.6, M(0xb8402e)); box(0.22, 0.035, 0.17, 0.27, -0.233, -1.61, M(0xd8cfa8));
  // rug
  box(1.7, 0.02, 2.6, 0.25, -0.995, -0.2, rugM); box(1.5, 0.022, 0.06, 0.25, -0.99, -1.4, pill); box(1.5, 0.022, 0.06, 0.25, -0.99, 1.0, pill);
  // plant in the corner
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 12), M(0x1b1b1f)); pot.position.set(1.3, -0.84, -2.2); g.add(pot);
  for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), M(0x3f8a45)); l.scale.set(1, 1.6, 0.6); l.position.set(1.3 + Math.sin(i * 2.4) * 0.12, -0.5 + (i % 3) * 0.1, -2.2 + Math.cos(i * 2.4) * 0.12); l.rotation.z = Math.sin(i) * 0.5; g.add(l); }
  // hanging lamp + string lights along the window top
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); lamp.position.set(0.1, 0.95, -0.7); g.add(lamp);
  box(0.01, 0.36, 0.01, 0.1, 1.13, -0.7, dark);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 16, 1, true), M(ORANGE)); shade.position.set(0.1, 1.06, -0.7); g.add(shade);
  const bulbM = new THREE.MeshBasicMaterial({ color: 0xffb35c }); for (let i = 0; i < 14; i++) { const z = W0 + (i + 0.5) * (W1 - W0) / 14, b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), bulbM); b.position.set(LX + 0.09, WY1 + 0.1 - 0.05 * Math.sin((i + 0.5) / 14 * Math.PI * 7) ** 2, z); g.add(b); }
  const light = new THREE.PointLight(0xffc27a, 2.2, 7, 1.5); light.position.set(0.1, 0.8, -0.6); g.add(light);
  const fill = new THREE.PointLight(0xffe2b8, 0.8, 6, 1.5); fill.position.set(1.0, 0.3, 1.6); g.add(fill);
  // small battery gauge plaque on the back wall (updated from main)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.225), new THREE.MeshBasicMaterial({ map: tex })); gauge.position.set(0.15, 0.4, -2.49); g.add(gauge);
  function setGauge(pct, label) { const c = cv.getContext('2d'); c.fillStyle = '#0b0b0d'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#F7931A'; c.lineWidth = 4; c.strokeRect(4, 4, 248, 88);
    c.fillStyle = '#F7931A'; c.font = 'bold 22px monospace'; c.fillText(label, 16, 34); c.fillStyle = '#222'; c.fillRect(16, 48, 224, 30); c.fillStyle = pct < 20 ? '#ff4a3a' : '#F7931A'; c.fillRect(16, 48, 224 * pct / 100, 30);
    c.fillStyle = '#fff'; c.font = 'bold 22px monospace'; c.fillText(Math.round(pct) + '%', 104, 72); tex.needsUpdate = true; }
  setGauge(100, 'BATTERY');
  // eye + default look toward the window
  const eye = new THREE.Vector3(0.95, 0.22, 1.0), look = { yaw: 1.0, pitch: -0.04 };
  return { group: g, eye, look, setGauge };
}
