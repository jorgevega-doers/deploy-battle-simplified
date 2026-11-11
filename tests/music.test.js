import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBar, chordForBar, degreeToHz, MOODS, SCALE_SEMITONES, D3 } from '../client/host/musicScore.js';
import { scapeKey, SCAPES, RUSH_SECONDS } from '../client/host/soundscape.js';
import { createSfx } from '../client/host/sfx.js';

// Semitonos sobre Re (módulo 12) de una frecuencia: debe ser siempre un grado de la escala (Re Mi Sol La Si).
const pitchClass = (hz) => ((Math.round(12 * Math.log2(hz / D3)) % 12) + 12) % 12;
const allowed = new Set(SCALE_SEMITONES);

test('la música usa SOLO notas de la escala pentatónica menor de Re (nunca una nota falsa), en todos los ánimos y compases', () => {
  for (const mood of Object.keys(MOODS)) {
    for (let bar = 0; bar < 64; bar++) {
      for (const e of composeBar(bar, mood)) {
        if (e.freq === 0) continue; // ruido (hi-hat, bombo)
        assert.ok(allowed.has(pitchClass(e.freq)), `${mood} compás ${bar}: ${e.kind} a ${e.freq.toFixed(1)} Hz no es de la escala`);
        assert.ok(e.freq > 60 && e.freq < 2500, `${e.kind} fuera de rango: ${e.freq}`);
      }
    }
  }
});

test('la pieza es siempre la misma (semilla fija) y cada compás cabe en 16 pasos', () => {
  assert.deepEqual(composeBar(5, 'play'), composeBar(5, 'play'));
  for (let bar = 0; bar < 16; bar++) {
    for (const e of composeBar(bar, 'rush')) {
      assert.ok(Number.isInteger(e.step) && e.step >= 0 && e.step < 16, `paso ${e.step}`);
      assert.ok(e.length >= 1 && e.vol > 0);
    }
  }
});

test('el ánimo calmado es más ligero que el de partida, y el de últimos segundos es más rápido y movido', () => {
  const count = (mood) => [0, 1, 2, 3].reduce((n, bar) => n + composeBar(bar, mood).length, 0);
  assert.ok(count('calm') < count('play') && count('play') <= count('rush') + 8);
  assert.ok(MOODS.calm.bpm < MOODS.play.bpm && MOODS.play.bpm < MOODS.rush.bpm);
  const kinds = (mood) => new Set([0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => composeBar(bar, mood).map((e) => e.kind)));
  assert.ok(!['lead', 'clap', 'ohat', 'stab', 'clank'].some((k) => kinds('calm').has(k)), 'el lobby solo lleva bombo suave, bajo, acordes y arpegio');
  assert.ok(kinds('calm').has('kick'), 'techno: bombo a 4 por compás también en el lobby');
  for (const k of ['kick', 'clap', 'ohat', 'bass', 'pad', 'arp', 'stab', 'clank', 'lead']) assert.ok(kinds('play').has(k), `la partida lleva ${k}`);
  assert.ok(kinds('rush').has('hat'), 'los últimos segundos añaden hi-hats rápidos');
  assert.equal(composeBar(0, 'play').filter((e) => e.kind === 'kick').length, 4, 'bombo a 4 por compás');
  for (const mood of Object.keys(MOODS)) assert.ok(composeBar(0, mood).some((e) => e.kind === 'bass'), `${mood} lleva bajo`);
});

test('los acordes se repiten cada 4 compases y las notas del acorde son de la escala', () => {
  assert.deepEqual(chordForBar(1), chordForBar(5));
  for (let bar = 0; bar < 4; bar++) for (const d of chordForBar(bar).tones) assert.ok(allowed.has(pitchClass(degreeToHz(d))));
});

test('el paisaje sonoro decide dónde suena cada cosa: música calma en el lobby, con ritmo en partida, sin música en el final', () => {
  assert.equal(scapeKey({ state: 'LOBBY' }), 'lobby');
  assert.equal(scapeKey({ state: 'READY' }), 'ready');
  assert.equal(scapeKey({ state: 'PLAYING', timeLeft: 120 }), 'playing');
  assert.equal(scapeKey({ state: 'PLAYING', timeLeft: RUSH_SECONDS }), 'rush');
  assert.equal(scapeKey({ state: 'PLAYING', timeLeft: 5, matchOver: true }), 'finale');
  assert.equal(scapeKey({ state: 'GAME_OVER' }), 'finale');
  assert.equal(scapeKey({ state: 'GAME_OVER', resultsShown: true }), 'results');
  assert.equal(SCAPES.finale.music, null);
  assert.equal(SCAPES.lobby.music, 'calm');
  assert.ok(SCAPES.playing.ambience < SCAPES.lobby.ambience, 'en partida el ambiente baja para que manden los efectos');
});

// AudioContext falso mínimo (como en sfx.test.js) para comprobar que la música y el ambiente programan voces y respetan el silencio.
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const made = { oscillators: 0, noises: 0 };
  return {
    made, currentTime: 1, sampleRate: 8000, state: 'running', destination: node(),
    createGain: () => node({ gain: param() }),
    createDynamicsCompressor: () => node({ threshold: param(), ratio: param() }),
    createBuffer: (c, length) => ({ getChannelData: () => new Float32Array(length) }),
    createConvolver: () => node({ buffer: null }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createOscillator: () => { made.oscillators++; return node({ type: '', frequency: param(), start() {}, stop() { this.onended?.(); }, onended: null }); },
    createBufferSource: () => { made.noises++; return node({ buffer: null, loop: false, start() {}, stop() { this.onended?.(); }, onended: null }); },
  };
}

test('la música programa notas en su bus, sube con el ánimo, y no suena si se silencia solo la música', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  sfx.musicPreview('calm', 1);
  const calm = ctx.made.oscillators + ctx.made.noises;
  assert.ok(calm > 5, `la música calma programó ${calm} voces`);
  const ctx2 = fakeContext();
  createSfx({ context: ctx2 }).musicPreview('play', 1);
  assert.ok(ctx2.made.oscillators + ctx2.made.noises > calm, 'la partida tiene más voces que el lobby');
  const ctx3 = fakeContext();
  const quiet = createSfx({ context: ctx3 });
  quiet.setMusicMuted(true);
  quiet.musicPreview('play', 1);
  assert.equal(ctx3.made.oscillators + ctx3.made.noises, 0, 'con la música silenciada (tecla N) no se programa nada');
});

test('el ambiente no tiene ruido continuo: solo detalles de calle (pasos, voces, tienda...); "duck" y los niveles no fallan', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  sfx.ambiencePreview(1);
  assert.equal(sfx.ambienceState.layers, 3, 'murmullo grave-medio: dos capas de tráfico y una de viento, filtradas por debajo de 1 kHz (nada de siseo)');
  for (const name of ['footsteps', 'murmur', 'laugh', 'shop', 'ramen', 'izakaya', 'karaoke', 'arcade', 'horn', 'cat']) assert.ok(sfx.ambienceEvents.includes(name), `hay ${name}`);
  for (const name of ['train', 'crossing', 'station', 'bike', 'vending', 'pachinko']) assert.ok(!sfx.ambienceEvents.includes(name), `${name} no pinta nada en esta escena y se quitó`);
  assert.ok(ctx.made.oscillators > 10, 'los detalles (campanita, semáforo, tienda...) usan osciladores');
  sfx.duck(0.4);
  sfx.ambienceLevel(0.3);
  sfx.musicMood('calm', 0.5);
  sfx.musicMood(null);
  assert.ok(sfx.levels.amb < 0.7 && sfx.levels.music === 0);
  const ctx2 = fakeContext();
  const muted = createSfx({ context: ctx2 });
  muted.setMuted(true);
  muted.ambienceEvent('train');
  assert.equal(ctx2.made.noises, 0, 'en silencio no suena nada');
  assert.equal(createSfx().ambienceEvent('train'), undefined, 'sin Web Audio no pasa nada');
});

test('ningún detalle del ambiente programa nada en el pasado (un retraso negativo rompe el reloj de audio)', () => {
  const ctx = fakeContext();
  const starts = [];
  for (const method of ['createOscillator', 'createBufferSource']) {
    const original = ctx[method];
    ctx[method] = () => { const source = original(); const start = source.start; source.start = (when) => { starts.push(when); start.call(source, when); }; return source; };
  }
  const sfx = createSfx({ context: ctx });
  for (let i = 0; i < 40; i++) for (const name of sfx.ambienceEvents) sfx.ambienceEvent(name, { x: 8 });
  assert.ok(starts.length > 100);
  assert.ok(starts.every((t) => Number.isFinite(t) && t >= ctx.currentTime), 'todos los inicios son del instante actual o posteriores');
});

test('los sonidos de cada local solo suenan si ese local existe en el mapa, y desde su posición', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  sfx.ambienceEvent('karaoke'); // sin locales registrados: no suena
  sfx.ambienceEvent('ramen');
  sfx.ambienceEvent('shop');
  assert.equal(ctx.made.oscillators + ctx.made.noises, 0, 'sin local no hay sonido de local');
  sfx.ambiencePlaces([{ type: 'karaoke', x: 8 }, { type: 'ramen', x: 24 }, { type: 'konbini', x: 7 }, { type: 'raro', x: Infinity }, null]);
  assert.equal(sfx.ambienceState.places, 3, 'se ignoran los datos inválidos');
  sfx.ambienceEvent('karaoke');
  const voices = ctx.made.oscillators;
  assert.ok(voices >= 5, `el karaoke canta ${voices} notas`);
  sfx.ambienceEvent('ramen');
  assert.ok(ctx.made.noises > 5, 'el ramen chisporrotea');
  const before = ctx.made.oscillators;
  sfx.ambienceEvent('horn', { x: 10 });
  assert.ok(ctx.made.oscillators >= before + 2, 'el bocinazo usa dos tonos');
});

test('la lluvia solo suena en el mapa de la lluvia: dos capas más de ruido, y se quitan al cambiar de mapa', () => {
  const dry = createSfx({ context: fakeContext() });
  dry.ambiencePreview(1);
  assert.equal(dry.ambienceState.rain, 0, 'sin lluvia no hay capas de lluvia');

  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  sfx.ambienceWeather('rain');
  assert.equal(sfx.ambienceState.weather, 'rain');
  sfx.ambienceOn(true); // arranca el ambiente: crea el murmullo y, además, la lluvia
  assert.equal(sfx.ambienceState.layers, 3, 'el murmullo de siempre sigue igual');
  assert.equal(sfx.ambienceState.rain, 2, 'la lluvia son dos capas de ruido filtrado');
  sfx.ambienceWeather(null);
  assert.equal(sfx.ambienceState.weather, null, 'al cambiar de mapa la lluvia deja de sonar');
  sfx.ambienceOn(false);
});
