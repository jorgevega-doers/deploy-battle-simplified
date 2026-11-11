// Fachadas completas (caras verticales de los edificios) a 16 píxeles por celda: planta baja de tienda + plantas de
// viviendas, oficinas u hotel, carteles y rótulos; paredes laterales; muros de casa japonesa. Una planta = 12 píxeles.
import { PAL } from '../palette.js';
import { MATERIALS, wallBase, floorBand, windowPane, recordWindow, acUnit, pipe, signBoard, verticalSign, poster, plinth, pilasters, lantern } from './common.js';
import { shopFront, shopSide } from './shops.js';
import { int, pick } from '../rng.js';

const STORY = 12;

// Plantas de viviendas: ventanas con barandilla de balcón, aparatos de aire, ropa tendida y algún farolillo.
function apartmentFloors(img, x, y, w, h, rng, mat) {
  for (let fy = y + h - STORY; fy >= y + 1; fy -= STORY) {
    floorBand(img, x, fy + STORY - 1, w, mat);
    const count = Math.max(1, Math.floor((w - 2) / 8));
    const gap = Math.floor((w - count * 4) / (count + 1));
    for (let k = 0; k < count; k++) {
      const wx = x + gap + k * (4 + gap);
      windowPane(img, wx, fy + 2, 4, 4, rng, { mat });
      img.hline(wx - 1, fy + 7, 6, mat[3]); // barandilla
      img.hline(wx - 1, fy + 8, 6, mat[0]);
      const r = rng();
      if (r < 0.3) acUnit(img, wx + 4, fy + 4);
      else if (r < 0.5) for (let i = wx; i < wx + 4; i += 2) img.set(i, fy + 6, pick(rng, [PAL.sakura[3], PAL.cyan[3], PAL.amber[4]]));
      else if (r < 0.65) lantern(img, wx + 4, fy + 3);
    }
  }
}

// Plantas de oficinas: franja de cristal con montantes; unas encendidas en cálido y alguna en frío.
function officeFloors(img, x, y, w, h, rng, mat) {
  for (let fy = y + h - STORY; fy >= y + 1; fy -= STORY) {
    floorBand(img, x, fy + STORY - 1, w, mat);
    const on = rng() < 0.55;
    const [hi, body] = rng() < 0.65 ? [PAL.amber[4], PAL.amber[3]] : [PAL.cyan[4], PAL.cyan[2]];
    for (let i = x + 1; i < x + w - 1; i++) {
      const lit = on && (Math.floor((i - x) / 3) * 7 + fy) % 4 !== 0;
      img.vline(i, fy + 2, 7, lit ? body : PAL.night[1]);
      img.set(i, fy + 2, lit ? hi : PAL.blue[1]);
      if ((i - x) % 3 === 0) img.vline(i, fy + 2, 7, mat[2]);
    }
    // Cada grupo de 3 columnas es una ventana (la primera es el montante): se anota para que el host pueda animarla.
    for (let k = 0; x + 3 * k + 3 < x + w - 1; k++) {
      recordWindow(img, x + 3 * k + 1, fy + 2, 2, 7, on && (k * 7 + fy) % 4 !== 0, body);
    }
  }
}

// Plantas de hotel: rejilla de ventanas pequeñas.
function hotelFloors(img, x, y, w, h, rng, mat) {
  for (let fy = y + h - STORY; fy >= y + 1; fy -= STORY) {
    floorBand(img, x, fy + STORY - 1, w, mat);
    for (let wx = x + 2; wx + 2 < x + w - 1; wx += 4) {
      windowPane(img, wx, fy + 2, 2, 3, rng, { mat });
      windowPane(img, wx, fy + 7, 2, 2, rng, { mat });
    }
  }
}

// Fachada de edificio: planta baja (tienda o nada) + plantas superiores + carteles.
// p = { mat, ground: { kind, ... } | null, groundH, upper: 'apartment' | 'office' | 'hotel' | 'blank', sign, blade }
function building(img, x, y, w, h, rng, p) {
  const mat = MATERIALS[p.mat ?? 'navy'];
  wallBase(img, x, y, w, h, rng, mat);
  const groundH = p.ground ? Math.min(h, p.groundH ?? 14) : 0;
  const upperH = h - groundH;
  if (upperH > 5) {
    if (p.upper === 'office') officeFloors(img, x, y + 2, w, upperH - 2, rng, mat);
    else if (p.upper === 'hotel') hotelFloors(img, x, y + 2, w, upperH - 2, rng, mat);
    else if (p.upper !== 'blank') apartmentFloors(img, x, y + 2, w, upperH - 2, rng, mat);
  }
  if (p.ground) shopFront(img, x, y + h - groundH, w, groundH, rng, p.ground.kind, p.ground);
  if (p.sign && upperH > 9) { // cartel horizontal encima de la planta baja
    const sw = Math.min(w - 4, Math.max(14, Math.floor(w * 0.6)));
    signBoard(img, x + Math.floor((w - sw) / 2), y + h - groundH - 8, sw, 7, p.sign.text, p.sign.style, rng);
  }
  if (p.blade && upperH > 16) { // rótulo vertical a un lado
    const bx = p.blade.side === 'left' ? x + 2 : x + w - 8;
    verticalSign(img, bx, y + 3, 6, upperH - 5, rng, p.blade);
  }
  finishEdges(img, x, y, w, h, mat, p);
}

// Remate de todas las caras: zócalo abajo y cantos (iguales en todas, para que la esquina no parezca cortada).
function finishEdges(img, x, y, w, h, mat, p) {
  if (p.ground?.kind !== 'konbini') plinth(img, x, y, w, h);
  pilasters(img, x, y, w, h, mat);
}

// Pared lateral: tubería, ventanitas y aparatos de aire; si el frente es una tienda, la planta baja la continúa.
function side(img, x, y, w, h, rng, p) {
  const mat = MATERIALS[p.mat ?? 'navy'];
  wallBase(img, x, y, w, h, rng, mat);
  const groundH = p.ground ? Math.min(h, p.groundH ?? 14) : 0;
  const upperH = h - groundH;
  if (upperH > 4) {
    if (w >= 8) pipe(img, x + int(rng, 2, Math.max(2, w - 3)), y + 2, upperH - 2);
    for (let fy = y + 3; fy + 4 < y + upperH; fy += STORY) {
      for (let wx = x + 3; wx + 3 < x + w - 1; wx += int(rng, 6, 10)) {
        if (rng() < 0.55) windowPane(img, wx, fy, 2, 3, rng, { mat, lit: rng() < 0.45 });
        else if (rng() < 0.5) acUnit(img, wx, fy + 1);
      }
    }
  }
  if (p.ground) shopSide(img, x, y + upperH, w, groundH, rng, p.ground.kind, p.ground);
  else if (h > 8 && rng() < 0.5) poster(img, x + int(rng, 2, Math.max(2, w - 4)), y + h - 6, 2, 3, rng);
  finishEdges(img, x, y, w, h, mat, p);
}

// Casa japonesa: madera oscura abajo, revoco claro arriba, pilares y ventanas shōji con luz cálida.
function house(img, x, y, w, h, rng, p) {
  const plaster = MATERIALS.plaster;
  img.rect(x, y, w, h, plaster[1]);
  const woodH = Math.floor(h * 0.45);
  img.rect(x, y + h - woodH, w, woodH, PAL.wood[2]);
  for (let i = x + 1; i < x + w; i += 2) img.vline(i, y + h - woodH, woodH, PAL.wood[1]);
  img.hline(x, y + h - woodH - 1, w, PAL.wood[0]);
  for (let i = x; i < x + w; i += 8) img.vline(i, y, h, PAL.wood[1]); // pilares
  if (p.windows !== false) {
    for (let wx = x + 2; wx + 5 < x + w; wx += 8) {
      const sh = Math.max(2, h - woodH - 3);
      img.rect(wx, y + 1, 5, sh, PAL.amber[4]);
      img.vline(wx + 2, y + 1, sh, PAL.amber[2]); // rejilla del shōji
      if (sh > 2) img.hline(wx, y + 1 + Math.floor(sh / 2), 5, PAL.amber[2]);
    }
  }
  plinth(img, x, y, w, h);
  pilasters(img, x, y, w, h, [PAL.wood[0], PAL.wood[1], PAL.wood[2], PAL.wood[3]]);
}

// Templo tradicional (28-oct): pilares y dinteles bermellón con paneles de revoco, puerta central iluminada con farolillos rojos
// y un friso dorado arriba. "upper" = planta de arriba (más pequeña): paneles shōji encendidos entre los pilares.
function temple(img, x, y, w, h, rng, p) {
  img.rect(x, y, w, h, PAL.wood[1]);
  const pillar = [PAL.orange[1], PAL.mag[3]];
  for (let i = x; i < x + w; i += 6) { img.vline(i, y, h, pillar[0]); img.vline(i + 1, y, h, pillar[1]); } // pilares laqueados
  img.rect(x, y, w, 2, PAL.orange[1]); // dintel
  img.hline(x, y + 2, w, PAL.yellow[2]); // friso dorado
  if (p.upper) {
    for (let wx = x + 3; wx + 3 < x + w; wx += 6) { // shōji encendidos
      img.rect(wx, y + 4, 3, Math.max(2, h - 8), PAL.amber[4]);
      img.vline(wx + 1, y + 4, Math.max(2, h - 8), PAL.amber[2]);
    }
  } else {
    const doorW = Math.min(8, Math.max(4, w - 6));
    const dx = x + Math.floor((w - doorW) / 2);
    img.rect(dx, y + 5, doorW, h - 8, PAL.amber[1]); // puerta abierta y luz de dentro
    img.rect(dx + 1, y + 6, doorW - 2, h - 10, PAL.amber[3]);
    img.vline(dx + Math.floor(doorW / 2), y + 6, h - 10, PAL.amber[1]);
    lantern(img, dx - 3, y + 5, PAL.mag[3], PAL.mag[5]);
    lantern(img, dx + doorW + 1, y + 5, PAL.mag[3], PAL.mag[5]);
    for (let i = x + 1; i < dx - 4; i += 3) img.set(i, y + h - 4, PAL.wood[3]); // vallado bajo
    for (let i = dx + doorW + 4; i < x + w - 1; i += 3) img.set(i, y + h - 4, PAL.wood[3]);
  }
  plinth(img, x, y, w, h);
  pilasters(img, x, y, w, h, [PAL.wood[0], PAL.orange[1], PAL.orange[1], PAL.yellow[2]]);
}

// Gablete (triángulo bajo el tejado a dos aguas): revoco con una viga.
function gable(img, x, y, w, h) {
  img.rect(x, y, w, h, MATERIALS.plaster[1]);
  img.hline(x, y + h - 1, w, PAL.wood[1]);
  img.vline(x + Math.floor(w / 2), y, h, PAL.wood[1]);
}

export const FACADE_PAINTERS = { building, side, house, gable, temple };
