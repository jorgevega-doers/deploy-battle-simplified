// Sala de espera de la versión arcade (11-nov). Lo mínimo: quién está, un botón y los controles (controlsCard.js, debajo). No hay LISTO.
//  - Un solo botón: solo en la sala, JUGAR CON BOTS; con más gente, JUGAR. Lo pulsa UNA persona y empieza una cuenta atrás de 10 s: al llegar a 0
//    empieza la partida con quien haya (contra 3 bots si estás solo). No hace falta que todos pulsen nada.
//  - Con la cuenta atrás en marcha el botón es CANCELAR (cualquiera la cancela; el servidor limita cuántas veces por jugador). Si entra alguien,
//    vuelve a 10 s y se añade a la partida (lo hace el servidor: session.js, anyStart).
//  - Tras cada partida hay que volver a pulsar JUGAR (nada arranca solo).
//  - SALIR (debajo de las tarjetas, o ESC) vuelve al título. Inactividad: sin tocar nada 90 s fuera, salvo con la cuenta atrás en marcha o esperando
//    rivales a solas en la sala pública (ahí no bloqueas a nadie). En tu sala privada contra bots sí cuenta (ocupa una sala del servidor).
// onLeave(nota) sale al título (main.js: avisa al servidor y goHome). Qué NO hace: no pinta la lista de jugadores (main.js: renderWaiting) ni manda los controles (keyboardPlayer.js).

const IDLE_MS = 90000;          // sin tocar nada en la sala de espera: fuera (si no, una pestaña olvidada ocupa un hueco de la sala de los demás)
const WARN_MS = 15000;          // el aviso "¿SIGUES AHÍ?" sale estos últimos segundos
const IDLE_NOTE = 'TE HEMOS SACADO DE LA SALA POR INACTIVIDAD. ¿OTRA? DALE A JUGAR';

const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };

export function createArcadeLobby({ $, keyboard, onLeave }) {
  document.body.classList.add('quick'); // mismas tarjetas que la partida rápida (lobby.css)
  $('quick-actions').hidden = false;
  $('quick-bots').hidden = true;
  $('invite-btn').hidden = true;
  $('qr-bots').hidden = true;
  $('quick-ready').addEventListener('click', (event) => { event.currentTarget.blur(); keyboard.ready(); });
  $('arcade-actions').hidden = false;
  $('arcade-exit').addEventListener('click', () => onLeave());
  let leaving = false;

  let lobby = null;
  let aloneSince = null;
  let lastInput = performance.now();
  let lastState = null;
  const touch = () => { lastInput = performance.now(); };
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) addEventListener(ev, touch, { passive: true });
  // Un mando cuenta como actividad si se pulsa algo o se mueve un stick de verdad.
  const padActive = () => [...(navigator.getGamepads?.() ?? [])].some((p) => p && p.connected && (p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.5)));

  function tick(now) {
    if (!lobby || lobby.state !== 'LOBBY') { lastInput = now; return; } // en partida no cuenta (y al volver empieza de cero)
    if (padActive()) lastInput = now;
    const humans = lobby.plan?.humans ?? 1;
    const slot = keyboard.slot;
    const counting = lobby.joinLeft != null;
    const padNow = keyboard.source === 'pad';
    aloneSince = humans <= 1 ? (aloneSince ?? now) : null;
    const soloRoom = Boolean(lobby.room?.solo);
    const play = padNow ? 'START: JUGAR' : 'JUGAR';
    const playBots = padNow ? 'START: JUGAR CON BOTS' : 'JUGAR CON BOTS';
    let title; let num = ''; let sub = ''; let button;
    if (humans <= 1) {
      if (counting) { title = 'CONTRA LOS BOTS EN'; num = String(lobby.joinLeft); button = 'CANCELAR'; }
      else if (soloRoom) { title = 'TÚ CONTRA 3 BOTS'; button = playBots; }
      else {
        const s = Math.floor((now - aloneSince) / 1000);
        title = 'BUSCANDO RIVALES';
        num = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        button = playBots;
      }
    } else if (counting) { title = 'LA PARTIDA EMPIEZA EN'; num = String(lobby.joinLeft); button = 'CANCELAR'; }
    else { title = '¡HAY RIVALES!'; button = play; }
    // Inactividad: sin cuenta atrás y sin tocar nada, fuera (con aviso los últimos segundos). A solas buscando rivales en la pública no cuenta.
    if (counting || (humans <= 1 && !soloRoom)) lastInput = now;
    const idle = now - lastInput;
    let warn = false;
    if (idle >= IDLE_MS) { if (!leaving) { leaving = true; onLeave(IDLE_NOTE); } return; }
    if (idle >= IDLE_MS - WARN_MS) { sub = `¿SIGUES AHÍ? TE SACAMOS DE LA SALA EN ${Math.ceil((IDLE_MS - idle) / 1000)} S`; warn = true; }
    // Ya has cancelado las veces que se permiten (el servidor lo cuenta): el botón se apaga para que no parezca roto.
    const noCancel = counting && slot !== null && lobby.cancelsLeft?.[slot - 1] === 0;
    set($('wait-title'), title);
    set($('wait-num'), num);
    set($('wait-sub'), sub);
    $('wait-sub').classList.toggle('warn', warn);
    $('wait-num').classList.toggle('idle', !counting);
    $('wait-num').classList.toggle('tick', counting);
    $('wait-num').classList.remove('code');
    set($('quick-ready'), noCancel ? 'YA NO SE PUEDE CANCELAR' : button);
    $('quick-ready').disabled = noCancel;
    $('quick-ready').hidden = false;
    $('quick-ready').classList.toggle('cancel', counting);
    $('quick-actions').hidden = false;
    $('wait-count').classList.add('with-actions');
    $('wait-count').classList.remove('only-num');
  }

  return {
    tick,
    update(data) {
      if (data.state === 'LOBBY' && lastState !== 'LOBBY') lastInput = performance.now(); // vuelta de una partida: el reloj de inactividad empieza de cero
      lastState = data.state;
      lobby = data;
    },
  };
}
