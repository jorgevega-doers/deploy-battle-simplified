// Coronita de pixel art (7 x 5, ámbar) que marca al anfitrión de la sala: junto a su nombre y en la columna de mapa y dificultad.
const ROWS = ['#..#..#', '##.#.##', '#######', '#######', '.#####.'];
let rects = '';
ROWS.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));

export const CROWN = `<svg class="crown" viewBox="0 0 7 5" shape-rendering="crispEdges" fill="#ffd400" aria-label="Anfitrión" role="img">${rects}</svg>`;
