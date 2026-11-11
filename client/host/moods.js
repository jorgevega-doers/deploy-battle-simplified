// Ambiente de luz de cada mapa (28-oct): color de fondo y de niebla, corrección de color, bloom y luz de los tanques. Es solo
// aspecto (no toca la jugabilidad). "night" es el aspecto original de siempre; "dusk" (atardecer) y "rain" (noche de lluvia)
// cambian los mismos ajustes. Las texturas de cada mapa llevan su propio ajuste de color (shared/art/theme.js).
export const MOODS = Object.freeze({
  night: {
    background: 0x1a1426, grade: { warmth: 1.0, haze: '#3a2a3c', hazeAmount: 0.18, fog: '#2a1f30', fogAmount: 0.72, vignette: 0.55, tint: [1, 1, 1] },
    bloom: { strength: 0.34, threshold: 0.8 }, hemi: [0xb8bcff, 0x10102a, 1.15], sun: [0xffffff, 1.0],
  },
  // Atardecer: fondo y niebla naranja-ciruela claros, balance muy cálido, sombras levantadas y bloom algo menor (hay más luz).
  dusk: {
    background: 0x5a2f40, grade: { warmth: 1.5, haze: '#7a3f4c', hazeAmount: 0.3, fog: '#5a2f40', fogAmount: 0.6, vignette: 0.5, tint: [1.05, 0.96, 0.9] },
    bloom: { strength: 0.26, threshold: 0.85 }, hemi: [0xffc9a0, 0x3a2040, 1.35], sun: [0xffb070, 1.15],
  },
  // Noche de lluvia: fondo y niebla azul acero, balance neutro-frío, más bruma y viñeta más cerrada.
  rain: {
    background: 0x101a2a, grade: { warmth: 0.45, haze: '#1e2c42', hazeAmount: 0.26, fog: '#16213a', fogAmount: 0.78, vignette: 0.65, tint: [0.92, 0.98, 1.08] },
    bloom: { strength: 0.4, threshold: 0.75 }, hemi: [0x9fb4ff, 0x0a1020, 1.05], sun: [0xbcd0ff, 0.85],
  },
});
