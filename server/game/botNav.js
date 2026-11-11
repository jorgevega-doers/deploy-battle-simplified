// Navegación de los bots por la cuadrícula: búsqueda en anchura (BFS) con 8 vecinos que no corta esquinas, para rodear los
// muros hasta un objetivo. Se calcula pocas veces por segundo (el mapa tiene 32 x 18 = 576 celdas, cuesta microsegundos).
// Qué NO hace: no mueve nada ni conoce a los otros tanques (los esquiva el bot con su propia separación).
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// rng (opcional): cada navegador desempata con su propio orden de vecinos (fijo mientras vive). Con un orden único, ante dos caminos
// igual de cortos todos los bots elegían siempre el mismo lado y eso no es simétrico al girar el mapa 180° (el simulador de
// equilibrio lo midió: ventaja de un lado hasta 78 % en un mapa simétrico).
export function createNav(arena, rng = null) {
  const dirs = DIRS.map((d) => d.slice());
  if (rng) {
    for (const [from, to] of [[0, 4], [4, 8]]) { // se mezclan por separado los 4 cardinales y los 4 diagonales
      for (let i = to - 1; i > from; i--) { const j = from + Math.floor(rng() * (i - from + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
    }
  }
  const W = arena.width;
  const H = arena.height;
  const prev = new Int32Array(W * H);
  const queue = new Int32Array(W * H);
  const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;

  return {
    // Camino de (fx, fy) a (tx, ty) en coordenadas del mundo. Escribe en "out" el centro de la celda que está "ahead"
    // pasos por delante (1 = la siguiente) y devuelve cuántos pasos tiene el camino entero, o -1 si no hay camino.
    step(fx, fy, tx, ty, ahead, out) {
      const sx = Math.floor(fx);
      const sy = Math.floor(fy);
      const gx = Math.floor(tx);
      const gy = Math.floor(ty);
      if (!inside(sx, sy) || !inside(gx, gy) || arena.solid(gx, gy)) return -1;
      if (sx === gx && sy === gy) { out.x = tx; out.y = ty; return 0; }
      prev.fill(-1);
      const start = sy * W + sx;
      const goal = gy * W + gx;
      prev[start] = start;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      while (head < tail && prev[goal] === -1) {
        const current = queue[head++];
        const cx = current % W;
        const cy = (current - cx) / W;
        for (let d = 0; d < 8; d++) {
          const nx = cx + dirs[d][0];
          const ny = cy + dirs[d][1];
          if (!inside(nx, ny) || arena.solid(nx, ny)) continue;
          if (d >= 4 && (arena.solid(cx + dirs[d][0], cy) || arena.solid(cx, cy + dirs[d][1]))) continue; // no corta esquinas
          const cell = ny * W + nx;
          if (prev[cell] !== -1) continue;
          prev[cell] = current;
          queue[tail++] = cell;
        }
      }
      if (prev[goal] === -1) return -1;
      // Se recorre el camino hacia atrás y se queda con la celda que está "ahead" pasos desde el inicio.
      let length = 0;
      for (let cell = goal; cell !== start; cell = prev[cell]) length++;
      const wanted = Math.min(Math.max(1, ahead), length);
      let cell = goal;
      for (let i = length; i > wanted; i--) cell = prev[cell];
      out.x = (cell % W) + 0.5;
      out.y = Math.floor(cell / W) + 0.5;
      return length;
    },
  };
}
