// Ciudad completa: edificios del interior (obstáculos), del borde y de las afueras. Es solo una descripción (cajas y
// tejados con el pintor de cada cara); el host la convierte en 3D y el atlas pinta cada cara a su tamaño real.
// Con la misma semilla sale siempre la misma ciudad. El juego (colisiones) no usa nada de aquí.
import { createRng } from '../art/rng.js';
import { interiorBuildings, ROOF_LIFE } from './interior.js';
import { borderBuildings, lampSpots } from './border.js';
import { outskirtsBuildings } from './outskirts.js';
import { faceVisible, TEXELS_PER_CELL } from './parts.js';

export const CITY_SEED = 20261104;

// Color del charco de luz que cada local proyecta en la calle, delante de su fachada sur.
// Casi todo es luz cálida (ámbar): es lo que da el ambiente acogedor; el konbini y el recreativo ponen la nota fría y neón.
// Valores: rampa de luz del suelo ('amber', 'cyan' o 'mag', ver paint/street.js).
const FRONT_LIGHT = {
  konbini: 'cyan', ramen: 'amber', izakaya: 'amber', house: 'amber', apartment: 'amber',
  arcade: 'mag', karaoke: 'mag', shopRow: 'amber', tower: 'amber', park: 'amber',
  workshop: 'amber', market: 'amber', shrine: 'amber', bathhouse: 'amber',
};
// Charcos de luz sobre la calle: { x, y (centro, en celdas), rx, ry, ramp }. Delante de cada local y bajo cada farolillo
// de pared del borde (mismas posiciones que lampSpots); al sur, la luz de los locales que quedan fuera de cámara.
function streetLights(arena, interior) {
  const lights = interior.map(({ type, rect }) => ({
    x: rect.x + rect.w / 2, y: rect.y - 0.5, rx: rect.w * 0.7 + 0.4, ry: 1.1, ramp: FRONT_LIGHT[type] ?? 'amber',
  }));
  for (const spot of lampSpots(arena.width, arena.height)) {
    const dx = spot.side === 'west' ? 0.6 : spot.side === 'east' ? -0.6 : 0;
    const dy = spot.side === 'north' ? -0.6 : 0;
    const wide = spot.side === 'north';
    lights.push({ x: spot.x + dx, y: spot.y + dy, rx: wide ? 1.4 : 0.9, ry: wide ? 0.9 : 1.4, ramp: 'amber' });
  }
  for (let x = 3.5; x < arena.width - 2; x += 5) lights.push({ x, y: 1.6, rx: 1.4, ry: 0.9, ramp: 'amber' });
  return lights;
}

// Fachadas sur del interior: delante de ellas el suelo mojado refleja sus luces (rayas verticales).
const fronts = (interior) => interior.map(({ type, rect }) => ({ x0: rect.x, x1: rect.x + rect.w, y: rect.y, ramp: FRONT_LIGHT[type] ?? 'amber' }));

// Los edificios de alrededor (borde y ciudad de fondo) cambian de un mapa a otro (28-oct): otra semilla y otra silueta. El mapa
// original (0) queda exactamente como estaba.
const SKYLINES = [
  { tall: 1, gaps: 0 },        // DISTRITO: el de siempre
  { tall: 0.8, gaps: 0.08 },   // CRUCE: casas más bajas y algún callejón más
  { tall: 1.25, gaps: -0.05 }, // MURALLA: rascacielos más altos y más juntos
];

export function createCity(arena, seed = CITY_SEED + (arena.mapIndex ?? 0) * 7919) {
  const rng = createRng(seed);
  const interior = interiorBuildings(arena);
  const skyline = SKYLINES[arena.mapIndex ?? 0] ?? SKYLINES[0];
  const buildings = [...interior, ...borderBuildings(arena, rng), ...outskirtsBuildings(arena, rng, skyline)];
  return { buildings, lights: streetLights(arena, interior), fronts: fronts(interior), roofLife: ROOF_LIFE[arena.mapIndex ?? 0] ?? [] };
}

const size = (cells) => Math.max(1, Math.round(cells * TEXELS_PER_CELL));
// Tamaño en píxeles de cada cara (el atlas pinta cada una a su tamaño real: mismo tamaño de píxel en toda la escena).
export function faceSize(part, face) {
  if (part.kind === 'gable') {
    if (face === 'slope') return [size(part.w), size(Math.hypot(part.d / 2, part.h))];
    return [size(part.d), size(part.h)]; // gablete (triángulo)
  }
  if (face === 'top') return [size(part.w), size(part.d)];
  if (face === 'south' || face === 'north') return [size(part.w), size(part.h)];
  return [size(part.d), size(part.h)];
}

// Lista de caras que hay que pintar y dibujar: { part, face, w, h, spec, key }. Las caras que la cámara no ve se saltan.
// Dos caras con el mismo pintor, parámetros, semilla y tamaño comparten la misma zona del atlas ("key").
export function cityFaces(city) {
  const faces = [];
  for (const building of city.buildings) {
    for (const part of building.parts) {
      for (const [face, spec] of Object.entries(part.faces)) {
        if (!spec) continue;
        if (part.kind === 'box' && !faceVisible(part, face)) continue;
        const [w, h] = faceSize(part, face);
        faces.push({ part, face, w, h, spec, key: `${w}x${h}|${JSON.stringify(spec)}` });
      }
    }
  }
  return faces;
}
