// Salir de la sala con Escape: la primera pulsación pregunta "¿YA TE VAS?"; la segunda vuelve al título. Cualquier otra tecla, un clic fuera o SEGUIR la cierra. Los botones sirven también con ratón.
// Qué NO hace: no avisa al servidor (al cerrar la página el socket se corta y la sala sigue para los demás).
// Ojo: si la página está en pantalla completa, el primer Escape lo usa el navegador para salir de ella y no llega aquí.

// skip() = true: ESC es de otro (en plena partida, el menú de pausa de quien juega en esta pantalla).
// onLeave: cómo se sale (versión arcade: goHome, al título sin pedir otra vez el clic de empezar).
export function setupLeaveRoom({ home = '/', isTyping = () => false, skip = () => false, onLeave = null } = {}) {
  const box = document.createElement('div');
  box.id = 'leave';
  box.hidden = true;
  box.innerHTML = `<div class="leave-card ui-panel" role="dialog" aria-modal="true" aria-labelledby="leave-title">
    <div class="ui-title" id="leave-title">¿YA TE VAS?</div>
    <p>Vuelves al inicio. Los demás pueden seguir dándose caña en la sala.</p>
    <div class="leave-actions"><button type="button" class="ui-tab" data-act="stay">ME QUEDO</button><button type="button" class="ui-tab danger" data-act="leave">SALIR</button></div>
    <p class="leave-keys">ESC OTRA VEZ PARA SALIR · CUALQUIER OTRA TECLA PARA QUEDARTE</p>
  </div>`;
  document.body.appendChild(box);
  const open = () => { box.hidden = false; };
  const close = () => { box.hidden = true; };
  const leave = () => (onLeave ? onLeave() : window.location.assign(home));
  box.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'leave') leave();
    else if (act === 'stay' || event.target === box) close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat || isTyping(event) || (box.hidden && skip())) return;
    if (box.hidden) { if (event.key === 'Escape') { event.preventDefault(); open(); } return; }
    event.preventDefault();
    event.stopPropagation(); // la tecla no llega a nadie más (ni la R del reinicio ni la M del menú)
    if (event.key === 'Escape') leave(); else close();
  }, true); // en captura: con la ventana abierta, ninguna otra tecla (R, M...) hace nada más
  return { open, close, get isOpen() { return !box.hidden; } };
}
