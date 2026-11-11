// Ciudad de fondo, fuera de la arena: dos filas de torres al norte (cada vez más altas, con vallas luminosas) y una
// franja de edificios a cada lado. No afecta al juego: solo rellena lo que se ve alrededor y la niebla la funde al fondo.
import { box, billboard, antenna, waterTank } from './parts.js';
import { randomFront, sideFor, splitRange, ADS } from './facadeKit.js';
import { pick, chance } from '../art/rng.js';

const side = (seed) => ({ p: 'side', mat: 'indigo', seed });
const ROOF_MATS = ['slate', 'indigo', 'indigo', 'steel'];
const roof = (seed) => ({ p: 'roof', mat: ROOF_MATS[seed % ROOF_MATS.length], seed });

// Fila de edificios mirando al sur entre x0 y x1, con la fachada en "y" y fondo "depth".
function row(out, rng, x0, x1, y, depth, minH, maxH, { ads = 0.3, gapChance = 0.25 } = {}) {
  for (const [a, b] of splitRange(x0, x1, rng, 2, 5)) {
    if (chance(rng, gapChance)) continue; // callejón
    const id = 5000 + out.length * 20;
    const w = b - a;
    const h = minH + rng() * (maxH - minH);
    const dy = rng() * 0.8;
    const front = randomFront(rng, id);
    const parts = [box(a, y + dy, 0, w, depth, h, { south: front, east: sideFor(front, id + 1), west: sideFor(front, id + 2), top: roof(id + 3) })];
    if (chance(rng, ads)) parts.push(...billboard(a + 0.3, y + dy + 0.3, h, w - 0.6, 1.0 + rng() * 0.8, pick(rng, ADS)));
    else if (chance(rng, 0.5)) parts.push(...antenna(a + w / 2, y + dy + depth / 2, h, 0.8 + rng() * 1.2));
    else parts.push(...waterTank(a + 0.4, y + dy + 0.4, h));
    out.push({ id, type: 'outskirts', parts });
  }
}

// Columna de edificios a un lado (fachada hacia la arena), del sur al norte, cada vez más altos.
function column(out, rng, x, depth, y0, y1, east, minH, maxH) {
  for (const [a, b] of splitRange(y0, y1, rng, 2, 4)) {
    if (chance(rng, 0.2)) continue;
    const id = 5000 + out.length * 20;
    const t = (a - y0) / (y1 - y0);
    const h = minH + t * (maxH - minH) + rng() * 0.8;
    const front = randomFront(rng, id);
    const faces = { south: { p: 'building', mat: front.mat, upper: front.upper, seed: id + 1 }, top: roof(id + 2) };
    if (east) { faces.west = front; faces.east = side(id + 3); } else { faces.east = front; faces.west = side(id + 3); }
    out.push({ id, type: 'outskirts', parts: [box(x, a, 0, depth, b - a, h, faces), ...antenna(x + depth / 2, a + 0.5, h, 0.5 + rng())] });
  }
}

// skyline = { tall, gaps }: escala de las alturas y callejones de más o de menos (cada mapa tiene su silueta; 1 y 0 = el original).
export function outskirtsBuildings(arena, rng, { tall = 1, gaps = 0 } = {}) {
  const W = arena.width;
  const H = arena.height;
  const out = [];
  row(out, rng, -10, W + 10, H + 2.6, 2.4, 4.0 * tall, 7.0 * tall, { ads: 0.35, gapChance: 0.15 + gaps });
  row(out, rng, -12, W + 12, H + 6.2, 3.0, 6.5 * tall, 11.0 * tall, { ads: 0.4, gapChance: 0.1 + gaps });
  column(out, rng, -4.2, 2.4, -3, H + 2, false, 1.6 * tall, 4.5 * tall);
  column(out, rng, W + 1.8, 2.4, -3, H + 2, true, 1.6 * tall, 4.5 * tall);
  column(out, rng, -8.4, 3.0, -1, H + 3, false, 3.0 * tall, 7.0 * tall);
  column(out, rng, W + 5.4, 3.0, -1, H + 3, true, 3.0 * tall, 7.0 * tall);
  return out;
}
