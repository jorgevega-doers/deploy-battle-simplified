// Plantas bajas de tienda a 16 píxeles por celda (una planta baja mide ~14 píxeles): konbini, ramen, izakaya, salón
// recreativo, karaoke, bar, local cerrado y hotel. Arriba va el cartel y debajo el escaparate o la puerta.
// "shopSide" pinta la versión lateral del mismo local (banda y material siguen al doblar la esquina).
import { PAL } from '../palette.js';
import { drawSmall, smallWidth, tinyGlyph, textWidth } from '../font.js';
import { MATERIALS, wallBase, signBoard, poster, shutter, vendingMachine, lantern, redLantern, plant, windowPane } from './common.js';
import { pick } from '../rng.js';

// Interior iluminado de tienda: luz blanca y filas de productos de colores.
function shelves(img, x, y, w, h, rng, light = PAL.cyan[4]) {
  img.rect(x, y, w, h, light);
  for (let j = y + 1; j < y + h; j += 2) {
    for (let i = x; i < x + w; i++) if (rng() < 0.55) img.set(i, j, pick(rng, [PAL.mag[4], PAL.blue[4], PAL.amber[3], PAL.green[2], PAL.orange[2]]));
  }
}

// Banda del konbini: blanca con el nombre y tres franjas de color debajo (verde, naranja y rojo en "NANA MART").
function konbiniBand(img, x, y, w, stripes) {
  img.rect(x, y, w, 6, PAL.white);
  img.hline(x, y + 6, w, stripes[0]);
  img.hline(x, y + 7, w, stripes[1]);
  img.hline(x, y + 8, w, stripes[2]);
  return 9;
}

function konbini(img, x, y, w, h, rng, p) {
  const band = konbiniBand(img, x, y, w, p.stripes);
  const text = smallWidth(p.sign) <= w - 4 ? p.sign : p.sign.split(' ')[0];
  drawSmall(img, text, x + Math.floor((w - smallWidth(text)) / 2), y + 1, p.textColor);
  const glassH = h - band - 1;
  shelves(img, x + 1, y + band, w - 6, glassH, rng);
  const doorX = x + Math.floor(w / 2) - 3;
  img.rect(doorX, y + band, 4, glassH, PAL.cyan[4]); // puerta automática
  img.vline(doorX, y + band, glassH, PAL.steel[5]);
  img.vline(doorX + 2, y + band, glassH, PAL.steel[5]);
  poster(img, x + 2, y + band + 1, 2, 2, rng);
  vendingMachine(img, x + w - 5, y + band, 4, glassH, rng, p.stripes[2]);
  img.hline(x, y + h - 1, w, PAL.steel[3]);
}

// Cuenco de ramen (4 x 3) con palillos.
function ramenBowl(img, x, y) {
  img.hline(x + 1, y - 1, 3, PAL.yellow[4]);
  img.hline(x, y, 4, PAL.amber[4]);
  img.hline(x, y + 1, 4, PAL.orange[2]);
  img.hline(x + 1, y + 2, 2, PAL.mag[3]);
}
// Farolillo alto de papel rojo y blanco (2 x 5), como los de los puestos de ramen.
function tallLantern(img, x, y) {
  for (let j = 0; j < 5; j++) img.hline(x, y + j, 2, j % 2 ? PAL.amber[4] : PAL.mag[3]);
}

// Ramen (como un puesto yatai): cartel de madera con bombillas, cuenco y "ラーメン"; cortina noren roja con puntos
// blancos sobre la barra encendida; farolillos altos rojos y blancos a los lados.
function ramen(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.wood, { cornice: false });
  img.rect(x, y, w, 7, PAL.wood[0]);
  for (let i = x; i < x + w; i += 2) { img.set(i, y, PAL.yellow[4]); img.set(i + 1, y + 6, PAL.yellow[4]); } // bombillas
  const text = p.sign ?? 'ラーメン';
  const total = 5 + smallWidth(text);
  const sx = x + Math.max(1, Math.floor((w - total) / 2));
  ramenBowl(img, sx, y + 3);
  if (smallWidth(text) <= w - 7) drawSmall(img, text, sx + 5, y + 1, PAL.amber[4]);
  const winY = y + 8;
  const winH = Math.max(3, h - 9);
  img.rect(x + 3, winY, w - 6, winH, PAL.amber[4]); // barra encendida
  img.hline(x + 3, winY + winH - 1, w - 6, PAL.wood[3]);
  img.hline(x + 3, winY, w - 6, p.noren ?? PAL.mag[3]); // noren
  img.hline(x + 3, winY + 1, w - 6, p.noren ?? PAL.mag[3]);
  for (let i = x + 4; i < x + w - 3; i += 3) img.set(i, winY, PAL.white);
  for (let i = x + 5; i < x + w - 5; i += 4) img.set(i, winY + 3, PAL.wood[1]); // clientes en la barra
  tallLantern(img, x + 1, winY);
  tallLantern(img, x + w - 3, winY);
}

// Izakaya: banda de madera con signos, fila de farolillos rojos y ámbar, celosía y puerta corredera encendida.
function izakaya(img, x, y, w, h, rng) {
  wallBase(img, x, y, w, h, rng, MATERIALS.plum, { cornice: false });
  img.rect(x, y, w, 6, PAL.wood[0]);
  for (let gx = x + 2; gx + 3 < x + w - 1; gx += 5) tinyGlyph(img, gx, y + 1, PAL.yellow[4], rng);
  for (let lx = x + 1, k = 0; lx + 2 <= x + w; lx += 4, k++) (k % 2 ? lantern : redLantern)(img, lx, y + 6);
  for (let i = x + 1; i < x + w - 7; i += 2) img.vline(i, y + 10, h - 11, PAL.wood[3]); // celosía
  img.rect(x + w - 6, y + 10, 5, h - 11, PAL.amber[4]); // puerta encendida
  img.vline(x + w - 4, y + 10, h - 11, PAL.amber[2]);
}

// Salón recreativo: cartel con borde amarillo y bombillas, máquinas de colores dentro con luz magenta.
function arcade(img, x, y, w, h, rng, p) {
  img.rect(x, y, w, h, PAL.night[1]);
  signBoard(img, x, y, w, 7, p.sign ?? 'GAME', { bg: PAL.blue[1], border: PAL.yellow[3], core: PAL.yellow[4], glow: PAL.mag[3] });
  img.rect(x + 1, y + 8, w - 2, h - 9, PAL.mag[1]);
  for (let mx = x + 2; mx + 3 < x + w - 1; mx += 5) {
    img.rect(mx, y + 9, 3, h - 10, pick(rng, [PAL.cyan[2], PAL.mag[4], PAL.amber[3]]));
    img.hline(mx, y + 10, 3, PAL.amber[4]);
  }
  for (let j = y + 8; j < y + h - 1; j += 2) { img.set(x, j, PAL.yellow[4]); img.set(x + w - 1, j, PAL.yellow[4]); }
}

// Karaoke: cartel "カラオケ", vestíbulo de cristal con luz magenta y farolillos.
function karaoke(img, x, y, w, h, rng) {
  wallBase(img, x, y, w, h, rng, MATERIALS.indigo, { cornice: false });
  signBoard(img, x + 1, y, w - 2, 7, 'カラオケ', { bg: PAL.night[0], border: PAL.cyan[3], core: PAL.white, glow: PAL.cyan[1] }, rng);
  img.rect(x + 4, y + 8, w - 8, h - 9, PAL.mag[4]);
  for (let i = x + 4; i < x + w - 4; i += 4) img.vline(i, y + 8, h - 9, PAL.mag[5]);
  img.rect(x + Math.floor(w / 2) - 2, y + 9, 4, h - 10, PAL.amber[4]);
  lantern(img, x + 1, y + 8);
  lantern(img, x + w - 3, y + 8);
}

// Bar: rótulo de neón pequeño, puerta de madera, ventana encendida y un farolillo.
function bar(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.slate, { cornice: false });
  const text = p.sign ?? 'BAR';
  if (smallWidth(text) <= w - 2) drawSmall(img, text, x + Math.floor((w - smallWidth(text)) / 2), y + 1, PAL.mag[6], PAL.mag[3]);
  img.rect(x + 2, y + 7, 3, h - 8, PAL.wood[3]); // puerta
  img.set(x + 4, y + 10, PAL.amber[4]);
  windowPane(img, x + w - 7, y + 8, 4, 3, rng, { mat: MATERIALS.slate, lit: true, light: [PAL.amber[4], PAL.amber[3], PAL.amber[2]] });
  lantern(img, x + 6, y + 7);
  if (w > 20) plant(img, x + w - 12, y + h - 4);
}

// Local cerrado: persiana y máquina expendedora.
function closed(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.concrete, { cornice: false });
  shutter(img, x + 1, y + 3, w - 7, h - 4);
  vendingMachine(img, x + w - 5, y + h - 9, 4, 8, rng, p.vending ?? PAL.cyan[2]);
}

// Hotel (y la torre "DOERS"): marquesina con el nombre y puertas de luz cálida. Si el nombre cabe en letra grande, la
// marquesina ocupa todo el ancho y es más alta, para que se lea bien desde lejos.
function hotel(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.navy, { cornice: false });
  const name = p.sign ?? 'HOTEL';
  const big = textWidth(name) <= w - 2 && h >= 13;
  const signH = big ? 9 : 7;
  const style = { bg: PAL.night[0], border: PAL.mag[4], core: PAL.white, glow: big ? PAL.blue[4] : PAL.mag[3] };
  if (big) signBoard(img, x, y, w, signH, name, style, rng);
  else signBoard(img, x + 2, y, w - 4, signH, name, style, rng);
  const doorY = y + signH + 1;
  img.rect(x + Math.floor(w / 2) - 4, doorY, 8, h - signH - 2, PAL.amber[4]);
  img.vline(x + Math.floor(w / 2), doorY, h - signH - 2, PAL.amber[2]);
  lantern(img, x + 2, doorY);
  lantern(img, x + w - 4, doorY);
}

// Taller mecánico (28-oct): rótulo naranja, puerta de persiana medio subida con luz cálida y chispas de soldadura, franja de
// peligro a rayas amarillas y negras y una torre de neumáticos.
function garage(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.concrete, { cornice: false });
  signBoard(img, x + 1, y, w - 2, 7, p.sign ?? 'TALLER', { bg: PAL.night[0], border: PAL.orange[2], core: PAL.yellow[4], glow: PAL.orange[1] }, rng);
  const doorW = Math.max(6, w - 11);
  const doorY = y + 8;
  const doorH = h - 9;
  img.rect(x + 2, doorY, doorW, doorH, PAL.amber[1]); // interior encendido
  img.rect(x + 2, doorY, doorW, 3, PAL.steel[4]); // persiana recogida arriba
  img.hline(x + 2, doorY + 1, doorW, PAL.steel[2]);
  img.hline(x + 2, doorY + 2, doorW, PAL.steel[2]);
  for (let i = 3; i < doorW - 1; i += 4) img.rect(x + 2 + i, doorY + 4, 2, 2, PAL.steel[2]); // coche en el taller
  const sx = x + 2 + Math.floor(doorW / 2);
  img.set(sx, doorY + doorH - 3, PAL.white); // chispas de soldadura
  img.set(sx + 1, doorY + doorH - 4, PAL.cyan[4]);
  img.set(sx - 1, doorY + doorH - 4, PAL.yellow[4]);
  for (let i = 0; i < doorW; i++) img.set(x + 2 + i, y + h - 2, (i >> 1) % 2 ? PAL.night[0] : PAL.yellow[3]); // franja de peligro
  const tx = x + w - 7; // neumáticos
  img.rect(tx, y + h - 4, 5, 3, PAL.night[0]); img.hline(tx, y + h - 4, 5, PAL.steel[3]);
  img.rect(tx + 1, y + h - 7, 3, 3, PAL.night[0]); img.hline(tx + 1, y + h - 7, 3, PAL.steel[3]);
  lantern(img, x + w - 4, y + 8);
}

// Mercado (28-oct): rótulo, toldo de rayas de colores y puestos con cajas de fruta y verdura bajo luz cálida.
function market(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.wood, { cornice: false });
  signBoard(img, x + 1, y, w - 2, 7, p.sign ?? 'ICHIBA', { bg: PAL.wood[0], border: PAL.yellow[2], core: PAL.yellow[4], glow: PAL.orange[1] }, rng);
  const colors = [PAL.mag[4], PAL.white, PAL.cyan[3], PAL.white, PAL.yellow[3], PAL.white];
  for (let i = 0; i < w - 2; i++) {
    const c = colors[Math.floor(i / 3) % colors.length];
    img.vline(x + 1 + i, y + 7, 3, c);
    if (i % 3 === 1) img.set(x + 1 + i, y + 10, c); // festón del toldo
  }
  img.rect(x + 1, y + 11, w - 2, h - 12, PAL.amber[1]); // puesto iluminado
  for (let i = 0; i < w - 4; i += 3) {
    const crate = [PAL.orange[2], PAL.green[2], PAL.mag[4], PAL.yellow[3]][Math.floor(i / 3 + (p.mix ?? 0)) % 4];
    img.rect(x + 2 + i, y + h - 4, 2, 3, PAL.wood[3]);
    img.hline(x + 2 + i, y + h - 5, 2, crate);
    if (i % 6 === 0) img.set(x + 2 + i, y + h - 6, crate);
  }
  lantern(img, x + 1, y + 11);
  lantern(img, x + w - 3, y + 11);
}

// Baño público japonés (sentō, 28-oct): rótulo "ONSEN", puerta con dos cortinas noren azules con el signo del baño, farolillos y
// calzado en la entrada.
function bath(img, x, y, w, h, rng, p) {
  wallBase(img, x, y, w, h, rng, MATERIALS.wood, { cornice: false });
  signBoard(img, x + 1, y, w - 2, 7, p.sign ?? 'ONSEN', { bg: PAL.night[0], border: PAL.cyan[3], core: PAL.white, glow: PAL.cyan[1] }, rng);
  const doorW = Math.min(14, Math.max(8, w - 10));
  const dx = x + Math.floor((w - doorW) / 2);
  img.rect(dx, y + 8, doorW, h - 9, PAL.amber[1]); // entrada iluminada
  for (let c = 0; c < 2; c++) { // dos noren azules con una franja blanca
    const cx = dx + 1 + c * Math.floor(doorW / 2);
    const cw = Math.floor(doorW / 2) - 1;
    img.rect(cx, y + 8, cw, 6, PAL.blue[3]);
    img.hline(cx, y + 10, cw, PAL.white);
    img.vline(cx + Math.floor(cw / 2), y + 8, 6, PAL.blue[5] ?? PAL.blue[4]);
  }
  redLantern(img, x + 2, y + 8);
  redLantern(img, x + w - 4, y + 8);
  for (let i = 0; i < 3; i++) img.rect(dx + 2 + i * 3, y + h - 3, 2, 1, PAL.wood[4]); // zapatos
}

const SHOPS = { konbini, ramen, izakaya, arcade, karaoke, bar, closed, hotel, garage, market, bath };

export function shopFront(img, x, y, w, h, rng, kind, p = {}) {
  const paint = SHOPS[kind];
  if (!paint) throw new Error(`Tienda desconocida: ${kind}`);
  paint(img, x, y, w, h, rng, p);
}

// Lateral de la planta baja de un local: misma banda y material que el frente y un detalle propio.
export function shopSide(img, x, y, w, h, rng, kind, p = {}) {
  if (kind === 'konbini') {
    const band = konbiniBand(img, x, y, w, p.stripes);
    shelves(img, x + 1, y + band, Math.max(2, w - 4), h - band - 1, rng);
    img.hline(x, y + h - 1, w, PAL.steel[3]);
    return;
  }
  const mat = { ramen: MATERIALS.wood, izakaya: MATERIALS.plum, arcade: MATERIALS.indigo, karaoke: MATERIALS.indigo, bar: MATERIALS.slate, closed: MATERIALS.concrete, hotel: MATERIALS.navy, garage: MATERIALS.concrete, market: MATERIALS.wood, bath: MATERIALS.wood }[kind] ?? MATERIALS.navy;
  wallBase(img, x, y, w, h, rng, mat, { cornice: false });
  img.rect(x, y, w, 6, kind === 'ramen' || kind === 'izakaya' ? PAL.wood[0] : PAL.night[1]); // banda del cartel
  if (kind === 'arcade') img.hline(x, y + 5, w, PAL.yellow[3]);
  if (kind === 'ramen') for (let i = x; i < x + w; i += 2) img.set(i, y, PAL.yellow[4]);
  if (kind === 'ramen' || kind === 'izakaya') {
    for (let lx = x + 2; lx + 2 <= x + w - 1; lx += 6) redLantern(img, lx, y + 6);
  } else if (kind === 'karaoke' || kind === 'arcade') {
    img.rect(x + 1, y + 7, Math.max(2, w - 2), h - 8, kind === 'arcade' ? PAL.mag[1] : PAL.mag[4]);
  } else if (w > 6) {
    windowPane(img, x + 2, y + 8, 3, 3, rng, { mat, lit: rng() < 0.7 });
  }
}
