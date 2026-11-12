// Geometría 2D sin motor físico. Código puro: lo usan el servidor (simulación)
// y el host (línea de apuntado), de modo que la línea punteada coincide exactamente con el disparo real.
//
// Convenciones: el eje Y crece hacia arriba; las celdas miden 1 x 1; el ángulo 0 apunta a +X.
// "solid(cx, cy)" es una función que dice si la celda (cx, cy) es un muro.
// Las funciones del bucle de juego escriben el resultado en un objeto "out" que se reutiliza,
// para no crear objetos nuevos en cada tick.

const EDGE = 1e-6;  // tolerancia: una caja apoyada exactamente en un muro no cuenta como solapada
const NUDGE = 1e-6; // tras un rebote se separa el punto un pelo del muro para no volver a "chocar" con él

// Rebote: r = d - 2(d·n)n, donde n es la normal del muro (unitaria).
export function reflect(dx, dy, nx, ny, out = { x: 0, y: 0 }) {
  const dot = dx * nx + dy * ny;
  out.x = dx - 2 * dot * nx;
  out.y = dy - 2 * dot * ny;
  return out;
}

// Lanza un rayo (dx, dy deben formar un vector unitario) desde (x, y) por la cuadrícula y busca el primer muro
// a menos de maxDist. Recorre solo las celdas que atraviesa el rayo (algoritmo DDA de Amanatides y Woo).
// Si hay muro rellena out = { t, x, y, nx, ny } (distancia, punto de impacto y normal) y devuelve true.
export function raycastGrid(solid, x, y, dx, dy, maxDist, out) {
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;

  if (solid(cx, cy)) { // el punto ya está dentro de un muro: choque inmediato
    out.t = 0; out.x = x; out.y = y;
    if (Math.abs(dx) >= Math.abs(dy)) { out.nx = -stepX; out.ny = 0; } else { out.nx = 0; out.ny = -stepY; }
    return true;
  }

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx > 0 ? (cx + 1 - x) / dx : dx < 0 ? (x - cx) / -dx : Infinity;
  let tMaxY = dy > 0 ? (cy + 1 - y) / dy : dy < 0 ? (y - cy) / -dy : Infinity;

  for (;;) {
    let crossedX;
    let t;
    if (tMaxX < tMaxY) { t = tMaxX; cx += stepX; tMaxX += tDeltaX; crossedX = true; }
    else { t = tMaxY; cy += stepY; tMaxY += tDeltaY; crossedX = false; }
    if (t > maxDist) return false;
    if (solid(cx, cy)) {
      out.t = t;
      out.x = x + dx * t;
      out.y = y + dy * t;
      out.nx = crossedX ? -stepX : 0;
      out.ny = crossedX ? 0 : -stepY;
      return true;
    }
  }
}

// Siguiente punto de partida tras un rebote: el punto de impacto empujado un pelo hacia fuera del muro.
export function bounceStart(hit, out) {
  out.x = hit.x + hit.nx * NUDGE;
  out.y = hit.y + hit.ny * NUDGE;
  return out;
}

// Trayectoria de un disparo con rebotes, para la línea de apuntado del host. Rellena "out" con
// [x0, y0, x1, y1, ...] (los puntos del recorrido) y lo devuelve. Usa la misma lógica que la simulación.
const traceHit = { t: 0, x: 0, y: 0, nx: 0, ny: 0 }; // objetos de trabajo reutilizados: la función se llama en cada fotograma
const traceStart = { x: 0, y: 0 };
const traceDir = { x: 0, y: 0 };

export function tracePath(solid, x, y, angle, maxBounces, maxLength, out = []) {
  out.length = 0;
  out.push(x, y);
  const hit = traceHit;
  const start = traceStart;
  const dir = traceDir;
  dir.x = Math.cos(angle);
  dir.y = Math.sin(angle);
  let remaining = maxLength;
  for (let bounce = 0; bounce <= maxBounces && remaining > 0; bounce++) {
    if (!raycastGrid(solid, x, y, dir.x, dir.y, remaining, hit)) {
      out.push(x + dir.x * remaining, y + dir.y * remaining);
      break;
    }
    out.push(hit.x, hit.y);
    remaining -= hit.t;
    if (bounce === maxBounces) break;
    bounceStart(hit, start);
    x = start.x;
    y = start.y;
    reflect(dir.x, dir.y, hit.nx, hit.ny, dir);
  }
  return out;
}

// Mueve una caja de lado 2*half (centro en pos.x, pos.y) en el eje X, parándose contra los muros.
// Se comprueba todo el recorrido (no solo el punto de llegada), así un paso grande no "salta" un muro.
export function moveBoxX(solid, pos, dx, half) {
  if (dx === 0) return;
  const nx = pos.x + dx;
  const minCy = Math.floor(pos.y - half + EDGE);
  const maxCy = Math.floor(pos.y + half - EDGE);
  const minCx = Math.floor(Math.min(pos.x, nx) - half + EDGE);
  const maxCx = Math.floor(Math.max(pos.x, nx) + half - EDGE);
  let blocked = false;
  let wallCx = dx > 0 ? Infinity : -Infinity;
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      if (!solid(cx, cy)) continue;
      blocked = true;
      wallCx = dx > 0 ? Math.min(wallCx, cx) : Math.max(wallCx, cx);
    }
  }
  pos.x = !blocked ? nx : dx > 0 ? wallCx - half : wallCx + 1 + half;
}

// Igual que moveBoxX pero en el eje Y.
export function moveBoxY(solid, pos, dy, half) {
  if (dy === 0) return;
  const ny = pos.y + dy;
  const minCx = Math.floor(pos.x - half + EDGE);
  const maxCx = Math.floor(pos.x + half - EDGE);
  const minCy = Math.floor(Math.min(pos.y, ny) - half + EDGE);
  const maxCy = Math.floor(Math.max(pos.y, ny) + half - EDGE);
  let blocked = false;
  let wallCy = dy > 0 ? Infinity : -Infinity;
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      if (!solid(cx, cy)) continue;
      blocked = true;
      wallCy = dy > 0 ? Math.min(wallCy, cy) : Math.max(wallCy, cy);
    }
  }
  pos.y = !blocked ? ny : dy > 0 ? wallCy - half : wallCy + 1 + half;
}

// ¿Se solapan dos cajas cuadradas (centro y mitad del lado)?
export function boxesOverlap(ax, ay, ahalf, bx, by, bhalf) {
  return Math.abs(ax - bx) < ahalf + bhalf && Math.abs(ay - by) < ahalf + bhalf;
}

// Primer punto en que el segmento (x0,y0)->(x1,y1) toca una caja cuadrada. Devuelve t entre 0 y 1
// (0 = inicio del segmento) o -1 si no la toca. Método de las "losas" (slab).
export function segmentBoxHit(x0, y0, x1, y1, cx, cy, half) {
  let tMin = 0;
  let tMax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;

  if (Math.abs(dx) < 1e-12) {
    if (x0 < cx - half || x0 > cx + half) return -1;
  } else {
    let t1 = (cx - half - x0) / dx;
    let t2 = (cx + half - x0) / dx;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  if (Math.abs(dy) < 1e-12) {
    if (y0 < cy - half || y0 > cy + half) return -1;
  } else {
    let t1 = (cy - half - y0) / dy;
    let t2 = (cy + half - y0) / dy;
    if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }
  return tMin;
}
