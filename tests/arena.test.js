import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createArena, MAPS } from '../shared/arena.js';

for (const [mapIndex, map] of MAPS.entries()) describe(`mapa ${map.name}`, () => {
const arena = createArena(mapIndex);
const W = arena.width;
const H = arena.height;

test('el anillo de calle de 2 celdas junto al borde está libre (salidas de las 4 esquinas y carriles de los coches)', () => {
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const ring = x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3;
    if (ring) assert.equal(arena.solid(x, y), false, `celda ${x},${y}`);
  }
  for (const s of arena.cornerSpawns) assert.equal(arena.solid(Math.floor(s.x), Math.floor(s.y)), false);
});

test('los puntos de power-up están en el suelo libre y son simétricos', () => {
  assert.ok(arena.powerupSpots.length >= 6);
  for (const p of arena.powerupSpots) {
    assert.equal(arena.solid(Math.floor(p.x), Math.floor(p.y)), false, `${p.x},${p.y}`);
    assert.ok(arena.powerupSpots.some((q) => q.x === W - p.x && q.y === H - p.y), `sin pareja: ${p.x},${p.y}`);
  }
});

test('el mapa mide 32 x 18 (16:9) y todo el borde son muros', () => {
  assert.equal(W, 32);
  assert.equal(H, 18);
  assert.equal(W / H, 16 / 9);
  for (let x = 0; x < W; x++) {
    assert.equal(arena.solid(x, 0), true);
    assert.equal(arena.solid(x, H - 1), true);
  }
  for (let y = 0; y < H; y++) {
    assert.equal(arena.solid(0, y), true);
    assert.equal(arena.solid(W - 1, y), true);
  }
  assert.equal(arena.solid(-1, 5), true);
  assert.equal(arena.solid(5, H), true);
  assert.equal(arena.solid(W, 5), true);
});

// Los mapas ya no son simétricos al milímetro (las copias van algo movidas para que no se note): lo que se exige es que sean
// JUSTOS. Distancia a pie (celda a celda) desde cada salida a cada power-up y a su pareja, y al centro: como mucho 2 de diferencia.
const walk = (sx, sy) => {
  const d = new Map([[sx + ',' + sy, 0]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (!arena.solid(x + dx, y + dy) && !d.has(k)) { d.set(k, d.get(x + ',' + y) + 1); queue.push([x + dx, y + dy]); }
    }
  }
  return d;
};
test('el mapa es justo para P1 y P2: mismas distancias a pie a los power-ups y al centro', () => {
  const [s1, s2] = arena.spawns;
  const d1 = walk(Math.floor(s1.x), Math.floor(s1.y));
  const d2 = walk(Math.floor(s2.x), Math.floor(s2.y));
  for (const p of arena.powerupSpots) {
    const mate = arena.powerupSpots.find((q) => Math.abs(q.x - (W - p.x)) < 0.01 && Math.abs(q.y - (H - p.y)) < 0.01);
    assert.ok(mate, `el power-up ${p.x},${p.y} no tiene pareja`);
    const a = d1.get(Math.floor(p.x) + ',' + Math.floor(p.y));
    const b = d2.get(Math.floor(mate.x) + ',' + Math.floor(mate.y));
    assert.ok(Math.abs(a - b) <= 2, `power-up ${p.x},${p.y}: P1 a ${a} y P2 a ${b}`);
  }
  const near = (d) => { let best = Infinity; for (let y = 5; y <= 12; y++) for (let x = 12; x <= 19; x++) if (!arena.solid(x, y)) best = Math.min(best, d.get(x + ',' + y)); return best; };
  assert.ok(Math.abs(near(d1) - near(d2)) <= 2, `centro: P1 a ${near(d1)} y P2 a ${near(d2)}`);
});

test('no hay esquinas en diagonal a 1 celda (el tanque no cabe aunque parezca que sí)', () => {
  const R = arena.obstacles;
  for (let p = 0; p < R.length; p++) for (let q = p + 1; q < R.length; q++) {
    const A = R[p]; const B = R[q];
    const gx = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w));
    const gy = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
    assert.ok(!(gx < 0 && gy < 0), `${A.x},${A.y} y ${B.x},${B.y} se solapan`);
    assert.ok(!(gx >= 0 && gy >= 0 && gx < 2 && gy < 2), `${A.x},${A.y} y ${B.x},${B.y} casi se tocan en diagonal`);
  }
});

test('los puntos de salida y su entorno de 3 x 3 están libres', () => {
  for (const spawn of [...arena.spawns, ...arena.cornerSpawns]) {
    const cx = Math.floor(spawn.x);
    const cy = Math.floor(spawn.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(arena.solid(cx + dx, cy + dy), false);
  }
  assert.ok(arena.spawns[0].x < W / 2, 'P1 a la izquierda');
  assert.equal(arena.spawns[1].x, W - arena.spawns[0].x, 'P2 en la esquina opuesta');
  assert.equal(arena.spawns[1].y, H - arena.spawns[0].y, 'P2 en la esquina opuesta');
});

test('los puntos de aparición de power-ups son suelo, simétricos y lejos de las salidas', () => {
  const keys = new Set(arena.powerupSpots.map((s) => `${Math.floor(s.x)},${Math.floor(s.y)}`));
  for (const spot of arena.powerupSpots) {
    const cx = Math.floor(spot.x);
    const cy = Math.floor(spot.y);
    assert.equal(arena.solid(cx, cy), false, `punto ${cx},${cy} en un muro`);
    assert.ok(keys.has(`${W - 1 - cx},${H - 1 - cy}`), `falta el simétrico de ${cx},${cy}`);
    for (const spawn of arena.spawns) assert.ok(Math.hypot(spot.x - spawn.x, spot.y - spawn.y) > 6, 'demasiado cerca de una salida');
  }
});

test('no hay pasillos de 1 celda de ancho (el tanque mide 1 x 1)', () => {
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (arena.solid(x, y)) continue;
      const narrowH = arena.solid(x - 1, y) && arena.solid(x + 1, y);
      const narrowV = arena.solid(x, y - 1) && arena.solid(x, y + 1);
      assert.equal(narrowH || narrowV, false, `celda ${x},${y} atrapada entre muros`);
    }
  }
});

test('todo el suelo es alcanzable desde la salida de P1, incluida la salida de P2', () => {
  const seen = new Set();
  const stack = [[Math.floor(arena.spawns[0].x), Math.floor(arena.spawns[0].y)]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (seen.has(key) || arena.solid(x, y)) continue;
    seen.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let floor = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!arena.solid(x, y)) floor++;
  assert.equal(seen.size, floor);
  assert.ok(seen.has(`${Math.floor(arena.spawns[1].x)},${Math.floor(arena.spawns[1].y)}`));
});

test('wallCells devuelve las mismas celdas que solid', () => {
  const cells = arena.wallCells();
  for (const [x, y] of cells) assert.equal(arena.solid(x, y), true);
  let walls = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (arena.solid(x, y)) walls++;
  assert.equal(cells.length, walls);
});

test('el mapa tiene obstáculos suficientes para dar cobertura sin cerrar la arena', () => {
  const walls = arena.wallCells().length;
  const border = 2 * (W + H) - 4;
  const interior = walls - border;
  const floorCells = (W - 2) * (H - 2);
  assert.ok(interior / floorCells > 0.06, `muy vacío: ${(interior / floorCells * 100).toFixed(1)} % de obstáculos`);
  assert.ok(interior / floorCells < 0.25, `muy lleno: ${(interior / floorCells * 100).toFixed(1)} % de obstáculos`);
});
});
