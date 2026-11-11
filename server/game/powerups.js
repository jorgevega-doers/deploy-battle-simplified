// Power-ups: aparecen al azar en las zonas neutras del mapa y se recogen pasando por encima.
// Tipos: 'double' (doble disparo), 'speed' (velocidad), 'aoe' (explosión en el 2.º rebote) y 'shield' (escudo).
import { boxesOverlap } from '../../shared/geometry.js';
import { TANK_HALF, POWERUP_HALF, POWERUP_TYPES } from '../../shared/constants.js';

// rng: función que devuelve un número entre 0 y 1 (Math.random en el juego, una semilla fija en los tests).
export function createPowerups({ arena, rng, cfg }) {
  let items = [];
  let nextId = 1;
  let timer = cfg.powerupFirstSpawnS;

  let pending = null; // el que va a salir (ya avisado)

  const isFree = (spot) => !items.some((item) => item.x === spot.x && item.y === spot.y);
  // Tipo al azar con pesos (cfg.powerupWeights): la explosión sale menos que los demás.
  const pickType = () => {
    const weight = (type) => cfg.powerupWeights?.[type] ?? 1;
    let roll = rng() * POWERUP_TYPES.reduce((sum, type) => sum + weight(type), 0);
    for (const type of POWERUP_TYPES) { roll -= weight(type); if (roll < 0) return type; }
    return POWERUP_TYPES[POWERUP_TYPES.length - 1];
  };

  return {
    get items() { return items; },
    // Cuenta atrás de aparición. Si hay hueco, crea uno nuevo en un punto libre al azar.
    // Unos powerupWarnS segundos antes se elige dónde y cuál saldrá y se avisa al host (powerup_warn: columna de luz).
    update(dt, events) {
      timer -= dt;
      if (!pending && timer <= cfg.powerupWarnS && items.length < cfg.powerupMax) {
        const free = arena.powerupSpots.filter(isFree);
        if (free.length > 0) {
          const spot = free[Math.floor(rng() * free.length)];
          pending = { type: pickType(), x: spot.x, y: spot.y };
          events.push({ type: 'powerup_warn', powerup: pending.type, x: spot.x, y: spot.y, seconds: Math.max(0, timer) });
        }
      }
      if (timer > 0) return;
      timer = cfg.powerupSpawnS;
      const spawning = pending;
      pending = null;
      if (!spawning || items.length >= cfg.powerupMax) return;
      const item = { id: nextId++, type: spawning.type, x: spawning.x, y: spawning.y };
      items.push(item);
      events.push({ type: 'powerup_spawn', id: item.id, powerup: item.type, x: item.x, y: item.y });
    },
    // Si el tanque está sobre un power-up lo recoge: activa su efecto durante powerupDurationS[tipo] segundos
    // (se renueva, no se acumula, si ya lo tenía).
    collect(tank, events) {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (!boxesOverlap(tank.x, tank.y, TANK_HALF, item.x, item.y, POWERUP_HALF)) continue;
        for (const type of POWERUP_TYPES) tank.effects[type] = 0; // solo un power-up activo: el nuevo sustituye al anterior
        tank.effects[item.type] = cfg.powerupDurationS[item.type];
        items.splice(i, 1);
        events.push({ type: 'powerup_pick', id: item.id, slot: tank.slot, powerup: item.type });
      }
    },
    // Coloca un power-up a mano en (x, y) (la presentación guionizada lo necesita en un sitio concreto). Devuelve el item.
    spawnAt(type, x, y, events = []) {
      const item = { id: nextId++, type, x, y };
      items.push(item);
      events.push({ type: 'powerup_spawn', id: item.id, powerup: type, x, y });
      return item;
    },
    clear() { items = []; pending = null; },
  };
}
