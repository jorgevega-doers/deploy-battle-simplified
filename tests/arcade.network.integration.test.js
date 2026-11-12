// Versión arcade: cortes de red y reconexiones en cada fase (AGENTS.md, sección 11). Un "corte" es desconectar el socket sin avisar (cable
// arrancado, Wi-Fi caída: cut()); irse de la página es disconnect() (roomSocket.js); "SALIR" es PLAYER_QUIT. El token vive en sessionStorage: sobrevive a una recarga y se copia al duplicar la pestaña.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, sleep, until, waitFor, cut, EVENTS } from './support/arcadeServer.js';

let h;
// introS > 0: la presentación (READY) dura lo bastante para cortar la conexión en medio.
before(async () => { h = await start({ gameConfig: { introS: 0.6, matchSeconds: 2.5 } }); });
after(() => h.stop());
beforeEach(() => h.reset());

const room = (code) => h.app.rooms.get(code);
const serverPhase = (code) => room(code)?.session.phase;
async function startMatch(code, starter) {
  starter.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => serverPhase(code) === 'PLAYING', 6000), 'empieza la partida');
}

test('corte durante la intro (nombres + 2, 1): la presentación NO se cancela para los demás; si no vuelve, pierde por abandono', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  a.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => serverPhase(code) === 'READY'));
  cut(b.pad);
  cut(b.screen);
  assert.ok(await until(() => serverPhase(code) === 'PLAYING'), 'la partida empieza igualmente (no vuelve todo el mundo a la sala)');
  assert.ok(await until(() => a.screen.lastResult, 6000), 'acaba la partida');
  assert.equal(a.screen.lastResult.reason, 'forfeit');
  assert.deepEqual(a.screen.lastResult.winners, [a.slot], 'gana el que se quedó');
});

test('corte en plena partida y vuelta con su token dentro de la gracia: recupera SU tanque y no pierde por abandono', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  await startMatch(code, a);
  const slotB = b.slot;
  cut(b.pad);
  await sleep(300); // menos que reconnectGraceS (0,8 s)
  const back = await h.join(code, 'BBB', b.token, b.screenId);
  assert.equal(back.slot, slotB, 'misma plaza');
  assert.equal(room(code).slots.count(), 2, 'no se duplica');
  back.emit(EVENTS.PAD, [100, 0, 0]); // y puede seguir jugando
  assert.ok(await until(() => a.screen.lastResult, 6000));
  assert.notEqual(a.screen.lastResult.reason, 'forfeit', 'la partida acaba por tiempo, no por abandono');
});

test('corte en un duelo sin volver: pasada la gracia gana el rival por abandono y los dos vuelven a la sala (el caído sin plaza)', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  await startMatch(code, a);
  cut(b.pad);
  cut(b.screen);
  assert.ok(await until(() => a.screen.lastResult, 4000));
  assert.equal(a.screen.lastResult.reason, 'forfeit');
  assert.deepEqual(a.screen.lastResult.winners, [a.slot]);
  assert.ok(await until(() => serverPhase(code) === 'LOBBY'));
  assert.ok(await until(() => h.humans(a) === 1), 'la plaza del caído queda libre');
});

test('corte en una partida de 3 sin volver: el caído queda eliminado y la partida SIGUE con los otros dos', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  const c = await h.player(code, 'CCC');
  await startMatch(code, a);
  cut(c.pad);
  cut(c.screen);
  // Se espera a que el servidor lo dé por eliminado (pasada la gracia, 0,8 s de juego): con la máquina cargada el reloj del juego va más lento que el real.
  assert.ok(await until(() => a.screen.lastState?.tanks[c.slot - 1][3] === 0, 5000), 'el que se fue, sin vidas');
  assert.equal(serverPhase(code), 'PLAYING', 'la partida sigue');
  assert.ok(a.screen.lastState.tanks[b.slot - 1][3] > 0);
});

test('corte durante los resultados: al volver a la sala solo queda el otro, ya como P1, y puede jugar otra', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA'); // P1
  const b = await h.player(code, 'BBB'); // P2
  await startMatch(code, a);
  assert.ok(await until(() => serverPhase(code) === 'GAME_OVER', 6000));
  const moved = waitFor(b.pad, EVENTS.SLOT_ASSIGNED);
  cut(a.pad);
  cut(a.screen);
  assert.equal((await moved).slot, 1, 'B pasa a ser P1');
  assert.ok(await until(() => serverPhase(code) === 'LOBBY'));
  assert.equal(room(code).slots.count(), 1);
  b.pad.emit(EVENTS.PLAYER_READY);
  assert.ok(await until(() => serverPhase(code) === 'PLAYING', 4000), 'la siguiente partida (contra bots) arranca');
  assert.equal(b.screen.lastLobby.plan.kind, 'solo');
});

test('recargar la página dentro de la sala (mismo token): la cola le devuelve a su sala y recupera su plaza, sin duplicarse', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  b.pad.disconnect(); b.screen.disconnect(); // recarga = se cierra la página...
  const again = await h.quick(); // ...título -> JUGAR otra vez
  assert.equal(again.code, code, 'su sala sigue siendo la más llena con hueco');
  const back = await h.player(code, 'BBB', { token: b.token, screenId: b.screenId });
  assert.equal(back.slot, b.slot);
  assert.equal(room(code).slots.count(), 2);
  assert.ok(await until(() => h.humans(a) === 2));
});

test('dos pestañas con el MISMO token (duplicar pestaña): la nueva se queda la plaza, la vieja deja de jugar; nunca hay dos plazas', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const kicked = waitFor(a.pad, 'disconnect');
  const twin = await h.player(code, 'AAA', { token: a.token });
  assert.equal(await kicked, 'io server disconnect', 'el servidor corta la vieja (el cliente no reconecta solo: sin ping-pong)');
  assert.equal(twin.slot, a.slot);
  assert.equal(room(code).slots.count(), 1);
});

test('dos pestañas con tokens distintos (dos ventanas): son dos jugadores distintos en la sala', async () => {
  const { code } = await h.quick();
  await h.player(code, 'AAA');
  await h.player(code, 'AAA');
  assert.equal(room(code).slots.count(), 2);
});

test('un corte breve en la sala con la cuenta atrás en marcha: vuelve con su token y la cuenta atrás NO vuelve a empezar', async () => {
  const slow = await start({ gameConfig: { joinWindowS: 3, soloJoinWindowS: 3, lobbyGraceS: 2 } }); // gracia larga: volver a tiempo no depende de la carga de la máquina
  try {
    const { code } = await slow.quick();
    const a = await slow.player(code, 'AAA');
    const b = await slow.player(code, 'BBB');
    a.pad.emit(EVENTS.PLAYER_READY);
    const session = slow.app.rooms.get(code).session;
    assert.ok(await until(() => session.joinLeft !== null && session.joinLeft <= 2, 4000), 'la cuenta atrás ya ha avanzado');
    cut(b.pad);
    await sleep(150);
    const back = await slow.join(code, 'BBB', b.token, b.screenId);
    assert.equal(back.slot, b.slot);
    assert.ok(session.joinLeft !== null && session.joinLeft <= 2, `la cuenta atrás sigue por donde iba (${session.joinLeft}): no ha vuelto a 3`);
    assert.equal(slow.humans(a), 2);
    assert.ok(await until(() => slow.app.rooms.get(code).session.phase === 'PLAYING', 4000));
    assert.equal(a.screen.lastLobby.plan.humans, 2);
  } finally { await slow.stop(); }
});

test('si solo se cae la pantalla (host) y el teclado sigue conectado, no pierde la plaza', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  await h.player(code, 'BBB');
  cut(a.screen);
  await sleep(600);
  assert.equal(room(code).slots.count(), 2);
});

test('volver con su token después de haber perdido por abandono (partida de 3) no rompe nada: entra eliminado y la partida sigue', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  await h.player(code, 'BBB');
  const c = await h.player(code, 'CCC');
  await startMatch(code, a);
  cut(c.pad);
  // Se espera a que el servidor lo dé por eliminado (no un tiempo fijo: con la máquina cargada tardaba más).
  assert.ok(await until(() => a.screen.lastState?.tanks[c.slot - 1][3] === 0, 5000), 'C queda eliminado');
  const back = await h.join(code, 'CCC', c.token, c.screenId);
  assert.equal(back.slot, c.slot);
  back.emit(EVENTS.FIRE); back.emit(EVENTS.PAD, [100, 100, 0]); back.emit(EVENTS.DASH);
  await sleep(200);
  assert.equal(a.screen.lastState.tanks[c.slot - 1][3], 0, 'sigue eliminado');
  assert.equal(serverPhase(code), 'PLAYING');
});

test('un intruso (otro token) no entra en una partida en marcha', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  await h.player(code, 'BBB');
  await startMatch(code, a);
  await assert.rejects(h.join(code, 'EVL', 'token-de-un-intruso-123456'), /room_full/);
});

test('si se caen todos en plena partida, la partida se cierra por abandono y la sala queda vacía en la espera', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  await startMatch(code, a);
  for (const s of [a.pad, a.screen, b.pad, b.screen]) cut(s);
  assert.ok(await until(() => serverPhase(code) === 'LOBBY', 5000));
  assert.equal(room(code).slots.count(), 0);
  assert.equal(room(code).session.joinLeft, null, 'sin cuenta atrás fantasma');
});

test('conexión muerta sin detectar (no llega NADA del teclado): a los 4 s su tanque se para en vez de seguir andando solo', async () => {
  const long = await start({ gameConfig: { matchSeconds: 8 } });
  try {
    const { code } = await long.quick();
    const a = await long.player(code, 'AAA');
    const b = await long.player(code, 'BBB');
    a.pad.emit(EVENTS.PLAYER_READY);
    assert.ok(await until(() => long.app.rooms.get(code).session.phase === 'PLAYING', 4000));
    const session = long.app.rooms.get(code).session;
    const stops = [];
    const setMove = session.setMove;
    session.setMove = (slot, x, y) => { if (x === 0 && y === 0) stops.push(slot); return setMove(slot, x, y); };
    b.pad.emit(EVENTS.PAD, [100, 0, 0]); // última orden: andar; y luego silencio total (sin ping ni nada)
    const keepAlive = setInterval(() => a.pad.emit(EVENTS.PAD, [40, 0, null]), 200); // A sigue vivo (y andando)
    try {
      await sleep(2500); // margen con los 4 s del servidor (son de reloj real): con la máquina cargada este sleep puede durar más
      assert.ok(!stops.includes(b.slot), 'antes de 4 s se respeta la última orden');
      assert.ok(await until(() => stops.includes(b.slot), 2500), 'pasados 4 s, parado');
      assert.ok(!stops.includes(a.slot), 'al que sigue mandando no se le toca');
    } finally { clearInterval(keepAlive); }
  } finally { await long.stop(); }
});

// --- Irse de la página a propósito (SALIR al título, otro enlace, cerrar la pestaña): la página cierra sus conexiones (roomSocket.js, pagehide).
// Sin esto, Chrome guardaba la página congelada con los WebSocket abiertos y los demás veían un fantasma ~20 s (ping + gracia). ---
test('irse de la página en la sala: el hueco queda libre AL MOMENTO (sin los 6 s de gracia de un corte)', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  b.pad.disconnect(); b.screen.disconnect();
  assert.ok(await until(() => h.humans(a) === 1, 250), 'liberado en menos de 250 ms');
});

test('irse de la página en plena partida = abandono inmediato: en un duelo el otro gana al momento (no a los 10 s)', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  await startMatch(code, a);
  b.pad.disconnect(); b.screen.disconnect();
  assert.ok(await until(() => a.screen.lastResult, 400), 'resultado casi al instante');
  assert.equal(a.screen.lastResult.reason, 'forfeit');
  assert.ok(await until(() => serverPhase(code) === 'LOBBY', 3000));
  assert.ok(await until(() => h.humans(a) === 1), 'y en la sala ya no está');
});

test('un corte de red (no a propósito) sigue teniendo su gracia: en la sala no se libera antes de tiempo', async () => {
  const { code } = await h.quick();
  const a = await h.player(code, 'AAA');
  const b = await h.player(code, 'BBB');
  cut(b.pad);
  await sleep(100); // la gracia son 0,4 s de reloj real: margen por si la máquina va cargada
  assert.equal(h.humans(a), 2, 'justo después del corte sigue su hueco (puede volver con su token)');
  assert.ok(await until(() => h.humans(a) === 1, 2000), 'pasada la gracia, se libera');
});
