// Suelo de la arena pintado entero de una vez (16 píxeles por celda, sin repeticiones): calle de Tokio de noche y mojada.
// Asfalto con manchas suaves, aceras de losas de piedra con bordillo alrededor de cada edificio, carriles, pasos de cebra,
// alcantarillas, charcos, la luz cálida de locales y farolillos tiñendo el asfalto, reflejos verticales de las luces
// delante de cada local (suelo mojado), pétalos de cerezo, zonas de power-up y salidas P1/P2.
// La fila 0 de la imagen es el norte (arriba en pantalla): el píxel (px, py) es el punto del mundo (px / 16, alto - py / 16).
import { PixelImage, bayer } from '../pixelImage.js';
import { PAL } from '../palette.js';
import { drawSmall, smallWidth } from '../font.js';
import { int } from '../rng.js';

const T = 16;              // píxeles por celda
const SIDEWALK = 4;        // ancho de la acera alrededor de los muros, en píxeles
const ASPHALT = [PAL.steel[0], PAL.steel[1], PAL.steel[2]];
const PAVING = [PAL.steel[2], PAL.steel[3], PAL.steel[4]];
const PAINT = PAL.steel[6]; // pintura vial (blanco gastado: el blanco puro brillaría con el bloom)

// Tonos del suelo iluminado: [luz tenue, luz fuerte] de cada color de luz.
const POOL_RAMPS = {
  amber: [PAL.amber[0], PAL.amber[1]],
  cyan: [PAL.cyan[0], PAL.cyan[1]],
  mag: [PAL.mag[0], PAL.mag[1]],
};
const REFLECTION = { amber: [PAL.amber[2], PAL.amber[3]], cyan: [PAL.cyan[1], PAL.cyan[2]], mag: [PAL.mag[2], PAL.mag[3]] };

// Zonas de la arena (en celdas del mundo) que siguen el mapa: anillo de calles y pasos de cebra.
const RING_LINES = { horizontal: [2, 16], vertical: [2, 30] };
const CROSSWALKS = [ // { x0, y0, x1, y1, bars: 'h' (barras horizontales) | 'v' }
  { x0: 8.4, y0: 1.15, x1: 10.2, y1: 2.85, bars: 'h' }, { x0: 21.8, y0: 15.15, x1: 23.6, y1: 16.85, bars: 'h' },
  { x0: 1.15, y0: 6.2, x1: 2.85, y1: 8.0, bars: 'v' }, { x0: 29.15, y0: 10.0, x1: 30.85, y1: 11.8, bars: 'v' },
];

// Alcantarillas, repartidas por la calle (centro en celdas del mundo). Las marcadas con steam echan vapor (client/host/lifeAmbient.js).
// Todas están en suelo libre de muros, lejos de las salidas de los tanques y de los charcos de los power-ups (lo comprueba tests/city.test.js).
export const MANHOLES = [
  [6.5, 2.3], [14.5, 2, true], [22, 2.2], [26.5, 2.3, true], [2.2, 5.2], [2.1, 11, true], [2.2, 15], [8.5, 15.7, true], [14, 15.7],
  [22.5, 15.5, true], [29.8, 12.5], [29.8, 6, true], [6, 8.3, true], [13.7, 6.4], [18, 5.8, true], [24.3, 9.6, true], [26, 16],
  [9.2, 10.8], [18.2, 11.8], [28, 10], [4, 7], [8, 2.1],
].map(([x, y, steam = false]) => ({ x, y, steam }));

// Ruido suave (manchas grandes): valor al azar por casilla de "cell" píxeles, interpolado.
function smoothNoise(W, H, cell, rng) {
  const cols = Math.ceil(W / cell) + 2;
  const rows = Math.ceil(H / cell) + 2;
  const grid = Float32Array.from({ length: cols * rows }, () => rng());
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const v = (i, j) => grid[(iy + j) * cols + ix + i];
    const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
    const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

export function paintStreet(arena, city, rng) {
  const W = arena.width * T;
  const H = arena.height * T;
  const img = new PixelImage(W, H);
  const worldY = (py) => arena.height - py / T;

  // Distancia (en píxeles, tipo "cuadrado") de cada píxel al muro más cercano de su entorno: decide acera y bordillo.
  const dist = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = Math.floor(px / T);
      const cy = Math.floor(worldY(py + 0.5));
      let best = 99;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!arena.solid(cx + dx, cy + dy)) continue;
          const left = (cx + dx) * T;
          const top = (arena.height - (cy + dy + 1)) * T;
          const ax = Math.max(0, left - px, px - (left + T - 1));
          const ay = Math.max(0, top - py, py - (top + T - 1));
          best = Math.min(best, Math.max(ax, ay));
        }
      }
      dist[py * W + px] = best;
    }
  }
  const isRoad = (px, py) => dist[py * W + px] > SIDEWALK + 1;

  // 1) Asfalto: manchas grandes suaves (zonas más gastadas o más nuevas) con trama, y poco grano.
  const blotch = smoothNoise(W, H, 20, rng);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const v = blotch(px, py) + (bayer(px, py) - 0.5) * 0.25;
      img.px[py * W + px] = v < 0.32 ? ASPHALT[0] : v > 0.78 ? ASPHALT[2] : ASPHALT[1];
    }
  }
  img.noise(0, 0, W, H, rng, [ASPHALT[0], ASPHALT[2]], 0.03);

  // 2) Aceras de losas de piedra (4 x 4 con junta) y bordillo (luz arriba, sombra abajo).
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const d = dist[py * W + px];
      if (d <= SIDEWALK - 1) {
        const joint = px % 4 === 0 || py % 4 === 0;
        const slab = ((Math.floor(px / 4) * 7 + Math.floor(py / 4) * 13) % 5); // tono de cada losa
        img.set(px, py, joint ? PAVING[0] : slab === 0 ? PAVING[2] : slab === 1 ? PAL.steel[2] : PAVING[1]);
      } else if (d <= SIDEWALK) img.set(px, py, PAL.steel[5]);
      else if (d <= SIDEWALK + 1) img.set(px, py, PAL.steel[0]);
    }
  }

  // 3) Marcas viales: líneas discontinuas del anillo de calles y pasos de cebra.
  const paintIfRoad = (px, py, color) => { if (px >= 0 && py >= 0 && px < W && py < H && isRoad(px, py)) img.set(px, py, rng() < 0.85 ? color : ASPHALT[2]); };
  for (const y of RING_LINES.horizontal) {
    const py = Math.round((arena.height - y) * T) - 1;
    for (let px = 0; px < W; px++) if (px % 11 < 6) paintIfRoad(px, py, PAINT);
  }
  for (const x of RING_LINES.vertical) {
    const px = Math.round(x * T) - 1;
    for (let py = 0; py < H; py++) if (py % 11 < 6) paintIfRoad(px, py, PAINT);
  }
  for (const c of CROSSWALKS) {
    const x0 = Math.round(c.x0 * T);
    const x1 = Math.round(c.x1 * T);
    const y0 = Math.round((arena.height - c.y1) * T);
    const y1 = Math.round((arena.height - c.y0) * T);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const bar = c.bars === 'h' ? (py - y0) % 4 < 2 : (px - x0) % 4 < 2;
        if (bar && rng() < 0.92) img.set(px, py, PAINT);
      }
    }
  }
  drawSmall(img, 'STOP', 11 * T + 1, Math.round((arena.height - 1.6) * T), PAINT); // rótulos junto a los pasos de cebra
  drawSmall(img, 'STOP', 18 * T + 3, Math.round((arena.height - 16.7) * T), PAINT);

  // 4) Detalles: alcantarillas, grietas y charcos.
  const roadSpot = (margin) => {
    for (let tries = 0; tries < 60; tries++) {
      const px = int(rng, margin, W - margin - 1);
      const py = int(rng, margin, H - margin - 1);
      if (isRoad(px, py) && isRoad(px - margin, py - margin) && isRoad(px + margin, py + margin) && isRoad(px - margin, py + margin) && isRoad(px + margin, py - margin)) return [px, py];
    }
    return null;
  };
  for (const m of MANHOLES) { // alcantarillas (posiciones fijas: el host saca vapor de las marcadas con steam)
    const mx = Math.round(m.x * T);
    const my = Math.round((arena.height - m.y) * T);
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const d = Math.hypot(i, j);
      if (d <= 4.2) img.set(mx + i, my + j, d > 3.2 ? PAL.steel[5] : (i + j) % 2 === 0 ? PAL.steel[1] : PAL.steel[3]);
    }
  }
  for (let k = 0; k < 10; k++) { // grietas
    let [x, y] = roadSpot(3) ?? [0, 0];
    for (let s = 0; s < 8; s++) { img.set(x, y, ASPHALT[0]); x += int(rng, -1, 1); y += rng() < 0.6 ? 1 : 0; }
  }
  // Charco: agua oscura que refleja la noche, con un borde claro arriba y las rayas verticales de alguna luz cálida.
  const glints = [PAL.amber[3], PAL.amber[4], PAL.mag[4], PAL.cyan[2]];
  const puddle = (cx, cy, rx, ry, glint) => {
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      const e = (i / rx) ** 2 + (j / ry) ** 2;
      if (e > 1 + (rng() - 0.5) * 0.2) continue;
      img.set(cx + i, cy + j, e > 0.65 ? (bayer(cx + i, cy + j) < 0.5 ? PAL.night[3] : ASPHALT[1]) : PAL.night[3]);
    }
    for (let s = 0; s < 2; s++) {
      const sx = cx + int(rng, -rx + 2, rx - 2);
      for (let j = -ry + 1; j < ry; j++) if (bayer(sx, cy + j) < 0.7) img.set(sx, cy + j, glint);
    }
    img.hline(cx - rx + 2, cy - ry + 1, int(rng, 2, 3), PAL.steel[4]);
  };
  for (let k = 0; k < 7; k++) {
    const spot = roadSpot(8);
    if (spot) puddle(spot[0], spot[1], int(rng, 4, 7), int(rng, 2, 3), glints[k % glints.length]);
  }
  if (arena.mood === 'rain') { // noche de lluvia: muchos más charcos y más grandes, que reflejan los neones
    for (let k = 0; k < 26; k++) {
      const spot = roadSpot(10);
      if (spot) puddle(spot[0], spot[1], int(rng, 5, 10), int(rng, 2, 4), glints[(k + 1) % glints.length]);
    }
  }
  // Donde aparecen los power-ups también hay charcos (antes un círculo cian que no encajaba con la calle).
  arena.powerupSpots.forEach((spot, k) => puddle(Math.round(spot.x * T), Math.round((arena.height - spot.y) * T), 6, 3, glints[k % glints.length]));

  // 5) Luz sobre la calle: el asfalto y las losas se tiñen en dos tonos (tenue y fuerte) con trama. Antes era un color
  //    puesto a puntos; así se parece más a la luz cálida de las referencias.
  const ground = new Set([...ASPHALT, ...PAVING, PAL.steel[5], PAL.night[2], PAL.blue[0]]);
  for (const light of city.lights) {
    const [soft, strong] = POOL_RAMPS[light.ramp] ?? POOL_RAMPS.amber;
    const cx = light.x * T;
    const cy = (arena.height - light.y) * T;
    const rx = light.rx * T;
    const ry = light.ry * T;
    for (let py = Math.floor(cy - ry); py <= cy + ry; py++) {
      for (let px = Math.floor(cx - rx); px <= cx + rx; px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
        if (d >= 1) continue;
        const k = py * W + px;
        if (!ground.has(img.px[k])) continue;
        const s = (1 - d) * (1 - d);
        const b = bayer(px, py);
        if (b < s * 0.55) img.px[k] = strong;
        else if (b < s * 1.5) img.px[k] = soft;
      }
    }
  }

  // 6) Suelo mojado: delante de cada local, rayas verticales con el reflejo de sus luces que se desvanecen hacia el sur.
  for (const front of city.fronts) {
    const [mid, bright] = REFLECTION[front.ramp] ?? REFLECTION.amber;
    const strong = (POOL_RAMPS[front.ramp] ?? POOL_RAMPS.amber)[1];
    const top = Math.round((arena.height - front.y) * T) + SIDEWALK + 2;
    for (let px = Math.round(front.x0 * T) + 2; px < front.x1 * T - 2; px += int(rng, 1, 4)) {
      const length = int(rng, 2, 8);
      for (let j = 0; j < length; j++) {
        const py = top + j;
        if (py >= H || !isRoad(px, py)) break;
        if (bayer(px, py) >= 1 - j / length) continue;
        const r = rng();
        img.set(px, py, j < 3 && r < 0.25 ? bright : r < 0.55 ? mid : strong);
      }
    }
  }

  // 7) Pétalos de cerezo caídos por la calle (pocos y sueltos).
  for (let k = 0; k < 50; k++) {
    const px = int(rng, 0, W - 1);
    const py = int(rng, 0, H - 1);
    if (dist[py * W + px] > 2) img.set(px, py, k % 3 ? PAL.sakura[2] : PAL.sakura[3]);
  }

  // 8) Salidas P1 (azul) y P2 (magenta) pintadas en el suelo.
  arena.spawns.forEach((spawn, index) => {
    const color = index === 0 ? PAL.blue[4] : PAL.mag[3];
    const cx = Math.round(spawn.x * T);
    const cy = Math.round((arena.height - spawn.y) * T);
    img.frame(cx - 9, cy - 9, 18, 18, color);
    const label = `P${index + 1}`;
    drawSmall(img, label, cx - Math.floor(smallWidth(label) / 2), cy + 3, color);
  });
  return img;
}

// Asfalto que se repite fuera de la arena (64 x 64): calles de la ciudad de fondo.
export function paintOuterGround(rng) {
  const img = new PixelImage(64, 64);
  img.rect(0, 0, 64, 64, PAL.night[2]);
  img.noise(0, 0, 64, 64, rng, [PAL.night[1], PAL.night[3]], 0.12);
  for (let i = 0; i < 64; i += 16) img.hline(i, 31, 8, PAL.steel[2]);
  img.hline(0, 0, 64, PAL.steel[1]);
  img.vline(0, 0, 64, PAL.steel[1]);
  return img;
}
