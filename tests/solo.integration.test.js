// Modo solitario por sockets: host + 1 mando. Con un solo jugador el modo es 1 contra 3 bots (automático) y el jugador pulsa LISTO.
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
const waitFor = (socket, event, ms = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const connected = (socket) => (socket.connected ? Promise.resolve() : waitFor(socket, 'connect'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error('timeout en until'); await sleep(15); }
};

before(async () => {
  app = createApp({ dbPath: ':memory:', gameConfig: { introS: 0, joinWindowS: 0, countdownS: 0.4, matchSeconds: 2, resultsS: 0.6, roundFreezeS: 0.2 } });
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

test('el modo sale solo de cuántos jugadores hay: 1 = 1 contra 3 bots; 2 = 1 contra 1; 3 = todos contra todos sin bots', async () => {
  const host = newClient();
  const pads = [newClient(), newClient(), newClient()];
  await Promise.all([connected(host), ...pads.map(connected)]);
  host.emit(EVENTS.HOST_JOIN);
  const lobbies = [];
  host.on(EVENTS.LOBBY_STATE, (s) => lobbies.push(s));
  const kinds = [];
  for (const [i, pad] of pads.entries()) {
    pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: ['OPA', 'OPB', 'OPC'][i] });
    await waitFor(pad, EVENTS.SLOT_ASSIGNED);
    await until(() => lobbies.at(-1)?.plan?.humans === i + 1);
    kinds.push([lobbies.at(-1).plan.kind, lobbies.at(-1).plan.bots, lobbies.at(-1).initials.length]);
  }
  assert.deepEqual(kinds, [['solo', 3, 4], ['duel', 0, 2], ['brawl', 0, 3]]);
  assert.equal(lobbies.at(-1).options, undefined, 'ya no hay opciones en el móvil');
  pads.forEach((p) => p.disconnect());
  await until(() => lobbies.at(-1)?.plan === null);
});

test('el host recibe un único Top 10', async () => {
  const host = newClient();
  await connected(host);
  const tops = waitFor(host, EVENTS.LEADERBOARD_UPDATE);
  host.emit(EVENTS.HOST_JOIN);
  const { top, topSolo } = await tops;
  assert.ok(Array.isArray(top));
  assert.equal(topSolo, undefined);
});

test('solitario: sin LISTO no empieza; con LISTO, cuenta atrás, 4 tanques y resultado sin bots en el ranking solitario', async () => {
  const host = newClient();
  const player = newClient();
  await Promise.all([connected(host), connected(player)]);
  host.emit(EVENTS.HOST_JOIN);
  const states = [];
  const lobbies = [];
  const tops = [];
  host.on(EVENTS.STATE_UPDATE, (s) => states.push(s));
  host.on(EVENTS.LOBBY_STATE, (s) => lobbies.push(s));
  host.on(EVENTS.LEADERBOARD_UPDATE, (t) => tops.push(t));
  const gameOver = waitFor(player, EVENTS.GAME_OVER);
  const redirect = waitFor(player, EVENTS.REDIRECT);

  player.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'SOL' });
  await waitFor(player, EVENTS.SLOT_ASSIGNED);
  await sleep(300);
  assert.equal(lobbies.at(-1).state, 'LOBBY', 'sin LISTO no empieza');
  assert.deepEqual(lobbies.at(-1).initials, ['SOL', 'AXL', 'VEX', 'ZED']);

  player.emit(EVENTS.PLAYER_READY);
  await until(() => lobbies.some((s) => s.state === 'READY'));
  await until(() => lobbies.some((s) => s.state === 'PLAYING'));
  player.emit(EVENTS.PAD_MOVE, { x: 1, y: 0 });
  player.emit(EVENTS.FIRE);
  const result = await gameOver;
  await redirect;
  assert.equal(result.scores.length, 4);
  assert.deepEqual(result.scores.map((s) => s.bot), [false, true, true, true]);
  assert.equal(states.at(-1).tanks.length, 4);
  assert.ok(result.scores.slice(1).every((s) => s.rank === null), 'los bots no entran en el ranking');
  await sleep(900);
  assert.equal(lobbies.at(-1).state, 'LOBBY');
  assert.deepEqual(lobbies.at(-1).slots, [false, false, false, false]);
  const last = tops.at(-1);
  assert.ok(last.top.length <= 1, 'solo entra el jugador, nunca los bots');
  if (result.scores[0].score > 0) assert.deepEqual(last.top.map((e) => e.initials), ['SOL']);
});

test('si el único jugador se va durante la cuenta atrás, vuelve al lobby y su LISTO se borra', async () => {
  const host = newClient();
  const player = newClient();
  await Promise.all([connected(host), connected(player)]);
  host.emit(EVENTS.HOST_JOIN);
  const lobbies = [];
  host.on(EVENTS.LOBBY_STATE, (s) => lobbies.push(s));
  player.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'BYE' });
  await waitFor(player, EVENTS.SLOT_ASSIGNED);
  player.emit(EVENTS.PLAYER_READY);
  await until(() => lobbies.some((s) => s.state === 'READY'));
  player.disconnect();
  await until(() => lobbies.at(-1).state === 'LOBBY');
  assert.ok(lobbies.at(-1).ready.every((r) => !r));
});
