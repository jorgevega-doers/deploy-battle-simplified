// Easter egg de TNI (AGENTS.md, sección 88): el jugador que se llama TNI lleva un tanque chetado (cfg.tni). Sus cohetes no rebotan:
// revientan al primer choque con una explosión grande que quita vida y atraviesa escudos. Un jugador con otro nombre juega igual que siempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../server/game/match.js';
import { config } from '../server/config.js';
// Valores fijos de la prueba (3 vidas, 4 el jugador contra los bots, 60 estados/s): las comprobaciones están calculadas con ellos, no con los de producción.
const GAME = { ...config.game, lives: 3, soloPlayerLives: 4, broadcastHz: 60 };

const DT = 1 / GAME.tickHz;
const openArena = (spawn1, spawn2) => ({
  size: 20, width: 20, height: 20,
  solid: (cx, cy) => cx <= 0 || cy <= 0 || cx >= 19 || cy >= 19,
  spawns: [spawn1, spawn2], powerupSpots: [],
});
const newMatch = (initials, spawn2 = { x: 17.5, y: 17.5 }) => createMatch({
  arena: openArena({ x: 2.5, y: 10.5 }, spawn2), cfg: { ...GAME, introS: 0, powerupFirstS: 999, powerupIntervalS: 999 }, rng: () => 0.5, initials,
});
const run = (match, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) match.step(DT); };

test('el tanque de TNI tiene sus ventajas (vidas) y uno normal no', () => {
  const match = newMatch(['TNI', 'BOB']);
  assert.equal(match.stats[0].lives, GAME.tni.lives);
  assert.equal(match.stats[1].lives, GAME.lives);
  assert.equal(match.tanks[0].speedFactor, GAME.tni.speedFactor);
  assert.equal(match.tanks[1].speedFactor, undefined);
});

test('el cohete de TNI no rebota: revienta en el primer muro con una explosión grande (evento con tni)', () => {
  const match = newMatch(['TNI', 'BOB']);
  match.setAim(1, Math.PI); // hacia el muro de la izquierda, sin nadie en medio
  assert.ok(match.fire(1));
  run(match, 1.2);
  const events = match.drainEvents();
  assert.equal(events.filter((e) => e.type === 'bounce').length, 0, 'sin rebotes');
  const blast = events.find((e) => e.type === 'explosion');
  assert.ok(blast && blast.tni === 1 && blast.radius === GAME.tni.blastRadius && blast.slot === 1, JSON.stringify(blast));
  assert.ok(blast.x < 1.5, `revienta contra el muro: x = ${blast.x}`);
  assert.equal(match.projectiles.filter((p) => p.active).length, 0);
});

test('la explosión del cohete quita una vida aunque no dé de lleno (radio grande) y rompe el escudo', () => {
  // BOB pegado al muro de la izquierda, un poco por encima de la línea del disparo: el cohete revienta en el muro y le alcanza.
  const match = newMatch(['TNI', 'BOB'], { x: 1.6, y: 12.5 });
  match.tanks[1].effects.shield = 5;
  match.setAim(1, Math.PI);
  match.fire(1);
  run(match, 1.2);
  assert.equal(match.stats[1].lives, GAME.lives - 1);
  assert.equal(match.tanks[1].effects.shield, 0);
});

test('un jugador que no se llama TNI dispara balas normales que rebotan', () => {
  const match = newMatch(['TNA', 'BOB']);
  match.setAim(1, Math.PI);
  match.fire(1);
  run(match, 0.6);
  const events = match.drainEvents();
  assert.ok(events.some((e) => e.type === 'bounce'), 'rebota');
  assert.ok(!events.some((e) => e.type === 'explosion'));
});

test('la puntuación de TNI va marcada (no entra en el Top 10) y la de los demás no', () => {
  const match = newMatch(['TNI', 'BOB']);
  match.expireTime();
  run(match, DT);
  const [tni, bob] = match.result.scores;
  assert.equal(tni.tni, true);
  assert.equal(bob.tni, false);
});
