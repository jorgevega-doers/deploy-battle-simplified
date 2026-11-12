// Versión arcade: límites del servidor y jugadores malintencionados (AGENTS.md, secciones 4 y 11). MAX_ROOMS lleno (503), demasiadas salas o
// conexiones por IP (429), otra web (403 / bad_origin), spam de eventos, mensajes enormes, payloads basura en TODOS los eventos, nombres
// inválidos o bloqueados y eventos del stand o del modo dev que en la arcade no deben hacer nada.
process.env.MAX_ROOMS = '3'; // antes de arrancar el servidor (config.js lo lee al importarse)
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, sleep, until, waitFor, EVENTS } from './support/arcadeServer.js';

let h;
before(async () => { h = await start(); });
after(() => h.stop());
beforeEach(() => h.reset());

const room = (code) => h.app.rooms.get(code);
const connectError = (s) => new Promise((resolve) => { s.once('connect_error', (e) => resolve(e.message)); s.once('connect', () => resolve('connected')); });

test('MAX_ROOMS lleno: la siguiente sala responde 503 (el título dice "todas las salas llenas") y, al liberarse una, vuelve a haber sitio', async () => {
  for (let i = 0; i < 3; i += 1) assert.ok(h.app.rooms.create('quick')); // vacías: la cola no las ofrece, así que hace falta una nueva
  const full = await h.quick();
  assert.equal(full.status, 503);
  assert.equal(full.error, 'rooms_full');
  h.app.rooms.destroy(h.app.rooms.all()[0].code);
  assert.equal((await h.quick()).status, 200);
});

test('límite de salas nuevas por IP: pasado el cupo, 429 (y el resto del servidor sigue)', async () => {
  const strict = await start({ roomsPerWindow: 2 });
  try {
    for (let i = 0; i < 2; i += 1) { assert.equal((await strict.quick()).status, 200); strict.app.rooms.all().forEach((r) => strict.app.rooms.destroy(r.code)); }
    assert.equal((await strict.quick()).status, 429);
    assert.equal((await fetch(`${strict.base}/healthz`)).status, 200);
  } finally { await strict.stop(); }
});

test('límite de conexiones por IP y minuto: las de más se rechazan antes de llegar a Socket.io', async () => {
  const strict = await start({ connectionsPerMinute: 3 });
  try {
    const r = strict.app.rooms.create('quick');
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await connectError(strict.client(r.code)));
    assert.deepEqual(results.slice(0, 3), ['connected', 'connected', 'connected']);
    assert.notEqual(results[4], 'connected');
  } finally { await strict.stop(); }
});

test('otra web no puede pedir sala (403) ni abrir el WebSocket de una sala (bad_origin)', async () => {
  const res = await h.quick({ origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  const r = h.app.rooms.create('quick');
  assert.equal(await connectError(h.client(r.code, { extraHeaders: { origin: 'https://evil.example' } })), 'bad_origin');
});

test('spam: un socket que manda más de 300 eventos por segundo se corta; los demás siguen jugando', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  const cut = waitFor(b.pad, 'disconnect');
  for (let i = 0; i < 400; i += 1) b.pad.emit(EVENTS.PAD, [0, 0, null]);
  assert.equal(await cut, 'io server disconnect');
  assert.ok(a.pad.connected);
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => room(code).session.phase === 'PLAYING', 4000), 'la sala sigue funcionando');
});

test('un mensaje enorme (> 4 KB) corta a quien lo manda sin afectar a nadie más', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  const cut = waitFor(b.pad, 'disconnect');
  b.pad.emit(EVENTS.PLAYER_RENAME, { initials: 'x'.repeat(10000) });
  await cut;
  assert.ok(a.pad.connected);
});

test('máximo 16 conexiones por sala: la 17.ª se rechaza (room_busy)', async () => {
  const r = h.app.rooms.create('quick');
  for (let i = 0; i < 16; i += 1) assert.equal(await connectError(h.client(r.code)), 'connected');
  assert.equal(await connectError(h.client(r.code)), 'room_busy');
});

test('nombres: inválidos o bloqueados no entran; minúsculas y espacios se normalizan; renombrar valida igual y solo en la sala', async () => {
  const { code } = await h.quick();
  for (const bad of ['AB', 'ABCD', '', '12A', 'ÑÑÑ', 'A B', 'KKK', 'nzi', null, 42, { a: 1 }]) {
    await assert.rejects(h.join(code, bad, `token-malo-${Math.random().toString(36).slice(2, 12)}`), /invalid_initials/, `rechaza ${JSON.stringify(bad)}`);
  }
  const p = await h.join(code, ' abc ', 'token-bueno-1234567890');
  assert.equal(room(code).slots.initials()[p.slot - 1], 'ABC');
  const error = waitFor(p, EVENTS.ERROR_MSG);
  p.emit(EVENTS.PLAYER_RENAME, { initials: 'SEX' });
  assert.equal((await error).code, 'invalid_initials');
  await sleep(450);
  p.emit(EVENTS.PLAYER_RENAME, { initials: 'XYZ' });
  assert.ok(await until(() => room(code).slots.initials()[0] === 'XYZ'));
  const other = await h.player(code, 'BBB');
  other.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => room(code).session.phase === 'PLAYING', 4000));
  p.emit(EVENTS.PLAYER_RENAME, { initials: 'QQQ' }); // en partida, no
  await sleep(150);
  assert.ok(!room(code).session.tankNames.includes('QQQ'));
});

test('eventos del modo dev (y los que ya no existen) desde una pantalla normal no hacen nada: ni reinicios, ni fin de partida, ni cambiar mapa o dificultad', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA'); // la primera pantalla de la sala (la vieja "anfitriona")
  const b = await h.player(code, 'BBB');
  for (const s of [a.screen, b.screen]) {
    s.emit(EVENTS.MAP_SELECT, { choice: 2 }); s.emit(EVENTS.MAP_SELECT, { reroll: true }); s.emit(EVENTS.DIFFICULTY_SET, { level: 'pro' });
    s.emit(EVENTS.HARD_RESET);
    for (const old of OLD_EVENTS) s.emit(old, { on: true }); // los del stand ya no tienen manejador: se ignoran
  }
  await sleep(200);
  assert.equal(room(code).session.mapChoice, 'random', 'mapa siempre aleatorio');
  assert.equal(room(code).session.difficulty, 'media', 'bots siempre en MEDIA');
  assert.equal(room(code).slots.count(), 2, 'nadie ha echado a nadie');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => room(code).session.phase === 'PLAYING', 4000));
  a.screen.emit(EVENTS.DEBUG_END_TIME);
  await sleep(200);
  assert.equal(room(code).session.phase, 'PLAYING', 'nadie acaba la partida a mano');
});

// Eventos de la versión completa (stand) que un cliente viejo o malicioso aún podría mandar.
const OLD_EVENTS = ['emergency_reset', 'attract_set', 'leaderboard_reset', 'tunnel_restart'];
// Payloads raros para todos los eventos que un cliente puede mandar.
const JUNK = [undefined, null, 0, -1, 1e308, NaN, Infinity, '', 'x', 'A'.repeat(500), true, [], [1], [1, 2, 3, 4], [NaN, NaN], ['a', 'b'], {}, { on: 'yes' },
  { x: 'a', y: {} }, { initials: [] }, { role: 'player', initials: 'ABC', token: 123 }, { role: 'admin' }, { choice: -1 }, { level: '__proto__' }, { __proto__: { x: 1 } }];
const CLIENT_EVENTS = ['HOST_JOIN', 'JOIN_ROOM', 'PAD', 'PAD_MOVE', 'PAD_AIM', 'FIRE', 'DASH', 'PLAYER_READY', 'PAUSE_REQUEST', 'PLAYER_RENAME',
  'PING_REPORT', 'LATENCY_PING', 'MAP_SELECT', 'DIFFICULTY_SET', 'HARD_RESET', 'DEBUG_END_TIME'].map((name) => EVENTS[name]).concat(OLD_EVENTS);

test('basura en todos los eventos (en la sala y en partida, con y sin plaza): ningún manejador falla y la partida sigue', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  try {
    const { code } = await h.quick();
    const a = await h.player(code, 'AAA');
    const b = await h.player(code, 'BBB');
    const stranger = h.client(code);
    await h.connected(stranger);
    const blast = async () => {
      for (const s of [b.pad, b.screen, stranger]) {
        for (const name of CLIENT_EVENTS) for (const junk of JUNK) s.emit(name, junk);
        await sleep(1100); // por debajo del límite de 300 eventos por segundo
      }
    };
    await blast();
    assert.equal(room(code).session.phase, 'LOBBY');
    if (room(code).session.joinLeft === null) a.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => room(code).session.phase === 'PLAYING', 5000));
    await blast();
    assert.ok(['PLAYING', 'GAME_OVER', 'LOBBY'].includes(room(code).session.phase));
    assert.ok(a.pad.connected, 'el jugador normal sigue dentro');
  } finally { console.error = original; }
  assert.deepEqual(errors.filter((e) => /falló|Fallo/.test(e)), [], 'ningún manejador ha lanzado una excepción');
});
