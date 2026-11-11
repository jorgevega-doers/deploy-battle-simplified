// Corazón de píxeles (9 x 8) con contorno oscuro y brillo, como SVG: lleno = vida, apagado = vida perdida.
// Lo usan las fichas de jugador (main.js) y la animación de vida perdida (arcadeText.js). O = contorno, F = relleno, H = brillo.
const HEART = ['.OO...OO.', 'OFFO.OFFO', 'OHFFOFFFO', 'OFFFFFFFO', '.OFFFFFO.', '..OFFFO..', '...OFO...', '....O....'];

export function heartSvg(full, extraClass = '') {
  const colors = full ? { O: '#05070d', F: '#ff4f6e', H: '#ffb3c4' } : { O: '#05070d', F: '#262d45', H: '#262d45' };
  let rects = '';
  HEART.forEach((row, y) => [...row].forEach((c, x) => { if (colors[c]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[c]}"/>`; }));
  return `<svg class="heart${extraClass}" viewBox="0 0 9 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
export const HEART_FULL = heartSvg(true);
export const HEART_EMPTY = heartSvg(false);
export const HEART_LOST = heartSvg(false, ' lost'); // el que se acaba de apagar: arcade.css lo anima
