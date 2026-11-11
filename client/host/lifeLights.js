// Luces con vida: los halos de luz de la ciudad (los que ya existen en cityMesh.js, sin añadir nada a la escena) cambian de
// intensidad. Los farolillos "respiran" despacio, las luces de los escaparates oscilan apenas y los carteles de neón zumban:
// de vez en cuando se apagan un instante y vuelven con un parpadeo. Se actualiza unas 15 veces por segundo, solo el color
// de unos cientos de puntos. Qué NO hace: no mueve los farolillos pintados en las texturas (son píxeles de la ciudad).
import { createRng } from '../../shared/art/rng.js';

const STEP_MS = 66;
const rand = (rng, min, max) => min + rng() * (max - min);

// glows: la lista de { points, colorAttribute, base, kinds } que devuelve cityMesh.js.
export function createLightLife(glows) {
  const rng = createRng(0x11f37);
  const groups = glows.map((g) => {
    const n = g.kinds.length;
    return {
      ...g,
      phase: Float32Array.from({ length: n }, () => rng() * Math.PI * 2),
      speed: Float32Array.from({ length: n }, () => rand(rng, 0.7, 1.4)),
      nextDrop: Float64Array.from({ length: n }, () => rand(rng, 2000, 25000)),
      offUntil: new Float64Array(n),
      blinks: new Uint8Array(n), // parpadeos que le quedan tras volver a encenderse
    };
  });
  let last = 0;
  let enabled = true;

  function apply(g, i, factor) {
    const c = g.colorAttribute.array;
    for (let k = 0; k < 3; k++) c[i * 3 + k] = g.base[i * 3 + k] * factor;
  }

  return {
    // Con false (calidad baja) las luces vuelven a su color original.
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) for (const g of groups) { for (let i = 0; i < g.kinds.length; i++) apply(g, i, 1); g.colorAttribute.needsUpdate = true; }
    },
    update(now) {
      if (!enabled || now - last < STEP_MS) return;
      last = now;
      for (const g of groups) {
        for (let i = 0; i < g.kinds.length; i++) {
          const kind = g.kinds[i];
          let factor;
          if (kind === 'sign') { // neón: estable, con apagones breves y parpadeos al volver
            if (now < g.offUntil[i]) factor = 0.12;
            else if (g.blinks[i] > 0 && Math.floor(now / 90) % 2 === 0) { factor = 0.3; if (rng() < 0.15) g.blinks[i]--; }
            else {
              factor = 1 - rng() * 0.06;
              if (now >= g.nextDrop[i]) {
                g.offUntil[i] = now + rand(rng, 80, 240);
                g.blinks[i] = 2 + Math.floor(rng() * 3);
                g.nextDrop[i] = now + rand(rng, 8000, 40000);
              }
            }
          } else if (kind === 'lantern') factor = 0.82 + 0.18 * Math.sin(now * 0.0021 * g.speed[i] + g.phase[i]);
          else factor = 0.9 + 0.1 * Math.sin(now * 0.0013 * g.speed[i] + g.phase[i]);
          apply(g, i, factor);
        }
        g.colorAttribute.needsUpdate = true;
      }
    },
  };
}
