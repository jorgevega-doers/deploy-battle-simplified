// PRUEBAS (menú del host, opciones de desarrollador): crea de 1 a 4 mandos falsos dentro de la propia página del host que se unen
// a la partida y juegan al azar, para ver el juego sin conectar dos móviles. Usan el mismo camino que un móvil real
// (Socket.io + join_room), así que prueban también el servidor. No toca nada del juego: borrar este archivo y el botón basta.
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { connectToRoom } from '../roomSocket.js';

const TICK_MS = 100;
const INITIALS = ['BOA', 'BOB', 'BOC', 'BOD'];
const rand = (min, max) => min + Math.random() * (max - min);

function createBot(initials, onDone) {
  const socket = connectToRoom(io); // en una sala online (modo dev), los bots entran en esa sala
  let playing = false;
  let moveUntil = 0;
  let aimUntil = 0;
  let timer = null;

  function think(now) {
    if (now > moveUntil) { // nueva dirección (o parado, a veces) cada cierto tiempo
      moveUntil = now + rand(600, 1500);
      if (Math.random() < 0.15) socket.emit(EVENTS.PAD_MOVE, { x: 0, y: 0 });
      else {
        const angle = rand(0, Math.PI * 2);
        const power = rand(0.5, 1);
        socket.emit(EVENTS.PAD_MOVE, { x: Math.cos(angle) * power, y: Math.sin(angle) * power });
      }
    }
    if (now > aimUntil) { // apunta a un ángulo al azar y dispara, como al soltar el pad de apuntado
      aimUntil = now + rand(700, 1500);
      socket.emit(EVENTS.PAD_AIM, { angle: rand(-Math.PI, Math.PI) });
      socket.emit(EVENTS.FIRE);
    }
    if (Math.random() < 0.04) socket.emit(EVENTS.DASH);
  }

  socket.on('connect', () => socket.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, email: 'bot@test.invalid', consent: true })); // @test.invalid: sin guardar (el host está en el propio portátil)
  // Como un móvil real, pulsa LISTO al tener plaza (la partida solo empieza cuando los dos jugadores están listos).
  let readySent = false; // LISTO alterna (pulsar otra vez cancela): el bot lo manda una sola vez aunque el servidor repita slot_assigned
  socket.on(EVENTS.SLOT_ASSIGNED, () => { if (!readySent) { readySent = true; socket.emit(EVENTS.PLAYER_READY); } });
  socket.on(EVENTS.ROOM_FULL, () => { stop(); onDone(); });
  socket.on(EVENTS.LOBBY_STATE, ({ state }) => {
    if (state === 'PLAYING' && !playing) {
      playing = true;
      timer = setInterval(() => think(performance.now()), TICK_MS);
    }
  });
  socket.on(EVENTS.GAME_OVER, () => { stop(); onDone(); });
  socket.on(EVENTS.FORCE_DISCONNECT, () => { stop(); onDone(); });
  // Como un móvil real, mide su ping para que el host lo enseñe.
  const pingTimer = setInterval(() => {
    if (!socket.connected) return;
    const sentAt = performance.now();
    socket.emit(EVENTS.LATENCY_PING, null, () => socket.volatile.emit(EVENTS.PING_REPORT, { ms: Math.round(performance.now() - sentAt) }));
  }, 2000);

  function stop() {
    clearInterval(timer);
    clearInterval(pingTimer);
    socket.disconnect();
  }
  return { stop };
}

// Enlaza el botón. "Iniciar test": reinicio global (como mantener R) y, un momento después, los dos bots se unen y
// juegan. "Parar test": quita los bots y vuelve a reiniciarlo todo. Al acabar la partida los bots se quitan solos.
// "reset" = función que pide el reinicio global al servidor (la da main.js con el socket del host).
const RESET_SETTLE_MS = 700; // tiempo para que el servidor vacíe las plazas antes de que entren los bots
// Un botón por número de mandos falsos (1 = contra 3 bots, 2 = 1 contra 1, 3 y 4 = todos contra todos: el modo sale solo de cuántos entran).
// Mientras hay un test, todos dicen "PARAR TEST". buttons = Map(número de jugadores -> botón).
export function setupTestBots(buttons, { reset, randomMap }) {
  let bots = [];
  let starting = null;
  const label = (n) => (n === 1 ? 'TEST: 1 JUGADOR VS BOTS' : `TEST: ${n} JUGADORES`);
  const idle = () => { for (const [n, b] of buttons) b.textContent = label(n); };
  const running = () => { for (const b of buttons.values()) b.textContent = 'PARAR TEST'; };
  const stopBots = () => { bots.forEach((b) => b.stop()); bots = []; idle(); };
  const start = (count, el) => () => {
    el.blur(); // para que la tecla R del reset no la active por error
    if (bots.length || starting) { // parar el test por completo
      clearTimeout(starting);
      starting = null;
      stopBots();
      reset();
      return;
    }
    reset();
    running();
    starting = setTimeout(() => {
      starting = null;
      randomMap?.(); // el test respeta el selector de mapa: si está en ALEATORIO sortea uno, si hay uno fijo lo mantiene
      bots = INITIALS.slice(0, count).map((initials) => createBot(initials, stopBots));
    }, RESET_SETTLE_MS);
  };
  for (const [n, b] of buttons) b.addEventListener('click', start(n, b));
  idle();
}
