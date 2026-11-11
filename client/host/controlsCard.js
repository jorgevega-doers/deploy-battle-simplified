// Tarjeta "ASÍ SE JUEGA" de la versión pública (10-nov): enseña los controles de lo que se usa en ESTA partida, siempre con el mismo tamaño.
//  - Un solo tipo de control (teclado y ratón, móvil o mando): sus 3 pasos en grande, a todo el ancho.
//  - Dos (p. ej. teclado + un mando conectado, o móviles + mandos en la pantalla compartida): mitad y mitad, los 3 pasos de cada uno en pequeño.
// Los dibujos (pads del móvil, teclas, ratón, mando) se copian una vez de la tarjeta del HTML, que es la que usa el stand tal cual.
// Qué NO hace: no decide qué controles tocan (main.js: updateControls) ni lee los mandos.

import { alertBox } from './alertIcon.js';

const NAMES = { keyboard: 'TECLADO Y RATÓN', phone: 'MÓVIL', pad: 'MANDO' };
// Siempre que salen los controles del mando: cómo arreglarlo si va mal (padSetup.js: mantener cualquier botón 4 s fuera de la partida).
const PAD_FIX = '¿EL MANDO NO VA BIEN? MANTÉN UN BOTÓN 4 S PARA CONFIGURARLO';
const key = (text, wide = false) => `<span class="key${wide ? ' wide' : ''}">${text}</span>`;

export function createControlsCard({ $ }) {
  const card = $('wait-tutorial');
  const cols = card.querySelector('.tut-cols');
  const take = (selector) => card.querySelector(selector)?.outerHTML ?? '';
  const art = {
    phone: [take('.mmove'), take('.maim'), take('.mbtn')],
    keyboard: [take('.kwasd'), take('.kmouse'), take('.kspace')],
    pad: [`<div class="kviz kpad">${key('L')}</div>`, `<div class="kviz kpad">${key('R1')}${key('RB')}</div>`, `<div class="kviz kpad">${key('L1')}${key('LB')}</div>`],
  };
  const padIcon = take('.mgamepad');
  // Letras de teclas dentro del texto: encapsuladas (.kc) para que no se mezclen con las palabras de al lado (la O de "W A S D O LAS FLECHAS").
  const kc = (text) => `<i class="kc">${text}</i>`;
  const TEXT = {
    keyboard: [['MUEVE', `${['W', 'A', 'S', 'D'].map(kc).join('')} O LAS FLECHAS`], ['DISPARA', 'APUNTA CON EL RATÓN<br>CLIC: DISPARA · MANTÉN EL CLIC: DISPARO CONTINUO'], ['ACELERÓN', `PULSA ${kc('ESPACIO')}: UN ACELERÓN PARA ESQUIVAR`]],
    phone: [['MUEVE', 'DESLIZA EL DEDO POR EL PAD IZQUIERDO'], ['DISPARA', 'APUNTA CON EL PAD DERECHO Y SUELTA (O TOCA)'], ['ACELERÓN', 'PULSA EL BOTÓN GRANDE: UN ACELERÓN PARA ESQUIVAR']],
    pad: [['MUEVE', 'STICK IZQUIERDO'], ['DISPARA', `APUNTA CON EL STICK DERECHO · ${kc('R1')} (${kc('RB')}) DISPARA`], ['ACELERÓN', `PULSA ${kc('L1')} (${kc('LB')}): UN ACELERÓN PARA ESQUIVAR`]],
  };
  card.classList.add('cc-card');
  let shown = '';

  // sets: 1 o 2 de 'keyboard' | 'phone' | 'pad'; note: frase de debajo (o ''); active: el que se está usando ahora (se resalta), o null.
  function set({ sets, note = '', active = null }) {
    const id = `${sets.join('+')}|${note}|${active}`;
    if (id === shown) return;
    shown = id;
    cols.classList.toggle('cc-two', sets.length > 1);
    cols.innerHTML = sets.map((kind) => `
      <div class="cc-set cc-${kind}${active === kind ? ' on' : ''}">
        ${sets.length > 1 ? `<div class="cc-head">${kind === 'pad' ? padIcon : ''}<span>${NAMES[kind]}</span>${active === kind ? '<em>AHORA</em>' : ''}</div>` : ''}
        ${TEXT[kind].map(([title, text], i) => `<div class="tut cc-row"><div class="cc-viz">${art[kind][i]}</div><b>${i + 1} · ${title}</b><span>${text}</span></div>`).join('')}
        ${kind === 'pad' ? alertBox(PAD_FIX, 'cc-padfix') : ''}
      </div>`).join('') + (note ? `<p class="cc-note">${note}</p>` : '');
  }
  return { set };
}
