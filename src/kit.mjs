// Tiny geometry "kit": collect boxes / cylinders / shapes with a colour each, then merge them into ONE mesh
// (one draw call, vertex colours). Keeps the interiors and stations cheap on Xbox (WebGL1, ~20 fps).
import * as THREE from '../vendor/three.module.js';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function createKit() {
  const parts = [];
  // add(geometry, colour, [x,y,z], [rx,ry,rz], [sx,sy,sz])
  function add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv'); if (!g.getAttribute('normal')) g.computeVertexNormals();
    _e.set(rot[0], rot[1], rot[2], 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2])); g.applyMatrix4(_m);
    parts.push({ g, color }); return g;
  }
  const box = (w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], [rx, ry, rz]);
  const cyl = (rt, rb, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0) => add(new THREE.CylinderGeometry(rt, rb, h, seg), color, [x, y, z], [rx, ry, rz]);
  // rod between two points a=[x,y,z], b=[x,y,z]
  function rod(a, b, r, color, seg = 6) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), geo = new THREE.CylinderGeometry(r, r, d.length(), seg);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); return add(geo, color, [(A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2]); }
  function geometry() {
    let n = 0; for (const p of parts) n += p.g.getAttribute('position').count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { const a = p.g.getAttribute('position'), b = p.g.getAttribute('normal'); _c.setHex(p.color);
      for (let i = 0; i < a.count; i++, o++) { pos[o * 3] = a.getX(i); pos[o * 3 + 1] = a.getY(i); pos[o * 3 + 2] = a.getZ(i); nor[o * 3] = b.getX(i); nor[o * 3 + 1] = b.getY(i); nor[o * 3 + 2] = b.getZ(i); col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b; }
      p.g.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere(); parts.length = 0; return g;
  }
  // lit: MeshStandard (or Lambert when cheap) with vertex colours; basic: unlit glow parts
  function mesh(kind = 'lit', opts = {}) {
    const g = geometry(); const m = kind === 'basic' ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...opts })
      : kind === 'lambert' ? new THREE.MeshLambertMaterial({ vertexColors: true, ...opts }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, ...opts });
    return new THREE.Mesh(g, m);
  }
  return { add, box, cyl, rod, geometry, mesh, get count() { return parts.length; } };
}
// small canvas-texture display panel (w x h metres), redraw with draw(ctx, W, H)
export function makeScreen(w, h, px = 256) {
  const cv = document.createElement('canvas'); cv.width = px; cv.height = Math.round(px * h / w); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { mesh: m, draw(fn) { const c = cv.getContext('2d'); fn(c, cv.width, cv.height); tex.needsUpdate = true; } };
}
