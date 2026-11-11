// Iconos de píxeles de la pantalla final (globo, LinkedIn, Instagram, correo y móvil). Se calculan sobre una rejilla de
// 17 x 17 con formas sencillas (círculos, esquinas redondeadas escalonadas, rectángulos): salen simétricos y limpios,
// mucho mejores que dibujarlos a mano. Código puro: devuelve una rejilla de booleanos que main.js convierte en SVG.
export const ICON_SIZE = 17;
const C = (ICON_SIZE - 1) / 2; // centro (8)

const blank = () => Array.from({ length: ICON_SIZE }, () => Array(ICON_SIZE).fill(false));
const paint = (fn) => {
  const g = blank();
  for (let y = 0; y < ICON_SIZE; y++) for (let x = 0; x < ICON_SIZE; x++) g[y][x] = fn(x, y);
  return g;
};
// ¿Está (x, y) dentro de un rectángulo [x0, x1] x [y0, y1] con esquinas redondeadas de radio r?
function roundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0;
  const cy = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0;
  return Math.hypot(cx, cy) <= r + 0.15;
}
const box = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Globo terráqueo: círculo, ecuador, meridiano central, dos meridianos curvos y dos paralelos.
function globe() {
  return paint((x, y) => {
    const dx = x - C;
    const dy = y - C;
    const d = Math.hypot(dx, dy);
    if (d > C + 0.4) return false;
    if (d > C - 0.95) return true; // contorno de 1 píxel
    if (x === C || y === C) return true; // meridiano central y ecuador
    // paralelos (más cortos que el ancho del círculo para que no se fundan con el contorno)
    if ((y === 4 || y === 12) && Math.abs(dx) <= Math.sqrt(Math.max(0, (C - 1) ** 2 - dy * dy)) - 2) return true;
    const e = (dx / 4.4) ** 2 + (dy / (C - 1.6)) ** 2; // meridianos curvos (elipse)
    return Math.abs(e - 1) < 0.17;
  });
}

// LinkedIn: cuadrado de esquinas redondeadas con "in" recortada.
function linkedin() {
  return paint((x, y) => {
    if (!roundRect(x, y, 0, 0, 16, 16, 3)) return false;
    const carved = box(x, y, 3, 3, 4, 4) // punto de la i
      || box(x, y, 3, 6, 4, 13) // palo de la i
      || box(x, y, 7, 6, 8, 13) // palo izquierdo de la n
      || box(x, y, 7, 6, 12, 7) // arco de la n
      || box(x, y, 11, 6, 12, 13); // palo derecho de la n
    return !carved;
  });
}

// Instagram: marco de esquinas redondeadas de 2 píxeles, objetivo en anillo y punto del flash.
function instagram() {
  return paint((x, y) => {
    const outer = roundRect(x, y, 0, 0, 16, 16, 5) && !roundRect(x, y, 2, 2, 14, 14, 3);
    const d = Math.hypot(x - C, y - C);
    const lens = d <= 4.2 && d > 2.9; // anillo de 1 píxel: el icono pesa menos
    const flash = box(x, y, 11, 3, 12, 4);
    return outer || lens || flash;
  });
}

// Correo: sobre con la solapa en V.
function mail() {
  return paint((x, y) => {
    const frame = box(x, y, 0, 2, 16, 14) && !box(x, y, 2, 4, 14, 12);
    const flap = y >= 3 && y <= 9 && Math.abs(y - (3 + (x < C ? x : 16 - x) * 0.62)) < 0.9 && x >= 1 && x <= 15;
    return frame || flap;
  });
}

// Móvil (teléfono): marco de esquinas redondeadas con altavoz y botón.
function phone() {
  return paint((x, y) => {
    const body = roundRect(x, y, 3, 0, 13, 16, 2) && !roundRect(x, y, 5, 2, 11, 12, 1);
    return body || box(x, y, 7, 14, 9, 14);
  });
}

// Tarjeta de contacto: marco con una persona (cabeza y hombros) y dos líneas de texto.
function contact() {
  return paint((x, y) => {
    const frame = roundRect(x, y, 0, 2, 16, 14, 2) && !roundRect(x, y, 2, 4, 14, 12, 1);
    const head = Math.hypot(x - 5, y - 6.5) <= 1.8;
    const shoulders = y >= 9 && y <= 11 && x >= 3 && x <= 7 && !(y === 9 && (x === 3 || x === 7));
    return frame || head || shoulders || box(x, y, 9, 6, 13, 6) || box(x, y, 9, 9, 12, 9);
  });
}

// Calendario: marco con cabecera, dos anillas y una rejilla de días.
function calendar() {
  return paint((x, y) => {
    const frame = box(x, y, 1, 2, 15, 15) && !box(x, y, 2, 6, 14, 14);
    const header = box(x, y, 1, 2, 15, 5);
    const rings = box(x, y, 4, 0, 4, 3) || box(x, y, 12, 0, 12, 3);
    const days = [4, 7, 10, 13].some((cx) => [8, 11].some((cy) => box(x, y, cx - 1, cy, cx, cy + 1)));
    return frame || header || rings || days;
  });
}

// Robot (automatizaciones e IA): cabeza con antena, ojos y boca.
function bot() {
  return paint((x, y) => {
    const head = roundRect(x, y, 1, 4, 15, 15, 2) && !roundRect(x, y, 3, 6, 13, 13, 1);
    const antenna = x === 8 && y >= 1 && y <= 3;
    const ball = box(x, y, 7, 0, 9, 1);
    const eyes = box(x, y, 5, 8, 6, 9) || box(x, y, 10, 8, 11, 9);
    const mouth = box(x, y, 5, 11, 11, 11);
    const ears = box(x, y, 0, 8, 0, 11) || box(x, y, 16, 8, 16, 11);
    return head || antenna || ball || eyes || mouth || ears;
  });
}

const BUILDERS = { globe, linkedin, instagram, mail, phone, contact, calendar, bot };
export const ICON_NAMES = Object.keys(BUILDERS);
export const iconGrid = (name) => (BUILDERS[name] ? BUILDERS[name]() : null);

// Tramos horizontales de píxeles encendidos: [[x, y, ancho], ...]. Con ellos se dibuja el SVG con un rectángulo por tramo.
export function iconRuns(name) {
  const grid = iconGrid(name);
  if (!grid) return null;
  const runs = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < ICON_SIZE) {
      if (!row[x]) { x++; continue; }
      const start = x;
      while (x < ICON_SIZE && row[x]) x++;
      runs.push([start, y, x - start]);
    }
  });
  return runs;
}
