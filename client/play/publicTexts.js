// Textos del mando en la versión pública (6-nov): tono cercano y divertido ("tú" al jugador, "vosotros" al grupo). El HTML lo comparte el stand,
// así que solo se cambian en las salas públicas. Qué NO hace: no toca los textos del stand ni los gritos de juego (K.O., WINS...).

import { linkDoersLogo } from '../host/publicTexts.js';

export const PLAY_TEXT = {
  joinTitle: '¿CÓMO TE LLAMAS?',
  soloHint: '¿TÚ SOLO CONTRA 3 BOTS? PULSA LISTO Y A POR ELLOS',
  readyHint: 'PULSA LISTO CUANDO ESTÉIS',
  aloneHint: 'PULSA LISTO O ESPERA A QUE ENTRE MÁS GENTE',
  waitOthers: 'ESPERANDO AL RESTO... (PULSA OTRA VEZ SI NO ESTÁS)',
  cancelOnly: 'PULSA OTRA VEZ SI AL FINAL NO ESTÁS',
  countdown: 'CANCELA SI AÚN NO ESTÁS',
  won: '¡HAS GANADO!',
  lost: 'ESTA VEZ NO...',
  draw: 'EMPATE',
  rematch: '¿REVANCHA? EN NADA PODÉIS JUGAR OTRA',
};

const STATIC = [
  ['.field-initials > span', '3 LETRAS PARA QUE TE RECONOZCAN'],
  ['#join-btn', 'ENTRAR'],
  ['#view-slot > .ui-tab', '¡DENTRO!'],
  ['#view-full > .ui-tab', '¡ESTÁ A TOPE!'],
  ['#view-full > p', 'YA HAY 4 DENTRO O LA PARTIDA HA EMPEZADO. PRUEBA EN UN RATO.'],
  ['#retry-btn', 'PROBAR OTRA VEZ'],
  ['#view-ready > .ui-tab', '¡PREPÁRATE!'],
  ['#view-over > .ui-tab', '¿QUÉ TAL HA IDO?'],
];

export function applyPlayTexts() {
  for (const [selector, text] of STATIC) { const el = document.querySelector(selector); if (el) el.textContent = text; }
  linkDoersLogo(document.querySelector('#brand .doers-logo')); // el logo de DOERS lleva a su web (otra pestaña)
}
