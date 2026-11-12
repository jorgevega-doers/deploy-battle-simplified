// Versión arcade: reglas de la partida y de la sala (AGENTS.md, secciones 2, 4 y 5). 5 vidas para todos, plan según la gente (1 = contra 3 bots),
// bots en MEDIA, mapa al azar y distinto tras cada partida, tiempo máximo, AFK, pausa (solo contra bots), SALIR en partida, resultados sin
// puesto ni ranking y las páginas que no se tocan (/healthz, /end/, /home/, /licencias/, /db-admin/).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { start, sleep, until, waitFor, EVENTS } from './support/arcadeServer.js';

let h;
before(async () => { h = await start({ gameConfig: { matchSeconds: 2, pauseMaxS: 0.5, pauseCooldownS: 0.4 } }); });
after(() => h.stop());
beforeEach(async () => { await h.reset(); });

const room = (code) => h.app.rooms.get(code);
async function playing(names) {
  const { code } = await h.quick();
  const players = [];
  for (const n of names) players.push(await h.player(code, n));
  players[0].pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => room(code).session.phase === 'PLAYING', 5000));
  assert.ok(await until(() => players[0].screen.lastState?.tanks));
  return { code, players };
}

test('plan y vidas: 1 jugador = contra 3 bots; 2 = duelo; 3 y 4 = todos contra todos. TODOS los tanques (bots incluidos) con 5 vidas; bots en MEDIA', async () => {
  const cases = [[['AAA'], 'solo', 4], [['AAA', 'BBB'], 'duel', 2], [['AAA', 'BBB', 'CCC'], 'brawl', 3], [['AAA', 'BBB', 'CCC', 'DDD'], 'brawl', 4]];
  for (const [names, kind, tanks] of cases) {
    await h.reset();
    const { code, players } = await playing(names);
    assert.equal(players[0].screen.lastLobby.plan.kind, kind);
    assert.equal(room(code).session.difficulty, 'media');
    assert.deepEqual(players[0].screen.lastState.tanks.map((t) => t[3]), Array(tanks).fill(5), `${kind} de ${names.length}`);
  }
});

test('AFK en partida (nadie toca nada): la partida acaba sola por tiempo y todos vuelven a la sala; el mapa siguiente es otro', async () => {
  const { code, players } = await playing(['AAA', 'BBB']);
  const map = players[0].screen.lastLobby.map;
  assert.ok(players[0].screen.lastState.timeLeft <= 2, 'el reloj nunca pasa del máximo');
  assert.ok(await until(() => players[0].screen.lastResult, 5000));
  assert.ok(['time', 'draw'].includes(players[0].screen.lastResult.reason));
  assert.ok(await until(() => players[0].screen.lastLobby.state === 'LOBBY', 3000));
  assert.notEqual(players[0].screen.lastLobby.map, map, 'mapa aleatorio distinto del anterior');
  assert.equal(room(code).slots.count(), 2, 'los AFK siguen en la sala (allí el cliente los echa a los 90 s)');
});

test('resultados sin puesto ni ranking en partidas entre personas', async () => {
  const { players } = await playing(['AAA', 'BBB']);
  assert.ok(await until(() => players[0].screen.lastResult, 5000));
  assert.ok(players[0].screen.lastResult.scores.every((s) => !('rank' in s)), 'sin puesto en los resultados');
});

test('pausa contra los bots: congela la partida, se acaba sola, máximo 2 por partida y con espera entre una y otra', async () => {
  const slow = await start({ gameConfig: { matchSeconds: 6, pauseMaxS: 0.5, pauseCooldownS: 0.4 } });
  try {
    const { code } = await slow.quick();
    const p = await slow.player(code, 'AAA');
    p.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => slow.app.rooms.get(code).session.phase === 'PLAYING', 4000));
    const states = [];
    p.pad.on(EVENTS.PAUSE_STATE, (s) => states.push(s));
    p.pad.emit(EVENTS.PAUSE_REQUEST, { on: true });
    assert.ok(await until(() => states.some((s) => s.by === 1)));
    const frozenAt = p.screen.states;
    await sleep(250);
    assert.ok(p.screen.states - frozenAt <= 1, 'en pausa no avanza (ni se envían estados)');
    assert.ok(await until(() => states.at(-1).by === null, 2000), 'la pausa se acaba sola');
    p.pad.emit(EVENTS.PAUSE_REQUEST, { on: true });
    assert.ok(await until(() => states.at(-1).denied === 'cooldown'), 'hay que esperar entre pausas');
    await sleep(500);
    p.pad.emit(EVENTS.PAUSE_REQUEST, { on: true });
    assert.ok(await until(() => states.at(-1).by === 1), 'segunda pausa');
    p.pad.emit(EVENTS.PAUSE_REQUEST, { on: false }); // SEGUIR
    assert.ok(await until(() => states.at(-1).by === null));
    await sleep(500);
    p.pad.emit(EVENTS.PAUSE_REQUEST, { on: true });
    assert.ok(await until(() => states.at(-1).denied === 'limit'), 'no hay tercera');
  } finally { await slow.stop(); }
});

test('pausa con más gente: no congela nada (el menú es solo tuyo)', async () => {
  const { code, players } = await playing(['AAA', 'BBB']);
  const answer = waitFor(players[0].pad, EVENTS.PAUSE_STATE);
  players[0].pad.emit(EVENTS.PAUSE_REQUEST, { on: true });
  assert.equal((await answer).denied, 'online');
  assert.equal(room(code).session.paused, false);
});

test('SALIR en un duelo: el otro gana al momento por abandono', async () => {
  const { players: [a, b] } = await playing(['AAA', 'BBB']);
  b.pad.emit(EVENTS.PLAYER_QUIT);
  assert.ok(await until(() => a.screen.lastResult, 1500));
  assert.equal(a.screen.lastResult.reason, 'forfeit');
  assert.deepEqual(a.screen.lastResult.winners, [a.slot]);
});

test('SALIR en una partida de 3: la partida sigue con los otros dos; al irse de la página, su plaza queda libre tras los resultados', async () => {
  const { code, players: [a, , c] } = await playing(['AAA', 'BBB', 'CCC']);
  c.pad.emit(EVENTS.PLAYER_QUIT);
  await sleep(200);
  assert.equal(room(code).session.phase, 'PLAYING');
  assert.equal(a.screen.lastState.tanks[c.slot - 1][3], 0);
  c.pad.disconnect(); c.screen.disconnect(); // goHome: vuelve al título
  assert.ok(await until(() => room(code).session.phase === 'LOBBY', 5000));
  assert.equal(room(code).slots.count(), 2);
});

test('SALIR contra los bots: la partida termina y la sala queda libre', async () => {
  const { code, players: [a] } = await playing(['AAA']);
  a.pad.emit(EVENTS.PLAYER_QUIT);
  assert.ok(await until(() => a.screen.lastResult, 1500));
  a.pad.disconnect(); a.screen.disconnect();
  assert.ok(await until(() => room(code).session.phase === 'LOBBY' && room(code).slots.count() === 0, 3000));
});

test('SALIR durante la intro: los demás vuelven a la sala sin quedarse colgados y pueden volver a pulsar JUGAR', async () => {
  const intro = await start({ gameConfig: { introS: 0.8 } });
  try {
    const { code } = await intro.quick();
    const a = await intro.player(code, 'AAA');
    const b = await intro.player(code, 'BBB');
    a.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => intro.app.rooms.get(code).session.phase === 'READY', 3000));
    b.pad.emit(EVENTS.PLAYER_QUIT);
    assert.ok(await until(() => intro.app.rooms.get(code).session.phase === 'LOBBY'));
    a.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => intro.app.rooms.get(code).session.phase === 'PLAYING', 4000));
    assert.equal(a.screen.lastLobby.plan.kind, 'solo');
  } finally { await intro.stop(); }
});

// Fuerza una puntuación > 0 al jugador 1 (acertar a un bot en una prueba sería cuestión de suerte) y acaba la partida.
async function soloWithScore(name) {
  const { code } = await playing([name]);
  const match = room(code).session.match;
  const get = Object.getOwnPropertyDescriptor(match, 'result').get;
  Object.defineProperty(match, 'result', { get() { const r = get.call(match); if (r) r.scores[0].score = 1234; return r; } });
  room(code).session.expireTime();
  assert.ok(await until(() => room(code).session.phase !== 'PLAYING'));
  await sleep(150);
}

test('contra los bots, los resultados enseñan la puntuación de la partida tal cual (sin ranking que la cambie)', async () => {
  await soloWithScore('AAA');
  const result = h.sockets.find((s) => s.lastResult)?.lastResult;
  assert.ok(result, 'llega game_over');
  assert.equal(result.scores[0].score, 1234);
  assert.ok(!('rank' in result.scores[0]));
});

test('páginas y rutas que no se tocan: /healthz, cabeceras de seguridad, /, /end/, /home/, /licencias/, /db-admin/, /login', async (t) => {
  const health = await fetch(`${h.base}/healthz`);
  assert.equal(await health.text(), 'ok');
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  const login = await fetch(`${h.base}/login`, { redirect: 'manual' });
  assert.equal(login.status, 301);
  assert.equal(login.headers.get('location'), '/db-admin/');
  if (!existsSync(new URL('../dist/host/index.html', import.meta.url))) { t.skip('sin dist/: ejecuta npm run build'); return; }
  for (const path of ['/', '/end/', '/home/', '/licencias/', '/db-admin/']) assert.equal((await fetch(`${h.base}${path}`)).status, 200, path);
});
