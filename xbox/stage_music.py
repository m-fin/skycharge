#!/usr/bin/env python3
"""Copy music into an Xbox package layout, or exit with a clear error.

The EdgeHTML loader (src/main.mjs, ms-appx patch in sync-game-src.py) reads
files from audio/music/out/ next to index.html. It does not look in xbox22k/:

  cabin_chill_loop.mp3
  flight_theme_loop.mp3
  weather_rain_layer.wav
  weather_fog_layer.wav
  weather_cloudy_layer.wav

The weather WAVs must be 16-bit mono 22.05 kHz, exactly 2,822,400 samples
(128.000 s). Those masters live in audio/music/out/xbox22k/. If a layer is
missing there but audio/music/out/weather_<layer>_layer.wav exists, this
resamples that master into xbox22k/ (3x periodic copy, keep the middle
third, so the loop stays seamless) and packs the result.

A missing loop or layer is a hard error. The old pack skipped a missing
xbox22k/ directory and shipped a package with no weather music.
"""
import shutil
import subprocess
import sys
import wave
from pathlib import Path

LOOPS = ('cabin_chill_loop.mp3', 'flight_theme_loop.mp3')
LAYERS = ('rain', 'fog', 'cloudy')
RATE = 22050
SAMPLES = 2_822_400  # 128.000 s
LOOP_SECONDS = 128.0


class MusicError(Exception):
    pass


def is_mp3(path):
    sig = Path(path).read_bytes()[:4]
    return sig[:3] == b'ID3' or (len(sig) >= 2 and sig[0] == 0xFF and (sig[1] & 0xE0) == 0xE0)


def wav_info(path):
    """Return (channels, sampwidth, rate, frames) or raise wave.Error."""
    handle = wave.open(str(path), 'rb')
    try:
        if handle.getcomptype() != 'NONE':
            raise wave.Error('compressed wav')
        return (
            handle.getnchannels(),
            handle.getsampwidth(),
            handle.getframerate(),
            handle.getnframes(),
        )
    finally:
        handle.close()


def describe_wav(path):
    try:
        channels, width, rate, frames = wav_info(path)
    except (wave.Error, EOFError, FileNotFoundError) as exc:
        return f'not a PCM wav ({exc})'
    return f'{channels} ch, {width * 8}-bit, {rate} Hz, {frames} samples'


def is_xbox_wav(path):
    try:
        channels, width, rate, frames = wav_info(path)
    except (wave.Error, EOFError, FileNotFoundError):
        return False
    return channels == 1 and width == 2 and rate == RATE and frames == SAMPLES


def resample_loop(src, dst, ffmpeg):
    """22.05 kHz middle third of a 3x copy. src must be exactly 128 s."""
    try:
        _channels, _width, rate, frames = wav_info(src)
    except (wave.Error, EOFError) as exc:
        raise MusicError(f'{src} is not a PCM wav ({exc})') from exc
    if rate <= 0 or frames <= 0:
        raise MusicError(f'{src} has no samples to resample')
    duration = frames / float(rate)
    if abs(duration - LOOP_SECONDS) > 0.001:
        raise MusicError(
            f'{src} is {duration:.3f} s. Xbox weather layers are 128.000 s, '
            'so the 22.05 kHz file can be the middle third of a 3x copy.'
        )
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    partial = dst.with_name(dst.name + '.tmp.wav')
    filt = (
        '[0:a]aformat=sample_fmts=s16:channel_layouts=mono,'
        f'aloop=loop=2:size={frames}:start=0,'
        f'aresample={RATE},'
        'atrim=start=128:end=256,asetpts=PTS-STARTPTS'
    )
    try:
        proc = subprocess.run(
            [
                ffmpeg, '-v', 'error', '-y', '-i', str(src),
                '-filter_complex', filt,
                '-f', 'wav', '-ac', '1', '-ar', str(RATE), '-c:a', 'pcm_s16le', str(partial),
            ],
            capture_output=True, text=True,
        )
    except OSError as exc:
        partial.unlink(missing_ok=True)
        raise MusicError(f'could not run {ffmpeg} to resample {src}: {exc}') from exc
    if proc.returncode != 0 or not partial.is_file():
        detail = (proc.stderr or proc.stdout or 'ffmpeg produced no file').strip()
        partial.unlink(missing_ok=True)
        raise MusicError(f'ffmpeg could not resample {src} to 22.05 kHz: {detail}')
    if not is_xbox_wav(partial):
        got = describe_wav(partial)
        partial.unlink(missing_ok=True)
        raise MusicError(
            f'resample of {src} was {got}; expected 16-bit mono {RATE} Hz, {SAMPLES} samples'
        )
    partial.replace(dst)


def resolve_weather(music_dir, key, ffmpeg):
    """Return the 22.05 kHz wav for one layer, generating it if needed."""
    name = f'weather_{key}_layer.wav'
    xbox = Path(music_dir) / 'xbox22k' / name
    master = Path(music_dir) / name
    if xbox.is_file():
        if is_xbox_wav(xbox):
            return xbox
        raise MusicError(
            f'{xbox} is {describe_wav(xbox)}; expected 16-bit mono {RATE} Hz, '
            f'{SAMPLES} samples. Refusing to pack it. Remove that file to resample {master}.'
        )
    if not master.is_file():
        raise MusicError(
            f'missing {name}: looked for {xbox} and for {master} to resample to 22.05 kHz'
        )
    if is_xbox_wav(master):
        xbox.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(master, xbox)
        return xbox
    try:
        resample_loop(master, xbox, ffmpeg)
    except MusicError:
        xbox.unlink(missing_ok=True)
        raise
    return xbox


def stage_music(music_dir, layout_out, ffmpeg='ffmpeg'):
    """Copy the loader's music set into layout_out. Raise MusicError if any file is missing."""
    music_dir = Path(music_dir)
    layout_out = Path(layout_out)
    problems = []
    loops = []
    for name in LOOPS:
        path = music_dir / name
        if not path.is_file():
            problems.append(f'missing {path}')
        elif not is_mp3(path):
            problems.append(
                f'{path} is not an MP3. EdgeHTML cannot play Ogg; do not substitute an .ogg file.'
            )
        else:
            loops.append(path)
    weather = []
    for key in LAYERS:
        try:
            weather.append(resolve_weather(music_dir, key, ffmpeg))
        except MusicError as exc:
            problems.append(str(exc))
    if problems:
        raise MusicError(
            'missing music the EdgeHTML package loads:\n'
            + '\n'.join('  ' + item for item in problems)
            + '\nThe game reads these from audio/music/out/ (src/main.mjs loadLoops / '
            'loadWeatherLayers), not from xbox22k/. Put 22.05 kHz weather WAVs in '
            'audio/music/out/xbox22k/, or full 128 s masters at '
            'audio/music/out/weather_<rain|fog|cloudy>_layer.wav to resample.'
        )
    layout_out.mkdir(parents=True, exist_ok=True)
    for src in loops:
        shutil.copy2(src, layout_out / src.name)
    for src in weather:
        shutil.copy2(src, layout_out / src.name)
    return [layout_out / name for name in LOOPS] + [layout_out / src.name for src in weather]


def main(argv):
    if len(argv) != 2:
        print(
            'usage: stage_music.py <music-dir> <layout-audio-music-out>',
            file=sys.stderr,
        )
        return 2
    try:
        staged = stage_music(argv[0], argv[1])
    except MusicError as exc:
        print(exc, file=sys.stderr)
        return 1
    print(f'staged {len(staged)} music files into {argv[1]}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
