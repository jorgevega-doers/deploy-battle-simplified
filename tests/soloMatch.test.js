import { test } from 'node:test';
import { SCORE_MAX } from '../server/game/score.js';
import assert from 'node:assert/strict';
import { createMatch } from '../server/game/match.js';
import { createSoloBot, BOT_SKILLS } from '../server/game/soloBot.js';
import { createNav } from '../server/game/botNav.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';

const DT = 1 / config.game.tickHz;
const arena = createArena();

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
const soloMatch = (seed = 1, overrides = {}) => createMatch({
  arena, cfg: { ...config.game, introS: 0, ...overrides }, rng: seeded(seed), initials: ['YOU', 'AXL', 'VEX', 'ZED'], solo: true,
});
const botsFor = (seed, slots = [2, 3, 4]) => slots.map((slot, i) => createSoloBot(slot, { arena, cfg: config.game, rng: seeded(seed + slot), skill: BOT_SKILLS[i] }));

test('el modo de un jugador crea 4 tanques, uno en cada esquina, y los snapshots llevan 4 entradas', () => {
  const match = soloMatch();
  assert.equal(match.tanks.length, 4);
  assert.deepEqual(match.tanks.map((t) => [t.x, t.y]), arena.cornerSpawns.map((s) => [s.x, s.y]));
  const snap = match.snapshot();
  assert.equal(snap.tanks.length, 4);
  assert.equal(snap.effects.length, 4);
  assert.equal(snap.tanks[0].length, 6);
});

test('un bot herido reaparece lejos, invulnerable, sin parar la partida', () => {
  const match = soloMatch();
  const bot = match.tanks[1];
  match.projectiles[0].active = true; // disparo del jugador justo encima del bot 2
  Object.assign(match.projectiles[0], { id: 99, owner: 1, x: bot.x - 0.3, y: bot.y, dx: 1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  const hits = match.drainEvents().filter((e) => e.type === 'hit');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].slot, 2);
  assert.equal(hits[0].round, false);
  assert.equal(match.stats[1].lives, config.game.lives - 1);
  assert.ok(bot.invuln > 1);
  assert.equal(match.frozen, false, 'un bot herido no congela la ronda');
  assert.equal(match.over, false);
});

test('un bot invulnerable no recibe impactos: el disparo lo atraviesa', () => {
  const match = soloMatch();
  const bot = match.tanks[1];
  bot.invuln = 1;
  Object.assign(match.projectiles[0], { active: true, id: 7, owner: 1, x: bot.x - 0.3, y: bot.y, dx: 1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  assert.equal(match.stats[1].lives, config.game.lives);
});

test('al eliminar a los 3 bots gana el jugador con una buena puntuación (sin pasar del máximo)', () => {
  const match = soloMatch(1, { lives: 1 });
  for (let b = 1; b <= 3; b++) {
    const bot = match.tanks[b];
    Object.assign(match.projectiles[b], { active: true, id: 50 + b, owner: 1, x: bot.x - 0.3, y: bot.y, dx: 1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  }
  match.step(DT);
  assert.equal(match.over, true);
  assert.equal(match.result.winner, 1);
  assert.equal(match.result.reason, 'lives');
  const [human, ...bots] = match.result.scores;
  assert.ok(human.score >= 5000 && human.score <= SCORE_MAX, `puntuación ${human.score}`);
  assert.ok(bots.every((b) => b.bot === true));
  assert.equal(human.bot, false);
  const last = match.drainEvents().filter((e) => e.type === 'hit').at(-1);
  assert.equal(last.final, true);
});

test('el jugador empieza con más vidas que los bots y las vidas extra no inflan su puntuación', () => {
  const match = soloMatch();
  assert.equal(match.stats[0].lives, config.game.soloPlayerLives);
  assert.ok(config.game.soloPlayerLives > config.game.lives);
  assert.equal(match.stats[1].lives, config.game.lives);
  match.expireTime();
  match.step(DT);
  assert.ok(match.result.scores[0].score <= SCORE_MAX);
});

test('el jugador está protegido al empezar y tras cada pausa de ronda: los disparos lo atraviesan', () => {
  const match = soloMatch();
  const me = match.tanks[0];
  assert.ok(me.invuln >= config.game.soloStartInvulnS - 1e-9);
  Object.assign(match.projectiles[0], { active: true, id: 8, owner: 2, x: me.x + 0.3, y: me.y, dx: -1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  assert.equal(match.stats[0].lives, config.game.soloPlayerLives);
  for (let i = 0; i < Math.ceil((config.game.soloStartInvulnS + 0.1) / DT); i++) match.step(DT);
  assert.equal(me.invuln, 0);
  // tras un impacto (ronda nueva) vuelve a estar protegido durante la pausa y un rato después
  Object.assign(match.projectiles[0], { active: true, id: 9, owner: 2, x: me.x + 0.3, y: me.y, dx: -1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  assert.equal(match.stats[0].lives, config.game.soloPlayerLives - 1);
  assert.ok(me.invuln > config.game.roundFreezeS);
});

test('si matan al jugador pierde: gana el bot que le disparó', () => {
  const match = soloMatch(1, { lives: 1, soloPlayerLives: 1 });
  const me = match.tanks[0];
  me.invuln = 0; // sin la protección del principio
  Object.assign(match.projectiles[0], { active: true, id: 3, owner: 3, x: me.x + 0.3, y: me.y, dx: -1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  assert.equal(match.over, true);
  assert.equal(match.result.winner, 3);
});

test('un impacto al jugador reinicia la ronda de los tanques vivos (y deja a los bots eliminados donde estén)', () => {
  const match = soloMatch();
  match.tanks[2].alive = false;
  match.stats[2].lives = 0;
  const me = match.tanks[0];
  me.invuln = 0; // sin la protección del principio
  me.x = 10; me.y = 10;
  Object.assign(match.projectiles[0], { active: true, id: 4, owner: 2, x: me.x + 0.3, y: me.y, dx: -1, dy: 0, speed: 11, bounces: 0, aoe: false, life: 2 });
  match.step(DT);
  assert.equal(match.frozen, true);
  assert.deepEqual([me.x, me.y], [arena.cornerSpawns[0].x, arena.cornerSpawns[0].y]);
});

test('los tanques no se atraviesan entre sí en el modo de un jugador', () => {
  const match = soloMatch();
  match.tanks[1].x = 5; match.tanks[1].y = 2.5;
  match.tanks[0].x = 3.2; match.tanks[0].y = 2.5;
  match.setMove(1, 1, 0);
  for (let i = 0; i < 120; i++) match.step(DT);
  assert.ok(match.tanks[0].x <= 5 - 1 + 1e-6, `x = ${match.tanks[0].x}`);
});

test('el BFS rodea los muros: de una esquina a la opuesta hay camino y cada paso es una celda libre', () => {
  const nav = createNav(arena);
  const out = { x: 0, y: 0 };
  const steps = nav.step(2.5, 2.5, 29.5, 15.5, 1, out);
  assert.ok(steps > 25 && steps < 60, `pasos = ${steps}`);
  assert.equal(arena.solid(Math.floor(out.x), Math.floor(out.y)), false);
});

test('tres bots contra un jugador quieto: lo eliminan en menos de 2 minutos (en 5 de 6 partidas)', () => {
  let kills = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const match = soloMatch(seed, { matchSeconds: 180 });
    const bots = botsFor(seed * 100);
    for (let i = 0; i < 120 / DT && !match.over; i++) {
      for (const bot of bots) bot.think(match, DT);
      match.step(DT);
      match.drainEvents();
    }
    if (match.over && match.result.winner !== 1) kills++;
  }
  assert.ok(kills >= 5, `los bots solo ganaron ${kills} de 6`);
});

test('los bots esquivan: un jugador que dispara sin parar a un bot no lo elimina sin más', () => {
  // Un bot en solitario contra un tirador fijo que le apunta con puntería perfecta: debe esquivar bastantes disparos.
  const match = soloMatch(3, { lives: 99 });
  const bot = createSoloBot(2, { arena, cfg: config.game, rng: seeded(5), skill: BOT_SKILLS[0] });
  match.tanks[2].alive = false; match.tanks[3].alive = false;
  match.tanks[0].x = 8; match.tanks[0].y = 15.5; // fila despejada de muros, a 12 celdas
  match.tanks[1].x = 20; match.tanks[1].y = 15.5;
  for (let i = 0; i < 40 / DT; i++) {
    const me = match.tanks[0];
    const enemy = match.tanks[1];
    me.invuln = 10; // el tirador es inmune: así el bot no lo ataca y el test solo mide cuánto esquiva
    match.setAim(1, Math.atan2(enemy.y - me.y, enemy.x - me.x));
    match.fire(1);
    bot.think(match, DT);
    match.step(DT);
    match.drainEvents();
  }
  const shots = match.stats[0].shots;
  const hits = 99 - match.stats[1].lives;
  assert.ok(shots > 20);
  assert.ok(hits < shots * 0.7, `el bot recibió ${hits} de ${shots} disparos`);
});

test('una partida de 4 bots (con 3 de ellos contra el "jugador" también bot) no falla y termina o llega al final del tiempo', () => {
  const match = soloMatch(9, { matchSeconds: 60 });
  const bots = botsFor(900, [1, 2, 3, 4].slice(0, 3));
  const fourth = createSoloBot(4, { arena, cfg: config.game, rng: seeded(77), skill: BOT_SKILLS[1] });
  const all = [...bots, fourth];
  let events = 0;
  for (let i = 0; i < 70 / DT && !match.over; i++) {
    for (const bot of all) bot.think(match, DT);
    match.step(DT);
    events += match.drainEvents().length;
  }
  assert.equal(match.over, true);
  assert.ok(events > 0);
  for (const t of match.tanks) assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
});

test('un bot pegado a la esquina de una columna (el atasco que se veía en las esquinas) sale solo y se aleja', () => {
  // Arriba a la izquierda: el tanque (x 2,5) pegado a la esquina de la columna de 3,10 (2 x 4), que acaba en y = 14. Antes empujaba recto
  // contra el muro porque un rayo por el centro rozaba el borde y le parecía libre.
  for (const seed of [1, 2, 3, 4, 5]) {
    const match = soloMatch(seed, { lives: 99, soloStartInvulnS: 0, soloBotWarmupS: 0 });
    match.tanks[2].x = 2.5; match.tanks[2].y = 14.0;
    match.tanks[0].x = 20; match.tanks[0].y = 2.5; match.tanks[1].x = 29.5; match.tanks[1].y = 15.5; match.tanks[3].x = 29.5; match.tanks[3].y = 2.5;
    // Solo piensa este bot: los demás tanques están quietos y nadie dispara, así que solo se mide su movimiento.
    const bot = createSoloBot(3, { arena, cfg: config.game, rng: seeded(seed * 7), skill: BOT_SKILLS[1] });
    let maxAway = 0;
    let slow = 0;
    for (let i = 0; i < 5 / DT; i++) {
      bot.think(match, DT);
      match.step(DT);
      const t = match.tanks[2];
      maxAway = Math.max(maxAway, Math.hypot(t.x - 2.5, t.y - 14.0));
      if (i > 60 && Math.hypot(t.moveX, t.moveY) > 0.3 && Math.hypot(t.vx, t.vy) < 0.4) slow++;
    }
    assert.ok(maxAway > 3, `semilla ${seed}: solo se alejó ${maxAway.toFixed(2)} celdas`);
    assert.ok(slow < 1.2 / DT, `semilla ${seed}: pasó ${(slow * DT).toFixed(1)} s empujando sin avanzar`);
  }
});
