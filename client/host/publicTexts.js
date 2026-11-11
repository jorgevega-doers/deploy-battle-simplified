// Textos de la pantalla del juego en la versión pública (6-nov): tono cercano y divertido, "tú" al jugador y "vosotros" al grupo; los gritos de
// juego (SCAN TO JOIN, GO!, GAME OVER) siguen en inglés. El HTML lo comparte el stand, así que aquí solo se cambian en las salas públicas.
// Qué NO hace: no toca los textos del stand ni los de las animaciones (K.O., WINS...).

export const PUBLIC_TEXT = {
  waitingReady: 'CUANDO ESTÉIS TODOS: LISTO EN EL MÓVIL O START EN EL MANDO',
  freeSlot: 'LIBRE · ESCANEA EL QR O START',
  invite: 'COPIA EL ENLACE E INVITA',
  inviteCopied: '¡COPIADO! PÁSALO',
  hostYou: 'AQUÍ MANDAS TÚ: ELIGE MAPA Y DIFICULTAD',
  hostOther: 'MAPA Y DIFICULTAD: LOS ELIGE QUIEN CREÓ LA SALA',
  roomGone: 'ESTA SALA YA NO EXISTE. CREAR OTRA ES UN SEGUNDO',
  roomBusy: 'ESTA SALA ESTÁ A TOPE',
  roomFailed: 'NO HEMOS PODIDO ENTRAR EN LA SALA',
  screenFailed: 'NO HEMOS PODIDO ABRIR ESTA PANTALLA',
  noRooms: 'AHORA MISMO NO QUEDAN SALAS LIBRES. PRUEBA EN UN RATO',
  newRoomFailed: 'NO HEMOS PODIDO CREAR LA SALA NUEVA',
  offline: 'NO HAY CONEXIÓN CON EL SERVIDOR',
  rankingTitle: 'TOP 10 DE LA SEMANA', // contra los bots: lo dice la frase de debajo
};

// Textos fijos del HTML (lobby, tutorial y columna lateral). Se aplican una vez al abrir la sala.
const STATIC = [
  ['#press-start .ps-text', 'PULSA PARA EMPEZAR'],
  ['#press-start .ps-sub', 'HAZ CLIC O PULSA UNA TECLA'],
  ['#lobby-qr > .ui-title', 'ESCANEA Y ENTRA'],
  ['#pad-hint', '¿TENÉIS MANDO? ENCHUFADLO Y PULSA START'],
  ['#top10-note', '¿TE ATREVES? TÚ SOLO VS 3 BOTS'],
  ['#side-wins-box .ui-title', 'PODIO DE LA SALA'],
  ['#wait-title', 'LA PARTIDA EMPIEZA EN'],
  ['#wait-tutorial > .ui-title', 'ASÍ SE JUEGA'],
  ['#invite-btn', 'COPIA EL ENLACE E INVITA'],
];
// Los controles de ASÍ SE JUEGA los pone controlsCard.js (según lo que se use en la partida).
const RULES = ['LAS BALAS REBOTAN: ÚSALO', 'CADA GOLPE, UNA VIDA MENOS', 'PILLA LOS POWER-UPS', 'EL ÚLTIMO EN PIE GANA'];

// El logo de DOERS lleva a su web (en otra pestaña: la partida sigue en esta). Lo comparten la pantalla del juego y el mando.
export function linkDoersLogo(img) {
  if (!img || img.parentElement?.tagName === 'A') return;
  const a = document.createElement('a');
  a.href = 'https://doersdf.com/es';
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = 'Conoce DOERS DF';
  a.style.lineHeight = '0';
  img.replaceWith(a);
  a.appendChild(img);
}

export function applyPublicTexts() {
  for (const [selector, text] of STATIC) { const el = document.querySelector(selector); if (el) el.textContent = text; }
  document.querySelectorAll('#wait-tutorial .tut-rules span').forEach((el, i) => { if (RULES[i]) el.textContent = RULES[i]; });
}
