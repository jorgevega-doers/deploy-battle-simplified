// Animación de un impacto que no acaba la partida: el tanque herido estalla en cámara lenta con zoom, salen sus vidas (la última se rompe) y,
// pasado el zoom, los dos tanques reaparecen en su salida con una columna de luz. Guion en roundTimeline.js.
// Qué NO hace: no resta la vida (lo hace el servidor) ni pinta los corazones (el HUD lo hace en main.js).
import { HOLD_MS, DONE_MS, TEXT_AT, zoomAt, timeScaleAt } from './roundTimeline.js';
import { RING_COLORS } from './playerColors.js';

export function createRoundFx({ debris, entities, arcade, getMaxLives }) {
  const fx = { zoom: 0, zx: 0, zz: 0 };
  let hit = null; // { slot, x, y, start, texted, released }
  let lastNow = 0;

  function end() {
    hit = null;
    fx.zoom = 0;
    entities.holdTanks(false);
  }

  return {
    fx,
    get active() { return hit !== null; },
    onEvent(event, now) {
      // El impacto mortal lo lleva finale.js y los golpes a un bot del modo de un jugador (round: false) soloFx.js.
      if (event.type !== 'hit' || event.lives <= 0 || event.round === false) return;
      hit = { slot: event.slot, x: event.x, y: event.y, lives: event.lives, start: now, texted: false, released: false };
      lastNow = now;
      entities.holdTanks(true);            // los tanques se quedan donde estaban aunque el servidor ya los haya recolocado
      entities.setTankHidden(event.slot, true);
      debris.explode(event.x, event.y, event.slot);
      entities.spawnRing(event.x, event.y, 2.2, 0xffffff, 600, now);
      entities.spawnRing(event.x, event.y, 3.6, RING_COLORS[event.slot - 1], 1000, now);
      fx.zx = event.x;
      fx.zz = -event.y;
    },
    update(now) {
      if (!hit) return;
      const t = now - hit.start;
      if (!hit.texted && t >= TEXT_AT) {
        hit.texted = true;
        // Se ven todas las vidas que tenía y la última se rompe y se apaga.
        arcade.showLives({ max: Math.max(getMaxLives(hit.slot), hit.lives + 1), full: hit.lives + 1, breakIndex: hit.lives }, { y: 40, size: 1.4, hold: 750, enter: 'slam' });
      }
      if (!hit.released && t >= HOLD_MS) { // reaparecen los dos tanques en su salida
        hit.released = true;
        entities.holdTanks(false);
        entities.setTankHidden(hit.slot, false);
        entities.playSpawnAll(now);
        debris.hide();
      }
      fx.zoom = zoomAt(t);
      debris.step(((now - lastNow) / 1000) * timeScaleAt(t), t);
      lastNow = now;
      if (t >= DONE_MS) end();
    },
    reset() {
      if (hit) {
        entities.setTankHidden(hit.slot, false);
        debris.hide();
      }
      end();
    },
  };
}
