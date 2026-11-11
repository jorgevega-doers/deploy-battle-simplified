// Pausa y SALIR en el mando del móvil (versión pública, 10-nov).
//  - En partida: botón de PAUSA arriba en el centro. Abre el menú: SEGUIR o SALIR DE LA PARTIDA (con confirmación: cuenta como derrota y los
//    demás siguen). La partida se congela como mucho 10 s (servidor, pause.js); online con otra gente no se para.
//  - En la sala de espera: SALIR (con confirmación). Si el móvil era el mando de tu pantalla, la pantalla vuelve al teclado.
// Qué NO hace: no decide nada (el servidor); al salir, main.js enseña la pantalla de "has salido" (onLeft).
import { EVENTS } from '../../shared/events.js';

const DENIED = {
  online: 'ONLINE LA PARTIDA NO SE PARA: ¡SIGUEN JUGANDO!',
  cooldown: (s) => `ACABAS DE PAUSAR: PODRÁS OTRA VEZ EN ${s} S`,
  limit: 'YA HAS USADO TUS 2 PAUSAS DE ESTA PARTIDA',
  busy: 'LA PARTIDA YA ESTÁ EN PAUSA',
};

// bound = este móvil es el mando de la pantalla de un jugador (relevo del teclado): al salir, esa pantalla vuelve al teclado.
export function setupPhoneMenu({ socket, getSlot, getPhase, nameOf, bound = false, onOpen = () => {}, onLeft = () => {} }) {
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.className = 'ui-btn';
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('aria-label', 'Pausa');
  pauseBtn.innerHTML = '<svg viewBox="0 0 6 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="M0 0h2v7H0zM4 0h2v7H4z"/></svg>';
  document.getElementById('view-pads').appendChild(pauseBtn);
  const leaveBtn = document.createElement('button');
  leaveBtn.id = 'leave-btn';
  leaveBtn.type = 'button';
  leaveBtn.textContent = 'SALIR';
  const about = document.querySelector('#view-slot .about-btn');
  if (about) about.after(leaveBtn); else document.getElementById('view-slot').appendChild(leaveBtn); // en la misma fila que SOBRE DOERS
  const banner = document.createElement('div'); // pausa de otro jugador
  banner.id = 'pause-note';
  banner.hidden = true;
  document.getElementById('view-pads').appendChild(banner);
  const box = document.createElement('div');
  box.id = 'phone-menu';
  box.hidden = true;
  box.innerHTML = '<div class="card ui-panel"><div class="ui-tab"></div><p class="pm-msg"></p><div class="pm-actions"></div></div>';
  document.body.appendChild(box);
  const title = box.querySelector('.ui-tab');
  const msg = box.querySelector('.pm-msg');
  const actions = box.querySelector('.pm-actions');
  let mode = null;      // 'pause' | 'leave' (sala de espera)
  let confirming = false;
  let server = { by: null, left: 0 };
  let note = '';

  function render() {
    const playing = mode === 'pause';
    title.textContent = confirming ? (playing ? '¿SALIR DE LA PARTIDA?' : '¿SALIR DE LA SALA?') : 'PAUSA';
    msg.textContent = confirming
      ? (playing ? 'CUENTA COMO DERROTA. LOS DEMÁS SIGUEN JUGANDO.' : (bound ? 'TU PANTALLA VUELVE AL TECLADO.' : 'DEJAS TU HUECO EN LA SALA.'))
      : note || (server.by === getSlot() ? `LA PARTIDA SIGUE SOLA EN ${server.left} S` : 'PARANDO LA PARTIDA...');
    const items = confirming ? [['quit', 'SÍ, SALIR', true], ['back', 'NO', false]] : [['resume', 'SEGUIR', false], ['ask', 'SALIR DE LA PARTIDA', true]];
    actions.innerHTML = items.map(([act, label, danger]) => `<button type="button" class="ui-btn${danger ? ' danger' : ''}" data-act="${act}">${label}</button>`).join('');
  }
  function open(kind) {
    mode = kind; confirming = kind === 'leave'; note = '';
    onOpen();
    if (kind === 'pause' && server.by === null) socket.emit(EVENTS.PAUSE_REQUEST, { on: true });
    box.hidden = false;
    render();
  }
  function close(resume) {
    if (resume && mode === 'pause' && server.by !== null) socket.emit(EVENTS.PAUSE_REQUEST, { on: false });
    mode = null; confirming = false; box.hidden = true;
  }
  function quit() {
    socket.emit(EVENTS.PLAYER_QUIT);
    close(false);
    setTimeout(() => { socket.disconnect(); onLeft(); }, 150); // un momento para que el aviso llegue antes de cortar
  }
  pauseBtn.addEventListener('click', () => { if (getPhase() === 'PLAYING' && getSlot() !== null) open('pause'); });
  leaveBtn.addEventListener('click', () => { if (getSlot() !== null) open('leave'); });
  box.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') close(true);
    else if (act === 'ask') { confirming = true; render(); }
    else if (act === 'back') { if (mode === 'leave') close(false); else { confirming = false; render(); } }
    else if (act === 'quit') quit();
  });

  return {
    // PAUSE_STATE del servidor.
    serverState(state) {
      if (state.denied) { note = typeof DENIED[state.denied] === 'function' ? DENIED[state.denied](state.wait) : DENIED[state.denied] ?? ''; if (!box.hidden) render(); return; }
      const wasMine = server.by !== null && server.by === getSlot();
      server = { by: state.by ?? null, left: state.left ?? 0 };
      if (wasMine && server.by === null && mode === 'pause' && !confirming) close(false); // pasaron los 10 s: a jugar
      else if (!box.hidden) render();
      const other = server.by !== null && server.by !== getSlot();
      banner.hidden = !other;
      if (other) banner.textContent = `PAUSA DE ${nameOf(server.by) || 'OTRO JUGADOR'} · ${server.left} S`;
    },
    // Cambio de fase: fuera de la partida no hay pausa.
    phase(phase) { if (phase !== 'PLAYING') { server = { by: null, left: 0 }; banner.hidden = true; if (mode === 'pause') close(false); } },
  };
}
