// Cómo se construyen las personas y los animales: unas pocas cajas de colores (voxels) como los tanques. Cada pieza lleva
// su posición local (x = hacia delante, y = arriba, z = a un lado, en celdas), su tamaño y qué color usa de la paleta de
// ese individuo; "leg" hace que se balancee al andar (1 y -1 van a contrapié) y "wag" que se mueva de lado (la cola).
// Datos puros: se prueban sin gráficos. Medidas pensadas para que sean mucho más pequeños que un tanque (0,9 de ancho).
export const RIGS = {
  person: [
    { o: [0, 0.09, 0.035], s: [0.06, 0.18, 0.06], c: 'pants', leg: 1 },
    { o: [0, 0.09, -0.035], s: [0.06, 0.18, 0.06], c: 'pants', leg: -1 },
    { o: [0, 0.27, 0], s: [0.08, 0.17, 0.15], c: 'shirt' },
    { o: [0, 0.405, 0], s: [0.09, 0.09, 0.09], c: 'skin' },
    { o: [-0.006, 0.452, 0], s: [0.1, 0.04, 0.1], c: 'hair' },
    // Brazos: cuelgan a los lados y se balancean al andar; al huir se levantan por encima de la cabeza ("arm" = lado).
    { o: [0, 0.27, 0.115], s: [0.045, 0.15, 0.045], c: 'skin', arm: 1 },
    { o: [0, 0.27, -0.115], s: [0.045, 0.15, 0.045], c: 'skin', arm: -1 },
  ],
  // Persona con paraguas (mapa de la lluvia): la misma figura con un mango y una cúpula de dos cajas sobre la cabeza.
  personUmbrella: [
    { o: [0, 0.09, 0.035], s: [0.06, 0.18, 0.06], c: 'pants', leg: 1 },
    { o: [0, 0.09, -0.035], s: [0.06, 0.18, 0.06], c: 'pants', leg: -1 },
    { o: [0, 0.27, 0], s: [0.08, 0.17, 0.15], c: 'shirt' },
    { o: [0, 0.405, 0], s: [0.09, 0.09, 0.09], c: 'skin' },
    { o: [-0.006, 0.452, 0], s: [0.1, 0.04, 0.1], c: 'hair' },
    { o: [0, 0.27, 0.115], s: [0.045, 0.15, 0.045], c: 'skin', arm: 1 },
    { o: [0, 0.27, -0.115], s: [0.045, 0.15, 0.045], c: 'skin', arm: -1 },
    // Paraguas: el mango sale de la mano y sube junto a la cabeza; la cúpula son capas que se estrechan hacia arriba (cada capa
    // son dos cajas cruzadas, así la silueta es un octógono y no un cuadrado) y una punta.
    { o: [0, 0.46, 0.1], s: [0.014, 0.34, 0.014], c: 'pole' },
    { o: [0, 0.635, 0], s: [0.4, 0.022, 0.29], c: 'umbrella' },
    { o: [0, 0.635, 0], s: [0.29, 0.022, 0.4], c: 'umbrella' },
    { o: [0, 0.66, 0], s: [0.3, 0.026, 0.2], c: 'umbrella' },
    { o: [0, 0.66, 0], s: [0.2, 0.026, 0.3], c: 'umbrella' },
    { o: [0, 0.69, 0], s: [0.15, 0.03, 0.15], c: 'umbrella' },
    { o: [0, 0.715, 0], s: [0.025, 0.035, 0.025], c: 'pole' },
  ],
  cat: [
    { o: [0, 0.1, 0], s: [0.22, 0.09, 0.09], c: 'fur' },
    { o: [0.13, 0.14, 0], s: [0.09, 0.09, 0.09], c: 'fur' },
    { o: [-0.15, 0.15, 0], s: [0.12, 0.03, 0.03], c: 'fur', wag: 1 },
    { o: [0.08, 0.035, 0], s: [0.04, 0.07, 0.1], c: 'fur', leg: 1 },
    { o: [-0.08, 0.035, 0], s: [0.04, 0.07, 0.1], c: 'fur', leg: -1 },
  ],
  dog: [
    { o: [0, 0.14, 0], s: [0.3, 0.12, 0.12], c: 'fur' },
    { o: [0.18, 0.2, 0], s: [0.12, 0.11, 0.11], c: 'fur' },
    { o: [-0.2, 0.2, 0], s: [0.12, 0.03, 0.03], c: 'fur', wag: 1 },
    { o: [0.1, 0.05, 0], s: [0.05, 0.1, 0.14], c: 'fur', leg: 1 },
    { o: [-0.1, 0.05, 0], s: [0.05, 0.1, 0.14], c: 'fur', leg: -1 },
  ],
  car: [
    { o: [0, 0.1, 0], s: [0.78, 0.18, 0.44], c: 'body' },
    { o: [-0.04, 0.26, 0], s: [0.42, 0.14, 0.38], c: 'cabin' },
    { o: [0.26, 0.05, 0.2], s: [0.16, 0.1, 0.06], c: 'tire' },
    { o: [0.26, 0.05, -0.2], s: [0.16, 0.1, 0.06], c: 'tire' },
    { o: [-0.26, 0.05, 0.2], s: [0.16, 0.1, 0.06], c: 'tire' },
    { o: [-0.26, 0.05, -0.2], s: [0.16, 0.1, 0.06], c: 'tire' },
    { o: [0.4, 0.12, 0.13], s: [0.03, 0.05, 0.07], c: 'head' },
    { o: [0.4, 0.12, -0.13], s: [0.03, 0.05, 0.07], c: 'head' },
    { o: [-0.4, 0.12, 0.13], s: [0.03, 0.05, 0.07], c: 'tail' },
    { o: [-0.4, 0.12, -0.13], s: [0.03, 0.05, 0.07], c: 'tail' },
  ],
  scooter: [
    { o: [0, 0.07, 0], s: [0.42, 0.08, 0.1], c: 'body' },
    { o: [0.2, 0.06, 0], s: [0.1, 0.1, 0.07], c: 'tire' },
    { o: [-0.2, 0.06, 0], s: [0.1, 0.1, 0.07], c: 'tire' },
    { o: [-0.03, 0.2, 0], s: [0.09, 0.15, 0.13], c: 'shirt' },
    { o: [-0.03, 0.31, 0], s: [0.09, 0.09, 0.09], c: 'helmet' },
    { o: [0.23, 0.12, 0], s: [0.025, 0.05, 0.06], c: 'head' },
    { o: [-0.23, 0.1, 0], s: [0.025, 0.04, 0.06], c: 'tail' },
  ],
};

// Colores de cada individuo: se elige uno de cada lista al crearlo (tonos apagados de la paleta + algún acento).
export const PALETTES = {
  shirt: [0x3a4fd0, 0xc0206f, 0xe07a2d, 0x3f7f5f, 0x8e9abd, 0x6f8cff, 0xff4fa3, 0x2c3756, 0xffd400],
  pants: [0x1a1f3a, 0x2c3756, 0x3a2f45, 0x1a1426],
  skin: [0xe8b896, 0xc98f6b, 0x8d5a3b],
  hair: [0x1a1426, 0x5a3a2a, 0xc9a45c, 0x8e9abd],
  catFur: [0xe07a2d, 0x8e9abd, 0x1a1426, 0xdfe6ff],
  dogFur: [0x8d5a3b, 0xc9a45c, 0x2c3756, 0xe07a2d],
  carBody: [0x3a4fd0, 0xc0206f, 0x3f7f5f, 0x8e9abd, 0xe07a2d, 0x2c3756],
  cabin: [0x1a1f3a],
  tire: [0x05050c],
  head: [0xffe9a0],
  tail: [0xff3a3a],
  helmet: [0xffd400, 0xff4fa3, 0x6f8cff, 0x8e9abd],
  umbrella: [0xff4fa3, 0x6f8cff, 0xffd400, 0x00f0ff, 0xe8333a, 0x3f7f5f],
  pole: [0x2c3756],
};

// Qué lista de PALETTES usa cada clave de color de cada tipo de individuo.
export const COLOR_SOURCE = {
  person: { shirt: 'shirt', pants: 'pants', skin: 'skin', hair: 'hair' },
  personUmbrella: { shirt: 'shirt', pants: 'pants', skin: 'skin', hair: 'hair', pole: 'pole', umbrella: 'umbrella' },
  cat: { fur: 'catFur' },
  dog: { fur: 'dogFur' },
  car: { body: 'carBody', cabin: 'cabin', tire: 'tire', head: 'head', tail: 'tail' },
  scooter: { body: 'carBody', tire: 'tire', shirt: 'shirt', helmet: 'helmet', head: 'head', tail: 'tail' },
};
