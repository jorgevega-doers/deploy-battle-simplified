import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../server/game/session.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';

const DT = 1 / config.game.tickHz;
// broadcastHz 60 = un estado por tick (las comprobaciones de ritmo están calculadas así); joinWindowS 0 = JUGAR empieza al instante (hay tests propios).
const cfgWith = (overrides = {}) => ({ ...config.game, broadcastHz: 60, introS: 0, joinWindowS: 0, soloJoinWindowS: 0, ...overrides });

// Sesión con un "out" que anota todo lo que ocurre.
function setup(overrides = {}) {
  const { arenas, rng, ...cfgOverrides } = overrides;
  const log = { phases: [], countdown: [], states: 0, events: [], gameOver: [], finished: 0 };
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
      finished: () => { log.finished++; },
    },
  });
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) session.tick(DT); };
  return { session, log, run };
}

// Dos jugadores en la sala y uno pulsa JUGAR.
const duel = (session) => { session.setPlayers(['AAA', 'BBB']); session.setReady(1); };

test('con gente en la sala no empieza sola: una sola persona pulsa JUGAR y empieza la presentación con su cuenta atrás 2-1', () => {
  const { session, log, run } = setup();
  session.setPlayers(['AAA', 'BBB']);
  run(5);
  assert.equal(session.phase, 'LOBBY', 'nadie ha pulsado JUGAR');
  assert.equal(session.setReady(2), true, 'cualquiera puede pulsarlo');
  assert.equal(session.phase, 'READY');
  run(2.1);
  assert.deepEqual(log.countdown, [2, 1]);
  assert.equal(session.phase, 'PLAYING');
  assert.deepEqual(log.phases, ['READY', 'PLAYING']);
});

test('si alguien del plan se va durante la presentación, se cancela y se vuelve a la sala', () => {
  const { session, log, run } = setup();
  duel(session);
  run(1);
  session.setPlayers(['AAA', null]);
  assert.equal(session.phase, 'LOBBY');
  run(5);
  assert.equal(session.phase, 'LOBBY', 'no vuelve a arrancar sola');
  assert.deepEqual(log.phases, ['READY', 'LOBBY']);
});

test('1 jugador = solitario (1 contra 3 bots); una plaza vacía no puede pulsar JUGAR', () => {
  const { session, run } = setup();
  session.setPlayers(['AAA', null, null, null]);
  assert.equal(session.solo, true);
  assert.equal(session.plan.kind, 'solo');
  assert.deepEqual(session.tankNames, ['AAA', ...config.game.soloBots]);
  assert.equal(session.setReady(2), false, 'no hay segundo jugador');
  run(1);
  assert.equal(session.phase, 'LOBBY');
  session.setReady(1);
  assert.equal(session.phase, 'READY');
  run(2.1);
  assert.equal(session.phase, 'PLAYING');
  assert.equal(session.match.tanks.length, 4);
});

test('2 jugadores = 1 contra 1; 3 y 4 = todos contra todos; los bots solo existen con 1 jugador', () => {
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
  a.session.setReady(3);
  a.run(0.2);
  assert.equal(a.session.phase, 'PLAYING');
  assert.equal(a.session.match.tanks.length, 3);
  const b = setup({ countdownS: 0.05 });
  b.session.setPlayers(['AAA', 'BBB', 'CCC', 'DDD']);
  b.session.setReady(1);
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

test('durante la partida el estado se emite a broadcastHz (con 60: uno por tick)', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  duel(session);
  run(0.1);
  assert.equal(session.phase, 'PLAYING');
  log.states = 0;
  run(2);
  assert.ok(log.states >= 118 && log.states <= 122, `se emitieron ${log.states} estados en 2 s`);
});

test('con el ritmo de producción (30 estados/s) sale uno de cada dos ticks', () => {
  const { session, log, run } = setup({ countdownS: 0.05, broadcastHz: config.game.broadcastHz });
  duel(session);
  run(0.1);
  log.states = 0;
  run(2);
  assert.ok(log.states >= 58 && log.states <= 62, `se emitieron ${log.states} estados en 2 s`);
});

test('con pasos un poco más cortos que 1/60 s (temporizador de Windows, ~15,6 ms) se sigue emitiendo en cada paso', () => {
  const { session, log } = setup({ countdownS: 0.05 });
  duel(session);
  for (let i = 0; i < 10; i++) session.tick(0.0156);
  assert.equal(session.phase, 'PLAYING');
  log.states = 0;
  for (let i = 0; i < 64; i++) session.tick(0.0156);
  assert.ok(log.states >= 63, `se emitieron ${log.states} estados en 64 pasos`);
});

test('los controles mueven el tanque y el disparo genera su evento', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  duel(session);
  run(0.1);
  session.setMove(1, 1, 0);
  run(0.5);
  assert.ok(session.match.tanks[0].x > 2.5 + 1);
  assert.equal(session.fire(1), true);
  run(DT * 2);
  assert.ok(log.events.some((e) => e.type === 'shot' && e.slot === 1));
});

test('al acabar el tiempo se anuncia el resultado y, tras los resultados, se vuelve a la sala sin arrancar sola', () => {
  const { session, log, run } = setup({ countdownS: 0.05, matchSeconds: 1, resultsS: 2 });
  duel(session);
  run(1.3);
  assert.equal(session.phase, 'GAME_OVER');
  assert.equal(log.gameOver.length, 1);
  assert.equal(log.gameOver[0].reason, 'draw');
  assert.equal(log.finished, 0);
  run(2.1);
  assert.equal(log.finished, 1);
  assert.equal(session.phase, 'LOBBY');
  assert.equal(session.match, null);
  session.setPlayers(['AAA', 'BBB']); // sockets.js vuelve a meter a los que siguen conectados
  run(3);
  assert.equal(session.phase, 'LOBBY', 'hay que volver a pulsar JUGAR');
});

test('un jugador desconectado pierde por abandono pasado el tiempo de gracia', () => {
  const { session, log, run } = setup({ countdownS: 0.05, reconnectGraceS: 1 });
  duel(session);
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

test('el reset (modo dev) devuelve cualquier fase a la sala y la partida deja de emitir', () => {
  const { session, log, run } = setup({ countdownS: 0.05 });
  duel(session);
  run(0.5);
  assert.equal(session.phase, 'PLAYING');
  session.reset();
  assert.equal(session.phase, 'LOBBY');
  log.states = 0;
  run(1);
  assert.equal(log.states, 0);
  duel(session);
  assert.equal(session.phase, 'READY', 'se puede empezar otra partida tras el reset');
});

test('mapa: en aleatorio (por defecto) cada partida va a otro mapa; un mapa elegido se pone ya y se mantiene', () => {
  const arenas = [0, 1, 2].map((i) => createArena(i));
  const { session, run } = setup({ countdownS: 0.05, matchSeconds: 0.2, resultsS: 0.1, arenas });
  const play = () => { duel(session); run(2); session.setPlayers([null, null]); };
  assert.equal(session.mapChoice, 'random');
  for (let k = 0; k < 6; k++) {
    const before = session.mapIndex;
    play();
    assert.equal(session.phase, 'LOBBY');
    assert.notEqual(session.mapIndex, before, 'aleatorio: nunca repite el mismo mapa seguido');
    assert.equal(session.arena, arenas[session.mapIndex]);
  }
  assert.equal(session.setMapChoice(2), true);
  assert.equal(session.mapIndex, 2, 'en la sala el mapa elegido se pone ya');
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

// --- Cuenta atrás de JUGAR (joinWindowS) ---

test('cuenta atrás: JUGAR la arranca (aviso cada segundo) y al llegar a 0 empieza la presentación con quien haya', () => {
  const { session, log, run } = setup({ joinWindowS: 3, countdownS: 1 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1);
  assert.equal(session.joinLeft, 3);
  assert.equal(session.phase, 'LOBBY');
  const avisos = log.phases.length;
  run(1.1);
  assert.equal(session.joinLeft, 2);
  assert.ok(log.phases.length > avisos, 'avisa cada segundo (lobby_state con joinLeft)');
  run(1.8);
  assert.equal(session.phase, 'LOBBY', 'todavía faltan unas décimas');
  run(0.3);
  assert.equal(session.phase, 'READY');
  assert.equal(session.joinLeft, null);
  assert.equal(session.match, null);
  assert.equal(session.plan.humans, 2);
});

test('contra los bots usa soloJoinWindowS', () => {
  const { session } = setup({ joinWindowS: 3, soloJoinWindowS: 5 });
  session.setPlayers(['AAA']);
  session.setReady(1);
  assert.equal(session.joinLeft, 5);
});

test('cancelar: no en el primer instante (doble clic), como mucho maxCancels veces por jugador, y JUGAR otra vez la reinicia', () => {
  const { session, run } = setup({ joinWindowS: 5, cancelGuardS: 0.8, maxCancels: 2 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1);
  assert.equal(session.setReady(1), false, 'el segundo clic del doble clic no la cancela');
  assert.equal(session.joinLeft, 5);
  run(1);
  assert.equal(session.setReady(2), true, 'cualquiera la cancela');
  assert.equal(session.joinLeft, null);
  assert.deepEqual(session.cancelsLeft, [2, 1, 2, 2]);
  run(6);
  assert.equal(session.phase, 'LOBBY', 'cancelada no empieza nunca');
  session.setReady(1);
  assert.equal(session.joinLeft, 5, 'vuelve a empezar desde el principio');
  run(1);
  session.setReady(2);
  session.setReady(1);
  run(1.05);
  assert.equal(session.setReady(2), false, 'ya no le quedan cancelaciones');
  assert.equal(session.joinLeft, 4);
});

test('si entra alguien la cuenta atrás vuelve a empezar; si se va, sigue; si se van todos, se para', () => {
  const { session, run } = setup({ joinWindowS: 3 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1);
  run(1.2);
  assert.equal(session.joinLeft, 2);
  session.setPlayers(['AAA', 'BBB', 'CCC']);
  assert.equal(session.joinLeft, 3, 'entra alguien: otra vez desde el principio');
  run(1.2);
  session.setPlayers(['AAA', 'CCC']);
  assert.equal(session.joinLeft, 2, 'se va alguien: sigue');
  session.setPlayers([null, null]);
  assert.equal(session.joinLeft, null, 'sin nadie se para');
  run(5);
  assert.equal(session.phase, 'LOBBY');
});

test('quien se va deja de contar sus cancelaciones (si vuelve, empieza de cero)', () => {
  const { session, run } = setup({ joinWindowS: 5, cancelGuardS: 0, maxCancels: 1 });
  session.setPlayers(['AAA', 'BBB']);
  session.setReady(1);
  run(0.1);
  session.setReady(2);
  assert.deepEqual(session.cancelsLeft.slice(0, 2), [1, 0]);
  session.setPlayers(['AAA', null]);
  assert.deepEqual(session.cancelsLeft.slice(0, 2), [1, 1]);
});

test('dificultad: MEDIA por defecto, PRO y FÁCIL se eligen aparte, un valor inválido se ignora y el reset no la borra; en FÁCIL el jugador tiene una vida más', () => {
  const { session, run } = setup({ countdownS: 0.05 });
  assert.equal(session.difficulty, 'media');
  assert.equal(session.setDifficulty('pro'), true);
  assert.equal(session.setDifficulty('pro'), false);
  assert.equal(session.setDifficulty('imposible'), false);
  session.reset();
  assert.equal(session.difficulty, 'pro');
  session.setPlayers(['AAA']);
  session.setReady(1);
  run(0.3);
  assert.equal(session.match.stats[0].lives, config.game.lives, 'PRO: las vidas de siempre');
  session.reset();
  session.setDifficulty('stand');
  session.setPlayers(['AAA']);
  session.setReady(1);
  run(0.3);
  assert.equal(session.match.stats[0].lives, config.game.lives + 1, 'FÁCIL: una vida más');
});
