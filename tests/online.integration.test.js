// Versión pública (6-nov, rama public): salas sin contraseña, pantalla anfitriona, /db-admin/ para el modo desarrollador, revancha sin salir de la
// sala, marcador de victorias, vínculo móvil-pantalla y restauración de salas. Arranca el servidor de verdad en un puerto libre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/net/auth.js';
import { openGlobalRanking } from '../server/db/globalRanking.js';
import { EVENTS } from '../shared/events.js';

const DEV_PASSWORD = 'clave-dev-prueba';
let app;
let base;
const sockets = [];

before(async () => {
  const ranking = await openGlobalRanking({ url: ':memory:' });
  app = createApp({
    dbPath: ':memory:', online: true, devPassword: DEV_PASSWORD, roomsPerWindow: 100, connectionsPerMinute: 1000, roomIdleMs: 30, ranking,
    gameConfig: { countdownS: 0.3, introS: 0, joinWindowS: 0, publicJoinWindowS: 0, publicSoloJoinWindowS: 0, matchSeconds: 1.2, resultsS: 0.3, hostPromoteMs: 150 },
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  base = `http://localhost:${app.server.address().port}`;
  app.startLoop();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  app.stopLoop();
  await new Promise((resolve) => app.io.close(resolve));
  await app.board.close();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
// Espera un lobby_state que cumpla la condición (también vale el último que ya llegó: así no hay carreras).
const lobbyWhere = (socket, check, ms = 5000) => new Promise((resolve, reject) => {
  if (socket.lastLobby && check(socket.lastLobby)) { resolve(socket.lastLobby); return; }
  const timer = setTimeout(() => { socket.off(EVENTS.LOBBY_STATE, on); reject(new Error('timeout esperando el lobby')); }, ms);
  const on = (s) => { if (check(s)) { clearTimeout(timer); socket.off(EVENTS.LOBBY_STATE, on); resolve(s); } };
  socket.on(EVENTS.LOBBY_STATE, on);
});
async function login(password = DEV_PASSWORD) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}
async function createRoom(type = 'online', cookie = '') {
  const res = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ type }) });
  return { res, body: await res.json() };
}
function client(code, { cookie, origin, auth } = {}) {
  const extraHeaders = {};
  if (cookie) extraHeaders.cookie = cookie;
  if (origin) extraHeaders.origin = origin;
  const socket = connect(`${base}/r/${code}`, { transports: ['websocket'], forceNew: true, extraHeaders, reconnection: false, ...(auth ? { auth } : {}) });
  socket.on(EVENTS.LOBBY_STATE, (s) => { socket.lastLobby = s; });
  sockets.push(socket);
  return socket;
}
const connected = (s) => (s.connected ? Promise.resolve() : waitFor(s, 'connect'));
// Una pantalla de la sala, ya registrada (con su id de pantalla y, si la tiene, la llave de anfitriona).
async function screen(code, { screenId, hostKey, cookie } = {}) {
  const s = client(code, { cookie });
  await connected(s);
  const first = waitFor(s, EVENTS.LOBBY_STATE);
  s.emit(EVENTS.HOST_JOIN, { screen: screenId, hostKey });
  await first;
  return s;
}
const freeAll = async () => { sockets.forEach((s) => s.disconnect()); sockets.length = 0; app.rooms.all().forEach((r) => app.rooms.destroy(r.code)); await sleep(100); };

test('sin contraseña: el inicio, la pantalla y la API de salas están abiertos; /login/ lleva a /db-admin/', async () => {
  assert.equal((await fetch(`${base}/host/`, { redirect: 'manual' })).status, 200);
  assert.equal((await fetch(`${base}/play/`)).status, 200);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const old = await fetch(`${base}/login/`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/db-admin/');
  const { res, body } = await createRoom();
  assert.equal(res.status, 201);
  assert.match(body.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.match(body.hostKey, /^[A-Za-z0-9_-]{20,}$/, 'quien crea la sala recibe la llave de anfitriona');
  assert.equal((await fetch(`${base}/api/rooms/${body.code}`)).status, 200);
  assert.equal((await fetch(`${base}/api/rooms/ZZZZZ`)).status, 404);
  assert.equal((await createRoom('rara')).res.status, 400);
  const mode = await (await fetch(`${base}/api/mode`)).json();
  assert.deepEqual([mode.online, mode.public, mode.dev], [true, true, false]);
});

test('las respuestas llevan cabeceras de seguridad (CSP, sin frames, sin adivinar tipos)', async () => {
  const res = await fetch(`${base}/play/`);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('/db-admin/: la contraseña de desarrollo da el rol dev; una mala no, y tras muchos fallos se bloquea', async () => {
  const bad = await login('mala');
  assert.equal(bad.res.status, 401);
  assert.equal(bad.cookie, '');
  const dev = await login();
  assert.equal(dev.res.status, 200);
  assert.match(dev.res.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(app.auth.roleOf({ cookie: dev.cookie }), 'dev');
  assert.equal((await (await fetch(`${base}/api/mode`, { headers: { cookie: dev.cookie } })).json()).dev, true);
  const [expires, , signature] = dev.cookie.split('=')[1].split('.');
  assert.equal(app.auth.roleOf({ cookie: `df_auth=${expires}.user.${signature}` }), null, 'cambiar el rol a mano invalida la firma');
  for (let i = 0; i < 9; i++) await login('otra-mala');
  assert.equal((await login()).res.status, 429, 'bloqueada incluso con la buena hasta que pase el tiempo');
  for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) app.auth.clearFails(ip);
  let t = 1_000_000_000_000; // la cookie caduca a las 12 h
  const clock = createAuth({ devPassword: 'x', secret: 's', now: () => t });
  const token = clock.issueToken('dev');
  assert.equal(clock.verifyToken(token), true);
  t += 13 * 3600 * 1000;
  assert.equal(clock.verifyToken(token), false);
});

test('anfitriona: solo la pantalla con la llave elige mapa y dificultad y puede reiniciar; si se va, otra pasa a serlo', async () => {
  await freeAll();
  const { body: { code, hostKey } } = await createRoom('online');
  const guest = await screen(code, { screenId: 'pantalla-invitada' }); // llega antes, sin llave: no es la anfitriona
  const owner = await screen(code, { screenId: 'pantalla-anfitriona', hostKey });
  const s0 = await lobbyWhere(guest, (s) => s.room.hostScreen === 'pantalla-anfitriona');
  assert.equal(s0.room.screens, 2);
  assert.equal(s0.difficulty, 'media', 'la versión pública empieza en MEDIA');
  guest.emit(EVENTS.MAP_SELECT, { choice: 2 });
  guest.emit(EVENTS.DIFFICULTY_SET, { level: 'pro' });
  await sleep(150);
  assert.equal(app.rooms.get(code).session.mapChoice, 'random', 'la invitada no cambia el mapa');
  assert.equal(app.rooms.get(code).session.difficulty, 'media', 'ni la dificultad');
  owner.emit(EVENTS.MAP_SELECT, { choice: 1 });
  owner.emit(EVENTS.DIFFICULTY_SET, { level: 'stand' });
  const s1 = await lobbyWhere(guest, (s) => s.mapChoice === 1 && s.difficulty === 'stand');
  assert.equal(s1.map, 1);
  // La anfitriona se va: pasado el margen, la invitada recibe una llave nueva y lo es.
  const key = waitFor(guest, EVENTS.HOST_KEY);
  owner.disconnect();
  const { hostKey: newKey } = await key;
  assert.notEqual(newKey, hostKey);
  await lobbyWhere(guest, (s) => s.room.hostScreen === 'pantalla-invitada');
  guest.emit(EVENTS.MAP_SELECT, { choice: 0 });
  await lobbyWhere(guest, (s) => s.mapChoice === 0);
  // La llave antigua ya no vale.
  const late = await screen(code, { screenId: 'pantalla-vieja', hostKey });
  late.emit(EVENTS.MAP_SELECT, { choice: 2 });
  await sleep(150);
  assert.equal(app.rooms.get(code).session.mapChoice, 0);
});

test('el móvil entra sin email, queda vinculado a su pantalla y se sabe si es móvil o mando', async () => {
  await freeAll();
  const { body: { code, hostKey } } = await createRoom('online');
  const host = await screen(code, { screenId: 'tele-salon', hostKey });
  const phone = client(code);
  await connected(phone);
  phone.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'AAA', screen: 'tele-salon' });
  assert.equal((await waitFor(phone, EVENTS.SLOT_ASSIGNED)).slot, 1, 'sin email ni consentimiento');
  const pad = client(code);
  await connected(pad);
  pad.emit(EVENTS.JOIN_ROOM, { role: 'player', gamepad: true, name: 'MANDO1', screen: 'tele-salon' });
  await waitFor(pad, EVENTS.SLOT_ASSIGNED);
  const s = await lobbyWhere(host, (st) => st.devices?.[1] === 'pad');
  assert.deepEqual(s.devices.slice(0, 2), ['phone', 'pad']);
  assert.deepEqual(s.screens.slice(0, 2), ['tele-salon', 'tele-salon']);
  assert.equal(s.requireEmail, false);
});

test('revancha: al acabar, los jugadores siguen en la sala (sin redirigir a /end) y el marcador suma la victoria', async () => {
  await freeAll();
  const { body: { code, hostKey } } = await createRoom('local');
  const host = await screen(code, { screenId: 'pantalla-unica', hostKey });
  const phones = [client(code), client(code)];
  await Promise.all(phones.map(connected));
  for (const [i, p] of phones.entries()) { p.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: ['AAA', 'BBB'][i] }); await waitFor(p, EVENTS.SLOT_ASSIGNED); }
  let redirected = false;
  phones.forEach((p) => p.on(EVENTS.REDIRECT, () => { redirected = true; }));
  phones.forEach((p) => p.emit(EVENTS.PLAYER_READY));
  await lobbyWhere(host, (s) => s.state === 'PLAYING');
  // Partida de 1,2 s sin disparos: acaba por tiempo (empate) y vuelve al lobby con los dos dentro.
  const back = await lobbyWhere(host, (s) => s.state === 'LOBBY' && s.plan?.humans === 2, 8000);
  assert.deepEqual(back.initials.slice(0, 2), ['AAA', 'BBB']);
  assert.deepEqual(back.ready.slice(0, 2), [false, false], 'hay que volver a pulsar LISTO');
  assert.equal(redirected, false, 'los mandos no se van a /end');
  // Se puede jugar otra (revancha).
  phones.forEach((p) => p.emit(EVENTS.PLAYER_READY));
  await lobbyWhere(host, (s) => s.state === 'PLAYING');
});

test('marcador de la sala: suma las victorias de los jugadores (no las de los bots)', async () => {
  const { createPublicRoom } = await import('../server/net/publicRoom.js');
  const room = { hostKey: null, hostScreen: null };
  const pr = createPublicRoom({ room, ns: { sockets: new Map() }, changed: () => {} });
  pr.recordResult({ winners: [2], scores: [{ initials: 'AAA' }, { initials: 'BBB' }] });
  pr.recordResult({ winners: [2], scores: [{ initials: 'AAA' }, { initials: 'BBB' }] });
  pr.recordResult({ winners: [1], scores: [{ initials: 'AAA' }, { initials: 'BBB' }] });
  pr.recordResult({ winners: [3], scores: [{ initials: 'AAA' }, {}, { initials: 'VEX', bot: true }] });
  assert.deepEqual(pr.info().wins, [{ name: 'BBB', wins: 2 }, { name: 'AAA', wins: 1 }]);
  pr.reset();
  assert.deepEqual(pr.info().wins, []);
});

test('las salas están aisladas y un origen ajeno o el espacio principal se rechazan', async () => {
  await freeAll();
  const { body: one } = await createRoom();
  const { body: two } = await createRoom();
  await screen(one.code, { hostKey: one.hostKey });
  const hostTwo = await screen(two.code, { hostKey: two.hostKey });
  const seenInTwo = [];
  hostTwo.on(EVENTS.LOBBY_STATE, (s) => seenInTwo.push(s));
  const phone = client(one.code);
  await connected(phone);
  phone.emit(EVENTS.JOIN_ROOM, { role: 'player', initials: 'ZZZ' });
  await waitFor(phone, EVENTS.SLOT_ASSIGNED);
  await sleep(200);
  assert.equal(seenInTwo.filter((s) => s.initials.includes('ZZZ')).length, 0);
  const root = connect(base, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(root);
  assert.equal((await new Promise((resolve) => { root.on('connect_error', resolve); })).message, 'room_required');
  const evil = client(one.code, { origin: 'https://sitio-malicioso.example' });
  assert.equal((await new Promise((resolve) => { evil.on('connect_error', resolve); })).message, 'bad_origin');
});

test('los eventos de pruebas solo funcionan en modo desarrollador', async () => {
  await freeAll();
  const run = async (cookie) => {
    const { body: { code, hostKey } } = await createRoom('local', cookie);
    const host = await screen(code, { hostKey, cookie });
    const seen = [];
    host.on(EVENTS.LOBBY_STATE, (st) => seen.push(st));
    host.emit(EVENTS.ATTRACT_SET, { on: true });
    await sleep(250);
    return seen;
  };
  assert.equal((await run('')).some((st) => st.attractOn), false, 'un jugador normal no');
  assert.equal((await run((await login()).cookie)).some((st) => st.attractOn), true, 'el modo dev sí');
});

test('restauración: tras un reinicio, una pantalla recupera su sala con el mismo código (y su llave); un móvil no la resucita', async () => {
  await freeAll();
  const { body: { code, hostKey } } = await createRoom('online');
  app.rooms.destroy(code); // el servidor "se reinicia"
  const phone = client(code); // un móvil no manda el tipo de sala
  assert.equal((await new Promise((resolve) => { phone.on('connect_error', resolve); })).message, 'Invalid namespace');
  assert.equal(app.io._nsps.has('/r/' + code), false, 'no queda un espacio fantasma');
  const host = client(code, { auth: { type: 'online', hostKey } });
  assert.equal((await new Promise((resolve) => { host.on('connect_error', resolve); })).message, 'room_restored');
  assert.equal(app.rooms.get(code)?.hostKey, hostKey, 'conserva la llave de la anfitriona');
  const again = await screen(code, { screenId: 'la-de-siempre', hostKey });
  assert.equal((await lobbyWhere(again, (s) => s.room.hostScreen === 'la-de-siempre')).room.code, code);
});

test('una sala sin nadie se borra sola y hay un tope de salas abiertas', async () => {
  await freeAll();
  const { body: { code } } = await createRoom();
  const s = client(code);
  await connected(s);
  app.rooms.sweep();
  assert.ok(app.rooms.get(code));
  s.disconnect();
  await sleep(60);
  app.rooms.sweep();
  await sleep(60);
  app.rooms.sweep();
  assert.equal(app.rooms.get(code), null);
  let refused = null;
  for (let i = 0; i < 40 && !refused; i++) { const { res } = await createRoom(); if (res.status !== 201) refused = res.status; }
  assert.ok([429, 503].includes(refused), `se rechazó con ${refused}`);
});
