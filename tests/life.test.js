import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIGS, PALETTES, COLOR_SOURCE } from '../client/host/lifeRigs.js';
import { windowToWorld } from '../client/host/lifeWindows.js';
import { VEHICLE_SCALE } from '../client/host/lifeVehicles.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) < eps, `${actual} no es ${expected}`);
const topOf = (rig) => Math.max(...RIGS[rig].map((p) => p.o[1] + p.s[1] / 2));

test('todas las piezas de cada figura usan un color que existe en su paleta', () => {
  for (const [rig, parts] of Object.entries(RIGS)) {
    for (const part of parts) {
      const list = COLOR_SOURCE[rig][part.c];
      assert.ok(list && PALETTES[list]?.length > 0, `${rig}: color "${part.c}" sin paleta`);
    }
  }
});

test('los vehículos son más bajos que un proyectil: los disparos pasan por encima', () => {
  const PROJECTILE_BOTTOM = 0.5 - 0.09; // altura del proyectil menos la mitad de su lado
  assert.ok(topOf('car') * VEHICLE_SCALE.car < PROJECTILE_BOTTOM, `coche ${topOf('car') * VEHICLE_SCALE.car}`);
  assert.ok(topOf('scooter') * VEHICLE_SCALE.scooter < PROJECTILE_BOTTOM, `moto ${topOf('scooter') * VEHICLE_SCALE.scooter}`);
});

test('la gente y los animales son mucho más pequeños que un tanque (0,9 de ancho)', () => {
  assert.ok(topOf('person') < 0.5 && topOf('cat') < 0.2 && topOf('dog') < 0.3);
});

// Cara del sur de un edificio en x 2-6, y 5-7, de 0 a 2 de alto, pintada en un rectángulo de 64 x 32 píxeles del atlas.
const part = { kind: 'box', x: 2, y: 5, z: 0, w: 4, d: 2, h: 2 };
const rect = { x: 100, y: 50, w: 64, h: 32 };
const win = { x: 116, y: 58, w: 4, h: 6 }; // centro (118, 61) -> u = 0,28125; v = 0,34375

test('una ventana de la cara sur se coloca en el mundo con la posición y el tamaño correctos', () => {
  const w = windowToWorld({ part, face: 'south' }, rect, win);
  near(w.x, 2 + 0.28125 * 4);
  near(w.y, 5 - 0.012);                 // un pelo por delante de la pared
  near(w.z, 2 * (1 - 0.34375));
  near(w.w, (4 / 64) * 4);
  near(w.h, (6 / 32) * 2);
  assert.equal(w.ry, 0);
});

test('en las caras este y oeste la ventana se reparte a lo largo de la profundidad y mira hacia fuera', () => {
  const east = windowToWorld({ part, face: 'east' }, rect, win);
  near(east.x, 6 + 0.012);
  near(east.y, 5 + 0.28125 * 2);
  near(east.ry, Math.PI / 2);
  const west = windowToWorld({ part, face: 'west' }, rect, win);
  near(west.x, 2 - 0.012);
  near(west.y, 5 + (1 - 0.28125) * 2);  // vista desde fuera, la izquierda de la cara oeste es el norte
  near(west.ry, -Math.PI / 2);
});

test('las partes que no son cajas (tejados a dos aguas) no llevan ventanas animadas', () => {
  assert.equal(windowToWorld({ part: { ...part, kind: 'gable' }, face: 'south' }, rect, win), null);
  assert.equal(windowToWorld({ part, face: 'top' }, rect, win), null);
});

import { MANHOLES } from '../shared/art/paint/street.js';
import { createArena } from '../shared/arena.js';
import { circleFree } from '../client/host/lifeSteer.js';

test('las alcantarillas están en suelo libre, lejos de las salidas y de los charcos de power-ups, y hay vapor en varias', () => {
  const arena = createArena();
  for (const m of MANHOLES) {
    assert.ok(circleFree(arena, m.x, m.y, 0.55), `alcantarilla (${m.x}, ${m.y}) pegada a un muro`);
    for (const s of arena.spawns) assert.ok(Math.hypot(s.x - m.x, s.y - m.y) > 2.2, `(${m.x}, ${m.y}) muy cerca de una salida`);
    for (const s of arena.powerupSpots) assert.ok(Math.hypot(s.x - m.x, s.y - m.y) > 1.2, `(${m.x}, ${m.y}) encima de un charco de power-up`);
  }
  assert.ok(MANHOLES.length >= 15 && MANHOLES.filter((m) => m.steam).length >= 6);
});

// --- Vehículos: no se solapan (28-oct, "que no se clippeen") ---
import { Scene } from 'three';
import { createVehicles, boxesOverlap, HALF_SIZE } from '../client/host/lifeVehicles.js';

test('boxesOverlap: cajas orientadas (lado a lado, girada y en esquina)', () => {
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 0.9, 0, 0, 0.5, 0.3), true, 'dos coches casi pegados morro con cola se tocan');
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 1.2, 0, 0, 0.5, 0.3), false, 'con hueco no');
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 0, 0.7, 0, 0.5, 0.3), false, 'en carriles contiguos (0,7 de separación) pasan sin tocarse');
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 0, 0.5, 0, 0.5, 0.3), true, 'a 0,5 de lado sí se pisan');
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 0.9, 0.9, Math.PI / 4, 0.5, 0.3), false, 'en diagonal con hueco no');
  assert.equal(boxesOverlap(0, 0, 0, 0.5, 0.3, 0.55, 0.55, Math.PI / 2, 0.5, 0.3), true, 'uno girado 90 grados encima de la esquina sí');
});

// Simula "seconds" segundos de tráfico y devuelve el mayor solape visto (0 = nunca se tocaron). "tankAt" = tanque parado en la calle.
function trafficOverlap(mapIndex, plan, seconds, tankAt = null) {
  const arena = createArena(mapIndex);
  const vehicles = createVehicles(new Scene(), arena, 0x7a31, plan ? { plan } : {});
  const state = tankAt ? { tankCount: 2, tanks: [{ x: tankAt[0], y: tankAt[1], lives: 3 }, { x: -50, y: -50, lives: 3 }], projectileCount: 0, projectiles: [] } : null;
  const kinds = [];
  let bad = 0;
  let worst = '';
  const types = plan ? plan.map((p) => p.rig) : ['car', 'scooter', 'car', 'scooter'];
  for (let f = 0; f < seconds * 60; f++) {
    vehicles.update(f * (1000 / 60), state, []);
    const c = vehicles.cars;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
      if (c[i].x < -50 || c[j].x < -50) continue; // aparcados
      const a = HALF_SIZE[types[i]]; const b = HALF_SIZE[types[j]];
      if (boxesOverlap(c[i].x, c[i].y, c[i].h, a.hl, a.hw, c[j].x, c[j].y, c[j].h, b.hl, b.hw, -0.02)) { bad++; worst = `fotograma ${f}: vehículos ${i} y ${j} en ${c[i].x.toFixed(2)},${c[i].y.toFixed(2)}`; }
    }
  }
  kinds.push(bad);
  return { bad, worst };
}

test('el tráfico de siempre (2 coches y 2 motos) nunca se solapa, ni con un tanque cortando la calle', () => {
  assert.equal(trafficOverlap(0, null, 120).bad, 0, trafficOverlap(0, null, 120).worst);
  const blocked = trafficOverlap(0, null, 120, [16, 2.2]);
  assert.equal(blocked.bad, 0, blocked.worst);
});

test('el tráfico de la lluvia (5 coches y 2 motos, más apretados) nunca se solapa en ningún mapa', () => {
  const rain = [
    { rig: 'car', lane: 0, at: 0.05 }, { rig: 'car', lane: 1, at: 0.2 }, { rig: 'car', lane: 0, at: 0.36 }, { rig: 'scooter', lane: 1, at: 0.5 },
    { rig: 'car', lane: 1, at: 0.64 }, { rig: 'car', lane: 0, at: 0.78 }, { rig: 'scooter', lane: 0, at: 0.9 },
  ];
  for (const mapIndex of [0, 1, 2]) {
    const r = trafficOverlap(mapIndex, rain, 150);
    assert.equal(r.bad, 0, `mapa ${mapIndex}: ${r.worst}`);
    const withTank = trafficOverlap(mapIndex, rain, 90, [16, 15.5]);
    assert.equal(withTank.bad, 0, `mapa ${mapIndex} con un tanque: ${withTank.worst}`);
  }
});

test('una moto que alcanza a un coche en su carril lo sigue (no lo atraviesa)', () => {
  // Una moto (2,5 celdas/s) detrás de un coche (1,9) en el mismo carril acabaría encima si no frenara.
  const plan = [{ rig: 'car', lane: 0, at: 0.3 }, { rig: 'scooter', lane: 0, at: 0.27 }];
  assert.equal(trafficOverlap(0, plan, 200).bad, 0);
});
