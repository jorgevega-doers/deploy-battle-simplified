// Interpolación de los estados que envía el servidor (30 por segundo) para dibujar a la velocidad de la pantalla.
// Se dibuja con un pequeño retraso (delayMs): así casi siempre hay un estado "anterior" y uno "siguiente" entre los
// que mezclar, y las pequeñas variaciones de la red no se notan como tirones. Código puro (se prueba en Node).
const MAX_PROJECTILES = 32;
const TELEPORT_CELLS = 2; // un salto mayor es un reinicio de ronda: se coloca directamente, sin deslizarse

const lerp = (a, b, t) => a + (b - a) * t;
// Interpola ángulos por el camino corto (de 3,1 a -3,1 pasa por π, no da la vuelta entera).
function lerpAngle(a, b, t) {
  const delta = ((((b - a) + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + delta * t;
}

export function createSnapshotBuffer({ delayMs = 70, capacity = 8 } = {}) {
  const items = []; // { at: instante de llegada (ms), s: estado }
  // Resultado reutilizable: no se crean objetos nuevos en cada fotograma.
  const out = {
    t: 0,
    timeLeft: 0,
    frozen: 0,
    // Hasta 4 tanques (el modo de un jugador usa los 4); tankCount dice cuántos trae el estado actual.
    tanks: Array.from({ length: 4 }, () => ({ x: 0, y: 0, aim: 0, lives: 0, dashing: 0, invuln: 0 })),
    tankCount: 2,
    projectiles: Array.from({ length: MAX_PROJECTILES }, () => ({ id: 0, x: 0, y: 0, aoe: 0, owner: 1 })),
    projectileCount: 0,
    powerups: [],
    effects: [],
  };

  function fill(a, b, t) {
    out.t = lerp(a.t, b.t, t);
    out.timeLeft = b.timeLeft;
    out.frozen = b.frozen;
    out.powerups = b.powerups;
    out.effects = b.effects;

    out.tankCount = Math.min(4, b.tanks.length);
    for (let i = 0; i < out.tankCount; i++) {
      const tb = b.tanks[i];
      const ta = a.tanks[i] ?? tb; // el estado anterior puede ser de una partida con menos tanques
      const target = out.tanks[i];
      const teleported = Math.abs(tb[0] - ta[0]) > TELEPORT_CELLS || Math.abs(tb[1] - ta[1]) > TELEPORT_CELLS;
      const k = teleported ? 1 : t;
      target.x = lerp(ta[0], tb[0], k);
      target.y = lerp(ta[1], tb[1], k);
      target.aim = lerpAngle(ta[2], tb[2], t);
      target.lives = tb[3];
      target.dashing = tb[4];
      target.invuln = tb[5] ?? 0;
    }

    // Cada proyectil se empareja por su id con el del estado anterior; si es nuevo aparece donde está.
    let count = 0;
    for (let i = 0; i < b.projectiles.length && count < MAX_PROJECTILES; i++) {
      const pb = b.projectiles[i];
      let pa = null;
      for (let j = 0; j < a.projectiles.length; j++) {
        if (a.projectiles[j][0] === pb[0]) { pa = a.projectiles[j]; break; }
      }
      const target = out.projectiles[count++];
      target.id = pb[0];
      target.x = pa ? lerp(pa[1], pb[1], t) : pb[1];
      target.y = pa ? lerp(pa[2], pb[2], t) : pb[2];
      target.aoe = pb[3];
      target.owner = pb[4] ?? 1;
    }
    out.projectileCount = count;
  }

  return {
    get size() { return items.length; },
    push(snapshot, at) {
      items.push({ at, s: snapshot });
      if (items.length > capacity) items.shift();
    },
    clear() { items.length = 0; },
    // Estado para dibujar en el instante "now" (ms), o null si aún no ha llegado ninguno.
    sample(now) {
      if (items.length === 0) return null;
      const target = now - delayMs;
      let index = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].at <= target) { index = i; break; }
      }
      if (index === -1) { // todavía no hay nada tan antiguo: se muestra el primero
        fill(items[0].s, items[0].s, 0);
      } else if (index === items.length - 1) { // el último disponible (no se extrapola): se mantiene
        fill(items[index].s, items[index].s, 0);
      } else {
        const from = items[index];
        const to = items[index + 1];
        const t = Math.min(1, Math.max(0, (target - from.at) / (to.at - from.at)));
        fill(from.s, to.s, t);
      }
      return out;
    },
  };
}
