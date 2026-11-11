// Partida rápida de la versión pública (10-nov): cola común (BUSCAR PARTIDA), sala privada contra los bots, sin anfitrión, relevo del teclado al
// móvil con el mismo token y cuentas atrás públicas (10 s; 5 s contra los bots).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { openGlobalRanking } from '../server/db/globalRanking.js';
import { createSession } from '../server/game/session.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';
import { EVENTS } from '../shared/events.js';

let app;
let base;
const sockets = [];

before(async () => {
  const ranking = await openGlobalRanking({ url: ':memory:' });
  app = createApp({ dbPath: ':memory:', online: true, devPassword: 'x', roomsPerWindow: 100, connectionsPerMinute: 1000, ranking,
    gameConfig: { countdownS: 0.3, introS: 0, joinWindowS: 0, publicJoinWindowS: 30, publicSoloJoinWindowS: 30, publicAutoStartS: 40, publicFullStartS: 3, matchSeconds: 2 } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  base = `http://localhost:${app.server.address().port}`;
  app.startLoop();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  app.stopLoop();
  await new Promise((resolve) => app.io.close(resolve));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const quick = async (body = {}) => (await fetch(`${base}/api/quick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
function client(code) {
  const s = connect(`${base}/r/${code}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.on(EVENTS.LOBBY_STATE, (st) => { s.lastLobby = st; });
  sockets.push(s);
  return s;
}
const connected = (s) => (s.connected ? Promise.resolve() : waitFor(s, 'connect'));
// Un jugador de partida rápida: su pantalla y su teclado (dos conexiones, como en el navegador).
async function keyboardPlayer(code, initials, token) {
  const screen = client(code);
  await connected(screen);
  screen.emit(EVENTS.HOST_JOIN, { screen: `pantalla-${initials}` });
  const pad = client(code);
  await connected(pad);
  pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, keyboard: true, screen: `pantalla-${initials}`, token });
  const slot = await waitFor(pad, EVENTS.SLOT_ASSIGNED);
  return { screen, pad, slot };
}
const freeAll = async () => { sockets.forEach((s) => s.disconnect()); sockets.length = 0; app.rooms.all().forEach((r) => app.rooms.destroy(r.code)); await sleep(80); };

test('BUSCAR PARTIDA: el primero crea la sala y los siguientes entran en ella; con 4 dentro se abre otra', async () => {
  await freeAll();
  const first = await quick();
  assert.equal(first.type, 'quick');
  const second = await quick();
  assert.equal(second.code, first.code, 'el segundo entra en la sala del primero (aunque aún no haya abierto su pantalla)');
  await keyboardPlayer(first.code, 'AAA', 'token-aaa-xxxxxxxxxx');
  await keyboardPlayer(first.code, 'BBB', 'token-bbb-xxxxxxxxxx');
  assert.equal((await quick()).code, first.code);
  assert.equal((await quick()).code, first.code);
  await keyboardPlayer(first.code, 'CCC', 'token-ccc-xxxxxxxxxx');
  await keyboardPlayer(first.code, 'DDD', 'token-ddd-xxxxxxxxxx');
  const fifth = await quick();
  assert.notEqual(fifth.code, first.code, 'con 4 dentro, la siguiente búsqueda abre otra sala');
});

test('EN SOLITARIO: la sala contra los bots es privada (la cola común nunca manda a nadie allí)', async () => {
  await freeAll();
  const solo = await quick({ solo: true });
  assert.equal(solo.solo, true);
  await keyboardPlayer(solo.code, 'SOL', 'token-sol-xxxxxxxxxx');
  const other = await quick();
  assert.notEqual(other.code, solo.code);
  assert.equal((await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'quick' }) })).status, 400, 'las rápidas solo se crean por la cola');
});

test('partida pública: el anfitrión es quien llegó primero (elige mapa y dificultad; no reinicia); si se va, pasa al siguiente; cuenta atrás pública', async () => {
  await freeAll();
  const { code } = await quick();
  const room = app.rooms.get(code);
  assert.equal(room.session.mapChoice, 'random', 'por defecto, mapa aleatorio');
  assert.equal(room.session.difficulty, 'media', 'por defecto, MEDIA');
  const a = await keyboardPlayer(code, 'AAA', 'token-aaa-yyyyyyyyyy');
  const b = await keyboardPlayer(code, 'BBB', 'token-bbb-yyyyyyyyyy');
  await sleep(150);
  assert.equal(a.screen.lastLobby.room.hostScreen, 'pantalla-AAA', 'la primera pantalla en llegar es la anfitriona');
  b.screen.emit(EVENTS.MAP_SELECT, { choice: 1 }); // el segundo no puede elegir
  a.screen.emit(EVENTS.MAP_SELECT, { choice: 2 });
  a.screen.emit(EVENTS.DIFFICULTY_SET, { level: 'pro' });
  await sleep(150);
  assert.equal(room.session.mapChoice, 2);
  assert.equal(room.session.difficulty, 'pro');
  a.screen.emit(EVENTS.HARD_RESET); // entre desconocidos, el anfitrión no puede echar a todos
  await sleep(150);
  assert.equal(room.session.plan?.humans, 2, 'el reinicio no se aplica en la partida pública');
  assert.equal(a.screen.lastLobby.devices[0], 'keyboard');
  assert.equal(room.session.joinLeft, 40, 'con 2 jugadores arranca sola la cuenta atrás pública (aquí 40 s)');
  a.screen.disconnect(); // se va la anfitriona: a los 3 s lo es la pantalla más antigua que queda
  await sleep(3300);
  assert.equal(b.screen.lastLobby.room.hostScreen, 'pantalla-BBB');
});

test('el móvil toma el relevo del teclado con el mismo token: misma plaza y mismas iniciales, y el teclado se desconecta', async () => {
  await freeAll();
  const { code } = await quick();
  const token = 'token-relevo-zzzzzzzz';
  const a = await keyboardPlayer(code, 'JOR', token);
  const kicked = waitFor(a.pad, 'disconnect');
  const phone = client(code);
  await connected(phone);
  phone.emit(EVENTS.JOIN_ROOM, { role: 'player', token, screen: 'pantalla-JOR' }); // el QR lleva el token: no hace falta escribir nada
  const assigned = await waitFor(phone, EVENTS.SLOT_ASSIGNED);
  assert.deepEqual([assigned.slot, assigned.initials], [1, 'JOR']);
  assert.equal(await kicked, 'io server disconnect');
  await sleep(100);
  assert.equal(a.screen.lastLobby.devices[0], 'phone');
  // Y el teclado lo recupera si vuelve con el mismo token.
  const back = client(code);
  await connected(back);
  back.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'JOR', keyboard: true, token });
  assert.equal((await waitFor(back, EVENTS.SLOT_ASSIGNED)).slot, 1);
  await sleep(100);
  assert.equal(a.screen.lastLobby.devices[0], 'keyboard');
});

test('cuenta atrás pública: 10 s con varios jugadores y 5 s contra los bots (el stand no la usa)', () => {
  const arena = createArena(0);
  const cfg = { ...config.game, joinWindowS: 10, soloJoinWindowS: 5 };
  const session = createSession({ arena, cfg, out: { phase() {}, countdown() {}, state() {}, events() {}, gameOver() {}, redirect() {}, finished() {} } });
  session.setPlayers(['AAA']);
  session.setReady(1);
  assert.equal(session.joinLeft, 5, 'solo contra los bots');
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(2);
  assert.equal(session.joinLeft, 10, 'con dos jugadores');
  const stand = createSession({ arena, cfg: config.game, out: { phase() {}, countdown() {}, state() {}, events() {}, gameOver() {}, redirect() {}, finished() {} } });
  stand.setPlayers(['AAA']);
  stand.setReady(1);
  assert.equal(stand.joinLeft, config.game.joinWindowS);
});

test('SALA PRIVADA online: fuera de la cola, con código y anfitriona (elige mapa); se entra con su código', async () => {
  await freeAll();
  const priv = await quick({ private: true });
  assert.equal(priv.private, true);
  assert.match(priv.hostKey, /^[A-Za-z0-9_-]{20,}$/);
  const owner = client(priv.code);
  await connected(owner);
  owner.emit(EVENTS.HOST_JOIN, { screen: 'pantalla-duena', hostKey: priv.hostKey });
  await sleep(100);
  assert.notEqual((await quick()).code, priv.code, 'BUSCAR PARTIDA nunca manda a nadie a una sala privada');
  owner.emit(EVENTS.MAP_SELECT, { choice: 2 });
  await sleep(120);
  assert.equal(app.rooms.get(priv.code).session.mapChoice, 2, 'la anfitriona de la sala privada elige el mapa');
  const info = await (await fetch(`${base}/api/rooms/${priv.code}`)).json();
  assert.deepEqual([info.type, info.private, info.open], ['quick', true, true]);
});

test('partida pública: con 2 jugadores arranca sola (sin LISTO), vuelve a empezar si entra alguien y con 4 se acorta', async () => {
  await freeAll();
  const { code } = await quick();
  await keyboardPlayer(code, 'AAA', 'token-auto-a-xxxxxxxx');
  const room = app.rooms.get(code);
  assert.equal(room.session.joinLeft, null, 'solo: no corre nada (puede jugar contra los bots)');
  await keyboardPlayer(code, 'BBB', 'token-auto-b-xxxxxxxx');
  await sleep(1300);
  const after2 = room.session.joinLeft;
  assert.ok(after2 > 30 && after2 < 40, `con 2, cuenta atrás de 40 s sin LISTO (va por ${after2})`); // margen: con todos los tests a la vez el reloj va cargado
  await keyboardPlayer(code, 'CCC', 'token-auto-c-xxxxxxxx');
  await sleep(100);
  assert.equal(room.session.joinLeft, 40, 'entra alguien: vuelve a empezar');
  await keyboardPlayer(code, 'DDD', 'token-auto-d-xxxxxxxx');
  await sleep(100);
  assert.ok(room.session.joinLeft <= 3, 'sala llena: se acorta');
  assert.equal(room.session.plan.kind, 'brawl');
});

test('cambiar el nombre en la sala de espera: solo el propio jugador, 3 letras válidas', async () => {
  await freeAll();
  const { code } = await quick({ solo: true });
  const a = await keyboardPlayer(code, 'KAZ', 'token-nombre-xxxxxxxx');
  a.pad.emit(EVENTS.PLAYER_RENAME, { initials: 'jor' });
  assert.deepEqual(await waitFor(a.pad, EVENTS.SLOT_ASSIGNED), { slot: 1, initials: 'JOR' });
  await sleep(80);
  assert.equal(a.screen.lastLobby.initials[0], 'JOR');
  a.pad.emit(EVENTS.PLAYER_RENAME, { initials: 'KKK' }); // lista de bloqueo
  assert.equal((await waitFor(a.pad, EVENTS.ERROR_MSG)).code, 'invalid_initials');
  a.screen.emit(EVENTS.PLAYER_RENAME, { initials: 'XYZ' }); // una pantalla sin plaza no cambia nada
  await sleep(120);
  assert.equal(app.rooms.get(code).slots.initials()[0], 'JOR');
});

test('un mando entra en la pantalla compartida con un nombre de 3 letras (al azar en el cliente)', async () => {
  await freeAll();
  const res = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'local' }) });
  const { code } = await res.json();
  const pad = client(code);
  await connected(pad);
  pad.emit(EVENTS.JOIN_ROOM, { role: 'player', gamepad: true, name: 'ZOK' });
  assert.equal((await waitFor(pad, EVENTS.SLOT_ASSIGNED)).initials, 'ZOK');
});
