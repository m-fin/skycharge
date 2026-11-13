import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('.'); const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('PAGEERR', e.stack || e.message)); p.on('console', (m) => console.log('LOG', m.text()));
await p.evaluateOnNewDocument(fs.readFileSync('test_audio_mock.js', 'utf8'));
await p.goto(`http://localhost:${srv.address().port}/index.html?manual=1&w=320&h=180`); await p.waitForFunction(() => window.pg && window.pg.ready, { timeout: 60000 }).catch((e) => console.log('noready'));
const code = process.argv[2] || 'pg.step(10)'; try { console.log(JSON.stringify(await p.evaluate(code))); } catch (e) { console.log('ERR', e.message, e.stack); }
await b.close(); srv.close();
