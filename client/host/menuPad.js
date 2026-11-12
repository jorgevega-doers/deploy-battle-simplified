// Mando para menús: arriba / abajo (cruceta o stick izquierdo; mantenido, se repite y cada vez más rápido), A y B.
// Usa la configuración del mando si la tiene (padSetup.js: su A y su B). Lo usa, por ejemplo, el "¿CÓMO TE LLAMAS?" (letra a letra).
// read(now) -> lista de acciones de este fotograma: 'up' | 'down' | 'a' | 'b'. Qué NO hace: no decide qué hace cada acción.
import { isPressed, axisValue, defaultMapping } from './gamepadMap.js';
import { loadPadMapping } from './padSetup.js';

const FIRST_REPEAT_MS = 380; // mantenido: la primera repetición
const REPEAT_MS = 110;       // y luego cada... (al rato, más deprisa)
const FAST_REPEAT_MS = 55;
const FAST_AFTER_MS = 1500;

export function createMenuPad({ isBusy = () => false } = {}) {
  const held = { up: null, down: null }; // desde cuándo está mantenido (y cuándo repitió por última vez)
  const prev = { a: false, b: false };

  return {
    read(now) {
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected && !isBusy(p.index));
      if (!pad) return [];
      const m = loadPadMapping(pad.id) ?? defaultMapping(pad, navigator.userAgent);
      const ly = axisValue(pad, m.ly);
      const dirs = { up: Boolean(pad.buttons[12]?.pressed) || ly < -0.6, down: Boolean(pad.buttons[13]?.pressed) || ly > 0.6 };
      const out = [];
      for (const dir of ['up', 'down']) {
        if (!dirs[dir]) { held[dir] = null; continue; }
        if (!held[dir]) { held[dir] = { since: now, last: now }; out.push(dir); continue; } // al pulsar, una vez
        const h = held[dir];
        const wait = now - h.since < FIRST_REPEAT_MS ? Infinity : now - h.since > FAST_AFTER_MS ? FAST_REPEAT_MS : REPEAT_MS;
        if (now - h.since >= FIRST_REPEAT_MS && now - h.last >= Math.min(wait, REPEAT_MS)) { h.last = now; out.push(dir); }
      }
      for (const key of ['a', 'b']) {
        const on = isPressed(pad, m[key] ?? { t: 'b', i: key === 'a' ? 0 : 1 });
        if (on && !prev[key]) out.push(key);
        prev[key] = on;
      }
      return out;
    },
  };
}
