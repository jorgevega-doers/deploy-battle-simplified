// El juego entero en una sola página. "/" abre la pantalla de título (boot.js); al pulsar JUGAR y poner el
// nombre se busca sala y se carga la pantalla del juego (main.js) en la MISMA página, así el sonido que se activó con el primer clic sigue sonando.
// Este módulo es el punto de encuentro entre boot.js y main.js (los módulos se cargan una sola vez: lo que boot.js pone aquí, main.js lo lee).
// Qué NO hace: no dibuja nada.

export const ARCADE = {
  sfx: null,   // el sonido ya desbloqueado en el título: main.js lo reutiliza (si no, la música empezaría de cero)
};
const SKIP_KEY = 'df.arcade.skip';   // volver al título sin "PULSA PARA EMPEZAR" ni intro (venimos de SALIR, no de abrir la web)
const NOTE_KEY = 'df.arcade.note';   // aviso para enseñar en el título (p. ej. "te sacamos por inactividad")

// Vuelve a la pantalla principal (SALIR, inactividad, sala cerrada). Recarga la página (así no queda nada de la sala anterior), pero sin la
// pantalla de "pulsa para empezar": eso solo sale al abrir la web o al recargarla a mano.
export function goHome(note = '') {
  try { sessionStorage.setItem(SKIP_KEY, '1'); if (note) sessionStorage.setItem(NOTE_KEY, note); } catch { /* sin almacenamiento: saldrá la pantalla de empezar */ }
  window.location.assign('/');
}

// boot.js: ¿venimos de SALIR? (se lee una vez y se borra: una recarga a mano vuelve a enseñar "pulsa para empezar").
export function takeSkip() {
  try { const skip = sessionStorage.getItem(SKIP_KEY) === '1'; sessionStorage.removeItem(SKIP_KEY); return skip; } catch { return false; }
}
export function takeNote() {
  try { const note = sessionStorage.getItem(NOTE_KEY) ?? ''; sessionStorage.removeItem(NOTE_KEY); return note; } catch { return ''; }
}
