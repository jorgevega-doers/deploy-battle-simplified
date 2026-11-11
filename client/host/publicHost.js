// Lobby de la versión pública (6-nov): lo que la pantalla de una sala tiene de más respecto al stand.
//  - Quién es la ANFITRIONA (la pantalla que creó la sala): solo ella elige mapa y dificultad (columna a la derecha de la tarjeta del QR).
//    En la partida pública no hay anfitrión: cada pantalla VOTA (por defecto aleatorio y MEDIA; empate, al azar) y se ve cuántos votos lleva cada opción.
//  - Ranking global del 1 contra 3 bots: solo el de ESTA SEMANA (10-nov: ni diario ni histórico).
//  - Marcador de la sala: victorias de cada jugador mientras dura la sala.
// Qué NO hace: no habla con el servidor más que para elegir mapa y dificultad (el resto lo pinta main.js).
import { EVENTS } from '../../shared/events.js';
import { createMapPicker } from './mapPicker.js';
import { PUBLIC_TEXT, applyPublicTexts, linkDoersLogo } from './publicTexts.js';
import { CROWN } from './crown.js';

const LEVELS = [['stand', 'FÁCIL'], ['media', 'MEDIA'], ['pro', 'PRO']];

export function createPublicHost({ $, socket, screenId, onLayout = () => {} }) {
  document.body.classList.add('public');
  $('public-side').hidden = false;
  applyPublicTexts(); // textos de la versión pública (el HTML lo comparte el stand)
  linkDoersLogo(document.querySelector('#topbar .doers-logo'));
  let lobby = null;
  let isHost = false;
  let voting = false; // partida pública: mapa y dificultad por votación
  const myVote = { map: null, level: null };
  const canPick = () => isHost || voting;

  // Mapa (4 cuadros en columna) y dificultad: botones de verdad solo para la anfitriona.
  const updateMap = createMapPicker($('side-maps'), (choice) => { if (!canPick()) return; if (voting) myVote.map = choice; socket.emit(EVENTS.MAP_SELECT, { choice }); });
  const levelButtons = new Map();
  for (const [level, label] of LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-tab side-level';
    b.innerHTML = `<span>${label}</span><span class="votes"></span>`;
    b.addEventListener('click', (event) => { event.currentTarget.blur(); if (!canPick()) return; if (voting) myVote.level = level; socket.emit(EVENTS.DIFFICULTY_SET, { level }); });
    $('side-levels').appendChild(b);
    levelButtons.set(level, b);
  }

  // --- Ranking de la semana ---
  let week = [];
  function renderRanking() {
    $('top10-tab').textContent = lobby?.room?.dev ? `${PUBLIC_TEXT.rankingTitle} · DEV` : PUBLIC_TEXT.rankingTitle;
    $('top10-period').hidden = true; // el título ya dice que es de la semana
    const list = $('top10-list');
    list.replaceChildren();
    const rows = week;
    // Siempre 10 filas (las vacías con "---"): la tarjeta mide y se ve igual con ranking o sin él.
    for (let index = 0; index < 10; index++) { // textContent: nunca HTML con datos que vienen de fuera
      const entry = rows[index];
      const row = document.createElement('li');
      if (!entry) row.className = 'free';
      const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = String(index + 1);
      const name = document.createElement('span'); name.textContent = entry ? entry.initials : '---';
      const score = document.createElement('span'); score.className = 'score'; score.textContent = entry ? String(entry.score) : '-';
      row.append(pos, name, score);
      list.appendChild(row);
    }
  }

  // --- Marcador de la sala ---
  // Podio de la sala (debajo del ranking, en fucsia): siempre 3 filas (vacías con "---" hasta que alguien gane), para que la tarjeta mida y se vea igual.
  function renderWins(wins = []) {
    const list = $('side-wins');
    list.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const entry = wins[i];
      const row = document.createElement('li');
      if (!entry) row.className = 'free';
      const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = String(i + 1);
      const who = document.createElement('span'); who.textContent = entry ? entry.name : '---';
      const count = document.createElement('span'); count.className = 'score'; count.textContent = entry ? `${entry.wins} ${entry.wins === 1 ? 'VICTORIA' : 'VICTORIAS'}` : '-';
      row.append(pos, who, count);
      list.appendChild(row);
    }
  }

  // Cabecera de la columna: quién elige. Partida pública: se vota. Sala privada: el anfitrión (con su corona). Solo y 1 pantalla: nada (ya es tuya).
  function sideHead(data, room) {
    const head = $('side-host');
    let html = '';
    if (voting) html = 'VOTAD · EMPATE: AL AZAR';
    else if (room.type === 'quick' && !room.solo) { // sala privada (quien la creó) o partida pública (quien llegó primero)
      const slot = (data.screens ?? []).findIndex((s) => s && s === room.hostScreen);
      const name = slot >= 0 ? data.initials?.[slot] : null;
      html = isHost ? `${CROWN} ERES EL ANFITRIÓN` : `${CROWN} ELIGE ${name ?? 'EL ANFITRIÓN'}`;
    }
    if (head.innerHTML !== html) head.innerHTML = html;
    head.hidden = !html;
  }

  // Con mando (10-nov): ←→ cambia el mapa y ↑↓ la dificultad, un paso cada pulsación (en círculo). Solo si esta pantalla puede elegir.
  const MAP_ORDER = ['random', 0, 1, 2];
  const LEVEL_ORDER = LEVELS.map(([level]) => level);
  function step(dir) {
    if (!canPick() || !lobby || lobby.state !== 'LOBBY') return;
    if (dir === 'left' || dir === 'right') {
      const i = MAP_ORDER.indexOf(lobby.mapChoice ?? 'random');
      const choice = MAP_ORDER[(Math.max(0, i) + (dir === 'right' ? 1 : MAP_ORDER.length - 1)) % MAP_ORDER.length];
      if (voting) myVote.map = choice;
      socket.emit(EVENTS.MAP_SELECT, { choice });
    } else {
      const i = LEVEL_ORDER.indexOf(lobby.difficulty ?? 'media');
      const level = LEVEL_ORDER[(Math.max(0, i) + (dir === 'down' ? 1 : LEVEL_ORDER.length - 1)) % LEVEL_ORDER.length];
      if (voting) myVote.level = level;
      socket.emit(EVENTS.DIFFICULTY_SET, { level });
    }
  }
  // Línea de ayuda en la columna: solo si hay un mando y esta pantalla puede elegir.
  // En los propios títulos (MAPA ←→ · DIFICULTAD ↑↓): una línea aparte no cabía en la columna (mide lo mismo que la tarjeta del QR).
  const sideTitles = [...$('public-side').querySelectorAll(':scope > .ui-title')];
  function padHelp() {
    const show = canPick(); // con las flechas del teclado o la cruceta del mando: siempre que esta pantalla puede elegir
    $('side-pad').hidden = true;
    const [mapTitle, levelTitle] = sideTitles;
    const mapText = show ? 'MAPA ←→' : 'MAPA';
    const levelText = show ? 'DIFICULTAD ↑↓' : 'DIFICULTAD';
    if (mapTitle && mapTitle.textContent !== mapText) mapTitle.textContent = mapText;
    if (levelTitle && levelTitle.textContent !== levelText) levelTitle.textContent = levelText;
  }
  addEventListener('gamepadconnected', () => padHelp());
  addEventListener('gamepaddisconnected', () => padHelp());

  return {
    step,
    get isHost() { return isHost; },
    update(data) {
      lobby = data;
      const room = data.room ?? {};
      voting = Boolean(room.votes); // sala sin anfitrión: se vota (hoy ninguna; la pública tiene anfitrión: quien llegó primero)
      isHost = !voting && room.hostScreen === screenId;
      $('public-side').hidden = false;
      document.body.classList.toggle('no-side', false);
      document.body.classList.toggle('is-host', isHost);
      $('host-line').textContent = ''; // quién manda se dice en la propia columna (sideHead)
      sideHead(data, room);
      updateMap(data.mapChoice, data.map);
      for (const [level, b] of levelButtons) {
        b.classList.toggle('danger', level === data.difficulty); b.classList.toggle('checked', level === data.difficulty);
        b.classList.toggle('mine', voting && myVote.level === level);
        const n = voting ? room.votes?.level?.[level] ?? 0 : 0;
        b.querySelector('.votes').textContent = n ? `·${n}` : '';
      }
      for (const opt of $('side-maps').querySelectorAll('.map-opt')) {
        const value = opt.dataset.choice === 'random' ? 'random' : Number(opt.dataset.choice);
        const n = voting ? room.votes?.map?.[opt.dataset.choice] ?? 0 : 0;
        opt.dataset.votes = n ? `${n} ${n === 1 ? 'VOTO' : 'VOTOS'}` : '';
        opt.classList.toggle('mine', voting && myVote.map === value);
      }
      $('public-side').classList.toggle('locked', !canPick());
      padHelp();
      renderWins(room.wins);
      renderRanking();
      onLayout();
    },
    ranking({ periods: p, top }) { week = p?.week ?? top ?? []; renderRanking(); },
    // Tanques de los jugadores de esta pantalla (en una sala a distancia; con una sola pantalla no hace falta marcar nada).
    mineFlags(data) {
      if (data.room?.type !== 'online' && data.room?.type !== 'quick') return []; // con una sola pantalla para todos no hace falta marcar nada
      return (data.screens ?? []).map((s) => s === screenId);
    },
  };
}
