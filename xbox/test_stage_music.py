#!/usr/bin/env python3
"""Xbox music staging: the package must contain what the loader reads.

src/main.mjs (and the ms-appx patch in sync-game-src.py) loads:
  audio/music/out/cabin_chill_loop.mp3
  audio/music/out/flight_theme_loop.mp3
  audio/music/out/weather_{rain,fog,cloudy}_layer.wav

It does not look in xbox22k/. Those 22.05 kHz files are the masters the
pack copies into audio/music/out/ inside the package. A missing master
must fail the pack, not ship silence.
"""
import math
import os
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)

import stage_music  # noqa: E402


LOOPS = ('cabin_chill_loop.mp3', 'flight_theme_loop.mp3')
LAYERS = ('rain', 'fog', 'cloudy')
XBOX_FRAMES = 2_822_400  # 128.000 s at 22.05 kHz


def write_wav(path, rate, nframes, freq=0.0, amp=8000):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        if freq == 0:
            handle.writeframes(b'\x00\x00' * nframes)
            return
        chunk = 65536
        for start in range(0, nframes, chunk):
            end = min(nframes, start + chunk)
            buf = bytearray()
            for i in range(start, end):
                sample = int(amp * math.sin(2 * math.pi * freq * i / rate))
                buf += struct.pack('<h', sample)
            handle.writeframes(buf)


def write_mp3(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'ID3\x04\x00\x00' + b'\x00' * 16)


def run_stage(music, layout):
    return subprocess.run(
        [sys.executable, os.path.join(HERE, 'stage_music.py'), str(music), str(layout)],
        capture_output=True, text=True,
    )


class StageMusic(unittest.TestCase):
    def test_missing_music_exits_nonzero_and_names_every_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            music = Path(tmp) / 'out'
            music.mkdir()
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertNotEqual(proc.returncode, 0, proc.stdout)
            err = proc.stderr
            self.assertIn('missing', err.lower())
            for name in LOOPS:
                self.assertIn(name, err)
            for key in LAYERS:
                self.assertIn(f'xbox22k/weather_{key}_layer.wav', err.replace('\\', '/'))
                self.assertIn(f'weather_{key}_layer.wav', err)
            self.assertFalse((layout / 'cabin_chill_loop.mp3').exists())
            self.assertFalse((layout / 'weather_rain_layer.wav').exists())

    def test_loops_without_weather_are_not_a_successful_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            music = Path(tmp) / 'out'
            for name in LOOPS:
                write_mp3(music / name)
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertNotEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertIn('weather_rain_layer.wav', proc.stderr)
            self.assertFalse((layout / 'cabin_chill_loop.mp3').exists())

    def test_xbox22k_wavs_land_where_the_loader_looks(self):
        with tempfile.TemporaryDirectory() as tmp:
            music = Path(tmp) / 'out'
            for name in LOOPS:
                write_mp3(music / name)
            for key in LAYERS:
                write_wav(music / 'xbox22k' / f'weather_{key}_layer.wav', 22050, XBOX_FRAMES)
            (music / 'cabin_chill_loop.ogg').write_bytes(b'OggS')
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            for name in LOOPS:
                self.assertEqual((layout / name).read_bytes(), (music / name).read_bytes())
            for key in LAYERS:
                name = f'weather_{key}_layer.wav'
                self.assertEqual((layout / name).read_bytes(), (music / 'xbox22k' / name).read_bytes())
                self.assertFalse((layout / 'xbox22k').exists())
            self.assertFalse((layout / 'cabin_chill_loop.ogg').exists())

    def test_repo_music_stages_the_committed_22k_layers(self):
        music = Path(REPO) / 'audio' / 'music' / 'out'
        with tempfile.TemporaryDirectory() as tmp:
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            for key in LAYERS:
                name = f'weather_{key}_layer.wav'
                packed = layout / name
                self.assertTrue(packed.is_file(), name)
                self.assertEqual(packed.read_bytes(), (music / 'xbox22k' / name).read_bytes())
                with wave.open(str(packed), 'rb') as handle:
                    self.assertEqual(handle.getnchannels(), 1)
                    self.assertEqual(handle.getsampwidth(), 2)
                    self.assertEqual(handle.getframerate(), 22050)
                    self.assertEqual(handle.getnframes(), XBOX_FRAMES)
            for name in LOOPS:
                self.assertEqual((layout / name).read_bytes(), (music / name).read_bytes())
        diff = subprocess.run(
            ['git', '-C', REPO, 'diff', '--quiet', '--', 'audio/music'],
        )
        self.assertEqual(diff.returncode, 0)

    def test_master_in_out_is_resampled_into_xbox22k(self):
        with tempfile.TemporaryDirectory() as tmp:
            music = Path(tmp) / 'out'
            for name in LOOPS:
                write_mp3(music / name)
            # Rain is a periodic sine so a naive one-pass resample would show
            # a seam. Fog and cloudy are silence; all three must be produced.
            write_wav(music / 'weather_rain_layer.wav', 44100, 44100 * 128, freq=440)
            for key in ('fog', 'cloudy'):
                write_wav(music / f'weather_{key}_layer.wav', 44100, 44100 * 128)
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            xbox = music / 'xbox22k' / 'weather_rain_layer.wav'
            self.assertTrue(xbox.is_file())
            with wave.open(str(xbox), 'rb') as handle:
                self.assertEqual(handle.getframerate(), 22050)
                self.assertEqual(handle.getnframes(), XBOX_FRAMES)
                frames = handle.readframes(XBOX_FRAMES)
            amp = 8000
            worst = 0
            for i in range(0, XBOX_FRAMES, 9973):
                got = struct.unpack_from('<h', frames, i * 2)[0]
                expect = int(round(amp * math.sin(2 * math.pi * 440 * i / 22050)))
                worst = max(worst, abs(got - expect))
            self.assertLessEqual(worst, 2, worst)
            self.assertEqual((layout / 'weather_rain_layer.wav').read_bytes(), xbox.read_bytes())
            for key in ('fog', 'cloudy'):
                self.assertTrue((layout / f'weather_{key}_layer.wav').is_file())

    def test_bad_xbox22k_wav_fails_instead_of_being_packed(self):
        with tempfile.TemporaryDirectory() as tmp:
            music = Path(tmp) / 'out'
            for name in LOOPS:
                write_mp3(music / name)
            for key in LAYERS:
                path = music / 'xbox22k' / f'weather_{key}_layer.wav'
                write_wav(path, 8000, 8000)  # wrong rate and length
            layout = Path(tmp) / 'layout'
            proc = run_stage(music, layout)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn('22050', proc.stderr)
            self.assertIn('weather_rain_layer.wav', proc.stderr)
            self.assertFalse((layout / 'weather_rain_layer.wav').exists())

    def test_pack_legacy_calls_stage_music(self):
        text = Path(HERE, 'pack-legacy.sh').read_text(encoding='utf-8')
        self.assertIn('stage_music.py', text)
        self.assertNotIn('Weather layers are optional', text)
        self.assertIn('weather_rain_layer.wav', text)
        self.assertIn('weather_fog_layer.wav', text)
        self.assertIn('weather_cloudy_layer.wav', text)


if __name__ == '__main__':
    unittest.main()
