// Textos grandes con la letra del logo de DEPLOY BATTLE (shared/art/bigFont.js): gruesa, en cursiva, con canto iluminado arriba, sombra interior
// en damero, sombra apilada abajo a la derecha y reborde negro. Se pinta una vez, al montar la pantalla, en lienzos de píxel lógico que la
// pantalla amplía en enteros (sin suavizado). Cada letra va en DOS lienzos: "back" (reborde, sombra y contorno) y "front" (relleno); quien lo
// usa pone todos los back debajo de todos los front, así el reborde de una letra nunca tapa a la siguiente aunque salten por separado.
// Qué NO hace: animar ni colocar en pantalla (lo hace challengeSlide.js).
import { GLYPHS, pointInPoly } from '../../shared/art/bigFont.js';

const SKEW = 0.26;   // la misma cursiva del logo
const GAP = 1.4;     // separación entre letras (unidades de letra)
const SHADOW = [[1, 2], [2, 3]]; // sombra apilada (la del logo)
const RIM = 2;       // reborde negro alrededor de letra y sombra
const PAD = RIM + 4; // margen del lienzo de cada letra
const ACCENT = 6;    // unidades por encima de la letra reservadas para la tilde (Í)

// Paletas (las del logo): hi = canto de arriba, base, dark = sombra interior, outline = contorno fino, shadow = sombra apilada.
export const PALETTES = {
  white: { hi: '#ffffff', base: '#e6eaff', dark: '#7f8bc2', outline: '#0b0a2a', shadow: '#0003ad' },
  pink: { hi: '#ff9cca', base: '#ff1f8e', dark: '#8a1fb0', outline: '#2a0614', shadow: '#3b0a6e' },
  amber: { hi: '#fff1c2', base: '#ffb45c', dark: '#c8661e', outline: '#2a1204', shadow: '#7a2e0a' },
};
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Ancho de un texto en unidades de letra (para elegir el tamaño que cabe).
export function textUnits(text) {
  return [...text].reduce((sum, ch) => sum + (GLYPHS[ch]?.w ?? 4) + GAP, 0) - GAP + 16 * SKEW;
}

// Pinta un texto a u píxeles por unidad. palOf(i) = paleta de la letra i. Devuelve { width, height, letters: [{ ch, x, back, front }] }:
// x = donde empieza el lienzo de cada letra, en píxeles lógicos; height = alto común de todos los lienzos.
export function renderText(text, u, palOf) {
  const height = Math.ceil((16 + ACCENT) * u) + PAD * 2;
  const oy = PAD + Math.round(ACCENT * u); // línea superior de la letra (v = 0)
  let pen = 0;
  const letters = [];
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    const x = Math.round(pen);
    pen += (g.w + GAP) * u;
    if (!g.fill.length) return; // espacio
    const w = Math.ceil((g.w + 16 * SKEW) * u) + PAD * 2;
    const N = w * height;
    const at = (px, py) => px >= 0 && py >= 0 && px < w && py < height;
    const mask = new Uint8Array(N); const vOf = new Float32Array(N);
    for (let py = 0; py < height; py++) for (let px = 0; px < w; px++) {
      const v = (py + 0.5 - oy) / u;
      const uu = (px + 0.5 - PAD) / u - (16 - v) * SKEW;
      if (g.fill.some((p) => pointInPoly(uu, v, p)) && !(g.cut ?? []).some((p) => pointInPoly(uu, v, p))) { mask[py * w + px] = 1; vOf[py * w + px] = v; }
    }
    // Huecos de 1 píxel que deja el rasterizado dentro de la letra: se rellenan (como en el logo).
    for (let pass = 0; pass < 2; pass++) for (let py = 1; py < height - 1; py++) for (let px = 1; px < w - 1; px++) {
      const k = py * w + px;
      if (mask[k]) continue;
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => mask[(py + dy) * w + px + dx]);
      if (around.length >= 3) { mask[k] = 1; vOf[k] = vOf[(py + around[0][1]) * w + px + around[0][0]]; }
    }
    const pal = palOf(i);
    const shadow = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (mask[k]) for (const [dx, dy] of SHADOW) { const px = (k % w) + dx; const py = ((k / w) | 0) + dy; if (at(px, py)) shadow[py * w + px] = 1; }
    const front = paint(w, height, (px, py) => {
      const k = py * w + px;
      if (!mask[k]) return null;
      const v = vOf[k];
      if (!at(px, py - 1) || !mask[k - w]) return pal.hi; // canto superior iluminado
      if (v > 10.6) return pal.dark;                      // sombra interior abajo
      if (v > 9.2) return (px + py) % 2 ? pal.dark : pal.base; // transición en damero
      return pal.base;
    });
    const back = paint(w, height, (px, py) => {
      const k = py * w + px;
      if (mask[k]) return null;
      const near = (r, m) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r + 1 && at(px + dx, py + dy) && m(py * w + px + dy * w + dx)) return true; return false; };
      if (near(1, (j) => mask[j])) return pal.outline;
      if (shadow[k]) return pal.shadow;
      if (near(RIM, (j) => mask[j] || shadow[j])) return '#000000';
      return null;
    });
    letters.push({ ch, i, x: x - PAD, back, front });
  });
  return { width: Math.ceil(pen - GAP * u + 16 * SKEW * u) + PAD * 2, height, top: oy, letters }; // top = fila donde empiezan las letras
}

function paint(w, h, colorAt) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = colorAt(x, y);
    if (!c) continue;
    const [r, g, b] = rgb(c); const o = (y * w + x) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
