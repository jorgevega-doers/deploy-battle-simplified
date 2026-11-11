// Letras "arcade" de píxeles para la cuenta atrás, el inicio de partida, K.O. y GAME OVER, y la tira de vidas que se anima
// al perder una. Cada letra de la fuente 5 x 7 (shared/art/font.js) es un SVG de píxeles con bandas de luz (arriba clara,
// abajo oscura; bandas duras, no degradado), sobre un fondo plano oscuro y translúcido que las separa de la ciudad sin
// tapar el juego. Sin sombra ni contorno: así las letras quedan simétricas y bien centradas.
// Qué NO hace: no decide cuándo se enseña cada texto (eso lo hacen juice.js, finale.js y roundFx.js).
import { glyphRows, GLYPH_W, GLYPH_H } from '../../shared/art/font.js';
import { heartSvg } from './hearts.js';

// Temas de color (solo paleta de marca y sus acentos).
export const THEMES = {
  white: { fill: '#ffffff', light: '#ffffff', shade: '#a9b4dc' },
  amber: { fill: '#ffd400', light: '#fff1a0', shade: '#ff9a00' },
  pink: { fill: '#ff4fa3', light: '#ffc4e0', shade: '#c0206f' },
  blue: { fill: '#6f8cff', light: '#d3dcff', shade: '#3a4fd0' },
  cyan: { fill: '#00f0ff', light: '#c4fcff', shade: '#0097c4' },
};

// El punto de la fuente es de 1 píxel y a este tamaño casi no se ve: aquí se dibuja de 2 x 2 en una celda estrecha de 2 columnas.
const BIG_DOT = ['..', '..', '..', '..', '..', '##', '##'];
export const letterCols = (ch) => (ch === '.' ? BIG_DOT[0].length : GLYPH_W);

// Píxeles encendidos de una letra: lista [x, y].
export function letterPixels(ch) {
  const rows = ch === '.' ? BIG_DOT : glyphRows(ch);
  const cells = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') cells.push([x, y]); }));
  return cells;
}

const rects = (cells, fill) => `<g fill="${fill}">${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`).join('')}</g>`;

// SVG de una letra (cadena): el cuerpo en tres bandas (clara, color, oscura).
export function letterSvg(ch, theme = THEMES.white) {
  const body = letterPixels(ch);
  const top = body.filter(([, y]) => y <= 1);
  const low = body.filter(([, y]) => y >= GLYPH_H - 2);
  const mid = body.filter(([, y]) => y > 1 && y < GLYPH_H - 2);
  return `<svg viewBox="0 0 ${letterCols(ch)} ${GLYPH_H}" shape-rendering="crispEdges" aria-hidden="true">${rects(low, theme.shade) + rects(mid, theme.fill) + rects(top, theme.light)}</svg>`;
}

// Opciones comunes: size (múltiplo de la unidad de pantalla), hold (ms), x / y (posición en % de la pantalla),
// enter: 'slam' (cae desde arriba), 'left' / 'right' (entra desde un lado), shake (sacudida al caer).
export function createArcadeText(layer) {
  const lines = new Set();
  function remove(line) { line.remove(); lines.delete(line); }
  function mount(line, { size = 1, hold = 1200, x = 50, y = 50, enter = 'slam', shake = false }, enterMs, label) {
    line.classList.add('arcade-line', `enter-${enter}`);
    if (shake) line.classList.add('shake');
    line.style.setProperty('--size', String(size));
    line.style.setProperty('--x', `${x}%`);
    line.style.setProperty('--y', `${y}%`);
    line.setAttribute('role', 'img');
    line.setAttribute('aria-label', label);
    layer.appendChild(line);
    lines.add(line);
    setTimeout(() => line.classList.add('out'), hold + enterMs);
    setTimeout(() => remove(line), hold + enterMs + 330);
    return line;
  }
  return {
    // Una línea de letras: entra, se queda "hold" ms y sale sola.
    show(text, { theme = THEMES.white, ...opts } = {}) {
      const line = document.createElement('div');
      [...text].forEach((ch, i) => {
        const letter = document.createElement('span');
        letter.className = 'al';
        letter.style.setProperty('--i', String(i));
        letter.style.setProperty('--cols', String(letterCols(ch)));
        letter.innerHTML = letterSvg(ch, theme);
        line.appendChild(letter);
      });
      return mount(line, opts, 380 + text.length * 40, text);
    },
    // Tira de corazones: se ven las vidas que tenía (full) de un total (max) y la última se rompe y se apaga (breakIndex).
    showLives({ max, full, breakIndex }, opts = {}) {
      const line = document.createElement('div');
      line.classList.add('life-strip');
      for (let i = 0; i < max; i++) {
        const slot = document.createElement('span');
        slot.className = 'life';
        slot.innerHTML = heartSvg(false) + (i < full ? heartSvg(true, i === breakIndex ? ' breaking' : '') : '');
        line.appendChild(slot);
      }
      return mount(line, opts, 450, 'vida perdida');
    },
    // Quita todo al momento (reinicio de la partida).
    clear() { for (const line of [...lines]) remove(line); },
  };
}
