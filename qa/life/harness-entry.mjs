// QA harness: the current world (src/world.mjs) + src/life, same renderer / fog / lights / camera as main.mjs.
// ?life=0 builds the world only (the "without" measurement). window.H drives it headlessly.
import * as THREE from '../../vendor/three.module.js';
import { createWorld } from '../../src/world.mjs';
import * as life from '../../src/life/index.mjs';
const q = new URLSearchParams(location.search), W = +q.get('w') || 1280, Hh = +q.get('h') || 720, withLife = q.get('life') !== '0';
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false, preserveDrawingBuffer: true }); renderer.setPixelRatio(1); renderer.setSize(W, Hh);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcfe2f2, 1600, 9000); scene.matrixAutoUpdate = false;
const camera = new THREE.PerspectiveCamera(62, W / Hh, 0.5, 30000);
scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x5d6b40, 1.5)); const sun = new THREE.DirectionalLight(0xfff0d4, 2.6); sun.position.set(0.55, 0.8, 0.25).multiplyScalar(1000); scene.add(sun);
const t0 = performance.now(); const world = createWorld(+q.get('seed') || 1); scene.add(world.group); const worldMs = performance.now() - t0;
const tq = life.makeTerrainQuery(world); const secrets = [];
if (withLife) life.init(scene, tq, { onSecret: (k) => secrets.push(k) });
const player = new THREE.Vector3(0, 300, 0); let wt = 0;
window.H = { THREE, renderer, scene, camera, world, life, tq, player, secrets, worldMs, withLife, gl: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1', rev: THREE.REVISION,
  // camera at (x,y,z) looking at (lx,ly,lz); player = camera position unless given
  cam(x, y, z, lx, ly, lz, px) { camera.position.set(x, y, z); camera.lookAt(lx, ly, lz); camera.updateProjectionMatrix(); player.copy(px || camera.position); },
  step(n = 1, dt = 1 / 60, move = null) { for (let i = 0; i < n; i++) { wt += dt; world.update(wt); if (move) { player.x += move.x * dt; player.y += (move.y || 0) * dt; player.z += move.z * dt; } if (withLife) life.update(dt, player); } },
  render() { renderer.render(scene, camera); return renderer.info.render; },
  // per-frame cost: update (life only) + render, averaged over n frames
  perf(n = 60, move = null) { let up = 0, rd = 0, calls = 0, tris = 0; for (let i = 0; i < n; i++) { wt += 1 / 60; const a = performance.now(); world.update(wt); if (move) { player.x += move.x / 60; player.z += move.z / 60; } if (withLife) life.update(1 / 60, player); const b = performance.now();
      renderer.render(scene, camera); renderer.getContext().finish(); const c = performance.now(); up += b - a; rd += c - b; calls = renderer.info.render.calls; tris = renderer.info.render.triangles; }
    return { updateMs: +(up / n).toFixed(3), renderMs: +(rd / n).toFixed(2), calls, tris }; },
  ready: true };
