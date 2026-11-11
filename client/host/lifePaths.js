// Recorridos de la gente, los animales y los coches: rectángulos cerrados ("bucles") alrededor de cada edificio (la acera)
// y por el anillo de la calle (los carriles). Una posición en un bucle es un solo número "s" (la distancia recorrida), así que
// moverse es sumar y huir es cambiar de sentido: no hace falta buscar caminos. Lógica pura (sin Three.js ni DOM): se prueba
// con el mapa real. Qué NO hace: no dibuja nada ni sabe de la partida (las amenazas se le pasan como estado interpolado).

export function rectLoop(x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  return { x0, y0, x1, y1, w, h, length: 2 * (w + h) };
}

// Punto del bucle a distancia s (en sentido antihorario: por abajo hacia la derecha, sube por la derecha, vuelve por arriba
// y baja por la izquierda). dir = 1 antihorario, -1 horario (solo afecta al rumbo). Escribe en out { x, y, heading }.
export function loopPoint(loop, s, dir, out) {
  const { x0, y0, x1, y1, w, h, length } = loop;
  let t = ((s % length) + length) % length;
  let heading;
  if (t < w) { out.x = x0 + t; out.y = y0; heading = 0; }
  else if ((t -= w) < h) { out.x = x1; out.y = y0 + t; heading = Math.PI / 2; }
  else if ((t -= h) < w) { out.x = x1 - t; out.y = y1; heading = Math.PI; }
  else { t -= w; out.x = x0; out.y = y1 - t; heading = -Math.PI / 2; }
  out.heading = dir < 0 ? heading + Math.PI : heading;
  return out;
}

// ¿Está todo el bucle libre de muros, con "margin" celdas de aire alrededor de cada punto?
export function loopClear(loop, arena, margin = 0.05, step = 0.2) {
  const p = { x: 0, y: 0, heading: 0 };
  for (let s = 0; s < loop.length; s += step) {
    loopPoint(loop, s, 1, p);
    for (const [dx, dy] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
      if (arena.solid(Math.floor(p.x + dx), Math.floor(p.y + dy))) return false;
    }
  }
  return true;
}

// Aceras: un bucle pegado a cada obstáculo y otro junto a los edificios del borde (por dentro de la arena). La acera del suelo
// mide 0,25 celdas (shared/art/paint/street.js): "inset" 0,14 es su centro.
export function sidewalkLoops(arena, inset = 0.14) {
  const loops = arena.obstacles.map((o) => rectLoop(o.x - inset, o.y - inset, o.x + o.w + inset, o.y + o.h + inset));
  loops.push(rectLoop(1 + inset, 1 + inset, arena.width - 1 - inset, arena.height - 1 - inset));
  return loops.filter((loop) => loopClear(loop, arena));
}

// Carriles de la calle: el anillo de calles tiene su línea central discontinua en x = 2 y 30, y = 2 y 16 (street.js).
// Un carril por fuera de la línea (antihorario) y otro por dentro (horario), a 0,45 de ella.
export function laneLoops(arena, offset = 0.45) {
  const x0 = 2; const x1 = arena.width - 2; const y0 = 2; const y1 = arena.height - 2;
  const lanes = [
    { loop: rectLoop(x0 - offset, y0 - offset, x1 + offset, y1 + offset), dir: 1 },
    { loop: rectLoop(x0 + offset, y0 + offset, x1 - offset, y1 - offset), dir: -1 },
  ];
  return lanes.filter((lane) => loopClear(lane.loop, arena, 0.3));
}

// La amenaza más cercana a (x, y) entre los dos tanques (radio rTank) y los proyectiles (radio rShot) del estado interpolado.
// Escribe en out { x, y, d } (d = distancia) y devuelve true; false si no hay ninguna dentro de su radio.
export function nearestThreat(x, y, state, rTank, rShot, out) {
  if (!state) return false;
  let best = Infinity;
  // Sin funciones auxiliares dentro: esto se llama para cada persona en cada fotograma y no debe generar basura.
  const tankCount = state.tankCount ?? 2; // 4 en el modo de un jugador
  for (let i = 0; i < tankCount; i++) {
    const t = state.tanks[i];
    if (t.lives === 0) continue; // bot eliminado
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < rTank && d < best) { best = d; out.x = t.x; out.y = t.y; out.d = d; }
  }
  for (let i = 0; i < state.projectileCount; i++) {
    const p = state.projectiles[i];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < rShot && d < best) { best = d; out.x = p.x; out.y = p.y; out.d = d; }
  }
  return best !== Infinity;
}

// Sentido (1 o -1) en el que hay que moverse por el bucle para alejarse de la amenaza (tx, ty): el que deja más lejos.
const probe = { x: 0, y: 0, heading: 0 };
export function fleeDirection(loop, s, tx, ty, step = 0.6) {
  loopPoint(loop, s + step, 1, probe);
  const forward = Math.hypot(probe.x - tx, probe.y - ty);
  loopPoint(loop, s - step, 1, probe);
  const backward = Math.hypot(probe.x - tx, probe.y - ty);
  return forward >= backward ? 1 : -1;
}

