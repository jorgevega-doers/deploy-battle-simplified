// Paleta limitada del pixel art de la ciudad. Manda el azul con el negro; el magenta es
// secundario; cian, amarillo, naranja y un verde apagado son acentos de neón para carteles y luces.
// Cada color se guarda empaquetado en 32 bits (bytes R, G, B, A en memoria), como espera PixelImage.

export const pack = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

const P = (hexes) => Object.freeze(hexes.map(pack));

export const PAL = Object.freeze({
  // Noche (negro de marca y negros azulados)
  night: P(['#05050c', '#090a1a', '#0e1028', '#151838', '#1d2148']),
  // Azul (color principal): de muy oscuro a muy claro; el #0003ad de marca está en el centro
  blue: P(['#060833', '#0a0f5a', '#0d1580', '#0003ad', '#1d2fdc', '#4656ff', '#8a95ff', '#c9ceff']),
  // Acero azulado: asfalto, hormigón, metal
  steel: P(['#121426', '#191c33', '#22263f', '#2d3252', '#3c4268', '#535a88', '#7880ae', '#a9b0d6']),
  // Magenta (secundario): de muy oscuro a muy claro; #ff0080 de marca
  mag: P(['#22061c', '#4a0a36', '#860755', '#c3006b', '#ff0080', '#ff5cad', '#ffaed6']),
  // Madera / tela cálida oscura (tonos magenta apagados, para no salir de la paleta)
  wood: P(['#1c0f1d', '#2c1729', '#422037', '#5e2c45', '#7d3c52']),
  // Acentos
  cyan: P(['#003244', '#00727f', '#00c8e0', '#00f0ff', '#b3fbff']),
  yellow: P(['#3d2a00', '#9a6a00', '#ffb400', '#ffd400', '#fff0a0']),
  orange: P(['#5c2300', '#c45200', '#ff9a00']),
  // Ámbar: luz de farolillo de papel y de interior cálido (el ambiente "acogedor" de la ciudad)
  amber: P(['#3a1c10', '#7a3a1a', '#c8692c', '#ff9d4f', '#ffc98a']),
  green: P(['#06261f', '#0f5c45', '#1fae7c', '#5ff2b4']),
  // Ladrillo de noche (fachadas cálidas como en las referencias de konbini y callejones): rojizo apagado y oscuro
  brick: P(['#1e0f18', '#3a1a22', '#57262b', '#743534', '#924a3f']),
  // Bandas del konbini (inspiradas en las de las tiendas 24 h japonesas, sin ninguna marca real)
  shop: P(['#0f9d58', '#ff8a1e', '#e8333a']),
  // Flor de cerezo (sakura): rosas suaves derivados del magenta
  sakura: P(['#5a1f4a', '#a8417e', '#e07aae', '#ffb3d4']),
  white: pack('#ffffff'),
  black: pack('#05050c'),
});

// Colores de luz de ventana (interiores encendidos): sobre todo cálida (ámbar), algo de fría y de neón.
// Tonos medios a propósito: así las ventanas no pasan del umbral del bloom y la ciudad no se llena de velo.
const WARM = [PAL.amber[4], PAL.amber[3], PAL.amber[2]];
const LAMP = [PAL.yellow[4], PAL.yellow[2], PAL.amber[3]];
export const WINDOW_LIGHTS = Object.freeze([
  WARM, WARM, WARM, LAMP, LAMP,
  [PAL.cyan[4], PAL.cyan[2], PAL.cyan[1]],
  [PAL.mag[6], PAL.mag[5], PAL.mag[4]],
  [PAL.blue[7], PAL.blue[6], PAL.blue[5]],
]);
