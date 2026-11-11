// Imagen del panel LED: el podio del Top 3 como GIF animado. Diseño de 32 x 32 (el panel del stand); en un panel mayor se amplía en enteros y se
// centra. Arriba "TOP 3"; debajo tres filas con la medalla (oro, plata, bronce) y su número, las iniciales y una barra proporcional a la puntuación.
// Animación: las barras crecen al entrar y el primero centellea. Código puro (sin DOM): devuelve los bytes del GIF que led.js envía al panel.
import { drawSmall, smallWidth } from '../../shared/art/font.js';
import { encodeGif } from '../../shared/art/gif.js';

const BASE = 32;
// Colores del panel (los LED encendidos al máximo deslumbran: tonos algo apagados salvo los acentos). 0 = apagado.
const PALETTE = ['#000000', '#ffffff', '#ffc400', '#9fb4ff', '#ff7a1a', '#ff0080', '#3346ff', '#141a3a', '#806200'];
const C = { off: 0, white: 1, gold: 2, silver: 3, bronze: 4, pink: 5, blue: 6, faint: 7, dimGold: 8 };
const MEDALS = [C.gold, C.silver, C.bronze];
const BAR_X = 20;
const BAR_W = 12;
const GROW_FRAMES = 6;
const HOLD_FRAMES = 8;

function canvas(w, h) {
  const pixels = new Uint8Array(w * h);
  return {
    pixels,
    set(x, y, c) { if (x >= 0 && x < w && y >= 0 && y < h) pixels[y * w + x] = c; },
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) this.set(x + i, y + j, c); },
  };
}

// Las tres filas (rellena con huecos si aún no hay tres puntuaciones). Solo iniciales A-Z de hasta 3 letras.
export function podiumRows(top) {
  const best = Math.max(1, ...top.slice(0, 3).map((e) => Number(e?.score) || 0));
  return [0, 1, 2].map((i) => {
    const entry = top[i];
    if (!entry) return { name: '---', fill: 0, empty: true };
    const name = String(entry.initials ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '---';
    return { name, fill: Math.max(1, Math.round((BAR_W * (Number(entry.score) || 0)) / best)), empty: false };
  });
}

// Un fotograma de 32 x 32: grow = 0..1 (cuánto han crecido las barras); spark = el primero centellea.
function drawFrame(rows, grow, spark) {
  const img = canvas(BASE, BASE);
  const title = 'TOP 3';
  drawSmall(img, title, Math.floor((BASE - smallWidth(title)) / 2), 1, C.pink);
  rows.forEach((row, i) => {
    const y = 9 + i * 8;
    img.rect(0, y - 1, 5, 7, row.empty ? C.faint : MEDALS[i]);
    drawSmall(img, String(i + 1), 1, y, C.off);
    drawSmall(img, row.name, 7, y, row.empty ? C.faint : C.white);
    img.rect(BAR_X, y + 1, BAR_W, 3, C.faint);
    const fill = Math.round(row.fill * grow);
    if (fill > 0) img.rect(BAR_X, y + 1, fill, 3, MEDALS[i]);
    if (i === 0 && spark && !row.empty) {
      img.set(BAR_X + row.fill - 1, y + 2, C.white); // destello en la punta de la barra de oro
      img.set(4, y - 1, C.white);                     // y en la esquina de su medalla
      img.set(0, y + 5, C.dimGold);
    }
  });
  return img.pixels;
}

// Amplía en enteros y centra el diseño de 32 x 32 en un panel de width x height.
function fit(pixels, width, height) {
  const scale = Math.max(1, Math.floor(Math.min(width / BASE, height / BASE)));
  const ox = Math.floor((width - BASE * scale) / 2);
  const oy = Math.floor((height - BASE * scale) / 2);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y - oy) / scale);
    if (sy < 0 || sy >= BASE) continue;
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x - ox) / scale);
      if (sx >= 0 && sx < BASE) out[y * width + x] = pixels[sy * BASE + sx];
    }
  }
  return out;
}

// Fotogramas del podio (índices de PALETTE) para un panel de width x height.
export function podiumFrames(top, width = BASE, height = BASE) {
  const rows = podiumRows(top);
  const frames = [];
  for (let k = 1; k <= GROW_FRAMES; k++) {
    const t = k / GROW_FRAMES;
    frames.push({ pixels: fit(drawFrame(rows, 1 - (1 - t) ** 3, false), width, height), delayCs: 8 });
  }
  for (let k = 0; k < HOLD_FRAMES; k++) frames.push({ pixels: fit(drawFrame(rows, 1, k % 2 === 1), width, height), delayCs: 60 });
  return frames;
}

export const podiumGif = (top, width = BASE, height = BASE) => encodeGif({ width, height, palette: PALETTE, frames: podiumFrames(top, width, height) });

// Imagen de prueba: borde de 1 píxel (si se ve entero en los bordes del panel, el tamaño es el correcto), diagonales y el tamaño escrito.
export function testPatternGif(width, height) {
  const img = canvas(width, height);
  img.rect(0, 0, width, 1, C.pink); img.rect(0, height - 1, width, 1, C.pink);
  img.rect(0, 0, 1, height, C.blue); img.rect(width - 1, 0, 1, height, C.blue);
  for (let i = 0; i < Math.min(width, height); i++) { img.set(i, i, C.faint); img.set(width - 1 - i, i, C.faint); }
  const label = `${width}X${height}`;
  drawSmall(img, label, Math.floor((width - smallWidth(label)) / 2), Math.floor(height / 2) - 2, C.white);
  return encodeGif({ width, height, palette: PALETTE, frames: [{ pixels: img.pixels, delayCs: 100 }] });
}
