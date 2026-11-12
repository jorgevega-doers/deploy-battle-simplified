// Nombre e icono de píxeles de cada power-up, para las fichas del marcador.
export const POWERUP_NAMES = { double: 'DOBLE DISPARO', speed: 'VELOCIDAD', aoe: 'EXPLOSIÓN', shield: 'ESCUDO' };
// Iconos de 7 x 7 ('#' = color del power-up, que lo da el CSS con currentColor): dos balas, doble flecha y estallido.
const POWERUP_PIXELS = {
  double: ['.#...#.', '###.###', '###.###', '###.###', '###.###', '###.###', '###.###'],
  speed: ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
  aoe: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  shield: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
};
const pixelIcon = (rows) => {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg class="fx-icon" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
};
export const POWERUP_ICONS = Object.fromEntries(Object.entries(POWERUP_PIXELS).map(([kind, rows]) => [kind, pixelIcon(rows)]));
