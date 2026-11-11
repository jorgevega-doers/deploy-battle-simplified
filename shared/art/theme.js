// Ambiente de cada mapa aplicado a las texturas ya pintadas (28-oct): en vez de tocar cada pintor, el atlas, el suelo y el
// asfalto de fuera se "revelan" con un pequeño ajuste de color por píxel: ganancia, tinte y saturación. Así un mismo arte da
// una ciudad de noche (original), de atardecer o bajo la lluvia sin repintar nada. Código puro (sin navegador ni Node).
// Qué NO hace: no cambia la forma de los edificios (eso lo deciden los mapas) ni la luz de la escena (client/host/moods.js).
export const THEMES = Object.freeze({
  night: null, // el original: se queda tal cual
  // Atardecer: todo más claro y cálido (muros de terracota y arena, sombras color ciruela); los neones apenas cambian.
  dusk: { gain: 1.28, tint: [1.1, 0.94, 0.84], saturation: 1.1, lift: [14, 6, 10] },
  // Lluvia nocturna: algo más oscuro, frío y apagado; lo que brilla (neones y ventanas) sigue destacando.
  rain: { gain: 0.93, tint: [0.86, 0.97, 1.14], saturation: 0.82, lift: [0, 2, 8] },
});

// Modifica "image" (PixelImage) en el sitio. Devuelve la misma imagen.
export function applyTheme(image, name) {
  const theme = THEMES[name];
  if (!theme) return image;
  const { gain, tint, saturation, lift } = theme;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i]; let g = d[i + 1]; let b = d[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Los colores muy brillantes (neones, ventanas, luces) conservan su color: solo se tocan las zonas apagadas.
    const k = 1 - Math.min(1, Math.max(0, (luma - 150) / 90));
    const gainK = 1 + (gain - 1) * k;
    r = luma + (r - luma) * saturation; g = luma + (g - luma) * saturation; b = luma + (b - luma) * saturation;
    d[i] = Math.min(255, Math.max(0, r * gainK * (1 + (tint[0] - 1) * k) + lift[0] * (1 - luma / 255)));
    d[i + 1] = Math.min(255, Math.max(0, g * gainK * (1 + (tint[1] - 1) * k) + lift[1] * (1 - luma / 255)));
    d[i + 2] = Math.min(255, Math.max(0, b * gainK * (1 + (tint[2] - 1) * k) + lift[2] * (1 - luma / 255)));
  }
  return image;
}
