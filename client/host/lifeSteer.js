// Movimiento libre de la gente y los animales por la calle: elegir hacia dónde ir esquivando muros, sacar a un círculo de
// dentro de un muro y separar a los que se solapan. Lógica pura (sin Three.js ni DOM) que se prueba con el mapa real.
// Qué NO hace: no dibuja ni sabe qué es un tanque o un proyectil (las amenazas son simples puntos que le pasan).
const TWO_PI = Math.PI * 2;
const ANGLES = 16;
const STEP_A = 0.55; // dos puntos de prueba por delante de cada rumbo (para ver si hay muro)
const STEP_B = 1.0;

export const wrapPi = (a) => { let r = a % TWO_PI; if (r > Math.PI) r -= TWO_PI; if (r < -Math.PI) r += TWO_PI; return r; };

// ¿Está libre de muros un círculo de radio r centrado en (x, y)? Se mira la distancia al muro más cercano de las celdas vecinas.
export function circleFree(arena, x, y, r) {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!arena.solid(cx, cy)) continue;
      const qx = Math.max(cx, Math.min(x, cx + 1));
      const qy = Math.max(cy, Math.min(y, cy + 1));
      if (Math.hypot(x - qx, y - qy) < r) return false;
    }
  }
  return true;
}

// Saca a "p" ({ x, y }) de los muros: lo empuja hacia fuera hasta que su círculo (radio r) no los toca. Modifica p.
export function pushOutOfWalls(arena, p, r) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let cy = Math.floor(p.y - r); cy <= Math.floor(p.y + r); cy++) {
      for (let cx = Math.floor(p.x - r); cx <= Math.floor(p.x + r); cx++) {
        if (!arena.solid(cx, cy)) continue;
        const qx = Math.max(cx, Math.min(p.x, cx + 1));
        const qy = Math.max(cy, Math.min(p.y, cy + 1));
        const dx = p.x - qx;
        const dy = p.y - qy;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        moved = true;
        if (d > 1e-6) { p.x += (dx / d) * (r - d); p.y += (dy / d) * (r - d); } else { // el centro está dentro del muro (un bloque entero): busca hacia fuera el punto libre más cercano
          for (let radius = 0.1; radius <= 4; radius += 0.1) {
            const k = Math.floor(Math.random() * ANGLES);
            let found = false;
            for (let i = 0; i < ANGLES && !found; i++) {
              const a = ((i + k) / ANGLES) * TWO_PI;
              const fx = p.x + Math.cos(a) * radius;
              const fy = p.y + Math.sin(a) * radius;
              if (circleFree(arena, fx, fy, r)) { p.x = fx; p.y = fy; found = true; }
            }
            if (found) return;
          }
        }
      }
    }
    if (!moved) break;
  }
}

// Un punto al azar del suelo libre (con margen r de los muros), o null si no encuentra en 40 intentos.
export function randomFreeSpot(arena, rng, r, away = null, minAway = 0) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 1 + rng() * (arena.width - 2);
    const y = 1 + rng() * (arena.height - 2);
    if (!circleFree(arena, x, y, r)) continue;
    if (away && away.some((a) => Math.hypot(a.x - x, a.y - y) < minAway)) continue;
    return { x, y };
  }
  return null;
}

// Elige el rumbo (radianes) para un agente en (x, y): hacia el objetivo (mode 'goto') o alejándose de la amenaza (mode 'flee'),
// descartando los rumbos que chocan con un muro y prefiriendo seguir como va (inercia) para no temblar.
// Devuelve el mejor rumbo, o null si está encajonado (todos bloqueados).
export function chooseHeading(arena, x, y, r, current, mode, goalX, goalY) {
  let best = null;
  let bestScore = -Infinity;
  for (let k = 0; k < ANGLES; k++) {
    const a = (k / ANGLES) * TWO_PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (!circleFree(arena, x + ca * STEP_A, y + sa * STEP_A, r) || !circleFree(arena, x + ca * STEP_B, y + sa * STEP_B, r)) continue;
    const dist = Math.hypot(goalX - (x + ca * STEP_B), goalY - (y + sa * STEP_B));
    let score = mode === 'flee' ? dist : -dist;
    if (Math.abs(wrapPi(a - current)) < 0.5) score += 0.35; // inercia
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

// Separa por pares a los agentes ({ x, y, r, active }) que se solapan: cada uno cede la mitad. Dos pasadas.
export function separateAgents(agents, count, gap = 0.04) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      const a = agents[i];
      if (!a.active) continue;
      for (let j = i + 1; j < count; j++) {
        const b = agents[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + gap;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = (min - d) / 2;
        const nx = d > 1e-6 ? dx / d : 1;
        const ny = d > 1e-6 ? dy / d : 0;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

// Empuja a "a" fuera de un círculo fijo (un coche) de centro (cx, cy) y radio cr.
export function pushOutOfCircle(a, cx, cy, cr) {
  const dx = a.x - cx;
  const dy = a.y - cy;
  const min = a.r + cr;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 1e-6;
  a.x = cx + (dx / d) * min;
  a.y = cy + (dy / d) * min;
}
