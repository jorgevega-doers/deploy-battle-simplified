import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../server/game/match.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';
import { calculateScore, calculateAccuracy, accuracyFactor, speedFactor, SCORE_MAX, SCORE_WEIGHTS } from '../server/game/score.js';

const near = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) < eps, `${actual} no es ${expected}`);
const DT = 1 / config.game.tickHz;

// Generador de números al azar con semilla fija, para que los tests sean repetibles.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sala abierta (solo el borde es muro) con salidas a medida, para probar situaciones concretas.
const openArena = (spawn1, spawn2, spots = []) => ({
  size: 20,
  width: 20,
  height: 20,
  solid: (cx, cy) => cx <= 0 || cy <= 0 || cx >= 19 || cy >= 19,
  spawns: [spawn1, spawn2],
  powerupSpots: spots,
});
const newMatch = (arena, overrides = {}) => createMatch({
  arena, cfg: { ...config.game, introS: 0, ...overrides }, rng: seeded(1), initials: ['AAA', 'BBB'],
});
const run = (match, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) match.step(DT); };
const eventsOf = (match, type) => match.drainEvents().filter((e) => e.type === type);

test('un tanque se mueve y se para contra el borde', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 0);
  run(match, 1);
  // Con aceleración llega algo menos lejos que a velocidad máxima desde el primer instante.
  assert.ok(match.tanks[0].x > 2.5 + config.game.tankSpeed * 0.8 && match.tanks[0].x < 2.5 + config.game.tankSpeed, `x = ${match.tanks[0].x}`);
  run(match, 6);
  near(match.tanks[0].x, 18.5, 1e-3); // pegado al muro derecho (el muro empieza en x = 19)
  near(match.tanks[0].y, 2.5);
});

test('en diagonal contra un muro se desliza por él', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 1);
  run(match, 6);
  near(match.tanks[0].x, 18.5, 1e-3);
  near(match.tanks[0].y, 18.5 - 1, 1.1); // sube hasta chocar con P2 o el muro de arriba, sin quedarse parado
  assert.ok(match.tanks[0].y > 10);
});

test('la zona muerta del pad ignora movimientos mínimos y el vector se limita a longitud 1', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 0.05, 0.05);
  assert.equal(match.tanks[0].moveX, 0);
  match.setMove(1, 3, 4);
  near(Math.hypot(match.tanks[0].moveX, match.tanks[0].moveY), 1);
});

test('los dos tanques no se atraviesan', () => {
  const match = newMatch(openArena({ x: 5.5, y: 5.5 }, { x: 7.0, y: 5.5 }));
  match.setMove(1, 1, 0);
  run(match, 2);
  assert.ok(match.tanks[1].x - match.tanks[0].x >= 0.999, 'se han solapado');
});

test('la velocidad aumenta con el power-up de velocidad', () => {
  const normal = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  const boosted = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  boosted.tanks[0].effects.speed = 10;
  normal.setMove(1, 1, 0); boosted.setMove(1, 1, 0);
  run(normal, 1); run(boosted, 1);
  near(normal.tanks[0].vx, config.game.tankSpeed);
  near(boosted.tanks[0].vx / normal.tanks[0].vx, config.game.speedBoost, 1e-9);
  assert.ok(boosted.tanks[0].x > normal.tanks[0].x);
});

test('el tanque acelera de forma progresiva y no arranca de golpe', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 0);
  run(match, 0.05);
  const early = match.tanks[0].vx;
  assert.ok(early > 0 && early < config.game.tankSpeed * 0.5, `a los 0,05 s debería ir despacio (${early})`);
  run(match, config.game.tankSpeed / config.game.tankAccel + 0.1);
  near(match.tanks[0].vx, config.game.tankSpeed);
});

test('al soltar el pad el tanque frena de forma progresiva y se para', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 0);
  run(match, 1);
  const releasedAt = match.tanks[0].x;
  match.setMove(1, 0, 0);
  run(match, 0.03);
  assert.ok(match.tanks[0].vx > 0 && match.tanks[0].vx < config.game.tankSpeed, 'sigue moviéndose un instante');
  run(match, 0.5);
  assert.equal(match.tanks[0].vx, 0);
  const stopped = match.tanks[0].x;
  assert.ok(stopped > releasedAt + 0.1, 'avanza un poco más por inercia');
  assert.ok(stopped - releasedAt < 0.6, 'pero se para pronto');
  run(match, 1);
  near(match.tanks[0].x, stopped);
});

test('curva del pad: la mitad del empuje da menos de la mitad de la velocidad (más precisión)', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 0.5, 0);
  run(match, 1);
  const half = match.tanks[0].vx;
  assert.ok(half > 0 && half < config.game.tankSpeed * 0.5, `a medio empuje va a ${half}`);
  near(half, config.game.tankSpeed * 0.5 ** config.game.moveResponseExponent, 1e-9);
});

test('al chocar con un muro pierde la velocidad en ese eje y no sigue "empujando"', () => {
  const match = newMatch(openArena({ x: 15.5, y: 5.5 }, { x: 5.5, y: 15.5 }));
  match.setMove(1, 1, 0);
  run(match, 2);
  near(match.tanks[0].x, 18.5, 1e-3);
  assert.equal(match.tanks[0].vx, 0);
  match.setMove(1, 0, 1); // ahora sube: tiene que arrancar de nuevo desde cero, sin arrastrar la velocidad hacia el muro
  run(match, 0.05);
  assert.equal(match.tanks[0].vx, 0);
  assert.ok(match.tanks[0].vy > 0);
});

test('tras el dash conserva parte de la velocidad y el frenado la va reduciendo', () => {
  const match = newMatch(openArena({ x: 2.5, y: 8.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 0);
  run(match, 1);
  match.dash(1);
  run(match, config.game.dashDurationS + 0.01);
  match.setMove(1, 0, 0);
  run(match, 0.02);
  assert.ok(match.tanks[0].vx > 0, 'sigue avanzando por inercia');
  run(match, 0.5);
  assert.equal(match.tanks[0].vx, 0);
});

test('un disparo desaparece al acabar su vida máxima aunque no haya rebotado 3 veces', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { projectileLifeS: 2.5 });
  match.tanks[0].aim = 0;
  assert.equal(match.fire(1), true);
  run(match, 2.4);
  assert.equal(match.snapshot().projectiles.length, 1, 'aún vive');
  match.drainEvents();
  run(match, 0.2);
  assert.equal(match.snapshot().projectiles.length, 0, 'se agotó');
  const expired = eventsOf(match, 'expire');
  assert.equal(expired.length, 1);
  assert.equal(match.stats[0].shots, 1);
});

test('el proyectil rebota 2 veces y desaparece en el 3.er muro', () => {
  // Sin límite de vida, para probar solo los rebotes (en esta sala de 20 x 20 el recorrido es largo).
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { projectileLifeS: Infinity });
  match.tanks[0].aim = 0;
  assert.equal(match.fire(1), true);
  const all = [];
  for (let i = 0; i < 60 * 12; i++) { match.step(DT); all.push(...match.drainEvents()); }
  assert.equal(all.filter((e) => e.type === 'bounce').length, 2);
  assert.equal(all.filter((e) => e.type === 'impact').length, 1);
  assert.equal(match.snapshot().projectiles.length, 0);
  assert.equal(match.stats[0].lives, 3, 'sin fuego amigo no debe dañar al que dispara');
});

test('el rebote refleja el ángulo (disparo en diagonal)', () => {
  const match = newMatch(openArena({ x: 10, y: 10 }, { x: 17.5, y: 2.5 }));
  match.tanks[0].aim = 1.2; // sube más de lo que avanza a la derecha: llega al muro de arriba (y = 19) antes que al derecho
  match.fire(1);
  run(match, 1.3); // recorre ~11 celdas, rebota en y = 19 tras ~9,7 y baja el resto
  const before = match.snapshot().projectiles[0];
  assert.ok(before, 'el proyectil sigue vivo');
  assert.equal(match.drainEvents().filter((e) => e.type === 'bounce').length, 1);
  run(match, 0.1);
  const after = match.snapshot().projectiles[0];
  assert.ok(after[2] < before[2], 'tras rebotar debe ir hacia abajo');
  assert.ok(after[1] > before[1], 'y seguir avanzando hacia la derecha (solo se invierte Y)');
  const slope = (after[2] - before[2]) / (after[1] - before[1]);
  near(slope, -Math.tan(1.2), 0.1); // misma inclinación, signo invertido
});

test('un impacto resta una vida, cuenta el acierto y reinicia la ronda', () => {
  const s1 = { x: 2.5, y: 5.5 };
  const s2 = { x: 12.5, y: 5.5 };
  const match = newMatch(openArena(s1, s2));
  match.tanks[0].aim = 0;
  match.fire(1);
  let guard = 0;
  while (match.stats[1].lives === 3 && guard++ < 600) match.step(DT);
  assert.equal(match.stats[1].lives, 2);
  assert.equal(match.stats[0].hits, 1);
  assert.equal(match.stats[0].shots, 1);
  assert.equal(match.frozen, true);
  assert.equal(match.snapshot().projectiles.length, 0);
  near(match.tanks[0].x, s1.x); near(match.tanks[1].x, s2.x);
  const hit = match.drainEvents().find((e) => e.type === 'hit');
  assert.deepEqual([hit.slot, hit.by, hit.lives], [2, 1, 2]);
});

test('durante la pausa no se puede mover ni disparar, y después sí', () => {
  const match = newMatch(openArena({ x: 2.5, y: 5.5 }, { x: 12.5, y: 5.5 }));
  match.tanks[0].aim = 0;
  match.fire(1);
  while (match.stats[1].lives === 3) match.step(DT);
  match.setMove(1, 1, 0);
  assert.equal(match.fire(1), false);
  run(match, 0.3);
  near(match.tanks[0].x, 2.5);
  run(match, config.game.roundFreezeS);
  assert.equal(match.frozen, false);
  run(match, 0.3);
  assert.ok(match.tanks[0].x > 2.5);
});

test('al quedarse sin vidas termina la partida con puntuación', () => {
  const match = newMatch(openArena({ x: 2.5, y: 5.5 }, { x: 12.5, y: 5.5 }), { lives: 1 });
  match.tanks[0].aim = 0;
  match.fire(1);
  let guard = 0;
  while (!match.over && guard++ < 600) match.step(DT);
  assert.equal(match.over, true);
  assert.equal(match.result.winner, 1);
  assert.equal(match.result.reason, 'lives');
  const [winner, loser] = match.result.scores;
  assert.equal(winner.lives, 1);
  assert.equal(winner.accuracy, 100);
  assert.ok(winner.score > 1000 + 1000);
  assert.equal(loser.lives, 0);
  assert.equal(loser.score, 0 + 0 * 10 + 0); // el perdedor no suma segundos y no ha acertado
});

test('la cadencia limita los disparos', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  assert.equal(match.fire(1), true);
  assert.equal(match.fire(1), false);
  run(match, config.game.fireCooldownS + 0.05);
  assert.equal(match.fire(1), true);
});

test('un disparo pedido justo antes de acabar la cadencia se guarda y sale solo', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  assert.equal(match.fire(1), true);
  run(match, config.game.fireCooldownS - 0.1); // faltan ~0,1 s: dentro del búfer (0,25 s)
  assert.equal(match.fire(1), false);          // todavía no puede salir...
  run(match, 0.2);
  assert.equal(match.stats[0].shots, 2);       // ...pero salió solo al acabar la cadencia
});

test('un disparo pedido demasiado pronto no se guarda', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.fire(1);
  run(match, 0.1); // faltan ~0,5 s: fuera del búfer
  assert.equal(match.fire(1), false);
  run(match, config.game.fireCooldownS + 0.2);
  assert.equal(match.stats[0].shots, 1);
});

test('un disparo guardado se descarta si hay un impacto antes de que pueda salir', () => {
  // Cadencia larga y rival cercano: el primer disparo impacta (~0,3 s) antes de que acabe la cadencia (1 s).
  const match = newMatch(openArena({ x: 2.5, y: 5.5 }, { x: 5.5, y: 5.5 }), { fireCooldownS: 1, fireBufferS: 0.9 });
  match.tanks[0].aim = 0;
  match.fire(1);
  run(match, 0.1);
  match.fire(1); // guardado (queda dentro del búfer)
  assert.equal(match.tanks[0].pendingFire, true);
  while (match.stats[1].lives === 3) match.step(DT); // el primer disparo impacta y se reinicia la ronda
  assert.equal(match.tanks[0].pendingFire, false, 'la ronda nueva borra el disparo guardado');
  run(match, 3);
  assert.equal(match.stats[0].shots, 1, 'no debe salir un disparo viejo tras reiniciar la ronda');
});

test('el dash recorre una distancia fija en la dirección del movimiento y tiene espera', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.setMove(1, 1, 0);
  assert.equal(match.dash(1), true);
  assert.ok(eventsOf(match, 'dash').length === 1);
  run(match, config.game.dashDurationS + 0.05);
  const expected = config.game.dashSpeed * config.game.dashDurationS;
  near(match.tanks[0].x - 2.5, expected + 0, expected * 0.2 + config.game.tankSpeed * 0.05);
  assert.equal(match.dash(1), false, 'en espera');
  run(match, config.game.dashCooldownS);
  assert.equal(match.dash(1), true);
});

test('quieto, el dash va hacia donde apunta; durante el dash la dirección no se puede cambiar', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.tanks[0].aim = Math.PI / 2; // apunta hacia arriba
  match.dash(1);
  match.setMove(1, 1, 0);            // intenta ir a la derecha en pleno dash
  run(match, config.game.dashDurationS - 0.02); // solo mientras dura el dash
  assert.ok(match.tanks[0].y > 2.5 + 2, 'ha subido');
  near(match.tanks[0].x, 2.5, 1e-6);
  run(match, 0.2); // acabado el dash vuelve a obedecer al pad
  assert.ok(match.tanks[0].x > 2.5 + 0.3, 'después del dash se mueve a la derecha');
});

test('el dash se para contra un muro y no atraviesa al otro tanque', () => {
  const wall = newMatch(openArena({ x: 17.5, y: 2.5 }, { x: 2.5, y: 17.5 }));
  wall.setMove(1, 1, 0);
  wall.dash(1);
  run(wall, 0.3);
  near(wall.tanks[0].x, 18.5, 1e-3);

  const block = newMatch(openArena({ x: 5.5, y: 5.5 }, { x: 7.0, y: 5.5 }));
  block.setMove(1, 1, 0);
  block.dash(1);
  run(block, 0.3);
  assert.ok(block.tanks[1].x - block.tanks[0].x >= 0.999, 'se han solapado');
});

test('no se puede hacer dash en la pausa tras un impacto ni tras acabar la partida', () => {
  const match = newMatch(openArena({ x: 2.5, y: 5.5 }, { x: 12.5, y: 5.5 }));
  match.tanks[0].aim = 0;
  match.fire(1);
  while (match.stats[1].lives === 3) match.step(DT);
  assert.equal(match.dash(1), false);
  match.forfeit(2);
  assert.equal(match.dash(2), false);
});

test('hay un tope de proyectiles vivos por jugador', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { fireCooldownS: 0, maxProjectilesPerPlayer: 3 });
  const fired = [1, 2, 3, 4, 5].map(() => match.fire(1));
  assert.deepEqual(fired, [true, true, true, false, false]);
});

test('el doble disparo lanza 2 proyectiles y cuenta como 1 disparo', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.tanks[0].effects.double = 10;
  match.fire(1);
  assert.equal(match.snapshot().projectiles.length, 2);
  assert.equal(match.stats[0].shots, 1);
});

test('el power-up de explosión estalla en el 2.º rebote y daña en el radio', () => {
  // P1 dispara a la derecha por la fila 2.5: rebota en x=19 y en x=1 (2.º). P2 está cerca de ese punto.
  const arena = openArena({ x: 2.5, y: 2.5 }, { x: 2.0, y: 3.5 });
  // Sin límite de vida: en esta sala de 20 x 20 llegar al 2.º rebote cuesta más que la vida máxima de un disparo.
  const withAoe = newMatch(arena, { projectileLifeS: Infinity });
  withAoe.tanks[0].aim = 0;
  withAoe.tanks[0].effects.aoe = 10;
  withAoe.fire(1);
  const events = [];
  for (let i = 0; i < 60 * 12 && !withAoe.frozen; i++) { withAoe.step(DT); events.push(...withAoe.drainEvents()); }
  assert.equal(events.filter((e) => e.type === 'explosion').length, 1);
  assert.equal(withAoe.stats[1].lives, 2);

  const withoutAoe = newMatch(arena, { projectileLifeS: Infinity });
  withoutAoe.tanks[0].aim = 0;
  withoutAoe.fire(1);
  run(withoutAoe, 12);
  assert.equal(withoutAoe.stats[1].lives, 3);
});

test('el escudo absorbe una bala: se rompe y no quita vida; la siguiente sí', () => {
  const match = newMatch(openArena({ x: 2.5, y: 5.5 }, { x: 12.5, y: 5.5 }));
  match.tanks[0].aim = 0;
  match.tanks[1].effects.shield = 6;
  match.fire(1);
  const events = [];
  for (let i = 0; i < 60 * 3; i++) { match.step(DT); events.push(...match.drainEvents()); }
  assert.equal(match.stats[1].lives, 3, 'el escudo no deja que quite vida');
  assert.equal(match.tanks[1].effects.shield, 0, 'el escudo se rompe');
  assert.equal(events.filter((e) => e.type === 'shield_break').length, 1);
  assert.equal(match.frozen, false, 'no hay pausa de ronda');
  assert.equal(match.stats[0].hits, 0, 'no cuenta como acierto');
  run(match, 1); // pasa la cadencia y la breve protección tras romperse
  match.fire(1);
  for (let i = 0; i < 60 * 3 && match.stats[1].lives === 3; i++) match.step(DT);
  assert.equal(match.stats[1].lives, 2, 'sin escudo, la bala sí quita vida');
});

test('la explosión rompe el escudo y quita la vida a la vez', () => {
  const arena = openArena({ x: 2.5, y: 2.5 }, { x: 2.0, y: 3.5 });
  const match = newMatch(arena, { projectileLifeS: Infinity });
  match.tanks[0].aim = 0;
  match.tanks[0].effects.aoe = 10;
  match.tanks[1].effects.shield = 10;
  match.fire(1);
  const events = [];
  for (let i = 0; i < 60 * 16 && !match.frozen; i++) { match.step(DT); events.push(...match.drainEvents()); }
  assert.equal(match.stats[1].lives, 2);
  assert.ok(events.some((e) => e.type === 'shield_break'));
  assert.equal(match.tanks[1].effects.shield, 0);
});

test('un power-up avisa (powerup_warn) en su sitio antes de aparecer, y la explosión sale menos', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, [{ x: 10.5, y: 10.5 }, { x: 5.5, y: 12.5 }]));
  const events = [];
  for (let i = 0; i < 60 * (config.game.powerupFirstSpawnS + 1); i++) { match.step(DT); events.push(...match.drainEvents()); }
  const warnAt = events.findIndex((e) => e.type === 'powerup_warn');
  const spawnAt = events.findIndex((e) => e.type === 'powerup_spawn');
  assert.ok(warnAt >= 0 && spawnAt > warnAt, 'primero el aviso y luego la aparición');
  assert.equal(events[warnAt].x, events[spawnAt].x);
  assert.equal(events[warnAt].y, events[spawnAt].y);
  assert.ok(events[warnAt].seconds <= config.game.powerupWarnS + 1e-9);
  const w = config.game.powerupWeights;
  assert.ok(w.aoe < w.double && w.aoe < w.speed && w.aoe < w.shield, 'la explosión es la menos frecuente');
});

test('solo hay un power-up activo: el nuevo sustituye al anterior', () => {
  const spots = [{ x: 10.5, y: 10.5 }];
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, spots));
  match.tanks[0].effects.double = 5;
  match.powerups.spawnAt('shield', 10.5, 10.5);
  match.tanks[0].x = 10.5; match.tanks[0].y = 10.5;
  match.step(DT);
  assert.equal(match.tanks[0].effects.double, 0);
  assert.ok(match.tanks[0].effects.shield > 5.9);
});

test('los power-ups aparecen, se recogen y duran lo configurado', () => {
  const spots = [{ x: 10.5, y: 10.5 }, { x: 5.5, y: 12.5 }];
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, spots));
  run(match, config.game.powerupFirstSpawnS + 0.1);
  assert.equal(match.powerups.items.length, 1);
  assert.ok(match.drainEvents().some((e) => e.type === 'powerup_spawn'));

  const item = match.powerups.items[0];
  match.tanks[0].x = item.x; match.tanks[0].y = item.y;
  match.step(DT);
  assert.equal(match.powerups.items.length, 0);
  const duration = config.game.powerupDurationS[item.type];
  assert.ok(duration >= 3 && duration <= 8, 'deben durar unos pocos segundos');
  assert.ok(match.tanks[0].effects[item.type] > duration - 0.1);
  const pick = eventsOf(match, 'powerup_pick');
  assert.equal(pick.length, 1);
  assert.equal(pick[0].slot, 1);

  run(match, duration - 0.5);
  assert.ok(match.tanks[0].effects[item.type] > 0, 'sigue activo justo antes de acabar');
  run(match, 0.6);
  assert.equal(match.tanks[0].effects[item.type], 0, 'se apaga al cumplirse su tiempo');
});

test('cada power-up tiene su propia duración y recoger otro igual la renueva sin acumularla', () => {
  const durations = config.game.powerupDurationS;
  assert.deepEqual(Object.keys(durations).sort(), ['aoe', 'double', 'shield', 'speed']);
  for (const seconds of Object.values(durations)) assert.ok(seconds > 0 && seconds <= 8);

  const spots = [{ x: 10.5, y: 10.5 }];
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, spots), { powerupFirstSpawnS: 0.05, powerupSpawnS: 0.5 });
  const pickUp = () => {
    while (match.powerups.items.length === 0) match.step(DT);
    const item = match.powerups.items[0];
    match.tanks[0].x = item.x; match.tanks[0].y = item.y;
    match.step(DT);
    match.tanks[0].x = 2.5; match.tanks[0].y = 2.5;
    return item.type;
  };
  const first = pickUp();
  run(match, 2);
  const remainingBefore = match.tanks[0].effects[first];
  assert.ok(remainingBefore < durations[first] - 1.5);
  // Seguimos recogiendo hasta que salga el mismo tipo: el tiempo vuelve al máximo, nunca lo supera.
  let again;
  for (let i = 0; i < 30 && again !== first; i++) again = pickUp();
  assert.equal(again, first, 'en 30 intentos con semilla fija debería repetirse el tipo');
  assert.ok(match.tanks[0].effects[first] <= durations[first] + 1e-9);
  assert.ok(match.tanks[0].effects[first] > durations[first] - 0.1);
});

test('nunca hay más power-ups que el máximo', () => {
  const spots = Array.from({ length: 6 }, (_, i) => ({ x: 3.5 + i * 2, y: 10.5 }));
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, spots), { powerupSpawnS: 1, powerupFirstSpawnS: 1 });
  run(match, 20);
  assert.equal(match.powerups.items.length, config.game.powerupMax);
});

test('expireTime (menú de test) acaba la partida por tiempo en el siguiente paso', () => {
  const m = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 180 });
  run(m, 0.5);
  assert.equal(m.over, false);
  m.expireTime();
  run(m, DT);
  assert.equal(m.over, true);
  assert.equal(m.result.reason, 'draw');
});

test('al acabar el tiempo gana quien tiene más vidas; con empate decide la precisión; si no, empate', () => {
  const draw = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 1 });
  run(draw, 1.1);
  assert.equal(draw.over, true);
  assert.equal(draw.result.winner, null);
  assert.equal(draw.result.reason, 'draw');

  const lives = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 1 });
  lives.stats[1].lives = 2;
  run(lives, 1.1);
  assert.equal(lives.result.winner, 1);
  assert.equal(lives.result.reason, 'time');

  const accuracy = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 1 });
  accuracy.stats[1].shots = 2; accuracy.stats[1].hits = 1;
  accuracy.stats[0].shots = 2; accuracy.stats[0].hits = 0;
  run(accuracy, 1.1);
  assert.equal(accuracy.result.winner, 2);
});

test('abandonar da la victoria al rival', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.forfeit(1);
  assert.equal(match.result.winner, 2);
  assert.equal(match.result.reason, 'forfeit');
});

test('un abandono puntúa 0 para los dos y quien no ha acertado ningún disparo puntúa 0', () => {
  const forfeit = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  forfeit.stats[1].hits = 2;
  forfeit.forfeit(1);
  assert.deepEqual(forfeit.result.scores.map((s) => s.score), [0, 0]);

  const passive = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 1 });
  for (let i = 0; i < 70; i++) passive.step(DT);
  assert.equal(passive.result.reason, 'draw');
  assert.deepEqual(passive.result.scores.map((s) => s.score), [0, 0]);

  const active = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }), { matchSeconds: 1 });
  active.stats[0].hits = 1; active.stats[0].shots = 1; active.stats[1].lives = 2;
  for (let i = 0; i < 70; i++) active.step(DT);
  assert.equal(active.result.winner, 1);
  assert.ok(active.result.scores[0].score > 0 && active.result.scores[1].score === 0);
});

test('tras terminar no se puede disparar ni avanzar', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.forfeit(2);
  assert.equal(match.fire(1), false);
  const before = match.timeLeft;
  match.step(DT);
  assert.equal(match.timeLeft, before);
});

test('snapshot tiene el formato compacto acordado', () => {
  const match = newMatch(openArena({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }));
  match.tanks[0].effects.speed = 4.04;
  match.fire(1);
  const snap = match.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ['effects', 'frozen', 'powerups', 'projectiles', 't', 'tanks', 'timeLeft']);
  assert.deepEqual(snap.tanks[0], [2.5, 2.5, Math.round((Math.PI / 4) * 100) / 100, 3, 0, 0]); // x, y, apuntado, vidas, dash, invulnerable
  assert.equal(snap.projectiles[0].length, 5);
  assert.equal(snap.projectiles[0][4], 1, 'el último dato es el dueño del disparo (P1)');
  assert.deepEqual(snap.effects[0], [[1, 4]]);
  assert.deepEqual(snap.effects[1], []);
});

test('puntuación y precisión', () => {
  const perfect = { result: 1, hits: 3, enemyLives: 3, livesLeft: 3, livesStart: 3, shots: 3, bankHits: 3, won: true, elapsed: 20, matchSeconds: 180, par: 45 };
  assert.equal(calculateScore({ ...perfect, shots: 8, hits: 8, enemyLives: 8 }), SCORE_MAX, 'partida perfecta contra personas = máximo');
  assert.equal(calculateScore({ ...perfect, shots: 9, hits: 9, enemyLives: 9, livesLeft: 5, livesStart: 5 }, { vsBots: true }), SCORE_MAX, 'contra bots también se llega al máximo');
  assert.equal(calculateScore({ result: 0, hits: 0, enemyLives: 3, livesLeft: 0, livesStart: 3, shots: 0, bankHits: 0, won: false, elapsed: 60, matchSeconds: 180, par: 45 }), 0);
  // Contra bots el daño y la puntería pesan menos y la supervivencia más
  const fighter = { result: 0, hits: 9, enemyLives: 9, livesLeft: 0, livesStart: 5, shots: 9, bankHits: 0, won: false, elapsed: 60, matchSeconds: 180, par: 50 };
  assert.ok(calculateScore(fighter, { vsBots: true }) < calculateScore(fighter));
  const survivor = { ...fighter, hits: 1, livesLeft: 5 };
  assert.ok(calculateScore(survivor, { vsBots: true }) > calculateScore(survivor));
  // Pocos disparos no dan la precisión máxima; ganar tarde da menos rapidez
  assert.ok(accuracyFactor(2, 2) < accuracyFactor(8, 8));
  assert.equal(speedFactor({ won: true, elapsed: 30, matchSeconds: 180, par: 45 }), 1);
  assert.equal(speedFactor({ won: true, elapsed: 180, matchSeconds: 180, par: 45 }), 0);
  assert.equal(speedFactor({ won: false, elapsed: 10, matchSeconds: 180, par: 45 }), 0);
  for (const w of Object.values(SCORE_WEIGHTS)) assert.equal(Object.values(w).reduce((a, b) => a + b, 0), SCORE_MAX, 'los pesos de cada modo suman el máximo');
  assert.equal(calculateAccuracy(1, 3), 33.3);
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(5, 2), 100);
});

test('una partida completa con el mapa real: entradas aleatorias durante 10 minutos de juego, rápida y sin errores', () => {
  const rng = seeded(42);
  const arena = createArena();
  const match = createMatch({ arena, cfg: { ...config.game, introS: 0, matchSeconds: 1e9, lives: 1e9 }, rng, initials: ['AAA', 'BBB'] });
  const start = performance.now();
  const ticks = 60 * 60 * 10;
  for (let i = 0; i < ticks; i++) {
    if (i % 20 === 0) {
      for (const slot of [1, 2]) {
        match.setMove(slot, rng() * 2 - 1, rng() * 2 - 1);
        match.setAim(slot, rng() * Math.PI * 2);
        if (rng() < 0.5) match.fire(slot);
      }
    }
    match.step(DT);
    match.drainEvents();
    for (const tank of match.tanks) {
      const inside = tank.x >= 1.5 - 1e-6 && tank.x <= arena.width - 1.5 + 1e-6 && tank.y >= 1.5 - 1e-6 && tank.y <= arena.height - 1.5 + 1e-6;
      assert.ok(inside, `un tanque salió del mapa (${tank.x}, ${tank.y})`);
    }
  }
  const elapsed = performance.now() - start;
  // Límite holgado a propósito: en un equipo ocupado (navegador, OneDrive...) esto puede ir 20 veces más lento que el
  // normal (unos 100 ms) y no debe fallar por eso. Lo que se vigila es una regresión grande: 8 s serían ~220 µs por tick,
  // todavía muy por debajo de los 16.600 µs de que dispone cada tick a 60 Hz.
  assert.ok(elapsed < 8000, `36.000 ticks tardaron ${elapsed.toFixed(0)} ms`);
  console.log(`  36.000 ticks en ${elapsed.toFixed(0)} ms (${((elapsed / ticks) * 1000).toFixed(1)} µs por tick)`);
});
