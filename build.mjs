// node build.mjs -> out/PlaneGame_play.html (single file, inline bundle, runs from file://)
// Music: the two 128 s loops are embedded as base64 MP3 (decodes in every browser; ~1.19x the OGG size) in a small
// <script> that sets window.__SKYCHARGE_MUSIC before the game bundle. The MP3s are encoded from Sonic Rift's 24-bit WAV
// masters (mono 44.1 kHz, CBR 96 kbps, LAME gapless header) next to the OGGs in audio/music/out/ when missing or older
// than the WAVs. If ffmpeg or the MP3s aren't available, the OGGs are embedded instead. NO_MUSIC=1 skips embedding.
import { execFileSync } from 'child_process'; import fs from 'fs';
const ESBUILD = [process.env.ESBUILD, 'node_modules/.bin/esbuild', '/workspace/games/xbox-sideload/tools/node_modules/esbuild/bin/esbuild'].find((p) => p && fs.existsSync(p));
if (!ESBUILD) throw new Error('esbuild not found: run npm install, or set ESBUILD=/path/to/esbuild');
fs.mkdirSync('out', { recursive: true });
execFileSync(ESBUILD, ['src/main.mjs', '--bundle', '--format=iife', '--minify', '--target=es2020', '--legal-comments=none', '--outfile=out/.bundle.js'], { stdio: 'inherit' });
const js = fs.readFileSync('out/.bundle.js', 'utf8').replace(/<\/script/gi, '<\\/script'); fs.unlinkSync('out/.bundle.js');
const html = fs.readFileSync('index.html', 'utf8'), tag = '<script type="module" src="src/main.mjs"></script>';
if (!html.includes(tag)) throw new Error('script tag not found in index.html');

const MUS = 'audio/music/out/', LOOPS = { cabin: 'cabin_chill_loop', flight: 'flight_theme_loop' }, mtime = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);
function mp3For(name) {
  const mp3 = MUS + name + '.mp3', wav = MUS + 'wav/' + name + '.wav';
  if (mtime(mp3) && mtime(mp3) >= mtime(wav)) return mp3;
  if (!mtime(wav)) return null;
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '1', '-metadata', 'comment=SKYCHARGE build encode of the WAV master (Sonic Rift)', mp3]); console.log('encoded', mp3); return mp3; }
  catch (e) { console.warn('ffmpeg MP3 encode failed for', name, '-', e.message.split('\n')[0]); return null; }
}
let music = null, musicInfo = 'no music embedded';
if (process.env.NO_MUSIC !== '1') {
  const pick = {}; for (const [k, n] of Object.entries(LOOPS)) { const mp3 = mp3For(n), ogg = MUS + n + '.ogg'; pick[k] = mp3 ? { file: mp3, type: 'audio/mpeg' } : mtime(ogg) ? { file: ogg, type: 'audio/ogg' } : null; }
  if (pick.cabin || pick.flight) {
    music = {}; const parts = [];
    for (const [k, p] of Object.entries(pick)) if (p) { const buf = fs.readFileSync(p.file); music[k] = { type: p.type, b64: buf.toString('base64'), bytes: buf.length, file: p.file.split('/').pop() }; parts.push(`${k}: ${music[k].file} ${(buf.length / 1048576).toFixed(2)} MB`); }
    musicInfo = 'embedded ' + parts.join(', ');
  }
  // weather layers (1.0.8, Sonic Rift lead): audio/music/out/weather_<k>_layer.wav -> 96 kbps gapless MP3 build cache in build96k/
  // (the delivered files are never touched). Missing layers are skipped; the game picks up whatever is there. NO_WX_MUSIC=1 skips.
  if (music && process.env.NO_WX_MUSIC !== '1') for (const k of ['rain', 'fog', 'cloudy']) {
    const wav = MUS + `weather_${k}_layer.wav`, mp3 = MUS + `build96k/weather_${k}_layer.mp3`; if (!mtime(wav)) continue;
    if (!(mtime(mp3) >= mtime(wav))) { try { fs.mkdirSync(MUS + 'build96k', { recursive: true }); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '1', '-metadata', 'comment=SKYCHARGE build encode of the Sonic Rift weather layer', mp3]); console.log('encoded', mp3); } catch (e) { console.warn('weather layer encode failed', k); continue; } }
    const buf = fs.readFileSync(mp3); music[k] = { type: 'audio/mpeg', b64: buf.toString('base64'), bytes: buf.length, file: `build96k/weather_${k}_layer.mp3` }; musicInfo += `, ${k} layer ${(buf.length / 1048576).toFixed(2)} MB`;
  }
}
const musicTag = music ? `<script>window.__SKYCHARGE_MUSIC=${JSON.stringify(music)};</script>\n` : '';
fs.writeFileSync('out/PlaneGame_play.html', html.replace(tag, () => `${musicTag}<script>${js}</script>`));
const size = fs.statSync('out/PlaneGame_play.html').size;
console.log('wrote out/PlaneGame_play.html', (size / 1048576).toFixed(2) + ' MB', '·', musicInfo, '· esbuild', ESBUILD);
if (size > 6 * 1048576) console.warn('WARNING: the single file is over 6 MB');
