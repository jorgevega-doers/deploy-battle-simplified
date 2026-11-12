// Configuración de los mandos físicos: qué botón o eje es cada acción. Lógica pura (sin navegador), la usa gamepads.js.
// El navegador da un orden "estándar" para los mandos que conoce; los genéricos llegan "en bruto" y su orden cambia según el sistema
// (Windows / Linux), así que hay una configuración por defecto para genéricos y otra que se aprende desde el menú (pestaña MANDOS).

// Pasos de la configuración del menú: [acción, texto]. Las acciones de botón aceptan también un gatillo analógico (eje).
export const LEARN_STEPS = [
  ['start', 'PULSA START'], ['select', 'PULSA SELECT'], ['dash', 'PULSA L2 (IMPULSO)'], ['fire', 'PULSA R2 (DISPARAR)'],
  ['lx', 'MUEVE EL STICK IZQUIERDO A LA DERECHA'], ['ly', 'MUEVE EL STICK IZQUIERDO HACIA ABAJO'],
  ['rx', 'MUEVE EL STICK DERECHO A LA DERECHA'], ['ry', 'MUEVE EL STICK DERECHO HACIA ABAJO'],
];
export const STICK_ACTIONS = new Set(['lx', 'ly', 'rx', 'ry']);

// Botones por posición: unirse = los botones 8 y 9 a la vez, impulso = el 6, disparo = el 7. En los mandos "standard" (el navegador ya los ordena)
// eso es SELECT + START, L2 y R2. En los GAME BOX JOYSTICK, que llegan en bruto, el orden es otro y COMPROBADO en Windows (29-oct): L2 + R2 = unirse
// y JUGAR, L1 = acelerón, R1 = disparo. El stick derecho va en los ejes 2 y 5 en Windows o 2 y 3 en Linux (el de Linux, sin comprobar).
export function defaultMapping(pad, userAgent = '') {
  const b = (i) => ({ t: 'b', i });
  const base = { start: b(9), select: b(8), dash: b(6), fire: b(7), lx: { i: 0, sign: 1 }, ly: { i: 1, sign: 1 }, rx: { i: 2, sign: 1 } };
  // Mandos "standard" (Xbox, PlayStation, Switch Pro... los que el navegador ya ordena): disparo con R1/RB (botón 5) e impulso con L1/LB (botón 4),
  // como en los GAME BOX (10-nov: R2 y L2 ya no hacen nada).
  if (pad.mapping === 'standard') return { ...base, ry: { i: 3, sign: 1 }, fire: b(5), dash: b(4) };
  const linux = /linux|android|cros/i.test(userAgent);
  return { ...base, ry: { i: !linux && pad.axes.length > 5 ? 5 : 3, sign: 1 } };
}

// ¿Está pulsada la acción? Botón (o gatillo analógico: eje que se aleja de su reposo).
export function isPressed(pad, m) {
  if (!m) return false;
  if (m.t === 'a') return ((pad.axes[m.i] ?? 0) - (m.rest ?? 0)) * m.sign > 0.5;
  const button = pad.buttons[m.i];
  return Boolean(button && (button.pressed || button.value > 0.5));
}

// Valor de un eje de stick (-1 a 1) con su sentido.
export const axisValue = (pad, m) => (m ? Math.max(-1, Math.min(1, (pad.axes[m.i] ?? 0) * m.sign)) : 0);

// Un paso de la configuración: la entrada nueva respecto al reposo (rest = ejes al empezar). Devuelve la configuración de la acción o null.
export function detectInput(pad, action, rest) {
  if (!STICK_ACTIONS.has(action)) {
    const i = pad.buttons.findIndex((b) => b.pressed || b.value > 0.5);
    if (i >= 0) return { t: 'b', i };
  }
  const i = pad.axes.findIndex((v, k) => Math.abs(v - (rest[k] ?? 0)) > 0.6);
  if (i < 0) return null;
  const sign = Math.sign(pad.axes[i] - (rest[i] ?? 0));
  return STICK_ACTIONS.has(action) ? { i, sign } : { t: 'a', i, sign, rest: rest[i] ?? 0 };
}

// Gira "current" hacia "target" por el camino corto, como mucho "maxStep" radianes. Los sticks baratos (los GAME BOX JOYSTICK) solo dan 8 direcciones
// (saltos de 45°): así el apuntado recorre los ángulos intermedios y se ve fluido en vez de saltar.
export function turnToward(current, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
}
