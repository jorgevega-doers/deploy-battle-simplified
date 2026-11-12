// Servidor de verdad en un puerto libre: páginas y direcciones, cabeceras de seguridad, /db-admin/ (modo desarrollador) y los eventos del menú de
// pruebas, que solo valen en modo dev. Las reglas de la sala y la robustez están en tests/arcade.*.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/net/auth.js';
import { EVENTS } from '../shared/events.js';

const DEV_PASSWORD = 'clave-dev-prueba';
let app;
let base;
const sockets = [];

before(async () => {
  app = createApp({
    devPassword: DEV_PASSWORD, roomsPerWindow: 100, connectionsPerMinute: 1000,
    gameConfig: { countdownS: 0.2, introS: 0, joinWindowS: 0.3, soloJoinWindowS: 0.3, matchSeconds: 30, resultsS: 0.3 },
  });
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
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(25); } return Boolean(fn()); };
const waitFor = (socket, event, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
async function login(password = DEV_PASSWORD) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}
const quick = async (cookie = '') => (await fetch(`${base}/api/quick`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: '{}' })).json();
function client(code, cookie = '') {
  const socket = connect(`${base}/r/${code}`, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: cookie ? { cookie } : {} });
  socket.on(EVENTS.LOBBY_STATE, (s) => { socket.lastLobby = s; });
  sockets.push(socket);
  return socket;
}
// Un jugador como el del navegador: su pantalla (con la cookie, si es dev) y su teclado.
async function player(code, initials, cookie = '') {
  const screen = client(code, cookie);
  await waitFor(screen, 'connect');
  screen.emit(EVENTS.HOST_JOIN, {});
  const pad = client(code, cookie);
  await waitFor(pad, 'connect');
  pad.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, keyboard: true, token: `token-${initials}-${Math.random().toString(36).slice(2, 12)}` });
  await waitFor(pad, EVENTS.SLOT_ASSIGNED);
  return { screen, pad };
}
const freeAll = async () => { sockets.forEach((s) => s.disconnect()); sockets.length = 0; app.rooms.all().forEach((r) => app.rooms.destroy(r.code)); await sleep(100); };

test('páginas: "/" es el juego, /healthz responde, /login/ lleva a /db-admin/ y las direcciones de la versión anterior al inicio', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal(await (await fetch(`${base}/healthz`)).text(), 'ok');
  for (const [path, to] of [['/login/', '/db-admin/'], ['/host/', '/'], ['/play/', '/']]) {
    const res = await fetch(`${base}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get('location'), to, path);
  }
  assert.deepEqual(await (await fetch(`${base}/api/mode`)).json(), { dev: false });
  // Lo que ya no existe: crear salas a mano, consultar una sala, contactos del stand, configuración del QR.
  assert.equal((await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"local"}' })).status, 404);
  for (const path of ['/api/rooms/ABCDE', '/api/contacts.csv', '/api/host-config']) assert.equal((await fetch(`${base}${path}`)).status, 404, path);
});

test('las respuestas llevan cabeceras de seguridad (CSP, sin frames, sin adivinar tipos)', async () => {
  const res = await fetch(`${base}/`);
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

test('las salas del modo dev van aparte: la cola común no junta a un jugador normal con uno dev', async () => {
  await freeAll();
  const { cookie } = await login();
  const devRoom = await quick(cookie);
  await player(devRoom.code, 'DEV', cookie);
  const normal = await quick();
  assert.notEqual(normal.code, devRoom.code);
  assert.equal(app.rooms.get(devRoom.code).dev, true);
  assert.equal(app.rooms.get(normal.code).dev, false);
});

test('los eventos del menú de pruebas solo funcionan en modo desarrollador', async () => {
  await freeAll();
  const room = await quick();
  const normal = await player(room.code, 'AAA');
  normal.screen.emit(EVENTS.MAP_SELECT, { choice: 2 });
  normal.screen.emit(EVENTS.DIFFICULTY_SET, { level: 'pro' });
  await sleep(200);
  const session = app.rooms.get(room.code).session;
  assert.equal(session.mapChoice, 'random', 'un jugador normal no elige mapa');
  assert.equal(session.difficulty, 'media', 'ni dificultad');
  normal.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => session.phase === 'PLAYING'));
  normal.screen.emit(EVENTS.DEBUG_END_TIME);
  normal.screen.emit(EVENTS.HARD_RESET);
  await sleep(200);
  assert.equal(session.phase, 'PLAYING', 'ni acaba el tiempo ni reinicia la sala');

  await freeAll();
  const { cookie } = await login();
  const devRoom = await quick(cookie);
  const dev = await player(devRoom.code, 'DEV', cookie);
  const devSession = app.rooms.get(devRoom.code).session;
  dev.screen.emit(EVENTS.MAP_SELECT, { choice: 2 });
  dev.screen.emit(EVENTS.DIFFICULTY_SET, { level: 'pro' });
  assert.ok(await until(() => dev.screen.lastLobby?.mapChoice === 2 && dev.screen.lastLobby?.difficulty === 'pro'), 'el modo dev sí elige');
  dev.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => devSession.phase === 'PLAYING'));
  dev.screen.emit(EVENTS.DEBUG_END_TIME);
  assert.ok(await until(() => devSession.phase === 'GAME_OVER'), 'acaba el tiempo');
  assert.ok(await until(() => devSession.phase === 'LOBBY'));
  const kicked = waitFor(dev.pad, EVENTS.FORCE_DISCONNECT);
  dev.screen.emit(EVENTS.HARD_RESET);
  assert.equal((await kicked).reason, 'hard_reset', 'reiniciar la sala echa a los jugadores (la pantalla se queda)');
  assert.ok(await until(() => app.rooms.get(devRoom.code).slots.count() === 0));
});
