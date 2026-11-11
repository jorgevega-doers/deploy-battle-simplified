// Mandos físicos enchufados a la pantalla del juego (sección 72; p. ej. los GAME BOX JOYSTICK por su receptor USB inalámbrico). Usa la API Gamepad
// del navegador, que funciona igual en Windows y en Linux (Chrome / Edge / Chromium). Cada mando hace de "móvil virtual": abre su propia conexión con
// el servidor y entra como MANDO1, MANDO2... (por el orden del navegador). los dos botones de unión a la vez = unirse; otra vez = LISTO (y otra, cancelar). Con los GAME BOX JOYSTICK en Windows: L2 + R2 (en mandos
// estándar, START + SELECT). Stick izquierdo = mover, stick derecho = apuntar, L1 = impulso, R1 = disparar (mantenido, sigue disparando).
// Botones y ejes: el navegador da un orden "estándar" para los mandos que conoce; los genéricos (como estos) llegan "en bruto" y su orden cambia
// según el sistema, así que hay una configuración por defecto para mandos genéricos y otra que se aprende desde el menú (pestaña MANDOS) y se guarda.
// Qué NO hace: no toca la lógica del juego (manda los mismos eventos que un móvil).
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { connectToRoom, screenId, randomName } from '../roomSocket.js';
import { LEARN_STEPS, defaultMapping, isPressed, axisValue, detectInput, turnToward } from './gamepadMap.js';
import { loadPadMapping } from './padSetup.js';

export { LEARN_STEPS };

const MAP_KEY = 'doersforce.gamepad.map.'; // + id del mando: configuración aprendida
const DEADZONE = 0.18;      // stick izquierdo: por debajo, quieto
const AIM_MIN = 0.4;        // stick derecho: por debajo no cambia el apuntado (se queda el último)
const SEND_MS = 33;         // como mucho ~30 envíos por segundo por mando
const KEEPALIVE_MS = 400;   // con el stick movido se repite el estado (el servidor para un tanque cuyo mando se calla 4 s)
const AIM_TURN = 11;        // apuntado: radianes por segundo como mucho (45° en ~70 ms): suaviza los saltos de un stick de 8 direcciones sin que se note retardo
const LEAVE_HOLD_MS = 1500; // versión pública: en la sala de espera, mantener SELECT este rato = salir
const REFIRE_MS = 220;      // R1 mantenido: vuelve a pedir disparo (la cadencia la pone el servidor)

function loadMapping(id) {
  try { const raw = window.localStorage.getItem(MAP_KEY + id); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// startOnly (versión pública): en los mandos "standard" basta con START para unirse y para LISTO (la gente en casa no conoce la combinación del stand).
// Versión pública (startOnly): cada mando entra con un nombre de 3 letras al azar; en la sala de espera A = "¿cuál soy?" (su ficha se ilumina y el mando
// vibra) e Y = cambiar el nombre letra a letra como en las recreativas (↑↓ letra, ←→ mover, A guarda, B cancela). isLobby() = la sala está esperando.
// onChange() = algo que la pantalla de espera debe repintar (nombre, edición, destello).
// pause (versión pública): el menú de pausa (pauseMenu.js); isPlaying = hay partida en marcha (START abre la pausa de ese mando).
// isBusy(index) = ese mando se está configurando (padSetup.js): no juega.
export function createGamepads({ statusOf = () => {}, startOnly = false, isLobby = () => false, isPlaying = () => false, pause = null, isBusy = () => false, onLobbyNav = () => {}, onChange = () => {} } = {}) {
  const pads = new Map(); // índice del navegador -> estado del mando virtual
  let learning = null;    // { index, step, rest, waitRelease, result, onStep, onDone }

  const stateFor = (index) => {
    if (!pads.has(index)) pads.set(index, { name: startOnly ? randomName() : `MANDO${index + 1}`, slot: null, edit: null, flashAt: -1e9, prev: {}, socket: null, joined: false, ready: false, combo: false, fire: false, dash: false, move: [0, 0], moveAt: 0, aim: null, aimTarget: null, aimStepAt: 0, aimAt: 0, fireAt: 0 });
    return pads.get(index);
  };
  // Versión pública: la configuración de padSetup.js (solo las de la versión actual: R1 disparo, L1 impulso; también las compartidas y las de
  // modelos conocidos). El stand sigue con la de su menú MANDOS.
  const mappingOf = (pad) => (startOnly ? loadPadMapping(pad.id) : loadMapping(pad.id)) ?? defaultMapping(pad, navigator.userAgent);

  function dispose(state) {
    clearInterval(state.pingTimer);
    state.socket?.removeAllListeners();
    state.socket?.disconnect();
    Object.assign(state, { socket: null, joined: false, ready: false });
    statusOf(state);
  }

  // START + SELECT: sin plaza, se une (como un móvil: misma conexión y mismos eventos); con plaza, LISTO (otra vez lo cancela).
  function join(state) {
    const socket = connectToRoom(io);
    state.socket = socket;
    socket.on('connect', () => socket.emit(EVENTS.JOIN_ROOM, { role: 'player', gamepad: true, name: state.name, screen: screenId })); // vinculado a ESTA pantalla
    socket.on(EVENTS.SLOT_ASSIGNED, (data) => { state.joined = true; state.slot = data.slot; if (data.initials) state.name = data.initials; statusOf(state); onChange(); });
    for (const ev of [EVENTS.ROOM_FULL, EVENTS.REDIRECT, EVENTS.FORCE_DISCONNECT, 'disconnect']) socket.on(ev, () => dispose(state));
    socket.on(EVENTS.ERROR_MSG, () => { if (!state.joined) dispose(state); });
    socket.on(EVENTS.PAUSE_STATE, (s) => { if (s?.denied && pause?.ownerSlot() === state.slot) pause.serverState(s); }); // "no puedes pausar": solo a quien lo pidió // con plaza, un error (p. ej. un nombre no válido) no la quita
    socket.on(EVENTS.LOBBY_STATE, (lobby) => { // LISTO según el servidor (por si se reinicia la cuenta)
      const i = state.slot ? state.slot - 1 : lobby?.initials?.indexOf?.(state.name);
      if (i >= 0 && Array.isArray(lobby.ready)) { state.ready = Boolean(lobby.ready[i]); statusOf(state); }
    });
    state.pingTimer = setInterval(() => { // el ping, como un móvil, para que el host lo enseñe
      if (!socket.connected) return;
      const sentAt = performance.now();
      socket.emit(EVENTS.LATENCY_PING, null, () => socket.volatile.emit(EVENTS.PING_REPORT, { ms: Math.round(performance.now() - sentAt) }));
    }, 2000);
    statusOf(state);
  }

  function play(state, pad, m, now) {
    // Versión pública: START solo, en cualquier mando (en los no "estándar", el START que se aprendió en padSetup.js). El stand sigue con START + SELECT.
    const simple = startOnly;
    const both = simple ? isPressed(pad, m.start) : isPressed(pad, m.start) && isPressed(pad, m.select);
    if (both && !state.combo) {
      if (!state.socket) join(state);
      else if (state.joined) state.socket.emit(EVENTS.PLAYER_READY);
    }
    state.combo = both;
    if (!state.joined) return;
    if (pause && startOnly && (isPlaying() || isLobby()) && pauseButtons(state, pad, m, both)) return; // START = pausa, SELECT = salir; con su menú abierto el mando solo maneja el menú
    if (startOnly && isLobby() && lobbyButtons(state, pad, m, now)) return; // en la espera, A / Y / edición del nombre
    const socket = state.socket;
    // Movimiento: el eje Y del mando crece hacia abajo y el del juego hacia arriba.
    let x = axisValue(pad, m.lx);
    let y = -axisValue(pad, m.ly);
    if (Math.hypot(x, y) < DEADZONE) { x = 0; y = 0; }
    const [px, py] = state.move;
    const changed = Math.abs(x - px) > 0.05 || Math.abs(y - py) > 0.05 || ((x === 0) !== (px === 0)) || ((y === 0) !== (py === 0));
    const stale = (x !== 0 || y !== 0) && now - state.moveAt > KEEPALIVE_MS;
    if ((changed || stale) && (now - state.moveAt >= SEND_MS || (x === 0 && y === 0))) {
      socket.emit(EVENTS.PAD_MOVE, { x, y });
      state.move = [x, y];
      state.moveAt = now;
    }
    // Apuntado: el stick derecho fija el ángulo OBJETIVO (suelto, se queda el último) y el apuntado real gira hacia él a velocidad limitada.
    const rx = axisValue(pad, m.rx);
    const ry = -axisValue(pad, m.ry);
    if (Math.hypot(rx, ry) > AIM_MIN) state.aimTarget = Math.atan2(ry, rx);
    if (state.aimTarget !== null) {
      const dt = Math.min(0.1, Math.max(0, (now - state.aimStepAt) / 1000));
      const next = state.aim === null ? state.aimTarget : turnToward(state.aim, state.aimTarget, AIM_TURN * dt);
      const diff = state.aim === null ? Infinity : Math.abs(Math.atan2(Math.sin(next - state.aim), Math.cos(next - state.aim)));
      if (diff > 0.02 && now - state.aimAt >= SEND_MS) { state.aim = next; socket.emit(EVENTS.PAD_AIM, { angle: next }); state.aimAt = now; state.aimStepAt = now; } else if (diff <= 0.02) state.aimStepAt = now; // el tiempo avanza solo cuando se aplica el giro; parado, no acumula (si no, el primer paso sería un salto)
    }
    // R1 dispara (mantenido, repite); L1, impulso.
    const fire = isPressed(pad, m.fire) || isPressed(pad, m.fire2);
    if (fire && (!state.fire || now - state.fireAt >= REFIRE_MS)) {
      socket.emit(EVENTS.FIRE, state.aim === null ? undefined : Math.round(state.aim * 100));
      state.fireAt = now;
    }
    state.fire = fire;
    const dash = isPressed(pad, m.dash) || isPressed(pad, m.dash2);
    if (dash && !state.dash) socket.emit(EVENTS.DASH);
    state.dash = dash;
  }

  // Pausa en partida (versión pública): START la abre (pauseMenu.js); con el menú de ESTE mando abierto, cruceta o stick eligen, A acepta y B o START vuelven.
  // Devuelve true si el mando está en el menú (no juega).
  // SELECT (en partida o en la espera) = salir, con confirmación: A acepta lo elegido o SELECT otra vez sale del todo.
  function pauseButtons(state, pad, m, start) {
    const edge = (key, on) => { const was = state.prev[key]; state.prev[key] = on; return on && !was; };
    const startEdge = edge('pStart', start);
    const selectEdge = edge('pSelect', isPressed(pad, m.select));
    const owner = { slot: state.slot, socket: state.socket, onQuit: () => dispose(state) };
    if (pause.ownerSlot() === state.slot && pause.open) {
      const ly = axisValue(pad, m.ly);
      if (edge('pUp', Boolean(pad.buttons[12]?.pressed) || ly < -0.6)) pause.input('up');
      if (edge('pDown', Boolean(pad.buttons[13]?.pressed) || ly > 0.6)) pause.input('down');
      if (edge('pA', isPressed(pad, m.a ?? { t: 'b', i: 0 }))) pause.input('ok');
      if (edge('pB', isPressed(pad, m.b ?? { t: 'b', i: 1 })) || startEdge) pause.input('back');
      if (selectEdge) pause.input('select');
      return true;
    }
    if (pause.open) return false;
    // Sala de espera: MANTENER SELECT 1,5 s = salir directamente, sin ventana (como SALIR en el móvil). Se indica en los controles del mando.
    if (!isPlaying()) {
      const now = performance.now();
      if (isPressed(pad, m.select)) {
        state.selectSince ??= now;
        if (now - state.selectSince >= LEAVE_HOLD_MS) { state.selectSince = null; state.socket.emit(EVENTS.PLAYER_QUIT); dispose(state); return true; }
      } else state.selectSince = null;
      return false;
    }
    if (selectEdge) { // en partida: SELECT = salir, con confirmación
      state.socket.emit(EVENTS.PAD_MOVE, { x: 0, y: 0 }); // se para mientras está en el menú
      pause.show({ ...owner, leave: true });
      return true;
    }
    if (startEdge && isPlaying()) {
      state.socket.emit(EVENTS.PAD_MOVE, { x: 0, y: 0 });
      pause.show(owner);
      return true;
    }
    return false;
  }

  // Sala de espera (versión pública): A = "¿cuál soy?" (destello en su ficha + vibración), Y = editar el nombre como en las recreativas. Devuelve true si
  // el mando está editando (sus botones no hacen nada más). Botones "standard": A 0, B 1, Y 3, cruceta 12-15; también vale el stick izquierdo.
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function lobbyButtons(state, pad, m, now) {
    const btn = (i) => Boolean(pad.buttons[i]?.pressed);
    const edge = (key, on) => { const was = state.prev[key]; state.prev[key] = on; return on && !was; };
    const lx = axisValue(pad, m.lx);
    const ly = axisValue(pad, m.ly);
    const up = edge('up', btn(12) || ly < -0.6);
    const down = edge('down', btn(13) || ly > 0.6);
    const left = edge('left', btn(14) || lx < -0.6);
    const right = edge('right', btn(15) || lx > 0.6);
    const a = edge('a', isPressed(pad, m.a ?? { t: 'b', i: 0 })); // en los mandos configurados (padSetup.js), su A y su B
    const b = edge('b', isPressed(pad, m.b ?? { t: 'b', i: 1 }));
    const y = edge('y', btn(3));
    if (state.edit) {
      const e = state.edit;
      const shift = (d) => { e.letters[e.pos] = LETTERS[(LETTERS.indexOf(e.letters[e.pos]) + d + 26) % 26]; };
      if (up) shift(1);
      if (down) shift(-1);
      if (left) e.pos = (e.pos + 2) % 3;
      if (right) e.pos = (e.pos + 1) % 3;
      if (a) { state.socket.emit(EVENTS.PLAYER_RENAME, { initials: e.letters.join('') }); state.edit = null; }
      if (b) state.edit = null;
      if (up || down || left || right || a || b) onChange();
      return true;
    }
    // Cruceta o stick (sin estar editando el nombre): mapa ←→ y dificultad ↑↓, si esta pantalla puede elegir (publicHost.step).
    for (const [dir, on] of [['left', left], ['right', right], ['up', up], ['down', down]]) if (on) onLobbyNav(dir);
    if (y) { state.edit = { letters: [...state.name.padEnd(3, 'A').slice(0, 3)], pos: 0 }; onChange(); return true; }
    if (a) { // ¿cuál soy?: su ficha se ilumina en su color y el mando vibra (si el navegador lo permite)
      state.flashAt = now;
      pad.vibrationActuator?.playEffect?.('dual-rumble', { duration: 220, strongMagnitude: 0.7, weakMagnitude: 0.5 }).catch?.(() => {});
      onChange();
    }
    return false;
  }

  // Configuración desde el menú: cada paso espera una entrada nueva (botón pulsado o eje movido) respecto a cómo estaba al empezar el paso.
  function learnStep(pad) {
    const L = learning;
    const [action] = LEARN_STEPS[L.step];
    if (L.waitRelease) { // antes de cada paso, todo suelto y los ejes en reposo
      const idle = pad.buttons.every((b) => !b.pressed && b.value < 0.3) && pad.axes.every((v, i) => Math.abs(v - L.rest[i]) < 0.3);
      if (idle) L.waitRelease = false;
      return;
    }
    const found = detectInput(pad, action, L.rest);
    if (!found) return;
    L.result[action] = found;
    L.step++;
    L.waitRelease = true;
    if (L.step >= LEARN_STEPS.length) {
      try { window.localStorage.setItem(MAP_KEY + pad.id, JSON.stringify(L.result)); } catch { /* sin almacenamiento: vale solo hasta recargar */ }
      const done = L.onDone;
      learning = null;
      done?.(true);
      return;
    }
    L.onStep?.(LEARN_STEPS[L.step][1]);
  }

  function poll() {
    const now = performance.now();
    const list = navigator.getGamepads?.() ?? [];
    for (const pad of list) {
      if (!pad || !pad.connected) continue;
      if (learning && learning.index === pad.index) { learnStep(pad); continue; } // configurando: el mando no juega
      if (isBusy(pad.index)) continue; // versión pública: configurándose (padSetup.js)
      play(stateFor(pad.index), pad, mappingOf(pad), now);
    }
    // Un mando desconectado (pilas, receptor fuera) deja su plaza como un móvil que se cae.
    for (const [index, state] of pads) if (state.socket && !list[index]?.connected) dispose(state);
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);

  return {
    // Lista para el menú: mandos que ve el navegador (solo aparecen tras pulsar un botón: lo exige el navegador).
    list() {
      return [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected).map((pad) => {
        const state = stateFor(pad.index);
        return {
          index: pad.index, id: pad.id, name: state.name, joined: state.joined, ready: state.ready, custom: Boolean(loadMapping(pad.id)), standard: pad.mapping === 'standard',
          pressed: pad.buttons.map((b, i) => (b.pressed || b.value > 0.5 ? i : -1)).filter((i) => i >= 0),
          axes: pad.axes.map((v) => Math.round(v * 100) / 100),
        };
      });
    },
    learn(index, { onStep, onDone }) {
      const pad = navigator.getGamepads?.()[index];
      if (!pad) { onDone?.(false); return; }
      const state = stateFor(index);
      if (state.socket) dispose(state); // configurando no se juega
      learning = { index, step: 0, rest: [...pad.axes], waitRelease: true, result: {}, onStep, onDone };
      onStep?.(LEARN_STEPS[0][1]);
    },
    cancelLearn() { const done = learning?.onDone; learning = null; done?.(false); },
    // Mando que ocupa la plaza "slot" (versión pública): su nombre, si está editándolo (letras y posición) y cuándo pulsó A por última vez.
    bySlot(slot) {
      for (const [index, state] of pads) if (state.joined && state.slot === slot) return { index, name: state.name, edit: state.edit, flashAt: state.flashAt };
      return null;
    },
    // EDITAR desde el ordenador: cambia el nombre del mando de esa plaza.
    renameSlot(slot, name) {
      for (const state of pads.values()) if (state.joined && state.slot === slot) { state.edit = null; state.socket.emit(EVENTS.PLAYER_RENAME, { initials: name }); return true; }
      return false;
    },
    resetMapping(id) { try { window.localStorage.removeItem(MAP_KEY + id); } catch { /* da igual */ } },
    get learning() { return learning ? { index: learning.index, step: learning.step } : null; },
  };
}
