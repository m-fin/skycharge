// node qa/life/build-harness.mjs -> qa/life/harness.js (three r186, like the main build) + harness_r162.js (three r162, the Xbox EdgeHTML backup's version)
import { execFileSync } from 'child_process'; import fs from 'fs'; import path from 'path';
const here = path.dirname(new URL(import.meta.url).pathname), tools = '/workspace/games/xbox-sideload/tools/node_modules';
const esbuild = await import(tools + '/esbuild/lib/main.js');
await esbuild.build({ entryPoints: [here + '/harness-entry.mjs'], bundle: true, format: 'iife', target: 'es2020', outfile: here + '/harness.js', logLevel: 'warning' });
const legacy = tools + '/three/build/three.module.js';
await esbuild.build({ entryPoints: [here + '/harness-entry.mjs'], bundle: true, format: 'iife', target: 'es2017', outfile: here + '/harness_r162.js', logLevel: 'warning',
  plugins: [{ name: 'three162', setup(b) { b.onResolve({ filter: /vendor\/three\.module\.js$/ }, () => ({ path: legacy })); } }] });
fs.writeFileSync(here + '/harness_r162.html', fs.readFileSync(here + '/harness.html', 'utf8').replace('harness.js', 'harness_r162.js'));
console.log('built harness.js + harness_r162.js');
