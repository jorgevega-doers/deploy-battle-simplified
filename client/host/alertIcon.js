// Icono de alerta en pixel art (triángulo ámbar con "!", 9 x 8) y la cajita de aviso que lo lleva.
// Lo usan los avisos de "¿el mando no va bien? mantén un botón 4 s" (controles, configuración del mando, inicio).
const ROWS = [
  '....#....',
  '...###...',
  '...#.#...',
  '..##.##..',
  '..##.##..',
  '.#######.',
  '.###.###.',
  '#########',
];
let rects = '';
ROWS.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));

export const ALERT_ICON = `<svg class="alert-ico" viewBox="0 0 9 8" shape-rendering="crispEdges" fill="#ffd400" aria-hidden="true">${rects}</svg>`;

// Aviso encapsulado: <p class="alert-box">ICONO texto</p>. text NUNCA lleva datos de fuera (va como HTML).
export const alertBox = (text, extraClass = '') => `<p class="alert-box ${extraClass}">${ALERT_ICON}<span>${text}</span></p>`;
