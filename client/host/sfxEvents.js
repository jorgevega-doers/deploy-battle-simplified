// Traduce lo que ocurre en la partida (match_event del servidor) a sonidos: qué sonido, desde dónde (panorama estéreo según la
// posición en el mapa) y con qué retraso. Es una función pura (se prueba sin audio); main.js reproduce el resultado con sfx.js.
// state = último estado recibido del servidor (para saber dónde está el tanque que dispara: el evento "shot" no trae posición).
import { panFor } from './sfx.js';

const SPAWN_DELAY_MS = 1500; // la reaparición tras un impacto de ronda ocurre cuando acaba el zoom (HOLD_MS de roundTimeline.js)

// Devuelve una lista de { name, args, delayMs } (vacía si ese evento no suena).
export function soundsForEvent(event, state, width = 32) {
  const at = (x) => (typeof x === 'number' ? panFor(x, width) : 0);
  const tankX = (slot) => (state?.tanks?.[slot - 1] ? state.tanks[slot - 1][0] : width / 2);
  switch (event.type) {
    case 'shot': return [{ name: 'shot', args: { slot: event.slot, pan: at(tankX(event.slot)) }, delayMs: 0 }];
    case 'bounce': return [{ name: 'bounce', args: { n: event.n, pan: at(event.x) }, delayMs: 0 }];
    case 'impact': return [{ name: 'impact', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'expire': return [{ name: 'expire', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'explosion': return [{ name: 'explosion', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'dash': return [{ name: 'dash', args: { pan: at(tankX(event.slot)) }, delayMs: 0 }];
    case 'powerup_warn': return [{ name: 'powerupWarn', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'powerup_spawn': return [{ name: 'powerupSpawn', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'powerup_pick': return [{ name: 'powerupPick', args: { pan: at(tankX(event.slot)) }, delayMs: 0 }];
    case 'shield_break': return [{ name: 'shieldBreak', args: { pan: at(event.x) }, delayMs: 0 }];
    case 'hit': {
      const list = [{ name: 'hit', args: { pan: at(event.x) }, delayMs: 0 }];
      // Tras un impacto que no acaba la partida, el tanque reaparece (en el 1 contra 1 tras el zoom; un bot, enseguida).
      if (event.lives > 0) list.push({ name: 'spawn', args: { pan: 0 }, delayMs: event.round === false ? 200 : SPAWN_DELAY_MS });
      return list;
    }
    case 'match_over': return [{ name: event.reason === 'lives' || event.reason === 'forfeit' ? 'ko' : 'timeUp', args: {}, delayMs: event.reason === 'lives' ? 150 : 0 }];
    default: return [];
  }
}
