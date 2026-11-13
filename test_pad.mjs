// node test_pad.mjs -> fakes an Xbox pad via navigator.getGamepads and checks the mapping through the real input path
import puppeteer from '/workspace/crave-lab/tools/cdp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import path from 'path'; import fs from 'fs';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
// GAME=/path/to/www-legacy/index.html runs the same checks against the legacy r162 Xbox bundle (round 6, the single-file music embed, is skipped there)
const GAME = process.env.GAME ? path.resolve(process.env.GAME) : path.resolve('out/PlaneGame_play.html'), LEGACY = !!process.env.GAME;
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.evaluateOnNewDocument(fs.readFileSync('test_audio_mock.js', 'utf8'));
  await page.goto('file://' + GAME + '?manual=1&w=320&h=180'); await page.waitForFunction(() => window.pg && window.pg.ready);
  const r = await page.evaluate(() => {
    const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [pad]; const ev = new Event('gamepadconnected'); ev.gamepad = pad; dispatchEvent(ev);
    const toastTxt = document.getElementById('toast').textContent;
    const tap = (i) => { pad.buttons[i] = { pressed: true, value: 1 }; pg.frame(); pad.buttons[i] = { pressed: false, value: 0 }; pg.frame(); };
    const out = { connectToast: toastTxt };
    pg.respawn(0, 'plane'); pg.set({ grounded: false, agl: 200, speed: 45 });
    tap(3); out.Y_chill_on = pg.G.chill;
    pad.axes = [0.1, 0.1, 0, 0]; pg.frame(); out.deadzone_keeps_chill = pg.G.chill;
    pad.axes = [0, -0.6, 0, 0]; pg.frame(); out.leftstick_exits_chill = !pg.G.chill; pad.axes = [0, 0, 0, 0];
    tap(3); pad.axes = [0, 0, 0.9, 0]; pg.frame(); out.rightstick_looks_in_chill = pg.G.chill && pg.G.look.x > 0; pad.axes = [0, 0, 0, 0];
    pad.buttons[7] = { pressed: true, value: 1 }; pg.frame(); out.RT_exits_chill = !pg.G.chill; const t0 = pg.G.plane.throttle; for (let k = 0; k < 30; k++) pg.frame(); out.RT_throttle_up = pg.G.plane.throttle > t0; pad.buttons[7] = { pressed: false, value: 0 };
    tap(2); out.X_switch_to_blimp = pg.G.vehicle === 'blimp'; const cyc = []; for (let k = 0; k < 5; k++) { tap(2); cyc.push(pg.G.vehicle); } out.X_switch_back = cyc.join() === 'glider,seaplane,roadster,scooter,plane'; // X cycles plane > blimp > glider > seaplane > roadster > scooter > plane
    tap(8); out.View_panel_open = pg.G.panel; tap(8); out.View_panel_closed = !pg.G.panel;
    tap(9); out.Menu_pause = pg.G.paused; const tp = pg.G.t; pg.frame(0.1); out.paused_sim_frozen = pg.G.t === tp; tap(9); out.Menu_resume = !pg.G.paused;
    pg.set({ x: pg.G.plane.pos.x + 900 }); tap(0); out.A_respawn_grounded = pg.G.plane.grounded && pg.G.plane.v === 0;
    // round 2: B starts a mission on the pad; pause menu driven by D-pad / A / B
    pg.resetProgress(); pg.respawn(0, 'plane'); pg.frame(); out.prompt_shown = document.getElementById('prompt').classList.contains('show') && document.getElementById('prompt').textContent.includes('Ring Run');
    tap(1); pg.frame(); out.B_starts_ring_run = pg.G.mission && pg.G.mission.def.id === 'rings' && document.getElementById('obj').textContent.includes('Ring 1/8');
    tap(9); out.menu_open = pg.G.paused && pg.menuItems().some((x) => x.includes('Abandon mission'));
    const sel = () => document.querySelector('#menulist .sel div').textContent;
    tap(13); out.dpad_down_to_abandon = sel().startsWith('✖ Abandon'); tap(0); out.A_abandons = !pg.G.mission && !pg.G.paused && pg.info().lastResult.reason === 'Abandoned';
    pg.progress.coins = 200; tap(9); let g = 0; while (!sel().includes('Battery pack') && g++ < 30) tap(13); tap(0); out.A_buys_battery_pack = pg.progress.upgrades.battery && pg.progress.coins === 50 && pg.G.paused;
    g = 0; while (!sel().startsWith('Reset progress') && g++ < 30) tap(12); tap(0); out.reset_asks_confirm = pg.menuItems().includes('RESET ALL PROGRESS?');
    tap(1); out.B_backs_out_keeps_progress = !pg.menuItems().includes('RESET ALL PROGRESS?') && pg.progress.upgrades.battery; tap(1); out.B_closes_menu = !pg.G.paused;
    const saved = JSON.parse(localStorage.getItem('skycharge.save.v1') || '{}'); out.autosaved_upgrade = saved.upgrades && saved.upgrades.battery === true;
    // audio (mocked AudioContext): created by the first controller button press, per-frame setters + cues never throw
    out.audio_created_on_first_button = !!pg.audio && window.__audio.ctx === 1 && (window.__audio.calls.resume || 0) >= 1;
    try { const a0 = window.__audio.created;
      for (let k = 0; k < 120; k++) pg.frame(); const steady = window.__audio.created - a0; // idle frames should create (almost) no nodes
      tap(3); for (let k = 0; k < 30; k++) pg.frame(); tap(3); tap(2); for (let k = 0; k < 30; k++) pg.frame(); tap(2);
      pg.respawn(0, 'plane'); pg.set({ battery: 60 }); for (let k = 0; k < 40; k++) pg.frame(); // charging
      const c = pg.coins.list.find((x) => x.kind === 'route' && !x.collected); pg.set({ grounded: false, x: c.x, y: c.y, z: c.z + 3, heading: 0, speed: 40 }); const nb = window.__audio.created; pg.frame(); out.coin_cue_played = c.collected && window.__audio.created > nb;
      pg.set({ battery: 15 }); pg.frame(); pg.G.plane.pos.y = pg.world.groundAt(pg.G.plane.pos.x, pg.G.plane.pos.z).h - 5; pg.set({ pitch: -0.8, speed: 60 }); pg.G.plane.pos.y += 10; for (let k = 0; k < 60 && !pg.G.plane.crashed; k++) pg.frame();
      tap(9); pg.frame(); tap(9); pg.frame();
      out.sfx_has_new_api = ['setLift', 'setVario', 'setOnWater'].every((k) => typeof pg.audio[k] === 'function');
      const seen = { lift: [], water: [] }, oL = pg.audio.setLift, oW = pg.audio.setOnWater; pg.audio.setLift = (x) => { seen.lift.push(x); oL && oL(x); }; pg.audio.setOnWater = (on) => { seen.water.push(on); oW && oW(on); }; pg.frame(); pg.audio.setLift = oL; pg.audio.setOnWater = oW;
      out.lift_and_water_called_each_frame = seen.lift.length === 1 && seen.lift[0] === 0 && seen.water.length === 1 && seen.water[0] === false; // plane/blimp: vario 0, hull not on water
      const sL = pg.audio.setLift, sW = pg.audio.setOnWater, sV = pg.audio.setVario; delete pg.audio.setLift; delete pg.audio.setOnWater; delete pg.audio.setVario; pg.audio.setLift = undefined; pg.audio.setOnWater = undefined; pg.audio.setVario = undefined;
      pg.frame(); out.works_without_new_api = true; pg.audio.setLift = sL; pg.audio.setOnWater = sW; pg.audio.setVario = sV;
      out.audio_calls_no_throw = true; out.audio_idle_nodes = steady; out.audio_state = pg.audio.state().vehicle + '/' + pg.audio.state().ctxState;
    } catch (e) { out.audio_calls_no_throw = 'THREW: ' + e.message; }
    // mute + volume in the pause menu, saved with settings
    tap(9); let gg = 0; while (!sel().startsWith('Sound:') && gg++ < 40) tap(13); tap(0); out.mute_toggle = pg.progress.settings.muted === true && pg.audio.isMuted();
    tap(13); out.volume_row = sel().startsWith('Volume:'); tap(14); tap(14); out.volume_left_x2 = Math.abs(pg.progress.settings.volume - 0.6) < 1e-9 && pg.progress.settings.muted === false;
    tap(13); out.vario_row = sel().startsWith('Vario tone: On'); let vcalls = []; const ov = pg.audio.setVario; pg.audio.setVario = (on) => { vcalls.push(on); ov && ov(on); }; tap(0);
    out.vario_toggle_off_saved = sel().startsWith('Vario tone: Off') && pg.progress.settings.vario === false && vcalls.includes(false) && JSON.parse(localStorage.getItem('skycharge.save.v1')).settings.vario === false; tap(0); pg.audio.setVario = ov;
    tap(9); const sv = JSON.parse(localStorage.getItem('skycharge.save.v1')).settings; out.audio_settings_saved = sv.volume === 0.6 && sv.muted === false;
    navigator.getGamepads = () => []; dispatchEvent(new Event('gamepaddisconnected')); out.disconnectToast = document.getElementById('toast').textContent;
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
} finally { await browser.close(); }
