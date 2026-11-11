// Teclado y ratón de la partida rápida (versión pública, 10-nov): esta pantalla también es el mando de su jugador. Abre su propia conexión de jugador
// (como un móvil: mismos eventos) con las iniciales y un token; WASD o flechas mueven, el ratón apunta (el rayo sigue al cursor), clic izquierdo
// dispara (mantenido, repite), ESPACIO es el impulso y ENTER pulsa LISTO.
// Si el jugador escanea el QR de su pantalla, el móvil entra con el MISMO token y se queda con la plaza: el servidor corta esta conexión y aquí se
// pasa a modo "móvil" (el teclado deja de mandar). reclaim() la recupera.
// Qué NO hace: no dibuja nada ni decide nada del juego (todo lo decide el servidor).
import { Raycaster, Plane, Vector3, Vector2 } from 'three';
import { EVENTS } from '../../shared/events.js';
import { createPadLink } from '../play/padLink.js';
import { createPadInput } from './padInput.js';

const REFIRE_MS = 220;
const LEAVE_HOLD_MS = 1500; // en la sala de espera, mantener SELECT este rato = salir (sin ventana; como SALIR en el móvil) // clic mantenido: vuelve a pedir disparo (la cadencia real la pone el servidor)
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };

// connect() abre el socket de jugador; getTank(slot) = { x, y } dibujado ahora; camera = la de la escena; isPlaying() = la partida corre.
// pointerLock (versión arcade): en la partida el ratón queda capturado y se dibuja la mira (crosshair) donde apuntas; así no se escapa a otra pantalla
// ni fuera de una ventana pequeña. ESC (o cambiar de ventana) lo suelta y abre la pausa; un clic lo vuelve a capturar.
export function createKeyboardPlayer({ connect, initials: startName, token, screen, camera, getTank, isPlaying, onChange = () => {}, onName = () => {}, onSource = () => {}, pauseMenu = null, onQuit = () => {}, padSetup = null, blocked = () => false, onLobbyPad = () => {}, pointerLock = false, crosshair = null }) {
  const socket = connect();
  let slot = null;
  let initials = startName; // el nombre confirmado por el servidor (cambia con EDITAR)
  let mode = 'connecting'; // 'keyboard' | 'phone' (el móvil se quedó la plaza) | 'connecting'
  const held = new Set();
  let aim = null;          // ángulo actual del ratón respecto al tanque (radianes, eje Y del juego hacia arriba)
  let mouse = null;        // posición del ratón en coordenadas normalizadas (-1..1)
  let firing = false;
  let shotQueued = false;  // un clic más corto que un fotograma (toque de trackpad) también dispara: queda en cola hasta el siguiente fotograma
  let fireAt = 0;
  let lastPing = 0;
  // Con qué se controla ahora: 'keyboard' (teclado y ratón) o 'pad' (un mando conectado a este PC). Cambia solo con lo último que se toque.
  let source = 'keyboard';
  const padInput = createPadInput({ isBusy: (index) => padSetup?.busy(index) ?? false });
  const padPrev = { fire: false, dash: false, moving: false };
  let padFireAt = 0;
  let selectSince = null; // desde cuándo se mantiene SELECT en la sala de espera
  let leaving = false;
  const raycaster = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const ndc = new Vector2();

  const link = createPadLink({
    send: (pad) => socket.volatile.emit(EVENTS.PAD, pad),
    sendNow: (pad) => socket.emit(EVENTS.PAD, pad),
    fire: (angle) => (angle === null ? socket.emit(EVENTS.FIRE) : socket.emit(EVENTS.FIRE, angle)),
    getPing: () => lastPing,
  });
  const set = (next) => { if (mode !== next) { mode = next; onChange(mode); } };
  function useSource(next) {
    if (source === next) return;
    source = next;
    held.clear(); firing = false; shotQueued = false; padPrev.moving = false;
    if (active()) link.releaseMove(); // al cambiar, el tanque se para: nada se queda pulsado del control anterior
    onSource(source);
  }
  const join = () => socket.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, keyboard: true, screen, token }); // initials: el nombre de ahora

  socket.on('connect', () => { rejected = 0; join(); });
  // Servidor reiniciado (despliegue): si esta conexión llega antes que la de la pantalla, la sala aún no está restaurada y el servidor la rechaza
  // ("Invalid namespace"). Socket.io no reintenta solo tras un rechazo: se reintenta aquí unos segundos (la pantalla la restaura enseguida; si la
  // sala ya no existe, la pantalla vuelve al título por su cuenta). Sin esto, el jugador se quedaba en la sala sin plaza.
  let rejected = 0;
  socket.on('connect_error', (err) => {
    if (/^(Invalid namespace|room_restored)$/.test(err?.message) && rejected++ < 20) setTimeout(() => { if (!socket.connected) socket.connect(); }, 500);
  });
  socket.on(EVENTS.SLOT_ASSIGNED, (data) => {
    slot = data.slot;
    if (data.initials) { initials = data.initials; onName(initials); } // el nombre que el servidor ha aceptado (al entrar o tras EDITAR): se guarda
    set('keyboard');
  });
  socket.on('disconnect', (reason) => {
    // El servidor la cerró: o el móvil se ha quedado con la plaza (relevo) o un reinicio. En cualquier caso, el teclado deja de jugar.
    if (reason === 'io server disconnect') { link.releaseMove(); set('phone'); }
  });
  socket.on(EVENTS.ERROR_MSG, (err) => onChange(mode, err));
  socket.on(EVENTS.PAUSE_STATE, (state) => { if (state?.denied) pauseMenu?.serverState(state); }); // "no puedes pausar": solo llega a quien lo pidió
  setInterval(() => {
    if (!socket.connected) return;
    const sentAt = performance.now();
    socket.emit(EVENTS.LATENCY_PING, null, () => { lastPing = Math.round(performance.now() - sentAt); socket.volatile.emit(EVENTS.PING_REPORT, { ms: lastPing }); });
  }, 2000);

  const active = () => mode === 'keyboard' && slot !== null;
  const typingNow = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName); // escribiendo el nombre: el mando no roba nada
  // Mando: START = LISTO en la espera; en partida, stick izquierdo mueve, derecho apunta, R1/RB dispara (mantenido repite), L1/LB impulso.
  // Pausa (ESC o START en partida): el menú de pauseMenu.js; mientras está abierto, el teclado y el mando solo manejan el menú.
  const menuOpen = () => Boolean(pauseMenu?.open);
  function openPause() {
    if (!pauseMenu || !isPlaying() || slot === null) return;
    held.clear(); firing = false; shotQueued = false; padPrev.moving = false; link.releaseMove();
    pauseMenu.show({ slot, socket, onQuit });
  }
  function updatePad(pad, now) {
    if (!pad) return;
    if (menuOpen()) {
      for (const action of ['up', 'down', 'ok', 'back']) if (pad.nav[action]) pauseMenu.input(action);
      if (pad.start) pauseMenu.input('back');
      if (pad.select) pauseMenu.input('select'); // SELECT otra vez = salir
      return;
    }
    // Sala de espera: MANTENER SELECT = salir directamente (sin ventana). Se indica en los controles del mando.
    if (!isPlaying()) {
      if (pad.selectHeld) {
        selectSince ??= now;
        if (now - selectSince >= LEAVE_HOLD_MS && !leaving) { leaving = true; socket.emit(EVENTS.PLAYER_QUIT); onQuit(); return; }
      } else selectSince = null;
    }
    if (pad.select && pauseMenu && slot !== null && isPlaying()) { // en partida: SELECT = salir, con confirmación
      held.clear(); firing = false; shotQueued = false; padPrev.moving = false; link.releaseMove();
      pauseMenu.show({ slot, socket, onQuit, leave: true, lobby: !isPlaying() });
      return;
    }
    if (pad.start && isPlaying()) { openPause(); return; }
    if (pad.start && !isPlaying()) socket.emit(EVENTS.PLAYER_READY);
    // En la sala de espera, la cruceta elige mapa (←→) y dificultad (↑↓) si esta pantalla puede elegir (publicHost.step).
    if (!isPlaying()) { for (const dir of ['left', 'right', 'up', 'down']) if (pad.nav[dir]) onLobbyPad(dir); return; }
    const [x, y] = pad.move;
    if (x || y) { link.setMove(x, y); padPrev.moving = true; } else if (padPrev.moving) { link.releaseMove(); padPrev.moving = false; }
    if (pad.aim !== null && (aim === null || Math.abs(Math.atan2(Math.sin(pad.aim - aim), Math.cos(pad.aim - aim))) > 0.01)) { aim = pad.aim; link.setAim(aim); }
    if (pad.fire && (!padPrev.fire || now - padFireAt >= REFIRE_MS)) { padFireAt = now; link.fire(aim); }
    if (pad.dash && !padPrev.dash) socket.emit(EVENTS.DASH);
    padPrev.fire = pad.fire; padPrev.dash = pad.dash;
  }
  const typing = (event) => /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName);
  function sendMove() {
    const x = (KEYS.right.some((k) => held.has(k)) ? 1 : 0) - (KEYS.left.some((k) => held.has(k)) ? 1 : 0);
    const y = (KEYS.up.some((k) => held.has(k)) ? 1 : 0) - (KEYS.down.some((k) => held.has(k)) ? 1 : 0);
    if (x === 0 && y === 0) { link.releaseMove(); return; }
    const len = Math.hypot(x, y); // en diagonal, la misma velocidad que en recto
    link.setMove(x / len, y / len);
  }
  // --- Ratón capturado (pointer lock) ---
  let locked = false;
  let releasing = false;  // lo soltamos nosotros (fin de partida, menú): no es motivo para abrir la pausa
  let lockLostAt = -1e9;
  let cursor = [innerWidth / 2, innerHeight / 2]; // dónde está la mira (píxeles de la ventana)
  const wantLock = () => pointerLock && active() && isPlaying() && source === 'keyboard' && !menuOpen();
  function requestLock() {
    if (!wantLock() || document.pointerLockElement) return;
    try { document.body.requestPointerLock()?.catch?.(() => {}); } catch { /* el navegador no deja (p. ej. justo tras soltarlo con ESC): al siguiente clic */ }
  }
  function releaseLock() { if (document.pointerLockElement) { releasing = true; document.exitPointerLock(); } }
  const placeCrosshair = () => { if (crosshair) crosshair.style.transform = `translate(${cursor[0]}px, ${cursor[1]}px)`; };
  if (pointerLock) {
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === document.body;
      if (crosshair) crosshair.hidden = !locked;
      if (locked) { placeCrosshair(); return; }
      // Lo soltó el jugador (ESC) o el navegador (cambio de ventana): pausa, como en cualquier juego de PC.
      if (!releasing && active() && isPlaying() && source === 'keyboard' && !menuOpen()) { lockLostAt = performance.now(); openPause(); }
      releasing = false;
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!active() || typing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape' && performance.now() - lockLostAt < 600) { event.preventDefault(); return; } // ese ESC ya soltó el ratón y abrió la pausa
    if (menuOpen()) { // con el menú de pausa abierto, las teclas son del menú
      const action = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Enter: 'ok', Space: 'ok', Escape: 'back' }[event.code];
      if (action && !event.repeat) { event.preventDefault(); pauseMenu.input(action); }
      return;
    }
    if (event.code === 'Escape' && isPlaying() && !event.repeat) { event.preventDefault(); openPause(); return; }
    // El control (teclado o mando) se elige en la sala de espera y queda fijo toda la partida: en partida, si juega con mando, el teclado no hace nada.
    if (isPlaying() && source !== 'keyboard') return;
    if (!event.repeat && !isPlaying()) useSource('keyboard'); // una tecla que se queda pulsada (repetición) no le quita el control al mando
    if (event.code === 'Enter' && !event.repeat) { socket.emit(EVENTS.PLAYER_READY); return; }
    if (!isPlaying()) { // sala de espera: las flechas eligen mapa (←→) y dificultad (↑↓), igual que la cruceta del mando
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.code];
      if (dir) { event.preventDefault(); onLobbyPad(dir); }
      return;
    }
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) socket.emit(EVENTS.DASH); return; }
    if (Object.values(KEYS).flat().includes(event.code)) { event.preventDefault(); held.add(event.code); sendMove(); }
  });
  window.addEventListener('keyup', (event) => { if (held.delete(event.code)) sendMove(); });
  window.addEventListener('blur', () => { held.clear(); firing = false; shotQueued = false; if (active()) link.releaseMove(); }); // al cambiar de ventana no se queda andando
  window.addEventListener('pointermove', (event) => {
    // Capturado: la mira se mueve con el desplazamiento del ratón y nunca sale de la ventana. Libre: donde esté el cursor.
    if (locked) {
      cursor = [Math.min(innerWidth - 1, Math.max(0, cursor[0] + event.movementX)), Math.min(innerHeight - 1, Math.max(0, cursor[1] + event.movementY))];
      placeCrosshair();
    } else cursor = [event.clientX, event.clientY];
    mouse = [(cursor[0] / innerWidth) * 2 - 1, -(cursor[1] / innerHeight) * 2 + 1]; // el ratón NO cambia entre teclado y mando (solo las teclas)
  });
  window.addEventListener('pointerdown', (event) => {
    if (!active() || !isPlaying() || source !== 'keyboard' || event.button !== 0 || event.target.closest?.('button, a, input, #dev-menu, #leave, #pause')) return;
    requestLock(); // el primer clic de la partida captura el ratón (y dispara)
    firing = true;
    shotQueued = true;
    fireAt = 0; // dispara ya en el próximo fotograma
  });
  window.addEventListener('pointerup', (event) => { if (event.button === 0) firing = false; });

  return {
    get mode() { return mode; },
    get slot() { return slot; },
    // Ángulo de apuntado local (para dibujar el rayo al instante, sin esperar al servidor), o null.
    get aim() { return active() && isPlaying() ? aim : null; },
    get source() { return source; },
    get padConnected() { return padInput.connected; },
    // Cada fotograma: el ángulo del ratón respecto al tanque, el envío del apuntado y el disparo mantenido.
    update(now) {
      if (locked && !wantLock()) releaseLock(); // fin de partida, menú de pausa o mando: el ratón vuelve a ser libre
      if (!active()) return;
      const pad = padInput.read(now);
      if (blocked()) return; // p. ej. el "¿CÓMO TE LLAMAS?" abierto: el mando está escribiendo el nombre
      // Cambiar de teclado a mando (y al revés) solo en la sala de espera: en partida, el control queda fijo hasta que acabe.
      if (pad?.touched && !typingNow() && !menuOpen() && !isPlaying()) useSource('pad');
      if (menuOpen()) { if (source === 'pad' || !isPlaying()) updatePad(pad, now); return; } // en partida, el menú solo con el control que juega (y ESC)
      if (source === 'pad') { updatePad(pad, now); return; }
      const tank = isPlaying() ? getTank(slot) : null;
      if (tank && mouse) {
        ndc.set(mouse[0], mouse[1]);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(ground, hit)) {
          const angle = Math.atan2(-hit.z - tank.y, hit.x - tank.x); // mundo: x = x, z = -y
          if (aim === null || Math.abs(Math.atan2(Math.sin(angle - aim), Math.cos(angle - aim))) > 0.01) { aim = angle; link.setAim(angle); }
        }
      }
      if ((firing || shotQueued) && isPlaying() && now - fireAt >= REFIRE_MS) { fireAt = now; shotQueued = false; link.fire(aim); }
    },
    get initials() { return initials; },
    // El botón SALIR (ESC) de la partida (arcade) abre el mismo menú que la tecla ESC.
    openMenu() { openPause(); },
    ready() { if (active()) socket.emit(EVENTS.PLAYER_READY); },
    // EDITAR en tu ficha: el servidor lo valida y responde con slot_assigned (y el lobby, con el nombre nuevo para todos).
    rename(name) { if (slot !== null && socket.connected) socket.emit(EVENTS.PLAYER_RENAME, { initials: name }); },
    // El nombre que eligió al entrar (nameGate.js): si ya tiene plaza, se cambia; si aún no, entra con él.
    // Si aún no tiene plaza (p. ej. el nombre guardado no valía y el servidor no le dejó entrar), vuelve a intentarlo con el nuevo.
    setName(name) {
      if (slot !== null && socket.connected) { if (name !== initials) socket.emit(EVENTS.PLAYER_RENAME, { initials: name }); else onName(name); return; }
      initials = name;
      if (socket.connected) join();
    },
    // Para la reconexión con el nombre de ahora (no el de cuando se abrió la página).
    get socket() { return socket; },
    // El móvil soltó la plaza (o se quiere volver al teclado): se reconecta con el mismo token y la recupera.
    // Con la partida en marcha no: el mando que se elige para una partida (el móvil) se queda hasta que acabe.
    reclaim() { if (mode === 'phone' && !isPlaying()) { set('connecting'); socket.connect(); } },
  };
}
