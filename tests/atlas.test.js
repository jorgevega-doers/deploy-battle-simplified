import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { ATLAS, TILES, tilePixels, tileUv, remapBoxUVs } from '../shared/atlas.js';

test('los nombres de los tiles no se repiten y caben en el atlas', () => {
  assert.equal(new Set(TILES).size, TILES.length);
  assert.ok(TILES.length <= ATLAS.columns * (ATLAS.height / ATLAS.tile), 'hay más tiles que huecos');
  assert.equal(ATLAS.width, ATLAS.columns * ATLAS.tile);
});

test('cada tile está dentro de la imagen y no pisa a otro', () => {
  const seen = new Set();
  for (const name of TILES) {
    const { x, y } = tilePixels(name);
    assert.ok(x >= 0 && y >= 0 && x + ATLAS.tile <= ATLAS.width && y + ATLAS.tile <= ATLAS.height, `${name} fuera del atlas`);
    const key = `${x},${y}`;
    assert.equal(seen.has(key), false, `${name} ocupa un hueco repetido`);
    seen.add(key);
  }
});

test('las UV de cada tile quedan dentro del tile (con medio píxel de margen) y la v está invertida', () => {
  const { u0, u1, v0, v1 } = tileUv('wall_a'); // primer tile: esquina de arriba a la izquierda de la imagen
  assert.ok(u0 > 0 && u0 < u1 && u1 < ATLAS.tile / ATLAS.width);
  assert.ok(v1 < 1 && v1 > v0 && v0 > 1 - ATLAS.tile / ATLAS.height, 'la fila de arriba de la imagen es la v más alta');
  const second = tileUv('wall_b');
  assert.ok(second.u0 > u1, 'el segundo tile está a la derecha del primero');
  const ninth = tileUv(TILES[ATLAS.columns]); // primer tile de la segunda fila
  assert.ok(ninth.v1 < v0, 'la segunda fila está más abajo (v menor)');
});

test('un tile desconocido da un error claro', () => {
  assert.throws(() => tileUv('no_existe'), /Tile desconocido/);
});

test('remapBoxUVs mete cada cara de la caja en su tile', () => {
  // UV originales de una BoxGeometry: cada cara repite las mismas 4 esquinas (0,1) (1,1) (0,0) (1,0).
  const uv = new Float32Array(48);
  for (let face = 0; face < 6; face++) uv.set([0, 1, 1, 1, 0, 0, 1, 0], face * 8);
  const faces = ['wall_a', 'wall_b', 'wall_c', 'wall_top', 't1_side', 'pu_aoe'];
  remapBoxUVs(uv, faces);
  faces.forEach((name, face) => {
    const { u0, u1, v0, v1 } = tileUv(name);
    for (let vertex = 0; vertex < 4; vertex++) {
      const u = uv[(face * 4 + vertex) * 2];
      const v = uv[(face * 4 + vertex) * 2 + 1];
      assert.ok(u >= u0 - 1e-9 && u <= u1 + 1e-9 && v >= v0 - 1e-9 && v <= v1 + 1e-9, `${name}, vértice ${vertex}`);
    }
  });
  assert.throws(() => remapBoxUVs(uv, ['wall_a']), /6 caras/);
});

test('el atlas generado tiene el tamaño correcto y está lleno donde hay tiles', () => {
  const png = readFileSync(resolve(import.meta.dirname, '..', 'assets', 'textures', 'atlas.png'));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'no es un PNG');
  assert.equal(png.readUInt32BE(16), ATLAS.width);
  assert.equal(png.readUInt32BE(20), ATLAS.height);
  // Descomprime la imagen y comprueba que los tiles no están en blanco (todos los píxeles opacos y con color).
  let idat = Buffer.alloc(0);
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') idat = Buffer.concat([idat, png.subarray(offset + 8, offset + 8 + length)]);
    offset += 12 + length;
  }
  const raw = inflateSync(idat);
  const stride = ATLAS.width * 4 + 1;
  const pixel = (x, y) => raw.subarray(y * stride + 1 + x * 4, y * stride + 1 + x * 4 + 4);
  for (const name of TILES) {
    const { x, y } = tilePixels(name);
    let colors = new Set();
    for (let j = 0; j < ATLAS.tile; j++) for (let i = 0; i < ATLAS.tile; i++) {
      const p = pixel(x + i, y + j);
      assert.equal(p[3], 255, `${name}: píxel transparente en ${i},${j}`);
      colors.add(p.join(','));
    }
    assert.ok(colors.size >= 3, `${name} parece vacío o plano (${colors.size} colores)`); // un tile en blanco tendría 1
  }
});
