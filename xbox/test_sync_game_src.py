#!/usr/bin/env python3
"""The sfx.js fetch->XHR anchor is already upstream. Other anchors stay strict."""
import importlib.util
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))


def _load_sync():
    path = os.path.join(HERE, 'sync-game-src.py')
    spec = importlib.util.spec_from_file_location('sync_game_src', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync = _load_sync()


def _patch(rel):
    for item in sync.PATCHES:
        if item[0] == rel:
            return item
    raise AssertionError(rel)


class SyncAnchors(unittest.TestCase):
    def test_only_sfx_may_count_as_already_applied(self):
        for rel, _pairs, already in sync.PATCHES:
            if rel == 'audio/sfx.js':
                self.assertIs(already, sync.sfx_xhr_already_applied)
            else:
                self.assertIsNone(already, rel)

    def test_strict_anchors_still_match_current_main(self):
        for rel, pairs, already in sync.PATCHES:
            if rel == 'audio/sfx.js':
                continue
            with open(os.path.join(REPO, rel), encoding='utf-8') as fh:
                text = fh.read()
            new, missed = sync.apply_file_patches(text, pairs, already=already)
            self.assertEqual(missed, [], rel)
            self.assertNotEqual(new, text, rel)

    def test_inlined_xhr_replacement_counts_as_already_applied(self):
        _rel, pairs, already = _patch('audio/sfx.js')
        anchor, replacement = pairs[0]
        text = 'function decode(src) {\n  ' + replacement + '\n}\n'
        self.assertTrue(already(text, anchor, replacement))
        new, missed = sync.apply_file_patches(text, pairs, already=already)
        self.assertEqual(missed, [])
        self.assertEqual(new, text)

    def test_current_sfx_xhr_loader_is_already_applied(self):
        with open(os.path.join(REPO, 'audio', 'sfx.js'), encoding='utf-8') as fh:
            text = fh.read()
        _rel, pairs, already = _patch('audio/sfx.js')
        anchor, _replacement = pairs[0]
        self.assertNotIn(anchor, text)
        self.assertTrue(already(text, anchor, _replacement))
        new, missed = sync.apply_file_patches(text, pairs, already=already)
        self.assertEqual(missed, [])
        self.assertEqual(new, text)

    def test_old_fetch_anchor_is_still_rewritten_to_xhr(self):
        _rel, pairs, already = _patch('audio/sfx.js')
        anchor, replacement = pairs[0]
        text = 'function decode(src) {\n  ' + anchor + '\n}\n'
        new, missed = sync.apply_file_patches(text, pairs, already=already)
        self.assertEqual(missed, [])
        self.assertIn('new XMLHttpRequest()', new)
        self.assertNotIn('await fetch(src)', new)
        self.assertIn(replacement, new)

    def test_sfx_without_the_xhr_loader_still_fails(self):
        _rel, pairs, already = _patch('audio/sfx.js')
        text = "function decode(src) { if (typeof src === 'string') ab = src; }\n"
        new, missed = sync.apply_file_patches(text, pairs, already=already)
        self.assertEqual(missed, [pairs[0][0]])
        self.assertEqual(new, text)

    def test_partial_xhr_is_not_the_replacement(self):
        _rel, pairs, already = _patch('audio/sfx.js')
        anchor, replacement = pairs[0]
        text = "const x = new XMLHttpRequest(); x.open('GET', src, true); x.responseType = 'arraybuffer'; x.send();"
        self.assertFalse(already(text, anchor, replacement))
        new, missed = sync.apply_file_patches(text, pairs, already=already)
        self.assertEqual(missed, [anchor])
        self.assertEqual(new, text)

    def test_xhr_text_does_not_satisfy_a_different_anchor(self):
        with open(os.path.join(REPO, 'audio', 'sfx.js'), encoding='utf-8') as fh:
            sfx = fh.read()
        anchor = '[...navigator.getGamepads()]'
        replacement = 'Array.prototype.slice.call(navigator.getGamepads())'
        new, missed = sync.apply_file_patches(sfx, [(anchor, replacement)], already=None)
        self.assertEqual(missed, [anchor])
        self.assertEqual(new, sfx)

    def test_sync_on_current_repo_exits_zero(self):
        proc = subprocess.run(
            [sys.executable, os.path.join(HERE, 'sync-game-src.py')],
            cwd=HERE, capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('already applied', proc.stdout)
        copied = os.path.join(HERE, 'build', 'game-src', 'audio', 'sfx.js')
        with open(copied, encoding='utf-8') as fh:
            text = fh.read()
        with open(os.path.join(REPO, 'audio', 'sfx.js'), encoding='utf-8') as fh:
            original = fh.read()
        self.assertEqual(text, original)
        self.assertIn("x.responseType = 'arraybuffer'", text)
        diff = subprocess.run(
            ['git', '-C', REPO, 'diff', '--quiet', '--', 'src', 'index.html', 'audio', 'vendor'],
        )
        self.assertEqual(diff.returncode, 0)


if __name__ == '__main__':
    unittest.main()
