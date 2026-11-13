#!/usr/bin/env python3
"""Copy the game into xbox/build/game-src and re-apply the EdgeHTML patches.

The repository's own sources are never written. Paths are relative to this
repo (the old machine used /workspace/crave-lab/plane-game and a sibling
game-src). If an anchor string has moved, every miss is printed and the
script exits 1. It does not edit src/, index.html, or audio/ to make an
anchor match.
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
DST = os.path.join(HERE, 'build', 'game-src')


def copy_tree(rel):
    src = os.path.join(REPO, rel)
    dst = os.path.join(DST, rel)
    if not os.path.isdir(src):
        sys.exit(f'missing game directory: {src}')
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('node_modules', '.git'))


def main():
    if os.path.isdir(DST):
        shutil.rmtree(DST)
    os.makedirs(os.path.join(DST, 'audio'), exist_ok=True)
    for rel in ('src', 'vendor'):
        copy_tree(rel)
    for name in ('sfx.js', 'README.md', 'sfx_test.html'):
        src = os.path.join(REPO, 'audio', name)
        if not os.path.isfile(src):
            sys.exit(f'missing game file: {src}')
        shutil.copy2(src, os.path.join(DST, 'audio', name))
    index = os.path.join(REPO, 'index.html')
    if not os.path.isfile(index):
        sys.exit(f'missing game file: {index}')
    shutil.copy2(index, os.path.join(DST, 'index.html'))
    # Authoritative shim/boot are the copies next to this script, not compat/shared.
    for name in ('xbox-shim.js', 'xbox-boot.js'):
        shutil.copy2(os.path.join(HERE, name), os.path.join(DST, name))

    failures = []

    def patch(rel, pairs):
        path = os.path.join(DST, rel)
        text = open(path, encoding='utf-8').read()
        for anchor, replacement in pairs:
            if anchor not in text:
                failures.append((rel, anchor))
                continue
            text = text.replace(anchor, replacement, 1)
        open(path, 'w', encoding='utf-8').write(text)

    patch('src/input.mjs', [
        ('[...navigator.getGamepads()]', 'Array.prototype.slice.call(navigator.getGamepads())'),
    ])
    patch('src/world.mjs', [
        ('new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6',
         'new THREE.IcosahedronGeometry(1, window.__XBOX ? 1 : 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6'),
    ])
    patch('src/main.mjs', [
        ('renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: manual });',
         "renderer = new THREE.WebGLRenderer({ canvas, antialias: !window.__XBOX, preserveDrawingBuffer: manual });\nif (window.__boot) window.__boot('renderer ok: ' + (renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1') + ' maxTex ' + renderer.capabilities.maxTextureSize);"),
        # UWP package pages are ms-appx: (not http). Load the loops from the package with relative paths there too.
        ('  if (/^https?:/.test(location.protocol)) {',
         '  if (/^(https?|ms-appx(-web)?):/.test(location.protocol)) {'),
        ('updateCamera(dt); updateHUD(dt); syncAudio(); renderer.render(scene, camera);',
         'updateCamera(dt); hudAcc += dt; if (!window.__XBOX || (++hudN & 1)) { updateHUD(hudAcc); hudAcc = 0; } syncAudio(); renderer.render(scene, camera);'),
        ('\nlet acc = 0;\n',
         '\nlet acc = 0, hudAcc = 0, hudN = 0; // Xbox: HUD + minimap redraw every 2nd frame\n'),
        ('  G, world, stations: world.stations, THREE, coins, missions,',
         '  renderer, scene, camera, G, world, stations: world.stations, THREE, coins, missions,'),
        ('if (!manual) { let last = performance.now();',
         "if (window.__boot) window.__boot('game init ok');\nif (!manual) { let last = performance.now();"),
    ])
    # EdgeHTML: load package files with XHR (arraybuffer). fetch stays only as the fallback.
    patch('audio/sfx.js', [
        ("if (typeof src === 'string') { const r = await fetch(src); if (!r.ok) throw new Error(r.status + ' ' + src); ab = await r.arrayBuffer(); }",
         "if (typeof src === 'string') ab = await new Promise((res, rej) => { try { const x = new XMLHttpRequest(); x.open('GET', src, true); x.responseType = 'arraybuffer';\n      x.onload = () => ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength ? res(x.response) : rej(new Error(x.status + ' ' + src))); x.onerror = () => rej(new Error('xhr ' + src)); x.send(); }\n      catch (e) { fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status + ' ' + src)))).then(res, rej); } });"),
    ])

    if failures:
        sys.stderr.write('Xbox patch anchors failed. Game sources in the repo were not modified.\n')
        sys.stderr.write('The build stops here. Failed anchors:\n')
        for rel, anchor in failures:
            shown = anchor.replace('\n', '\\n')
            sys.stderr.write(f'  {rel}: {shown[:180]}\n')
        sys.exit(1)
    print(f'game-src synced from {REPO} -> {DST}')


if __name__ == '__main__':
    main()
