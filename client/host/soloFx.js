// Efectos del modo de un jugador cuando un BOT recibe un impacto: la partida no se para (sin zoom ni cámara lenta), pero el bot
// estalla en trozos con un aro de su color. Si le quedan vidas reaparece en otra esquina con la columna de luz (el servidor ya lo
// ha recolocado); si no, queda eliminado (el tanque deja de dibujarse porque su estado trae 0 vidas).
// Qué NO hace: no sigue al impacto del jugador ni al último golpe de la partida (eso lo llevan roundFx.js y finale.js).
import { RING_COLORS } from './playerColors.js';

const BLAST_MS = 1500; // lo que duran los trozos en pantalla

// debris = un juego de trozos propio (los del impacto normal y el KO pueden estar en marcha a la vez).
export function createSoloFx({ debris, entities }) {
  let start = -1e9;
  let lastNow = 0;

  return {
    get active() { return debris.visible; },
    onEvent(event, now) {
      if (event.type !== 'hit' || event.round !== false || event.final === true) return;
      debris.explode(event.x, event.y, event.slot);
      start = now;
      lastNow = now;
      entities.spawnRing(event.x, event.y, 2.4, RING_COLORS[event.slot - 1], 700, now);
      if (event.lives > 0) entities.playSpawn(event.slot, now);
    },
    update(now) {
      if (!debris.visible) return;
      const age = now - start;
      if (age >= BLAST_MS) { debris.hide(); return; }
      debris.step((now - lastNow) / 1000, age);
      lastNow = now;
    },
    reset() { debris.hide(); },
  };
}
