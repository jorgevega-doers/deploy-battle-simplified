// Pausa de la partida (versión pública, 10-nov): un jugador congela la partida para todos, pero con límites para que nadie abuse:
//  - dura como mucho maxS (10 s) y luego sigue sola; cualquiera puede quitarla antes;
//  - cada jugador tiene perMatch pausas por partida y, entre una y la siguiente, cooldownS de espera.
// En las salas online con otra gente no se congela nada (lo decide sockets.js): allí el menú de pausa es solo tuyo, como en los juegos online.
// Lógica pura: el tiempo llega en tick(dt) y los avisos salen por out.pause({ by, left }) (by = plaza que pausó, null = sin pausa).

export function createPause({ maxS = 10, cooldownS = 30, perMatch = 2 } = {}) {
  let by = null;      // plaza que tiene la partida en pausa, o null
  let left = 0;       // segundos de pausa que quedan
  let shown = -1;     // último segundo avisado
  let clock = 0;      // segundos de partida jugados (para la espera entre pausas)
  const used = new Map();    // plaza -> pausas usadas en esta partida
  const readyAt = new Map(); // plaza -> cuándo (clock) puede volver a pausar

  function end(out) {
    readyAt.set(by, clock + cooldownS);
    by = null;
    out.pause({ by: null });
  }

  return {
    get paused() { return by !== null; },
    reset() { by = null; left = 0; shown = -1; clock = 0; used.clear(); readyAt.clear(); },
    // on = true: pide pausa; devuelve true o el motivo del no ('busy' | 'limit' | 'cooldown') con los segundos de espera. on = false: la quita.
    request(slot, on, out) {
      if (!on) { if (by === null) return false; end(out); return true; }
      if (by !== null) return { denied: 'busy' };
      const n = used.get(slot) ?? 0;
      if (n >= perMatch) return { denied: 'limit' };
      const wait = (readyAt.get(slot) ?? 0) - clock;
      if (wait > 0) return { denied: 'cooldown', wait: Math.ceil(wait) };
      by = slot; left = maxS; shown = Math.ceil(left);
      used.set(slot, n + 1);
      out.pause({ by, left: shown });
      return true;
    },
    // Devuelve true mientras la partida está en pausa (la sesión no la avanza).
    tick(dt, out) {
      if (by === null) { clock += dt; return false; }
      left -= dt;
      if (left <= 0) { end(out); return false; }
      const s = Math.ceil(left);
      if (s !== shown) { shown = s; out.pause({ by, left: s }); }
      return true;
    },
    usesLeft(slot) { return perMatch - (used.get(slot) ?? 0); },
  };
}
