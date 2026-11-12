// Tarjeta "ASÍ SE JUEGA" de la sala de espera: los controles de lo que estás usando ahora (teclado y ratón, o el mando del PC), sus 3 pasos en
// grande y a todo el ancho, con una frase debajo. Los dibujos de las teclas y el ratón se copian una vez de la tarjeta del HTML.
// Qué NO hace: no decide qué controles tocan (main.js: updateControls) ni lee los mandos.

import { alertBox } from './alertIcon.js';

// Siempre que salen los controles del mando: cómo arreglarlo si va mal (padSetup.js: mantener cualquier botón 4 s fuera de la partida).
const PAD_FIX = '¿EL MANDO NO VA BIEN? MANTÉN UN BOTÓN 4 S PARA CONFIGURARLO';
const key = (text, wide = false) => `<span class="key${wide ? ' wide' : ''}">${text}</span>`;

export function createControlsCard({ $ }) {
  const card = $('wait-tutorial');
  const cols = card.querySelector('.tut-cols');
  const take = (selector) => card.querySelector(selector)?.outerHTML ?? '';
  const art = {
    keyboard: [take('.kwasd'), take('.kmouse'), take('.kspace')],
    pad: [`<div class="kviz kpad">${key('L')}</div>`, `<div class="kviz kpad">${key('R1')}${key('RB')}</div>`, `<div class="kviz kpad">${key('L1')}${key('LB')}</div>`],
  };
  // Letras de teclas dentro del texto: encapsuladas (.kc) para que no se mezclen con las palabras de al lado (la O de "W A S D O LAS FLECHAS").
  const kc = (text) => `<i class="kc">${text}</i>`;
  const TEXT = {
    keyboard: [['MUEVE', `${['W', 'A', 'S', 'D'].map(kc).join('')} O LAS FLECHAS`], ['DISPARA', 'APUNTA CON EL RATÓN<br>CLIC: DISPARA · MANTÉN EL CLIC: DISPARO CONTINUO'], ['ACELERÓN', `PULSA ${kc('ESPACIO')}: UN ACELERÓN PARA ESQUIVAR`]],
    pad: [['MUEVE', 'STICK IZQUIERDO'], ['DISPARA', `APUNTA CON EL STICK DERECHO · ${kc('R1')} (${kc('RB')}) DISPARA`], ['ACELERÓN', `PULSA ${kc('L1')} (${kc('LB')}): UN ACELERÓN PARA ESQUIVAR`]],
  };
  card.classList.add('cc-card');
  let shown = '';

  // sets: ['keyboard'] o ['pad']; note: frase de debajo (o '').
  function set({ sets, note = '' }) {
    const id = `${sets.join('+')}|${note}`;
    if (id === shown) return;
    shown = id;
    cols.innerHTML = sets.map((kind) => `
      <div class="cc-set cc-${kind}">
        ${TEXT[kind].map(([title, text], i) => `<div class="tut cc-row"><div class="cc-viz">${art[kind][i]}</div><b>${i + 1} · ${title}</b><span>${text}</span></div>`).join('')}
        ${kind === 'pad' ? alertBox(PAD_FIX, 'cc-padfix') : ''}
      </div>`).join('') + (note ? `<p class="cc-note">${note}</p>` : '');
  }
  return { set };
}
