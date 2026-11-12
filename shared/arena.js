// Mapa de la arena: cuadrícula de 32 x 18 celdas de 1 x 1 (proporción 16:9). El eje Y crece hacia arriba y la
// celda (0, 0) está abajo a la izquierda. Código puro compartido: el servidor lo usa para colisiones y el host para dibujar.
//
// Los obstáculos se definen como rectángulos y cada uno se copia girado 180 grados: así el mapa es justo para los
// dos jugadores (P1 abajo a la izquierda, P2 arriba a la derecha). Todos los pasillos miden al menos 2 celdas de
// ancho, porque el tanque ocupa 1 x 1. Los tests (tests/arena.test.js) lo comprueban.
import { GRID_WIDTH, GRID_HEIGHT } from './constants.js';

// Hay 3 MAPAS que se van alternando partida a partida. En todos: obstáculos [x, y, ancho, alto] de la
// esquina inferior izquierda, cada uno con su copia girada 180 grados; nada fuera de x 3-28 / y 3-14 (el anillo de calle de 2
// celdas junto al borde queda libre: salidas de las 4 esquinas, carriles de los coches) y pasillos de al menos 2 celdas.
// El bloque central es su propio reflejo. El arte de cada obstáculo está en shared/city/interior.js (ASSIGNMENTS).
const OBSTACLES = [
  [15, 7, 2, 4],   // bloque central
  [6, 4, 2, 2],
  [11, 3, 2, 2],
  [10, 8, 2, 2],
  [3, 10, 2, 4],
  [20, 4, 4, 2],
  [16, 3, 4, 2],
];

// Celdas (x, y) del suelo, lejos de los puntos de salida, donde pueden aparecer los power-ups.
// Son simétricas respecto al centro, como el mapa.
const POWERUP_CELLS = [
  [13, 8], [18, 9], [13, 9], [18, 8],
  [8, 6], [23, 11], [16, 14], [15, 3],
];

export const MAPS = Object.freeze([
  { // DISTRITO: el original, con las copias algo movidas para que no se vea tan simétrico
    name: 'DISTRITO',
    // Salidas de 1 contra 3 desplazadas (28-oct, scripts/balance-sim.js): arriba-izquierda y abajo-derecha se quedaban encajonadas
    // (cae primero el 37 % de las veces frente al 13 % de las otras dos); 3 celdas por la calle las deja en 25 % cada una.
    spawnShift: { tl: [3, 0], br: [-3, 0] },
    mood: 'night', // ambiente (client/host/moods.js y shared/art/theme.js): night = el original, dusk = atardecer, rain = noche de lluvia
    obstacles: [
      [15, 7, 2, 4],
      [6, 4, 2, 2],
      [11, 3, 2, 2, { dx: -1, w: 3 }],
      [10, 8, 2, 2, { dy: 1 }],
      [3, 10, 2, 4],
      [20, 4, 4, 2],
      [16, 3, 4, 2],
    ],
    powerupCells: POWERUP_CELLS,
  },
  { // CRUCE: torre baja en el centro, parques a los lados y bloques en diagonal
    name: 'CRUCE',
    mood: 'dusk',
    obstacles: [
      [14, 8, 4, 2],
      [5, 4, 2, 3, { dy: 1 }],
      [9, 3, 4, 2, { dx: 1, w: 3 }],
      [9, 8, 2, 3, { dx: -1 }],
      [20, 3, 3, 2],
      [4, 10, 3, 2, { w: 2, h: 3, dx: 1 }],
    ],
    powerupCells: [[12, 6], [19, 11], [16, 5], [15, 12], [7, 8], [24, 9]],
  },
  { // MURALLA: barra central larga, columnas altas y rincones para rebotar; las salidas en las otras dos esquinas
    name: 'MURALLA',
    mood: 'rain',
    spawns: 'tl-br',
    obstacles: [
      [13, 8, 6, 2],
      [4, 3, 2, 4, { dx: 1, h: 3 }], // la copia (arriba a la derecha) es una celda más baja: deja sitio a la salida de esa esquina
      [8, 5, 3, 2],
      [14, 3, 4, 2, { dx: 1 }],
      [21, 4, 2, 4, { h: 3 }],
      [4, 10, 3, 3, { dy: -1 }],
    ],
    powerupCells: [[12, 4], [19, 13], [7, 8], [24, 9], [16, 11], [15, 6]],
  },
]);

// mapIndex: 0, 1 o 2 (ver MAPS).
export function createArena(mapIndex = 0) {
  const map = MAPS[mapIndex] ?? MAPS[0];
  const width = GRID_WIDTH;
  const height = GRID_HEIGHT;
  // grid[y * width + x]: 1 = muro.
  const grid = new Uint8Array(width * height);
  const fill = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[y * width + x] = 1;
  };
  for (let x = 0; x < width; x++) { grid[x] = 1; grid[(height - 1) * width + x] = 1; }
  for (let y = 0; y < height; y++) { grid[y * width] = 1; grid[y * width + width - 1] = 1; }
  const obstacles = []; // rectángulos { x, y, w, h } de todos los obstáculos (con sus copias giradas), para el dibujo
  const addObstacle = (x, y, w, h) => {
    fill(x, y, w, h);
    if (!obstacles.some((o) => o.x === x && o.y === y && o.w === w && o.h === h)) obstacles.push({ x, y, w, h });
  };
  // Cada obstáculo tiene su copia girada 180 grados (mapa justo para los dos), pero la copia puede ir algo desplazada o con otra
  // forma ({ dx, dy, w, h }) para que la simetría no se vea a simple vista. La justicia la vigilan los tests (mismas distancias
  // a pie desde cada salida a los power-ups y al centro).
  for (const [x, y, w, h, copy = {}] of map.obstacles) {
    addObstacle(x, y, w, h);
    addObstacle(width - x - w + (copy.dx ?? 0), height - y - h + (copy.dy ?? 0), copy.w ?? w, copy.h ?? h);
  }
  // Salidas: P1 abajo a la izquierda y P2 arriba a la derecha, o (spawns: 'tl-br') P1 arriba a la izquierda y P2 abajo a la derecha.
  const corners = { bl: { x: 2.5, y: 2.5 }, tr: { x: width - 2.5, y: height - 2.5 }, tl: { x: 2.5, y: height - 2.5 }, br: { x: width - 2.5, y: 2.5 } };
  for (const [key, [dx, dy]] of Object.entries(map.spawnShift ?? {})) { corners[key].x += dx; corners[key].y += dy; }
  const duelOrder = map.spawns === 'tl-br' ? ['tl', 'br'] : ['bl', 'tr'];
  const soloOrder = ['bl', 'tr', 'tl', 'br']; // el jugador, siempre abajo a la izquierda (su esquina más cómoda en todos los mapas)

  const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= width || cy >= height || grid[cy * width + cx] === 1;

  return {
    mapIndex: MAPS.indexOf(map),
    mapName: map.name,
    mood: map.mood ?? 'night',
    width,
    height,
    solid,
    // Centros de los tanques al empezar en 1 contra 1.
    spawns: duelOrder.map((k) => ({ ...corners[k] })),
    // Modo de un jugador (1 contra 3 bots): las cuatro esquinas (en MURALLA el 1 contra 1 usa otras dos, pero aquí el jugador sigue abajo a la izquierda).
    cornerSpawns: soloOrder.map((k) => ({ ...corners[k] })),
    powerupSpots: map.powerupCells.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
    obstacles,
    // Lista de celdas-muro (x, y), para que el host construya el 3D.
    wallCells() {
      const cells = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid[y * width + x] === 1) cells.push([x, y]);
      return cells;
    },
    // Dibujo en texto (arriba = y más alto), útil para depurar y para los tests.
    toAscii() {
      const lines = [];
      for (let y = height - 1; y >= 0; y--) {
        let line = '';
        for (let x = 0; x < width; x++) line += grid[y * width + x] === 1 ? '#' : '.';
        lines.push(line);
      }
      return lines.join('\n');
    },
  };
}
