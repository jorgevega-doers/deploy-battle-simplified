// Menú de PAUSA en plena partida. Lo abre un jugador de ESTA pantalla: ESC (teclado), START (mando del PC).
// SEGUIR lo cierra; SALIR DE LA PARTIDA pide confirmación y el jugador pierde por abandono (la partida sigue con los demás).
// La partida se congela de verdad (servidor, pause.js: 10 s como mucho, 2 pausas por partida, 30 s entre una y otra); online con otra gente no se
// congela: el menú es solo tuyo y la partida sigue. Si pausa otro, aquí solo se ve el aviso con los segundos.
// Se maneja con ratón, con teclado (↑↓ / W S, ENTER, ESC) y con el mando (cruceta o stick, A, B o START): input('up'|'down'|'ok'|'back').
// Qué NO hace: no decide si se puede pausar (el servidor) ni sale de la página (owner.onQuit).
import { EVENTS } from '../../shared/events.js';

const DENIED = {
  online: 'ONLINE LA PARTIDA NO SE PARA: CUIDADO, ¡SIGUEN JUGANDO!',
  cooldown: (s) => `ACABAS DE PAUSAR: PODRÁS OTRA VEZ EN ${s} S. LA PARTIDA SIGUE`,
  limit: 'YA HAS USADO TUS 2 PAUSAS DE ESTA PARTIDA. LA PARTIDA SIGUE',
  busy: 'LA PARTIDA YA ESTÁ EN PAUSA',
};

export function createPauseMenu({ nameOf = () => '' }) {
  const box = document.createElement('div');
  box.id = 'pause';
  box.hidden = true;
  box.innerHTML = `<div class="leave-card ui-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
    <div class="ui-title" id="pause-title">PAUSA</div>
    <p class="pause-msg"></p>
    <div class="pause-actions"></div>
    <p class="leave-keys">↑↓ ELEGIR · ENTER O A ACEPTAR · ESC O B VOLVER · SELECT OTRA VEZ: SALIR</p>
  </div>`;
  document.body.appendChild(box);
  const banner = document.createElement('div'); // aviso cuando pausa otro jugador (sin menú)
  banner.id = 'pause-banner';
  banner.className = 'ui-panel';
  banner.hidden = true;
  document.body.appendChild(banner);
  const msg = box.querySelector('.pause-msg');
  const actions = box.querySelector('.pause-actions');
  let owner = null;     // { slot, socket, onQuit } del jugador que abrió el menú
  let lobbyMode = false; // abierto en la sala de espera (SELECT): solo "¿salir de la sala?"
  let leaveOnly = false; // abierto con SELECT: directamente la confirmación de salir
  let confirming = false;
  let focus = 0;
  let server = { by: null, left: 0 }; // lo último que dijo el servidor
  let note = '';        // por qué no se ha congelado (online, espera, límite)

  function render() {
    const items = confirming ? [['quit', 'SÍ, SALIR'], ['back', 'NO, SEGUIR']] : [['resume', 'SEGUIR'], ['ask', 'SALIR DE LA PARTIDA']];
    focus = Math.min(focus, items.length - 1);
    actions.innerHTML = items.map(([act, label], i) => `<button type="button" class="ui-tab${act === 'quit' || act === 'ask' ? ' danger' : ''}${i === focus ? ' focus' : ''}" data-act="${act}">${label}</button>`).join('');
    box.querySelector('.ui-title').textContent = confirming ? (lobbyMode ? '¿SALIR DE LA SALA?' : '¿SALIR DE LA PARTIDA?') : 'PAUSA';
    msg.textContent = confirming ? (lobbyMode ? 'DEJAS TU HUECO EN LA SALA.' : 'CUENTA COMO DERROTA. LOS DEMÁS SIGUEN JUGANDO.')
      : note || (server.by === owner?.slot ? `LA PARTIDA SIGUE SOLA EN ${server.left} S` : 'PARANDO LA PARTIDA...');
  }
  function renderBanner() {
    const other = server.by !== null && server.by !== owner?.slot;
    banner.hidden = !other || !box.hidden;
    if (other) banner.textContent = `PAUSA DE ${nameOf(server.by) || 'UN JUGADOR'} · SIGUE EN ${server.left} S`;
  }
  function act(action) {
    if (action === 'resume') { close(true); return; }
    if (action === 'ask') { confirming = true; focus = 1; render(); return; } // por defecto en NO: salir sin querer cuesta la partida
    if (action === 'back') { if (leaveOnly) { close(false); return; } confirming = false; focus = 0; render(); return; }
    if (action === 'quit') {
      const o = owner;
      o.socket.emit(EVENTS.PLAYER_QUIT);
      close(false);
      o.onQuit?.();
    }
  }
  function close(resume) {
    if (resume && owner && server.by !== null) owner.socket.emit(EVENTS.PAUSE_REQUEST, { on: false });
    owner = null; confirming = false; note = ''; lobbyMode = false; leaveOnly = false;
    box.hidden = true;
    renderBanner();
  }
  box.addEventListener('click', (event) => {
    const a = event.target.closest('[data-act]')?.dataset.act;
    if (a) { event.currentTarget.blur?.(); act(a); }
  });

  return {
    get open() { return !box.hidden; },
    ownerSlot: () => owner?.slot ?? null,
    // owner = { slot, socket, onQuit }. Pide la pausa al servidor y abre el menú.
    // o.leave = abierto con SELECT: directamente "¿salir?" con SÍ elegido (A lo acepta y SELECT otra vez también). o.lobby = en la sala de espera.
    show(o) {
      if (!box.hidden || o.slot == null) return;
      owner = o; confirming = Boolean(o.leave); focus = 0; note = '';
      lobbyMode = Boolean(o.lobby); leaveOnly = Boolean(o.leave);
      if (!o.leave && server.by === null) o.socket.emit(EVENTS.PAUSE_REQUEST, { on: true }); // SELECT no pausa: es para salir
      box.hidden = false;
      render(); renderBanner();
    },
    close: () => close(true),
    // Entrada de teclado o mando con el menú abierto.
    input(action) {
      if (box.hidden) return;
      const n = actions.children.length;
      if (action === 'up') focus = (focus + n - 1) % n;
      else if (action === 'down') focus = (focus + 1) % n;
      else if (action === 'ok') { act(actions.children[focus].dataset.act); return; }
      else if (action === 'back') { if (confirming) act('back'); else close(true); return; }
      else if (action === 'select') { act(confirming ? 'quit' : 'ask'); return; } // doble SELECT = salir
      render();
    },
    // PAUSE_STATE del servidor: { by, left } o, solo a quien lo pidió, { denied, wait }.
    serverState(state) {
      if (state.denied) { note = typeof DENIED[state.denied] === 'function' ? DENIED[state.denied](state.wait) : DENIED[state.denied] ?? ''; if (!box.hidden) render(); return; }
      const wasMine = server.by !== null && server.by === owner?.slot;
      server = { by: state.by ?? null, left: state.left ?? 0 };
      if (wasMine && server.by === null && !box.hidden && !confirming) close(false); // se acabaron los 10 s: la partida sigue y el menú se cierra
      else if (!box.hidden) render();
      renderBanner();
    },
    // La partida acabó (o volvió al lobby): sin menú ni aviso.
    reset() { server = { by: null, left: 0 }; if (!lobbyMode) close(false); banner.hidden = true; },
    // Cambio de fase: el menú de la partida se cierra al acabar; el de la sala de espera, al empezar la partida.
    phase(state) { if (state !== 'PLAYING') this.reset(); if (state !== 'LOBBY' && lobbyMode) close(false); },
  };
}
