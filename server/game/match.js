// Simulación de una partida de 2 a 4 tanques según su plan (server/game/modes.js): "duel" (1 contra 1, con rondas), "solo" (el jugador,
// slot 1, contra 3 bots, slots 2 a 4, cada uno en una esquina) o "brawl" (3 o 4 tanques a la vez, con o sin equipos 2 contra 2, sin rondas:
// el golpeado reaparece o queda eliminado). Los humanos son los primeros slots y los bots los últimos. Es lógica pura: no usa sockets ni relojes (el tiempo llega en cada step(dt)), por eso se puede probar
// simulando miles de ticks en milisegundos. Los bots los maneja server/game/soloBot.js con las mismas funciones que un mando.
import { POWERUP_TYPES } from '../../shared/constants.js';
import { raycastGrid } from '../../shared/geometry.js';
import { createTank, resetTank, tickTank, moveTank, startDash } from './tank.js';
import { createProjectilePool, spawnProjectile, advanceProjectile } from './projectile.js';
import { createPowerups } from './powerups.js';
import { calculateScore, calculateAccuracy, PAR_SECONDS, PLACE_FACTOR } from './score.js';

const EMPTY_EVENTS = Object.freeze([]);
const round2 = (v) => Math.round(v * 100) / 100;
const round1 = (v) => Math.round(v * 10) / 10;
// Cada tanque empieza mirando hacia el centro de la arena (P1 arriba a la derecha, P2 abajo a la izquierda...).

// "solo" (true/false) es la forma antigua de pedir 1 contra 3 bots o 1 contra 1: sigue valiendo si no se pasa "plan".
export function createMatch({ arena, cfg, rng = Math.random, initials = [null, null], solo: legacySolo = false, plan = null }) {
  const mode = plan ?? (legacySolo ? { kind: 'solo', humans: 1, bots: 3, teams: null } : { kind: 'duel', humans: 2, bots: 0, teams: null });
  const solo = mode.kind === 'solo';
  const brawl = mode.kind === 'brawl';
  const count = mode.humans + mode.bots;
  const spawns = mode.kind === 'duel' ? arena.spawns : arena.cornerSpawns;
  const teamOf = (index) => (mode.teams ? mode.teams[index] : index); // sin equipos, cada tanque es el suyo
  const sameTeam = (slotA, slotB) => slotA !== slotB && teamOf(slotA - 1) === teamOf(slotB - 1); // no hay fuego amigo
  const isHuman = (slot) => (solo ? slot === 1 : slot <= mode.humans);
  // Cada tanque empieza apuntando hacia el centro del mapa (las salidas cambian según el mapa).
  const tanks = Array.from({ length: count }, (_, i) => createTank(i + 1, spawns[i], Math.atan2(arena.height / 2 - spawns[i].y, arena.width / 2 - spawns[i].x)));
  // Easter egg: el JUGADOR que se llama TNI lleva un tanque chetado (cfg.tni). Los bots nunca lo son.
  const tniCfg = cfg.tni ?? null;
  const isTni = Array.from({ length: count }, (_, i) => Boolean(tniCfg) && isHuman(i + 1) && initials[i] === tniCfg.name);
  isTni.forEach((on, i) => { if (on) { tanks[i].speedFactor = tniCfg.speedFactor; tanks[i].dashCooldownS = tniCfg.dashCooldownS; } });
  // En el modo de un jugador el jugador tiene más vidas que los bots (3 contra 1 y 3 enemigos que se defienden).
  const stats = Array.from({ length: count }, (_, i) => {
    const lives = isTni[i] ? Math.max(tniCfg.lives, cfg.lives) : solo && i === 0 ? cfg.soloPlayerLives ?? cfg.lives : cfg.lives;
    return { lives, livesStart: lives, shots: 0, hits: 0, bankHits: 0, kills: 0, forfeited: false };
  });
  const fallen = []; // slots en el orden en que quedan eliminados (para el puesto en todos contra todos)
  const pool = createProjectilePool(Math.max(cfg.maxProjectilesPerPlayer, tniCfg?.maxProjectiles ?? 0) * count + 4);
  const powerups = createPowerups({ arena, rng, cfg });
  if (solo) tanks[0].invuln = cfg.soloStartInvulnS; // protección del jugador al empezar (ver startNextRound)

  let events = [];
  let timeLeft = cfg.matchSeconds;
  let introLeft = cfg.introS ?? 0; // presentación de los tanques al empezar: nadie dispara ni corre el reloj
  let frozen = introLeft;        // segundos que faltan para que se pueda volver a jugar tras un impacto
  let over = false;
  let result = null;
  let nextProjectileId = 1;
  let hitThisStep = false; // solo cuenta el primer impacto de ronda de cada tick (después se reinicia la ronda)

  const accuracyOf = (index) => calculateAccuracy(stats[index].hits, stats[index].shots);
  const eliminate = (tank) => { tank.alive = false; if (!fallen.includes(tank.slot)) fallen.push(tank.slot); };

  // Factor de resultado (0-1) de cada tanque: en 1 contra 1 y contra bots, ganar = 1 y perder = 0; en todos contra todos, según el puesto
  // (los que siguen vivos al acabar, por vidas; los eliminados, cuanto más tarde cayeron, mejor). Empate: 0,5 a los que siguen vivos.
  function resultFactors(winners) {
    const factors = new Array(count).fill(0);
    if (!winners.length) {
      for (let i = 0; i < count; i++) if (tanks[i].alive) factors[i] = 0.5;
      return factors;
    }
    for (const slot of winners) factors[slot - 1] = 1;
    if (!brawl) return factors;
    const rest = tanks.filter((t) => !winners.includes(t.slot) && t.alive).sort((a, b) => stats[b.slot - 1].lives - stats[a.slot - 1].lives).map((t) => t.slot);
    for (let k = fallen.length - 1; k >= 0; k--) if (!winners.includes(fallen[k])) rest.push(fallen[k]);
    rest.forEach((slot, k) => { factors[slot - 1] = PLACE_FACTOR[k + 1] ?? 0; });
    return factors;
  }
  // Vidas iniciales de todos los rivales de un tanque (los de otros equipos).
  const enemyLivesOf = (index) => stats.reduce((sum, s, j) => (j === index || sameTeam(index + 1, j + 1) ? sum : sum + s.livesStart), 0);
  const rivalsOf = (index) => tanks.filter((t, j) => j !== index && !sameTeam(index + 1, j + 1)).length;
  const botsAlive = () => tanks.slice(1).filter((t) => t.alive).length;

  // winner: un slot, una lista de slots (equipo ganador) o null (empate). result.winner es el primero (o null) y result.winners la lista.
  function finish(winner, reason) {
    over = true;
    const winners = Array.isArray(winner) ? winner : winner ? [winner] : [];
    for (let i = 0; i < pool.length; i++) pool[i].active = false;
    const results = resultFactors(winners);
    const elapsed = Math.max(0, cfg.matchSeconds - Math.max(0, timeLeft));
    result = {
      winner: winners[0] ?? null,
      winners,
      kind: mode.kind,
      teams: mode.teams,
      reason,
      elapsed, // segundos jugados (el ranking global premia ganar rápido)
      scores: tanks.map((_, i) => ({
        slot: i + 1,
        initials: initials[i] ?? null,
        lives: stats[i].lives,
        accuracy: accuracyOf(i),
        // Puntúa 0 quien no ha acertado ni un disparo (dos jugadores quietos no deben entrar en el ranking), quien abandona y todos si
        // abandonan todos (si no, el que se desconecta o su rival, con otra pestaña, se regalarían una puntuación sin jugar).
        // Puntuación única (score.js): máximo igual en todos los modos; contra bots, con los pesos del modo contra bots.
        score: reason === 'forfeit' || stats[i].forfeited || stats[i].hits === 0 ? 0 : calculateScore({
          result: results[i],
          hits: stats[i].hits,
          enemyLives: enemyLivesOf(i),
          rivals: rivalsOf(i),
          livesLeft: Math.max(0, stats[i].lives),
          livesStart: stats[i].livesStart,
          shots: stats[i].shots,
          bankHits: stats[i].bankHits,
          won: winners.includes(i + 1),
          elapsed,
          matchSeconds: cfg.matchSeconds,
          par: PAR_SECONDS[mode.kind] ?? PAR_SECONDS.duel,
        }, { vsBots: mode.bots > 0 }),
        bot: !isHuman(i + 1),
        tni: isTni[i], // tanque chetado: no entra en el Top 10 (sockets.js)
        team: mode.teams ? mode.teams[i] : null,
      })),
    };
    events.push({ type: 'match_over', winner: result.winner, winners, winnerNames: winners.map((slot) => initials[slot - 1]).filter(Boolean), reason }); // los nombres, para el "XXX WINS" del final
  }

  // Los slots de un equipo (o el propio tanque, sin equipos).
  const slotsOfTeam = (team) => tanks.filter((t) => teamOf(t.slot - 1) === team).map((t) => t.slot);
  const aliveTeams = () => new Set(tanks.filter((t) => t.alive).map((t) => teamOf(t.slot - 1)));
  // Ganadores cuando solo queda un equipo en pie; si cae todo a la vez, el equipo del último que disparó (si no es él mismo, empate).
  function lastTeamStanding(shooterSlot) {
    const teams = [...aliveTeams()];
    if (teams.length === 1) return slotsOfTeam(teams[0]);
    return shooterSlot && tanks[shooterSlot - 1] ? slotsOfTeam(teamOf(shooterSlot - 1)) : [];
  }

  // Tras un impacto de ronda: se borran los disparos y los tanques vivos vuelven a su salida, parados un momento.
  function startNextRound() {
    for (let i = 0; i < pool.length; i++) pool[i].active = false;
    for (let i = 0; i < count; i++) if (tanks[i].alive) { resetTank(tanks[i], spawns[i]); tanks[i].invuln = 0; }
    frozen = cfg.roundFreezeS;
    // Modo de un jugador: tras la pausa el jugador aún está protegido unos instantes (los bots no le disparan y sus
    // disparos lo atraviesan), para que la ronda no empiece con los 3 bots disparándole desde las esquinas.
    if (solo) tanks[0].invuln = cfg.roundFreezeS + cfg.soloStartInvulnS;
  }

  // Un tanque herido de un modo sin rondas (un bot en solitario, cualquiera en "brawl") que aún tiene vidas reaparece en la esquina más
  // lejos del resto de tanques, invulnerable un momento.
  function respawnTank(tank) {
    let best = 0;
    let bestDistance = -1;
    for (let s = 0; s < spawns.length; s++) {
      let nearest = Infinity;
      for (const other of tanks) if (other !== tank && other.alive) nearest = Math.min(nearest, Math.hypot(other.x - spawns[s].x, other.y - spawns[s].y));
      if (nearest > bestDistance) { bestDistance = nearest; best = s; }
    }
    resetTank(tank, spawns[best]);
    tank.invuln = cfg.soloRespawnInvulnS;
  }

  // piercing = la explosión del power-up: rompe el escudo Y quita la vida (es el counter del escudo). Una bala normal
  // solo rompe el escudo y no quita vida.
  // bank = el disparo había rebotado en un muro antes de dar (cuenta para el factor de rebotes).
  function applyHit(shooterSlot, victimSlot, x, y, piercing = false, bank = false) {
    if (over || hitThisStep) return;
    const tank = tanks[victimSlot - 1];
    if (!tank.alive || tank.invuln > 0) return;
    if (sameTeam(shooterSlot, victimSlot)) return; // sin fuego amigo: ni daña ni rompe el escudo de un compañero
    if (tank.effects.shield > 0) {
      tank.effects.shield = 0;
      tank.invuln = Math.max(tank.invuln, cfg.shieldBreakGraceS);
      events.push({ type: 'shield_break', slot: victimSlot, by: shooterSlot, x, y });
      if (!piercing) return;
    }
    const victim = stats[victimSlot - 1];
    victim.lives--;
    if (shooterSlot !== victimSlot) { stats[shooterSlot - 1].hits++; if (bank) stats[shooterSlot - 1].bankHits++; }
    const lives = victim.lives;
    const respawns = brawl || (solo && victimSlot > 1);
    if (respawns) { // un golpe en un modo sin rondas no detiene la partida: el herido reaparece (o queda eliminado)
      if (lives <= 0) {
        eliminate(tank);
        if (shooterSlot !== victimSlot) stats[shooterSlot - 1].kills++;
      } else respawnTank(tank);
      const last = lives <= 0 && (solo ? botsAlive() === 0 : aliveTeams().size <= 1);
      events.push({ type: 'hit', slot: victimSlot, by: shooterSlot, lives, x, y, round: false, final: last });
      if (last) finish(solo ? 1 : lastTeamStanding(shooterSlot), 'lives');
      return;
    }
    hitThisStep = true;
    const last = lives <= 0;
    if (last) eliminate(tank);
    events.push({ type: 'hit', slot: victimSlot, by: shooterSlot, lives, x, y, round: !last, final: last });
    if (last) finish(solo ? bestBotSlot(shooterSlot) : shooterSlot, 'lives');
    else startNextRound();
  }

  // Modo de un jugador: si matan al jugador gana el bot que lo hizo; si ya estaba eliminado (su disparo seguía volando), el
  // bot vivo con más vidas.
  function bestBotSlot(preferred) {
    if (tanks[preferred - 1].alive) return preferred;
    let best = 2;
    for (let i = 1; i < count; i++) if (tanks[i].alive && (!tanks[best - 1].alive || stats[i].lives > stats[best - 1].lives)) best = i + 1;
    return best;
  }

  // Fin por tiempo: gana el equipo (o el tanque, sin equipos) con más vidas sumadas y, si empatan, mayor precisión; si también, empate.
  function timeUp() {
    const groups = new Map(); // equipo -> { lives, hits, shots, slots }
    for (let i = 0; i < count; i++) {
      const g = groups.get(teamOf(i)) ?? { lives: 0, hits: 0, shots: 0, slots: [] };
      if (tanks[i].alive) g.lives += stats[i].lives;
      g.hits += stats[i].hits; g.shots += stats[i].shots; g.slots.push(i + 1);
      groups.set(teamOf(i), g);
    }
    let best = null;
    let tie = false;
    for (const g of groups.values()) {
      if (g.lives <= 0) continue; // un equipo sin tanques vivos no gana
      if (!best) { best = g; continue; }
      const better = g.lives - best.lives || calculateAccuracy(g.hits, g.shots) - calculateAccuracy(best.hits, best.shots);
      if (better > 0) { best = g; tie = false; } else if (better === 0) tie = true;
    }
    const winners = best === null || tie ? [] : best.slots;
    finish(winners.length ? winners : null, winners.length ? 'time' : 'draw');
  }

  // Lanza el proyectil (o dos con el doble disparo). Se llama solo cuando la cadencia ya lo permite.
  // Ayuda de puntería (solo para jugadores, sección 61): si hay un rival con línea directa dentro de un cono pequeño alrededor de hacia dónde apuntas,
  // el disparo se desvía una fracción hacia él (con un pequeño adelanto si se mueve). Es discreta: nunca apunta por ti, solo perdona el fallo por poco.
  const rayHit = { t: 0, x: 0, y: 0, nx: 0, ny: 0 };
  function assistedAngle(slot) {
    const tank = tanks[slot - 1];
    const cone = isTni[slot - 1] ? tniCfg.aimAssistConeRad : cfg.aimAssistConeRad ?? 0;
    const strength = isTni[slot - 1] ? tniCfg.aimAssistStrength : cfg.aimAssistStrength ?? 0;
    if (cone <= 0 || strength <= 0 || !isHuman(slot)) return tank.aim;
    let bestDiff = null;
    for (let i = 0; i < tanks.length; i++) {
      const other = tanks[i];
      if (other.slot === slot || !other.alive || other.invuln > 0 || sameTeam(slot, other.slot)) continue;
      const dist = Math.hypot(other.x - tank.x, other.y - tank.y);
      if (dist < 0.8 || dist > 24) continue;
      const lead = (dist / cfg.projectileSpeed) * 0.6; // adelanto parcial: si se mueve, apunta algo por delante
      const tx = other.x + other.vx * lead;
      const ty = other.y + other.vy * lead;
      const targetAngle = Math.atan2(ty - tank.y, tx - tank.x);
      let diff = targetAngle - tank.aim;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // por el camino corto
      if (Math.abs(diff) > cone) continue;
      if (raycastGrid(arena.solid, tank.x, tank.y, Math.cos(targetAngle), Math.sin(targetAngle), dist, rayHit)) continue; // un muro de por medio: no ayuda
      if (bestDiff === null || Math.abs(diff) < Math.abs(bestDiff)) bestDiff = diff;
    }
    return bestDiff === null ? tank.aim : tank.aim + bestDiff * strength;
  }

  function shoot(slot) {
    const tank = tanks[slot - 1];
    const baseAngle = assistedAngle(slot);
    const tni = isTni[slot - 1];
    let alive = 0;
    for (let i = 0; i < pool.length; i++) if (pool[i].active && pool[i].owner === slot) alive++;
    if (alive >= (tni ? tniCfg.maxProjectiles : cfg.maxProjectilesPerPlayer)) return false;

    const double = tank.effects.double > 0;
    const aoe = tank.effects.aoe > 0;
    const spread = double ? cfg.doubleShotSpreadRad / 2 : 0;
    for (const offset of double ? [-spread, spread] : [0]) {
      spawnProjectile(pool, {
        id: nextProjectileId++, owner: slot, x: tank.x, y: tank.y,
        angle: baseAngle + offset, speed: tni ? tniCfg.projectileSpeed : cfg.projectileSpeed, aoe,
        life: tni ? tniCfg.projectileLifeS : cfg.projectileLifeS, rocket: tni,
      });
    }
    stats[slot - 1].shots++;
    tank.cooldown = tni ? tniCfg.fireCooldownS : cfg.fireCooldownS;
    events.push({ type: 'shot', slot });
    return true;
  }

  const projectileCtx = {
    solid: arena.solid,
    tanks,
    cfg,
    sameTeam, // los disparos atraviesan a los compañeros de equipo
    get events() { return events; },
    // Un cohete de TNI que da en un tanque también revienta ahí (la explosión le quita la vida y alcanza a los que estén cerca).
    onTankHit: (p, tank, x, y) => (p.rocket ? projectileCtx.onExplode(p, x, y) : applyHit(p.owner, tank.slot, x, y, false, p.bounces > 0)),
    // Explosión del power-up (o de un cohete de TNI, más grande): daña a los tanques dentro del radio (menos al propio, si no hay fuego amigo).
    onExplode: (p, x, y) => {
      const radius = p.rocket ? tniCfg.blastRadius : cfg.aoeRadius;
      events.push(p.rocket ? { type: 'explosion', x, y, radius, tni: 1, slot: p.owner } : { type: 'explosion', x, y, radius });
      for (let i = 0; i < tanks.length; i++) {
        const tank = tanks[i];
        if (tank.slot === p.owner && !cfg.friendlyFire) continue;
        if (!tank.alive || tank.invuln > 0) continue;
        if (Math.hypot(tank.x - x, tank.y - y) <= radius) {
          applyHit(p.owner, tank.slot, x, y, true, p.bounces > 0);
          if (!solo && !brawl) return; // en 1 contra 1 solo cuenta un impacto por explosión
        }
      }
    },
  };

  return {
    tanks,
    stats,
    powerups,
    solo,
    kind: mode.kind,
    brawl,
    teams: mode.teams,
    humans: mode.humans,
    isHuman,
    sameTeam,
    projectiles: pool, // solo lectura: los bots miran los disparos que vienen hacia ellos
    get over() { return over; },
    get result() { return result; },
    get timeLeft() { return timeLeft; },
    get frozen() { return frozen > 0; },

    // Intención de movimiento del pad izquierdo (x, y entre -1 y 1; el eje Y crece hacia arriba).
    setMove(slot, x, y) {
      const tank = tanks[slot - 1];
      if (!tank.alive) return;
      const len = Math.hypot(x, y);
      if (len < cfg.padDeadzone) { tank.moveX = 0; tank.moveY = 0; return; }
      const k = len > 1 ? 1 / len : 1;
      tank.moveX = x * k;
      tank.moveY = y * k;
    },
    // Ángulo del pad derecho en radianes (0 = derecha, π/2 = arriba).
    setAim(slot, angle) {
      tanks[slot - 1].aim = angle;
    },
    // Pide un disparo. Sale al instante si la cadencia lo permite. Si faltan menos de fireBufferS segundos para
    // poder disparar, se guarda y sale solo en cuanto se pueda (así un disparo "justo antes" no se pierde).
    // Devuelve true si el disparo salió en este momento.
    fire(slot) {
      const tank = tanks[slot - 1];
      if (over || frozen > 0 || !tank.alive) return false;
      if (tank.cooldown > 0) {
        if (tank.cooldown <= cfg.fireBufferS) tank.pendingFire = true;
        return false;
      }
      return shoot(slot);
    },
    // Dash: ráfaga corta y rápida en la dirección del movimiento (o hacia donde apunta si está quieto).
    dash(slot) {
      if (over || frozen > 0 || !tanks[slot - 1].alive) return false;
      if (!startDash(tanks[slot - 1], cfg)) return false;
      events.push({ type: 'dash', slot, cooldown: cfg.dashCooldownS });
      return true;
    },
    // Solo para pruebas: agota el tiempo; el siguiente step() cierra la partida con la regla normal de fin por tiempo.
    expireTime() { timeLeft = 0; },

    // El jugador abandona. En 1 contra 1 gana el rival y en solitario el primer bot. En "brawl" solo él queda eliminado (sin puntos) y la
    // partida sigue; si ya no queda ningún humano o solo queda un equipo, termina.
    forfeit(slot) {
      if (over) return;
      if (!brawl) { finish(slot === 1 ? 2 : 1, 'forfeit'); return; }
      const tank = tanks[slot - 1];
      stats[slot - 1].forfeited = true;
      stats[slot - 1].lives = 0;
      eliminate(tank);
      tank.moveX = 0; tank.moveY = 0;
      events.push({ type: 'hit', slot, by: slot, lives: 0, x: tank.x, y: tank.y, round: false, final: false });
      if (!tanks.some((t) => t.alive && isHuman(t.slot))) finish(lastTeamStanding(0), 'forfeit');
      else if (aliveTeams().size <= 1) finish(lastTeamStanding(0), 'lives');
    },

    step(dt) {
      if (over) return;
      hitThisStep = false;
      if (introLeft > 0) introLeft -= dt; else timeLeft -= dt;
      for (let i = 0; i < count; i++) tickTank(tanks[i], dt);
      powerups.update(dt, events);

      if (frozen > 0) {
        frozen = Math.max(0, frozen - dt);
      } else {
        // Disparos guardados que ya pueden salir (la cadencia ha terminado).
        for (let i = 0; i < count; i++) {
          if (tanks[i].pendingFire && tanks[i].cooldown <= 0) {
            tanks[i].pendingFire = false;
            if (tanks[i].alive) shoot(i + 1);
          }
        }
        for (let i = 0; i < count; i++) if (tanks[i].alive) moveTank(tanks[i], dt, arena.solid, mode.kind === 'duel' ? tanks[1 - i] : tanks, cfg);
        for (let i = 0; i < count; i++) if (tanks[i].alive) powerups.collect(tanks[i], events);
        for (let i = 0; i < pool.length; i++) {
          if (pool[i].active) advanceProjectile(pool[i], dt, projectileCtx);
        }
      }
      if (!over && timeLeft <= 0) timeUp();
    },

    // Eventos ocurridos desde la última llamada (impactos, rebotes, power-ups...). Los vacía.
    drainEvents() {
      if (events.length === 0) return EMPTY_EVENTS;
      const drained = events;
      events = [];
      return drained;
    },

    // Estado compacto para enviar al host (formato en AGENTS.md, sección 15).
    snapshot() {
      const projectiles = [];
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.active) projectiles.push([p.id, round2(p.x), round2(p.y), p.aoe ? 1 : 0, p.owner]); // owner: 1-4 (color del disparo)
      }
      return {
        t: Math.round((cfg.matchSeconds - timeLeft) * 1000),
        timeLeft: round1(Math.max(0, timeLeft)),
        frozen: frozen > 0 ? 1 : 0,
        // [x, y, apuntado, vidas, dash (0|1), invulnerable (0|1)]; un bot eliminado tiene 0 vidas.
        tanks: tanks.map((tank, i) => [round2(tank.x), round2(tank.y), round2(tank.aim), stats[i].lives, tank.dashLeft > 0 ? 1 : 0, tank.invuln > 0 ? 1 : 0]),
        projectiles,
        powerups: powerups.items.map((item) => [item.id, POWERUP_TYPES.indexOf(item.type), item.x, item.y]),
        effects: tanks.map((tank) => POWERUP_TYPES
          .map((type, index) => [index, round1(tank.effects[type])])
          .filter((effect) => effect[1] > 0)),
      };
    },
  };
}
