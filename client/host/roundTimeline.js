// Guion de un impacto que NO acaba la partida (tiempos en ms desde el impacto). Lógica pura, sin DOM ni Three.js, para poder
// probarla; roundFx.js lo ejecuta. Secuencia: el tanque herido estalla en cámara lenta con zoom y sale "-1 VIDA"; a los
// HOLD_MS la cámara ya se ha alejado y los dos tanques reaparecen en su salida con su animación; a los DONE_MS acaba todo.
// DONE_MS debe coincidir con la pausa del servidor tras un impacto (roundFreezeS en server/config.js), para que nadie pueda
// moverse mientras dura la animación.
export const HOLD_MS = 1500;
export const DONE_MS = 2200;
export const TEXT_AT = 250;
const ZOOM_IN = [0, 350];
const ZOOM_OUT = [1000, 1500];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;
const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - ((-2 * v + 2) ** 3) / 2);

// Zoom de la cámara (0-1) en el instante t.
export function zoomAt(t) {
  if (t < ZOOM_OUT[0]) return easeOut(clamp01((t - ZOOM_IN[0]) / (ZOOM_IN[1] - ZOOM_IN[0])));
  return 1 - easeInOut(clamp01((t - ZOOM_OUT[0]) / (ZOOM_OUT[1] - ZOOM_OUT[0])));
}

// Velocidad del tiempo de los trozos: cámara lenta al principio y vuelve a la normal antes de reaparecer.
export function timeScaleAt(t) {
  if (t < 500) return 0.18;
  return Math.min(1, 0.18 + (1 - 0.18) * ((t - 500) / 800));
}
