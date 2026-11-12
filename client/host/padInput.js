// Mando conectado al PC: el jugador de esta pantalla puede jugar con teclado y ratón O con
// un mando, y cambia solo: en cuanto toca el mando, manda el mando; en cuanto toca el teclado o el ratón, vuelve el teclado (keyboardPlayer.js).
// Aquí solo se LEE el mando (el primero que tenga algo pulsado): sticks, gatillos y START. No envía nada al servidor.
// Por qué un umbral alto para "tocar": un stick barato con deriva no puede quitarle el control al teclado sin que nadie lo toque.
import { defaultMapping, isPressed, axisValue, turnToward } from './gamepadMap.js';
import { loadPadMapping } from './padSetup.js';

const DEADZONE = 0.18; // stick izquierdo: por debajo, quieto (como gamepads.js)
const AIM_MIN = 0.4;   // stick derecho: por debajo se queda el último ángulo
const AIM_TURN = 11;   // radianes por segundo como mucho (suaviza los sticks de 8 direcciones)
const TOUCH = 0.5;     // cuánto hay que mover un stick (desde su reposo) para que cuente como "he cogido el mando"

// isBusy(index) = ese mando se está configurando (padSetup.js): no cuenta.
export function createPadInput({ isBusy = () => false } = {}) {
  let index = null;     // mando que se está usando
  let aim = null; let aimTarget = null; let lastAt = 0;
  const prev = { start: false, select: false, up: false, down: false, left: false, right: false, a: false, b: false };
  const edge = (key, on) => { const hit = on && !prev[key]; prev[key] = on; return hit; };
  const btn = (pad, i) => Boolean(pad.buttons[i]?.pressed);
  // Reposo de cada eje de cada mando (se toma al verlo por primera vez): los gatillos analógicos de muchos mandos reposan en -1, y contarlos como
  // "tocados" pasaba el control al mando sin parar.
  const rest = new Map();
  const held = new Map();   // mando -> ¿lo están tocando ahora? (con histéresis: entra a TOUCH, sale a RELEASE)
  const still = new Map();  // mando -> desde cuándo no lo toca nadie (para recalibrar su reposo)
  const RELEASE = 0.25;
  const RECALIBRATE_MS = 1500;

  const pads = () => [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected && !isBusy(p.index));
  // ¿Lo acaban de tocar? Solo cuenta el MOMENTO de cogerlo (de nada a algo), no que siga tocado: así, si un stick no está en su reposo o la mano
  // descansa en él, el teclado puede recuperar el control al pulsar una tecla y el mando no se lo vuelve a quitar en el fotograma siguiente.
  const justTouched = (pad, now) => {
    if (!rest.has(pad.index)) rest.set(pad.index, [...pad.axes]);
    const base = rest.get(pad.index);
    const wasHeld = held.get(pad.index) ?? false;
    const limit = wasHeld ? RELEASE : TOUCH;
    const isHeld = pad.buttons.some((b) => b.pressed) || pad.axes.some((v, i) => Math.abs(v - (base[i] ?? 0)) > limit);
    held.set(pad.index, isHeld);
    // Sin tocar un rato: su posición de ahora es el reposo (corrige un reposo mal tomado al conectarlo y la deriva de los sticks baratos).
    if (isHeld) still.delete(pad.index);
    else if (!still.has(pad.index)) still.set(pad.index, now);
    else if (now - still.get(pad.index) > RECALIBRATE_MS) { rest.set(pad.index, [...pad.axes]); still.set(pad.index, now); }
    return isHeld && !wasHeld;
  };

  return {
    get connected() { return pads().length > 0; },
    // Cada fotograma: { touched (recién cogido), move:[x,y], aim (o null), fire, dash, start (recién pulsado), nav } o null si no hay mando.
    read(now) {
      const list = pads();
      if (!list.length) { index = null; rest.clear(); held.clear(); still.clear(); return null; }
      let hit = null;
      for (const p of list) if (justTouched(p, now) && !hit) hit = p; // todos se miran (para su histéresis y su reposo)
      if (hit) index = hit.index;
      const pad = list.find((p) => p.index === index) ?? list[0];
      const m = loadPadMapping(pad.id) ?? defaultMapping(pad, navigator.userAgent); // un mando configurado (padSetup.js): sus botones
      let x = axisValue(pad, m.lx);
      let y = -axisValue(pad, m.ly); // el eje Y del mando crece hacia abajo y el del juego hacia arriba
      if (Math.hypot(x, y) < DEADZONE) { x = 0; y = 0; }
      const rx = axisValue(pad, m.rx);
      const ry = -axisValue(pad, m.ry);
      if (Math.hypot(rx, ry) > AIM_MIN) aimTarget = Math.atan2(ry, rx);
      const dt = Math.min(0.1, Math.max(0, (now - lastAt) / 1000));
      lastAt = now;
      if (aimTarget !== null) aim = aim === null ? aimTarget : turnToward(aim, aimTarget, AIM_TURN * dt);
      const startEdge = edge('start', isPressed(pad, m.start));
      // Menús (pausa): cruceta o stick arriba/abajo, A acepta, B vuelve (mandos estándar: A 0, B 1, cruceta 12-13).
      const ly = axisValue(pad, m.ly);
      const lxv = axisValue(pad, m.lx);
      const nav = { up: edge('up', btn(pad, 12) || ly < -0.6), down: edge('down', btn(pad, 13) || ly > 0.6), left: edge('left', btn(pad, 14) || lxv < -0.6), right: edge('right', btn(pad, 15) || lxv > 0.6), ok: edge('a', isPressed(pad, m.a ?? { t: 'b', i: 0 })), back: edge('b', isPressed(pad, m.b ?? { t: 'b', i: 1 })) };
      const selectEdge = edge('select', isPressed(pad, m.select));
      return {
        touched: Boolean(hit),
        move: [x, y],
        aim,
        fire: isPressed(pad, m.fire) || isPressed(pad, m.fire2),
        dash: isPressed(pad, m.dash) || isPressed(pad, m.dash2),
        start: startEdge,
        select: selectEdge, // SELECT = salir (en partida, con confirmación)
        selectHeld: isPressed(pad, m.select), // en la sala de espera, MANTENER SELECT = salir sin preguntar
        nav,
      };
    },
  };
}
