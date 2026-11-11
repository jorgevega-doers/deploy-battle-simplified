// Guion del final de la partida en el host (tiempos en ms desde que acaba). Lógica pura, sin DOM ni Three.js, para poder
// probarla: finale.js lo ejecuta. Según cómo acabe la partida:
//  - "lives" (impacto mortal): destello, zoom al tanque que explota en cámara lenta, "K.O." y después "<NOMBRE> WINS" (o "GAME OVER" si no se conoce).
//  - "time" / "draw": "TIME UP!" sin zoom.
//  - "forfeit" (abandono): "<NOMBRE> WINS" (o "GAME OVER").
// El cartel de resultados no sale hasta "doneAt" (main.js espera con finale.whenDone).
export const ZOOM_IN = [0, 650];     // el zoom sube de 0 a 1 en este intervalo
export const ZOOM_OUT = [2900, 3700]; // y vuelve a 0 en este

// Texto del final: "XXX WINS" con el nombre del ganador (varios, en equipos: "AXL & VEX WINS"); sin nombre, "GAME OVER".
export const overText = (names) => (names?.length ? `${names.join(' & ')} WINS` : 'GAME OVER');

export function planFor(reason, hasKill, winnerNames = []) {
  const over = overText(winnerNames);
  if (reason === 'lives' && hasKill) {
    return {
      kind: 'ko',
      zoom: true,
      doneAt: 3800,
      texts: [ // tamaños: múltiplos de la unidad de pantalla (arcadeText.js)
        { at: 200, text: 'K.O.', theme: 'pink', size: 1.0, hold: 700, shake: true, enter: 'slam' },
        { at: 1500, text: over, theme: 'white', size: 0.7, hold: 1000, shake: false, enter: 'slam' },
      ],
    };
  }
  if (reason === 'time' || reason === 'draw') {
    return { kind: 'time', zoom: false, doneAt: 2000, texts: [{ at: 0, text: 'TIME UP!', theme: 'cyan', size: 0.85, hold: 800, shake: true, enter: 'slam' }] };
  }
  return { kind: 'over', zoom: false, doneAt: 2100, texts: [{ at: 0, text: over, theme: 'white', size: 0.7, hold: 900, shake: true, enter: 'slam' }] };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;
const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - ((-2 * v + 2) ** 3) / 2);

// Zoom de la cámara (0-1) en el instante t del guion.
export function zoomAt(plan, t) {
  if (!plan.zoom) return 0;
  if (t < ZOOM_OUT[0]) return easeOut(clamp01((t - ZOOM_IN[0]) / (ZOOM_IN[1] - ZOOM_IN[0])));
  return 1 - easeInOut(clamp01((t - ZOOM_OUT[0]) / (ZOOM_OUT[1] - ZOOM_OUT[0])));
}

// Velocidad del tiempo de los trozos: cámara lenta al principio y vuelve poco a poco a la normal.
export function timeScaleAt(t) {
  if (t < 600) return 0.16;
  if (t < 2000) return 0.16 + (0.55 - 0.16) * ((t - 600) / 1400);
  return Math.min(1, 0.55 + (1 - 0.55) * ((t - 2000) / 1000));
}
