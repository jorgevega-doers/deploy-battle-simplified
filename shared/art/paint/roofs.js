// Tejados y piezas de azotea a 16 píxeles por celda: azotea plana con pretil, tejas japonesas, aparatos, depósitos,
// vallas publicitarias, rótulos verticales, farolillos y cerezos. Estilo limpio: pocos elementos, bien dibujados.
import { PAL } from '../palette.js';
import { drawText, textWidth, GLYPH_H, drawSmall, smallWidth, SMALL_H } from '../font.js';
import { MATERIALS, verticalSign } from './common.js';
import { warm } from './garden.js';
import { int } from '../rng.js';

// Guirnalda de bombillas cálidas colgada de pretil a pretil (vista desde arriba).
function stringLights(img, x, y, w, h, rng) {
  const rows = Math.max(1, Math.floor(h / 12));
  for (let r = 0; r < rows; r++) {
    const y0 = y + 3 + Math.floor((r * (h - 6)) / rows);
    const y1 = y0 + int(rng, 2, 5);
    for (let i = x + 2; i < x + w - 2; i++) {
      const t = (i - x - 2) / (w - 4);
      const py = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 2);
      img.set(i, py, (i - x) % 2 ? PAL.night[1] : (i % 6 === 0 ? PAL.yellow[4] : PAL.amber[4]));
    }
  }
}

// Azotea plana: losas, pretil claro (o de neón), sombra del pretil y, según el tamaño, placas solares, claraboya,
// jardinera, rejilla o charco, y a veces una guirnalda de bombillas.
function roof(img, x, y, w, h, rng, p) {
  const mat = MATERIALS[p.mat ?? 'slate'];
  img.rect(x, y, w, h, mat[1]);
  for (let j = y + 6; j < y + h - 2; j += 6) img.hline(x + 2, j, w - 4, mat[0]); // juntas
  for (let i = x + 7; i < x + w - 2; i += 7) img.vline(i, y + 2, h - 4, mat[0]);
  for (let sy = y + 3; sy + 5 < y + h - 2; sy += 8) {
    for (let sx = x + 3; sx + 7 < x + w - 2; sx += 9) {
      const r = rng();
      if (r < 0.14) { // placas solares
        img.rect(sx, sy, 6, 4, PAL.steel[1]);
        for (let i = sx; i < sx + 6; i += 2) for (let j = sy; j < sy + 4; j += 2) img.set(i, j, PAL.blue[3]);
      } else if (r < 0.2) { // claraboya encendida
        img.rect(sx, sy, 4, 3, PAL.amber[4]);
        img.vline(sx + 2, sy, 3, PAL.amber[2]);
      } else if (r < 0.3) { // jardinera
        img.rect(sx, sy, 5, 3, PAL.green[1]);
        img.set(sx + 1, sy, PAL.green[3]); img.set(sx + 3, sy + 1, PAL.sakura[3]);
        img.hline(sx, sy + 3, 5, PAL.wood[2]);
      } else if (r < 0.38) { // rejilla de ventilación
        img.rect(sx, sy, 4, 3, PAL.steel[2]);
        img.hline(sx, sy + 1, 4, PAL.steel[4]);
      } else if (r < 0.44) { // charco
        img.hline(sx, sy, 3, PAL.blue[2]);
      }
    }
  }
  if (w >= 20 && h >= 16 && rng() < (p.lights ?? 0.45)) stringLights(img, x, y, w, h, rng);
  img.frame(x, y, w, h, p.rim ?? mat[3]);
  img.hline(x + 1, y + 1, w - 2, mat[0]); // sombra del pretil
  img.vline(x + 1, y + 1, h - 2, mat[0]);
  if (p.helipad && w >= 20 && h >= 20) {
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    img.frame(cx - 6, cy - 6, 12, 12, PAL.yellow[2]);
    drawSmall(img, 'H', cx - 1, cy - 2, PAL.yellow[3]);
  }
}

// Tejas japonesas (una vertiente): hiladas, cumbrera clara arriba y alero oscuro abajo.
function tiles(img, x, y, w, h, _rng, p) {
  const ramp = p.tone === 'navy' ? [PAL.night[2], PAL.night[4], PAL.steel[3], PAL.steel[5]] : [PAL.steel[1], PAL.steel[2], PAL.steel[3], PAL.steel[5]];
  img.rect(x, y, w, h, ramp[1]);
  for (let j = y + 1; j < y + h; j += 2) {
    img.hline(x, j, w, ramp[0]);
    for (let i = x + ((j - y) % 4 ? 1 : 0); i < x + w; i += 2) img.set(i, j - 1, ramp[2]);
  }
  img.hline(x, y, w, ramp[3]); // cumbrera
  img.hline(x, y + h - 1, w, PAL.night[0]); // alero
}

// Toldo de rayas.
function awning(img, x, y, w, h, _rng, p) {
  const [a, b] = p.colors ?? [PAL.mag[4], PAL.white];
  for (let i = 0; i < w; i++) img.vline(x + i, y, h, Math.floor(i / 2) % 2 ? b : a);
}

// Caras de piezas metálicas pequeñas: aparato de aire, depósito, poste.
function metal(img, x, y, w, h, _rng, p) {
  const kind = p.kind ?? 'plain';
  img.rect(x, y, w, h, PAL.steel[4]);
  if (kind === 'ac') {
    img.frame(x, y, w, h, PAL.steel[2]);
    if (w >= 3 && h >= 3) img.set(x + Math.floor(w / 2), y + Math.floor(h / 2), PAL.steel[1]);
  } else if (kind === 'tank') {
    for (let j = y + 1; j < y + h; j += 3) img.hline(x, j, w, PAL.steel[2]);
    img.hline(x, y, w, PAL.steel[5]);
  } else if (kind === 'top') {
    img.frame(x, y, w, h, PAL.steel[5]);
  }
}

// Valla publicitaria luminosa: fondo de dos tonos, borde de neón y texto (grande si cabe, si no pequeño).
function billboard(img, x, y, w, h, _rng, p) {
  const [bgTop, bgBottom] = p.bg ?? [PAL.blue[1], PAL.mag[1]];
  img.gradientV(x, y, w, h, [bgTop, bgBottom]);
  img.frame(x, y, w, h, p.border ?? PAL.cyan[3]);
  const lines = p.lines ?? [p.text ?? 'DOERS'];
  const big = lines.every((line) => textWidth(line) <= w - 4) && lines.length * (GLYPH_H + 2) <= h - 2;
  const lineH = (big ? GLYPH_H : SMALL_H) + 2;
  let ty = y + Math.floor((h - lines.length * lineH + 2) / 2);
  for (const line of lines) {
    // Letra clara con sombra dura de color: más limpia y legible que el contorno de neón alrededor de cada letra.
    if (big) drawText(img, line, x + Math.floor((w - textWidth(line)) / 2), ty, p.core ?? PAL.white, p.glow ?? PAL.mag[4]);
    else if (smallWidth(line) <= w - 2) drawSmall(img, line, x + Math.floor((w - smallWidth(line)) / 2), ty, p.core ?? PAL.white, p.glow ?? PAL.mag[4]);
    else if (smallWidth(line, 0) <= w - 2) drawSmall(img, line, x + Math.floor((w - smallWidth(line, 0)) / 2), ty, p.core ?? PAL.white, p.glow ?? PAL.mag[4], 0); // apretado: si no, el cartel quedaba vacío
    ty += lineH;
  }
  if (p.dots) for (let i = x + 2; i < x + w - 2; i += 3) { img.set(i, y + 1, PAL.yellow[4]); img.set(i, y + h - 2, PAL.yellow[4]); }
}

// Cara de un rótulo vertical que sale de la fachada.
function blade(img, x, y, w, h, rng, p) {
  verticalSign(img, x, y, w, h, rng, { text: p.text ?? null, border: p.border ?? PAL.cyan[3], bg: p.bg ?? PAL.night[0], glyph: p.glyph ?? PAL.white });
}

function flat(img, x, y, w, h, _rng, p) {
  img.rect(x, y, w, h, p.color ?? PAL.night[1]);
  if (p.edge) img.frame(x, y, w, h, p.edge);
}

// Farolillo o piloto pequeño que brilla entero.
function lamp(img, x, y, w, h, _rng, p) {
  img.rect(x, y, w, h, p.color ?? PAL.mag[4]);
  if (w > 2 && h > 2) img.rect(x + 1, y + 1, w - 2, h - 2, p.light ?? PAL.mag[6]);
}

// Copa de cerezo en flor: rosas en racimos, sombra abajo y algún pétalo blanco.
function blossom(img, x, y, w, h, rng, p) {
  const s = PAL.sakura;
  img.rect(x, y, w, h, s[2]);
  for (let k = 0; k < Math.floor((w * h) / 6); k++) img.set(x + int(rng, 0, w - 1), y + int(rng, 0, h - 1), rng() < 0.5 ? s[3] : s[1]);
  if (!p.top) img.hline(x, y + h - 1, w, s[1]);
  warm(img, x, y, w, h, [0.9, 0.74, 0.76]); // rosa más cálido y nocturno (como los parques; antes salía casi blanco-rosa chicle)
  for (let k = 0; k < Math.max(1, Math.floor((w * h) / 30)); k++) img.set(x + int(rng, 0, w - 1), y + int(rng, 0, h - 1), s[3]);
}
function bark(img, x, y, w, h) {
  img.rect(x, y, w, h, PAL.wood[2]);
  img.vline(x, y, h, PAL.wood[1]);
}

// Caseta de escalera: hormigón con puerta metálica y un farolillo cálido encima (o pared lisa en los laterales).
function shed(img, x, y, w, h, _rng, p) {
  img.rect(x, y, w, h, PAL.steel[3]);
  img.hline(x, y, w, PAL.steel[5]);
  img.vline(x + w - 1, y, h, PAL.steel[1]);
  if (p.blank) return;
  const dw = Math.max(3, Math.floor(w / 3));
  const dx = x + Math.floor((w - dw) / 2);
  img.rect(dx, y + 3, dw, h - 3, PAL.steel[1]);
  img.vline(dx + dw - 1, y + 3, h - 3, PAL.steel[2]);
  img.set(dx + Math.floor(dw / 2), y + 1, PAL.amber[4]);
}
// Antena parabólica vista de frente: plato claro con su receptor.
function dish(img, x, y, w, h) {
  img.rect(x, y, w, h, PAL.steel[5]);
  img.frame(x, y, w, h, PAL.steel[3]);
  img.set(x + Math.floor(w / 2), y + Math.floor(h / 2), PAL.steel[1]);
}
// Ropa tendida: prendas de colores en fila.
function laundry(img, x, y, w, h, rng) {
  img.hline(x, y, w, PAL.steel[2]);
  for (let i = x; i + 2 <= x + w; i += 3) {
    const color = [PAL.sakura[3], PAL.cyan[3], PAL.amber[4], PAL.white, PAL.blue[5]][int(rng, 0, 4)];
    img.rect(i, y + 1, 2, Math.max(1, h - 1 - int(rng, 0, 1)), color);
  }
}

export const ROOF_PAINTERS = { roof, tiles, awning, metal, billboard, blade, flat, lamp, blossom, bark, shed, dish, laundry };
