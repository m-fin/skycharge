#!/usr/bin/env python3
"""Copy the game into xbox/build/game-src and re-apply the EdgeHTML patches.

The repository's own sources are never written. Paths are relative to this
repo (the old machine used /workspace/crave-lab/plane-game and a sibling
game-src). If an anchor string has moved, every miss is printed and the
script exits 1. It does not edit src/, index.html, or audio/ to make an
anchor match.

The audio/sfx.js fetch->XHR anchor is the one exception. Upstream already
loads string URLs through XMLHttpRequest (encodedBytes, fetch only in the
catch). When that replacement-equivalent loader is present, the anchor is
already applied and is not a failure. Every other anchor stays strict.
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
DST = os.path.join(HERE, 'build', 'game-src')

# EdgeHTML: load package files with XHR (arraybuffer). fetch stays only as the fallback.
SFX_FETCH_ANCHOR = (
    "if (typeof src === 'string') { const r = await fetch(src); if (!r.ok) throw new Error(r.status + ' ' + src); ab = await r.arrayBuffer(); }"
)
SFX_FETCH_REPLACEMENT = (
    "if (typeof src === 'string') ab = await new Promise((res, rej) => { try { const x = new XMLHttpRequest(); x.open('GET', src, true); x.responseType = 'arraybuffer';\n"
    "      x.onload = () => ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength ? res(x.response) : rej(new Error(x.status + ' ' + src))); x.onerror = () => rej(new Error('xhr ' + src)); x.send(); }\n"
    "      catch (e) { fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status + ' ' + src)))).then(res, rej); } });"
)
# Upstream encodedBytes() returns this same promise (`return await`) instead of `ab = await`.
SFX_XHR_PROMISE = SFX_FETCH_REPLACEMENT.split('ab = await ', 1)[1]


def sfx_xhr_already_applied(text, anchor, replacement):
    """True when sfx.js already has this patch's XMLHttpRequest loader.

    The obsolete anchor assigned the promise to `ab`. Current sources return it
    from encodedBytes() and call that helper for string URLs. A partial
    XMLHttpRequest (or the fetch fallback alone) does not count.
    """
    del replacement
    if anchor in text or SFX_XHR_PROMISE not in text:
        return False
    inlined = 'ab = await ' + SFX_XHR_PROMISE in text
    helper = (
        'function encodedBytes' in text
        and 'return await ' + SFX_XHR_PROMISE in text
        and 'encodedBytes(src)' in text
    )
    return inlined or helper


def apply_file_patches(text, pairs, already=None):
    """Apply (anchor, replacement) pairs. Return (text, missed_anchors).

    `already(text, anchor, replacement)` may accept one missing anchor as
    already applied. Callers pass that only for the sfx.js XHR patch.
    """
    missed = []
    for anchor, replacement in pairs:
        if anchor in text:
            text = text.replace(anchor, replacement, 1)
            continue
        if already is not None and already(text, anchor, replacement):
            continue
        missed.append(anchor)
    return text, missed


# (relative path, pairs, already-applied predicate or None). None means a miss fails.
PATCHES = [
    ('src/input.mjs', [
        ('[...navigator.getGamepads()]', 'Array.prototype.slice.call(navigator.getGamepads())'),
    ], None),
    ('src/world.mjs', [
        ('new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6',
         'new THREE.IcosahedronGeometry(1, window.__XBOX ? 1 : 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6'),
    ], None),
    ('src/main.mjs', [
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
        ('if (!manual) life2.loop((dt) => frame(dt, merged()));',
         "if (window.__boot) window.__boot('game init ok');\nif (!manual) life2.loop((dt) => frame(dt, merged()));"),
    ], None),
    ('audio/sfx.js', [
        (SFX_FETCH_ANCHOR, SFX_FETCH_REPLACEMENT),
    ], sfx_xhr_already_applied),
]


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

    def patch(rel, pairs, already=None):
        path = os.path.join(DST, rel)
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        new, missed = apply_file_patches(text, pairs, already=already)
        for anchor, replacement in pairs:
            if anchor not in text and already is not None and already(text, anchor, replacement):
                print(f'{rel}: anchor already applied (XMLHttpRequest loader present)')
        for anchor in missed:
            failures.append((rel, anchor))
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(new)

    for rel, pairs, already in PATCHES:
        patch(rel, pairs, already)

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
