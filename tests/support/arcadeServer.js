// Arnés de las pruebas de integración: arranca un servidor real en un puerto libre y da
// jugadores de prueba con sus dos conexiones (pantalla + teclado), como el navegador. No está en un *.test.js: node --test no lo ejecuta solo.
// Ojo: server/config.js lee las variables de entorno al importarse; por eso el servidor se importa aquí DENTRO de start() (el archivo de
// prueba puede poner MAX_ROOMS, etc. antes de llamar a start()).
import { io as connect } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';

// Corte de red (cable arrancado, Wi-Fi caída): se cierra el transporte sin despedirse. socket.disconnect() es otra cosa: la página que se va
// (roomSocket.js lo hace al salir) y el servidor libera el hueco al momento.
export const cut = (socket) => socket.io.engine.close();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(25); } return Boolean(fn()); };
export const waitFor = (socket, event, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});

// Tiempos cortos para que las pruebas vayan rápido (en producción: 10 s de cuenta atrás, 180 s de partida...).
export const FAST = {
  countdownS: 0.2, introS: 0, joinWindowS: 1, soloJoinWindowS: 1, maxCancels: 3, cancelGuardS: 0.15, lobbyGraceS: 0.4, reconnectGraceS: 0.8, matchSeconds: 1.5, resultsS: 0.3,
};

// options: { gameConfig, roomsPerWindow, connectionsPerMinute, ranking, now }
export async function start(options = {}) {
  process.env.MAX_SOCKETS ??= '600'; // el tope de producción (150 conexiones) se queda corto con varias salas a la vez
  const { createApp } = await import('../../server/app.js');
  const { openGlobalRanking } = await import('../../server/db/globalRanking.js');
  const ranking = options.ranking ?? await openGlobalRanking({ url: ':memory:' });
  const app = createApp({
    devPassword: 'x', roomsPerWindow: options.roomsPerWindow ?? 1000,
    connectionsPerMinute: options.connectionsPerMinute ?? 100000, ranking, now: options.now, gameConfig: { ...FAST, ...options.gameConfig },
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = `http://localhost:${app.server.address().port}`;
  app.startLoop();
  const sockets = [];

  // body: lo que manda el título ({ token } desde la versión con reservas con dueño; {} = cliente antiguo).
  const quick = async (headers = {}, body = {}) => {
    const res = await fetch(`${base}/api/quick`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  };
  // Una conexión a la sala; guarda el último lobby_state / state_update y cuenta los state_update recibidos.
  function client(code, extra = {}) {
    const s = connect(`${base}/r/${code}`, { transports: ['websocket'], forceNew: true, reconnection: false, ...extra });
    s.states = 0;
    s.on(EVENTS.LOBBY_STATE, (st) => { s.lastLobby = st; });
    s.on(EVENTS.STATE_UPDATE, (st) => { s.lastState = st; s.states += 1; s.onState?.(st); });
    s.on(EVENTS.GAME_OVER, (r) => { s.lastResult = r; });
    sockets.push(s);
    return s;
  }
  const connected = (s) => (s.connected ? Promise.resolve() : waitFor(s, 'connect'));
  // Un jugador como el del navegador: su pantalla (host_join) y su teclado (join_room con token). Devuelve { screen, pad, slot, token }.
  async function player(code, initials, { token = `token-${initials}-${Math.random().toString(36).slice(2, 12)}`, screenId = `pantalla-${initials}-${Math.random().toString(36).slice(2, 8)}` } = {}) {
    const screen = client(code);
    await connected(screen);
    screen.emit(EVENTS.HOST_JOIN, { screen: screenId });
    const pad = await join(code, initials, token, screenId);
    return { screen, pad, token, screenId, get slot() { return pad.slot; } };
  }
  // Solo el teclado (p. ej. la reconexión tras un corte). Resuelve con el socket (pad.slot = su plaza) o rechaza si no le dan plaza.
  async function join(code, initials, token, screenId = 'pantalla-xxxxxxxx') {
    const pad = client(code);
    await connected(pad);
    pad.on(EVENTS.SLOT_ASSIGNED, (d) => { pad.slot = d.slot; });
    pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, keyboard: true, screen: screenId, token });
    const answer = await Promise.race([
      waitFor(pad, EVENTS.SLOT_ASSIGNED).then((d) => ({ ok: d })),
      waitFor(pad, EVENTS.ROOM_FULL).then(() => ({ full: true })),
      waitFor(pad, EVENTS.ERROR_MSG).then((e) => ({ error: e })),
    ]);
    if (!answer.ok) throw Object.assign(new Error(answer.full ? 'room_full' : answer.error?.code), { answer });
    pad.slot = answer.ok.slot;
    return pad;
  }
  // Salas vacías entre prueba y prueba (la cola manda a la más llena: no queremos arrastrar jugadores de la anterior).
  async function reset() {
    sockets.forEach((s) => s.disconnect()); sockets.length = 0;
    app.rooms.all().forEach((r) => app.rooms.destroy(r.code));
    await sleep(60);
  }
  async function stop() {
    sockets.forEach((s) => s.disconnect());
    app.stopLoop();
    await new Promise((resolve) => app.io.close(resolve));
  }
  // Atajos de lectura del estado de la sala visto por una pantalla.
  const phase = (p) => (p.screen ?? p).lastLobby?.state;
  const counting = (p) => (p.screen ?? p).lastLobby?.joinLeft != null;
  const humans = (p) => (p.screen ?? p).lastLobby?.plan?.humans ?? 0;
  return { app, base, ranking, quick, client, connected, player, join, reset, stop, phase, counting, humans, sockets };
}

export { EVENTS };
