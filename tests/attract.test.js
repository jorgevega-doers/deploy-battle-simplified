import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';
import { createAttract } from '../server/game/attract.js';

const DT = 1 / 60;
function setup(gameConfig = {}) {
  const log = { states: 0, events: [] };
  const attract = createAttract({
    arena: createArena(),
    cfg: { ...config.game, introS: 0, ...gameConfig },
    out: { state: () => { log.states++; }, events: (list) => log.events.push(...list) },
  });
  return { attract, log };
}

test('parado no hace nada; al arrancar emite estados y avisa del reinicio', () => {
  const { attract, log } = setup();
  attract.tick(DT);
  assert.equal(log.states, 0);
  attract.start();
  assert.equal(attract.running, true);
  assert.deepEqual(log.events.map((e) => e.type), ['attract_reset']);
  for (let i = 0; i < 120; i++) attract.tick(DT);
  assert.ok(log.states >= 100, `estados enviados: ${log.states}`);
});

test('los bots juegan de verdad: disparan y se mueven', () => {
  const { attract, log } = setup();
  attract.start();
  for (let i = 0; i < 60 * 20; i++) attract.tick(DT);
  assert.ok(log.events.some((e) => e.type === 'shot'), 'algún disparo en 20 s');
});

test('al acabar la partida espera y empieza otra sola', () => {
  const { attract, log } = setup({ matchSeconds: 2 });
  attract.start();
  for (let i = 0; i < 60 * 12; i++) attract.tick(DT); // 2 s de partida + pausa de 4,5 s + otra partida
  assert.ok(log.events.some((e) => e.type === 'match_over'));
  assert.ok(log.events.filter((e) => e.type === 'attract_reset').length >= 2, 'empezó una segunda partida');
});

test('parar la partida de fondo la descarta', () => {
  const { attract, log } = setup();
  attract.start();
  attract.stop();
  const before = log.states;
  attract.tick(DT);
  assert.equal(attract.running, false);
  assert.equal(log.states, before);
});
