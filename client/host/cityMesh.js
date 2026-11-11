// Convierte la descripción de la ciudad (shared/city) en UNA malla de Three.js: todas las caras de todos los edificios
// en una sola geometría con un solo material (una llamada de dibujo). Las texturas se pintan aquí mismo al arrancar
// (shared/art) y se suben como DataTexture; con la misma semilla salen siempre iguales.
// Material sin luces (MeshBasicMaterial): el pixel art conserva sus colores exactos y el volumen lo da un sombreado
// fijo por orientación de cara (vertexColors). Es lo más barato que hay.
import {
  BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, DataTexture, NearestFilter, SRGBColorSpace,
  RepeatWrapping, PlaneGeometry, RGBAFormat, UnsignedByteType, Points, PointsMaterial, AdditiveBlending, Color,
} from 'three';
import { PAL } from '../../shared/art/palette.js';
import { createCity, cityFaces, CITY_SEED } from '../../shared/city/index.js';
import { faceVisible } from '../../shared/city/parts.js';
import { paintCityAtlas } from '../../shared/art/cityAtlas.js';
import { paintStreet, paintOuterGround } from '../../shared/art/paint/street.js';
import { createRng } from '../../shared/art/rng.js';
import { applyTheme } from '../../shared/art/theme.js';

// Luz fija de cada orientación: arriba lo más claro, el frente (sur, hacia la cámara) casi igual, los lados más oscuros.
const SHADE = { top: 1, south: 0.9, east: 0.74, west: 0.74, slopeSouth: 0.96, slopeNorth: 0.72, gable: 0.8 };

function pixelTexture(image, { repeat = false } = {}) {
  const texture = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  if (repeat) { texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping; }
  texture.needsUpdate = true;
  return texture;
}

// Acumula cuadriláteros (y triángulos) con posición, UV y sombreado. Mundo del juego (x, y, z) -> Three.js (x, z, -y).
function createBuilder(atlasW, atlasH) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  // Rectángulo del atlas -> UV. La fila 0 de la imagen es v = 0 (la DataTexture no se voltea). Medio píxel hacia dentro
  // para que, con el filtro "más cercano", nunca se cuele el color de la cara vecina.
  const uvRect = (r) => ({ u0: (r.x + 0.5) / atlasW, u1: (r.x + r.w - 0.5) / atlasW, vTop: (r.y + 0.5) / atlasH, vBottom: (r.y + r.h - 0.5) / atlasH });
  const vertex = (x, y, z, u, v, shade) => {
    pos.push(x, z, -y);
    uv.push(u, v);
    col.push(shade, shade, shade);
    return pos.length / 3 - 1;
  };
  return {
    // Esquinas en orden: abajo-izquierda, abajo-derecha, arriba-derecha, arriba-izquierda (vistas desde fuera).
    quad(bl, br, tr, tl, rect, shade) {
      const { u0, u1, vTop, vBottom } = uvRect(rect);
      const a = vertex(...bl, u0, vBottom, shade);
      const b = vertex(...br, u1, vBottom, shade);
      const c = vertex(...tr, u1, vTop, shade);
      const d = vertex(...tl, u0, vTop, shade);
      idx.push(a, b, c, a, c, d);
    },
    // Triángulo con la base abajo y el vértice arriba en el centro (gableteS).
    triangle(bl, br, top, rect, shade) {
      const { u0, u1, vTop, vBottom } = uvRect(rect);
      const a = vertex(...bl, u0, vBottom, shade);
      const b = vertex(...br, u1, vBottom, shade);
      const c = vertex(...top, (u0 + u1) / 2, vTop, shade);
      idx.push(a, b, c);
    },
    build() {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
      geometry.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
      return geometry;
    },
  };
}

function addBox(b, part, face, rect) {
  const { x, y, z, w, d, h } = part;
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  const s = part.glow ? 1 : SHADE[face];
  if (face === 'south') b.quad([x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1], rect, s);
  else if (face === 'east') b.quad([x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1], rect, s);
  else if (face === 'west') b.quad([x, y1, z], [x, y, z], [x, y, z1], [x, y1, z1], rect, s);
  else if (face === 'top') b.quad([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], rect, s);
}

function addGable(b, part, face, rect) {
  const { x, y, z, w, d, h } = part;
  const x1 = x + w;
  const ym = y + d / 2;
  const z1 = z + h;
  if (face === 'slope') {
    b.quad([x, y, z], [x1, y, z], [x1, ym, z1], [x, ym, z1], rect, SHADE.slopeSouth);
    b.quad([x1, y + d, z], [x, y + d, z], [x, ym, z1], [x1, ym, z1], rect, SHADE.slopeNorth);
  } else {
    // Gabletes: solo el que mira hacia la cámara.
    if (faceVisible({ x, w }, 'east')) b.triangle([x1, y, z], [x1, y + d, z], [x1, ym, z1], rect, SHADE.gable);
    if (faceVisible({ x, w }, 'west')) b.triangle([x, y + d, z], [x, y, z], [x, ym, z1], rect, SHADE.gable);
  }
}

// --- Halos de luz: un punto con suma de luz (blending aditivo) en cada farolillo, cartel, valla y escaparate. Es el
// brillo suave de las referencias; a la resolución reducida sale en anillos pixelados. Una llamada de dibujo por tamaño.
const GLOW_SIZES = { small: 1.4, medium: 2.6, large: 4.2 }; // diámetro en celdas
const FRONT_GLOW = { amber: PAL.amber[3], cyan: PAL.cyan[2], mag: PAL.mag[4] };

// Disco de anillos escalonados (16 x 16): el halo se ve "pixel art" en vez de un degradado liso.
function glowTexture() {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = d < 0.25 ? 255 : d < 0.5 ? 140 : d < 0.75 ? 60 : d < 1 ? 22 : 0;
      data.set([255, 255, 255, a], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
// Color empaquetado de la paleta (bytes R, G, B, A) -> Color de Three.js.
export const toColor = (packed) => new Color().setRGB((packed & 255) / 255, ((packed >>> 8) & 255) / 255, ((packed >>> 16) & 255) / 255, SRGBColorSpace);

function glowSpots(city) {
  const spots = [];
  for (const building of city.buildings) {
    for (const part of building.parts) {
      if (!part.glow) continue;
      const spec = part.faces.south ?? part.faces.top;
      const color = spec?.border ?? spec?.color ?? PAL.amber[3];
      const size = spec?.p === 'billboard' ? 'large' : spec?.p === 'blade' ? 'medium' : 'small';
      // kind: lo que anima el host (lifeLights.js): los farolillos respiran y los carteles de neón zumban y se apagan un instante.
      spots.push({ x: part.x + part.w / 2, y: part.y - 0.05, z: part.z + part.h / 2, color, size, kind: size === 'small' ? 'lantern' : 'sign' });
    }
  }
  for (const front of city.fronts) {
    spots.push({ x: (front.x0 + front.x1) / 2, y: front.y - 0.1, z: 0.45, color: FRONT_GLOW[front.ramp] ?? PAL.amber[3], size: 'medium', kind: 'front' });
  }
  return spots;
}

function addGlows(scene, city) {
  const texture = glowTexture();
  const spots = glowSpots(city);
  return Object.entries(GLOW_SIZES).map(([name, diameter]) => {
    const group = spots.filter((s) => s.size === name);
    const positions = new Float32Array(group.length * 3);
    const colors = new Float32Array(group.length * 3);
    group.forEach((s, i) => {
      positions.set([s.x, s.z, -s.y], i * 3);
      const c = toColor(s.color);
      colors.set([c.r, c.g, c.b], i * 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const colorAttribute = new BufferAttribute(colors, 3);
    geometry.setAttribute('color', colorAttribute);
    const material = new PointsMaterial({
      size: diameter, map: texture, vertexColors: true, transparent: true, opacity: 0.38,
      blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    // "base" guarda el color original para que lifeLights.js pueda atenuarlo sin perderlo.
    return { points, colorAttribute, base: Float32Array.from(colors), kinds: group.map((s) => s.kind) };
  });
}

// Crea la ciudad, el suelo de la arena y el suelo de fuera, y los añade a la escena. Devuelve datos para medir.
export function createCityMeshes(scene, arena) {
  const started = performance.now();
  const city = createCity(arena);
  const faces = cityFaces(city);
  const { image, regions, windows } = paintCityAtlas(faces);
  applyTheme(image, arena.mood); // atardecer o lluvia: ajuste de color de todo el atlas (el original no cambia)
  const builder = createBuilder(image.width, image.height);
  for (const face of faces) {
    const rect = regions.get(face.key);
    if (face.part.kind === 'gable') addGable(builder, face.part, face.face, rect);
    else addBox(builder, face.part, face.face, rect);
  }
  const atlas = pixelTexture(image);
  const buildings = new Mesh(builder.build(), new MeshBasicMaterial({ map: atlas, vertexColors: true }));
  buildings.frustumCulled = false;
  scene.add(buildings);

  // Suelo de la arena: una sola imagen pintada entera (sin repeticiones). Fila 0 = norte.
  const streetImage = applyTheme(paintStreet(arena, city, createRng(CITY_SEED + 1)), arena.mood);
  const floorBuilder = createBuilder(streetImage.width, streetImage.height);
  floorBuilder.quad([0, 0, 0], [arena.width, 0, 0], [arena.width, arena.height, 0], [0, arena.height, 0], { x: -0.5, y: -0.5, w: streetImage.width + 1, h: streetImage.height + 1 }, 1);
  const floor = new Mesh(floorBuilder.build(), new MeshBasicMaterial({ map: pixelTexture(streetImage), vertexColors: true }));
  scene.add(floor);

  // Suelo de fuera: asfalto oscuro repetido, un poco por debajo para que no se mezcle con el de la arena.
  const outerTexture = pixelTexture(applyTheme(paintOuterGround(createRng(CITY_SEED + 2)), arena.mood), { repeat: true });
  const size = 140;
  outerTexture.repeat.set(size / 4, size / 4); // la imagen de 64 píxeles cubre 4 x 4 celdas (16 píxeles por celda)
  const outer = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: outerTexture }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(arena.width / 2, -0.01, -arena.height / 2);
  scene.add(outer);

  const glows = addGlows(scene, city);

  // Para dar vida a la ciudad (client/host/life*.js): la descripción, las caras, dónde está cada una en el atlas, las
  // ventanas pintadas y los halos de luz con sus colores originales.
  return {
    atlasSize: `${image.width}x${image.height}`, faces: faces.length, buildMs: Math.round(performance.now() - started),
    meshes: [buildings, floor, outer, ...glows.map((g) => g.points)],
    life: { city, faceList: faces, regions, windows, glows },
  };
}
