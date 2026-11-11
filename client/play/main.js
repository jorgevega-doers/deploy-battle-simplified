// Mando móvil: pide plaza con las iniciales, muestra el estado de la sesión y envía el movimiento, el apuntado y los disparos.
import '../theme.css';
import { keepPixelImagesSharp } from '../pixelFit.js';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { startLatencyProbe } from '../../shared/latency.js';
import { describePlan } from '../../shared/modeText.js';
import { createJoystick, createTapButton } from './pads.js';
import { createPadLink } from './padLink.js';
import { createPlayHud } from './hud.js';
import { setupFullscreen } from './fullscreen.js';
import { setupHideBars } from './bars.js';
import { roomCode, clientToken as ownToken, connectToRoom, linkedScreen, bindToken } from '../roomSocket.js';
// Partida rápida: el QR de la pantalla del jugador lleva su token; con él este móvil se queda SU plaza (mismas iniciales) sin rellenar nada.
const clientToken = bindToken ?? ownToken;
import { PLAY_TEXT, applyPlayTexts } from './publicTexts.js';
import { setupPhoneMenu } from './phoneMenu.js';
// Versión pública (rama public): toda sala es pública. Sin email, "SOBRE DOERS" en otra pestaña y revancha sin salir de la sala.
const publicMode = roomCode !== null;
if (publicMode) { document.body.classList.add('public'); applyPlayTexts(); }

const AIM_DEADZONE = 0.25;   // por debajo, el pad de apuntado no cambia el ángulo

const $ = (id) => document.getElementById(id);
const views = ['view-join', 'view-slot', 'view-full', 'view-offline', 'view-lost', 'view-ready', 'view-pads', 'view-over'];
const show = (id) => {
  views.forEach((v) => { $(v).hidden = v !== id; });
  document.body.classList.toggle('playing', id === 'view-pads'); // activa el aviso de "gira el móvil" en vertical
  // En vertical solo se permiten las pantallas que no son de juego: el formulario (iniciales y email), "partida llena" y la reconexión.
  document.body.classList.toggle('formview', id === 'view-join' || id === 'view-full' || id === 'view-offline' || id === 'view-lost');
};
document.body.classList.add('formview'); // la primera pantalla es el formulario

const fullscreen = setupFullscreen($('fs-btn'), $('fs-gate'), $('fs-gate-btn')); // pantalla completa, horizontal y sin zoom (sección 60)
const startHideBars = () => setupHideBars($('bars-gate'), $('bars-skip'), { enabled: !fullscreen.supported }); // iPhone: pide deslizar para que el navegador esconda sus barras (tras rellenar el formulario)
const socket = connectToRoom(io); // con ?room=CODIGO, el socket de esa sala online; sin él, el del stand
let initials = '';
let mySlot = null;
let phase = 'LOBBY';        // última fase de la sesión que ha avisado el servidor
let finaleEndsAt = 0;       // hasta cuándo dura la animación de fin de partida (el resultado espera a que acabe)
const hud = createPlayHud($); // vidas, tiempo, power-ups y animaciones de la pantalla de juego
window.__hud = hud; // solo para depurar desde la consola (y las pruebas con el MCP)

// --- Entrada: iniciales y plaza ---
// Solo letras A-Z, en mayúsculas y máximo 3. El servidor lo vuelve a validar (nunca se confía en el móvil).
// El email es obligatorio (con el consentimiento marcado), en el stand y también en las salas online. El servidor lo confirma en
// lobby_state.requireEmail, y mientras tanto se asume que sí. Se valida aquí para avisar enseguida, y el servidor lo vuelve a validar.
let needEmail = !publicMode; // la versión pública no pide email (el servidor lo confirma con lobby_state.requireEmail)
let contact = { email: '', consent: false };
const emailOk = (value) => value.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
function validateForm() {
  const ready = $('initials').value.length === 3 && (!needEmail || (emailOk($('email').value.trim()) && $('consent').checked));
  $('join-btn').disabled = !ready;
}
function setNeedEmail(on) {
  needEmail = on;
  $('join-form').classList.toggle('no-email', !on);
  $('join-tab').textContent = on ? 'ANTES DE JUGAR' : publicMode ? PLAY_TEXT.joinTitle : 'TUS INICIALES';
  validateForm();
}
setNeedEmail(needEmail);
$('initials').addEventListener('input', (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  $('join-msg').textContent = '';
  validateForm();
});
$('email').addEventListener('input', () => { $('join-msg').textContent = ''; validateForm(); });
$('consent').addEventListener('change', validateForm);
const requestSlot = () => socket.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, token: clientToken, ...(needEmail ? { email: contact.email, consent: contact.consent } : {}), ...(linkedScreen ? { screen: linkedScreen } : {}) }); // en una sala, la plaza es la siguiente libre (igual que en el stand); screen = la pantalla cuyo QR se escaneó
$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  initials = $('initials').value;
  contact = { email: $('email').value.trim(), consent: $('consent').checked };
  if (!socket.connected) { show('view-lost'); return; } // la página venía de la caché y el túnel/servidor ya no existe: no se puede entrar
  if (initials.length === 3 && (!needEmail || (emailOk(contact.email) && contact.consent))) requestSlot(); // la pantalla completa se pide al recibir la plaza, no antes (el toque de SIGUIENTE sigue siendo el gesto que permite la pantalla completa)
});
$('retry-btn').addEventListener('click', requestSlot);
$('reconnect-btn').addEventListener('click', () => {
  $('offline-msg').textContent = 'CONEXIÓN PERDIDA.';
  mySlot = null;
  if (bindToken) { $('offline-msg').textContent = 'ENGANCHANDO TU MÓVIL A TU JUGADOR...'; show('view-offline'); } else show('view-join'); // relevo: sin formulario
  socket.connect();
});

// --- Controles ---
// El movimiento se envía como estado actual con "volatile" (si un paquete se pierde, el siguiente lo corrige).
// Al soltar el dedo se descarta cualquier envío pendiente y se manda (0, 0) por el camino normal: si no, un envío
// tardío con la dirección antigua llegaría después del "parar" y el tanque seguiría andando.
// Envío de los controles (sección 63): un solo paquete corto "pad" con movimiento y apuntado, sin repetir lo que no ha cambiado, con ritmo según el ping
// (padInterval), esperando a que el WebSocket esté libre y repitiendo el estado cada 500 ms mientras el dedo está puesto. Parar y disparar van por el
// camino fiable (el disparo lleva su ángulo). Ver client/play/padLink.js.
let lastPing = 0;
const padLink = createPadLink({
  send: (pad) => socket.volatile.emit(EVENTS.PAD, pad),
  sendNow: (pad) => socket.emit(EVENTS.PAD, pad),
  fire: (angle) => (angle === null ? socket.emit(EVENTS.FIRE) : socket.emit(EVENTS.FIRE, angle)),
  getPing: () => lastPing,
  canSend: () => (socket.io.engine?.transport?.ws?.bufferedAmount ?? 0) < 2048, // datos sin enviar = red lenta: no apilar más, mandar lo último cuando se vacíe
});
createJoystick($('pad-move'), (x, y, active) => {
  if (active) padLink.setMove(x, y);
  else padLink.releaseMove();
});

// Apuntar y soltar = disparar. Mientras el dedo está en el pad se envía el ángulo; al soltar, el disparo lleva el ángulo definitivo. Un toque suelto (tap)
// también dispara (hacia donde ya apuntaba). Si el sistema canceló el toque (un gesto del móvil), no se dispara.
let aimAngle = null;
createJoystick($('pad-aim'), (x, y, active, cancelled) => {
  if (active) {
    if (Math.hypot(x, y) > AIM_DEADZONE) {
      aimAngle = Math.atan2(y, x);
      padLink.setAim(aimAngle);
    }
    return;
  }
  if (!cancelled) padLink.fire(aimAngle); // con aimAngle = null (toque sin apuntar) dispara con el ángulo que ya tenía el servidor
  else padLink.cancelAim();
  aimAngle = null;
});

// El botón grande es el dash. Tras usarlo se atenúa durante lo que tarde en recargarse.
createTapButton($('dash-btn'), () => socket.emit(EVENTS.DASH));
// Versión pública: PAUSA (arriba en el centro, en partida) y SALIR (en la sala de espera), los dos con confirmación para salir (phoneMenu.js).
let lastLobby = null;
const phoneMenu = publicMode ? setupPhoneMenu({
  bound: Boolean(bindToken),
  socket, getSlot: () => mySlot, getPhase: () => phase, nameOf: (slot) => lastLobby?.initials?.[slot - 1],
  onOpen: () => padLink.releaseMove(), // con el menú abierto el tanque no sigue andando
  onLeft: () => {
    $('offline-msg').textContent = bindToken ? 'HAS SALIDO. TU PANTALLA VUELVE AL TECLADO.' : 'HAS SALIDO DE LA SALA.';
    $('reconnect-btn').textContent = bindToken ? 'USAR EL MÓVIL OTRA VEZ' : 'VOLVER A ENTRAR';
    show('view-offline');
  },
}) : null;
if (phoneMenu) socket.on(EVENTS.PAUSE_STATE, (state) => phoneMenu.serverState(state));
// Evita el menú del navegador al mantener pulsado.
document.addEventListener('contextmenu', (event) => event.preventDefault());

async function keepScreenOn() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* no es imprescindible */ }
}

// --- Mensajes del servidor ---
// Si se corta la conexión (4G saturada, pantalla bloqueada), Socket.io reconecta solo y aquí se pide la misma plaza con el token
// (el servidor la guarda hasta 10 s en partida). `resuming` = tenía plaza y está intentando volver.
let resuming = false;
// Si el servidor no responde (túnel cerrado, página servida desde la caché...) no se deja rellenar el formulario: sale "SIN CONEXIÓN, vuelve a escanear el QR".
// Fallos de transporte seguidos sin haber conectado = enlace muerto; al volver a conectar la pantalla se recupera sola.
let connectFails = 0;
socket.on('connect', () => {
  $('status').textContent = 'CONECTADO';
  $('footer').classList.remove('off');
  connectFails = 0;
  goneTries = 0;
  clearTimeout(goneTimer);
  if (!$('view-lost').hidden) show(mySlot === null ? 'view-join' : 'view-offline');
  if (resuming || (bindToken && mySlot === null)) requestSlot(); // relevo del teclado: entra ya con el token del QR
});
// El servidor avisa del motivo antes de cerrar (reset global del stand) y después llega "disconnect".
socket.on(EVENTS.FORCE_DISCONNECT, () => { $('offline-msg').textContent = 'PARTIDA REINICIADA. VUELVE A UNIRTE.'; });
socket.on('disconnect', (reason) => {
  $('status').textContent = 'DESCONECTADO';
  $('footer').classList.add('off');
  const hadSlot = mySlot !== null;
  // Solo se reintenta ante un corte de la red; si el servidor nos echa (reinicio global, inactividad) hay que volver a unirse.
  resuming = hadSlot && reason !== 'io server disconnect' && reason !== 'io client disconnect';
  if (!resuming) { mySlot = null; $('me').textContent = ''; } else $('offline-msg').textContent = 'RECONECTANDO...';
  // Partida rápida: la pantalla ha recuperado el mando para el teclado (VOLVER AL TECLADO). El móvil puede volver a engancharse cuando quiera.
  if (bindToken && reason === 'io server disconnect') { $('offline-msg').textContent = 'TU PANTALLA HA VUELTO AL TECLADO.'; $('reconnect-btn').textContent = 'USAR EL MÓVIL OTRA VEZ'; }
  show('view-offline');
});
let barsStarted = false;
socket.on(EVENTS.SLOT_ASSIGNED, ({ slot, initials: confirmed }) => {
  if (!resuming) fullscreen.arm(); // plaza concedida tras el formulario: AHORA se exige pantalla completa y horizontal (a los pocos ms del toque de SIGUIENTE, aún válido como gesto)
  resuming = false;
  if (!barsStarted) { barsStarted = true; startHideBars(); }
  mySlot = slot;
  document.body.dataset.slot = String(slot); // el color del mando (azul P1, rosa P2)
  $('me').textContent = `P${slot} · ${confirmed}`;
  $('slot-number').textContent = `P${slot}`;
  $('ready-slot').textContent = `P${slot}`;
  $('slot-initials').textContent = confirmed;
  show('view-slot');
});
// Si al volver ya no hay plaza (se perdió por abandono o la ocupó otro), se vuelve a la pantalla de unirse.
const lostSlot = () => { if (!resuming) return false; resuming = false; mySlot = null; $('me').textContent = ''; return true; };
socket.on(EVENTS.ROOM_FULL, () => { lostSlot(); show('view-full'); });
socket.on(EVENTS.ERROR_MSG, ({ message }) => { const wasResuming = lostSlot(); $('join-msg').textContent = message; if (wasResuming || (bindToken && mySlot === null)) show('view-join'); });
if (bindToken) { $('offline-msg').textContent = 'ENGANCHANDO TU MÓVIL A TU JUGADOR...'; show('view-offline'); } // relevo del teclado: sin formulario
// Sala online que no existe o ya se cerró (el servidor rechaza el espacio de nombres).
const LOST_DEAD_LINK = 'NO SE PUEDE CONECTAR CON LA PARTIDA. EL ENLACE DE ESTE CÓDIGO QR YA NO FUNCIONA.';
const LOST_DEAD_HINT = 'CIERRA ESTA PÁGINA Y VUELVE A ESCANEAR EL CÓDIGO QR DE LA PANTALLA.';
function showLost(msg, hint) {
  $('lost-msg').textContent = msg;
  $('lost-hint').textContent = hint;
  show('view-lost');
}
// Sala inexistente: tras un despliegue o un reinicio la pantalla del host recrea la sala en unos segundos, así que se reintenta cada 3 s durante ~2 minutos.
let goneTries = 0;
let goneTimer = null;
function roomGone() {
  showLost(goneTries < 40 ? 'ESPERANDO A QUE LA SALA VUELVA… (EL SERVIDOR SE HA ACTUALIZADO O REINICIADO)' : 'ESTA SALA YA NO EXISTE.',
    goneTries < 40 ? 'SI NO VUELVE, PIDE A QUIEN LA CREÓ EL QR NUEVO Y ESCANÉALO.' : 'PIDE EL QR NUEVO A QUIEN CREÓ LA SALA Y ESCANÉALO.');
  clearTimeout(goneTimer);
  if (goneTries++ < 40) goneTimer = setTimeout(() => socket.connect(), 3000);
}
const REJECTIONS = new Set(['room_required', 'Invalid namespace', 'room_busy', 'server_busy', 'bad_origin']); // el servidor SÍ contesta y rechaza
socket.on('connect_error', (err) => {
  if (!REJECTIONS.has(err.message)) { // transporte caído: el servidor no responde
    connectFails++;
    if (connectFails >= 2) showLost(LOST_DEAD_LINK, LOST_DEAD_HINT);
    return;
  }
  if (err.message === 'Invalid namespace' && roomCode) { // la sala no existe: se cerró, o el servidor se reinició y la pantalla aún no la ha recreado
    roomGone();
    return;
  }
  if (!roomCode) {
    // El servidor online no tiene partida suelta: sin ?room= no hay a dónde entrar.
    if (err.message === 'room_required') { $('offline-msg').textContent = 'ESCANEA EL QR DE LA PARTIDA PARA ENTRAR.'; show('view-offline'); }
    return;
  }
  $('offline-msg').textContent = err.message === 'Invalid namespace' ? 'ESA SALA NO EXISTE O YA SE CERRÓ.' : err.message === 'room_busy' ? 'LA SALA ESTÁ LLENA.' : 'NO SE PUDO ENTRAR EN LA SALA.';
  show('view-offline');
});

// La fase de la sesión decide qué pantalla ve cada jugador (solo si ya tiene plaza).
// LISTO: con todos los jugadores listos el servidor empieza la cuenta atrás (2 en multijugador, solo tú en solitario).
$('ready-btn').addEventListener('click', () => { if (mySlot !== null) { fullscreen.arm(); socket.emit(EVENTS.PLAYER_READY); } });
// LISTO es un interruptor: pulsarlo otra vez lo cancela. Con todos listos corre la cuenta atrás de entrada (joinLeft), en la que aún
// puede entrar gente; mientras tanto el botón sirve para cancelar.
// El modo sale solo de cuántos jugadores hay (sin opciones: los bots solo existen con un jugador, sección 62).
function renderReady({ ready = [false, false], solo = false, slots = [true, true], joinLeft = null, plan = null }) {
  const mine = mySlot !== null && ready[mySlot - 1] === true;
  $('mode-line').textContent = plan ? describePlan(plan) : '';
  const others = plan ? plan.humans - 1 : 0;
  $('ready-btn').textContent = mine ? 'CANCELAR LISTO' : 'LISTO';
  $('ready-btn').classList.toggle('cancel', mine);
  $('join-count').hidden = joinLeft === null;
  if (joinLeft !== null) $('join-count').textContent = String(joinLeft);
  $('join-label').hidden = joinLeft === null;
  $('view-slot').classList.toggle('counting', joinLeft !== null); // diseño compacto: número a la izquierda, CANCELAR LISTO a la derecha
  const T = publicMode ? PLAY_TEXT : null; // versión pública: tono cercano; el stand, como siempre
  if (joinLeft !== null) $('ready-hint').textContent = T ? T.countdown : 'CANCELA SI NO ESTÁS LISTO';
  else if (mine) $('ready-hint').textContent = solo || others === 0 ? (T ? T.cancelOnly : 'PULSA OTRA VEZ PARA CANCELAR') : (T ? T.waitOthers : 'ESPERANDO A LOS DEMÁS... PULSA OTRA VEZ PARA CANCELAR');
  else $('ready-hint').textContent = solo ? (T ? T.soloHint : 'TÚ CONTRA 3 BOTS · PULSA LISTO') : others > 0 ? (T ? T.readyHint : 'PULSA LISTO CUANDO ESTÉS PREPARADO') : (T ? T.aloneHint : 'PULSA LISTO (O ESPERA A MÁS JUGADORES)');
}
socket.on(EVENTS.LOBBY_STATE, (data) => {
  const { state } = data;
  const previous = phase;
  phase = state;
  lastLobby = data;
  phoneMenu?.phase(state);
  if (typeof data.requireEmail === 'boolean' && data.requireEmail !== needEmail) setNeedEmail(data.requireEmail);
  if (mySlot === null) return;
  renderReady(data);
  if (state === 'READY') { if (previous !== 'READY') $('countdown').textContent = '...'; show('view-ready'); } // los números salen tras la intro del host
  else if (state === 'PLAYING') {
    if (previous !== 'PLAYING') hud.reset(); // partida nueva (lobby_state se repite durante la partida)
    show('view-pads');
    keepScreenOn();
  } else if (state === 'LOBBY') { hud.reset(); show('view-slot'); }
});
socket.on(EVENTS.PLAYER_HUD, (data) => hud.update(data));
socket.on(EVENTS.COUNTDOWN, ({ seconds }) => { $('countdown').textContent = String(seconds); });
socket.on(EVENTS.MATCH_EVENT, (event) => {
  if (event.type === 'hit') {
    navigator.vibrate?.(250); // te han dado (no funciona en iPhone)
    if (event.lives > 0) hud.onHit(event.lives); // si era tu última vida, el fin de partida lo cuenta match_over
  }
  if (event.type === 'match_over') finaleEndsAt = performance.now() + hud.onMatchOver(event.reason, event.winnerNames);
  if (event.type === 'dash') {
    const button = $('dash-btn');
    button.classList.add('cooling');
    setTimeout(() => button.classList.remove('cooling'), event.cooldown * 1000);
  }
});
socket.on(EVENTS.GAME_OVER, (result) => {
  if (mySlot === null) return;
  const mine = result.scores[mySlot - 1];
  const winners = result.winners ?? (result.winner === null ? [] : [result.winner]);
  $('over-title').textContent = publicMode
    ? (winners.length === 0 ? PLAY_TEXT.draw : winners.includes(mySlot) ? PLAY_TEXT.won : PLAY_TEXT.lost)
    : (winners.length === 0 ? 'EMPATE' : winners.includes(mySlot) ? 'GANASTE!' : 'PERDISTE');
  $('over-score').textContent = String(mine.score);
  const rank = typeof mine.rank === 'number' ? ` · PUESTO ${mine.rank}` : '';
  $('over-detail').textContent = `VIDAS ${mine.lives} · PRECISIÓN ${mine.accuracy}%${rank}`;
  $('over-hint').textContent = publicMode ? PLAY_TEXT.rematch : 'REDIRIGIENDO...';
  // El resultado espera a que acabe la animación del final (K.O. / GAME OVER), como en el host.
  // Stand: se sale de la pantalla completa (después se va a /end). Pública: se sigue en la sala para la revancha.
  setTimeout(() => { hud.reset(); if (!publicMode) fullscreen.exit(); if (phase === 'GAME_OVER') show('view-over'); },
     Math.max(0, finaleEndsAt - performance.now()));
});
socket.on(EVENTS.REDIRECT, ({ url }) => { window.location.href = url; });

startLatencyProbe(socket, (ms) => {
  lastPing = ms;
  $('ping').textContent = String(ms);
  socket.volatile.emit(EVENTS.PING_REPORT, { ms }); // el host enseña el ping de cada jugador
});

keepPixelImagesSharp(); // logos de pixel art con píxeles enteros en cualquier móvil (sección 65)
