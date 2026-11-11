// Piezas con las que se construye la ciudad: cajas y tejados a dos aguas, más ayudas para los objetos de azotea.
// Coordenadas del mundo del juego: x hacia el este, y hacia el norte, z = altura; (x, y) es la esquina mínima.
// Cada cara lleva qué pintor la dibuja y con qué parámetros ({ p: 'building', ... }); null = cara sin dibujar.
import { GRID_WIDTH } from '../constants.js';

// Píxeles de textura por celda: el mismo tamaño de píxel en toda la escena. 16 porque la escena se dibuja a un tercio
// de la resolución (píxel "gordo" como en las referencias) y a esa escala una celda ocupa ~16-18 píxeles de dibujo.
export const TEXELS_PER_CELL = 16;

// La cámara está centrada en x: las caras que miran al lado contrario nunca se ven y no se pintan ni se dibujan.
export const CAMERA_X = GRID_WIDTH / 2;

export function box(x, y, z, w, d, h, faces, { glow = false } = {}) {
  return { kind: 'box', x, y, z, w, d, h, faces, glow };
}
// Tejado a dos aguas con la cumbrera a lo largo del eje x. faces: { slope, gable }.
export function gableRoof(x, y, z, w, d, h, faces) {
  return { kind: 'gable', x, y, z, w, d, h, faces, glow: false };
}
// --- Objetos de azotea (en las azoteas no hay árboles: casetas, parabólicas, tendederos, carteles...) ---
const SHED_WALL = { p: 'shed', seed: 10 };
const SHED_TOP = { p: 'metal', kind: 'top', seed: 10 };
// Caseta de la escalera: caja de hormigón con puerta y un farolillo encima de la puerta (mira al sur).
export const rooftopShed = (x, y, z) => box(x, y, z, 0.7, 0.55, 0.42, { south: SHED_WALL, east: { p: 'shed', blank: true, seed: 11 }, west: { p: 'shed', blank: true, seed: 11 }, top: SHED_TOP });
const DISH = { p: 'dish', seed: 12 };
// Antena parabólica sobre un pie.
export function satelliteDish(x, y, z) {
  return [
    box(x + 0.12, y + 0.1, z, 0.05, 0.05, 0.16, { south: POLE, east: POLE, west: POLE }),
    box(x, y, z + 0.14, 0.3, 0.06, 0.28, { south: DISH, east: POLE, west: POLE, top: POLE }),
  ];
}
// Tendedero: dos postes y una fila de ropa de colores colgada (mira al sur).
export function laundryLine(x, y, z, w) {
  return [
    box(x, y, z, 0.05, 0.05, 0.36, { south: POLE, east: POLE, west: POLE }),
    box(x + w - 0.05, y, z, 0.05, 0.05, 0.36, { south: POLE, east: POLE, west: POLE }),
    box(x + 0.05, y, z + 0.12, w - 0.1, 0.03, 0.22, { south: { p: 'laundry', seed: 13 }, top: POLE }),
  ];
}

// Cerezo en flor (sakura): tronco y una copa hecha de varios grupos de flores a distintas alturas, para que la silueta
// sea redondeada e irregular en vez de un cubo. "x, y" = centro del tronco.
const BARK = { p: 'bark', seed: 8 };
const BLOSSOM = { p: 'blossom', seed: 9 };
const BLOSSOM_TOP = { p: 'blossom', top: true, seed: 9 };
const CLUSTERS = [ // [dx, dy, base z, lado, alto] en unidades de "size"
  [0, 0, 0.32, 0.62, 0.34], [-0.28, 0.06, 0.26, 0.42, 0.3], [0.28, -0.04, 0.28, 0.44, 0.3],
  [0.04, 0.26, 0.3, 0.44, 0.28], [-0.06, -0.24, 0.24, 0.4, 0.26], [0.02, 0.02, 0.6, 0.38, 0.2],
];
export function sakura(x, y, z, size = 1) {
  const blossom = { top: BLOSSOM_TOP, south: BLOSSOM, east: BLOSSOM, west: BLOSSOM };
  return [
    box(x - 0.05, y - 0.05, z, 0.1, 0.1, 0.34 * size, { south: BARK, east: BARK, west: BARK }),
    ...CLUSTERS.map(([dx, dy, bz, side, high]) => {
      const s = side * size;
      return box(x + dx * size - s / 2, y + dy * size - s / 2, z + bz * size, s, s, high * size, blossom);
    }),
  ];
}

// ¿Se ve esta cara desde la cámara? (sur siempre, norte nunca; este/oeste según el lado de la cámara).
export function faceVisible(part, face) {
  if (face === 'north' || face === 'bottom') return false;
  if (face === 'east') return part.x + part.w < CAMERA_X + 1e-6;
  if (face === 'west') return part.x > CAMERA_X - 1e-6;
  return true;
}

// --- Objetos de azotea y de fachada ---
const AC = { p: 'metal', kind: 'ac', seed: 1 };
const AC_TOP = { p: 'metal', kind: 'top', seed: 1 };
export const acBox = (x, y, z) => box(x, y, z, 0.3, 0.26, 0.22, { top: AC_TOP, south: AC, east: AC, west: AC });

const TANK_SIDE = { p: 'metal', kind: 'tank', seed: 2 };
const TANK_TOP = { p: 'metal', kind: 'top', seed: 2 };
const POLE = { p: 'metal', kind: 'plain', seed: 3 };
// Depósito de agua sobre patas.
export function waterTank(x, y, z) {
  const legs = [[0, 0], [0.42, 0], [0, 0.42], [0.42, 0.42]].map(([dx, dy]) => box(x + dx, y + dy, z, 0.06, 0.06, 0.2, { south: POLE, east: POLE, west: POLE }));
  return [...legs, box(x - 0.02, y - 0.02, z + 0.2, 0.52, 0.52, 0.42, { top: TANK_TOP, south: TANK_SIDE, east: TANK_SIDE, west: TANK_SIDE })];
}
// Antena: poste fino con un piloto que brilla arriba.
const LAMP_RED = { p: 'lamp', seed: 4 };
export function antenna(x, y, z, h) {
  return [
    box(x, y, z, 0.05, 0.05, h, { south: POLE, east: POLE, west: POLE }),
    box(x - 0.03, y - 0.03, z + h, 0.11, 0.11, 0.08, { top: LAMP_RED, south: LAMP_RED, east: LAMP_RED, west: LAMP_RED }, { glow: true }),
  ];
}

// Valla publicitaria mirando al sur, sobre dos postes. "params" va al pintor "billboard".
export function billboard(x, y, z, w, h, params, { posts = 0.2 } = {}) {
  const parts = [];
  if (posts > 0) {
    parts.push(box(x + 0.15, y + 0.02, z, 0.06, 0.06, posts, { south: POLE, east: POLE, west: POLE }));
    parts.push(box(x + w - 0.21, y + 0.02, z, 0.06, 0.06, posts, { south: POLE, east: POLE, west: POLE }));
  }
  const edge = { p: 'flat', edge: null, seed: 5 };
  parts.push(box(x, y, z + posts, w, 0.1, h, { south: { p: 'billboard', ...params }, top: edge, east: edge, west: edge }, { glow: true }));
  return parts;
}
// Rótulo vertical que sale de una fachada que mira al este o al oeste: su cara sur es la que se ve (y brilla).
export function bladeSign(x, y, z, w, h, params) {
  const edge = { p: 'flat', seed: 5 };
  return box(x, y, z, w, 0.08, h, { south: { p: 'blade', ...params }, top: edge, east: edge, west: edge }, { glow: true });
}
// Farolillo o piloto pequeño que brilla.
export function lampBox(x, y, z, size, params = {}) {
  const face = { p: 'lamp', ...params, seed: 6 };
  return box(x, y, z, size, size, size * 1.4, { top: face, south: face, east: face, west: face }, { glow: true });
}
