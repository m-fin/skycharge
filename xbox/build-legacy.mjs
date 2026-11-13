// node build-legacy.mjs -> xbox/build/www-legacy/{index.html,boot.js,shim.js,game.js}
// three 0.162 (WebGL1-capable), ES2017, every script in its own file.
// UWP local-context pages on Xbox did not run the big inline script in 1.0.0.0.
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'build', 'game-src');
const out = path.join(here, 'build', 'www-legacy');
const legacyThree = path.join(here, 'node_modules', 'three', 'build', 'three.module.js');
if (!fs.existsSync(legacyThree)) throw new Error('three r162 not installed. From xbox/: npm install');
if (!fs.existsSync(path.join(src, 'src', 'main.mjs'))) throw new Error('game copy missing. Run sync-game-src.py first');

const plugins = [{
  name: 'three162',
  setup(build) {
    build.onResolve({ filter: /vendor\/three\.module\.js$/ }, () => ({ path: legacyThree }));
  },
}];

const result = await esbuild.build({
  entryPoints: [path.join(src, 'src/main.mjs')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2017',
  legalComments: 'none',
  write: false,
  plugins,
  logLevel: 'warning',
  banner: { js: 'try{window.__boot&&__boot("game.js parsed");' },
  footer: { js: '}catch(e){window.__bootErr?__bootErr(e):alert(e)}' },
});

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'game.js'), result.outputFiles[0].text);
// Top-level xbox-shim.js / xbox-boot.js are authoritative (not compat/shared).
fs.copyFileSync(path.join(here, 'xbox-shim.js'), path.join(out, 'shim.js'));
fs.copyFileSync(path.join(here, 'xbox-boot.js'), path.join(out, 'boot.js'));

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const tag = '<script type="module" src="src/main.mjs"></script>';
if (!html.includes(tag)) throw new Error('script tag not found in the copied index.html');
// EdgeHTML 18 lacks `inset` and CSS place-items: add longhand fallbacks; system-ui -> Segoe UI.
const css = '<style>#panel,#pause,#flash{top:0;right:0;bottom:0;left:0}#panel.show,#pause.show{display:-ms-grid;display:grid;justify-items:center;align-items:center}#arrow{justify-items:center;align-items:center}body{font-family:"Segoe UI",system-ui,sans-serif}</style>';
html = html
  .replace(tag, () => '<script src="game.js"></script>')
  .replace('<head>', () => '<head><script src="boot.js"></script><script src="shim.js"></script>')
  .replace('</head>', () => css + '</head>')
  .replace(/system-ui/g, '"Segoe UI",system-ui');
fs.writeFileSync(path.join(out, 'index.html'), html);
const gameKb = (result.outputFiles[0].text.length / 1024).toFixed(0);
const htmlKb = (html.length / 1024).toFixed(0);
console.log(`legacy ${htmlKb} KB html, ${gameKb} KB game.js (three r162, es2017)`);
