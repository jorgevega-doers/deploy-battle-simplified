// Edificios del borde de la arena: una hilera de edificios de distinta anchura, fondo y altura cuya cara interior
// coincide EXACTAMENTE con el rectángulo de juego (la colisión del borde no cambia). Hacia fuera se alargan lo que haga falta.
// Alturas según el lado: al sur (cerca de la cámara) bajos para no tapar a los tanques; a los lados suben hacia el norte;
// al norte (detrás de la arena) son altos y con vallas: forman el "skyline" que se ve al fondo.
import { box, acBox, waterTank, antenna, billboard, bladeSign, rooftopShed, satelliteDish, laundryLine } from './parts.js';
import { randomFront, sideFor, splitRange, ADS, NEON_STYLES, BLADE_TEXTS } from './facadeKit.js';
import { pick, chance } from '../art/rng.js';

const side = (seed) => ({ p: 'side', mat: 'navy', seed });
const ROOF_MATS = ['slate', 'indigo', 'steel', 'indigo'];
const roof = (seed, extra = {}) => ({ p: 'roof', mat: ROOF_MATS[seed % ROOF_MATS.length], seed, ...extra });

function northRow(W, H, rng, out) {
  const y = H - 1;
  for (const [x0, x1] of splitRange(0, W, rng, 2, 5)) {
    const id = 3000 + out.length * 20;
    const w = x1 - x0;
    const d = 1.4 + rng() * 1.6;
    const h = 2.3 + rng() * 2.0;
    const front = randomFront(rng, id);
    const parts = [box(x0, y, 0, w, d, h, { south: front, east: sideFor(front, id + 1), west: sideFor(front, id + 2), top: roof(id + 3) })];
    if (w >= 3 && chance(rng, 0.45)) { // cuerpo superior retranqueado: silueta de torre
      const h2 = 1.0 + rng() * 1.6;
      parts.push(box(x0 + 0.4, y + 0.5, h, w - 0.8, d - 0.7, h2, { south: { p: 'building', mat: 'indigo', upper: 'office', seed: id + 4 }, east: side(id + 5), west: side(id + 6), top: roof(id + 7) }));
    } else if (chance(rng, 0.55)) { // valla publicitaria en la azotea, mirando a la arena
      parts.push(...billboard(x0 + 0.25, y + 0.2, h, w - 0.5, 0.9 + rng() * 0.5, pick(rng, ADS)));
    } else if (chance(rng, 0.5)) { // caseta de escalera y parabólica
      parts.push(rooftopShed(x0 + 0.3, y + 0.3, h), ...satelliteDish(x0 + w - 0.6, y + 0.4, h));
    } else {
      parts.push(...waterTank(x0 + 0.3, y + d - 0.8, h), ...antenna(x0 + w - 0.4, y + 0.4, h, 0.6 + rng() * 0.5));
    }
    out.push({ id, type: 'border-n', parts });
  }
}

function southRow(W, rng, out) {
  for (const [x0, x1] of splitRange(0, W, rng, 2, 5)) {
    const id = 3000 + out.length * 20;
    const w = x1 - x0;
    const d = 1.3 + rng() * 1.2;
    const h = 0.6 + rng() * 0.35;
    const front = randomFront(rng, id, { tall: false });
    const parts = [box(x0, 1 - d, 0, w, d, h, { south: front, east: sideFor(front, id + 1), west: sideFor(front, id + 2), top: roof(id + 3, chance(rng, 0.3) ? { rim: pick(rng, NEON_STYLES).border } : {}) })];
    // Azoteas cercanas a la cámara (se ven mucho): casetas, tendederos, parabólicas y aparatos de aire, sin árboles.
    const r = rng();
    if (r < 0.35) parts.push(rooftopShed(x0 + 0.3, 1 - d + 0.3, h));
    else if (r < 0.6 && w >= 2) parts.push(...laundryLine(x0 + 0.3, 1 - d / 2, h, Math.min(1.6, w - 0.6)));
    else if (r < 0.8) parts.push(...satelliteDish(x0 + 0.5, 1 - d + 0.4, h));
    for (let k = 0; k < Math.floor(w / 1.5); k++) if (chance(rng, 0.6)) parts.push(acBox(x0 + 0.3 + k * 1.4, 1 - d + 0.3 + rng() * (d - 0.8), h));
    out.push({ id, type: 'border-s', parts });
  }
}

// Columna lateral. east = false: lado oeste (la fachada interior mira al este); true: lado este (mira al oeste).
function sideColumn(W, H, rng, out, east) {
  for (const [y0, y1] of splitRange(1, H - 1, rng, 2, 4)) {
    const id = 3000 + out.length * 20;
    const len = y1 - y0;
    const d = 1.4 + rng() * 1.2;
    const t = (y0 + y1) / 2 / H; // 0 al sur, 1 al norte
    const h = 0.9 + t * 1.9 + rng() * 0.4;
    const x = east ? W - 1 : 1 - d;
    const front = randomFront(rng, id, { tall: h > 1.6 });
    const faces = { south: { p: 'building', mat: front.mat, upper: front.upper, seed: id + 1 }, top: roof(id + 2) };
    if (east) { faces.west = front; faces.east = side(id + 3); } else { faces.east = front; faces.west = side(id + 3); }
    const parts = [box(x, y0, 0, d, len, h, faces)];
    if (h > 1.7 && chance(rng, 0.6)) { // rótulo vertical que sale hacia la arena (por encima de los tanques)
      const style = pick(rng, NEON_STYLES);
      const bx = east ? W - 1 - 0.38 : 1;
      parts.push(bladeSign(bx, y0 + 0.2, 1.0, 0.38, Math.min(1.3, h - 1.1), { text: pick(rng, BLADE_TEXTS), border: style.border, glyph: style.core }));
    }
    if (chance(rng, 0.3)) parts.push(rooftopShed(x + 0.3, y0 + 0.3, h));
    else if (chance(rng, 0.5)) parts.push(acBox(x + 0.3, y0 + 0.4, h), acBox(x + 0.3, y0 + len - 0.7, h));
    else parts.push(...antenna(x + d / 2, y0 + len / 2, h, 0.4 + rng() * 0.4));
    out.push({ id, type: east ? 'border-e' : 'border-w', parts });
  }
}

// Farolillos de pared en las fachadas del borde (norte, oeste y este), cada LAMP_SPACING celdas, justo por encima de los
// tanques. Debajo de cada uno, la calle lleva su charco de luz ámbar (city/index.js). Al sur no hay: esa fachada no se ve.
const LAMP_SPACING = 5;
export function lampSpots(W, H) {
  const spots = [];
  for (let x = 3.5; x < W - 2; x += LAMP_SPACING) spots.push({ x: W - x, y: H - 1, side: 'north' });
  for (let y = 4.5; y < H - 2; y += LAMP_SPACING) spots.push({ x: 1, y, side: 'west' }, { x: W - 1, y: H - y, side: 'east' });
  return spots;
}

export function borderBuildings(arena, rng) {
  const out = [];
  northRow(arena.width, arena.height, rng, out);
  southRow(arena.width, rng, out);
  sideColumn(arena.width, arena.height, rng, out, false);
  sideColumn(arena.width, arena.height, rng, out, true);
  // Sin farolillos de pared (26-oct): flotaban sobre los carteles de las fachadas; el charco de luz del suelo se queda.
  return out;
}
