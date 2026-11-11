import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createArena, MAPS } from '../shared/arena.js';
import { createCity, cityFaces } from '../shared/city/index.js';
import { faceVisible, CAMERA_X, TEXELS_PER_CELL } from '../shared/city/parts.js';
import { packRects, paintCityAtlas } from '../shared/art/cityAtlas.js';
import { paintStreet } from '../shared/art/paint/street.js';
import { createRng } from '../shared/art/rng.js';

for (const [mapIndex, map] of MAPS.entries()) describe(`ciudad del mapa ${map.name}`, () => {
const arena = createArena(mapIndex);
const city = createCity(arena);
const interior = city.buildings.slice(0, arena.obstacles.length);
const EPS = 1e-9;
// Piezas apoyadas en el suelo (cuerpo del edificio; en el parque, muros y suelo de grava).
const groundBoxes = (b) => b.parts.filter((p) => p.kind === 'box' && p.z === 0);

test('cada obstáculo del mapa tiene su edificio y su huella es EXACTAMENTE el rectángulo de colisión', () => {
  assert.equal(interior.length, arena.obstacles.length);
  interior.forEach((building, i) => {
    const r = arena.obstacles[i];
    const boxes = groundBoxes(building);
    assert.ok(boxes.length > 0, `${building.type} sin cuerpo`);
    const minX = Math.min(...boxes.map((p) => p.x));
    const maxX = Math.max(...boxes.map((p) => p.x + p.w));
    const minY = Math.min(...boxes.map((p) => p.y));
    const maxY = Math.max(...boxes.map((p) => p.y + p.d));
    assert.ok(Math.abs(minX - r.x) < EPS && Math.abs(maxX - (r.x + r.w)) < EPS, `${building.type} en ${r.x},${r.y}: ancho distinto`);
    assert.ok(Math.abs(minY - r.y) < EPS && Math.abs(maxY - (r.y + r.h)) < EPS, `${building.type} en ${r.x},${r.y}: fondo distinto`);
    const area = boxes.reduce((s, p) => s + p.w * p.d, 0);
    assert.ok(Math.abs(area - r.w * r.h) < EPS, `${building.type}: el cuerpo deja huecos o se solapa`);
  });
});

test('los edificios del interior son bajos (no tapan a los tanques que pasan por detrás)', () => {
  for (const building of interior) {
    for (const part of building.parts) assert.ok(part.z + part.h <= 2.3, `${building.type}: pieza demasiado alta (${part.z + part.h})`);
    for (const body of groundBoxes(building)) assert.ok(body.h <= 1.6, `${building.type}: cuerpo de ${body.h}`);
    const tallest = Math.max(...groundBoxes(building).map((p) => p.z + p.h), ...building.parts.filter((p) => p.z > 0 && p.z < 0.5).map((p) => p.z + p.h));
    assert.ok(tallest >= 0.6, `${building.type}: el borde del obstáculo debe ser más alto que las balas (${tallest})`);
  }
});

test('el borde y las afueras no invaden la zona de juego y el borde cubre todas sus celdas', () => {
  const outside = city.buildings.slice(arena.obstacles.length);
  for (const building of outside) {
    for (const p of groundBoxes(building)) {
      const ox = Math.min(p.x + p.w, arena.width - 1) - Math.max(p.x, 1);
      const oy = Math.min(p.y + p.d, arena.height - 1) - Math.max(p.y, 1);
      assert.ok(ox <= EPS || oy <= EPS, `${building.type} invade la arena en ${p.x},${p.y}`);
    }
  }
  const border = outside.filter((b) => b.type.startsWith('border'));
  const covered = (cx, cy) => border.some((b) => groundBoxes(b).some((p) => cx > p.x && cx < p.x + p.w && cy > p.y && cy < p.y + p.d));
  for (let x = 0; x < arena.width; x++) for (const y of [0, arena.height - 1]) assert.ok(covered(x + 0.5, y + 0.5), `celda de borde ${x},${y} sin edificio`);
  for (let y = 0; y < arena.height; y++) for (const x of [0, arena.width - 1]) assert.ok(covered(x + 0.5, y + 0.5), `celda de borde ${x},${y} sin edificio`);
});

test('caras visibles: el norte nunca, el sur siempre y este/oeste según el lado de la cámara', () => {
  const left = { x: 2, w: 2 };
  const right = { x: 20, w: 2 };
  assert.equal(faceVisible(left, 'north'), false);
  assert.equal(faceVisible(left, 'south'), true);
  assert.equal(faceVisible(left, 'east'), true);
  assert.equal(faceVisible(left, 'west'), false);
  assert.equal(faceVisible(right, 'west'), true);
  assert.equal(faceVisible(right, 'east'), false);
  assert.equal(CAMERA_X, arena.width / 2);
});

test('el atlas coloca cada cara sin solapes, dentro de la imagen y comparte las repetidas', () => {
  const faces = cityFaces(city);
  const { height, placed } = packRects(faces);
  const rects = [...placed.values()];
  for (const r of rects) assert.ok(r.x >= 0 && r.x + r.w <= 1024 && r.y >= 0 && r.y + r.h <= height);
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].y < sorted[i].y + sorted[i].h; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, 'dos caras se pisan en el atlas');
    }
  }
  assert.ok(placed.size < faces.length, 'las piezas repetidas (aparatos de aire, postes) deberían compartir zona');
});

test('la ciudad y sus texturas salen siempre iguales (misma semilla) y caben en 1024 x 1024', () => {
  const a = paintCityAtlas(cityFaces(createCity(arena)));
  const b = paintCityAtlas(cityFaces(createCity(arena)));
  assert.ok(a.image.height <= 1024, `atlas de ${a.image.height} píxeles de alto`);
  assert.deepEqual(Buffer.from(a.image.data).equals(Buffer.from(b.image.data)), true);
});

test('el suelo de la arena mide 16 píxeles por celda (la escala de toda la ciudad) y no es plano', () => {
  const street = paintStreet(arena, city, createRng(1));
  assert.equal(street.width, arena.width * TEXELS_PER_CELL);
  assert.equal(street.height, arena.height * TEXELS_PER_CELL);
  assert.equal(TEXELS_PER_CELL, 16);
  const colors = new Set(street.px);
  assert.ok(colors.size > 10, 'el suelo parece plano');
});
});
