// Piezas de dibujo que comparten todas las fachadas, a 16 píxeles por celda (una planta = 12 píxeles): materiales de
// pared, ventanas, aparatos de aire, tuberías, carteles, farolillos... Estilo de las referencias "cozy" (Alabaster
// Dawn y similares): formas limpias, 3-4 tonos por material, cantos claros, casi sin ruido aleatorio, y la luz de las
// ventanas y carteles derramándose sobre la pared. Cada función pinta dentro del rectángulo que recibe (x, y = arriba-izq.).
import { PAL, WINDOW_LIGHTS } from '../palette.js';
import { drawSmall, smallWidth, SMALL_H, tinyGlyph, drawText, textWidth, GLYPH_H } from '../font.js';
import { bayer } from '../pixelImage.js';
import { int, pick } from '../rng.js';

// Materiales de pared: [oscuro, base, claro, brillo]. Gris azulado apagado como los muros de las referencias; el azul
// saturado de marca queda para neones y acentos.
export const MATERIALS = Object.freeze({
  concrete: [PAL.steel[1], PAL.steel[2], PAL.steel[3], PAL.steel[5]],
  steel: [PAL.steel[1], PAL.steel[2], PAL.steel[3], PAL.steel[5]],
  slate: [PAL.night[2], PAL.night[3], PAL.night[4], PAL.steel[4]],
  navy: [PAL.night[2], PAL.night[4], PAL.steel[3], PAL.steel[5]],
  indigo: [PAL.night[1], PAL.night[3], PAL.night[4], PAL.blue[3]],
  plum: [PAL.wood[0], PAL.wood[1], PAL.wood[2], PAL.wood[4]],
  wood: [PAL.wood[1], PAL.wood[2], PAL.wood[3], PAL.wood[4]],
  plaster: [PAL.steel[3], PAL.steel[4], PAL.steel[5], PAL.steel[6]],
  brick: [PAL.brick[1], PAL.brick[2], PAL.brick[3], PAL.brick[4]],
});

// Aparejo de ladrillo: hiladas de 2 píxeles con juntas oscuras.
export function brickWall(img, x, y, w, h) {
  const m = MATERIALS.brick;
  img.rect(x, y, w, h, m[1]);
  for (let j = 0; j < h; j += 2) {
    img.hline(x, y + j, w, m[0]);
    for (let i = (j / 2) % 2 ? 2 : 0; i < w; i += 4) img.set(x + i, y + j + 1, m[0]);
  }
}

// Pared limpia: color base, cornisa arriba (brillo + sombra) y algún churretón suelto.
export function wallBase(img, x, y, w, h, rng, mat, { cornice = true } = {}) {
  const [dark, base, , hi] = mat;
  if (mat === MATERIALS.brick) brickWall(img, x, y, w, h);
  else img.rect(x, y, w, h, base);
  if (cornice) {
    img.hline(x, y, w, hi);
    img.hline(x, y + 1, w, dark);
  }
  for (let s = 0; s < Math.max(1, Math.floor(w / 14)); s++) { // churretones (pocos y deliberados)
    const sx = x + int(rng, 1, Math.max(1, w - 2));
    const len = int(rng, 2, 4);
    for (let k = 0; k < len; k++) img.set(sx, y + 2 + k, dark);
  }
}

export function floorBand(img, x, y, w, mat) {
  img.hline(x, y, w, mat[3]);
}

// Ventana. Encendida: luz cálida con la fila de arriba más clara y la luz derramándose 1 píxel sobre la pared (trama).
// Apagada: cristal oscuro con un reflejo azul.
// Anota una ventana pintada, si quien pinta lleva la cuenta (paintCityAtlas): el host anima unas pocas (client/host/lifeWindows.js).
export function recordWindow(img, x, y, w, h, lit, color = null) {
  img.windows?.push({ key: img.windowKey, x, y, w, h, lit, color });
}

// Descarta las ventanas anotadas de esta cara que quedan bajo un cartel o rótulo pintado después (si no, la animación
// se dibujaría encima del cartel como puntos sueltos).
export function dropWindows(img, x, y, w, h) {
  const list = img.windows;
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    if (q.key === img.windowKey && q.x < x + w && q.x + q.w > x && q.y < y + h && q.y + q.h > y) list.splice(i, 1);
  }
}

export function windowPane(img, x, y, w, h, rng, { lit = rng() < 0.5, mat = MATERIALS.navy, light = pick(rng, WINDOW_LIGHTS) } = {}) {
  recordWindow(img, x, y, w, h, lit, lit ? light[1] : null);
  if (lit) {
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      const edge = i < 0 || j < 0 || i >= w || j >= h;
      if (edge && bayer(x + i, y + j) < 0.5) img.set(x + i, y + j, mat[2]);
    }
    img.rect(x, y, w, h, light[1]);
    img.hline(x, y, w, light[0]);
    if (w >= 3 && rng() < 0.4) img.vline(rng() < 0.5 ? x : x + w - 1, y + 1, h - 1, light[2]); // cortina
  } else {
    img.rect(x, y, w, h, PAL.night[1]);
    img.set(x, y, PAL.blue[2]);
  }
  if (h >= 3) img.hline(x, y + h, w, mat[3]); // alféizar
}

// Aparato de aire acondicionado (3 x 2) con su sombra.
export function acUnit(img, x, y) {
  img.rect(x, y, 3, 2, PAL.steel[5]);
  img.set(x + 1, y + 1, PAL.steel[2]);
  img.hline(x, y + 2, 3, PAL.night[1]);
}

// Tubería vertical de 1 píxel con abrazaderas.
export function pipe(img, x, y, h, mat = MATERIALS.concrete) {
  img.vline(x, y, h, mat[3]);
  for (let k = 3; k < h; k += 6) img.set(x + 1, y + k, mat[0]);
}

// Cartel rectangular. Si el texto cabe en la letra grande (5 x 7) se usa esa: se lee mucho mejor (sobre todo "DOERS");
// si no, la pequeña (3 x 5); y si tampoco cabe, signos inventados. Neón = letra clara con sombra dura de color.
export function signBoard(img, x, y, w, h, text, { bg = PAL.night[1], border = PAL.mag[4], core = PAL.white, glow = PAL.mag[4] } = {}, rng = null) {
  dropWindows(img, x - 1, y - 1, w + 2, h + 2);
  img.rect(x, y, w, h, bg);
  img.frame(x, y, w, h, border);
  if (text && h >= GLYPH_H + 2 && textWidth(text) <= w - 2) {
    drawText(img, text, x + Math.floor((w - textWidth(text)) / 2), y + Math.floor((h - GLYPH_H) / 2), core, glow);
    return;
  }
  const ty = y + Math.floor((h - SMALL_H) / 2);
  if (text && smallWidth(text) <= w - 3) {
    drawSmall(img, text, x + Math.floor((w - smallWidth(text)) / 2), ty, core, glow);
  } else if (rng) {
    for (let gx = x + 2; gx + 3 < x + w - 1; gx += 4) tinyGlyph(img, gx, y + Math.floor((h - 4) / 2), core, rng);
  }
}

// Rótulo vertical japonés: tabla estrecha con signos uno debajo de otro (katakana si cabe, si no signos inventados).
export function verticalSign(img, x, y, w, h, rng, { text = null, bg = PAL.night[0], border = PAL.cyan[3], glyph = PAL.white } = {}) {
  dropWindows(img, x - 1, y - 1, w + 2, h + 2);
  img.rect(x, y, w, h, bg);
  img.frame(x, y, w, h, border);
  if (text && w >= 7) {
    let gy = y + 2;
    for (const ch of text) {
      if (gy + SMALL_H > y + h - 1) break;
      drawSmall(img, ch, x + Math.floor((w - smallWidth(ch)) / 2), gy, glyph);
      gy += SMALL_H + 1;
    }
  } else {
    for (let gy = y + 2; gy + 4 <= y + h - 1; gy += 5) tinyGlyph(img, x + Math.floor((w - 3) / 2), gy, glyph, rng);
  }
}

// Póster o pegatina pequeña.
export function poster(img, x, y, w, h, rng) {
  img.rect(x, y, w, h, pick(rng, [PAL.sakura[3], PAL.cyan[3], PAL.yellow[3], PAL.amber[4]]));
  img.hline(x, y + Math.floor(h / 2), w, PAL.night[2]);
}

// Persiana metálica de un local cerrado.
export function shutter(img, x, y, w, h) {
  img.rect(x, y, w, h, PAL.steel[3]);
  for (let j = y + 1; j < y + h; j += 2) img.hline(x, j, w, PAL.steel[2]);
  img.hline(x, y, w, PAL.steel[1]);
}

// Máquina expendedora vista de frente: cuerpo de color, escaparate blanco con filas de productos y hueco abajo.
export function vendingMachine(img, x, y, w, h, rng, color = PAL.cyan[2]) {
  img.rect(x, y, w, h, color);
  img.rect(x + 1, y + 1, w - 2, Math.max(2, Math.floor(h * 0.55)), PAL.white);
  for (let j = y + 2; j < y + Math.floor(h * 0.55); j += 2) {
    for (let i = x + 1; i < x + w - 1; i++) if (rng() < 0.6) img.set(i, j, pick(rng, [PAL.mag[4], PAL.blue[4], PAL.amber[3], PAL.green[2]]));
  }
  img.hline(x + 1, y + h - 2, w - 2, PAL.night[1]);
}

// Farolillo de papel (2 x 4): cuerda, cuerpo con brillo y base. Por defecto, luz ámbar.
export function lantern(img, x, y, color = PAL.amber[3], light = PAL.amber[4]) {
  img.set(x, y, PAL.night[0]);
  img.rect(x, y + 1, 2, 2, color);
  img.set(x, y + 1, light);
  img.set(x + 1, y + 3, PAL.night[0]);
}
export const redLantern = (img, x, y) => lantern(img, x, y, PAL.mag[3], PAL.mag[5]);

// Zócalo de piedra en la base de la fachada (2 píxeles), igual en todas las caras.
export function plinth(img, x, y, w, h) {
  img.hline(x, y + h - 2, w, PAL.steel[4]);
  img.hline(x, y + h - 1, w, PAL.steel[2]);
}

// Cantos del edificio: 1 píxel claro a la izquierda y 1 oscuro a la derecha en cada cara.
export function pilasters(img, x, y, w, h, mat) {
  img.vline(x, y, h, mat[3]);
  img.vline(x + w - 1, y, h, mat[0]);
}

// Maceta con planta (3 x 4).
export function plant(img, x, y) {
  img.rect(x, y, 3, 2, PAL.green[2]);
  img.set(x + 1, y, PAL.green[3]);
  img.set(x, y + 1, PAL.green[1]);
  img.rect(x, y + 2, 3, 2, PAL.wood[3]);
}
