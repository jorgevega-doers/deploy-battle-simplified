import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../server/game/session.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';

const DT = 1 / config.game.tickHz;
const cfgWith = (overrides = {}) => ({ ...config.game, introS: 0, joinWindowS: 0, ...overrides }); // joinWindowS: 0 = sin cuenta atrás de entrada (hay tests propios)

// Sesión con un "out" que anota todo lo que ocurre.
function setup(overrides = {}) {
  const { arenas, rng, ...cfgOverrides } = overrides;
  const log = { phases: [], countdown: [], states: 0, events: [], gameOver: [], redirects: 0, finished: 0 };
  const session = createSession({
    arena: createArena(),
    arenas,
    rng,
    cfg: cfgWith(cfgOverrides),
    out: {
      phase: (p) => log.phases.push(p),
      countdown: (s) => log.countdown.push(s),
      state: () => { log.states++; },
      events: (list) => log.events.push(...list),
      gameOver: (r) => log.gameOver.push(r),
      redirect: () => { log.redirects++; },
      finished: () => { log.finished++; },
    },
  });
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) session.tick(DT); };
  return { session, log, run };
}

// Dos jugadores en la sala y los dos pulsan LISTO.
const bothReady = (session) => { session.setPlayers(['AAA', 'BBB']); session.setReady(1); session.setReady(2); };

test('con las 2 plazas llenas no empieza sola: hace falta que los dos pulsen LISTO y entonces hay cuenta atrás 2-1', () => {
  const { session, log, run } = setup();
  session.setPlayers(['AAA', null]);
  assert.equal(session.phase, 'LOBBY');
  session.setPlayers(['AAA', 'BBB']);
  assert.equal(session.phase, 'LOBBY', 'con los dos dentro todavía espera');
  run(5);
  assert.equal(session.phase, 'LOBBY');
  assert.equal(session.setReady(1), true);
  assert.deepEqual(session.ready, [true, false, false, false]);
  run(2);
  assert.equal(session.phase, 'LOBBY', 'con uno solo listo no empieza');
  session.setReady(2);
  assert.equal(session.phase, 'READY');
  run(2.1);
  assert.deepEqual(log.countdown, [2, 1]);
  assert.equal(session.phase, 'PLAYING');
  assert.deepEqual(log.phases, ['READY', 'PLAYING']);
});

test('si alguien se va durante la cuenta atrás se cancela, vuelve al lobby y los listos se borran', () => {
  const { session, log, run } = setup();
  bothReady(session);
  run(1);
  session.setPlayers(['AAA', null]);
  assert.equal(session.phase, 'LOBBY');
  assert.deepEqual(session.ready, [false, false, false, false]);
  run(5);
  assert.equal(session.phase, 'LOBBY');
  assert.deepEqual(log.phases, ['READY', 'LOBBY']);
});

test('modo automático: 1 jugador = solitario (1 contra 3 bots); solo hace falta su LISTO', () => {
  const { session, run } = setup();
  session.setPlayers(['AAA', null, null, null]);
  assert.equal(session.solo, true);
  assert.equal(session.plan.kind, 'solo');
  assert.deepEqual(session.allInitials, ['AAA', ...config.game.soloBots]);
  assert.equal(session.setReady(2), false, 'no hay segundo jugador');
  run(1);
  assert.equal(session.phase, 'LOBBY');
  session.setReady(1);
  assert.equal(session.phase, 'READY');
  run(2.1);
  assert.equal(session.phase, 'PLAYING');
  assert.equal(session.match.tanks.length, 4);
});

test('modo automático: 2 jugadores = 1 contra 1; 3 y 4 = todos contra todos; los bots solo existen con 1 jugador', () => {
  const { session } = setup();
  session.setPlayers(['AAA', 'BBB', null, null]);
  assert.deepEqual([session.plan.kind, session.plan.bots], ['duel', 0]);
  assert.equal(session.tankCount, 2);
  session.setPlayers(['AAA', 'BBB', 'CCC', null]);
  assert.deepEqual([session.plan.kind, session.plan.bots], ['brawl', 0]);
  assert.equal(session.tankCount, 3);
  session.setPlayers(['AAA', 'BBB', 'CCC', 'DDD']);
  assert.deepEqual([session.plan.kind, session.plan.bots, session.plan.teams], ['brawl', 0, null]);
  assert.equal(session.tankCount, 4);
  session.setPlayers(['AAA', null, null, null]);
  assert.deepEqual([session.plan.kind, session.plan.bots], ['solo', 3]);
});

test('una partida de 3 y otra de 4 jugadores arrancan con tantos tanques como jugadores', () => {
  const a = setup({ countdownS: 0.05 });
  a.session.setPlayers(['AAA', 'BBB', 'CCC', null]);
  for (const i of [1, 2, 3]) a.session.setReady(i);
  a.run(0.2);
  assert.equal(a.session.phase, 'PLAYING');
  assert.equal(a.session.match.tanks.length, 3);
  const b = setup({ countdownS: 0.05 });
  b.session.setPlayers(['AAA', 'BBB', 'CCC', 'DDD']);
  for (const i of [1, 2, 3, 4]) b.session.setReady(i);
  b.run(0.2);
  assert.equal(b.session.phase, 'PLAYING');
  assert.equal(b.session.match.tanks.length, 4);
});

test('los controles se ignoran fuera de la partida', () => {
  const { session } = setup();
  session.setMove(1, 1, 0);
  assert.equal(session.fire(1), false);
  assert.equal(session.match, null);
});

test('durante la partida el estado se emite a broadcastHz (60 por segundo: uno por tick)', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  bothReady(session);
  run(0.1);
  assert.equal(session.phase, 'PLAYING');
  log.states = 0;
  run(2);
  assert.ok(log.states >= 118 && log.states <= 122, `se emitieron ${log.states} estados en 2 s`);
});

test('con pasos un poco más cortos que 1/60 s (temporizador de Windows, ~15,6 ms) se sigue emitiendo en cada paso', () => {
  const { session, log } = setup({ countdownS: 0.05 });
  bothReady(session);
  for (let i = 0; i < 10; i++) session.tick(0.0156);
  assert.equal(session.phase, 'PLAYING');
  log.states = 0;
  for (let i = 0; i < 64; i++) session.tick(0.0156);
  assert.ok(log.states >= 63, `se emitieron ${log.states} estados en 64 pasos`);
});

test('los controles mueven el tanque y el disparo genera su evento', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  bothReady(session);
  run(0.1);
  session.setMove(1, 1, 0);
  run(0.5);
  assert.ok(session.match.tanks[0].x > 2.5 + 1);
  assert.equal(session.fire(1), true);
  run(DT * 2);
  assert.ok(log.events.some((e) => e.type === 'shot' && e.slot === 1));
});

test('al acabar el tiempo se anuncia el resultado y después se redirige y se libera todo', () => {
  const { session, log, run } = setup({ countdownS: 0.05, matchSeconds: 1, resultsS: 2 });
  bothReady(session);
  run(1.3);
  assert.equal(session.phase, 'GAME_OVER');
  assert.equal(log.gameOver.length, 1);
  assert.equal(log.gameOver[0].reason, 'draw');
  assert.equal(log.redirects, 0);
  run(2.1);
  assert.equal(log.redirects, 1);
  assert.equal(log.finished, 1);
  assert.equal(session.phase, 'LOBBY');
  assert.equal(session.match, null);
});

test('un jugador desconectado pierde por abandono pasado el tiempo de gracia', () => {
  const { session, log, run } = setup({ countdownS: 0.05, reconnectGraceS: 1 });
  bothReady(session);
  run(0.1);
  session.playerDisconnected(1);
  run(0.5);
  assert.equal(session.phase, 'PLAYING');
  assert.equal(session.fire(1), false, 'el jugador desconectado no puede actuar');
  run(0.6);
  assert.equal(session.phase, 'GAME_OVER');
  assert.equal(log.gameOver[0].winner, 2);
  assert.equal(log.gameOver[0].reason, 'forfeit');
});

test('el reset global devuelve cualquier fase al lobby y la partida deja de emitir', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  bothReady(session);
  run(0.5);
  assert.equal(session.phase, 'PLAYING');
  session.reset();
  assert.equal(session.phase, 'LOBBY');
  log.states = 0;
  run(1);
  assert.equal(log.states, 0);
  bothReady(session);
  assert.equal(session.phase, 'READY', 'se puede empezar otra partida tras el reset');
});

test('mapa: en aleatorio (por defecto) cada partida va a otro mapa; un mapa elegido se pone ya y se mantiene', () => {
  const arenas = [0, 1, 2].map((i) => createArena(i));
  const { session, run } = setup({ countdownS: 0.05, matchSeconds: 0.2, resultsS: 0.1, arenas });
  const play = () => { session.setPlayers(['AAA', 'BBB']); session.setReady(1); session.setReady(2); run(2); session.setPlayers([null, null]); };
  assert.equal(session.mapChoice, 'random');
  for (let k = 0; k < 6; k++) {
    const before = session.mapIndex;
    play();
    assert.equal(session.phase, 'LOBBY');
    assert.notEqual(session.mapIndex, before, 'aleatorio: nunca repite el mismo mapa seguido');
    assert.equal(session.arena, arenas[session.mapIndex]);
  }
  assert.equal(session.setMapChoice(2), true);
  assert.equal(session.mapIndex, 2, 'en el lobby el mapa elegido se pone ya');
  play();
  play();
  assert.equal(session.mapIndex, 2, 'un mapa fijo se mantiene partida tras partida');
  assert.equal(session.setMapChoice(7), false);
  assert.equal(session.setMapChoice('x'), false);
});

test('mapa: el sorteo del menú de pruebas respeta el selector (aleatorio sortea, un mapa fijo se queda)', () => {
  const arenas = [0, 1, 2].map((i) => createArena(i));
  let n = 0;
  const { session } = setup({ arenas, rng: () => [0.05, 0.4, 0.9][n++ % 3] });
  assert.equal(session.mapChoice, 'random');
  const seen = new Set();
  for (let i = 0; i < 9; i++) { assert.equal(session.rerollMap(), true); seen.add(session.mapIndex); }
  assert.ok(seen.size >= 2, 'en aleatorio el sorteo cambia de mapa');
  session.setMapChoice(1);
  for (let i = 0; i < 5; i++) { assert.equal(session.rerollMap(), false); assert.equal(session.mapIndex, 1, 'con un mapa fijo no cambia'); }
});

// --- Cuenta atrás de entrada (joinWindowS): corre mientras TODOS los conectados estén en LISTO; LISTO otra vez la cancela ---

test('cuenta atrás de entrada: con todos listos corre 3 s (con aviso cada segundo) y luego empieza la presentación', () => {
  const { session, log, run } = setup({ joinWindowS: 3, countdownS: 1 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1);
  assert.equal(session.joinLeft, null, 'falta el LISTO del segundo');
  session.setReady(2);
  assert.equal(session.joinLeft, 3);
  assert.equal(session.phase, 'LOBBY', 'sigue en el lobby: el QR sigue a la vista para quien quiera entrar');
  const avisos = log.phases.length;
  run(1.1);
  assert.equal(session.joinLeft, 2);
  assert.ok(log.phases.length > avisos, 'avisa cada segundo (lobby_state con joinLeft)');
  run(1.8);
  assert.equal(session.phase, 'LOBBY', 'todavía faltan unas décimas');
  run(0.3);
  assert.equal(session.phase, 'READY');
  assert.equal(session.joinLeft, null);
});

test('LISTO otra vez cancela la cuenta atrás de entrada, y volver a pulsarlo la reinicia desde el principio', () => {
  const { session, run } = setup({ joinWindowS: 3 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1); session.setReady(2);
  run(2.2);
  assert.equal(session.joinLeft, 1);
  assert.equal(session.setReady(2), true); // lo cancela
  assert.deepEqual(session.ready, [true, false, false, false]);
  assert.equal(session.joinLeft, null);
  run(5);
  assert.equal(session.phase, 'LOBBY', 'sin todos listos no empieza nunca');
  session.setReady(2);
  assert.equal(session.joinLeft, 3, 'vuelve a empezar desde 3');
});

test('si entra o se va alguien durante la cuenta atrás, se cancela (falta su LISTO) y, al volver todos a estar listos, empieza de nuevo', () => {
  const { session, run } = setup({ joinWindowS: 3 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1); session.setReady(2);
  run(1);
  session.setPlayers(['AAA', null]); // se va el segundo: el que queda sigue listo y la cuenta (ya en solitario) empieza de nuevo
  assert.equal(session.joinLeft, 3);
  assert.deepEqual(session.ready, [true, false, false, false]);
  session.setPlayers(['AAA', 'CCC']); // entra otro: aún no ha pulsado LISTO
  assert.equal(session.joinLeft, null);
  session.setReady(2);
  assert.equal(session.joinLeft, 3);
  run(3.1);
  assert.equal(session.phase, 'READY');
});

test('un cambio de jugadores con todos listos (solitario: se vuelve a avisar de la sala) reinicia la cuenta atrás', () => {
  const { session, run } = setup({ joinWindowS: 3 });
  session.setPlayers(['AAA', null]);
  session.setReady(1);
  run(2.2);
  assert.equal(session.joinLeft, 1);
  session.setPlayers(['AAA', null]);
  assert.equal(session.joinLeft, 3);
});

test('sin joinWindowS no hay cuenta atrás (empieza al instante)', () => {
  const instant = setup({ joinWindowS: 0, countdownS: 0.05 });
  instant.session.setPlayers(['AAA', 'BBB']);
  instant.session.setReady(1); instant.session.setReady(2);
  assert.equal(instant.session.phase, 'READY');
});

test('dificultad: STAND por defecto, PRO se elige aparte, un valor inválido se ignora y el reset global no la borra; en STAND el jugador solo tiene una vida más', () => {
  const { session, run } = setup({ countdownS: 0.05 });
  assert.equal(session.difficulty, 'stand');
  assert.equal(session.setDifficulty('pro'), true);
  assert.equal(session.setDifficulty('pro'), false);
  assert.equal(session.setDifficulty('imposible'), false);
  session.reset();
  assert.equal(session.difficulty, 'pro');
  session.setPlayers(['AAA']);
  session.setReady(1);
  run(0.3);
  assert.equal(session.match.stats[0].lives, config.game.soloPlayerLives, 'PRO: las vidas de siempre');
  session.reset();
  session.setDifficulty('stand');
  session.setPlayers(['AAA']);
  session.setReady(1);
  run(0.3);
  assert.equal(session.match.stats[0].lives, config.game.soloPlayerLives + 1, 'STAND: una vida más');
});
