// Simulador de equilibrio (28-oct): juega muchísimas partidas SIN gráficos ni red, con bots iguales en todas las posiciones, y
// mide si alguna esquina (o lado, en el 1 contra 1) da ventaja: quién gana, quién cae primero y cuántos impactos da y recibe.
// Como el modo de un jugador trata distinto al jugador (reinicia la ronda al caer) y a los bots, la partida se repite con las 4
// formas de repartir las esquinas entre los 4 tanques: así el efecto de la ESQUINA se separa del efecto de ser el jugador.
// Código puro (lo usan scripts/balance-sim.js y tests/balance.test.js). Qué NO hace: no toca el juego ni escribe nada.
import { createMatch } from '../server/game/match.js';
import { createSoloBot, BOT_SKILLS } from '../server/game/soloBot.js';
import { createArena } from '../shared/arena.js';
import { config } from '../server/config.js';

const DT = 1 / 60;
export const CORNER_NAMES = ['BL', 'TR', 'TL', 'BR']; // abajo-izquierda, arriba-derecha, arriba-izquierda, abajo-derecha
const cornerOf = (arena, p) => `${p.y < arena.height / 2 ? 'B' : 'T'}${p.x < arena.width / 2 ? 'L' : 'R'}`;

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Huecos libres alrededor de un punto: celdas alcanzables a pie (4 vecinos) a 6 pasos o menos. Más celdas = esquina más abierta.
export function openness(arena, p, steps = 6) {
  const seen = new Map([[`${Math.floor(p.x)},${Math.floor(p.y)}`, 0]]);
  const queue = [[Math.floor(p.x), Math.floor(p.y)]];
  while (queue.length) {
    const [x, y] = queue.shift();
    const d = seen.get(`${x},${y}`);
    if (d >= steps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (!arena.solid(x + dx, y + dy) && !seen.has(key)) { seen.set(key, d + 1); queue.push([x + dx, y + dy]); }
    }
  }
  return seen.size;
}

// Copia del mapa con las esquinas repartidas de otra forma ("perm": perm[i] = esquina del tanque i) y/o desplazadas hacia dentro.
// shift = { BL: [dx, dy], TR: [...], TL: [...], BR: [...] }: mueve cada salida (celdas) para probar otras ubicaciones.
function arenaWith(base, mode, perm, inset, shift = {}) {
  const corners = mode === 'ffa' ? base.cornerSpawns : base.spawns;
  const moved = corners.map((c) => { const [sx, sy] = shift[cornerOf(base, c)] ?? [0, 0]; return { x: c.x + Math.sign(base.width / 2 - c.x) * inset + sx, y: c.y + Math.sign(base.height / 2 - c.y) * inset + sy }; });
  const spawns = perm.map((k) => moved[k]);
  return { ...base, cornerSpawns: spawns, spawns: spawns.slice(0, 2) };
}

// Una partida. mode 'ffa' (1 contra 3, todos bots iguales) o 'duel' (1 contra 1). Devuelve datos por tanque.
export function playOne({ arena, mode, seed, startInvulnS = 0, warmupS = 3, skill = BOT_SKILLS[1], seconds = 120, lives = 3 }) {
  const solo = mode === 'ffa';
  const count = solo ? 4 : 2;
  const cfg = { ...config.game, introS: 0, matchSeconds: seconds, lives, soloPlayerLives: lives, soloStartInvulnS: 0, soloBotWarmupS: warmupS, soloRespawnInvulnS: config.game.soloRespawnInvulnS };
  const rng = seeded(seed);
  const match = createMatch({ arena, cfg, rng, initials: ['AAA', 'BBB', 'CCC', 'DDD'].slice(0, count), solo });
  const bots = Array.from({ length: count }, (_, i) => createSoloBot(i + 1, { arena, cfg, rng: seeded(seed * 131 + i), skill }));
  for (const tank of match.tanks) tank.invuln = startInvulnS; // protección igual para todos al empezar (solo si se pide)
  const lost = Array(count).fill(0);
  let firstOut = -1;
  let firstHit = -1;
  let end = 0;
  for (let f = 0; f < (seconds + 5) / DT && !match.over; f++) {
    for (const bot of bots) bot.think(match, DT);
    match.step(DT);
    for (const e of match.drainEvents()) {
      if (e.type !== 'hit') continue;
      lost[e.slot - 1]++;
      if (firstHit < 0) firstHit = e.slot - 1;
      if (e.lives <= 0 && firstOut < 0) firstOut = e.slot - 1;
    }
    end = f * DT;
  }
  return { winner: match.over ? (match.result.winner ?? null) : null, firstHit, firstOut, lost, dealt: match.stats.map((s) => s.hits), seconds: end };
}

// Juega "matches" partidas por cada reparto de esquinas (ffa: 4 repartos cíclicos; duel: 2, uno por lado) y agrupa por esquina.
export function playMany({ mapIndex, mode, matches, seed0 = 1, ...options }) {
  const base = createArena(mapIndex);
  const count = mode === 'ffa' ? 4 : 2;
  const names = mode === 'ffa' ? CORNER_NAMES : ['P1-side', 'P2-side'];
  const perms = Array.from({ length: count }, (_, r) => Array.from({ length: count }, (_, i) => (i + r) % count));
  const corners = names.map((name) => ({ name, games: 0, wins: 0, firstOut: 0, firstHit: 0, dealt: 0, lost: 0, draws: 0, seconds: 0, area: 0 }));
  const roles = Array.from({ length: count }, () => ({ games: 0, wins: 0, dealt: 0, lost: 0 })); // por tanque (slot), sin importar la esquina
  let seed = seed0;
  for (const perm of perms) {
    const arena = arenaWith(base, mode, perm, options.inset ?? 0, options.shift);
    const spawnOf = mode === 'ffa' ? arena.cornerSpawns : arena.spawns;
    for (let m = 0; m < matches; m++) {
      const r = playOne({ arena, mode, seed: seed++, ...options });
      for (let slot = 0; slot < count; slot++) {
        const corner = mode === 'ffa' ? corners[CORNER_NAMES.indexOf(cornerOf(base, spawnOf[slot]))] : corners[perm[slot]];
        corner.games++;
        corner.dealt += r.dealt[slot]; corner.lost += r.lost[slot];
        if (r.winner === slot + 1) corner.wins++;
        if (r.winner === null) corner.draws++;
        if (r.firstOut === slot) corner.firstOut++;
        if (r.firstHit === slot) corner.firstHit++;
        corner.seconds += r.seconds;
        roles[slot].games++; roles[slot].dealt += r.dealt[slot]; roles[slot].lost += r.lost[slot]; if (r.winner === slot + 1) roles[slot].wins++;
      }
    }
  }
  corners.forEach((c, i) => { c.area = openness(base, mode === 'ffa' ? base.cornerSpawns[CORNER_NAMES.indexOf(c.name) < 0 ? 0 : CORNER_NAMES.indexOf(c.name)] : base.spawns[i]); });
  return { corners, roles };
}

// Resume por esquina: porcentajes y relación de impactos (dados / recibidos).
export function summarize(corner) {
  const g = Math.max(1, corner.games);
  return { name: corner.name, area: corner.area, win: corner.wins / g, firstOut: corner.firstOut / g, firstHit: corner.firstHit / g, ratio: corner.dealt / Math.max(1, corner.lost), dealt: corner.dealt / g, lost: corner.lost / g };
}
