import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../shared/arena.js';
import { createRng } from '../shared/art/rng.js';
import { circleFree, pushOutOfWalls, randomFreeSpot, chooseHeading, separateAgents, pushOutOfCircle, wrapPi } from '../client/host/lifeSteer.js';

const arena = createArena();

test('wrapPi deja los ángulos entre -π y π', () => {
  assert.ok(Math.abs(wrapPi(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapPi(3 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapPi(0.3 + 2 * Math.PI) - 0.3) < 1e-9);
});

test('circleFree distingue suelo libre de muros del mapa real', () => {
  assert.equal(circleFree(arena, 2.5, 2.5, 0.2), true);   // la salida de P1
  assert.equal(circleFree(arena, 16, 9, 0.2), false);     // dentro del bloque central
  assert.equal(circleFree(arena, 14.9, 9, 0.2), false);   // pegado al bloque central (x = 15)
  assert.equal(circleFree(arena, 14.5, 9, 0.2), true);
});

test('pushOutOfWalls saca de los muros, también desde dentro del muro', () => {
  const p = { x: 14.95, y: 9 };
  pushOutOfWalls(arena, p, 0.15);
  assert.ok(circleFree(arena, p.x, p.y, 0.15 - 1e-6), `(${p.x}, ${p.y})`);
  const inside = { x: 15.4, y: 8.2 };
  pushOutOfWalls(arena, inside, 0.15);
  assert.ok(circleFree(arena, inside.x, inside.y, 0.15 - 1e-6), `(${inside.x}, ${inside.y})`);
});

test('randomFreeSpot da puntos libres y respeta la distancia mínima a otros', () => {
  const rng = createRng(5);
  const away = [{ x: 16, y: 5 }];
  for (let i = 0; i < 200; i++) {
    const s = randomFreeSpot(arena, rng, 0.3, away, 4);
    assert.ok(s && circleFree(arena, s.x, s.y, 0.3));
    assert.ok(Math.hypot(s.x - 16, s.y - 5) >= 4);
  }
});

test('chooseHeading va hacia el objetivo, huye de la amenaza y nunca elige un rumbo con muro delante', () => {
  const toward = chooseHeading(arena, 5, 8, 0.15, 0, 'goto', 12, 8);
  assert.ok(Math.abs(toward) < 0.5 || Math.abs(toward - Math.PI * 2) < 0.5, `rumbo ${toward}`); // hacia +x
  const away = chooseHeading(arena, 5, 8, 0.15, 0, 'flee', 8, 8);
  assert.ok(Math.cos(away) < 0, 'huir de algo que está a la derecha es ir a la izquierda');
  // Pegado al bloque central, mirando al muro: elige un rumbo que no lo atraviesa.
  const blocked = chooseHeading(arena, 14.7, 9, 0.15, 0, 'goto', 18, 9);
  assert.ok(blocked !== null);
  assert.ok(circleFree(arena, 14.7 + Math.cos(blocked) * 0.55, 9 + Math.sin(blocked) * 0.55, 0.15));
});

test('separateAgents deja a todos sin solaparse', () => {
  const rng = createRng(3);
  const agents = Array.from({ length: 12 }, () => ({ x: 10 + rng() * 0.6, y: 9 + rng() * 0.6, r: 0.12, active: true }));
  for (let i = 0; i < 30; i++) separateAgents(agents, agents.length);
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    assert.ok(Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y) >= 0.24 - 0.01, `${i}-${j}`);
  }
});

test('pushOutOfCircle aparta de un coche', () => {
  const a = { x: 5.1, y: 5, r: 0.12 };
  pushOutOfCircle(a, 5, 5, 0.45);
  assert.ok(Math.hypot(a.x - 5, a.y - 5) >= 0.57 - 1e-9);
});

test('simulación larga: 25 agentes que van de un destino a otro nunca acaban dentro de un muro ni solapados', () => {
  const rng = createRng(11);
  const agents = Array.from({ length: 25 }, () => {
    const s = randomFreeSpot(arena, rng, 0.2);
    return { x: s.x, y: s.y, r: 0.12, active: true, heading: rng() * 6, target: randomFreeSpot(arena, rng, 0.3) };
  });
  const dt = 1 / 60;
  for (let frame = 0; frame < 60 * 40; frame++) {
    for (const a of agents) {
      if (frame % 9 === 0) {
        if (Math.hypot(a.target.x - a.x, a.target.y - a.y) < 0.4) a.target = randomFreeSpot(arena, rng, 0.3);
        const h = chooseHeading(arena, a.x, a.y, a.r, a.heading, 'goto', a.target.x, a.target.y);
        if (h !== null) a.heading = h;
      }
      a.x += Math.cos(a.heading) * 1.0 * dt;
      a.y += Math.sin(a.heading) * 1.0 * dt;
    }
    separateAgents(agents, agents.length);
    for (const a of agents) pushOutOfWalls(arena, a, a.r);
  }
  for (const a of agents) assert.ok(circleFree(arena, a.x, a.y, a.r - 0.02), `(${a.x.toFixed(2)}, ${a.y.toFixed(2)}) dentro de un muro`);
  let overlaps = 0;
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    if (Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y) < 0.24 - 0.05) overlaps++;
  }
  assert.equal(overlaps, 0, 'agentes solapados');
});
