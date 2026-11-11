// Atlas de la ciudad: coloca todas las caras que hay que pintar en una sola imagen (empaquetado por estantes) y pinta
// cada una con su pintor. Una sola imagen = un solo material = una sola llamada de dibujo para toda la ciudad.
// Se ejecuta en el navegador al arrancar el host (y en Node para las vistas previas y los tests).
import { PixelImage } from './pixelImage.js';
import { FACADE_PAINTERS } from './paint/facades.js';
import { ROOF_PAINTERS } from './paint/roofs.js';
import { GARDEN_PAINTERS } from './paint/garden.js';
import { createRng, hashSeed } from './rng.js';
import { PAL } from './palette.js';

export const PAINTERS = { ...FACADE_PAINTERS, ...ROOF_PAINTERS, ...GARDEN_PAINTERS };
export const ATLAS_WIDTH = 1024;

// Empaqueta rectángulos { key, w, h } en filas ("estantes") de ancho fijo, de más alto a más bajo.
// Devuelve la altura usada y un Map key -> { x, y, w, h }. Las claves repetidas comparten zona.
export function packRects(items, width = ATLAS_WIDTH) {
  const unique = new Map();
  for (const item of items) if (!unique.has(item.key)) unique.set(item.key, item);
  const sorted = [...unique.values()].sort((a, b) => b.h - a.h || b.w - a.w);
  const placed = new Map();
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const item of sorted) {
    if (item.w > width) throw new Error(`Cara demasiado ancha para el atlas: ${item.w}px`);
    if (x + item.w > width) { x = 0; y += shelf; shelf = 0; }
    placed.set(item.key, { x, y, w: item.w, h: item.h });
    x += item.w;
    shelf = Math.max(shelf, item.h);
  }
  return { height: y + shelf, placed };
}

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// Pinta el atlas. "faces" viene de cityFaces(). Devuelve { image, regions } (regions: key -> rectángulo en píxeles).
export function paintCityAtlas(faces, width = ATLAS_WIDTH) {
  const { height, placed } = packRects(faces, width);
  const image = new PixelImage(width, nextPow2(height));
  image.rect(0, 0, image.width, image.height, PAL.black);
  const painted = new Set();
  const windows = []; // todas las ventanas pintadas (con la clave de su cara), en píxeles del atlas
  image.windows = windows;
  for (const face of faces) {
    if (painted.has(face.key)) continue;
    painted.add(face.key);
    const { x, y, w, h } = placed.get(face.key);
    const painter = PAINTERS[face.spec.p];
    if (!painter) throw new Error(`Pintor desconocido: ${face.spec.p}`);
    image.setClip(x, y, w, h); // ningún pintor puede salirse de su cara
    image.windowKey = face.key;
    painter(image, x, y, w, h, createRng(hashSeed(face.key)), face.spec);
  }
  image.clearClip();
  image.windows = null;
  return { image, regions: placed, windows };
}
