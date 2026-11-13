// Gamepad (standard Xbox mapping, deadzone 0.15) + keyboard fallback.
export const DEADZONE = 0.15;
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const dz = (v) => Math.abs(v) < DEADZONE ? 0 : Math.sign(v) * (Math.abs(v) - DEADZONE) / (1 - DEADZONE);
function stick(x, y) { const m = Math.hypot(x, y); if (m < DEADZONE) return [0, 0]; const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m; return [x * k, y * k]; }

const CTRL_GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'KeyV', 'KeyB', 'KeyR', 'KeyP', 'KeyH']);

export function createInput({ toast, onActivate = () => {} }) {
  const keys = new Set(), queued = [], prev = [];
  addEventListener('pointerdown', () => onActivate());
  const KEYACT = { KeyC: 'chill', KeyV: 'vehicle', KeyB: 'view', KeyR: 'respawn', KeyP: 'pause', Slash: 'panel', KeyH: 'panel', Escape: 'close', Enter: 'enter', NumpadEnter: 'enter', ArrowUp: 'menuUp', ArrowDown: 'menuDown', ArrowLeft: 'menuLeft', ArrowRight: 'menuRight' };
  addEventListener('keydown', (e) => {
    onActivate();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    // Ctrl is 'descend', so Ctrl + a flight / action key is normal play: keep the browser from treating it as a shortcut
    // (Ctrl+S save, Ctrl+D bookmark, Ctrl+P print, Ctrl+R reload, Ctrl+H history, Ctrl+E search...). Chrome never lets a
    // page block Ctrl+W / Ctrl+T / Ctrl+N; Space descends too and is the safe key for that.
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && CTRL_GAME_KEYS.has(e.code)) e.preventDefault();
    if ((!e.repeat || e.code.startsWith('Arrow')) && (KEYACT[e.code] || e.key === '?')) queued.push(e.key === '?' ? 'panel' : KEYACT[e.code]);
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
  addEventListener('gamepadconnected', (e) => toast(`🎮 Controller connected: ${e.gamepad.id.split('(')[0].trim() || 'gamepad'} — press View for controls`));
  addEventListener('gamepaddisconnected', () => toast('🎮 Controller disconnected — keyboard still works'));
  const k = (c) => keys.has(c) ? 1 : 0;
  function poll() {
    const out = { pitch: 0, roll: 0, yaw: 0, up: 0, down: 0, lookX: 0, lookY: 0, flying: false, pressed: queued.splice(0), pad: false };
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (gp) {
      out.pad = true; const a = gp.axes, b = gp.buttons, val = (i) => (b[i] ? (typeof b[i] === 'object' ? b[i].value : b[i]) : 0), down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
      const [lx, ly] = stick(a[0] || 0, a[1] || 0), [rx, ry] = stick(a[2] || 0, a[3] || 0);
      out.roll += lx; out.pitch += ly; out.lookX += rx; out.lookY += ry;
      out.up += dz(val(BTN.RT)); out.down += dz(val(BTN.LT)); out.yaw += (down(BTN.RB) ? 1 : 0) - (down(BTN.LB) ? 1 : 0);
      out.flying = lx !== 0 || ly !== 0 || out.up > 0 || out.down > 0 || down(BTN.RB) || down(BTN.LB);
      const map = { [BTN.Y]: 'chill', [BTN.X]: 'vehicle', [BTN.A]: 'respawn', [BTN.MENU]: 'pause', [BTN.VIEW]: 'panel', [BTN.B]: 'b', [BTN.R3]: 'view', [BTN.UP]: 'menuUp', [BTN.DOWN]: 'menuDown', [BTN.LEFT]: 'menuLeft', [BTN.RIGHT]: 'menuRight' };
      if (b.some((x, i) => down(i))) onActivate(); // first controller button press unlocks audio
      for (const i in map) { const d = down(+i); if (d && !prev[i]) out.pressed.push(map[i]); prev[i] = d; }
    }
    const kp = k('KeyS') - k('KeyW'), kr = k('KeyD') - k('KeyA'), ky = k('KeyE') - k('KeyQ'), ku = k('ShiftLeft') | k('ShiftRight'), kd = k('ControlLeft') | k('ControlRight') | k('Space');
    out.pitch += kp; out.roll += kr; out.yaw += ky; out.up += ku; out.down += kd;
    out.lookX += k('ArrowRight') - k('ArrowLeft'); out.lookY += k('ArrowDown') - k('ArrowUp');
    if (kp || kr || ky || ku || kd) out.flying = true;
    for (const f of ['pitch', 'roll', 'yaw', 'lookX', 'lookY']) out[f] = Math.max(-1, Math.min(1, out[f]));
    out.up = Math.min(1, out.up); out.down = Math.min(1, out.down);
    return out;
  }
  return { poll };
}
