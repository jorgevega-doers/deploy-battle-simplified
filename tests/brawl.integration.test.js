// Modos automáticos por sockets: 3 jugadores + 1 bot de relleno y 4 jugadores en equipos (host + mandos falsos).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { EVENTS } from '../shared/events.js';

let app;
let url;
const sockets = [];
const newClient = () => { const s = connect(url, { transports: ['websocket'], forceNew: true }); sockets.push(s); return s; };
const waitFor = (socket, event, ms = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const connected = (socket) => (socket.connected ? Promise.resolve() : waitFor(socket, 'connect'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error('timeout en until'); await sleep(15); }
};

before(async () => {
  app = createApp({ dbPath: ':memory:', gameConfig: { introS: 0, joinWindowS: 0, countdownS: 0.3, matchSeconds: 1.5, resultsS: 0.4 } });
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

// Entra con n mandos, cada uno con su plaza, y devuelve host, mandos y los lobby_state vistos por el host.
async function room(n, initials) {
  const host = newClient();
  await connected(host);
  const lobbies = [];
  host.on(EVENTS.LOBBY_STATE, (s) => lobbies.push(s));
  host.emit(EVENTS.HOST_JOIN);
  const pads = [];
  for (let i = 0; i < n; i++) {
    const pad = newClient();
    await connected(pad);
    pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: initials[i] });
    const got = await waitFor(pad, EVENTS.SLOT_ASSIGNED);
    assert.equal(got.slot, i + 1);
    pads.push(pad);
  }
  await until(() => lobbies.at(-1)?.plan?.humans === n);
  return { host, pads, lobbies };
}

test('3 jugadores: todos contra todos sin bots, 3 tanques y resultado de 3 puntuaciones', async () => {
  const { pads, lobbies, host } = await room(3, ['AAA', 'BBB', 'CCC']);
  const plan = lobbies.at(-1).plan;
  assert.deepEqual([plan.kind, plan.humans, plan.bots], ['brawl', 3, 0]);
  assert.deepEqual(lobbies.at(-1).initials, ['AAA', 'BBB', 'CCC']);
  const over = waitFor(pads[0], EVENTS.GAME_OVER);
  const states = [];
  host.on(EVENTS.STATE_UPDATE, (s) => states.push(s));
  pads.forEach((p) => p.emit(EVENTS.PLAYER_READY));
  const result = await over;
  assert.equal(result.scores.length, 3);
  assert.ok(result.scores.every((s) => s.bot === false));
  assert.ok(states.some((s) => s.tanks.length === 3));
  await until(() => lobbies.at(-1).state === 'LOBBY' && lobbies.at(-1).slots.every((x) => !x), 6000);
});

test('4 jugadores: todos contra todos, sin equipos ni bots', async () => {
  const { pads, lobbies } = await room(4, ['WAL', 'XIO', 'YAN', 'ZEL']);
  assert.deepEqual([lobbies.at(-1).plan.kind, lobbies.at(-1).plan.bots, lobbies.at(-1).plan.teams], ['brawl', 0, null]);
  const over = waitFor(pads[2], EVENTS.GAME_OVER);
  pads.forEach((p) => p.emit(EVENTS.PLAYER_READY));
  const result = await over;
  assert.equal(result.teams, null);
  assert.ok(Array.isArray(result.winners));
  assert.equal(result.scores.length, 4);
  assert.ok(result.scores.every((s) => s.bot === false));
});
