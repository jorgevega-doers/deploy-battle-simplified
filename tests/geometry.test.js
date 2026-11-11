import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reflect, raycastGrid, tracePath, moveBoxX, moveBoxY, boxesOverlap, segmentBoxHit,
} from '../shared/geometry.js';
import { createArena } from '../shared/arena.js';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} no es ${expected}`);
// Sala vacía de 10 x 10 con un único muro en la celda indicada (fuera de la sala todo es muro).
const roomWith = (wx, wy) => (cx, cy) => cx < 0 || cy < 0 || cx > 9 || cy > 9 || (cx === wx && cy === wy);

test('reflect invierte la componente que va contra el muro', () => {
  const r1 = reflect(1, 0, -1, 0);
  near(r1.x, -1); near(r1.y, 0);
  const s = Math.SQRT1_2;
  const r2 = reflect(s, s, 0, -1);
  near(r2.x, s); near(r2.y, -s);
});

test('raycastGrid: golpea un muro a la derecha con su normal', () => {
  const out = {};
  assert.equal(raycastGrid(roomWith(5, 3), 2.5, 3.5, 1, 0, 100, out), true);
  near(out.t, 2.5); near(out.x, 5); near(out.nx, -1); near(out.ny, 0);
});

test('raycastGrid: golpea un muro a la izquierda y por arriba', () => {
  const out = {};
  assert.equal(raycastGrid(roomWith(1, 3), 4.5, 3.5, -1, 0, 100, out), true);
  near(out.t, 2.5); near(out.x, 2); near(out.nx, 1);
  assert.equal(raycastGrid(roomWith(3, 6), 3.5, 3.5, 0, 1, 100, out), true);
  near(out.t, 2.5); near(out.y, 6); near(out.ny, -1);
});

test('raycastGrid: no hay golpe si el muro está más lejos que maxDist', () => {
  assert.equal(raycastGrid(roomWith(5, 3), 2.5, 3.5, 1, 0, 2, {}), false);
});

test('raycastGrid: en diagonal avanza celda a celda y para en el borde de la sala', () => {
  const out = {};
  const angle = Math.PI / 6;
  assert.equal(raycastGrid(roomWith(-5, -5), 1.5, 1.5, Math.cos(angle), Math.sin(angle), 100, out), true);
  near(out.x, 10, 1e-9);
  near(out.nx, -1);
  near(out.y, 1.5 + (10 - 1.5) * Math.tan(angle), 1e-9);
});

test('raycastGrid: un punto dentro de un muro choca de inmediato', () => {
  const out = {};
  assert.equal(raycastGrid(roomWith(4, 4), 4.5, 4.5, 1, 0, 10, out), true);
  near(out.t, 0);
});

test('tracePath: recorrido con rebotes en la arena real', () => {
  const arena = createArena();
  const pts = tracePath(arena.solid, 2.5, 2.5, 0, 2, 100, []);
  // Sale a la derecha por la fila libre de abajo, rebota en el muro derecho, vuelve hasta el izquierdo y rebota otra vez.
  assert.equal(pts.length, 8);
  near(pts[2], arena.width - 1, 1e-4); near(pts[4], 1, 1e-4); near(pts[6], arena.width - 1, 1e-4);
});

test('tracePath: respeta la longitud máxima', () => {
  const arena = createArena();
  const pts = tracePath(arena.solid, 2.5, 2.5, 0, 3, 5, []);
  assert.equal(pts.length, 4);
  near(pts[2], 7.5);
});

test('moveBoxX/Y: se paran pegadas al muro y no lo atraviesan', () => {
  const solid = roomWith(5, 3);
  const pos = { x: 3.9, y: 3.5 };
  moveBoxX(solid, pos, 1.0, 0.5);
  near(pos.x, 4.5);
  moveBoxX(solid, pos, 0.1, 0.5); // ya pegado: no avanza
  near(pos.x, 4.5);
  const up = { x: 3.5, y: 3.5 };
  moveBoxY(roomWith(3, 6), up, 5, 0.5);
  near(up.y, 5.5);
  const left = { x: 4.0, y: 3.5 };
  moveBoxX(roomWith(2, 3), left, -2, 0.5);
  near(left.x, 3.5);
});

test('moveBoxX: una caja que ocupa dos filas choca con un muro en cualquiera de ellas', () => {
  const pos = { x: 3.5, y: 3.0 }; // ocupa las filas 2 y 3
  moveBoxX(roomWith(5, 2), pos, 2, 0.5);
  near(pos.x, 4.5);
});

test('moveBoxX: sin muros se mueve la distancia completa', () => {
  const pos = { x: 3.5, y: 3.5 };
  moveBoxX(roomWith(9, 9), pos, 0.3, 0.5);
  near(pos.x, 3.8);
});

test('boxesOverlap', () => {
  assert.equal(boxesOverlap(0, 0, 0.5, 0.9, 0, 0.5), true);
  assert.equal(boxesOverlap(0, 0, 0.5, 1.0, 0, 0.5), false);
  assert.equal(boxesOverlap(0, 0, 0.5, 0.2, 1.2, 0.5), false);
});

test('segmentBoxHit: entrada, fallo y segmento que empieza dentro', () => {
  near(segmentBoxHit(0, 0, 10, 0, 5, 0, 0.5), 0.45);
  assert.equal(segmentBoxHit(0, 2, 10, 2, 5, 0, 0.5), -1);
  assert.equal(segmentBoxHit(0, 0, 3, 0, 5, 0, 0.5), -1); // se queda corto
  near(segmentBoxHit(5, 0, 8, 0, 5, 0, 0.5), 0);
  assert.equal(segmentBoxHit(0, 5, 0, 0, 5, 0, 0.5), -1);
});
