// Imagen RGBA en memoria con las operaciones de dibujo del pixel art: rectángulos, líneas, tramas (dithering) y ruido.
// Código puro (sin navegador ni Node): la usan el host (pinta las texturas al arrancar) y los scripts (vistas previas PNG).
// Los colores son números de 32 bits ya empaquetados (ver palette.js), así cada píxel se escribe con una sola operación.
// "setClip" limita el dibujo a un rectángulo: cada cara del atlas se pinta sin poder manchar a sus vecinas.

// Matriz de Bayer 4 x 4: decide qué píxeles se encienden en una trama ordenada (el "degradado" del pixel art).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export class PixelImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.px = new Uint32Array(this.data.buffer); // vista de 32 bits: un píxel = un número
    this.clearClip();
  }

  setClip(x, y, w, h) {
    this.cx0 = Math.max(0, x);
    this.cy0 = Math.max(0, y);
    this.cx1 = Math.min(this.width, x + w);
    this.cy1 = Math.min(this.height, y + h);
  }
  clearClip() { this.setClip(0, 0, this.width, this.height); }
  inside(x, y) { return x >= this.cx0 && y >= this.cy0 && x < this.cx1 && y < this.cy1; }

  set(x, y, color) {
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    this.px[y * this.width + x] = color;
  }
  get(x, y) { return this.px[y * this.width + x]; }

  rect(x, y, w, h, color) {
    const x0 = Math.max(this.cx0, x);
    const y0 = Math.max(this.cy0, y);
    const x1 = Math.min(this.cx1, x + w);
    const y1 = Math.min(this.cy1, y + h);
    if (x1 <= x0) return;
    for (let j = y0; j < y1; j++) this.px.fill(color, j * this.width + x0, j * this.width + x1);
  }
  hline(x, y, w, color) { this.rect(x, y, w, 1, color); }
  vline(x, y, h, color) { this.rect(x, y, 1, h, color); }
  frame(x, y, w, h, color) {
    this.hline(x, y, w, color); this.hline(x, y + h - 1, w, color);
    this.vline(x, y, h, color); this.vline(x + w - 1, y, h, color);
  }

  // Trama ordenada: pinta "color" en la fracción "amount" (0-1) de los píxeles del rectángulo.
  dither(x, y, w, h, color, amount) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(x + i, y + j) < amount) this.set(x + i, y + j, color);
  }
  // Degradado vertical con trama entre los colores de una rampa (de arriba a abajo).
  gradientV(x, y, w, h, ramp) {
    const steps = ramp.length - 1;
    for (let j = 0; j < h; j++) {
      const t = (h <= 1 ? 0 : j / (h - 1)) * steps;
      const k = Math.min(steps - 1, Math.floor(t));
      const f = t - k;
      for (let i = 0; i < w; i++) this.set(x + i, y + j, bayer(x + i, y + j) < f ? ramp[k + 1] : ramp[k]);
    }
  }
  // Motas al azar de varios colores (textura de material: asfalto, hormigón, suciedad).
  noise(x, y, w, h, rng, colors, density) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (rng() < density) this.set(x + i, y + j, colors[Math.floor(rng() * colors.length)]);
      }
    }
  }
  // Halo de luz con trama: más denso en el centro y que se desvanece hasta el radio. "onlyOver" (opcional) limita
  // el halo a los píxeles de esos colores (p. ej. la pared o el asfalto), para no tapar letras ni bordes.
  glow(cx, cy, rx, ry, color, strength = 0.6, onlyOver = null) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (!this.inside(x, y)) continue;
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d >= 1) continue;
        const k = y * this.width + x;
        if (onlyOver && !onlyOver.has(this.px[k])) continue;
        if (bayer(x, y) < (1 - d) * (1 - d) * strength) this.px[k] = color;
      }
    }
  }
  // Sustituye unos colores por otros dentro de un rectángulo (útil para "teñir" una zona ya pintada).
  recolor(x, y, w, h, map) {
    for (let j = Math.max(this.cy0, y); j < Math.min(this.cy1, y + h); j++) {
      for (let i = Math.max(this.cx0, x); i < Math.min(this.cx1, x + w); i++) {
        const k = j * this.width + i;
        const to = map.get(this.px[k]);
        if (to !== undefined) this.px[k] = to;
      }
    }
  }
  // Copia ampliada con el vecino más cercano (para revisar a ojo).
  scaled(factor) {
    const out = new PixelImage(this.width * factor, this.height * factor);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) out.px[y * out.width + x] = this.px[Math.floor(y / factor) * this.width + Math.floor(x / factor)];
    }
    return out;
  }
  // Recorte (para las vistas previas).
  crop(x, y, w, h) {
    const out = new PixelImage(w, h);
    for (let j = 0; j < h; j++) out.px.set(this.px.subarray((y + j) * this.width + x, (y + j) * this.width + x + w), j * w);
    return out;
  }
}
