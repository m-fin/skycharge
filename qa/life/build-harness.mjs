// node qa/life/build-harness.mjs -> qa/life/harness.js (three r186, like the main build) + harness_r162.js (three r162, the Xbox EdgeHTML backup's version)
import { execFileSync } from 'child_process'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const here = path.dirname(new URL(import.meta.url).pathname), require = createRequire(import.meta.url);
const esbuild = await import('esbuild');
await esbuild.build({ entryPoints: [here + '/harness-entry.mjs'], bundle: true, format: 'iife', target: 'es2020', outfile: here + '/harness.js', logLevel: 'warning' });
const legacy = path.join(path.dirname(require.resolve('three-r162')), 'three.module.js'); // npm alias for three@0.162.0 (devDependencies)
await esbuild.build({ entryPoints: [here + '/harness-entry.mjs'], bundle: true, format: 'iife', target: 'es2017', outfile: here + '/harness_r162.js', logLevel: 'warning',
  plugins: [{ name: 'three162', setup(b) { b.onResolve({ filter: /vendor\/three\.module\.js$/ }, () => ({ path: legacy })); } }] });
fs.writeFileSync(here + '/harness_r162.html', fs.readFileSync(here + '/harness.html', 'utf8').replace('harness.js', 'harness_r162.js'));
console.log('built harness.js + harness_r162.js');
