// Cartel parpadeante tipo "INSERT COIN" de las recreativas (referencia: docs/referencias/insertcoin/). Copia su fuente: letras de 7 de alto con
// trazos de 2 píxeles (la I y la T, de 6 de ancho), 1 columna de separación, y una banda de color por fila de rojo a azul (bandas duras, sin
// degradado), medidas sobre la propia referencia; con un reborde negro de COIN_PAD píxeles. Qué NO hace: no decide cuándo se ve (lobby.css: solo en el HOME).
const GLYPHS = {
  S: ['.####..', '##..##.', '##.....', '.#####.', '.....##', '##...##', '.#####.'],
  C: ['..####.', '.##..##', '##.....', '##.....', '##.....', '.##..##', '..####.'],
  A: ['..###..', '.##.##.', '##...##', '##...##', '#######', '##...##', '##...##'],
  N: ['##...##', '###..##', '####.##', '#######', '##.####', '##..###', '##...##'],
  Q: ['.#####.', '##...##', '##...##', '##...##', '##.####', '##..##.', '.###.##'],
  R: ['######.', '##...##', '##...##', '##..###', '#####..', '##.###.', '##..###'],
  O: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##..##.', '#####..'],
  E: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  I: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  J: ['..#####', '....##.', '....##.', '....##.', '##..##.', '##..##.', '.####..'],
};
const BANDS = ['#d43534', '#f47f2e', '#ecA01a', '#cfb503', '#daff23', '#30f332', '#0681d2']; // fila 0 (arriba) a 6
const SPACE = 4; // ancho de un espacio entre palabras
export const COIN_ROWS = 7;
export const COIN_PAD = 1; // píxeles de borde negro alrededor de las letras (el SVG los incluye)

// Posición (columna) de cada letra y ancho total del texto.
function layout(text) {
  let x = 0;
  const letters = [];
  for (const ch of text) {
    if (ch === ' ') { x += SPACE; continue; }
    const rows = GLYPHS[ch] || [];
    letters.push({ rows, x });
    x += (rows[0]?.length ?? 0) + 1;
  }
  return { letters, cols: Math.max(0, x - 1) };
}
export const coinCols = (text) => layout(text).cols;

export function insertCoinSvg(text) {
  const { letters, cols } = layout(text);
  const lit = [];
  for (const { rows, x } of letters) rows.forEach((row, y) => [...row].forEach((c, i) => { if (c === '#') lit.push([x + i, y]); }));
  // Borde negro: cada píxel encendido pinta de negro los de alrededor (a COIN_PAD de distancia, también en diagonal) y las letras van encima.
  const edge = new Set();
  for (const [x, y] of lit) for (let dy = -COIN_PAD; dy <= COIN_PAD; dy++) for (let dx = -COIN_PAD; dx <= COIN_PAD; dx++) edge.add(`${x + dx},${y + dy}`);
  let cells = '';
  for (const key of edge) { const [x, y] = key.split(',').map(Number); cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="#000"/>`; }
  for (const [x, y] of lit) cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${BANDS[y]}"/>`;
  return `<svg viewBox="${-COIN_PAD} ${-COIN_PAD} ${cols + 2 * COIN_PAD} ${COIN_ROWS + 2 * COIN_PAD}" width="100%" height="100%" shape-rendering="crispEdges" aria-hidden="true">${cells}</svg>`;
}
