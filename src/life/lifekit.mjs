// SKYCHARGE world-life: shared low-poly kit.
//  - Builder: merges procedural primitives into ONE BufferGeometry with baked vertex colours plus three extra per-vertex
//    attributes the life shader understands: aPart (what animates), aPivot (where it rotates) and aTint (1 = takes the
//    per-instance colour). One merged geometry = one draw call.
//  - lifeMaterial(): MeshLambertMaterial + a tiny vertex-shader patch (WebGL1 / three 0.162 and 0.186 safe) that animates
//    heads, tails, legs, arms, bobbers and propellers on the GPU from uTime, so animated herds cost no per-frame JS.
//  - Pool: an InstancedMesh with distance culling (refreshed a few times a second, not every frame) and per-instance
//    phase + colour attributes. Only instances inside `far` are written; count is set to how many are live.
import * as THREE from '../../vendor/three.module.js';

export const PART = { STATIC: 0, HEAD: 1, TAIL: 2, ARM: 3, LEG_L: 4, LEG_R: 5, BOB: 6, SPIN: 7, PECK: 8, ROD: 9, FLAG: 10 };

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
// same graze curve as the shader (so JS knows when a head is down and the animal should stand still)
export const grazeAmt = (t, ph) => smooth(-0.3, 0.6, Math.sin(t * 0.35 + ph));

const _c = new THREE.Color();
export const lin = (hex) => _c.setHex(hex).clone(); // sRGB hex -> linear Color (matches three's colour management)

// ---------------------------------------------------------------- geometry builder
export class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.part = []; this.piv = []; this.tint = []; this.vmask = []; this.mask = 0; }
  // variant(mask): every primitive added after this only shows on instances whose variant bit is in mask (0 = all)
  variant(mask) { this.mask = mask; return this; }
  get vertexCount() { return this.pos.length / 3; }
  // g: any BufferGeometry (indexed or not). m: Matrix4 (optional). color: hex. o: { part, pivot:[x,y,z], tint:0|1, shade:[top,bottom] }
  add(g, m, color, o = {}) {
    const src = g.index ? g.toNonIndexed() : g; const p = src.attributes.position, n = src.attributes.normal;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null, v = new THREE.Vector3(), c = lin(color), part = o.part || 0, tint = o.tint ? 1 : 0;
    const pv = o.pivot || [0, 0, 0]; let ymin = Infinity, ymax = -Infinity;
    if (o.shade) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const ly = v.y; if (m) v.applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      if (n) { v.fromBufferAttribute(n, i); if (nm) v.applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z); } else this.nor.push(0, 1, 0);
      let k = 1; if (o.shade) { const t = ymax > ymin ? (ly - ymin) / (ymax - ymin) : 1; k = o.shade[1] + (o.shade[0] - o.shade[1]) * t; }
      this.col.push(c.r * k, c.g * k, c.b * k); this.part.push(part); this.piv.push(pv[0], pv[1], pv[2]); this.tint.push(tint); this.vmask.push(o.mask ?? this.mask);
    }
    if (src !== g) src.dispose(); return this;
  }
  // set the pivot of every part-0 vertex from index i0 on to (x, z): the static-pocket distance cull uses it
  cullCentre(i0, x, z) { for (let i = i0; i < this.part.length; i++) if (!this.part[i]) { this.piv[i * 3] = x; this.piv[i * 3 + 1] = 0; this.piv[i * 3 + 2] = z; } return this; }
  // primitive helpers: position (x,y,z), rotation (rx,ry,rz) in radians, uniform/non-uniform scale via geometry dims
  box(w, h, d, x, y, z, color, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), mat(x, y, z, o), color, o); }
  cyl(rt, rb, h, seg, x, y, z, color, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), mat(x, y, z, o), color, o); }
  cone(r, h, seg, x, y, z, color, o = {}) { return this.add(new THREE.ConeGeometry(r, h, seg), mat(x, y, z, o), color, o); }
  ball(r, x, y, z, color, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail || 0), mat(x, y, z, o), color, o); }
  // gable roof: a triangular prism along X (w), depth d, height h, base at y
  roof(w, d, h, x, y, z, color, o = {}) {
    const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    return this.add(g, mat(x, y, z, o), color, o);
  }
  // terrain-draped quad grid (fields, lawns, roads): corners given in world/local XZ, heightFn gives y
  drape(x0, z0, x1, z1, cell, heightFn, color, lift = 0.25, o = {}) {
    const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / cell)), nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / cell)), c = lin(color);
    const P = (i, j) => { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; return [x, heightFn(x, z) + lift, z]; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1), k = o.jitter ? 1 + (Math.sin(i * 12.9 + j * 78.2) * 0.5) * o.jitter : 1;
      for (const q of [a, d, b, b, d, cc]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(0, 1, 0); this.col.push(c.r * k, c.g * k, c.b * k); this.part.push(0); this.piv.push(0, 0, 0); this.tint.push(0); this.vmask.push(this.mask); }
    }
    return this;
  }
  // rotated rectangle drape: centre (cx,cz), heading ang (rad), size w (across) x l (along)
  drapeRect(cx, cz, ang, w, l, cell, heightFn, color, lift = 0.25, o = {}) {
    const s = Math.sin(ang), c = Math.cos(ang), nx = Math.max(1, Math.ceil(w / cell)), nz = Math.max(1, Math.ceil(l / cell)), col = lin(color);
    const P = (i, j) => { const u = -w / 2 + w * i / nx, v = -l / 2 + l * j / nz, x = cx + u * c + v * s, z = cz - u * s + v * c; return [x, heightFn(x, z) + lift, z]; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1), k = o.jitter ? 1 + Math.sin(i * 12.9 + j * 78.2) * 0.5 * o.jitter : 1;
      for (const q of [a, d, b, b, d, cc]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(0, 1, 0); this.col.push(col.r * k, col.g * k, col.b * k); this.part.push(0); this.piv.push(0, 0, 0); this.tint.push(0); this.vmask.push(this.mask); } }
    return this;
  }
  // append another Builder transformed by m (used to stamp templates: houses, trees, people)
  stamp(b, m, tintColor = null) {
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m), tc = tintColor != null ? lin(tintColor) : null;
    for (let i = 0; i < b.pos.length; i += 3) {
      v.set(b.pos[i], b.pos[i + 1], b.pos[i + 2]).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.set(b.nor[i], b.nor[i + 1], b.nor[i + 2]).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      const t = b.tint[i / 3]; if (tc && t) this.col.push(b.col[i] * tc.r, b.col[i + 1] * tc.g, b.col[i + 2] * tc.b); else this.col.push(b.col[i], b.col[i + 1], b.col[i + 2]);
      this.part.push(b.part[i / 3]); v.set(b.piv[i], b.piv[i + 1], b.piv[i + 2]).applyMatrix4(m); this.piv.push(v.x, v.y, v.z); this.tint.push(tc ? 0 : t); this.vmask.push(b.vmask[i / 3] || this.mask);
    }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 1)); g.setAttribute('aVar', new THREE.Float32BufferAttribute(this.vmask, 1));
    g.computeBoundingSphere(); return g;
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export const PI = Math.PI;
function mat(x, y, z, o) { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); _s.set(o.sx || 1, o.sy || 1, o.sz || 1); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s); }
export function trs(x, y, z, ry = 0, s = 1, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2])).clone(); }

// ---------------------------------------------------------------- material with GPU animation
const VERT_HEAD = `
attribute float aPart; attribute vec3 aPivot; attribute float aTint; attribute float aVar;
#ifdef USE_INSTANCING
attribute float aPhase; attribute vec3 aCol;
#endif
uniform float uTime; uniform vec3 uPlayer; uniform float uNearR; uniform float uLowH; uniform float uWalk; uniform float uCull; uniform vec3 uGrow;
vec3 lfRotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c); }
vec3 lfRotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); }
vec3 lfRotZ(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x*c - p.y*s, p.x*s + p.y*c, p.z); }
`;
const VERT_BODY = `
{
  float ph = 0.0; float vr = 0.0; vec3 iPos = vec3(0.0);
#ifdef USE_INSTANCING
  vr = floor(aPhase / 10.0); ph = aPhase - vr * 10.0; iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#endif
  // variant mask: aVar = 0 -> every variant; else bit (1 << vr) must be set, otherwise the vertex collapses (zero-area, not drawn)
  bool keep = aVar < 0.5 || mod(floor(aVar / pow(2.0, vr)), 2.0) > 0.5;
  // static (non-instanced) pockets: part-0 vertices carry their pocket centre in aPivot; whole pocket collapses beyond uCull
  if (uCull > 0.0 && aPart < 0.5 && distance(aPivot.xz, uPlayer.xz) > uCull) keep = false;
  float attn = (1.0 - smoothstep(uNearR * 0.6, uNearR, distance(iPos.xz, uPlayer.xz))) * (1.0 - smoothstep(uLowH * 0.6, uLowH, uPlayer.y - iPos.y));
  float graze = smoothstep(-0.3, 0.6, sin(uTime * 0.35 + ph));
  if (aPart > 0.5) {
    vec3 p = transformed - aPivot;
    if (aPart < 1.5) { p = lfRotX(p, graze * 0.85 * (1.0 - attn) - attn * 0.35 + sin(uTime * 1.3 + ph) * 0.05); }                       // HEAD: graze dip, looks up at a low flyer
    else if (aPart < 2.5) { p = lfRotZ(p, sin(uTime * 2.1 + ph * 3.0) * 0.5); p = lfRotX(p, 0.15 + 0.1 * sin(uTime * 1.3 + ph)); }   // TAIL: swish
    else if (aPart < 3.5) { float w = clamp(attn * 1.6, 0.0, 1.0); p = lfRotZ(p, w * (2.5 + 0.35 * sin(uTime * 9.0 + ph))); }       // ARM: wave up at a low flyer
    else if (aPart < 5.5) { float sgn = aPart < 4.5 ? 1.0 : -1.0; float mv = uWalk > 0.5 ? (vr < 1.5 ? 1.0 : 0.0) : (uWalk < -0.5 ? 0.0 : 1.0 - smoothstep(0.0, 0.2, graze));
                            p = lfRotX(p, sgn * sin(uTime * 5.5 + ph) * 0.45 * mv); }                                              // LEGS: walk swing
    else if (aPart < 6.5) { p.y += sin(uTime * 2.3 + ph) * 0.12; }                                                                   // BOB: bobber / float
    else if (aPart < 7.5) { p = lfRotZ(p, uTime * 18.0 + ph); }                                                                       // SPIN: propeller (about local Z)
    else if (aPart < 8.5) { float k = step(0.55, fract(uTime * 0.7 + ph * 0.3)); p = lfRotX(p, k * 0.9 * abs(sin(uTime * 14.0 + ph))); } // PECK: bird pecking
    else if (aPart < 9.5) { p = lfRotX(p, sin(uTime * 0.9 + ph) * 0.06 - 0.02); }                                                    // ROD: gentle rod twitch
    else { p = lfRotY(p, sin(uTime * 3.0 + ph + p.x * 0.8) * 0.25 * clamp(p.x, 0.0, 3.0)); }                                         // FLAG: flutter
    transformed = p + aPivot;
  }
  // far-LOD grow: distant instances scale up a little so herds still read from the air (uGrow = start, end, extra scale)
  if (uGrow.z > 0.0) transformed *= 1.0 + uGrow.z * smoothstep(uGrow.x, uGrow.y, distance(iPos.xz, uPlayer.xz));
  if (!keep) transformed = vec3(0.0);
}
`;
const COLOR_BODY = `
#ifdef USE_INSTANCING
  vColor.rgb *= mix(vec3(1.0), aCol, aTint);
#endif
`;
// Each module gets its own material (own uTime / uPlayer values); identical shader source, so three shares one program per variant.
export function lifeMaterial(opts = {}) {
  const uniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, 1e5, 0) }, uNearR: { value: opts.nearR || 140 }, uLowH: { value: opts.lowH || 110 }, uWalk: { value: opts.walk || 0 }, uCull: { value: opts.cull || 0 }, uGrow: { value: new THREE.Vector3(...(opts.grow || [0, 1, 0])) } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: !!opts.offset, polygonOffsetFactor: opts.offset ? -1 : 0, polygonOffsetUnits: opts.offset ? -4 : 0, side: opts.offset ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY)
      .replace('#include <color_vertex>', '#include <color_vertex>\n' + COLOR_BODY);
  };
  m.customProgramCacheKey = () => 'skycharge-life-v2';
  m.userData.u = uniforms; return m;
}
export function tickMaterial(m, t, player) { const u = m.userData.u; u.uTime.value = t; if (player) u.uPlayer.value.copy(player); }

// ---------------------------------------------------------------- instance pool with distance culling
// items: plain objects { x, y, z, ry, s (number or [sx,sy,sz]), rx, rz, ph, col (hex) }. Mutate then call pool.touch(item).
export class Pool {
  constructor(geom, material, max, { far = 1200, name = 'pool' } = {}) {
    this.geom = new THREE.BufferGeometry(); for (const k in geom.attributes) this.geom.setAttribute(k, geom.attributes[k]);
    this.aPhase = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.aPhase.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.geom.setAttribute('aPhase', this.aPhase); this.geom.setAttribute('aCol', this.aCol);
    this.mesh = new THREE.InstancedMesh(this.geom, material, max); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false; this.mesh.name = name; this.mesh.matrixAutoUpdate = false; this.mesh.updateMatrix();
    this.max = max; this.far2 = far * far; this.items = []; this.live = []; this.dirtyAll = true; this.anyDirty = false;
  }
  add(it) { it.slot = -1; it.ph = it.ph ?? Math.random() * 6.283; it.col = it.col ?? 0xffffff; this.items.push(it); return it; }
  touch(it) { if (it.slot >= 0) { this.write(it.slot, it); this.anyDirty = true; } }
  write(i, it) {
    const s = it.s ?? 1; _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); _q.setFromEuler(_e); if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s); this.mesh.setMatrixAt(i, _m);
    this.aPhase.array[i] = (it.ph % 6.2832) + 10 * (it.v || 0);
    if (it._c !== it.col) { it._c = it.col; it._lin = _c.setHex(it.col).toArray([]); } const c = it._lin; this.aCol.array[i * 3] = c[0]; this.aCol.array[i * 3 + 1] = c[1]; this.aCol.array[i * 3 + 2] = c[2];
  }
  // re-select which items are live (within far of p, and passing an optional filter). Cheap linear scan; call a few times/second.
  refresh(p, filter = null) {
    for (const it of this.live) it.slot = -1; this.live.length = 0;
    for (const it of this.items) { if (it.hidden) continue; const dx = it.x - p.x, dz = it.z - p.z; if (dx * dx + dz * dz > this.far2 * (it.farMul || 1)) continue; if (filter && !filter(it)) continue;
      if (this.live.length >= this.max) break; it.slot = this.live.length; this.live.push(it); this.write(it.slot, it); }
    this.mesh.count = this.live.length; this.mesh.visible = this.live.length > 0; this.flush(true);
  }
  flush(force = false) { if (!force && !this.anyDirty) return; this.mesh.instanceMatrix.needsUpdate = true; this.aPhase.needsUpdate = true; this.aCol.needsUpdate = true; this.anyDirty = false; }
}

// small soft round sprite for Points (smoke, splash, spray)
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot; const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  _dot = new THREE.CanvasTexture(c); return _dot;
}
// a pool of soft particles with simple ballistic motion (splash, spout, smoke). One Points draw call.
export class Particles {
  constructor(max, { size = 2, color = 0xffffff, opacity = 0.85, gravity = -9.8, drag = 0.4 } = {}) {
    this.max = max; this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.n = 0; this.g = gravity; this.drag = drag;
    const g = new THREE.BufferGeometry(); this.attr = new THREE.BufferAttribute(this.pos, 3); this.attr.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', this.attr);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTexture(), color, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.points.visible = false; this.points.matrixAutoUpdate = false; this.points.updateMatrix(); this.alive = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1e4;
  }
  emit(x, y, z, vx, vy, vz, life) { const i = this.n; this.n = (this.n + 1) % this.max; this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = life; }
  update(dt) {
    let alive = 0; const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) { if (this.life[i] <= 0) continue; this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0 || this.pos[j + 1] < -2) { this.pos[j + 1] = -1e4; this.life[i] = 0; continue; }
      this.vel[j] *= k; this.vel[j + 2] *= k; this.vel[j + 1] = this.vel[j + 1] * k + this.g * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt; alive++; }
    this.alive = alive; this.points.visible = alive > 0; if (alive || this._was) this.attr.needsUpdate = true; this._was = alive > 0;
  }
}
// freeze matrices of things that never move (saves the per-frame matrix walk, like world.mjs does)
export function bake(o) { o.traverse((c) => { c.updateMatrix(); c.matrixAutoUpdate = false; }); o.updateMatrixWorld(true); }
