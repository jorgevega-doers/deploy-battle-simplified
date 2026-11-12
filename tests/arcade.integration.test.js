// La cola común SIN LISTO. Una sola persona pulsa JUGAR y corre una cuenta atrás (10 s en producción; aquí
// 1,5 s); al llegar a 0 empieza la partida con quien haya. Se puede cancelar (con límite), si entra alguien se reinicia, y tras la partida nadie
// arranca solo. Incluye casuísticas de robustez: dobles clics, trolls que cancelan sin fin, salidas y desconexiones durante la cuenta atrás,
// sala llena, spam de eventos y el easter egg TNI. "/" sirve la pantalla del juego.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { EVENTS } from '../shared/events.js';

let app;
let base;
const sockets = [];

before(async () => {
  app = createApp({ devPassword: 'x', roomsPerWindow: 100, connectionsPerMinute: 1000,
    gameConfig: { countdownS: 0.2, introS: 0, joinWindowS: 1.5, soloJoinWindowS: 1.5, maxCancels: 3, cancelGuardS: 0.15,
      lobbyGraceS: 0.3, matchSeconds: 0.8, resultsS: 0.3 } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  base = `http://localhost:${app.server.address().port}`;
  app.startLoop();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  app.stopLoop();
  await new Promise((resolve) => app.io.close(resolve));
});
// Salas vacías en cada prueba (la cola manda a la sala más llena y no queremos arrastrar jugadores de la anterior).
beforeEach(async () => {
  sockets.forEach((s) => s.disconnect()); sockets.length = 0;
  app.rooms.all().forEach((r) => app.rooms.destroy(r.code));
  await sleep(80);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(30); } return false; };
const quick = async () => (await fetch(`${base}/api/quick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
function client(code) {
  const s = connect(`${base}/r/${code}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.on(EVENTS.LOBBY_STATE, (st) => { s.lastLobby = st; });
  s.on(EVENTS.STATE_UPDATE, (st) => { s.lastState = st; });
  sockets.push(s);
  return s;
}
const connected = (s) => (s.connected ? Promise.resolve() : waitFor(s, 'connect'));
async function player(code, initials) {
  const screen = client(code);
  await connected(screen);
  screen.emit(EVENTS.HOST_JOIN, { screen: `pantalla-${initials}` });
  const pad = client(code);
  await connected(pad);
  pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, keyboard: true, screen: `pantalla-${initials}`, token: `token-${initials}-xxxxxxxxxxxx` });
  await waitFor(pad, EVENTS.SLOT_ASSIGNED);
  return { screen, pad };
}
const state = (p) => p.screen.lastLobby?.state;
const counting = (p) => p.screen.lastLobby?.joinLeft != null;

test('"/" sirve la pantalla del juego (título y partida en la misma página)', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /id="title"/);
});

test('con 2 jugadores no arranca sola; basta que UNO pulse JUGAR: cuenta atrás y la partida empieza con los dos sin que el otro haga nada', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const b = await player(code, 'BBB');
  await sleep(500);
  assert.equal(state(a), 'LOBBY');
  assert.equal(a.screen.lastLobby.joinLeft, null, 'sin cuenta atrás hasta que alguien pulsa JUGAR');

  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => counting(b)), 'la cuenta atrás corre para todos');
  assert.ok(await until(() => state(b) === 'PLAYING'), 'empieza la partida sin que B pulse nada');
  assert.equal(b.screen.lastLobby.plan.humans, 2);
  assert.equal(b.screen.lastLobby.plan.kind, 'duel');
});

test('tras la partida vuelven a la sala y NADIE arranca solo: hace falta volver a pulsar JUGAR (revancha)', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const b = await player(code, 'BBB');
  b.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => state(a) === 'PLAYING'));
  assert.ok(await until(() => state(a) === 'LOBBY', 8000), 'vuelve a la sala de espera');
  await sleep(2000); // más que la cuenta atrás: si arrancara sola, ya estaría en marcha
  assert.equal(state(a), 'LOBBY');
  assert.equal(a.screen.lastLobby.joinLeft, null);
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => state(b) === 'PLAYING'), 'la revancha empieza al pulsar JUGAR otra vez');
});

test('cualquiera puede cancelar; el doble clic no cancela; un troll solo puede cancelar 3 veces por sala de espera', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const troll = await player(code, 'BBB');
  a.pad.emit(EVENTS.PLAYER_READY);
  a.pad.emit(EVENTS.PLAYER_READY); // doble clic: el segundo no debe cancelar la cuenta atrás que acaba de empezar
  await sleep(60);
  assert.ok(counting(a), 'el doble clic no cancela');
  for (let i = 0; i < 3; i += 1) {
    await sleep(300);
    troll.pad.emit(EVENTS.PLAYER_READY); // CANCELAR
    assert.ok(await until(() => !counting(a)), `cancelación ${i + 1}`);
    a.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => counting(a)), 'A la vuelve a lanzar');
  }
  await sleep(300);
  troll.pad.emit(EVENTS.PLAYER_READY); // la 4.ª no vale
  await sleep(200);
  assert.ok(counting(a), 'el troll ya no puede cancelar');
  assert.equal(a.screen.lastLobby.cancelsLeft[1], 0);
  assert.ok(await until(() => state(a) === 'PLAYING'), 'la partida acaba empezando');
});

test('solo en la sala: JUGAR CON BOTS = partida contra 3 bots; salir de la sala libera el hueco al momento', async () => {
  const { code } = await quick();
  const a = await player(code, 'CCC');
  const b = await player(code, 'DDD');
  b.pad.emit(EVENTS.PLAYER_QUIT); // SALIR en la sala de espera
  assert.ok(await until(() => a.screen.lastLobby.plan?.humans === 1), 'el que sale deja su hueco enseguida');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => state(a) === 'PLAYING'));
  assert.equal(a.screen.lastLobby.plan.kind, 'solo');
});

test('si entra alguien durante la cuenta atrás se reinicia y se añade a la partida', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  a.pad.emit(EVENTS.PLAYER_READY); // solo: cuenta atrás contra bots
  assert.ok(await until(() => counting(a)));
  await sleep(800);
  const before = a.screen.lastLobby.joinLeft;
  assert.ok(before <= 1, `la cuenta atrás avanza (${before})`);
  const c = await player(code, 'CCC');
  assert.ok(await until(() => a.screen.lastLobby.joinLeft === 2), 'vuelve a empezar desde el principio');
  assert.ok(counting(c), 'el recién llegado también la ve');
  assert.ok(await until(() => state(a) === 'PLAYING'));
  assert.equal(a.screen.lastLobby.plan.humans, 2, 'el que entró juega');
});

test('si alguien se va durante la cuenta atrás, sigue; si se van todos, se cancela', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const b = await player(code, 'BBB');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => counting(a)));
  b.pad.emit(EVENTS.PLAYER_QUIT);
  assert.ok(await until(() => a.screen.lastLobby.plan?.humans === 1));
  assert.ok(counting(a), 'la cuenta atrás sigue');
  a.pad.emit(EVENTS.PLAYER_QUIT);
  assert.ok(await until(() => a.screen.lastLobby.joinLeft == null && (a.screen.lastLobby.plan?.humans ?? 0) === 0), 'sin nadie no hay cuenta atrás');
  await sleep(1800);
  assert.equal(state(a), 'LOBBY', 'y no empieza ninguna partida vacía');
});

test('un corte de red de otro jugador durante la cuenta atrás: pasada la gracia deja el hueco y la partida sigue con quien queda', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const b = await player(code, 'BBB');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => counting(a)));
  b.pad.io.engine.close(); // sin PLAYER_QUIT ni despedirse: como un cable arrancado
  assert.ok(await until(() => a.screen.lastLobby.plan?.humans === 1, 3000), 'tras la gracia se libera su hueco');
  assert.ok(await until(() => state(a) === 'PLAYING'));
  assert.equal(a.screen.lastLobby.plan.kind, 'solo');
});

test('sala llena (4): el 5.º jugador va a otra sala distinta', async () => {
  const first = await Promise.all([quick(), quick(), quick(), quick()]);
  assert.equal(new Set(first.map((r) => r.code)).size, 1, 'los cuatro primeros caen en la misma sala');
  for (const [i, name] of ['AAA', 'BBB', 'CCC', 'DDD'].entries()) await player(first[i].code, name);
  const fifth = await quick();
  assert.notEqual(fifth.code, first[0].code, 'la sala llena no admite a nadie más');
});

test('spam de JUGAR/CANCELAR y JUGAR en plena partida no rompen nada', async () => {
  const { code } = await quick();
  const a = await player(code, 'AAA');
  const b = await player(code, 'BBB');
  for (let i = 0; i < 60; i += 1) (i % 2 ? a : b).pad.emit(EVENTS.PLAYER_READY);
  await sleep(300);
  assert.ok(a.screen.lastLobby.cancelsLeft.every((n) => n >= 0 && n <= 3), 'el límite de cancelaciones se respeta');
  if (state(a) !== 'PLAYING' && !counting(a)) a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => state(a) === 'PLAYING'), 'la partida empieza igualmente');
  a.pad.emit(EVENTS.PLAYER_READY); b.pad.emit(EVENTS.PLAYER_READY); // en partida no hacen nada
  await sleep(200);
  assert.ok(['PLAYING', 'GAME_OVER', 'LOBBY'].includes(state(a)));
});

test('easter egg TNI: quien se llama TNI lleva 6 vidas (los demás, 5)', async () => {
  const { code } = await quick();
  const a = await player(code, 'TNI');
  const b = await player(code, 'BBB');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => state(b) === 'PLAYING'));
  assert.ok(await until(() => a.screen.lastState?.tanks?.length >= 2));
  const lives = a.screen.lastState.tanks.map((t) => t[3]);
  assert.equal(lives[0], 6, 'TNI: tanque chetado');
  assert.equal(lives[1], 5, 'el resto: 5 vidas');
});
