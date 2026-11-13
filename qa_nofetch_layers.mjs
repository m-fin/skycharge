// QA: weather layers must load on the package with fetch() removed (EdgeHTML ms-appx has no fetch for package files).
import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
const URL = process.argv[2] || 'file:///tmp/qa_1082_pkg/index.html';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
const p = await browser.newPage(); const errs = []; const fetchCalls = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.exposeFunction('__qaFetch', (u) => fetchCalls.push(String(u)));
await p.evaluateOnNewDocument(() => { window.fetch = function (u) { window.__qaFetch(u && u.url || u); return Promise.reject(new TypeError('fetch disabled (QA EdgeHTML sim)')); }; });
await p.goto(URL + (URL.includes('?') ? '&' : '?') + 'manual=1&w=320&h=180&lazyaudio=1', { timeout: 240000 });
await p.waitForFunction(() => window.pg && window.pg.ready, { timeout: 240000 });
await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })));
await p.waitForFunction(() => pg.music && pg.music.weather, { timeout: 240000 });
const lay = (s) => Object.fromEntries(Object.entries(s.layers).map(([k, v]) => [k, (v.loaded ? 'D' : '-') + (v.encoded ? 'E' : '-') + (v.playing ? 'P' : '-') + ' t' + v.target.toFixed(2)]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r = {}; r.load = await p.evaluate(() => pg.music.weather); r.s0 = lay(await p.evaluate(() => pg.audio.state()));
for (const w of ['rain', 'fog', 'clear']) { await p.evaluate((w) => pg.audio.setWeather(w, 1), w); await sleep(4000); r[w] = lay(await p.evaluate(() => pg.audio.state())); }
r.fetchCalls = fetchCalls; r.errs = errs;
const okLoad = r.load.source !== 'none' && ['rain','fog','cloudy'].every((k) => r.load[k] === true) && /^D/.test(r.rain.rain);
r.verdict = okLoad && !fetchCalls.some((u) => /audio/.test(u)) && !errs.length ? 'PASS' : 'FAIL';
console.log(JSON.stringify(r, null, 1)); await browser.close();
