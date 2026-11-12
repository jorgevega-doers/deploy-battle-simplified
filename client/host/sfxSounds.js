// Recetas de todos los sonidos del juego. Estilo: retro "chiptune" pero ACOGEDOR, como un juego de
// tanques de salón de los de consola de sobremesa en versión 8 bits: ondas triangulares y cuadradas suavizadas con un filtro
// paso bajo (nada de chirridos), notas de la escala pentatónica (suenan bien juntas, no se oye ninguna "nota falsa") y un
// poco de reverb de salón en los sonidos "bonitos" (power-ups, victoria). Los golpes y explosiones llevan ruido grave y
// redondo, no agudo. Todo se genera aquí con tone() y noise() de sfx.js: ningún archivo de audio de terceros.
// Cada receta recibe { pan, slot, n, ... } y la reproduce; minGapMs es el tiempo mínimo entre dos iguales.

// Notas (Hz) de la escala pentatónica de Do mayor, en tres octavas.
const C4 = 261.63; const E4 = 329.63; const G4 = 392; const A4 = 440;
const C5 = 523.25; const D5 = 587.33; const E5 = 659.25; const G5 = 783.99; const A5 = 880;
const C6 = 1046.5; const E6 = 1318.5; const G6 = 1568;

// Altura base del disparo de cada tanque (el 1 más agudo y los bots más graves, para distinguir de quién es cada uno).
const SHOT_PITCH = [640, 540, 470, 420];

export function createSounds({ tone, noise }) {
  return {
    // Disparo: "pop" redondo con un pequeño barrido hacia abajo.
    shot: {
      minGapMs: 35,
      play({ pan = 0, slot = 1 }) {
        const f = SHOT_PITCH[Math.min(3, Math.max(0, slot - 1))];
        const bot = slot > 2 ? 0.7 : 1; // los bots del modo solitario, algo más flojos
        tone({ type: 'square', freq: f * 1.6, to: f * 0.5, dur: 0.1, vol: 0.13 * bot, lp: 2400, pan });
        tone({ type: 'triangle', freq: f, to: f * 0.55, dur: 0.13, vol: 0.24 * bot, pan });
        noise({ filter: 'bandpass', from: 1800, to: 700, dur: 0.05, vol: 0.07 * bot, pan, q: 1.2 });
      },
    },
    // Rebote en la pared: un "toc" sordo y blando (sin notas: no hace de melodía). Cada rebote suena apenas más agudo.
    bounce: {
      minGapMs: 30,
      play({ pan = 0, n = 1 }) {
        const k = 1 + (Math.min(3, Math.max(1, n)) - 1) * 0.08;
        noise({ filter: 'lowpass', from: 1000, to: 320, dur: 0.07, vol: 0.12, pan });
        tone({ type: 'sine', freq: 210 * k, to: 115 * k, dur: 0.09, vol: 0.15, pan });
        tone({ type: 'triangle', freq: 330 * k, to: 170 * k, dur: 0.05, vol: 0.04, pan });
      },
    },
    // El disparo se acaba contra el 4.º muro: golpecito sordo.
    impact: {
      minGapMs: 40,
      play({ pan = 0 }) {
        noise({ filter: 'lowpass', from: 900, to: 300, dur: 0.1, vol: 0.18, pan });
        tone({ type: 'sine', freq: 150, to: 70, dur: 0.12, vol: 0.2, pan });
      },
    },
    // Bala agotada en el aire: "pip" suave.
    expire: {
      minGapMs: 60,
      play({ pan = 0 }) { tone({ type: 'sine', freq: 880, to: 480, dur: 0.06, vol: 0.1, pan }); },
    },
    // Tanque alcanzado: golpe grave con "boing" cómico hacia abajo (da pena, pero no asusta).
    hit: {
      minGapMs: 80,
      play({ pan = 0 }) {
        tone({ type: 'square', freq: 360, to: 70, dur: 0.38, vol: 0.14, lp: 1700, pan });
        noise({ filter: 'lowpass', from: 1700, to: 250, dur: 0.32, vol: 0.2, pan });
        tone({ type: 'sine', freq: 120, to: 42, dur: 0.42, vol: 0.24, pan });
        tone({ type: 'triangle', freq: 620, to: 260, dur: 0.3, vol: 0.08, delay: 0.05, pan, send: 0.2 });
      },
    },
    // El escudo para una bala y se rompe: "ping" cristalino que cae, sin el golpe grave de perder una vida.
    shieldBreak: {
      minGapMs: 100,
      play({ pan = 0 }) {
        tone({ type: 'triangle', freq: C6, to: G4, dur: 0.22, vol: 0.14, pan, send: 0.3 });
        tone({ type: 'square', freq: E6, to: C5, dur: 0.12, vol: 0.05, lp: 3000, pan });
        noise({ filter: 'bandpass', from: 3000, to: 900, dur: 0.12, vol: 0.1, pan, q: 1.5 });
      },
    },
    // Explosión del power-up: soplido grave que se apaga, con cola de salón.
    explosion: {
      minGapMs: 120,
      play({ pan = 0 }) {
        noise({ filter: 'lowpass', from: 2000, to: 160, dur: 0.75, vol: 0.28, pan, send: 0.25 });
        tone({ type: 'sine', freq: 100, to: 32, dur: 0.65, vol: 0.3, pan });
        tone({ type: 'square', freq: 220, to: 55, dur: 0.4, vol: 0.07, lp: 1400, pan });
      },
    },
    // --- Easter egg de TNI ---
    // Bazocazo: golpe grave de salida que impone, silbido del cohete y chasquido.
    bazooka: {
      minGapMs: 60,
      play({ pan = 0 }) {
        tone({ type: 'sine', freq: 85, to: 28, dur: 0.4, vol: 0.42, pan });
        tone({ type: 'square', freq: 160, to: 40, dur: 0.18, vol: 0.1, lp: 900, pan });
        noise({ filter: 'lowpass', from: 1600, to: 200, dur: 0.25, vol: 0.25, pan });
        noise({ filter: 'bandpass', from: 500, to: 2600, dur: 0.4, vol: 0.18, delay: 0.04, pan, q: 1.1 });
      },
    },
    // Explosión del cohete: BESTIA. Estallido seco, retumbo subgrave largo que hace temblar, gruñido distorsionado, réplicas de las
    // explosiones encadenadas (como en el host) y chisporroteo de escombros cayendo.
    tniBoom: {
      minGapMs: 80,
      play({ pan = 0 }) {
        noise({ filter: 'lowpass', from: 5000, to: 1200, dur: 0.12, vol: 0.45, pan });                   // estallido seco
        noise({ filter: 'lowpass', from: 2600, to: 70, dur: 2.0, vol: 0.42, pan, send: 0.35 });          // cuerpo y cola
        tone({ type: 'sine', freq: 70, to: 18, dur: 1.7, vol: 0.55, pan });                              // subgrave que retumba
        tone({ type: 'sine', freq: 140, to: 35, dur: 0.6, vol: 0.3, pan });
        tone({ type: 'square', freq: 120, to: 28, dur: 0.9, vol: 0.12, lp: 700, pan });                  // gruñido
        [0.11, 0.2, 0.3, 0.42].forEach((d, i) => {                                                        // réplicas encadenadas
          noise({ filter: 'lowpass', from: 1800, to: 120, dur: 0.5, vol: 0.2 - i * 0.03, delay: d, pan: pan + (i % 2 ? 0.25 : -0.25) });
          tone({ type: 'sine', freq: 90 - i * 8, to: 30, dur: 0.4, vol: 0.22 - i * 0.03, delay: d, pan });
        });
        noise({ filter: 'bandpass', from: 3000, to: 900, dur: 0.9, vol: 0.09, delay: 0.25, pan, q: 1.4 }); // escombros
      },
    },
    // Gente gritando y huyendo (primer bazocazo de TNI): varias voces que chillan a distintas alturas por todo el estéreo, un murmullo
    // de pánico que cruza de lado a lado y pasos corriendo. Las voces son ondas de sierra filtradas que suben y caen (un "¡aaah!").
    crowdScream: {
      minGapMs: 3000,
      play() {
        const voices = [520, 690, 430, 780, 610, 360, 560, 470];
        voices.forEach((f, i) => {
          const delay = i * 0.13 + Math.random() * 0.12;
          const pan = Math.random() * 1.6 - 0.8;
          const v = f * (0.94 + Math.random() * 0.12);
          tone({ type: 'sawtooth', freq: v * 0.85, to: v * 1.3, dur: 0.28, vol: 0.035, lp: 2200, delay, pan, send: 0.2 });
          tone({ type: 'sawtooth', freq: v * 1.3, to: v * 0.65, dur: 0.75 + Math.random() * 0.4, vol: 0.03, lp: 1900, delay: delay + 0.28, pan, send: 0.2 });
        });
        noise({ filter: 'bandpass', from: 700, to: 1300, dur: 2.2, vol: 0.08, pan: -0.6, panTo: 0.6, q: 0.7 });
        for (let i = 0; i < 16; i++) noise({ filter: 'lowpass', from: 900, to: 300, dur: 0.05, vol: 0.06, delay: 0.2 + i * 0.11 + Math.random() * 0.04, pan: Math.random() * 1.4 - 0.7 });
      },
    },
    // Dash: "fiuu" corto hacia arriba.
    dash: {
      minGapMs: 90,
      play({ pan = 0 }) {
        noise({ filter: 'bandpass', from: 350, to: 2400, dur: 0.17, vol: 0.25, pan, q: 1.4 });
        tone({ type: 'triangle', freq: 220, to: 560, dur: 0.15, vol: 0.2, pan });
      },
    },
    // Aparece un power-up en el mapa: destellito de dos notas.
    powerupSpawn: {
      minGapMs: 200,
      play({ pan = 0 }) {
        tone({ type: 'triangle', freq: E6, dur: 0.2, vol: 0.1, pan, send: 0.4 });
        tone({ type: 'triangle', freq: G6, dur: 0.24, vol: 0.08, delay: 0.08, pan, send: 0.4 });
      },
    },
    // Aviso de que va a aparecer un power-up (dura lo que la columna de luz, ~1,5 s): carga que sube con pitidos cada vez más seguidos.
    powerupWarn: {
      minGapMs: 400,
      play({ pan = 0 }) {
        tone({ type: 'triangle', freq: 220, to: 990, dur: 1.4, vol: 0.07, lp: 2200, pan, send: 0.3 });
        tone({ type: 'sine', freq: 110, to: 330, dur: 1.4, vol: 0.12, pan });
        [0.35, 0.75, 1.05, 1.25, 1.4].forEach((t, i) => tone({ type: 'square', freq: E6 * (1 + i * 0.06), dur: 0.05, vol: 0.035, delay: t, lp: 3200, pan }));
      },
    },
    // Recoger un power-up: arpegio alegre hacia arriba.
    powerupPick: {
      minGapMs: 150,
      play({ pan = 0 }) {
        [C5, E5, G5, C6].forEach((f, i) => {
          tone({ type: 'square', freq: f, dur: 0.14, vol: 0.04, delay: i * 0.06, lp: 2600, pan });
          tone({ type: 'triangle', freq: f, dur: 0.18, vol: 0.085, delay: i * 0.06, pan, send: 0.3 });
        });
      },
    },
    // Cuenta atrás: un "bip" suave por número, y al final el "GO!" con acorde.
    countdown: {
      minGapMs: 200,
      play({ n = 2 }) { tone({ type: 'triangle', freq: n <= 1 ? A4 : G4, dur: 0.16, vol: 0.2, send: 0.2 }); },
    },
    go: {
      minGapMs: 300,
      play() {
        [C5, E5, G5].forEach((f) => tone({ type: 'triangle', freq: f, dur: 0.42, vol: 0.1, send: 0.35 }));
        tone({ type: 'square', freq: C6, dur: 0.3, vol: 0.05, lp: 2800, send: 0.3 });
      },
    },
    // Reaparición de un tanque: "pop" que sube con un brillo al final.
    spawn: {
      minGapMs: 150,
      play({ pan = 0 }) {
        tone({ type: 'triangle', freq: 300, to: 900, dur: 0.13, vol: 0.15, pan });
        tone({ type: 'sine', freq: E6, dur: 0.12, vol: 0.07, delay: 0.1, pan, send: 0.3 });
      },
    },
    // KO: notas que bajan, tristes pero suaves, con un golpe grave.
    ko: {
      minGapMs: 500,
      play() {
        [C5, A4, G4, C4].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.3, vol: 0.15, delay: 0.12 + i * 0.16, send: 0.3 }));
        noise({ filter: 'lowpass', from: 1200, to: 150, dur: 0.5, vol: 0.2 });
        tone({ type: 'sine', freq: 90, to: 38, dur: 0.6, vol: 0.28 });
      },
    },
    // Tiempo agotado: campanada.
    timeUp: {
      minGapMs: 500,
      play() {
        tone({ type: 'sine', freq: A5, dur: 0.9, vol: 0.14, send: 0.5 });
        tone({ type: 'sine', freq: A5 * 2.01, dur: 0.6, vol: 0.05, send: 0.5 });
        tone({ type: 'triangle', freq: A5 / 2, dur: 0.5, vol: 0.08, send: 0.4 });
      },
    },
    // Resultados: victoria (arpegio alegre y acorde final) o derrota suave (solo para el jugador en solitario).
    win: {
      minGapMs: 800,
      play() {
        [C5, E5, G5, C6, E6].forEach((f, i) => {
          tone({ type: 'square', freq: f, dur: 0.16, vol: 0.035, delay: i * 0.1, lp: 2600 });
          tone({ type: 'triangle', freq: f, dur: i === 4 ? 0.9 : 0.2, vol: 0.09, delay: i * 0.1, send: 0.4 });
        });
        [C5, G5, C6].forEach((f) => tone({ type: 'triangle', freq: f, dur: 0.9, vol: 0.05, delay: 0.5, send: 0.45 }));
      },
    },
    lose: {
      minGapMs: 800,
      play() {
        [E5, D5, C5, A4].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.28, vol: 0.12, delay: i * 0.17, send: 0.35 }));
      },
    },
    // Intro del título (logoIntro.js): palabras que se deslizan, choque, flash y revelado, más el "pulsa una tecla" de arcade.
    introSlide: {
      minGapMs: 80,
      play({ pan = 0 }) {
        noise({ filter: 'bandpass', from: 450, to: 2900, dur: 0.42, vol: 0.2, pan, panTo: -pan, q: 0.9 });
        tone({ type: 'sawtooth', freq: 130, to: 540, dur: 0.4, vol: 0.05, lp: 1800, pan });
      },
    },
    introHit: {
      minGapMs: 300,
      play() {
        tone({ type: 'sine', freq: 150, to: 36, dur: 0.6, vol: 0.34 });
        noise({ filter: 'lowpass', from: 2600, to: 160, dur: 0.45, vol: 0.28 });
        tone({ type: 'square', freq: 392, to: 196, dur: 0.16, vol: 0.09, lp: 2200 });
        tone({ type: 'triangle', freq: 784, to: 330, dur: 0.32, vol: 0.1, delay: 0.02, send: 0.35 });
      },
    },
    introFlash: {
      minGapMs: 300,
      play() {
        tone({ type: 'sawtooth', freq: 180, to: 2600, dur: 0.22, vol: 0.07, lp: 4200 });
        noise({ filter: 'highpass', from: 1500, to: 6000, dur: 0.26, vol: 0.12 });
      },
    },
    introReveal: {
      minGapMs: 300,
      play() {
        [C5, E5, G5, C6].forEach((f, i) => {
          tone({ type: 'square', freq: f, dur: 0.12, vol: 0.04, delay: i * 0.07, lp: 2600 });
          tone({ type: 'triangle', freq: f, dur: i === 3 ? 0.75 : 0.16, vol: 0.09, delay: i * 0.07, send: 0.4 });
        });
        [C5, G5].forEach((f) => tone({ type: 'triangle', freq: f, dur: 0.8, vol: 0.05, delay: 0.3, send: 0.45 }));
      },
    },
    pressStart: {
      minGapMs: 200,
      play() {
        tone({ type: 'square', freq: C6, dur: 0.07, vol: 0.1, lp: 2800 });
        tone({ type: 'square', freq: G6, dur: 0.14, vol: 0.1, delay: 0.07, lp: 2800 });
      },
    },
    // Interfaz de la sala de espera: entra un jugador, alguien pulsa JUGAR, cambia el modo.
    join: {
      minGapMs: 200,
      play() {
        tone({ type: 'triangle', freq: G5, dur: 0.14, vol: 0.12, send: 0.3 });
        tone({ type: 'triangle', freq: C6, dur: 0.22, vol: 0.12, delay: 0.09, send: 0.3 });
      },
    },
    ready: {
      minGapMs: 120,
      play() { tone({ type: 'square', freq: C6, dur: 0.08, vol: 0.09, lp: 2800 }); tone({ type: 'triangle', freq: G6, dur: 0.12, vol: 0.12, delay: 0.05, send: 0.25 }); },
    },
    mode: {
      minGapMs: 120,
      play() { tone({ type: 'square', freq: 330, to: 495, dur: 0.1, vol: 0.16, lp: 2200 }); },
    },
  };
}
