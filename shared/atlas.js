// Atlas de texturas pixel art: una sola imagen con todos los tiles de 32 x 32 (assets/textures/atlas.png).
// Esta definición la comparten el generador (scripts/generate-textures.js) y el host (para colocar cada cara de cada caja
// en su tile), así que el orden de TILES no se puede cambiar sin volver a generar el atlas. Código puro.
export const ATLAS = Object.freeze({ width: 256, height: 128, tile: 32, columns: 8 });

export const TILES = Object.freeze([
  'wall_a', 'wall_b', 'wall_c', 'wall_top',      // muros: 3 fachadas distintas y el tejado
  't1_side', 't1_top', 't1_dark',                // tanque de P1 (azul): laterales, parte superior, piezas oscuras
  't2_side', 't2_top', 't2_dark',                // tanque de P2 (fucsia)
  'pu_double', 'pu_speed', 'pu_aoe',             // iconos de los power-ups
  't3_side', 't3_top', 't3_dark',                // tanque del bot 3 (cian), modo de un jugador
  't4_side', 't4_top', 't4_dark',                // tanque del bot 4 (ámbar)
  'pu_shield',                                   // icono del power-up de escudo (al final: no mueve los demás tiles)
]);

function tileIndex(name) {
  const index = TILES.indexOf(name);
  if (index === -1) throw new Error(`Tile desconocido: ${name}`);
  return index;
}

// Posición de un tile dentro del atlas, en píxeles (y = 0 es la fila de arriba de la imagen).
export function tilePixels(name) {
  const index = tileIndex(name);
  return { x: (index % ATLAS.columns) * ATLAS.tile, y: Math.floor(index / ATLAS.columns) * ATLAS.tile };
}

// Rectángulo UV (coordenadas de textura 0-1) de un tile. Se recorta medio píxel por cada lado para que, con el
// filtro "más cercano", el borde de un tile nunca "sangre" el color del vecino. En UV la v crece hacia arriba (al
// revés que las filas de la imagen), de ahí la inversión.
export function tileUv(name) {
  const { x, y } = tilePixels(name);
  const inset = 0.5;
  return {
    u0: (x + inset) / ATLAS.width,
    u1: (x + ATLAS.tile - inset) / ATLAS.width,
    v0: 1 - (y + ATLAS.tile - inset) / ATLAS.height,
    v1: 1 - (y + inset) / ATLAS.height,
  };
}

// Reasigna las UV de una caja (BoxGeometry de Three.js, 6 caras de 4 vértices) para que cada cara use un tile del atlas.
// "uv" es el Float32Array del atributo uv (48 números). "faceTiles" son 6 nombres, en el orden de las caras de BoxGeometry:
// [+x, -x, +y (arriba), -y (abajo), +z, -z]. Cada cara debe traer sus UV originales entre 0 y 1.
export function remapBoxUVs(uv, faceTiles) {
  if (faceTiles.length !== 6) throw new Error('Una caja tiene 6 caras');
  for (let face = 0; face < 6; face++) {
    const { u0, u1, v0, v1 } = tileUv(faceTiles[face]);
    for (let vertex = 0; vertex < 4; vertex++) {
      const i = (face * 4 + vertex) * 2;
      uv[i] = u0 + uv[i] * (u1 - u0);
      uv[i + 1] = v0 + uv[i + 1] * (v1 - v0);
    }
  }
  return uv;
}
