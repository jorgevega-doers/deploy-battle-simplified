// Inicio con el mando del PC (versión pública, 10-nov): cruceta o stick izquierdo mueven entre los botones, A pulsa el elegido.
// Se activa al tocar el mando (antes no se marca nada) y se elige el botón más cercano en esa dirección (como en las consolas).
// Qué NO hace: no escribe el código de una sala (eso, con el teclado).

import { loadPadMapping } from '../host/padSetup.js';
import { isPressed } from '../host/gamepadMap.js';

const LEFT = 14; const RIGHT = 15; const UP = 12; const DOWN = 13; const A = 0;

// isBusy() = se está configurando un mando (padSetup.js): mientras, sus botones no navegan.
export function setupPadNav({ items, onActive = () => {}, isBusy = () => false }) {
  let current = null;
  let active = false;
  const prev = {};
  const edge = (key, on) => { const hit = on && !prev[key]; prev[key] = on; return hit; };
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const usable = () => items().filter((el) => !el.disabled && el.offsetParent !== null);

  function select(el) {
    current?.classList.remove('pad-focus');
    current = el;
    current?.classList.add('pad-focus');
    current?.focus({ preventScroll: true });
  }
  // El más cercano en la dirección (dx, dy), dando más peso a lo que se desvía del eje.
  function move(dx, dy) {
    const list = usable();
    if (!current || !list.includes(current)) { select(list[0] ?? null); return; }
    const from = center(current);
    let best = null; let bestScore = Infinity;
    for (const el of list) {
      if (el === current) continue;
      const c = center(el);
      const along = (c.x - from.x) * dx + (c.y - from.y) * dy;
      if (along <= 4) continue;
      const across = Math.abs((c.x - from.x) * dy) + Math.abs((c.y - from.y) * dx);
      if (across > along * 1.5) continue; // muy de lado: no está "en esa dirección" (abajo desde CREAR SALA PRIVADA no salta a otra columna)
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) select(best);
  }

  function frame() {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
    if (pad && !isBusy()) {
      const b = (i) => Boolean(pad.buttons[i]?.pressed);
      const x = pad.axes[0] ?? 0; const y = pad.axes[1] ?? 0;
      const dirs = { l: edge('l', b(LEFT) || x < -0.6), r: edge('r', b(RIGHT) || x > 0.6), u: edge('u', b(UP) || y < -0.6), d: edge('d', b(DOWN) || y > 0.6) };
      const ok = edge('a', isPressed(pad, loadPadMapping(pad.id)?.a ?? { t: 'b', i: A })); // en un mando configurado, su A
      if (!active && (dirs.l || dirs.r || dirs.u || dirs.d || ok)) {
        active = true;
        document.body.classList.add('pad-nav');
        onActive();
        select(usable()[0] ?? null);
      } else if (active) {
        if (dirs.l) move(-1, 0); else if (dirs.r) move(1, 0); else if (dirs.u) move(0, -1); else if (dirs.d) move(0, 1);
        if (ok && current) current.click();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Con el ratón, el marco del mando se quita (vuelve en cuanto se toque el mando).
  addEventListener('pointermove', () => { if (!active) return; active = false; document.body.classList.remove('pad-nav'); current?.classList.remove('pad-focus'); });
}
