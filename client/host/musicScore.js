// El "compositor" de la música de fondo (AGENTS.md, sección 44): una pieza ORIGINAL y reproducible que se genera por código, sin
// copiar ni inspirarse en ninguna melodía real (así no hay derechos de autor ajenos). Es lógica pura (sin audio): dado el número
// de compás y el "ánimo" devuelve las notas que suenan, y music.js las toca.
// Estilo (cambiado el 26-oct a petición del usuario): TECHNO INDUSTRIAL pero ACOGEDOR, para un juego de tanques. Bombo a 4 por
// compás, bajo rodante en la parte débil del tiempo, palmas en el 2 y el 4, hi-hats abiertos a contratiempo y un golpe metálico
// ("clank") de fábrica de vez en cuando; para que siga siendo cozy, el bajo y los acordes van filtrados y suaves, con acordes
// de fondo y un arpegio de "pluck" blando, y la melodía es corta y tímida.
// Escala pentatónica menor de Re (Re Fa Sol La Do): sin semitonos, así que cualquier combinación suena bien y nunca hay una
// nota falsa (lo comprueban los tests). Progresión de 4 compases que se repite; la melodía varía cada 2 compases a partir de una
// semilla fija, por eso es siempre la misma pieza.
//   ánimos: 'calm' (lobby y resultados: bombo suave, bajo, acordes y arpegio), 'play' (partida: + palmas, hi-hats, golpes de
//           acorde y melodía), 'rush' (últimos 10 s: más rápida, hi-hats en semicorcheas y melodía más movida).
export const D3 = 146.83;                 // Re3 en Hz
export const SCALE_SEMITONES = [0, 3, 5, 7, 10]; // Re Fa Sol La Do sobre Re
export const MOODS = {
  // 27-oct (petición del usuario): más oscuro y grave, techno industrial duro. Se añaden 'drone' (zumbido grave), 'rumble'
  // (retumbo a contratiempo) y 'anvil' (yunque), el bajo baja una octava y sube el tempo y el bombo.
  calm: { bpm: 116, layers: ['kick', 'bass', 'drone', 'pad', 'arp'], bassMode: 0, arpEvery: 2, kickVol: 0.34, leadDensity: 0 },
  play: { bpm: 132, layers: ['kick', 'clap', 'ohat', 'rumble', 'grime', 'bass', 'drone', 'pad', 'arp', 'stab', 'clank', 'anvil', 'lead'], bassMode: 1, arpEvery: 1, kickVol: 0.56, leadDensity: 0.4 },
  rush: { bpm: 148, layers: ['kick', 'clap', 'ohat', 'hat', 'rumble', 'grime', 'bass', 'drone', 'pad', 'arp', 'stab', 'clank', 'anvil', 'lead'], bassMode: 2, arpEvery: 1, kickVol: 0.6, leadDensity: 0.65 },
};

// Grado de la escala (0 = Re, 1 = Fa, 2 = Sol, 3 = La, 4 = Do, 5 = Re de la octava siguiente...) -> Hz.
export function degreeToHz(degree, octaveShift = 0) {
  const octave = Math.floor(degree / 5);
  const semitone = SCALE_SEMITONES[((degree % 5) + 5) % 5] + 12 * (octave + octaveShift);
  return D3 * 2 ** (semitone / 12);
}

// Acordes (grados de la escala) y nota de bajo de cada compás: Re menor - Sol/La (sus) - Re menor sobre Fa - Fa (add9).
const PROGRESSION = [
  { tones: [0, 1, 3], root: 0 },
  { tones: [2, 3, 4], root: 2 },
  { tones: [1, 3, 5], root: 1 },
  { tones: [4, 5, 6], root: 4 },
];
export const chordForBar = (bar) => PROGRESSION[((bar % 4) + 4) % 4];

// Generador de números al azar con semilla (mulberry32): la misma pieza en cada arranque.
function rngFor(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SONG_SEED = 0x7ec4a;
// Pasos (de 0 a 15 dentro del compás) donde suena el bajo en cada modo: 0 = solo a contratiempo, 1 = rodante, 2 = muy rodante.
const BASS_STEPS = [[2, 6, 10, 14], [0, 2, 6, 7, 10, 14], [0, 2, 3, 6, 8, 10, 11, 14, 15]];
// Ritmos de la melodía para 2 compases (pasos de 0 a 31): se elige uno por frase.
const LEAD_RHYTHMS = [
  [3, 6, 10, 14, 19, 22, 27, 30],
  [2, 7, 10, 15, 18, 23, 26, 31],
  [0, 6, 8, 14, 20, 22, 28, 30],
  [4, 7, 12, 15, 20, 23, 28, 31],
];

// Notas del compás "bar" para el ánimo "mood": lista de { step 0-15, length (en pasos), kind, freq (Hz; 0 si es ruido), vol }.
export function composeBar(bar, mood = 'calm') {
  const cfg = MOODS[mood] ?? MOODS.calm;
  const chord = chordForBar(bar);
  const events = [];
  const phrase = Math.floor(bar / 2);
  const rng = rngFor(SONG_SEED + phrase * 7919);
  const has = (layer) => cfg.layers.includes(layer);

  if (has('kick')) for (const step of [0, 4, 8, 12]) events.push({ step, length: 1, kind: 'kick', freq: 0, vol: cfg.kickVol });
  if (has('clap')) for (const step of [4, 12]) events.push({ step, length: 1, kind: 'clap', freq: 0, vol: 0.05 });
  if (has('ohat')) for (const step of [2, 6, 10, 14]) events.push({ step, length: 1, kind: 'ohat', freq: 0, vol: 0.035 });
  if (has('hat')) for (let step = 0; step < 16; step += 2) if (step % 4 !== 2) events.push({ step: step + 1, length: 1, kind: 'hat', freq: 0, vol: 0.02 });
  if (has('bass')) {
    BASS_STEPS[cfg.bassMode].forEach((step, i) => {
      const upOctave = i % 3 === 2 && cfg.bassMode > 0; // algún salto de octava: da movimiento
      events.push({ step, length: 1, kind: 'bass', freq: degreeToHz(chord.root, upOctave ? 0 : -1), vol: 0.26 }); // una octava más grave
    });
  }
  if (has('drone')) { // zumbido grave continuo: la fundamental y la quinta del acorde
    events.push({ step: 0, length: 16, kind: 'drone', freq: degreeToHz(chord.root, -1), vol: 0.05 });
    events.push({ step: 0, length: 16, kind: 'drone', freq: degreeToHz(chord.root + 3, -1), vol: 0.03 });
  }
  if (has('rumble')) for (const step of [2, 6, 10, 14]) events.push({ step, length: 1, kind: 'rumble', freq: degreeToHz(chord.root, -1), vol: 0.11 });
  if (has('grime')) { // dark techno sucio: golpes graves con ruido a contratiempo del bombo (pasos 3 y 11; en rush, también 7 y 15)
    for (const step of mood === 'rush' ? [3, 7, 11, 15] : [3, 11]) events.push({ step, length: 2, kind: 'grime', freq: degreeToHz(chord.root, -1), vol: 0.11 });
  }
  if (has('anvil')) events.push({ step: bar % 2 ? 10 : 6, length: 1, kind: 'anvil', freq: 0, vol: 0.04 });
  if (has('pad')) for (const degree of chord.tones) events.push({ step: 0, length: 16, kind: 'pad', freq: degreeToHz(degree, 0), vol: 0.045 });
  if (has('arp')) {
    const shape = [0, 1, 2, 1, 2, 0];
    for (let step = 0, i = 0; step < 16; step += cfg.arpEvery, i++) {
      const degree = chord.tones[shape[i % shape.length] % chord.tones.length];
      events.push({ step, length: cfg.arpEvery, kind: 'arp', freq: degreeToHz(degree, 2), vol: mood === 'calm' ? 0.022 : 0.026 });
    }
  }
  if (has('stab')) { // golpes de acorde cortos y filtrados, a contratiempo (los tres sonidos del acorde a la vez)
    const stabSteps = mood === 'rush' ? [3, 6, 11, 14] : [6, 14];
    for (const step of stabSteps) for (const degree of chord.tones) events.push({ step, length: 1, kind: 'stab', freq: degreeToHz(degree, 1), vol: 0.03 });
  }
  if (has('clank') && (bar % 2 === 1 || bar % 4 === 0)) events.push({ step: bar % 4 === 3 ? 15 : bar % 2 === 1 ? 11 : 7, length: 1, kind: 'clank', freq: 0, vol: 0.03 });
  if (has('lead') && cfg.leadDensity > 0) {
    const rhythm = LEAD_RHYTHMS[phrase % LEAD_RHYTHMS.length];
    const half = bar % 2 === 0 ? 0 : 16;
    let degree = chord.tones[0] + 5 + Math.floor(rng() * 2); // empieza cerca del acorde, una octava arriba
    for (const abs of rhythm) {
      if (abs < half || abs >= half + 16) continue;
      if (rng() > cfg.leadDensity) continue; // algunas notas se omiten: la melodía respira
      const onChordTone = rng() < 0.6;
      degree = onChordTone ? chord.tones[Math.floor(rng() * chord.tones.length)] + 5 : degree + (rng() < 0.5 ? -1 : 1);
      degree = Math.min(11, Math.max(3, degree)); // se mantiene en el registro medio-agudo
      events.push({ step: abs - half, length: 2, kind: 'lead', freq: degreeToHz(degree, 1), vol: 0.06 });
    }
    // La última nota de cada frase cae en una nota del acorde: suena a "frase terminada".
    const last = [...events].reverse().find((e) => e.kind === 'lead');
    if (last && bar % 2 === 1) last.freq = degreeToHz(chord.tones[0] + 5, 1);
  }
  return events.sort((a, b) => a.step - b.step);
}
