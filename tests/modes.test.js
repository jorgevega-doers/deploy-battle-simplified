// Modos automáticos (sección 58): qué plan sale según los jugadores y cómo se juega un combate de 3 o 4 tanques (sin rondas, con equipos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, tankCount } from '../server/game/modes.js';
import { createMatch } from '../server/game/match.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';
// Valores fijos de la prueba (3 vidas, 4 el jugador contra los bots, 60 estados/s): las comprobaciones están calculadas con ellos, no con los de producción.
const GAME = { ...config.game, lives: 3, soloPlayerLives: 4, broadcastHz: 60 };

const arena = createArena();
const DT = 1 / GAME.tickHz;
const INITIALS = ['AAA', 'BBB', 'CCC', 'DDD'];
// Equipos 2 contra 2: ya no se ofrecen (29-oct), pero el motor de la partida los sigue soportando y se prueba con un plan escrito a mano.
const TEAM_PLAN = { kind: 'brawl', humans: 4, bots: 0, teams: [0, 1, 0, 1] };
const match = (plan, overrides = {}) => createMatch({ arena, cfg: { ...GAME, introS: 0, ...overrides }, rng: () => 0.5, initials: INITIALS.slice(0, tankCount(plan)), plan });
// Pone un disparo de `owner` justo encima del tanque `victim`, mirando hacia él.
function aimedShot(m, owner, victim) {
  const v = m.tanks[victim - 1];
  Object.assign(m.projectiles[0], { active: true, id: 90 + owner, owner, x: v.x - 0.3, y: v.y, dx: 1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
}

test('planFor: 1 jugador = 1 contra 3 bots; 2 = 1 contra 1; 3 y 4 = todos contra todos; nunca hay bots salvo con 1 jugador', () => {
  assert.equal(planFor(0), null);
  assert.deepEqual(planFor(1), { kind: 'solo', humans: 1, bots: 3, teams: null });
  assert.deepEqual(planFor(2), { kind: 'duel', humans: 2, bots: 0, teams: null });
  assert.deepEqual(planFor(3), { kind: 'brawl', humans: 3, bots: 0, teams: null });
  assert.deepEqual(planFor(4), { kind: 'brawl', humans: 4, bots: 0, teams: null });
});

test('tankCount', () => {
  assert.equal(tankCount(planFor(1)), 4);
  assert.equal(tankCount(planFor(2)), 2);
  assert.equal(tankCount(planFor(3)), 3);
  assert.equal(tankCount(planFor(4)), 4);
  assert.equal(tankCount(null), 0);
});

test('combate de 4 sin equipos: un golpe no reinicia la ronda, la víctima reaparece invulnerable y se queda sin vidas a las 3', () => {
  const m = match(planFor(4));
  assert.equal(m.tanks.length, 4);
  aimedShot(m, 1, 2);
  m.step(DT);
  const hit = m.drainEvents().find((e) => e.type === 'hit');
  assert.equal(hit.slot, 2);
  assert.equal(hit.round, false);
  assert.equal(m.frozen, false);
  assert.equal(m.stats[1].lives, GAME.lives - 1);
  assert.ok(m.tanks[1].invuln > 1);
  assert.equal(m.over, false);
});

test('equipos 2 contra 2: sin fuego amigo (el disparo atraviesa al compañero) y gana el equipo que queda', () => {
  const m = match(TEAM_PLAN);
  aimedShot(m, 1, 3); // P1 y P3 son compañeros
  m.step(DT);
  assert.equal(m.stats[2].lives, GAME.lives);
  assert.equal(m.drainEvents().filter((e) => e.type === 'hit').length, 0);
  // Elimina a P2 y P4 (el otro equipo): gana el equipo de P1 y P3.
  for (const victim of [2, 4]) {
    for (let k = 0; k < GAME.lives; k++) {
      m.tanks[victim - 1].invuln = 0;
      aimedShot(m, 1, victim);
      m.step(DT);
    }
  }
  assert.equal(m.over, true);
  assert.deepEqual(m.result.winners.slice().sort(), [1, 3]);
  assert.equal(m.result.kind, 'brawl');
});

test('abandono en un combate de 3: solo queda fuera quien se va y la partida sigue; con un solo humano menos, puntúa 0', () => {
  const m = match(planFor(3));
  m.forfeit(2);
  assert.equal(m.over, false);
  assert.equal(m.tanks[1].alive, false);
  m.forfeit(3);
  assert.equal(m.over, true, 'solo queda P1');
  assert.deepEqual(m.result.winners, [1]);
  const s = m.result.scores;
  assert.equal(s[1].score, 0);
  assert.equal(s[2].score, 0);
});

test('fin por tiempo en equipos: gana el equipo con más vidas sumadas', () => {
  const m = match(TEAM_PLAN);
  m.tanks[1].invuln = 0;
  aimedShot(m, 1, 2);
  m.step(DT);
  m.expireTime();
  m.step(DT);
  assert.equal(m.over, true);
  assert.deepEqual(m.result.winners.slice().sort(), [1, 3]);
  assert.equal(m.result.reason, 'time');
});

// --- Ayuda de puntería (sección 61) ---
const duel = (assist = { aimAssistConeRad: 0.22, aimAssistStrength: 0.65 }) => createMatch({ arena, cfg: { ...GAME, introS: 0, ...assist }, rng: () => 0.5, initials: ['AAA', 'BBB'], plan: { kind: 'duel', humans: 2, bots: 0, teams: null } });
const place = (m) => { // P1 en (10, 15) apuntando 0,12 rad por encima de P2, que está en (20, 15), en una fila sin muros
  Object.assign(m.tanks[0], { x: 10, y: 15, aim: 0.12 });
  Object.assign(m.tanks[1], { x: 20, y: 15, vx: 0, vy: 0 });
};
const shotAngle = (m) => { const p = m.projectiles.find((q) => q.active); return Math.atan2(p.dy, p.dx); };

test('ayuda de puntería: un disparo que falla por poco se corrige hacia el rival, sin llegar a apuntar solo', () => {
  const m = duel();
  place(m);
  m.fire(1);
  const angle = shotAngle(m);
  assert.ok(angle < 0.12 && angle > 0.12 * 0.3, `el ángulo ${angle.toFixed(3)} se acerca a 0 pero no es exacto`);
});

test('ayuda de puntería: sin ayuda, fuera del cono, con un muro de por medio o en los bots, el disparo sale tal cual', () => {
  const none = duel({ aimAssistConeRad: 0, aimAssistStrength: 0 });
  place(none); none.fire(1);
  assert.ok(Math.abs(shotAngle(none) - 0.12) < 1e-6);
  const wide = duel();
  place(wide); wide.tanks[0].aim = 0.6; wide.fire(1); // 0,6 rad: fuera del cono de 0,22
  assert.ok(Math.abs(shotAngle(wide) - 0.6) < 1e-6);
  const bot = createMatch({ arena, cfg: { ...GAME, introS: 0, aimAssistConeRad: 0.22, aimAssistStrength: 0.65 }, rng: () => 0.5, initials: ['AAA', 'AXL', 'VEX', 'ZED'], plan: { kind: 'solo', humans: 1, bots: 3, teams: null } });
  Object.assign(bot.tanks[1], { x: 20, y: 15, vx: 0, vy: 0 }); Object.assign(bot.tanks[0], { x: 10, y: 9 }); Object.assign(bot.tanks[1], { aim: Math.PI + 0.1 });
  bot.fire(2);
  assert.ok(Math.abs(Math.sin(shotAngle(bot) - (Math.PI + 0.1))) < 1e-6, 'los bots no tienen ayuda');
});
