// Edificios de dentro de la arena (los obstáculos): cada rectángulo del mapa se convierte en un local de Tokio
// (konbini, ramen, izakaya, casa japonesa, viviendas, salón recreativo, karaoke...). La huella de cada edificio es
// EXACTAMENTE su rectángulo de colisión, para que los disparos reboten donde se ve el muro.
// Alturas bajas a propósito: con la cámara inclinada, un edificio alto taparía al tanque que pasa por detrás. Los
// objetos altos de azotea van en el lado sur del tejado, donde solo tapan el propio edificio.
import { PAL } from '../art/palette.js';
import { box, gableRoof, acBox, waterTank, antenna, billboard, lampBox, sakura, TEXELS_PER_CELL } from './parts.js';

const px = (cells) => Math.round(cells * TEXELS_PER_CELL);
// Lateral de un local: si se le pasa la planta baja del frente, la tienda dobla la esquina (misma banda y material).
const sideFace = (mat, seed, ground = null, groundH = px(0.875)) => (ground ? { p: 'side', mat, seed, ground, groundH } : { p: 'side', mat, seed });
// Azoteas del interior: con guirnalda de bombillas casi siempre (son lo que más se ve de estos edificios desde la cámara).
const roofFace = (seed, extra = {}) => ({ p: 'roof', mat: 'slate', lights: 0.75, seed, ...extra });
// Altura máxima según la mitad del mapa: al fondo (norte) la cámara mira más rasante y un edificio tapa más.
const heightFor = (r, south, north) => (r.y + r.h / 2 < 9 ? south : north);

// Konbini en un edificio de ladrillo (como en las referencias): planta baja de tienda 24 h y una planta encima.
function konbini(r, id, v) {
  const h = heightFor(r, 1.45, 1.2);
  const groundH = px(0.95);
  const front = { p: 'building', mat: 'brick', ground: { kind: 'konbini', sign: v.sign, stripes: v.stripes, textColor: v.textColor }, groundH, upper: 'apartment', seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('brick', id + 1, front.ground, groundH), west: sideFace('brick', id + 2, front.ground, groundH), top: roofFace(id + 3, { mat: 'steel' }) }),
    acBox(r.x + 0.25, r.y + r.h - 0.5, h),
    acBox(r.x + 0.65, r.y + r.h - 0.5, h),
    ...billboard(r.x + r.w - 0.8, r.y + 0.12, h, 0.66, 0.3, { text: v.pole, scale: 1, bg: [PAL.night[0], PAL.blue[1]], border: v.stripes[0], glow: v.stripes[1] }, { posts: 0.2 }),
  ];
}

// Parque de cerezos (jardín japonés): muro de piedra con seto alrededor de TODA la huella (más alto que las balas, así
// se ve que es un obstáculo) y, dentro, grava rastrillada, un cerezo grande, un torii y un farol de piedra.
function park(r, id) {
  const t = 0.16; // grosor del muro
  const wallH = 0.42;
  const hedgeH = 0.22;
  const stone = { p: 'stone', seed: id };
  const hedgeSide = { p: 'hedge', seed: id + 1 };
  const hedgeTop = { p: 'hedge', top: true, seed: id + 1 };
  const wall = (x, y, w, d) => [
    box(x, y, 0, w, d, wallH, { south: stone, east: stone, west: stone, top: stone }),
    box(x, y, wallH, w, d, hedgeH, { south: hedgeSide, east: hedgeSide, west: hedgeSide, top: hedgeTop }),
  ];
  const torii = { p: 'flat', color: PAL.orange[1], edge: PAL.mag[2], seed: id + 2 };
  const beam = { p: 'flat', color: PAL.night[1], edge: PAL.orange[1], seed: id + 3 };
  const lanternFace = { p: 'stoneLantern', seed: id + 4 };
  const cx = r.x + r.w / 2;
  return [
    ...wall(r.x, r.y, r.w, t),
    ...wall(r.x, r.y + r.h - t, r.w, t),
    ...wall(r.x, r.y + t, t, r.h - 2 * t),
    ...wall(r.x + r.w - t, r.y + t, t, r.h - 2 * t),
    box(r.x + t, r.y + t, 0, r.w - 2 * t, r.h - 2 * t, 0.05, { top: { p: 'gravel', pond: true, seed: id + 5 } }), // con estanque (carpas y nenúfar)
    ...sakura(cx + 0.25, r.y + r.h - 0.75, 0.05, 1.25),
    box(cx - 0.55, r.y + 0.42, 0.05, 0.07, 0.07, 0.62, { south: torii, east: torii, west: torii }),
    box(cx - 0.05, r.y + 0.42, 0.05, 0.07, 0.07, 0.62, { south: torii, east: torii, west: torii }),
    box(cx - 0.66, r.y + 0.4, 0.67, 0.72, 0.11, 0.08, { south: beam, top: beam, east: beam, west: beam }),
    box(cx - 0.6, r.y + 0.41, 0.56, 0.6, 0.09, 0.05, { south: torii, top: torii }),
    box(r.x + 0.35, r.y + r.h - 0.6, 0.05, 0.16, 0.16, 0.34, { south: lanternFace, east: lanternFace, west: lanternFace, top: { p: 'flat', color: PAL.steel[5], seed: id + 6 } }),
  ];
}

function ramen(r, id, v) {
  const h = heightFor(r, 0.85, 0.8);
  const front = { p: 'building', mat: 'wood', ground: { kind: 'ramen', sign: v.sign, noren: v.noren }, groundH: px(h), seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('wood', id + 1, front.ground, px(h)), west: sideFace('wood', id + 2, front.ground, px(h)), top: roofFace(id + 3) }),
    ...billboard(r.x + 0.3, r.y + 0.1, h, r.w - 0.6, 0.34, { text: v.roofSign, bg: [PAL.wood[0], PAL.wood[2]], border: PAL.yellow[2], core: PAL.yellow[4], glow: PAL.orange[1] }, { posts: 0.12 }),
    acBox(r.x + r.w - 0.5, r.y + r.h - 0.45, h),
  ];
}

function izakaya(r, id) {
  const h = heightFor(r, 0.9, 0.85);
  const front = { p: 'building', mat: 'plum', ground: { kind: 'izakaya' }, groundH: px(h), seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('plum', id + 1, front.ground, px(h)), west: sideFace('plum', id + 2, front.ground, px(h)), top: roofFace(id + 3, { mat: 'plum' }) }),
    lampBox(r.x + 0.1, r.y - 0.07, 0.55, 0.14, { color: PAL.mag[4], light: PAL.mag[6] }),
    lampBox(r.x + r.w - 0.24, r.y - 0.07, 0.55, 0.14, { color: PAL.orange[2], light: PAL.yellow[4] }),
    acBox(r.x + 0.3, r.y + r.h - 0.45, h),
  ];
}

// Casa japonesa: paredes bajas y tejado de tejas a dos aguas que vuela un poco sobre la fachada (por encima del tanque).
function house(r, id, v) {
  const wall = 0.68;
  const eave = 0.08;
  const walls = { p: 'house', seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, wall, { south: walls, east: { p: 'house', windows: false, seed: id + 1 }, west: { p: 'house', windows: false, seed: id + 2 } }),
    gableRoof(r.x - eave, r.y - eave, wall, r.w + eave * 2, r.h + eave * 2, 0.5, { slope: { p: 'tiles', tone: v.tone, seed: id + 3 }, gable: { p: 'gable', seed: id + 4 } }),
    lampBox(r.x + 0.2, r.y - 0.05, 0.38, 0.13, { color: v.lamp[0], light: v.lamp[1] }),
  ];
}

// Bloque de viviendas (o de hotel): dos plantas, balcones, depósito de agua y antena en el lado sur del tejado.
function apartment(r, id, v) {
  const h = heightFor(r, 1.5, 1.3);
  const mat = v.hotel ? 'indigo' : 'navy';
  const front = {
    p: 'building', mat, ground: v.hotel ? { kind: 'hotel', sign: 'HOTEL' } : { kind: 'bar', sign: 'BAR' }, groundH: px(0.8),
    upper: v.hotel ? 'hotel' : 'apartment', seed: id,
  };
  const long = { p: 'building', mat, upper: v.hotel ? 'hotel' : 'apartment', ground: { kind: 'closed', vending: PAL.mag[4] }, groundH: px(0.7), seed: id + 1 };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: { ...long, seed: id + 1 }, west: { ...long, seed: id + 2 }, top: roofFace(id + 3, { mat: v.hotel ? 'slate' : 'steel' }) }),
    ...waterTank(r.x + 0.25, r.y + 0.25, h),
    ...antenna(r.x + r.w - 0.3, r.y + 0.3, h, 0.55),
    acBox(r.x + 0.4, r.y + r.h - 0.6, h),
    acBox(r.x + 1.1, r.y + r.h - 1.2, h),
  ];
}

// Salón recreativo: fachada ancha toda iluminada y pretil de neón.
function arcade(r, id) {
  const h = heightFor(r, 1.15, 1.0);
  const front = { p: 'building', mat: 'indigo', ground: { kind: 'arcade', sign: 'GAME CENTER' }, groundH: px(h) - 2, upper: 'blank', seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('indigo', id + 1, front.ground, px(h) - 2), west: sideFace('indigo', id + 2, front.ground, px(h) - 2), top: roofFace(id + 3, { rim: PAL.mag[4] }) }),
    acBox(r.x + 0.4, r.y + r.h - 0.5, h), acBox(r.x + 0.8, r.y + r.h - 0.5, h), acBox(r.x + 2.6, r.y + r.h - 0.5, h),
  ];
}

// Karaoke: planta baja de cristal magenta y una planta de oficinas encima.
function karaoke(r, id) {
  const h = heightFor(r, 1.45, 1.25);
  const front = { p: 'building', mat: 'indigo', ground: { kind: 'karaoke' }, groundH: px(0.8), upper: 'office', seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('indigo', id + 1, front.ground, px(0.8)), west: sideFace('indigo', id + 2, front.ground, px(0.8)), top: roofFace(id + 3, { rim: PAL.cyan[3] }) }),
    ...antenna(r.x + 0.3, r.y + 0.3, h, 0.4),
    acBox(r.x + 1.5, r.y + r.h - 0.5, h), acBox(r.x + 2.2, r.y + r.h - 0.5, h),
  ];
}

// Fila de dos locales: el de la izquierda bajo y el de la derecha con una planta más (silueta escalonada).
function shopRow(r, id, v) {
  const half = r.w / 2;
  const low = heightFor(r, 0.9, 0.85);
  const high = heightFor(r, 1.4, 1.2);
  const left = { p: 'building', mat: 'slate', ground: v.left, groundH: px(low), seed: id };
  const right = { p: 'building', mat: 'navy', ground: v.right, groundH: px(0.85), upper: 'apartment', seed: id + 1 };
  return [
    box(r.x, r.y, 0, half, r.h, low, { south: left, east: sideFace('slate', id + 2, v.left, px(low)), west: sideFace('slate', id + 3, v.left, px(low)), top: roofFace(id + 4) }),
    box(r.x + half, r.y, 0, half, r.h, high, { south: right, east: sideFace('navy', id + 5, v.right, px(0.85)), west: sideFace('navy', id + 6, v.right, px(0.85)), top: roofFace(id + 7, { mat: 'steel' }) }),
    acBox(r.x + 0.4, r.y + r.h - 0.5, low),
    ...antenna(r.x + half + 0.3, r.y + 0.25, high, 0.35),
  ];
}

// Torre central: base ancha y un cuerpo superior retranqueado con pretil de neón cian (el "centro luminoso" de la arena).
function tower(r, id) {
  const base = 0.9;
  const top = 1.55;
  const front = { p: 'building', mat: 'navy', ground: { kind: 'hotel', sign: 'DOERS' }, groundH: px(base), seed: id };
  const upper = { p: 'building', mat: 'indigo', upper: 'office', seed: id + 1 };
  return [
    box(r.x, r.y, 0, r.w, r.h, base, { south: front, east: sideFace('navy', id + 2, front.ground, px(base)), west: sideFace('navy', id + 3, front.ground, px(base)), top: roofFace(id + 4, { rim: PAL.blue[5] }) }),
    box(r.x + 0.2, r.y + 0.35, base, r.w - 0.4, r.h - 0.7, top - base, { south: upper, east: sideFace('indigo', id + 5), west: sideFace('indigo', id + 6), top: roofFace(id + 7, { rim: PAL.cyan[3], helipad: true }) }),
  ];
}

// --- Locales nuevos (28-oct) para los mapas de atardecer y de lluvia ---

// Taller mecánico: puerta de persiana con luz y chispas, franja de peligro, neumáticos y un rótulo naranja en la azotea.
function workshop(r, id, v) {
  const h = heightFor(r, 1.2, 1.05);
  const groundH = px(0.95);
  const front = { p: 'building', mat: 'steel', ground: { kind: 'garage', sign: v.sign ?? 'TALLER' }, groundH, upper: 'blank', seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('steel', id + 1, front.ground, groundH), west: sideFace('steel', id + 2, front.ground, groundH), top: roofFace(id + 3, { mat: 'steel', rim: PAL.orange[2] }) }),
    ...billboard(r.x + 0.3, r.y + 0.12, h, Math.min(1.4, r.w - 0.6), 0.32, { text: v.roofSign ?? 'AUTO', bg: [PAL.night[0], PAL.steel[1]], border: PAL.orange[2], glow: PAL.orange[1] }, { posts: 0.1 }),
    acBox(r.x + r.w - 0.55, r.y + r.h - 0.5, h),
  ];
}

// Mercado: puestos con toldo de rayas de colores y cajas de fruta, tejado de madera y guirnalda de bombillas.
function market(r, id, v) {
  const h = heightFor(r, 0.9, 0.85);
  const front = { p: 'building', mat: 'wood', ground: { kind: 'market', sign: v.sign ?? 'ICHIBA', mix: v.mix ?? 0 }, groundH: px(h), seed: id };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('wood', id + 1, front.ground, px(h)), west: sideFace('wood', id + 2, front.ground, px(h)), top: roofFace(id + 3, { mat: 'wood', lights: 1 }) }),
    lampBox(r.x + 0.15, r.y - 0.07, 0.5, 0.14, { color: PAL.orange[2], light: PAL.yellow[4] }),
    lampBox(r.x + r.w - 0.3, r.y - 0.07, 0.5, 0.14, { color: PAL.mag[4], light: PAL.mag[6] }),
    acBox(r.x + 0.3, r.y + r.h - 0.45, h),
  ];
}

// Templo tradicional japonés (28-oct, "medio alto"): patio de grava dentro de un muro de piedra con un torii a la entrada y un
// pabellón de dos plantas con tejados escalonados de tejas, planta superior con shōji encendidos y un remate dorado arriba.
// Alto de verdad (hasta ~1,9 al sur y ~1,6 al norte, bajo el límite de 2,3): domina el mapa sin tapar a los tanques de detrás.
function shrine(r, id) {
  const t = 0.16;
  const wallH = 0.42;
  const k = heightFor(r, 1, 0.84); // más bajo en la mitad norte: la cámara mira más rasante y taparía más
  const stone = { p: 'stone', seed: id };
  const wall = (x, y, w, d) => box(x, y, 0, w, d, wallH, { south: stone, east: stone, west: stone, top: stone });
  const torii = { p: 'flat', color: PAL.orange[1], edge: PAL.mag[2], seed: id + 2 };
  const beam = { p: 'flat', color: PAL.night[1], edge: PAL.orange[1], seed: id + 3 };
  const lanternFace = { p: 'stoneLantern', seed: id + 4 };
  const gold = { p: 'flat', color: PAL.yellow[3], edge: PAL.yellow[1], seed: id + 12 };
  const cx = r.x + r.w / 2;
  const hallW = Math.min(r.w - 0.7, 1.9);
  const hallD = Math.min(r.h - 1.3, 1.0);
  const hallX = cx - hallW / 2;
  const hallY = r.y + r.h - hallD - 0.3;
  const h1 = 0.5 * k;       // planta baja
  const h2 = 0.3 * k;       // planta alta
  const up = { p: 'temple', upper: true, seed: id + 6 };
  const sideWall = (seed, upper = false) => ({ p: 'temple', upper, seed });
  const tile = (seed) => ({ slope: { p: 'tiles', tone: 'navy', seed }, gable: { p: 'gable', seed: seed + 1 } });
  const z1 = 0.05 + h1;                    // base del primer tejado
  const roofH = 0.3 * k;
  const z2 = z1 + roofH * 0.55;            // la planta alta sale de dentro del tejado
  const upW = hallW * 0.62;
  const upD = hallD * 0.62;
  const upX = cx - upW / 2;
  const upY = hallY + (hallD - upD) / 2;
  const z3 = z2 + h2;
  return [
    wall(r.x, r.y, r.w, t), wall(r.x, r.y + r.h - t, r.w, t), wall(r.x, r.y + t, t, r.h - 2 * t), wall(r.x + r.w - t, r.y + t, t, r.h - 2 * t),
    box(r.x + t, r.y + t, 0, r.w - 2 * t, r.h - 2 * t, 0.05, { top: { p: 'gravel', seed: id + 1 } }),
    // pabellón: planta baja de pilares rojos con puerta iluminada
    box(hallX, hallY, 0.05, hallW, hallD, h1, { south: { p: 'temple', seed: id + 5 }, east: sideWall(id + 7), west: sideWall(id + 8), top: stone }),
    gableRoof(hallX - 0.14, hallY - 0.14, z1, hallW + 0.28, hallD + 0.28, roofH, tile(id + 9)),
    // planta alta más pequeña con shōji y su propio tejado
    box(upX, upY, z2, upW, upD, h2, { south: up, east: sideWall(id + 10, true), west: sideWall(id + 11, true), top: stone }),
    gableRoof(upX - 0.12, upY - 0.12, z3, upW + 0.24, upD + 0.24, 0.26 * k, tile(id + 13)),
    box(cx - 0.03, upY + upD / 2 - 0.03, z3 + 0.26 * k, 0.06, 0.06, 0.22 * k, { south: gold, east: gold, west: gold, top: gold }, { glow: true }), // remate dorado
    // torii de entrada y faroles de piedra
    box(cx - 0.6, r.y + 0.32, 0.05, 0.07, 0.07, 0.6, { south: torii, east: torii, west: torii }),
    box(cx + 0.53, r.y + 0.32, 0.05, 0.07, 0.07, 0.6, { south: torii, east: torii, west: torii }),
    box(cx - 0.7, r.y + 0.3, 0.65, 1.4, 0.11, 0.08, { south: beam, top: beam, east: beam, west: beam }),
    box(cx - 0.64, r.y + 0.31, 0.54, 1.28, 0.09, 0.05, { south: torii, top: torii }),
    box(r.x + 0.28, r.y + 0.45, 0.05, 0.16, 0.16, 0.34, { south: lanternFace, east: lanternFace, west: lanternFace, top: { p: 'flat', color: PAL.steel[5], seed: id + 14 } }),
    box(r.x + r.w - 0.46, r.y + 0.45, 0.05, 0.16, 0.16, 0.34, { south: lanternFace, east: lanternFace, west: lanternFace, top: { p: 'flat', color: PAL.steel[5], seed: id + 15 } }),
  ];
}

// Baño público japonés (sentō): edificio de madera con rótulo "ONSEN", noren azules en la puerta, tejado con guirnalda y una
// chimenea alta de ladrillo que echa vapor (el vapor sale de lifeAmbient.js). Sustituye a la gasolinera del primer intento.
function bathhouse(r, id, v) {
  const h = heightFor(r, 1.05, 0.9);
  const groundH = px(h);
  const front = { p: 'building', mat: 'wood', ground: { kind: 'bath', sign: v.sign ?? 'ONSEN' }, groundH, upper: 'blank', seed: id };
  const brick = { p: 'building', mat: 'brick', seed: id + 4 };
  return [
    box(r.x, r.y, 0, r.w, r.h, h, { south: front, east: sideFace('wood', id + 1, front.ground, groundH), west: sideFace('wood', id + 2, front.ground, groundH), top: roofFace(id + 3, { mat: 'wood', lights: 1 }) }),
    box(r.x + r.w - 0.62, r.y + 0.2, h, 0.34, 0.34, heightFor(r, 0.75, 0.6), { south: brick, east: brick, west: brick, top: { p: 'flat', color: PAL.night[0], edge: PAL.steel[2], seed: id + 5 } }), // chimenea
    lampBox(r.x + 0.2, r.y - 0.07, 0.45, 0.14, { color: PAL.mag[3], light: PAL.mag[5] }),
    lampBox(r.x + r.w - 0.35, r.y - 0.07, 0.45, 0.14, { color: PAL.mag[3], light: PAL.mag[5] }),
    acBox(r.x + 0.3, r.y + r.h - 0.45, h),
  ];
}

const RECIPES = { konbini, ramen, izakaya, house, apartment, arcade, karaoke, shopRow, tower, park, workshop, market, shrine, bathhouse };

// Qué edificio va en cada obstáculo de cada mapa (clave "x,y" de su esquina). Las parejas giradas no tienen por qué ser
// iguales: solo tienen que medir lo mismo, y así la ciudad es más variada.
const ASSIGNMENT = {
  '15,7': ['tower'],
  '6,4': ['konbini', { sign: 'NANA MART', stripes: [PAL.shop[0], PAL.shop[1], PAL.shop[2]], textColor: PAL.shop[2], pole: '24H' }], // nana = siete
  '24,11': ['ramen', { sign: 'ラーメン', noren: PAL.blue[3], roofSign: 'RAMEN' }],
  '11,3': ['izakaya'],
  '18,13': ['konbini', { sign: 'LUCKY 24', stripes: [PAL.blue[4], PAL.cyan[2], PAL.mag[4]], textColor: PAL.blue[3], pole: 'OPEN' }],
  '10,8': ['park'], // segundo parque de cerezos (antes una casa japonesa): los dos con estanque
  '20,9': ['park'],
  '3,10': ['apartment', {}],
  '27,4': ['apartment', { hotel: true }],
  '20,4': ['arcade'],
  '8,12': ['karaoke'],
  '16,3': ['shopRow', { left: { kind: 'bar', sign: 'BAR' }, right: { kind: 'closed', vending: PAL.cyan[2] } }],
  '12,13': ['shopRow', { left: { kind: 'closed', vending: PAL.yellow[2] }, right: { kind: 'ramen', sign: 'ラーメン', noren: PAL.mag[3] } }],
};

// Mapa 2 (CRUCE) y mapa 3 (MURALLA): mismas recetas, otros sitios.
const ASSIGNMENT_CRUCE = {
  '14,8': ['tower'],
  '5,4': ['apartment', {}],
  '25,12': ['apartment', { hotel: true }],
  '9,3': ['bathhouse', { sign: 'ONSEN' }],
  '20,13': ['karaoke'],
  '9,8': ['park'],
  '20,7': ['shrine'],
  '20,3': ['workshop', { sign: 'TALLER', roofSign: 'AUTO' }],
  '9,13': ['konbini', { sign: 'LUCKY 24', stripes: [PAL.blue[4], PAL.cyan[2], PAL.mag[4]], textColor: PAL.blue[3], pole: 'OPEN' }],
  '4,10': ['market', { sign: 'ICHIBA', mix: 0 }],
  '26,6': ['izakaya'],
};
const ASSIGNMENT_MURALLA = {
  '13,8': ['tower'],
  '4,3': ['apartment', {}],
  '27,11': ['apartment', { hotel: true }],
  '8,5': ['konbini', { sign: 'NANA MART', stripes: [PAL.shop[0], PAL.shop[1], PAL.shop[2]], textColor: PAL.shop[2], pole: '24H' }],
  '21,11': ['ramen', { sign: 'ラーメン', noren: PAL.mag[3], roofSign: 'RAMEN' }],
  '14,3': ['bathhouse', { sign: 'ONSEN' }],
  '15,13': ['market', { sign: 'ICHIBA', mix: 2 }],
  '21,4': ['workshop', { sign: 'GARAGE', roofSign: 'CAR' }],
  '9,10': ['izakaya'],
  '4,10': ['park'],
  '25,4': ['shrine'],
};
const ASSIGNMENTS = [ASSIGNMENT, ASSIGNMENT_CRUCE, ASSIGNMENT_MURALLA];

// Fiestas y barbacoas en las azoteas de cada mapa (client/host/lifeRoofParty.js): edificio por la esquina de su rectángulo y
// punto libre de su azotea (fx, fy: fracción del ancho y del fondo). Cada mapa tiene su combinación y sus sitios.
export const ROOF_LIFE = [
  [{ kind: 'party', key: [3, 10], fx: 0.5, fy: 0.4 }, { kind: 'bbq', key: [27, 4], fx: 0.5, fy: 0.4 }],
  [{ kind: 'party', key: [25, 12], fx: 0.5, fy: 0.4 }, { kind: 'bbq', key: [5, 4], fx: 0.5, fy: 0.45 }, { kind: 'bbq', key: [20, 3], fx: 0.5, fy: 0.35 }],
  [], // MURALLA (lluvia): nadie en las azoteas
];

// Devuelve los edificios del interior: [{ id, type, rect, parts }]. Un obstáculo sin receta queda como bloque de viviendas.
export function interiorBuildings(arena) {
  const assignment = ASSIGNMENTS[arena.mapIndex ?? 0] ?? ASSIGNMENT;
  return arena.obstacles.map((rect, index) => {
    const [type, variant] = assignment[`${rect.x},${rect.y}`] ?? ['apartment', {}];
    const id = 1000 + index * 20;
    return { id, type, rect, parts: RECIPES[type](rect, id, variant ?? {}) };
  });
}
