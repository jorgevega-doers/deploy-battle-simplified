import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../shared/arena.js';
import { rectLoop, loopPoint, loopClear, sidewalkLoops, laneLoops, nearestThreat, fleeDirection } from '../client/host/lifePaths.js';

const arena = createArena();
const p = { x: 0, y: 0, heading: 0 };

test('un bucle es continuo: cada esquina se alcanza y se vuelve al principio', () => {
  const loop = rectLoop(1, 2, 5, 4); // 4 x 2
  assert.equal(loop.length, 12);
  assert.deepEqual({ ...loopPoint(loop, 0, 1, p) }, { x: 1, y: 2, heading: 0 });
  assert.deepEqual({ ...loopPoint(loop, 4, 1, p) }, { x: 5, y: 2, heading: Math.PI / 2 });
  assert.deepEqual({ ...loopPoint(loop, 6, 1, p) }, { x: 5, y: 4, heading: Math.PI });
  assert.deepEqual({ ...loopPoint(loop, 10, 1, p) }, { x: 1, y: 4, heading: -Math.PI / 2 });
  const wrapped = { ...loopPoint(loop, 12, 1, p) };
  assert.deepEqual({ x: wrapped.x, y: wrapped.y }, { x: 1, y: 2 });
  assert.deepEqual({ ...loopPoint(loop, -2, 1, p) }, { ...loopPoint(loop, 10, 1, p) });
});

test('en sentido contrario el rumbo se invierte', () => {
  const loop = rectLoop(0, 0, 4, 4);
  const ccw = loopPoint(loop, 1, 1, { x: 0, y: 0, heading: 0 }).heading;
  const cw = loopPoint(loop, 1, -1, { x: 0, y: 0, heading: 0 }).heading;
  assert.ok(Math.abs(Math.abs(cw - ccw) - Math.PI) < 1e-9);
});

test('las aceras rodean los edificios sueltos del mapa y no pisan ningún muro', () => {
  const loops = sidewalkLoops(arena);
  // 13 obstáculos + la acera del borde; los dos pares de edificios pegados (formas en L) no tienen acera rectangular y se saltan.
  assert.equal(loops.length, arena.obstacles.length + 1 - 4, 'edificios sueltos + borde');
  for (const loop of loops) assert.ok(loopClear(loop, arena, 0.05), 'acera dentro del suelo libre');
});

test('los carriles del anillo de la calle están libres con margen para un coche', () => {
  const lanes = laneLoops(arena);
  assert.equal(lanes.length, 2);
  for (const { loop } of lanes) assert.ok(loopClear(loop, arena, 0.3));
});

test('nearestThreat elige lo más cercano (tanque o proyectil) y respeta el radio', () => {
  const state = { tanks: [{ x: 10, y: 10 }, { x: 20, y: 5 }], projectileCount: 1, projectiles: [{ x: 11, y: 10.5 }] };
  const out = { x: 0, y: 0, d: 0 };
  assert.equal(nearestThreat(10.5, 10, state, 3, 2, out), true);
  assert.equal(out.x, 10); // el tanque (0,5 de distancia) gana al proyectil (0,7)
  assert.equal(nearestThreat(0, 0, state, 3, 2, out), false, 'nada cerca');
  assert.equal(nearestThreat(0, 0, null, 3, 2, out), false, 'sin partida');
});

test('huir es alejarse: el sentido elegido deja más lejos a la amenaza', () => {
  const loop = rectLoop(0, 0, 10, 10);
  // Amenaza a la derecha del punto s = 5 (borde de abajo): hay que ir hacia la izquierda (sentido -1).
  assert.equal(fleeDirection(loop, 5, 9, 0), -1);
  assert.equal(fleeDirection(loop, 5, 1, 0), 1);
});
