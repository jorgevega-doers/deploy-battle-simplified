// Versión arcade: muchas salas y partidas a la vez en el mismo servidor. Cada sala es un espacio de nombres con su sesión: nunca se mezclan
// estados, nombres ni resultados, y un fallo en una sala no tumba las demás. También la cola común (/api/quick) bajo llegadas simultáneas.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, sleep, until, EVENTS } from './support/arcadeServer.js';

let h;
let clock = 0; // reloj del registro de salas (reservas de la cola y borrado de salas vacías): se adelanta a mano
before(async () => { h = await start({ now: () => Date.now() + clock }); });
after(() => h.stop());
beforeEach(async () => { clock = 0; await h.reset(); });

const phaseOf = (code) => h.app.rooms.get(code)?.session.phase;
// Una sala nueva (sin pasar por la cola, para elegir cuánta gente va a cada una) con n jugadores de nombres únicos.
async function roomWith(names) {
  const room = h.app.rooms.create('quick');
  const players = [];
  for (const name of names) players.push(await h.player(room.code, name));
  return { code: room.code, players, names };
}
// Mueve, apunta, dispara y hace dash con todos mientras dure la partida (como gente jugando de verdad).
function mash(players) {
  const timer = setInterval(() => {
    for (const p of players) {
      if (!p.pad.connected) continue;
      p.pad.emit(EVENTS.PAD, [Math.round(Math.random() * 200 - 100), Math.round(Math.random() * 200 - 100), Math.round(Math.random() * 628)]);
      if (Math.random() < 0.3) p.pad.emit(EVENTS.FIRE, Math.round(Math.random() * 628));
      if (Math.random() < 0.05) p.pad.emit(EVENTS.DASH);
    }
  }, 50);
  return () => clearInterval(timer);
}

test('cola común: 10 personas pulsan JUGAR a la vez -> 3 salas (4 + 4 + 2), ninguna con más de 4', async () => {
  const answers = await Promise.all(Array.from({ length: 10 }, () => h.quick()));
  const per = new Map();
  for (const a of answers) per.set(a.code, (per.get(a.code) ?? 0) + 1);
  assert.deepEqual([...per.values()].sort(), [2, 4, 4]);
});

test('cola común: prefiere la sala más llena con hueco y nunca manda a una sala en partida', async () => {
  await roomWith(['AAA']);
  const three = await roomWith(['BBB', 'CCC', 'DDD']);
  assert.equal((await h.quick()).code, three.code, 'a la de 3');
  await h.reset();
  const playing = await roomWith(['EEE', 'FFF']);
  playing.players[0].pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => phaseOf(playing.code) === 'PLAYING'));
  assert.notEqual((await h.quick()).code, playing.code, 'la sala en partida no admite a nadie');
});

test('4 partidas A LA VEZ (1, 2, 3 y 4 jugadores) con todos jugando: cada sala ve solo lo suyo, todas acaban y vuelven a la sala; y la revancha también', async () => {
  const groups = [['SOL'], ['DUA', 'DUB'], ['TRA', 'TRB', 'TRC'], ['CUA', 'CUB', 'CUC', 'CUD']];
  const rooms = [];
  for (const names of groups) rooms.push(await roomWith(names));
  const tanksOf = [4, 2, 3, 4]; // solo = 1 + 3 bots
  for (let round = 1; round <= 2; round += 1) {
    for (const r of rooms) for (const p of r.players) { p.screen.lastResult = null; p.screen.states = 0; }
    // Todas las pantallas comprueban CADA estado que les llega: el número de tanques de SU partida.
    const wrong = [];
    rooms.forEach((r, i) => r.players.forEach((p) => { p.screen.onState = (st) => { if (st.tanks.length !== tanksOf[i]) wrong.push(`${r.code}: ${st.tanks.length}`); }; }));
    rooms.forEach((r) => r.players.at(-1).pad.emit(EVENTS.PLAYER_READY));
    assert.ok(await until(() => rooms.every((r) => phaseOf(r.code) === 'PLAYING'), 5000), `ronda ${round}: las 4 en partida a la vez`);
    const stop = mash(rooms.flatMap((r) => r.players));
    assert.ok(await until(() => rooms.every((r) => r.players.every((p) => p.screen.lastResult)), 10000), `ronda ${round}: todas terminan`);
    stop();
    assert.deepEqual(wrong, [], 'ningún estado de otra sala');
    rooms.forEach((r, i) => {
      for (const p of r.players) {
        assert.ok(p.screen.states > 10, 'le llegan estados de su partida');
        const humans = p.screen.lastResult.scores.filter((s) => !s.bot).map((s) => s.initials).sort();
        assert.deepEqual(humans, [...r.names].sort(), `resultados de ${r.code} con solo sus jugadores`);
        assert.equal(p.screen.lastResult.scores.length, tanksOf[i]);
      }
    });
    assert.ok(await until(() => rooms.every((r) => phaseOf(r.code) === 'LOBBY'), 5000), 'todas vuelven a la sala de espera');
    rooms.forEach((r) => assert.equal(h.app.rooms.get(r.code).slots.count(), r.names.length, 'nadie pierde su plaza'));
  }
});

test('un fallo dentro de una sala solo cierra ESA sala: las demás partidas siguen', async () => {
  const bad = await roomWith(['BAD', 'BAE']);
  const good = await roomWith(['GOO', 'GOP']);
  for (const r of [bad, good]) r.players[0].pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => phaseOf(bad.code) === 'PLAYING' && phaseOf(good.code) === 'PLAYING'));
  const errors = console.error;
  console.error = () => {}; // el fallo provocado se registra; aquí no ensucia la salida
  try {
    h.app.rooms.get(bad.code).session.tick = () => { throw new Error('fallo provocado'); };
    assert.ok(await until(() => !h.app.rooms.get(bad.code)), 'la sala rota se cierra');
  } finally { console.error = errors; }
  const before = good.players[0].screen.states;
  await sleep(300);
  assert.equal(phaseOf(good.code), 'PLAYING');
  assert.ok(good.players[0].screen.states > before, 'la otra sala sigue recibiendo estados');
  assert.ok(await until(() => !bad.players[0].pad.connected), 'los de la sala rota quedan desconectados (su página vuelve a intentar)');
});

test('sala llena: un 5.º que entra directamente por el código (enlace viejo) recibe "sala llena" y no echa a nadie', async () => {
  const r = await roomWith(['AAA', 'BBB', 'CCC', 'DDD']);
  await assert.rejects(h.join(r.code, 'EEE', 'token-del-quinto-1234567'), /room_full/);
  assert.equal(h.app.rooms.get(r.code).slots.count(), 4);
});

test('reservas de la cola: si alguien pide sala y nunca entra, su hueco se libera a los 12 s', async () => {
  const r = await roomWith(['AAA']);
  for (let i = 0; i < 3; i += 1) assert.equal((await h.quick()).code, r.code); // 3 reservas: la sala "parece" llena
  assert.notEqual((await h.quick()).code, r.code, 'con las reservas, la cola manda a otra');
  clock += 13000;
  h.app.rooms.all().filter((x) => x.code !== r.code).forEach((x) => h.app.rooms.destroy(x.code));
  assert.equal((await h.quick()).code, r.code, 'las reservas caducadas no bloquean la sala');
});

test('una sala vacía se borra sola a los 30 s y libera cupo; con alguien dentro, no', async () => {
  const empty = await roomWith(['AAA']);
  const busy = await roomWith(['BBB']);
  empty.players[0].pad.emit(EVENTS.PLAYER_QUIT);
  empty.players[0].pad.disconnect(); empty.players[0].screen.disconnect();
  await sleep(150);
  h.app.rooms.sweep(); // empieza a contar
  clock += 31000;
  h.app.rooms.sweep();
  assert.equal(h.app.rooms.get(empty.code), null, 'la vacía se borra');
  assert.ok(h.app.rooms.get(busy.code), 'la ocupada sigue');
});

test('restauración: una pantalla que vuelve a una sala que ya no existe (reinicio del servidor) la recrea con su código', async () => {
  const code = 'ABCDE';
  assert.equal(h.app.rooms.get(code), null);
  const s = h.client(code, { auth: { type: 'quick' } });
  const err = await new Promise((resolve) => s.once('connect_error', resolve));
  assert.equal(err.message, 'room_restored');
  assert.ok(h.app.rooms.get(code), 'la sala vuelve a existir');
  const p = await h.player(code, 'RES');
  assert.equal(p.slot, 1);
  // Sin tipo (un móvil viejo) o con un código imposible no se crea nada.
  const bad = h.client('ZZZZZ');
  assert.equal((await new Promise((resolve) => bad.once('connect_error', resolve))).message, 'Invalid namespace');
  assert.equal(h.app.rooms.get('ZZZZZ'), null);
});

// --- Reservas con dueño: /api/quick lleva el token de la pestaña; la reserva se gasta cuando ESE jugador entra. ---
const reserved = (code) => h.app.rooms.get(code).pending.size;

test('recargar dentro de la sala no deja una reserva fantasma: los dos siguientes de la cola caben en esa sala', async () => {
  const { code } = await h.quick({}, { token: 'token-de-AAA-1234567890' });
  await h.player(code, 'AAA', { token: 'token-de-AAA-1234567890' });
  const b = await h.player(code, 'BBB', { token: 'token-de-BBB-1234567890' });
  b.pad.disconnect(); b.screen.disconnect(); // recarga...
  const again = await h.quick({}, { token: b.token }); // ...y JUGAR otra vez
  assert.equal(again.code, code, 'vuelve a SU sala');
  await h.player(code, 'BBB', { token: b.token, screenId: b.screenId });
  assert.equal(reserved(code), 0, 'sin reservas colgando');
  for (const name of ['CCC', 'DDD']) {
    const r = await h.quick({}, { token: `token-de-${name}-1234567890` });
    assert.equal(r.code, code, `${name} cabe en la sala (hay 2 huecos de verdad)`);
    await h.player(code, name, { token: `token-de-${name}-1234567890` });
  }
  assert.equal(h.app.rooms.get(code).slots.count(), 4);
  assert.notEqual((await h.quick({}, { token: 'token-de-EEE-1234567890' })).code, code, 'ahora sí está llena');
});

test('una reconexión (corte breve) NO se gasta la reserva de otro que está entrando: nunca se mandan 5 personas a 4 plazas', async () => {
  const { code } = await h.quick({}, { token: 'token-de-AAA-1234567890' });
  await h.player(code, 'AAA', { token: 'token-de-AAA-1234567890' });
  const b = await h.player(code, 'BBB', { token: 'token-de-BBB-1234567890' });
  assert.equal((await h.quick({}, { token: 'token-de-CCC-1234567890' })).code, code); // C reserva y tarda en abrir su pantalla
  b.pad.disconnect();
  await h.join(code, 'BBB', b.token, b.screenId); // B vuelve antes de que entre C
  assert.equal(reserved(code), 1, 'la reserva de C sigue');
  assert.equal((await h.quick({}, { token: 'token-de-DDD-1234567890' })).code, code, 'D: el último hueco');
  assert.notEqual((await h.quick({}, { token: 'token-de-EEE-1234567890' })).code, code, 'E va a otra sala');
});

test('la reserva se gasta al entrar su dueño; pedir sala dos veces con el mismo token no reserva dos huecos', async () => {
  const { code } = await h.quick({}, { token: 'token-de-AAA-1234567890' });
  await h.player(code, 'AAA', { token: 'token-de-AAA-1234567890' });
  assert.equal(reserved(code), 0);
  await h.quick({}, { token: 'token-de-BBB-1234567890' });
  await h.quick({}, { token: 'token-de-BBB-1234567890' }); // doble clic en JUGAR
  assert.equal(reserved(code), 1);
  await h.player(code, 'BBB', { token: 'token-de-BBB-1234567890' });
  assert.equal(reserved(code), 0);
});

test('compatibilidad: un título antiguo (sin token) sigue reservando y su entrada gasta una reserva anónima', async () => {
  const { code } = await h.quick();
  assert.equal(reserved(code), 1);
  await h.player(code, 'AAA');
  assert.equal(reserved(code), 0);
  assert.equal((await h.quick({}, { token: 'no vale!' })).code, code, 'un token mal formado se trata como sin token');
});
