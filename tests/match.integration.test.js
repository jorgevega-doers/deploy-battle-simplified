// Partida completa por sockets, con el bucle real del servidor y una partida corta: host + 2 mandos simulados.
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
const waitFor = (socket, event, ms = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const connected = (socket) => (socket.connected ? Promise.resolve() : waitFor(socket, 'connect'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  app = createApp({ dbPath: ':memory:', maxPlayers: 2, gameConfig: { fillBots: false, introS: 0, joinWindowS: 0, countdownS: 0.4, matchSeconds: 2, resultsS: 0.6, roundFreezeS: 0.2, powerupFirstSpawnS: 0.2 } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  url = `http://localhost:${app.server.address().port}`;
  app.startLoop();
});

after(async () => {
  app.stopLoop();
  sockets.forEach((s) => s.disconnect());
  app.io.close();
  await new Promise((resolve) => app.server.close(resolve));
});

test('una partida corta completa: cuenta atrás, juego, resultado, redirección y liberación de plazas', async () => {
  const host = newClient();
  const [p1, p2] = [newClient(), newClient()];
  await Promise.all([connected(host), connected(p1), connected(p2)]);
  host.emit(EVENTS.HOST_JOIN);

  const states = [];
  const matchEvents = [];
  const lobbyStates = [];
  host.on(EVENTS.STATE_UPDATE, (s) => states.push(s));
  host.on(EVENTS.MATCH_EVENT, (e) => matchEvents.push(e));
  host.on(EVENTS.LOBBY_STATE, (s) => lobbyStates.push(s.state));
  const tops = [];
  host.on(EVENTS.LEADERBOARD_UPDATE, (t) => tops.push(t.top));
  const p1Events = []; // lo que recibe el mando de P1 (solo sus propios avisos: impactos recibidos y dash)
  p1.on(EVENTS.MATCH_EVENT, (e) => p1Events.push(e));
  const countdown = waitFor(p1, EVENTS.COUNTDOWN);
  const gameOver1 = waitFor(p1, EVENTS.GAME_OVER);
  const gameOver2 = waitFor(p2, EVENTS.GAME_OVER);
  const redirect1 = waitFor(p1, EVENTS.REDIRECT);
  const redirect2 = waitFor(p2, EVENTS.REDIRECT);

  p1.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'ONE' });
  p2.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'TWO' });
  await sleep(300);
  assert.equal(app.session.phase, 'LOBBY', 'con los dos dentro la partida no empieza sola');
  p1.emit(EVENTS.PLAYER_READY);
  p2.emit(EVENTS.PLAYER_READY);
  assert.ok((await countdown).seconds >= 1);

  // Cuando empieza la partida: P1 se mueve a la derecha, apunta y dispara.
  while (!lobbyStates.includes('PLAYING')) await sleep(20);
  p1.emit(EVENTS.PAD, [100, 0, 50]); // paquete compacto: derecha y apuntando 0,5 rad
  p1.emit(EVENTS.FIRE, 50); // el disparo lleva su ángulo
  p1.emit(EVENTS.DASH);
  p1.emit(EVENTS.PAD, ['basura', null]); // entradas inválidas se ignoran sin romper nada
  p2.emit(EVENTS.PAD_MOVE, { x: 1, y: 0 }); // los eventos antiguos siguen funcionando
  p2.emit(EVENTS.PAD_AIM, { angle: Infinity });
  await sleep(600);

  const [result1, result2, r1, r2] = await Promise.all([gameOver1, gameOver2, redirect1, redirect2]);
  assert.deepEqual(result1, result2);
  assert.equal(result1.scores.length, 2);
  assert.equal(result1.scores[0].initials, 'ONE');
  // Cada jugador recibe en su enlace final su propio resultado (iniciales, puntos, posición, vidas, precisión y desenlace).
  const link1 = new URL(r1.url, 'http://x');
  const link2 = new URL(r2.url, 'http://x');
  assert.equal(link1.pathname, '/end/');
  assert.equal(link1.searchParams.get('i'), 'ONE');
  assert.equal(link2.searchParams.get('i'), 'TWO');
  assert.equal(Number(link1.searchParams.get('s')), result1.scores[0].score);
  assert.equal(link1.searchParams.get('r'), '', 'sin impactos no hay puntuación ni posición en el ranking');
  assert.ok(['w', 'l', 'd'].includes(link1.searchParams.get('o')));
  // Una partida sin ningún impacto puntúa 0 y no entra en el Top 10 (dos jugadores quietos no deben llenar el ranking).
  assert.equal(result1.scores[0].score, 0);
  assert.equal(result1.scores[0].rank, null);
  const finalTop = tops.at(-1);
  assert.ok(finalTop, 'el host debe recibir el Top 10');
  assert.deepEqual(finalTop, []);

  assert.ok(states.length > 20, `solo ${states.length} estados recibidos`);
  const xs = states.map((s) => s.tanks[0][0]);
  assert.ok(Math.max(...xs) > xs[0] + 1, 'P1 debería haberse movido hacia la derecha');
  assert.ok(matchEvents.some((e) => e.type === 'shot' && e.slot === 1));
  assert.ok(matchEvents.some((e) => e.type === 'dash' && e.slot === 1), 'el host ve el dash');
  const dashForP1 = p1Events.find((e) => e.type === 'dash');
  assert.ok(dashForP1, 'el mando de P1 recibe el aviso de su dash');
  assert.equal(typeof dashForP1.cooldown, 'number');
  assert.ok(matchEvents.some((e) => e.type === 'powerup_spawn'), 'debe aparecer algún power-up');
  assert.ok(matchEvents.some((e) => e.type === 'match_over'));
  assert.deepEqual(['READY', 'PLAYING', 'GAME_OVER'].filter((p) => lobbyStates.includes(p)), ['READY', 'PLAYING', 'GAME_OVER']);

  await sleep(200);
  assert.deepEqual(app.slots.occupancy(), [false, false], 'las plazas deben quedar libres tras la redirección');
  assert.equal(app.session.phase, 'LOBBY');
});

test('tras una partida, otros dos jugadores pueden entrar (rotación)', async () => {
  const [a, b] = [newClient(), newClient()];
  await Promise.all([connected(a), connected(b)]);
  const first = waitFor(a, EVENTS.SLOT_ASSIGNED);
  a.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'NEW' });
  assert.equal((await first).slot, 1);
  const second = waitFor(b, EVENTS.SLOT_ASSIGNED);
  b.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'TOO' });
  assert.equal((await second).slot, 2);
  a.emit(EVENTS.PLAYER_READY);
  b.emit(EVENTS.PLAYER_READY);
  await sleep(100);
  assert.equal(app.session.phase, 'READY');
});

test('el reset global cancela una partida en curso y vuelve al lobby', async () => {
  // La partida anterior ya está en cuenta atrás con a y b: el host la reinicia.
  const host = newClient();
  await connected(host);
  host.emit(EVENTS.HOST_JOIN);
  await sleep(100);
  host.emit(EVENTS.HARD_RESET);
  await sleep(300);
  assert.equal(app.session.phase, 'LOBBY');
  assert.deepEqual(app.slots.occupancy(), [false, false]);
});
