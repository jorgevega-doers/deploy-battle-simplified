// Números al azar con semilla (mulberry32): con la misma semilla sale siempre la misma ciudad y las mismas texturas.

export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return next;
}

// Ayudas: elegir un elemento, un entero entre a y b (ambos incluidos) y "sí" con probabilidad p.
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export const chance = (rng, p) => rng() < p;

// Semilla numérica a partir de un texto (para que cada pieza tenga la suya y no dependa del orden de pintado).
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
