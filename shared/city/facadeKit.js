// Fachadas al azar (con semilla) para los edificios del borde y de las afueras: combinan una planta baja de tienda,
// plantas de viviendas, oficinas u hotel, carteles horizontales y rótulos verticales con textos de la paleta de neón.
import { PAL } from '../art/palette.js';
import { pick, chance } from '../art/rng.js';

const MATS = ['navy', 'navy', 'indigo', 'indigo', 'slate', 'steel', 'plum'];
const UPPERS = ['apartment', 'apartment', 'office', 'office', 'hotel'];
const GROUNDS = [
  { kind: 'bar', sign: 'BAR' }, { kind: 'bar', sign: 'SUSHI' }, { kind: 'bar', sign: 'CAFE' }, { kind: 'closed', vending: PAL.cyan[2] },
  { kind: 'closed', vending: PAL.mag[4] }, { kind: 'izakaya' }, { kind: 'ramen', sign: 'ラーメン', noren: PAL.blue[3] },
  { kind: 'karaoke' }, { kind: 'arcade', sign: 'GAME' }, { kind: 'hotel', sign: 'HOTEL' },
  { kind: 'konbini', sign: 'NANA MART', stripes: [PAL.shop[0], PAL.shop[1], PAL.shop[2]], textColor: PAL.shop[2] },
];
// Textos de carteles al azar: sin la marca (DOERS sale solo en unas pocas vallas y en la torre central).
export const SIGN_TEXTS = ['NEON', 'TOKYO', 'SUSHI', 'PACHINKO', 'CAFE', '24H', 'HOTEL', 'ラーメン', 'カラオケ', 'ホテル', 'ゲーム', 'NOODLE'];
export const BLADE_TEXTS = ['カラオケ', 'ホテル', 'ゲーム', 'ラーメン', 'バー', null, null];
export const NEON_STYLES = [
  { bg: PAL.night[0], border: PAL.mag[4], core: PAL.white, glow: PAL.mag[4] },
  { bg: PAL.night[0], border: PAL.cyan[3], core: PAL.white, glow: PAL.cyan[2] },
  { bg: PAL.blue[0], border: PAL.yellow[3], core: PAL.yellow[4], glow: PAL.orange[1] },
  { bg: PAL.night[1], border: PAL.blue[5], core: PAL.white, glow: PAL.blue[4] },
  { bg: PAL.wood[0], border: PAL.amber[3], core: PAL.yellow[4], glow: PAL.amber[2] }, // farolillo cálido
  { bg: PAL.wood[0], border: PAL.amber[3], core: PAL.yellow[4], glow: PAL.amber[2] },
];
export const ADS = [
  { lines: ['DEPLOY', 'BATTLE'], bg: [PAL.blue[1], PAL.blue[3]], border: PAL.cyan[3], glow: PAL.cyan[2] },
  { lines: ['THE BADASS', 'TEAM'], bg: [PAL.mag[1], PAL.blue[1]], border: PAL.mag[5], glow: PAL.mag[4] },
  { lines: ['TOKYO', 'NIGHTS'], bg: [PAL.night[1], PAL.blue[2]], border: PAL.blue[6], glow: PAL.blue[5], dots: true },
  { lines: ['ゲーム'], bg: [PAL.blue[0], PAL.mag[2]], border: PAL.yellow[3], glow: PAL.orange[2], dots: true },
  { lines: ['GAME', 'ON'], bg: [PAL.night[0], PAL.mag[2]], border: PAL.mag[4], glow: PAL.mag[4] },
  { lines: ['カラオケ'], bg: [PAL.blue[1], PAL.night[1]], border: PAL.cyan[3], glow: PAL.cyan[2] },
  { lines: ['ラーメン'], bg: [PAL.wood[0], PAL.wood[2]], border: PAL.amber[3], core: PAL.yellow[4], glow: PAL.amber[2], dots: true },
];

// Lateral a juego con un frente: mismo material y, si el frente tiene tienda, la tienda sigue en el lateral.
export function sideFor(front, seed) {
  const face = { p: 'side', mat: front.mat, seed };
  if (front.ground) { face.ground = front.ground; face.groundH = front.groundH; }
  return face;
}

// Fachada principal al azar. "tall" = hay sitio para carteles y rótulos verticales.
export function randomFront(rng, seed, { tall = true, ground = true } = {}) {
  const front = { p: 'building', mat: pick(rng, MATS), upper: pick(rng, UPPERS), seed };
  if (ground) { front.ground = pick(rng, GROUNDS); front.groundH = 14; } // planta baja de 0,875 celdas (16 píxeles por celda)
  if (tall && chance(rng, 0.45)) front.sign = { text: pick(rng, SIGN_TEXTS), style: pick(rng, NEON_STYLES) };
  if (tall && chance(rng, 0.35)) {
    const style = pick(rng, NEON_STYLES);
    front.blade = { side: chance(rng, 0.5) ? 'left' : 'right', text: pick(rng, BLADE_TEXTS), border: style.border, glyph: style.core };
  }
  return front;
}

// Divide el tramo [a, b] en trozos enteros de entre minLen y maxLen celdas.
export function splitRange(a, b, rng, minLen, maxLen) {
  const out = [];
  let s = a;
  while (s < b) {
    let len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    if (b - (s + len) < minLen) len = b - s; // el último trozo se queda con lo que sobra
    out.push([s, s + len]);
    s += len;
  }
  return out;
}
