// Prueba de integración: arranca el servidor de verdad (puerto libre al azar) y conecta clientes Socket.io
// como si fueran móviles. Comprueba plazas, room_full, liberación y robustez ante muchos escaneos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { EVENTS } from '../shared/events.js';

let app;
let url;
const sockets = [];

const newClient = () => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return socket;
};
const waitFor = (socket, event, ms = 6000) => new Promise((resolve, reject) => { // holgado: con el equipo ocupado 30 conexiones tardan más
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const connected = (socket) => (socket.connected ? Promise.resolve() : waitFor(socket, 'connect'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const join = async (socket, initials) => {
  await connected(socket);
  const answer = Promise.race([
    waitFor(socket, EVENTS.SLOT_ASSIGNED).then((d) => ({ type: 'slot', ...d })),
    waitFor(socket, EVENTS.ROOM_FULL).then(() => ({ type: 'full' })),
    waitFor(socket, EVENTS.ERROR_MSG).then((d) => ({ type: 'error', ...d })),
  ]);
  socket.emit(EVENTS.JOIN_ROOM, { role: 'player', initials });
  return answer;
};

before(async () => {
  app = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  url = `http://localhost:${app.server.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  app.io.close();
  await new Promise((resolve) => app.server.close(resolve));
});

test('P1 a P4 reciben plaza, el quinto recibe room_full y al liberarse una entra (los demás se corren a P1..)', async () => {
  const [a, b, c, d, e] = [newClient(), newClient(), newClient(), newClient(), newClient()];
  assert.deepEqual(await join(a, 'aaa'), { type: 'slot', slot: 1, initials: 'AAA' });
  assert.deepEqual(await join(b, 'BBB'), { type: 'slot', slot: 2, initials: 'BBB' });
  assert.deepEqual(await join(c, 'CCC'), { type: 'slot', slot: 3, initials: 'CCC' });
  assert.deepEqual(await join(d, 'DDD'), { type: 'slot', slot: 4, initials: 'DDD' });
  assert.deepEqual(await join(e, 'EEE'), { type: 'full' });

  const moved = waitFor(b, EVENTS.SLOT_ASSIGNED);
  a.disconnect();
  await sleep(500); // el servidor libera la plaza al detectar la desconexión
  assert.deepEqual(await moved, { slot: 1, initials: 'BBB' }, 'B pasa a P1');
  assert.deepEqual(await join(e, 'EEE'), { type: 'slot', slot: 4, initials: 'EEE' });
});

test('el host recibe lobby_state con las iniciales de los jugadores', async () => {
  const host = newClient();
  await connected(host);
  const first = waitFor(host, EVENTS.LOBBY_STATE);
  host.emit(EVENTS.HOST_JOIN);
  const state = await first;
  assert.equal(state.slots.length, 4);
  assert.equal(state.maxPlayers, 4);
  assert.ok(state.initials.length >= 2); // sin plan, las de las dos primeras plazas; con gente de otras pruebas, las de todos los tanques
});

test('iniciales no válidas devuelven error_msg y no ocupan plaza', async () => {
  const bad = newClient();
  const answer = await join(bad, 'A1');
  assert.equal(answer.type, 'error');
  assert.equal(answer.code, 'invalid_initials');
});

test('hard_reset: expulsa a los mandos, vacía las plazas y el host sigue conectado', async () => {
  const host = newClient();
  const p1 = newClient();
  await connected(host);
  host.emit(EVENTS.HOST_JOIN);
  await waitFor(host, EVENTS.LOBBY_STATE);
  app.slots.clear();
  await join(p1, 'RST');
  assert.equal(app.slots.occupancy()[0], true);

  const kicked = waitFor(p1, EVENTS.FORCE_DISCONNECT);
  const kickedAndClosed = new Promise((resolve) => p1.once('disconnect', resolve));
  host.emit(EVENTS.HARD_RESET);
  assert.deepEqual(await kicked, { reason: 'hard_reset' });
  await kickedAndClosed;

  assert.deepEqual(app.slots.occupancy(), [false, false, false, false]);
  assert.equal(host.connected, true);
});

test('tras un hard_reset el último lobby_state del host cuenta 0 mandos (sin desfase)', async () => {
  const host = newClient();
  const p = newClient();
  await connected(host);
  host.emit(EVENTS.HOST_JOIN);
  await join(p, 'CNT');
  const states = [];
  host.on(EVENTS.LOBBY_STATE, (s) => states.push(s));
  host.emit(EVENTS.HARD_RESET);
  await sleep(500);
  assert.ok(states.length > 0);
  assert.equal(states.at(-1).connected, 0);
});

test('hard_reset enviado por un mando (no host) se ignora', async () => {
  const player = newClient();
  await join(player, 'ABC');
  player.emit(EVENTS.HARD_RESET);
  await sleep(300);
  assert.equal(player.connected, true);
  assert.equal(app.slots.get(player.id) !== null, true);
});

test('/api/host-config responde en local y se bloquea con cabeceras de túnel', async () => {
  const ok = await fetch(`${url}/api/host-config`);
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).playUrl, /\/play\/$/);
  const blocked = await fetch(`${url}/api/host-config`, { headers: { 'x-forwarded-for': '83.1.2.3' } });
  assert.equal(blocked.status, 403);
});

test('30 escaneos a la vez no tumban el servidor: solo se ocupan las plazas libres', async () => {
  const before = app.slots.occupancy().filter(Boolean).length;
  const free = 4 - before;
  const clients = Array.from({ length: 30 }, newClient);
  const results = await Promise.all(clients.map((c, i) => join(c, `ZZ${String.fromCharCode(65 + (i % 26))}`)));
  assert.equal(results.filter((r) => r.type === 'slot').length, free);
  assert.equal(results.filter((r) => r.type === 'full').length, 30 - free);
  // El servidor sigue respondiendo después del aluvión.
  const probe = newClient();
  await connected(probe);
  await new Promise((resolve) => probe.emit(EVENTS.LATENCY_PING, null, resolve));
});

test('el host recibe el ping de cada jugador con su número de plaza; un mando sin plaza se ignora', async () => {
  const own = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => own.server.listen(0, resolve));
  const ownUrl = `http://localhost:${own.server.address().port}`;
  const mk = () => { const s = connect(ownUrl, { transports: ['websocket'], forceNew: true }); sockets.push(s); return s; };
  try {
    const [host, a, stranger] = [mk(), mk(), mk()];
    await Promise.all([connected(host), connected(a), connected(stranger)]);
    host.emit(EVENTS.HOST_JOIN);
    await join(a, 'AAA');
    const pings = [];
    host.on(EVENTS.PLAYER_PING, (p) => pings.push(p));
    stranger.emit(EVENTS.PING_REPORT, { ms: 10 });
    a.emit(EVENTS.PING_REPORT, { ms: 'no' });
    a.emit(EVENTS.PING_REPORT, { ms: 42.4 });
    await sleep(300);
    assert.deepEqual(pings, [{ slot: 1, ms: 42 }]);
  } finally {
    own.io.close();
    await new Promise((resolve) => own.server.close(resolve));
  }
});

test('reinicio total de emergencia (R): expulsa a los mandos, vuelve a los ajustes de fábrica y manda recargar a la pantalla; un mando no puede pedirlo', async () => {
  const host = newClient();
  const p = newClient();
  const intruder = newClient();
  await Promise.all([connected(host), connected(p), connected(intruder)]);
  host.emit(EVENTS.HOST_JOIN);
  await waitFor(host, EVENTS.LOBBY_STATE);
  app.slots.clear();
  app.session.reset();
  await join(p, 'EME');
  app.session.setDifficulty('pro');
  app.session.setMapChoice(2);
  // Un mando (sin ser host) no consigue nada.
  intruder.emit(EVENTS.EMERGENCY_RESET);
  await sleep(200);
  assert.equal(app.session.difficulty, 'pro');
  assert.equal(app.session.mapChoice, 2);
  assert.equal(p.connected, true);
  // El host sí.
  const kicked = waitFor(p, EVENTS.FORCE_DISCONNECT);
  const reload = waitFor(host, EVENTS.EMERGENCY_RELOAD);
  host.emit(EVENTS.EMERGENCY_RESET);
  assert.deepEqual(await kicked, { reason: 'hard_reset' });
  await reload;
  assert.deepEqual(app.slots.occupancy(), [false, false, false, false]);
  assert.equal(app.session.phase, 'LOBBY');
  assert.equal(app.session.difficulty, 'stand', 'la dificultad vuelve a la de fábrica');
  assert.equal(app.session.mapChoice, 'random', 'el mapa vuelve a aleatorio');
  assert.equal(host.connected, true);
});
