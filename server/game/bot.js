// Bot sencillo que maneja un tanque como lo haría un mando: elige dirección cada poco (hacia el rival, de lado o al azar),
// apunta al rival con algo de error, dispara y a veces hace dash. Sin pathfinding: si choca con un muro se desliza y
// cambia de dirección al rato. Pensado para la partida de fondo del salvapantallas (attract.js); sirve de base para un
// futuro modo de un jugador. Qué NO hace: no usa sockets ni conoce el mapa (solo la posición de los dos tanques).
const rand = (rng, min, max) => min + rng() * (max - min);

export function createBot(slot, rng = Math.random) {
  let t = 0;
  let nextMoveAt = 0;
  let nextAimAt = 0;
  let nextFireAt = rand(rng, 0.6, 1.4);

  return {
    // dt en segundos; match = la partida (tanks, setMove, setAim, fire, dash).
    think(match, dt) {
      t += dt;
      const me = match.tanks[slot - 1];
      const enemy = match.tanks[slot === 1 ? 1 : 0];
      const toEnemy = Math.atan2(enemy.y - me.y, enemy.x - me.x);

      if (t >= nextMoveAt) {
        nextMoveAt = t + rand(rng, 0.5, 1.3);
        const roll = rng();
        if (roll < 0.1) match.setMove(slot, 0, 0);
        else {
          // 45 % hacia el rival, 25 % de lado (esquivar), 30 % al azar
          const angle = roll < 0.55 ? toEnemy + rand(rng, -0.5, 0.5) : roll < 0.8 ? toEnemy + (rng() < 0.5 ? 1 : -1) * Math.PI / 2 : rand(rng, 0, Math.PI * 2);
          const power = rand(rng, 0.7, 1);
          match.setMove(slot, Math.cos(angle) * power, Math.sin(angle) * power);
        }
        if (rng() < 0.2) match.dash(slot);
      }
      if (t >= nextAimAt) { // apunta al rival con algo de error
        nextAimAt = t + rand(rng, 0.15, 0.4);
        match.setAim(slot, toEnemy + rand(rng, -0.3, 0.3));
      }
      if (t >= nextFireAt) {
        nextFireAt = t + rand(rng, 0.7, 1.6);
        match.fire(slot);
      }
    },
  };
}
