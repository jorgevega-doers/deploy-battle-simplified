// Motor de sonido del host: Web Audio API, todo SINTETIZADO por código (osciladores y ruido), sin archivos de audio ni muestras
// de terceros, así que no hay derechos de autor ajenos. Aquí vive el "hardware": el contexto de
// audio, un compresor suave contra saturaciones, una reverb pequeña de "salón" (la parte acogedora), el silencio (tecla M, y N
// para solo la música), TRES BUSES de mezcla (efectos, música y ambiente; la música y el ambiente se agachan un instante con
// cada golpe fuerte: "ducking") y las dos piezas con las que se construye cada sonido: tone() (un tono con envolvente) y
// noise() (ruido filtrado). Las recetas de los efectos están en sfxSounds.js, la música en music.js y el ambiente en ambience.js.
// Qué NO hace: no decide cuándo suena algo (main.js le pasa los eventos) ni toca el juego. Sin AudioContext (o sin clic del
// usuario, que los navegadores exigen) simplemente no suena: nunca lanza errores.
import { createSounds } from './sfxSounds.js';
import { createMotionSound } from './sfxMotion.js';
import { createMusic } from './music.js';
import { createAmbience } from './ambience.js';

const MAX_VOICES = { sfx: 28, music: 80, amb: 150 }; // (la música programa 250 ms por delante: en tiempo real nunca se acerca al tope) // tope de sonidos a la vez en cada bus: si hay más, se descartan los nuevos
const MASTER_VOLUME = 3.6; // las recetas están escritas con volúmenes bajos; así quedan a un nivel cómodo (medido sin altavoces con OfflineAudioContext)
const BUS_LEVEL = { sfx: 1, music: 0.11, amb: 0.2 }; // efectos > música > ambiente (ver AGENTS.md, sección 44)
const STORAGE_KEY = 'doersforce.sfx.muted';
const MUSIC_KEY = 'doersforce.sfx.musicMuted';
const VOLUME_KEY = 'doersforce.sfx.volumes';
const MAX_USER_VOLUME = 1.5; // el control de volumen del usuario va de 0 a 150 % (100 % = el nivel de fábrica)
const REVERB_SECONDS = 0.9;

// Posición horizontal en el mundo (0 a width) -> panorama estéreo suave (-0.7 izquierda ... 0.7 derecha).
export const panFor = (x, width = 32) => Math.max(-0.7, Math.min(0.7, (x / width * 2 - 1) * 0.7));

// context = un AudioContext (o uno falso en las pruebas, o un OfflineAudioContext para medir los niveles); storage = donde se
// recuerda el silencio (localStorage).
export function createSfx({ context = null, storage = null } = {}) {
  let ctx = context;
  let master = null;
  let reverbIn = null;
  let noiseBuffer = null;
  const bus = { sfx: null, music: null, amb: null };
  const level = { ...BUS_LEVEL };                // nivel actual de cada bus (la música y el ambiente cambian según el momento)
  const volume = { master: 1, sfx: 1, music: 1, amb: 1 }; // volumen que elige el usuario (control de volumen), se multiplica por lo anterior
  const active = { sfx: 0, music: 0, amb: 0 };
  let muted = false;
  let musicMuted = false;
  let unlocked = Boolean(context);
  let musicStopTimer = null;
  const lastPlayed = new Map(); // sonido -> instante del último, para no saturar (rebotes, disparos...)
  const listeners = new Set();
  try {
    muted = storage?.getItem(STORAGE_KEY) === '1';
    musicMuted = storage?.getItem(MUSIC_KEY) === '1';
    const saved = JSON.parse(storage?.getItem(VOLUME_KEY) ?? 'null');
    for (const name of Object.keys(volume)) if (Number.isFinite(saved?.[name])) volume[name] = Math.min(MAX_USER_VOLUME, Math.max(0, saved[name]));
  } catch { /* sin almacenamiento: no se recuerda */ }

  function build() {
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME * volume.master;
    const compressor = ctx.createDynamicsCompressor(); // evita que varias explosiones juntas saturen
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    for (const name of Object.keys(bus)) {
      bus[name] = ctx.createGain();
      bus[name].gain.value = level[name] * volume[name];
      bus[name].connect(master);
    }
    // Reverb de salón pequeño: ruido que se apaga solo (respuesta al impulso). Da el aire acogedor a los tonos.
    const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 0.55;
    reverbIn.connect(convolver);
    convolver.connect(master);
    // Ruido blanco de 1 s que reutilizan todos los golpes y soplidos.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  }

  // Si el audio no se puede montar (equipo o máquina virtual sin tarjeta de sonido, navegador raro) se queda en silencio para siempre: nada de aquí lanza
  // errores (antes, un fallo en build() paraba la pantalla "PULSA UNA TECLA" y el juego no arrancaba).
  let broken = false;
  function ensure() {
    if (broken) return false;
    try {
      if (!ctx) {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!Context) { broken = true; return false; }
        ctx = new Context();
      }
      if (!master) build();
      return true;
    } catch (err) {
      console.warn('Sonido desactivado (el audio no se pudo iniciar):', err?.message ?? err);
      broken = true;
      master = null;
      try { ctx?.close?.(); } catch { /* ya cerrado */ }
      ctx = null;
      return false;
    }
  }
  // Un contexto "offline" (pruebas de nivel) programa sonidos aunque no esté "running"; el real, solo tras el clic del usuario.
  const offline = Boolean(context?.startRendering);
  const ready = () => ctx !== null && master !== null && !muted && (offline || ctx.state === 'running');
  const musicReady = () => ready() && !musicMuted;

  // Conecta un nodo de salida a su bus con panorama y envío a la reverb.
  function route(last, { pan = 0, send = 0, to = 'sfx' }) {
    let out = last;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      out = panner;
    }
    out.connect(bus[to]);
    if (send > 0) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      out.connect(sendGain);
      sendGain.connect(reverbIn);
    }
  }
  function track(source, nodes, endAt, to) {
    active[to]++;
    source.onended = () => { active[to]--; for (const node of nodes) { try { node.disconnect(); } catch { /* ya soltado */ } } };
    source.start(endAt.start);
    source.stop(endAt.stop);
  }
  const canPlay = (to) => (to === 'music' ? musicReady() : ready()) && active[to] < MAX_VOICES[to];

  // Un tono con envolvente suave: ataque corto (sin chasquidos) y caída exponencial. freq -> to es un barrido de altura.
  // bus: 'sfx' (por defecto), 'music' o 'amb'.
  function tone({ type = 'triangle', freq, to = freq, dur = 0.12, vol = 0.15, attack = 0.006, delay = 0, pan = 0, lp = 4200, send = 0, bus: target = 'sfx' }) {
    if (!canPlay(target)) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    route(gain, { pan, send, to: target });
    track(osc, [osc, filter, gain], { start: t, stop: t + dur + 0.03 }, target);
  }

  // Ruido filtrado (golpes, explosiones, soplidos): el filtro barre de "from" a "to" Hz.
  function noise({ filter: kind = 'lowpass', from = 1500, to = from, dur = 0.2, vol = 0.15, attack = 0.004, delay = 0, pan = 0, panTo = pan, send = 0, q = 0.8, bus: target = 'sfx' }) {
    if (!canPlay(target)) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = kind;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    // Si cambia el panorama (algo que pasa de un lado a otro: un tren, un coche), el panoramizador se mueve durante el sonido.
    if (panTo !== pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, t);
      panner.pan.linearRampToValueAtTime(panTo, t + dur);
      gain.connect(panner);
      panner.connect(bus[target]);
      track(source, [source, filter, gain, panner], { start: t, stop: t + dur + 0.03 }, target);
      return;
    }
    route(gain, { pan, send, to: target });
    track(source, [source, filter, gain], { start: t, stop: t + dur + 0.03 }, target);
  }

  // Parte comun que reciben los generadores (efectos, música y ambiente).
  const audio = { tone, noise, context: () => ctx, noiseBuffer: () => noiseBuffer, bus: (name) => bus[name], reverb: () => reverbIn };
  const sounds = createSounds({ tone, noise });
  // Motor continuo de cada tanque (el "tanquecito de juguete"): se mantiene encendido y solo cambia de volumen y tono.
  const motion = createMotionSound({ context: () => ctx, master: () => bus.sfx, noise: () => noiseBuffer, ready });
  const music = createMusic({ ...audio, ready: musicReady });
  const ambience = createAmbience({ ...audio, ready });
  const notify = () => { for (const fn of listeners) fn(api.status); };
  if (context) ensure(); // con un contexto dado (pruebas) el grafo se monta ya

  // Cambia el nivel de un bus (la música y el ambiente suben y bajan según el momento del juego) con un fundido suave.
  function setLevel(name, value, seconds = 0.6) {
    level[name] = value;
    if (bus[name]) bus[name].gain.setTargetAtTime(value * volume[name], ctx.currentTime, Math.max(0.01, seconds / 3));
  }

  const api = {
    // Primer clic o tecla del usuario: los navegadores no dejan sonar antes. Se llama desde main.js.
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume?.().then(() => { unlocked = true; notify(); }).catch(() => {});
      else { unlocked = true; notify(); }
    },
    // 'locked' = falta el primer clic; 'muted' = silenciado (tecla M); 'on' = suena.
    get status() { return !unlocked && !offline ? 'locked' : muted ? 'muted' : ready() ? 'on' : 'locked'; },
    get muted() { return muted; },
    get musicMuted() { return musicMuted; },
    setMuted(value) {
      muted = Boolean(value);
      try { storage?.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* da igual */ }
      if (muted) { motion.silence(); ambience.silence(); }
      // Silenciar corta también lo que ya estaba programado (un tren, una frase de música...): se baja el volumen general al momento.
      if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME * volume.master, ctx.currentTime, 0.02);
      notify();
    },
    // Tecla N: silencia solo la música (el ambiente y los efectos siguen).
    setMusicMuted(value) {
      musicMuted = Boolean(value);
      try { storage?.setItem(MUSIC_KEY, musicMuted ? '1' : '0'); } catch { /* da igual */ }
      notify();
    },
    toggleMusic() { api.setMusicMuted(!musicMuted); },
    // Velocidad (celdas/s) del tanque "index" para su sonido de movimiento; llamar en cada fotograma. silenceMotion() = parar todos.
    motion(index, speed, pan = 0) { motion.update(index, speed, pan); },
    silenceMotion() { if (ctx && master) motion.silence(); },
    motionHeavy(index, on) { motion.setHeavy(index, on); }, // tanque de TNI: motor grave y pesado
    motionPreview(index, speed, seconds) { motion.preview(index, speed, seconds); }, // solo para medir niveles
    toggleMute() { api.setMuted(!muted); },
    onStatus(fn) { listeners.add(fn); },
    get activeVoices() { return active.sfx; },
    get activeMusicVoices() { return active.music; },
    get activeAmbienceVoices() { return active.amb; },
    // Reproduce un sonido por nombre (ver sfxSounds.js). minGapMs evita que se amontonen (rebotes, disparos).
    play(name, args = {}) {
      const sound = sounds[name];
      if (!sound || !ready()) return false;
      const now = ctx.currentTime * 1000;
      if (now - (lastPlayed.get(name) ?? -1e9) < sound.minGapMs) return false;
      lastPlayed.set(name, now);
      sound.play(args);
      return true;
    },
    names: Object.keys(sounds),

    // --- Mezcla: la música y el ambiente se agachan un instante cuando suena algo fuerte (amount = fracción que se queda) ---
    duck(amount = 0.45, holdS = 0.25, releaseS = 0.7) {
      if (!ready() || !bus.music) return;
      const t = ctx.currentTime;
      for (const name of ['music', 'amb']) {
        const g = bus[name].gain;
        g.cancelScheduledValues?.(t);
        g.setTargetAtTime(level[name] * volume[name] * amount, t, 0.03);
        g.setTargetAtTime(level[name] * volume[name], t + holdS, releaseS / 3);
      }
    },
    setLevel,
    get levels() { return { ...level }; },
    // --- Control de volumen del usuario: 'master' (general), 'sfx' (efectos), 'music' (música) y 'amb' (ambiente); de 0 a 1,5 (1 = nivel de fábrica) ---
    setVolume(name, value) {
      if (!(name in volume)) return;
      volume[name] = Math.min(MAX_USER_VOLUME, Math.max(0, Number(value) || 0));
      try { storage?.setItem(VOLUME_KEY, JSON.stringify(volume)); } catch { /* da igual */ }
      if (ctx && master) {
        if (name === 'master') master.gain.setTargetAtTime(MASTER_VOLUME * volume.master, ctx.currentTime, 0.03);
        else bus[name].gain.setTargetAtTime(level[name] * volume[name], ctx.currentTime, 0.03);
      }
      notify();
    },
    get volumes() { return { ...volume }; },

    // --- Música (music.js) y ambiente (ambience.js) ---
    // mood: 'calm' (lobby y resultados), 'play' (partida), 'rush' (últimos 10 s); null/'off' la para con un fundido.
    // scale = fracción del volumen normal de la música (p. ej. 0,5 durante la cuenta atrás). Parar la música es un fundido de 0,8 s.
    musicMood(mood, scale = 1) {
      clearTimeout(musicStopTimer);
      if (!mood || mood === 'off') {
        if (bus.music) setLevel('music', 0, 0.8);
        musicStopTimer = setTimeout(() => music.setMood(null), 900);
        musicStopTimer.unref?.();
        return;
      }
      if (bus.music) setLevel('music', BUS_LEVEL.music * scale, 0.6);
      music.setMood(mood);
    },
    ambienceLevel(scale = 1) { if (bus.amb) setLevel('amb', BUS_LEVEL.amb * scale, 1.2); },
    musicPreview(mood, bars) { music.preview(mood, bars); },       // solo para medir niveles
    get musicState() { return music.state; },
    ambienceOn(on = true) { if (on) ambience.start(); else ambience.silence(); },
    get ambienceEvents() { return ambience.names; },
    ambienceWeather(kind) { ambience.setWeather(kind); },    // 'rain' o null: la lluvia del mapa de la noche de lluvia
    ambiencePlaces(list) { ambience.setPlaces(list); },      // locales del mapa [{ type, x }]: de ahí salen los sonidos de cada local
    ambienceEvent(name, args) { ambience.event(name, args); },      // 'train', 'crossing', 'beep', 'chime', 'car', 'steam'
    ambiencePreview(seconds) { ambience.preview(seconds); },        // solo para medir niveles
    get ambienceState() { return ambience.state; },
  };
  return api;
}
