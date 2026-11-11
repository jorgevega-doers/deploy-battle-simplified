import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotBuffer } from '../client/host/interpolation.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} no es ${expected}`);
// Estado mínimo con el formato de state_update.
const snap = ({ t = 0, tanks = [[0, 0, 0, 3, 0], [10, 10, 0, 3, 0]], projectiles = [] } = {}) => (
  { t, timeLeft: 100, frozen: 0, tanks, projectiles, powerups: [[1, 0, 5, 5]], effects: [[], []] }
);

test('sin estados no hay nada que dibujar', () => {
  assert.equal(createSnapshotBuffer().sample(1000), null);
});

test('mezcla dos estados según el instante (con el retraso configurado)', () => {
  const buffer = createSnapshotBuffer({ delayMs: 50 });
  buffer.push(snap({ t: 0, tanks: [[0, 0, 0, 3, 0], [10, 10, 0, 3, 0]] }), 1000);
  buffer.push(snap({ t: 33, tanks: [[1, 2, 0, 3, 0], [10, 10, 0, 3, 0]] }), 1100);
  const half = buffer.sample(1075); // objetivo 1025 = 25% entre 1000 y 1100
  near(half.tanks[0].x, 0.25);
  near(half.tanks[0].y, 0.5);
  near(half.t, 8.25);
});

test('los ángulos se interpolan por el camino corto', () => {
  const buffer = createSnapshotBuffer({ delayMs: 0 });
  buffer.push(snap({ tanks: [[0, 0, 3.0, 3, 0], [0, 0, 0, 3, 0]] }), 0);
  buffer.push(snap({ tanks: [[0, 0, -3.0, 3, 0], [0, 0, 0, 3, 0]] }), 100);
  const mid = buffer.sample(50).tanks[0].aim;
  // El camino corto de 3,0 a -3,0 pasa por π (≈3,14), no por 0.
  assert.ok(Math.abs(mid) > 3.0, `el ángulo intermedio ${mid} debería estar cerca de π`);
});

test('un salto grande (reinicio de ronda) se coloca directamente sin deslizarse', () => {
  const buffer = createSnapshotBuffer({ delayMs: 0 });
  buffer.push(snap({ tanks: [[15, 15, 0, 3, 0], [10, 10, 0, 3, 0]] }), 0);
  buffer.push(snap({ tanks: [[2.5, 2.5, 0, 2, 0], [10, 10, 0, 3, 0]] }), 100);
  const mid = buffer.sample(50);
  near(mid.tanks[0].x, 2.5);
  near(mid.tanks[0].y, 2.5);
  assert.equal(mid.tanks[0].lives, 2);
});

test('los proyectiles se emparejan por id; los nuevos aparecen donde están', () => {
  const buffer = createSnapshotBuffer({ delayMs: 0 });
  buffer.push(snap({ projectiles: [[1, 0, 0, 0, 1]] }), 0);
  buffer.push(snap({ projectiles: [[2, 9, 9, 1, 2], [1, 4, 0, 0, 1]] }), 100); // el 2 es nuevo (de P2); el 1 se movió 4
  const mid = buffer.sample(50);
  assert.equal(mid.projectileCount, 2);
  const byId = Object.fromEntries(mid.projectiles.slice(0, 2).map((p) => [p.id, { ...p }]));
  near(byId[1].x, 2);
  near(byId[2].x, 9);
  assert.equal(byId[2].aoe, 1);
  assert.equal(byId[2].owner, 2);
  assert.equal(byId[1].owner, 1);
});

test('si el servidor deja de enviar se mantiene el último estado (no se extrapola)', () => {
  const buffer = createSnapshotBuffer({ delayMs: 0 });
  buffer.push(snap({ tanks: [[0, 0, 0, 3, 0], [0, 0, 0, 3, 0]] }), 0);
  buffer.push(snap({ tanks: [[5, 0, 0, 3, 0], [0, 0, 0, 3, 0]] }), 100);
  near(buffer.sample(5000).tanks[0].x, 5);
});

test('antes del primer estado se muestra el primero y los power-ups pasan tal cual', () => {
  const buffer = createSnapshotBuffer({ delayMs: 70 });
  buffer.push(snap({ tanks: [[3, 3, 0, 3, 0], [0, 0, 0, 3, 0]] }), 1000);
  const first = buffer.sample(1010); // objetivo 940: aún no hay nada tan antiguo
  near(first.tanks[0].x, 3);
  assert.deepEqual(first.powerups, [[1, 0, 5, 5]]);
});

test('el buffer no crece sin límite y clear() lo vacía', () => {
  const buffer = createSnapshotBuffer({ capacity: 4 });
  for (let i = 0; i < 20; i++) buffer.push(snap({ t: i }), i * 33);
  assert.equal(buffer.size, 4);
  buffer.clear();
  assert.equal(buffer.size, 0);
  assert.equal(buffer.sample(1000), null);
});

test('no se crean objetos nuevos entre una llamada y otra (se reutiliza el mismo resultado)', () => {
  const buffer = createSnapshotBuffer({ delayMs: 0 });
  buffer.push(snap(), 0);
  buffer.push(snap(), 100);
  assert.equal(buffer.sample(10), buffer.sample(60));
});
