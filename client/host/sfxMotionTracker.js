// Mide la velocidad dibujada de cada tanque (celdas por segundo) entre fotogramas para el sonido de movimiento (sfxMotion.js).
// Igual que el polvo de dust.js: un salto grande es una recolocación (ronda nueva o reaparición), no movimiento, y los bots
// eliminados no suenan. Es lógica pura: se prueba sin audio.
const MAX_JUMP = 1.5; // más que esto entre dos fotogramas = recolocación

// Velocidad entre dos posiciones separadas dtMs milisegundos, o 0 si es un salto o no hay dato.
export function speedBetween(x0, y0, x1, y1, dtMs) {
  if (!(dtMs > 0)) return 0;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  return dist < MAX_JUMP ? (dist / dtMs) * 1000 : 0;
}

export function createMotionTracker() {
  const last = Array.from({ length: 4 }, () => ({ x: 0, y: 0, ok: false }));
  let lastNow = 0;
  const speeds = [0, 0, 0, 0];
  return {
    // state = estado interpolado del fotograma (con tankCount y tanks[i].x/y/lives). Devuelve las velocidades (se reutiliza el array).
    update(state, now) {
      const dt = lastNow ? now - lastNow : 0;
      lastNow = now;
      for (let i = 0; i < 4; i++) {
        const t = i < state.tankCount ? state.tanks[i] : null;
        const alive = t !== null && !(state.tankCount > 2 && t.lives <= 0);
        speeds[i] = alive && last[i].ok ? speedBetween(last[i].x, last[i].y, t.x, t.y, dt) : 0;
        last[i].ok = alive;
        if (alive) { last[i].x = t.x; last[i].y = t.y; }
      }
      return speeds;
    },
    reset() { lastNow = 0; for (const l of last) l.ok = false; speeds.fill(0); },
  };
}
