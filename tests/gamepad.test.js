// Mandos físicos: configuración por defecto (estándar y genérica en Windows / Linux), lectura de botones y gatillos, la configuración aprendida
// y el giro suave del apuntado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMapping, isPressed, axisValue, detectInput, turnToward } from '../client/host/gamepadMap.js';

const pad = ({ mapping = '', axes = 10, pressed = [], values = {} } = {}) => ({
  mapping,
  axes: Array.from({ length: axes }, (_, i) => values[i] ?? 0),
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

test('configuración por defecto: estándar, genérico en Windows (stick derecho en ejes 2 y 5) y en Linux (2 y 3)', () => {
  const std = defaultMapping(pad({ mapping: 'standard', axes: 4 }), 'Windows NT');
  assert.deepEqual([std.start.i, std.select.i, std.dash.i, std.fire.i, std.rx.i, std.ry.i], [9, 8, 4, 5, 2, 3], 'estándar: impulso L1/LB (4) y disparo R1/RB (5)');
  assert.equal(defaultMapping(pad({ axes: 10 }), 'Mozilla/5.0 (Windows NT 10.0)').ry.i, 5);
  assert.equal(defaultMapping(pad({ axes: 6 }), 'Mozilla/5.0 (X11; Linux x86_64)').ry.i, 3);
});

test('botones, gatillos analógicos y sticks se leen con su configuración', () => {
  const m = defaultMapping(pad({ mapping: 'standard', axes: 4 }));
  assert.equal(isPressed(pad({ pressed: [9, 8] }), m.start) && isPressed(pad({ pressed: [9, 8] }), m.select), true);
  assert.equal(isPressed(pad({ pressed: [9] }), m.select), false);
  const trigger = { t: 'a', i: 4, sign: 1, rest: -1 }; // gatillo que reposa en -1 (algunos mandos en Linux)
  assert.equal(isPressed(pad({ values: { 4: -1 } }), trigger), false);
  assert.equal(isPressed(pad({ values: { 4: 0.2 } }), trigger), true);
  assert.equal(axisValue(pad({ values: { 1: 0.8 } }), { i: 1, sign: -1 }), -0.8);
});

test('la configuración aprende botones, gatillos y sticks a partir del reposo', () => {
  const rest = Array(10).fill(0);
  assert.deepEqual(detectInput(pad({ pressed: [3] }), 'start', rest), { t: 'b', i: 3 });
  assert.deepEqual(detectInput(pad({ values: { 5: 1 } }), 'fire', rest), { t: 'a', i: 5, sign: 1, rest: 0 });
  assert.deepEqual(detectInput(pad({ values: { 2: -0.9 } }), 'rx', rest), { i: 2, sign: -1 });
  assert.equal(detectInput(pad({ pressed: [1] }), 'lx', rest), null, 'un stick no se configura con un botón');
  assert.equal(detectInput(pad(), 'start', rest), null);
});

test('el apuntado gira hacia el objetivo por el camino corto y sin pasarse (suaviza los saltos de 45° de un stick de 8 direcciones)', () => {
  assert.equal(turnToward(0, 0.2, 0.5), 0.2, 'si llega, llega');
  assert.ok(Math.abs(turnToward(0, Math.PI / 4, 0.3) - 0.3) < 1e-9, 'avanza como mucho el paso');
  assert.ok(turnToward(3, -3, 0.2) > 3, 'de 3 rad a -3 rad se pasa por π, no por 0');
  assert.ok(Math.abs(turnToward(-3, 3, 0.2) - (-3.2)) < 1e-9);
  let a = 0;
  for (let i = 0; i < 20 && a !== Math.PI / 4; i++) a = turnToward(a, Math.PI / 4, 0.1);
  assert.equal(a, Math.PI / 4);
});
