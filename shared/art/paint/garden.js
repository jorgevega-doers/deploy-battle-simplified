// Jardín japonés (el parque de cerezos de la arena) a 16 píxeles por celda: muro de piedra, seto, grava rastrillada con
// piedras de paso y pétalos caídos, y el farol de piedra (tōrō).
import { PAL } from '../palette.js';
import { int } from '../rng.js';

// Ambiente nocturno cálido (26-oct, petición del usuario): los parques tiraban a verde y gris fríos y desentonaban con la
// ciudad de farolillos. Se multiplica cada canal por un factor (menos azul y verde = más cálido y oscuro).
export const WARM_NIGHT = [0.82, 0.68, 0.62];
export function warm(img, x, y, w, h, [fr, fg, fb] = WARM_NIGHT) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const c = img.px[j * img.width + i];
      img.px[j * img.width + i] = (((c >>> 24) << 24) | (Math.round(((c >>> 16) & 255) * fb) << 16) | (Math.round(((c >>> 8) & 255) * fg) << 8) | Math.round((c & 255) * fr)) >>> 0;
    }
  }
}

function stone(img, x, y, w, h) {
  img.rect(x, y, w, h, PAL.steel[3]);
  for (let j = 0; j < h; j += 3) {
    img.hline(x, y + j, w, PAL.steel[2]);
    for (let i = (j / 3) % 2 ? 2 : 0; i < w; i += 5) img.vline(x + i, y + j, 3, PAL.steel[2]);
  }
  img.hline(x, y, w, PAL.steel[5]);
  img.hline(x, y + 1, w, PAL.green[1]); // musgo
  warm(img, x, y, w, h);
}

function hedge(img, x, y, w, h, rng) {
  img.rect(x, y, w, h, PAL.green[1]);
  for (let k = 0; k < Math.floor((w * h) / 4); k++) img.set(x + int(rng, 0, w - 1), y + int(rng, 0, h - 1), rng() < 0.6 ? PAL.green[2] : PAL.green[0]);
  warm(img, x, y, w, h);
  for (let k = 0; k < Math.max(1, Math.floor((w * h) / 20)); k++) img.set(x + int(rng, 0, w - 1), y + int(rng, 0, h - 1), PAL.sakura[2]); // flores caídas (sin calentar)
}

// Estanque redondo en la parte NORTE del jardín (a la izquierda del cerezo y bajo el farol): el muro del sur tapa desde la
// cámara casi la mitad de abajo del jardín y allí no se vería. Borde de piedras, agua azul con rayas de reflejo, dos carpas
// naranjas y un nenúfar.
function pond(img, x, y, w, h) {
  const cx = x + Math.round(w * 0.22);
  const cy = y + Math.round(h * 0.4); // justo debajo del farol (norte) y por encima del torii (que lo taparía más al sur)
  const rx = Math.max(3, Math.round(w * 0.2));
  const ry = Math.max(2, Math.round(h * 0.13));
  for (let j = -ry - 1; j <= ry + 1; j++) {
    for (let i = -rx - 1; i <= rx + 1; i++) {
      const d = (i / rx) ** 2 + (j / ry) ** 2;
      if (d <= 1) img.set(cx + i, cy + j, j % 2 === 0 ? PAL.blue[4] : PAL.blue[3]); // agua clara con rayas de reflejo
      else if (d <= 1.55) img.set(cx + i, cy + j, (i + j) % 2 ? PAL.steel[5] : PAL.steel[3]); // piedras del borde
    }
  }
  img.set(cx - 2, cy, PAL.orange[2]); img.set(cx - 1, cy, PAL.orange[1]); // carpa
  img.set(cx + 2, cy + 1, PAL.orange[2]);                                  // otra carpa
  img.set(cx + 1, cy - 1, PAL.green[3]);                                   // nenúfar
}

function gravel(img, x, y, w, h, rng, spec) {
  img.rect(x, y, w, h, PAL.steel[4]);
  for (let j = y + 1; j < y + h; j += 2) img.hline(x, j, w, PAL.steel[3]);
  for (let k = 0, sx = x + 2; sx + 3 < x + w && k < 5; k++, sx += int(rng, 4, 6)) { // piedras de paso
    const sy = y + h - 4 - Math.floor(k * ((h - 6) / 5));
    img.rect(sx, sy, 3, 2, PAL.steel[2]);
    img.hline(sx, sy, 3, PAL.steel[5]);
  }
  warm(img, x, y, w, h);
  for (let k = 0; k < Math.floor((w * h) / 16); k++) img.set(x + int(rng, 0, w - 1), y + int(rng, 0, h - 1), PAL.sakura[2]); // pétalos caídos
  if (spec?.pond) pond(img, x, y, w, h);
}

function stoneLantern(img, x, y, w, h) {
  img.rect(x, y, w, h, PAL.steel[4]);
  img.set(x + Math.floor(w / 2), y + Math.floor(h / 3), PAL.amber[4]);
  if (w > 2) img.set(x + Math.floor(w / 2) - 1, y + Math.floor(h / 3), PAL.amber[3]);
}

export const GARDEN_PAINTERS = { stone, hedge, gravel, stoneLantern };
