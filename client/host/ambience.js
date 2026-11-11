// Sonido ambiente de la calle de Tokio de noche (AGENTS.md, sección 44), sintetizado y de fondo. Cuarta versión (26-oct): el
// usuario dijo que algunos sonidos "no tenían nada que ver con la escena" (tren, paso a nivel, megafonía de estación, bicicletas:
// no hay vías ni bicis en el mapa), así que ahora cada sonido sale de algo que SE VE en la escena y, cuando es de un local, suena
// DESDE ese local (en su sitio del estéreo):
//   gente: pasos que cruzan, conversaciones y risas lejanas · konbini: campanilla y "irasshaimase" · ramen: el chisporroteo de la
//   plancha y el chocar de un cuenco · izakaya: risas y brindis de vasos · karaoke: alguien cantando amortiguado · salón recreativo:
//   pitidos y bolitas · coches y motos (los que se ven, con bocinazos cuando esquivan a un tanque, y otros lejanos) · maullidos y
//   ladridos (hay gatos y perros) · "pi-po" de los pasos de cebra · vapor de las alcantarillas.
// Y un murmullo grave-medio de fondo (100-1000 Hz): el rumor de muchos coches lejos, viento y aire de ciudad, con fluctuaciones
// pequeñas e irregulares (sin vaivén regular: eso sonaba a mar) y sin agudos (sin siseo).
// Todo inventado (ni jingles de tiendas reales ni palabras salvo el saludo genérico). Las voces van MUY de fondo (pedido del
// usuario). Va por el bus de ambiente de sfx.js. Qué NO hace: no sabe del estado de la partida (main.js sube o baja su nivel y le
// pasa los coches y los locales); sin clic del usuario no suena.
import { MANHOLES } from '../../shared/art/paint/street.js';

const STEAM_SOURCES = MANHOLES.filter((m) => m.steam);
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// Pan según x del mapa (0..32), como panFor de sfx.js pero sin importarla (evita un ciclo de módulos).
const panOf = (x) => Math.max(-0.7, Math.min(0.7, (x / 32 * 2 - 1) * 0.7));

// Formantes (Hz) de las vocales: una voz es un diente de sierra a la altura de la voz filtrado por dos bandas.
const VOWELS = { a: [800, 1200], i: [300, 2300], u: [350, 1300], e: [500, 1900], o: [500, 900] };
const VOICE_VOLUME = 0.5; // multiplicador de TODAS las voces (conversaciones, risas, saludo, karaoke): muy de fondo

// Cada cuánto (segundos, mínimo-máximo) ocurre cada detalle, y cuándo sale el primero. "place": solo suena si hay un local de ese
// tipo en el mapa (y desde su posición).
const SCHEDULE = {
  footsteps: { every: [3, 8], first: [1, 3] },
  murmur: { every: [11, 22], first: [3, 8] },
  laugh: { every: [30, 60], first: [12, 30] },
  farCar: { every: [6, 14], first: [2, 6] },
  horn: { every: [30, 70], first: [10, 25] }, // algún bocinazo suelto y lejano (los de verdad los dispara main.js al esquivar un tanque)
  cat: { every: [25, 55], first: [10, 25] },
  dog: { every: [70, 140], first: [30, 60] },
  beep: { every: [20, 45], first: [8, 18] },
  steam: { every: [6, 14], first: [2, 6] },
  shop: { every: [35, 70], first: [10, 25], place: 'konbini' },
  ramen: { every: [22, 50], first: [8, 20], place: 'ramen' },
  izakaya: { every: [28, 60], first: [14, 32], place: 'izakaya' },
  karaoke: { every: [40, 80], first: [18, 40], place: 'karaoke' },
  arcade: { every: [26, 60], first: [10, 28], place: 'arcade' },
};

// audio = { tone, noise, context(), noiseBuffer(), bus(name), ready() } (lo da sfx.js).
export function createAmbience(audio) {
  const { tone, noise } = audio;
  let timer = null;
  const nextAt = {};
  let running = false;
  let live = 0;           // voces propias vivas (las sílabas no pasan por tone(): se cuentan aparte)
  let layers = null;      // rumor grave continuo (se crea al arrancar por primera vez)
  let rain = null;        // lluvia continua (solo en el mapa de la lluvia; se crea cuando hace falta)
  let weather = null;     // 'rain' o null
  let places = [];        // locales del mapa: { type, x }

  // x de un local de ese tipo (al azar si hay varios); null si no hay ninguno (entonces ese sonido no suena).
  const placeX = (type) => { const list = places.filter((p) => p.type === type); return list.length ? pick(list).x : null; };
  const now = () => audio.context().currentTime;

  // Una sílaba de voz: diente de sierra a la altura "f0" filtrado por dos bandas (formantes de la vocal), con envolvente suave.
  // lp = paso bajo opcional (voz amortiguada por una pared: karaoke).
  function syllable({ when, f0, vowel, dur = 0.12, vol = 0.5, pan = 0, glide = 1, lp = 0 }) {
    const ctx = audio.context();
    if (live > 60) return;
    const [F1, F2] = VOWELS[vowel] ?? VOWELS.a;
    const level = vol * VOICE_VOLUME;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.linearRampToValueAtTime(f0 * glide, when + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(level, when + Math.min(0.03, dur * 0.3));
    env.gain.setValueAtTime(level, when + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const nodes = [osc, env];
    [[F1, 1], [F2, 0.55]].forEach(([freq, gain]) => {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq;
      band.Q.value = 5;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(band);
      band.connect(g);
      g.connect(env);
      nodes.push(band, g);
    });
    let out = env;
    if (lp > 0) {
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = lp;
      out.connect(muffle);
      out = muffle;
      nodes.push(muffle);
    }
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      out = panner;
      nodes.push(panner);
    }
    out.connect(audio.bus('amb'));
    live++;
    osc.onended = () => { live--; for (const n of nodes) { try { n.disconnect(); } catch { /* ya soltado */ } } };
    osc.start(when);
    osc.stop(when + dur + 0.04);
  }
  // Risa: "ja-ja-ja" que baja de altura.
  function laughter(t0, pan, f0, volume = 0.4) {
    for (let i = 0; i < 5; i++) syllable({ when: t0 + i * 0.14, f0: f0 * (1 - i * 0.04), vowel: 'a', dur: 0.09, vol: volume * (1 - i * 0.12), pan, glide: 0.9 });
  }

  // --- Murmullo grave-medio de la ciudad (pedido del usuario): el rumor de MUCHOS coches circulando a lo lejos, más viento y aire de
  // ciudad. Es ruido filtrado entre 100 y 900 Hz (nada de agudos: así no hay siseo). Para que no suene a MAR (el problema de la
  // primera versión, que subía y bajaba con un vaivén lento y regular) no hay ningún LFO: la ganancia y el filtro cambian a
  // pequeños saltos al azar y cada pocos segundos (el tráfico fluctúa poco y el viento da ráfagas irregulares y cortas). ---
  const mods = []; // { param, base, spread, every: [s, s], nextAt, tc }
  function noiseLayer(ctx, { filters, gain, pan = 0 }) {
    const source = ctx.createBufferSource();
    source.buffer = audio.noiseBuffer();
    source.loop = true;
    let last = source;
    const nodes = {};
    for (const [name, type, freq, q] of filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      last.connect(filter);
      last = filter;
      nodes[name] = filter;
    }
    const base = ctx.createGain();
    base.gain.value = gain;
    const level = ctx.createGain();
    level.gain.value = 0; // fundido general de la capa
    last.connect(base);
    base.connect(level);
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      level.connect(panner);
      panner.connect(audio.bus('amb'));
    } else level.connect(audio.bus('amb'));
    source.start();
    return { out: level, target: 1, base, nodes };
  }
  function buildLayers() {
    const ctx = audio.context();
    layers = [
      // Tráfico: el rumor constante de muchos coches lejos (grave-medio, un poco a cada lado).
      noiseLayer(ctx, { filters: [['hp', 'highpass', 90, 0.7], ['lp', 'lowpass', 750, 0.7]], gain: 0.0289, pan: -0.2 }),
      noiseLayer(ctx, { filters: [['hp', 'highpass', 120, 0.7], ['lp', 'lowpass', 1000, 0.7]], gain: 0.0204, pan: 0.2 }),
      // Viento y aire de ciudad: más suave y más medio, con ráfagas irregulares.
      noiseLayer(ctx, { filters: [['bp', 'bandpass', 420, 0.6]], gain: 0.0119 }),
    ];
    const [trafficLeft, trafficRight, wind] = layers;
    // El tráfico fluctúa poco (±12 % cada 1-3 s); el viento sube y baja más (0,35-1,6 veces) en ráfagas de 3-8 s y cambia de tono.
    mods.length = 0;
    mods.push({ param: trafficLeft.base.gain, base: 0.0289, spread: [0.88, 1.12], every: [1, 3], tc: 0.7 });
    mods.push({ param: trafficRight.base.gain, base: 0.0204, spread: [0.88, 1.12], every: [1.2, 3.2], tc: 0.7 });
    mods.push({ param: wind.base.gain, base: 0.0119, spread: [0.35, 1.6], every: [3, 8], tc: 1.4 });
    mods.push({ param: wind.nodes.bp.frequency, base: 420, spread: [0.7, 1.5], every: [3, 8], tc: 1.6 });
    for (const m of mods) m.nextAt = 0;
  }
  // Lluvia (28-oct, mapa de la noche de lluvia): un colchón de gotas medio-agudo, suave y sin siseo fino, y un golpeteo grave
  // sobre los tejados. Las dos capas fluctúan poco y de forma irregular (como el resto del ambiente: nada que vaya y venga).
  function buildRain() {
    const ctx = audio.context();
    rain = [
      noiseLayer(ctx, { filters: [['hp', 'highpass', 500, 0.6], ['bp', 'bandpass', 1500, 0.35]], gain: 0.016, pan: -0.15 }),
      noiseLayer(ctx, { filters: [['hp', 'highpass', 300, 0.6], ['lp', 'lowpass', 1100, 0.6]], gain: 0.02, pan: 0.15 }),
    ];
    mods.push({ param: rain[0].base.gain, base: 0.016, spread: [0.8, 1.25], every: [2, 5], tc: 1.0 });
    mods.push({ param: rain[1].base.gain, base: 0.02, spread: [0.75, 1.3], every: [2.5, 6], tc: 1.2 });
    for (const m of mods) m.nextAt ??= 0;
  }
  // Cambios al azar de las capas (se llama con el mismo temporizador que los detalles).
  function modulate(time) {
    if (!layers) return;
    for (const m of mods) {
      if (time < m.nextAt) continue;
      m.nextAt = time + rand(...m.every) * 1000;
      m.param.setTargetAtTime(m.base * rand(...m.spread), now(), m.tc);
    }
  }
  const fade = (to, seconds) => {
    if (!layers) return;
    const t = now();
    for (const l of layers) l.out.gain.setTargetAtTime(to ? l.target : 0, t, seconds / 3);
    for (const l of rain ?? []) l.out.gain.setTargetAtTime(to && weather === 'rain' ? l.target : 0, t, seconds / 3);
  };

  // --- Detalles ---
  const events = {
    // Pasos de alguien que cruza (de 4 a 8, a ritmo de paseo): se acerca y se aleja de lado a lado. Zapatos blandos.
    footsteps() {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const count = Math.floor(rand(4, 9));
      const gap = rand(0.46, 0.58);
      for (let i = 0; i < count; i++) {
        const swell = Math.sin((Math.PI * (i + 0.7)) / (count + 0.4)) ** 0.8;
        const pan = 0.6 * dir * (-1 + (2 * i) / (count - 1));
        const t = Math.max(0, i * gap + rand(-0.025, 0.025)); // (un retraso negativo rompería el reloj de audio)
        noise({ filter: 'bandpass', from: rand(1500, 2100), dur: 0.035, vol: 0.16 * swell, delay: t, pan, q: 0.9, bus: 'amb' }); // el suelo
        noise({ filter: 'lowpass', from: 420, dur: 0.06, vol: 0.14 * swell, delay: t, pan, bus: 'amb' }); // el tacón
      }
    },
    // Conversación lejana: dos voces (una grave y otra aguda) que se turnan con frases de sílabas.
    murmur() {
      const pan = rand(-0.65, 0.65);
      const voices = [rand(115, 135), rand(205, 235)];
      let t = now() + 0.02;
      for (let turn = 0; turn < 4; turn++) {
        const syllables = Math.floor(rand(3, 7));
        let pitch = voices[turn % 2];
        for (let i = 0; i < syllables; i++) {
          pitch *= rand(0.94, 1.07);
          syllable({ when: t, f0: pitch, vowel: pick(['a', 'a', 'o', 'u', 'e', 'i']), dur: rand(0.09, 0.16), vol: 0.35, pan, glide: i === syllables - 1 ? 0.85 : 1 });
          t += rand(0.12, 0.2);
        }
        t += rand(0.25, 0.6); // pausa antes de que conteste el otro
      }
    },
    // Una risa lejana.
    laugh() { laughter(now() + 0.02, rand(-0.65, 0.65), rand(210, 270)); },
    // Konbini (tienda 24 h): campanilla de 3 notas inventadas y, después, un "irasshaimase" genérico. Suena desde el local.
    shop({ x } = {}) {
      const at = x ?? placeX('konbini');
      if (at === null) return;
      const pan = panOf(at);
      [880, 1174.7, 1318.5].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.05, delay: i * 0.13, pan, send: 0.3, bus: 'amb' }));
      const f0 = rand(195, 215);
      // i - ra - ssha - i - ma - se  (vocales y duraciones de la palabra; la "sh" lleva un siseo corto)
      [['i', 0.09], ['a', 0.1], ['a', 0.13], ['i', 0.09], ['a', 0.1], ['e', 0.22]].reduce((t, [vowel, dur], i) => {
        syllable({ when: t, f0: f0 * (1 + (i === 2 ? 0.08 : 0) - (i === 5 ? 0.1 : 0)), vowel, dur, vol: 0.5, pan, glide: i === 5 ? 0.88 : 1 });
        if (i === 2) noise({ filter: 'highpass', from: 4500, dur: 0.08, vol: 0.02, delay: Math.max(0, t - now() - 0.05), pan, bus: 'amb' });
        return t + dur + 0.02;
      }, now() + 0.55);
    },
    // Puesto de ramen: chisporroteo de la plancha y el golpe de un cuenco de cerámica.
    ramen({ x } = {}) {
      const at = x ?? placeX('ramen');
      if (at === null) return;
      const pan = panOf(at);
      noise({ filter: 'highpass', from: 5200, to: 4200, dur: 1.6, vol: 0.05, attack: 0.15, pan, q: 0.6, bus: 'amb' });
      for (let i = 0; i < 9; i++) noise({ filter: 'bandpass', from: rand(3500, 6000), dur: 0.02, vol: rand(0.03, 0.07), delay: rand(0, 1.5), pan, q: 3, bus: 'amb' }); // salpicaduras
      tone({ type: 'sine', freq: 2350, dur: 0.18, vol: 0.04, delay: 1.2, pan, attack: 0.002, send: 0.2, bus: 'amb' });
      tone({ type: 'sine', freq: 3700, dur: 0.1, vol: 0.02, delay: 1.2, pan, attack: 0.002, bus: 'amb' });
    },
    // Izakaya: risas de la gente de dentro y un brindis (dos vasos que chocan).
    izakaya({ x } = {}) {
      const at = x ?? placeX('izakaya');
      if (at === null) return;
      const pan = panOf(at);
      const t0 = now() + 0.02;
      laughter(t0, pan, rand(200, 250), 0.35);
      laughter(t0 + 0.5, pan, rand(120, 140), 0.3);
      for (let i = 0; i < 2; i++) tone({ type: 'sine', freq: 3900 + i * 380, dur: 0.16, vol: 0.03, delay: 1.3 + i * 0.01, pan, attack: 0.001, bus: 'amb' });
    },
    // Karaoke: alguien canta amortiguado por la pared (unas notas largas de la escala del juego).
    karaoke({ x } = {}) {
      const at = x ?? placeX('karaoke');
      if (at === null) return;
      const pan = panOf(at);
      const f = rand(190, 230);
      let t = now() + 0.02;
      for (const [ratio, dur, vowel] of [[1, 0.45, 'a'], [1.19, 0.4, 'o'], [1.33, 0.5, 'e'], [1.5, 0.45, 'a'], [1.33, 0.8, 'o']]) {
        syllable({ when: t, f0: f * ratio, vowel, dur, vol: 0.32, pan, glide: rand(0.97, 1.03), lp: 900 });
        t += dur + 0.04;
      }
    },
    // Salón recreativo: pitiditos electrónicos y bolitas, un par de segundos, desde el local.
    arcade({ x } = {}) {
      const at = x ?? placeX('arcade');
      if (at === null) return;
      const pan = panOf(at);
      for (let i = 0; i < 22; i++) noise({ filter: 'bandpass', from: rand(3500, 6500), dur: 0.03, vol: rand(0.03, 0.06), delay: i * rand(0.05, 0.1), pan, q: 4, bus: 'amb' });
      for (let i = 0; i < 4; i++) tone({ type: 'square', freq: pick([784, 988, 1175, 1568, 1976]), dur: 0.08, vol: 0.025, delay: rand(0, 2), pan, lp: 2500, bus: 'amb' });
    },
    // Bocinazo (coche): uno o dos pitidos cortos de dos tonos. Se dispara al esquivar un tanque, y de vez en cuando uno lejano.
    horn({ x } = {}) {
      const pan = typeof x === 'number' ? panOf(x) : rand(-0.6, 0.6);
      const volume = typeof x === 'number' ? 0.1 : 0.045; // los que se ven, más fuertes que los lejanos
      const beeps = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < beeps; i++) {
        tone({ type: 'square', freq: 415, dur: 0.2, vol: volume, delay: i * 0.3, pan, lp: 1700, attack: 0.008, bus: 'amb' });
        tone({ type: 'square', freq: 523, dur: 0.2, vol: volume * 0.8, delay: i * 0.3, pan, lp: 1700, attack: 0.008, bus: 'amb' });
      }
    },
    // Un gato maúlla en algún tejado.
    cat() {
      const pan = rand(-0.7, 0.7);
      tone({ type: 'triangle', freq: 640, to: 980, dur: 0.16, vol: 0.05, pan, lp: 3000, attack: 0.03, bus: 'amb' });
      tone({ type: 'triangle', freq: 980, to: 520, dur: 0.34, vol: 0.05, delay: 0.16, pan, lp: 3000, attack: 0.01, bus: 'amb' });
      tone({ type: 'sine', freq: 1960, to: 1040, dur: 0.3, vol: 0.012, delay: 0.16, pan, bus: 'amb' }); // armónico
    },
    // Un perro ladra lejos: uno o dos "guau" graves.
    dog() {
      const pan = rand(-0.7, 0.7);
      const barks = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < barks; i++) {
        tone({ type: 'sawtooth', freq: 320, to: 170, dur: 0.14, vol: 0.05, delay: i * 0.3, pan, lp: 800, attack: 0.008, bus: 'amb' });
        noise({ filter: 'bandpass', from: 700, dur: 0.1, vol: 0.04, delay: i * 0.3, pan, q: 1, bus: 'amb' });
      }
    },
    // Un coche o moto lejano (cortos y suaves).
    farCar() {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const pan = rand(-0.4, 0.4);
      noise({ filter: 'bandpass', from: 320, to: 620, dur: rand(1.2, 2.2), vol: rand(0.08, 0.12), attack: 0.5, pan: pan - 0.3 * dir, panTo: pan + 0.3 * dir, q: 0.8, bus: 'amb' });
    },
    // Un coche o moto cercano (los que se ven en la ciudad): soplido que cruza de lado a lado; la moto, más aguda y corta.
    car({ x = 16, scooter = false } = {}) {
      const pan = panOf(x);
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (scooter) noise({ filter: 'bandpass', from: 900, to: 1700, dur: 0.7, vol: 0.09, attack: 0.15, pan: pan - 0.2 * dir, panTo: pan + 0.2 * dir, q: 1.1, bus: 'amb' });
      else noise({ filter: 'bandpass', from: 380, to: 800, dur: 1.0, vol: 0.12, attack: 0.25, pan: pan - 0.25 * dir, panTo: pan + 0.25 * dir, q: 0.8, bus: 'amb' });
    },
    // "Pi-po" de los pasos de cebra: dos notitas, tres veces.
    beep() {
      const pan = rand(-0.5, 0.5);
      for (let i = 0; i < 3; i++) {
        tone({ type: 'sine', freq: 1568, dur: 0.12, vol: 0.055, delay: i * 0.55, pan, bus: 'amb' });
        tone({ type: 'sine', freq: 1175, dur: 0.18, vol: 0.055, delay: i * 0.55 + 0.16, pan, bus: 'amb' });
      }
    },
    // Vapor de una alcantarilla: siseo suave desde su posición en el mapa.
    steam({ x } = {}) {
      const at = typeof x === 'number' ? x : STEAM_SOURCES.length ? pick(STEAM_SOURCES).x : 16;
      noise({ filter: 'highpass', from: 3200, to: 2400, dur: 1.2, vol: 0.03, attack: 0.25, pan: panOf(at), q: 0.5, bus: 'amb' });
    },
  };

  function schedule(time) {
    modulate(time);
    for (const [name, spec] of Object.entries(SCHEDULE)) {
      if (nextAt[name] === undefined) nextAt[name] = time + rand(...spec.first) * 1000;
      if (time >= nextAt[name]) {
        nextAt[name] = time + rand(...spec.every) * 1000;
        if (audio.ready() && (!spec.place || placeX(spec.place) !== null)) events[name]();
      }
    }
  }

  return {
    // Arranca el rumor grave (con un fundido de 2 s) y los detalles ocasionales. Puede llamarse varias veces.
    start() {
      if (!audio.ready()) return;
      if (!layers) buildLayers();
      if (weather === 'rain' && !rain) buildRain();
      running = true;
      fade(true, 2);
      if (!timer) { timer = setInterval(() => schedule(performance.now()), 400); timer.unref?.(); }
    },
    // Tiempo del mapa: 'rain' añade la lluvia al ambiente; null la quita (con un fundido).
    setWeather(kind) {
      weather = kind === 'rain' ? 'rain' : null;
      if (weather === 'rain' && audio.ready() && layers && !rain) buildRain();
      if (running) fade(true, 1.5);
      else if (rain) fade(false, 0.6);
    },
    // Para todo con un fundido (los detalles que ya están sonando acaban en unos segundos).
    silence() {
      running = false;
      fade(false, 0.6);
      clearInterval(timer);
      timer = null;
    },
    // Locales del mapa [{ type, x }] (konbini, ramen, izakaya, karaoke, arcade...): de ahí salen los sonidos de cada local.
    setPlaces(list) { places = Array.isArray(list) ? list.filter((p) => p && typeof p.type === 'string' && Number.isFinite(p.x)) : []; },
    // Dispara un detalle a mano: lo usa main.js (coches, bocinazos) y el menú de pruebas.
    event(name, args) { if (audio.ready() && events[name]) events[name](args); },
    names: Object.keys(events),
    // Solo para medir niveles: arranca el rumor y lanza todos los detalles a la vez.
    preview() {
      if (!audio.ready()) return;
      if (!layers) buildLayers();
      fade(true, 0.01);
      for (const name of Object.keys(events)) events[name]({ x: 8 });
    },
    get state() { return { running, layers: layers ? layers.length : 0, rain: rain ? rain.length : 0, weather, places: places.length }; },
  };
}
