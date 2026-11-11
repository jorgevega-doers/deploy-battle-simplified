// Chispas cuadradas de pixel art para el logo (bucle del lobby y choque de la intro). Pool fijo: ningún objeto nuevo por fotograma.
// Cada chispa vive en una cuadrícula de celdas enteras: se mueve a pasos de 1/20 s y se dibuja con fillRect de 1 o 2 celdas, así nunca
// queda un píxel "a medias" ni se ve movimiento suave (AGENTS.md, sección 17). Qué NO hace: no crea el canvas ni decide cuándo salen.
export const SPARK_COLORS = ['#ffffff', '#ff9cca', '#ff1f8e', '#9fb0ff', '#6f8cff']; // blanco, rosas de la marca y azules claros

const STEP_S = 1 / 20;

// capacity = chispas a la vez; gravity = celdas/s² hacia abajo (negativa: sube).
export function createSparks(capacity = 48, gravity = 14) {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const life = new Float32Array(capacity); // segundos que le quedan; <= 0 = hueco libre
  const size = new Uint8Array(capacity);
  const color = new Uint8Array(capacity);
  let alive = 0;
  let acc = 0;

  return {
    get alive() { return alive; },
    emit(px, py, pvx, pvy, lifeS, colorIndex = 0, cells = 1) {
      for (let i = 0; i < capacity; i++) {
        if (life[i] > 0) continue;
        x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; life[i] = lifeS; color[i] = colorIndex; size[i] = cells;
        alive++;
        return;
      }
    },
    // Estallido radial desde un punto (el choque de la intro).
    burst(cx, cy, count, speed, lifeS) {
      for (let n = 0; n < count; n++) {
        const a = (n / count) * Math.PI * 2 + Math.random() * 0.4;
        const s = speed * (0.5 + Math.random() * 0.7);
        this.emit(cx, cy, Math.cos(a) * s, Math.sin(a) * s, lifeS * (0.6 + Math.random() * 0.6), (Math.random() * SPARK_COLORS.length) | 0, Math.random() < 0.3 ? 2 : 1);
      }
    },
    step(dt) {
      if (alive === 0) { acc = 0; return; }
      acc += dt;
      while (acc >= STEP_S) {
        acc -= STEP_S;
        for (let i = 0; i < capacity; i++) {
          if (life[i] <= 0) continue;
          life[i] -= STEP_S;
          if (life[i] <= 0) { alive--; continue; }
          x[i] += vx[i] * STEP_S;
          y[i] += vy[i] * STEP_S;
          vy[i] += gravity * STEP_S;
        }
      }
    },
    // Dibuja en un canvas cuyo píxel es una celda; ox/oy desplazan el origen (márgenes del canvas).
    draw(ctx, ox = 0, oy = 0) {
      let last = -1;
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) continue;
        if (color[i] !== last) { last = color[i]; ctx.fillStyle = SPARK_COLORS[last]; }
        const blink = life[i] < 0.18 && ((life[i] * 20) | 0) % 2 === 0; // al final parpadea y desaparece
        if (blink) continue;
        ctx.fillRect(Math.round(x[i] + ox), Math.round(y[i] + oy), size[i], size[i]);
      }
    },
    clear() { life.fill(0); alive = 0; acc = 0; },
  };
}
