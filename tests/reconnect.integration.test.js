// Un mando que pierde la conexión en plena partida (4G saturada, pantalla bloqueada) recupera su plaza con su token y no pierde
// por abandono; sin token (o con otro) no puede quedarse con la plaza de otro.
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
const TOKEN = 'token-del-mando-uno-1234567890';

before(async () => {
  app = createApp({ dbPath: ':memory:', maxPlayers: 2, gameConfig: { fillBots: false, introS: 0, joinWindowS: 0, countdownS: 0.2, matchSeconds: 30, resultsS: 0.6, reconnectGraceS: 1.5, powerupFirstSpawnS: 50 } });
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

test('un mando que vuelve con su token recupera su plaza y la partida sigue; con otro token no entra', async () => {
  const host = newClient();
  const [p1, p2] = [newClient(), newClient()];
  await Promise.all([connected(host), connected(p1), connected(p2)]);
  host.emit(EVENTS.HOST_JOIN);
  p1.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'ONE', token: TOKEN });
  p2.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'TWO', token: 'token-del-mando-dos-1234567890' });
  await waitFor(p2, EVENTS.SLOT_ASSIGNED);
  p1.emit(EVENTS.PLAYER_READY);
  p2.emit(EVENTS.PLAYER_READY);
  while (app.session.phase !== 'PLAYING') await sleep(20);

  p1.disconnect(); // corte de red
  await sleep(300);
  const back = newClient();
  await connected(back);
  const intruder = newClient();
  await connected(intruder);
  intruder.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'EVL', token: 'token-de-un-intruso-1234567890' });
  assert.equal((await waitFor(intruder, EVENTS.ROOM_FULL)) !== undefined, true, 'otro token no recupera la plaza');

  back.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'ONE', token: TOKEN });
  const assigned = await waitFor(back, EVENTS.SLOT_ASSIGNED);
  assert.equal(assigned.slot, 1);

  await sleep(2000); // más que la gracia (1,5 s): si no se hubiera cancelado, ya habría perdido por abandono
  assert.equal(app.session.phase, 'PLAYING', 'la partida sigue');
  back.emit(EVENTS.PAD_MOVE, { x: 1, y: 0 });
  await sleep(300);
  assert.ok(app.session.match.tanks[0].moveX > 0, 'los controles del mando recuperado funcionan');
});
