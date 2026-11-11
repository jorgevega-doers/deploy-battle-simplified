// Sala de espera de las partidas en tu pantalla (versión pública, 10-nov): SOLO, BUSCAR PARTIDA (pública) y SALA PRIVADA. Usa la misma pantalla de
// espera del lobby (jugadores, cuenta atrás, cómo se juega, QR y ranking) con lo propio de jugar en tu ordenador:
//  - Solitario: TÚ CONTRA 3 BOTS y ESTOY LISTO. 5 s de cuenta atrás.
//  - Pública: solo, BUSCANDO JUGADORES con el reloj y, a los 10 s, JUGAR CON BOTS; con gente arranca sola (15 s, vuelve a 15 si entra alguien).
//  - Privada: ESPERANDO A TUS AMIGOS con el código en grande y JUGAR CON BOTS; con gente, LISTO (10 s cuando todos lo están).
//  - El QR es el de TU jugador (relevo al móvil). Los controles de "Así se juega" los pone controlsCard.js.
// Qué NO hace: no manda los controles (keyboardPlayer.js) ni pinta el resto del lobby (main.js).
import QRCode from 'qrcode';
import { bindLink } from '../roomSocket.js';

const BOTS_AFTER_MS = 10000; // = config.game.quickBotsAfterS

const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };

export function createQuickLobby({ $, keyboard, token }) {
  document.body.classList.add('quick');
  $('quick-actions').hidden = false;
  let lobby = null;
  let aloneSince = null; // desde cuándo estás solo esperando (para el reloj y el botón de los bots)
  let qrFor = '';

  // Sitio de cada botón (10-nov): JUGAR CON BOTS va debajo del QR (lo que harías mientras esperas) y COPIA EL ENLACE E INVITA, junto al código de la sala
  // (en la tarjeta de la cuenta atrás). En solitario, ESTOY LISTO es lo único que hay que hacer: se queda en la tarjeta de la cuenta atrás.
  $('quick-actions').appendChild($('invite-btn'));
  for (const id of ['quick-ready', 'quick-bots', 'qr-bots']) $(id).addEventListener('click', (event) => { event.currentTarget.blur(); keyboard.ready(); });
  $('quick-back').addEventListener('click', (event) => { event.currentTarget.blur(); keyboard.reclaim(); });


  async function drawQr() {
    const link = bindLink(token);
    if (qrFor === link) return;
    qrFor = link;
    $('qr').hidden = false;
    await QRCode.toCanvas($('qr'), link, { width: 300, margin: 1, color: { dark: '#05050c', light: '#ffffff' } });
  }

  // Cada fotograma (el reloj de "buscando" avanza aunque no llegue ningún aviso del servidor).
  function tick(now) {
    if (!lobby || lobby.state !== 'LOBBY') return;
    const room = lobby.room ?? {};
    const kind = room.solo ? 'solo' : room.private ? 'private' : 'public';
    document.body.classList.toggle('quick-solo', kind === 'solo'); // en solitario no hay podio de sala
    const humans = lobby.plan?.humans ?? 1;
    const slot = keyboard.slot;
    const mine = slot !== null && lobby.ready?.[slot - 1] === true;
    const counting = lobby.joinLeft != null;
    const phone = keyboard.mode === 'phone';
    const padNow = !phone && keyboard.source === 'pad'; // jugando con el mando del PC: LISTO es START
    aloneSince = humans <= 1 ? (aloneSince ?? now) : null;
    const waited = aloneSince === null ? 0 : now - aloneSince;
    let title; let num; let sub; let button = null; // button: null | 'bots' | 'ready'
    if (humans <= 1) {
      if (counting) { title = 'CONTRA LOS BOTS EN'; num = String(lobby.joinLeft); sub = ''; button = 'ready'; }
      else if (kind === 'solo') { title = 'TÚ CONTRA 3 BOTS'; num = ''; sub = padNow ? 'PULSA START PARA EMPEZAR' : 'BOTS ESPERANDO. ¿EMPEZAMOS?'; button = 'bots'; }
      else if (kind === 'private') { title = 'ESPERANDO A TUS AMIGOS'; num = room.code ?? '--'; sub = 'PÁSALES ESTE CÓDIGO O EL ENLACE'; button = 'bots'; }
      else {
        const s = Math.floor(waited / 1000);
        title = 'BUSCANDO JUGADORES';
        num = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        const botsReady = waited >= BOTS_AFTER_MS;
        sub = botsReady ? (padNow ? '¿NO LLEGA NADIE? PULSA START Y JUEGA CONTRA LOS BOTS' : '¿NO LLEGA NADIE? JUEGA CONTRA LOS BOTS') : 'SI ENTRA ALGUIEN, APARECE AQUÍ';
        if (botsReady) button = 'bots';
      }
    } else if (kind === 'public') { // arranca sola: sin botones
      title = 'LA PARTIDA EMPIEZA EN'; num = counting ? String(lobby.joinLeft) : '--';
      sub = humans >= 4 ? '¡SALA LLENA!' : 'SI ENTRA ALGUIEN, VUELVE A EMPEZAR';
    } else if (counting) { title = 'LA PARTIDA EMPIEZA EN'; num = String(lobby.joinLeft); sub = ''; button = 'ready'; }
    else { title = '¿ESTÁIS TODOS?'; num = ''; sub = mine ? 'ESPERANDO AL RESTO...' : padNow ? 'PULSA START CUANDO ESTÉS' : 'PULSA LISTO (O ENTER) CUANDO ESTÉS'; button = 'ready'; }
    if (phone) button = null; // con el móvil enganchado, LISTO se pulsa en el móvil
    const invite = kind === 'private' && !counting; // invitar tiene sentido mientras no ha empezado la cuenta atrás
    const soloGo = button === 'bots' && kind === 'solo'; // ESTOY LISTO (solitario) en la tarjeta de la cuenta atrás; JUGAR CON BOTS, debajo del QR
    set($('wait-title'), title);
    set($('wait-num'), num);
    set($('wait-sub'), sub);
    $('wait-num').classList.toggle('idle', !counting);
    $('wait-num').classList.toggle('tick', counting);
    $('wait-num').classList.toggle('code', kind === 'private' && humans <= 1 && !counting);
    $('quick-bots').hidden = !soloGo;
    set($('quick-bots'), padNow ? 'PULSA START PARA EMPEZAR' : 'ESTOY LISTO'); // con mando, el botón dice qué pulsar
    $('qr-bots').hidden = button !== 'bots' || soloGo;
    set($('qr-bots'), padNow ? 'START: JUGAR CON BOTS' : 'JUGAR CON BOTS');
    $('quick-ready').hidden = button !== 'ready';
    set($('quick-ready'), mine ? (padNow ? 'START PARA CANCELAR' : humans <= 1 ? 'CANCELAR' : 'CANCELAR LISTO') : padNow ? 'PULSA START PARA EMPEZAR' : 'ESTOY LISTO');
    $('quick-ready').classList.toggle('cancel', mine);
    $('invite-btn').hidden = !invite;
    const actions = soloGo || button === 'ready' || invite;
    $('quick-actions').hidden = !actions;
    $('wait-count').classList.toggle('with-actions', actions);
    // Tarjeta del QR: título, frase y botones según el caso (el lobby común los reescribe con cada aviso: aquí mandan los de esta sala).
    const banner = kind === 'solo' ? 'EN SOLITARIO' : kind === 'private' ? 'SALA PRIVADA' : 'PARTIDA PÚBLICA';
    set($('mode-banner'), banner);
    set($('lobby-qr').querySelector('.ui-title'), phone ? 'TU MÓVIL ES EL MANDO' : '¿PREFIERES USAR EL MÓVIL COMO MANDO?');
    set($('mode-hint'), phone ? 'LISTO Y LOS CONTROLES, EN TU MÓVIL' : `ESCANÉALO Y TU MÓVIL SERÁ EL MANDO DE ${keyboard.initials}`);
    $('quick-back').hidden = !phone;
  }

  return {
    tick,
    update(data) {
      lobby = data;
      const phone = keyboard.mode === 'phone';
      drawQr();
      document.body.classList.toggle('phone-linked', phone);
    },
  };
}
