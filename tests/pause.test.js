// Pausa y SALIR de la versión pública: pause.js (límites) y su uso en la sesión (la partida se congela y quien sale pierde al momento).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPause } from '../server/game/pause.js';
import { createSession } from '../server/game/session.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';

const DT = 1 / config.game.tickHz;

test('pausa: 10 s como mucho, cualquiera la quita, 2 por partida y 30 s de espera entre una y otra', () => {
  const log = [];
  const out = { pause: (s) => log.push(s) };
  const p = createPause({ maxS: 10, cooldownS: 30, perMatch: 2 });
  assert.equal(p.request(1, true, out), true);
  assert.deepEqual(p.request(2, true, out), { denied: 'busy' }, 'ya está en pausa');
  for (let i = 0; i < 9.5 / DT; i++) assert.equal(p.tick(DT, out), true);
  assert.equal(p.paused, true);
  for (let i = 0; i < 1 / DT; i++) p.tick(DT, out);
  assert.equal(p.paused, false, 'a los 10 s sigue sola');
  assert.deepEqual(log.at(-1), { by: null });
  assert.equal(p.request(1, true, out).denied, 'cooldown', 'recién usada: hay que esperar');
  for (let i = 0; i < 31 / DT; i++) p.tick(DT, out);
  assert.equal(p.request(1, true, out), true);
  assert.equal(p.request(2, false, out), true, 'otro jugador la quita');
  for (let i = 0; i < 31 / DT; i++) p.tick(DT, out);
  assert.deepEqual(p.request(1, true, out), { denied: 'limit' }, 'ya usó sus 2 pausas');
  assert.equal(p.request(2, true, out), true, 'las del otro son suyas');
});

test('sesión: en pausa el reloj no corre; SALIR elimina al jugador y la partida sigue con los demás (o acaba)', () => {
  const pauses = [];
  const session = createSession({
    arena: createArena(), cfg: { ...config.game, introS: 0, joinWindowS: 0, countdownS: 0 },
    out: { phase() {}, countdown() {}, state() {}, events() {}, gameOver() {}, redirect() {}, finished() {}, pause: (s) => pauses.push(s) },
  });
  session.setPlayers(['AAA', 'BBB', 'CCC']);
  session.setReady(1); session.setReady(2); session.setReady(3);
  for (let i = 0; i < 6 / DT && session.phase !== 'PLAYING'; i++) session.tick(DT);
  assert.equal(session.phase, 'PLAYING');
  assert.equal(session.requestPause(2, true), true);
  assert.equal(session.paused, true);
  assert.deepEqual(pauses[0], { by: 2, left: 10 });
  session.quit(1); // sale con la partida en pausa: la pausa se quita y AAA queda fuera
  assert.equal(session.paused, false);
  for (let i = 0; i < 0.2 / DT; i++) session.tick(DT);
  assert.equal(session.phase, 'PLAYING', 'con 3 jugadores, si sale uno siguen los otros dos');
  session.quit(2);
  for (let i = 0; i < 0.2 / DT; i++) session.tick(DT);
  assert.equal(session.phase, 'GAME_OVER', 'queda uno: gana');
});
