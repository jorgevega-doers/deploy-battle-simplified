// Bot del modo de un jugador (1 contra 3). Maneja su tanque como lo haría un mando (setMove, setAim, fire, dash) y
// juega bastante bien sin hacer trampas: ve el mapa y los demás tanques, pero reacciona con retardo y apunta con algo de error.
//  - Objetivo: el enemigo más cercano (el jugador humano pesa más) con vía libre; no dispara a un tanque invulnerable.
//  - Puntería: si hay línea directa, apunta con adelanto a donde estará (usa la velocidad del rival); si no, busca un
//    tiro con hasta 2 rebotes (misma geometría que la simulación) que llegue al rival.
//  - Movimiento: con vía libre mantiene la distancia (se acerca, se aleja o se mueve de lado) y sin ella rodea los muros
//    con un camino BFS (botNav.js); recoge power-ups cercanos y se separa de los otros bots.
//  - Esquinas (28-oct): mide cuánto espacio libre tiene a su alrededor (8 rayos); se aparta de las paredes cercanas, no retrocede
//    hacia un muro y, si se ve encajonado en una esquina, sale en línea recta hacia el lado más abierto en vez de bailar. Solo
//    afecta a cómo se mueve, no a su puntería ni a su velocidad de reacción (el jugador sigue teniendo ventaja).
//  - Defensa: predice la trayectoria de los disparos ajenos (con rebotes) y, si van a pasar cerca, se aparta de lado o
//    hace dash. Cada bot tiene su "habilidad" (reacción, error de puntería, probabilidad de esquivar).
// Qué NO hace: no usa sockets, no mira el estado interno de la partida más que lo público (tanques, disparos, power-ups).
import { raycastGrid, tracePath } from '../../shared/geometry.js';
import { MAX_BOUNCES } from '../../shared/constants.js';
import { createNav } from './botNav.js';

// Habilidad de cada bot: reaction = segundos que tarda en reaccionar a un disparo ajeno, aimError = error de puntería (rad),
// dodgeChance = probabilidad de esquivar un disparo que ve venir, fireDelay = segundos desde que ve al rival hasta disparar y
// fireEvery = tiempo medio entre disparos (la cadencia del tanque es 0,6 s: ellos disparan más despacio, para que se pueda ganar).
export const BOT_SKILLS = Object.freeze([
  { reaction: 0.3, aimError: 0.075, dodgeChance: 0.6, fireDelay: 0.35, fireEvery: 1.1 },
  { reaction: 0.38, aimError: 0.1, dodgeChance: 0.5, fireDelay: 0.45, fireEvery: 1.3 },
  { reaction: 0.45, aimError: 0.12, dodgeChance: 0.4, fireDelay: 0.55, fireEvery: 1.5 },
]);

// Dificultades. PRO = la más dura. STAND (= FÁCIL; el nombre se queda: es el que guarda el ranking): los bots reaccionan más tarde, apuntan peor,
// esquivan poco y disparan más despacio, pero se mueven igual de bien (no parecen tontos: simplemente son menos precisos); el jugador
// tiene una vida más y los bots tardan algo más en empezar a disparar.
export const DIFFICULTY = Object.freeze({
  pro: { skills: BOT_SKILLS, botWarmupS: 3, playerLivesBonus: 0, aimAssist: { cone: 0, strength: 0 } }, // PRO: sin ayuda de puntería
  stand: {
    skills: Object.freeze([
      { reaction: 0.62, aimError: 0.2, dodgeChance: 0.2, fireDelay: 0.85, fireEvery: 2.1 },
      { reaction: 0.72, aimError: 0.25, dodgeChance: 0.15, fireDelay: 1.0, fireEvery: 2.4 },
      { reaction: 0.82, aimError: 0.3, dodgeChance: 0.1, fireDelay: 1.15, fireEvery: 2.8 },
    ]),
    botWarmupS: 4.5,
    playerLivesBonus: 1,
    aimAssist: { cone: 0.22, strength: 0.65 }, // STAND: ayuda de puntería discreta (~12 grados de cono)
  },
  // MEDIA (la de la partida normal): punto medio entre FÁCIL y PRO, valor a valor.
  media: {
    skills: Object.freeze([
      { reaction: 0.46, aimError: 0.14, dodgeChance: 0.4, fireDelay: 0.6, fireEvery: 1.6 },
      { reaction: 0.55, aimError: 0.17, dodgeChance: 0.33, fireDelay: 0.72, fireEvery: 1.85 },
      { reaction: 0.63, aimError: 0.21, dodgeChance: 0.25, fireDelay: 0.85, fireEvery: 2.15 },
    ]),
    botWarmupS: 3.75,
    playerLivesBonus: 0,
    aimAssist: { cone: 0.11, strength: 0.33 }, // la mitad de la ayuda de STAND
  },
});

const HUMAN_PREFERENCE = 0.9;    // los bots prefieren algo al jugador (distancia x este factor), pero también se atacan entre sí
const RANGE_MIN = 5;             // más cerca que esto retrocede
const RANGE_MAX = 9.5;           // más lejos que esto se acerca
const THREAT_LOOKAHEAD_S = 0.85; // cuánto futuro mira de cada disparo ajeno
const THREAT_DISTANCE = 0.88;    // un disparo que pasa más cerca que esto del centro del tanque es una amenaza
const DODGE_S = 0.42;            // cuánto dura cada esquiva
const BOUNCE_SAMPLES = 72;       // direcciones que prueba para un tiro con rebote
const BOUNCE_MAX_LENGTH = 19;    // recorrido máximo de un tiro con rebote
const WALL_RANGE = 2.2;          // a esta distancia (celdas) empieza a notar una pared
const CORNERED_RAYS = 5;         // si 5 o más de sus 8 rayos topan con un muro a menos de CORNERED_NEAR, está encajonado
const CORNERED_NEAR = 1.6;
const CORNERED_AFTER_S = 0.6;    // solo sale si lleva tanto tiempo seguido encajonado (pelear cerca de una pared es normal)
const ESCAPE_S = 1.1;            // cuánto sigue saliendo de una esquina por la dirección elegida
const BOUNCE_TOLERANCE = 0.5;    // un tiro pasa por el rival si su recorrido queda a menos de esto de su centro
const hit = { t: 0, x: 0, y: 0, nx: 0, ny: 0 };
const waypoint = { x: 0, y: 0 };

const rand = (rng, min, max) => min + rng() * (max - min);

// Distancia de un punto a un segmento.
function pointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function createSoloBot(slot, { arena, cfg, rng = Math.random, skill = BOT_SKILLS[0] }) {
  const nav = createNav(arena, rng);
  const solid = arena.solid;
  const trace = [];
  const bounceTrace = [];
  let t = 0;
  let target = -1;
  let nextTargetAt = 0;
  let nextPlanAt = 0;
  let nextShotAt = 0;
  // Calentamiento: al empezar la partida y tras cada pausa de ronda los bots tardan unos segundos en empezar a disparar.
  const warmup = () => (cfg.soloBotWarmupS ?? 0) * (0.7 + rng() * 0.6);
  let holdFireUntil = warmup();
  let wasFrozen = false;
  let plan = null;              // { angle, ready: instante en que puede disparar }
  let strafe = rng() < 0.5 ? 1 : -1;
  let nextStrafeAt = 0;
  let dodgeUntil = 0;
  let dodgeX = 0;
  let dodgeY = 0;
  let handledThreat = -1;       // id del último disparo ante el que ya decidió esquivar o no
  let threatSeenAt = 0;
  let nextScanAt = 0;
  let nextPathAt = 0;
  let pathX = 0;
  let pathY = 0;
  let stuckAt = 0;
  let stuckX = 0;
  let stuckY = 0;
  let unstickUntil = 0;
  let unstickAngle = 0;
  const aimNoise = () => (rng() * 2 - 1) * skill.aimError;

  // ¿Hay vía libre (sin muros) entre dos puntos? Un solo rayo por el centro: el disparo sale del centro del tanque.
  function clear(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (dist < 1e-6) return true;
    return !raycastGrid(solid, x0, y0, (x1 - x0) / dist, (y1 - y0) / dist, dist, hit);
  }
  // ¿Se puede avanzar al menos "dist" celdas en esa dirección sin chocar? (rayos algo desplazados a los lados: el tanque mide 1)
  function open(me, dx, dy, dist) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    for (const side of [-0.42, 0, 0.42]) {
      if (raycastGrid(solid, me.x - uy * side, me.y + ux * side, ux, uy, dist, hit)) return false;
    }
    return true;
  }

  // Elige a quién atacar: el más cercano (con ventaja para el humano y para quien está a tiro); ignora eliminados e invulnerables.
  // Si TODOS los rivales son invulnerables (protección igual para todos al empezar) elige el más cercano igualmente: así se
  // recoloca y se acerca, pero no dispara hasta que pueda hacer daño.
  function pickTarget(match, me, includeInvulnerable = false) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < match.tanks.length; i++) {
      const other = match.tanks[i];
      if (i === slot - 1 || !other.alive || match.sameTeam?.(slot, i + 1) || (other.invuln > 0 && !includeInvulnerable)) continue; // los compañeros de equipo no son enemigos
      let score = Math.hypot(other.x - me.x, other.y - me.y) * ((match.isHuman?.(i + 1) ?? i === 0) ? HUMAN_PREFERENCE : 1);
      if (clear(me.x, me.y, other.x, other.y)) score *= 0.8;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // Busca un tiro con rebotes que llegue al rival: prueba 72 direcciones, se queda con la que pasa más cerca y la afina.
  function bounceShot(me, enemy) {
    const score = (angle) => {
      tracePath(solid, me.x, me.y, angle, 2, BOUNCE_MAX_LENGTH, bounceTrace);
      let best = Infinity;
      for (let i = 2; i + 3 < bounceTrace.length; i += 2) { // se salta el primer tramo: ese es el tiro directo (ya descartado)
        best = Math.min(best, pointSegment(enemy.x, enemy.y, bounceTrace[i], bounceTrace[i + 1], bounceTrace[i + 2], bounceTrace[i + 3]));
      }
      return best;
    };
    let bestAngle = 0;
    let bestScore = Infinity;
    const phase = rng() * Math.PI * 2; // las direcciones de prueba empiezan en un ángulo al azar: un empate no favorece siempre al mismo lado
    for (let k = 0; k < BOUNCE_SAMPLES; k++) {
      const angle = phase + (k / BOUNCE_SAMPLES) * Math.PI * 2;
      const s = score(angle);
      if (s < bestScore) { bestScore = s; bestAngle = angle; }
    }
    for (const delta of [0.04, -0.04, 0.02, -0.02, 0.01, -0.01]) { // afinado
      const s = score(bestAngle + delta);
      if (s < bestScore) { bestScore = s; bestAngle += delta; }
    }
    return bestScore < BOUNCE_TOLERANCE ? bestAngle : null;
  }

  // Calcula cómo dispararle al objetivo: directo con adelanto, o con rebote.
  function makePlan(match, me, enemy) {
    const dist = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    const flight = dist / cfg.projectileSpeed;
    const lead = 0.85; // la velocidad del rival cambia enseguida: se adelanta casi todo, no todo
    const px = enemy.x + enemy.vx * flight * lead;
    const py = enemy.y + enemy.vy * flight * lead;
    let angle = null;
    if (clear(me.x, me.y, px, py) && !solid(Math.floor(px), Math.floor(py))) angle = Math.atan2(py - me.y, px - me.x);
    else if (clear(me.x, me.y, enemy.x, enemy.y)) angle = Math.atan2(enemy.y - me.y, enemy.x - me.x);
    else if (dist < 15) angle = bounceShot(me, enemy);
    if (angle === null) { plan = null; return; }
    // El error de puntería crece con la distancia (a corta distancia casi no falla).
    angle += aimNoise() * Math.min(1.4, 0.5 + dist / 9);
    plan = { angle, ready: plan ? plan.ready : t + skill.fireDelay + rng() * 0.15 };
  }

  // Busca el disparo ajeno más peligroso: el que antes pase cerca de mí en el próximo instante.
  function findThreat(match, me) {
    let bestTime = Infinity;
    let threat = null;
    for (let i = 0; i < match.projectiles.length; i++) {
      const p = match.projectiles[i];
      if (!p.active || p.owner === slot) continue;
      tracePath(solid, p.x, p.y, Math.atan2(p.dy, p.dx), Math.max(0, MAX_BOUNCES - p.bounces), p.speed * THREAT_LOOKAHEAD_S, trace);
      let travelled = 0;
      for (let k = 0; k + 3 < trace.length; k += 2) {
        const ax = trace[k]; const ay = trace[k + 1]; const bx = trace[k + 2]; const by = trace[k + 3];
        const d = pointSegment(me.x, me.y, ax, ay, bx, by);
        const segLen = Math.hypot(bx - ax, by - ay);
        if (d < THREAT_DISTANCE) {
          const along = Math.max(0, Math.min(segLen, ((me.x - ax) * (bx - ax) + (me.y - ay) * (by - ay)) / (segLen || 1)));
          const time = (travelled + along) / p.speed;
          if (time < bestTime) {
            bestTime = time;
            const ux = (bx - ax) / (segLen || 1);
            const uy = (by - ay) / (segLen || 1);
            // Se aparta perpendicular a la trayectoria, hacia el lado donde ya está.
            const side = Math.sign(ux * (me.y - ay) - uy * (me.x - ax)) || (rng() < 0.5 ? 1 : -1);
            threat = { id: p.id, time, dx: -uy * side, dy: ux * side };
          }
          break;
        }
        travelled += segLen;
      }
    }
    return threat;
  }

  // Dirección deseada hacia un punto rodeando muros (camino BFS recalculado unas 4 veces por segundo).
  function steerTo(me, gx, gy, out) {
    if (t >= nextPathAt) {
      nextPathAt = t + 0.25;
      const steps = nav.step(me.x, me.y, gx, gy, 2, waypoint);
      if (steps > 0) { pathX = waypoint.x; pathY = waypoint.y; } else { pathX = gx; pathY = gy; }
    }
    out.x = pathX - me.x;
    out.y = pathY - me.y;
  }

  const want = { x: 0, y: 0 };
  // Espacio libre alrededor: 8 rayos cada 0,1 s. push = vector que aleja de las paredes cercanas; cornered = encajonado;
  // freeX/freeY = dirección del rayo más largo (por dónde salir).
  const space = { push: { x: 0, y: 0 }, cornered: false, freeX: 0, freeY: 0, at: -1 };
  let escapeUntil = 0;
  let corneredSince = -1;
  const scanStart = Math.floor(rng() * 8); // por qué dirección empieza a medir: así un empate entre dos salidas no favorece siempre a la misma
  let escapeX = 0;
  let escapeY = 0;
  function scanSpace(me) {
    space.push.x = 0; space.push.y = 0;
    let near = 0;
    let longest = -1;
    for (let n = 0; n < 8; n++) {
      const a = (((n + scanStart) % 8) * Math.PI) / 4;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      // Tres rayos paralelos (el tanque mide 1): uno por el centro rozaría el borde de una columna y daría el paso por libre.
      let len = WALL_RANGE + 1.5;
      for (const side of [-0.42, 0, 0.42]) {
        if (raycastGrid(solid, me.x - uy * side, me.y + ux * side, ux, uy, WALL_RANGE + 1.5, hit)) len = Math.min(len, hit.t);
      }
      if (len < WALL_RANGE) {
        const w = ((WALL_RANGE - len) / WALL_RANGE) ** 1.5 * 1.4;
        space.push.x -= ux * w;
        space.push.y -= uy * w;
      }
      if (len < CORNERED_NEAR) near++;
      if (len > longest) { longest = len; space.freeX = ux; space.freeY = uy; }
    }
    space.cornered = near >= CORNERED_RAYS;
  }

  return {
    // dt en segundos; match = la partida. Una vez por tick del servidor.
    think(match, dt) {
      const me = match.tanks[slot - 1];
      if (!me.alive) return;
      if (match.frozen) { match.setMove(slot, 0, 0); wasFrozen = true; return; }
      t += dt;
      if (wasFrozen) { wasFrozen = false; holdFireUntil = t + warmup() * 0.6; } // la ronda acaba de reiniciarse

      // 1. Objetivo
      if (t >= nextTargetAt || target === -1 || !match.tanks[target].alive) {
        nextTargetAt = t + 0.5;
        const before = target;
        target = pickTarget(match, me);
        if (target === -1) target = pickTarget(match, me, true);
        if (target !== before) plan = null;
      }
      const enemy = target === -1 ? null : match.tanks[target];
      const sees = enemy !== null && clear(me.x, me.y, enemy.x, enemy.y);
      const dist = enemy ? Math.hypot(enemy.x - me.x, enemy.y - me.y) : 0;

      // 2. Amenazas: disparos ajenos que van a pasar cerca. Decide una vez por disparo si esquiva (según su habilidad).
      if (t >= nextScanAt) {
        nextScanAt = t + 0.05;
        const threat = findThreat(match, me);
        if (threat && threat.id !== handledThreat) {
          if (threatSeenAt === 0) threatSeenAt = t;
          if (t - threatSeenAt >= skill.reaction) {
            handledThreat = threat.id;
            threatSeenAt = 0;
            if (rng() < skill.dodgeChance && threat.time > 0.05) {
              dodgeX = threat.dx;
              dodgeY = threat.dy;
              if (!open(me, dodgeX, dodgeY, 1.1)) { dodgeX = -dodgeX; dodgeY = -dodgeY; } // el otro lado
              dodgeUntil = t + DODGE_S;
              if (threat.time < 0.32) { match.setMove(slot, dodgeX, dodgeY); match.dash(slot); } // muy justo: dash
            }
          }
        } else if (!threat) threatSeenAt = 0;
      }

      // 3. Puntería y disparo
      if (enemy && t >= nextPlanAt) {
        nextPlanAt = t + (sees ? 0.1 : 0.4);
        makePlan(match, me, enemy);
      }
      if (plan) {
        match.setAim(slot, plan.angle);
        if (t >= plan.ready && t >= nextShotAt && t >= holdFireUntil && enemy && enemy.invuln <= 0 && me.cooldown <= 0.05 && match.fire(slot)) nextShotAt = t + skill.fireEvery * rand(rng, 0.75, 1.35);
      } else if (enemy) {
        match.setAim(slot, Math.atan2(enemy.y - me.y, enemy.x - me.x));
      }

      // 4. Movimiento
      if (t - space.at >= 0.1) { space.at = t; scanSpace(me); }
      if (t < escapeUntil && !open(me, escapeX, escapeY, 0.55)) { escapeUntil = 0; space.at = -1; scanSpace(me); } // el camino de salida se ha bloqueado: vuelve a medir
      if (!space.cornered) corneredSince = -1; else if (corneredSince < 0) corneredSince = t;
      if (corneredSince >= 0 && t - corneredSince >= CORNERED_AFTER_S && t >= escapeUntil && t >= dodgeUntil) {
        corneredSince = -1; // encajonado: sale en línea recta por el lado más abierto
        escapeUntil = t + ESCAPE_S;
        escapeX = space.freeX;
        escapeY = space.freeY;
      }
      want.x = 0;
      want.y = 0;
      let moving = true;
      if (t < dodgeUntil) {
        want.x = dodgeX;
        want.y = dodgeY;
      } else if (t < unstickUntil) {
        want.x = Math.cos(unstickAngle);
        want.y = Math.sin(unstickAngle);
      } else if (t < escapeUntil) {
        want.x = escapeX;
        want.y = escapeY;
      } else {
        const power = match.powerups.items.length > 0 ? nearestPowerup(match, me) : null;
        if (power && (!sees || dist > 6) && Math.hypot(power.x - me.x, power.y - me.y) < 9) {
          steerTo(me, power.x, power.y, want);
        } else if (enemy && sees) {
          const ux = (enemy.x - me.x) / (dist || 1);
          const uy = (enemy.y - me.y) / (dist || 1);
          if (t >= nextStrafeAt) { nextStrafeAt = t + rand(rng, 0.8, 1.8); if (rng() < 0.5) strafe = -strafe; }
          let radial = dist > RANGE_MAX ? 1 : dist < RANGE_MIN ? -1 : 0.15;
          if (radial < 0 && !open(me, -ux, -uy, 2.2)) radial = 0; // no retrocede hacia un muro: se mueve de lado
          want.x = ux * radial + -uy * strafe * 0.9;
          want.y = uy * radial + ux * strafe * 0.9;
          if (!open(me, want.x, want.y, 1.0)) { strafe = -strafe; want.x = ux * radial + uy * strafe * 0.9; want.y = uy * radial - ux * strafe * 0.9; }
        } else if (enemy) {
          steerTo(me, enemy.x, enemy.y, want);
        } else moving = false;
      }
      if (moving && t >= dodgeUntil && t >= escapeUntil) { // las paredes cercanas lo apartan un poco (no al esquivar ni al salir de una esquina)
        want.x += space.push.x;
        want.y += space.push.y;
      }
      if (moving) {
        // Separación de los demás tanques: no se amontonan ni se bloquean entre sí.
        for (let i = 0; i < match.tanks.length; i++) {
          const other = match.tanks[i];
          if (i === slot - 1 || !other.alive) continue;
          const d = Math.hypot(me.x - other.x, me.y - other.y);
          if (d < 2.4 && d > 1e-6) { want.x += ((me.x - other.x) / d) * (2.4 - d) * 0.6; want.y += ((me.y - other.y) / d) * (2.4 - d) * 0.6; }
        }
        const len = Math.hypot(want.x, want.y);
        if (len > 1e-6) match.setMove(slot, want.x / len, want.y / len); else match.setMove(slot, 0, 0);
      } else match.setMove(slot, 0, 0);

      // 5. Atasco: si lleva medio segundo queriendo moverse y no avanza, prueba otra dirección un momento.
      if (t - stuckAt >= 0.5) {
        if (moving && t >= dodgeUntil && Math.hypot(me.x - stuckX, me.y - stuckY) < 0.12) {
          // Atascado: casi siempre sale hacia donde hay más espacio; a veces prueba una dirección al azar.
          unstickAngle = rng() < 0.7 ? Math.atan2(space.freeY, space.freeX) + rand(rng, -0.35, 0.35) : rand(rng, 0, Math.PI * 2);
          unstickUntil = t + 0.5;
        }
        stuckAt = t;
        stuckX = me.x;
        stuckY = me.y;
      }
    },
  };
}

function nearestPowerup(match, me) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of match.powerups.items) {
    const d = Math.hypot(item.x - me.x, item.y - me.y);
    if (d < bestDistance) { bestDistance = d; best = item; }
  }
  return best;
}
