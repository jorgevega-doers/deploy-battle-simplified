import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, panFor } from '../client/host/sfx.js';
import { soundsForEvent } from '../client/host/sfxEvents.js';
import { createMotionTracker, speedBetween } from '../client/host/sfxMotionTracker.js';

// AudioContext falso: anota los osciladores y fuentes de ruido que se programan, sin audio real.
function fakeContext({ autoEnd = true } = {}) {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const made = { oscillators: 0, noises: 0 };
  return {
    made,
    currentTime: 1,
    sampleRate: 8000,
    state: 'running',
    destination: node(),
    createGain: () => node({ gain: param() }),
    createDynamicsCompressor: () => node({ threshold: param(), ratio: param() }),
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createConvolver: () => node({ buffer: null }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createOscillator: () => { made.oscillators++; return node({ type: '', frequency: param(), start() {}, stop() { if (autoEnd) this.onended?.(); }, onended: null }); },
    createBufferSource: () => { made.noises++; return node({ buffer: null, loop: false, start() {}, stop() { if (autoEnd) this.onended?.(); }, onended: null }); },
  };
}

test('el panorama estéreo sigue la posición en el mapa y nunca pasa de ±0,7', () => {
  assert.equal(panFor(16, 32), 0);
  assert.ok(panFor(0, 32) < -0.65 && panFor(0, 32) >= -0.7);
  assert.ok(panFor(32, 32) > 0.65 && panFor(32, 32) <= 0.7);
  assert.equal(panFor(100, 32), 0.7);
});

test('cada sonido se puede reproducir sin errores y programa al menos una voz', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  for (const name of sfx.names) {
    ctx.currentTime += 5; // pasa el tiempo mínimo entre sonidos iguales
    const before = ctx.made.oscillators + ctx.made.noises;
    assert.equal(sfx.play(name, { pan: 0.3, n: 2, slot: 3 }), true, name);
    assert.ok(ctx.made.oscillators + ctx.made.noises > before, `${name} no programó ninguna voz`);
  }
});

test('silenciado no suena, se recuerda y se puede volver a activar', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx, storage });
  sfx.setMuted(true);
  assert.equal(sfx.play('shot'), false);
  assert.equal(sfx.status, 'muted');
  assert.equal(createSfx({ context: fakeContext(), storage }).muted, true, 'se recuerda entre sesiones');
  sfx.toggleMute();
  assert.equal(sfx.play('shot'), true);
  assert.equal(sfx.status, 'on');
});

test('un mismo sonido no se repite más rápido que su tiempo mínimo y nunca hay más de 28 voces', () => {
  const ctx = fakeContext({ autoEnd: false });
  const sfx = createSfx({ context: ctx });
  assert.equal(sfx.play('bounce', { n: 1 }), true);
  assert.equal(sfx.play('bounce', { n: 1 }), false, 'dentro de los 30 ms se ignora');
  ctx.currentTime += 1;
  assert.equal(sfx.play('bounce', { n: 1 }), true);
  for (let i = 0; i < 40; i++) { ctx.currentTime += 2; sfx.play('powerupPick'); } // sus voces nunca "terminan" en el contexto falso
  assert.ok(sfx.activeVoices <= 28, `voces activas: ${sfx.activeVoices}`);
});

test('sin AudioContext (o antes del primer clic) no suena ni lanza errores', () => {
  const sfx = createSfx();
  assert.equal(sfx.play('shot'), false);
  sfx.unlock(); // sin Web Audio en Node: no pasa nada
  assert.equal(sfx.play('shot'), false);
  assert.equal(sfx.status, 'locked');
});

test('los eventos de la partida se traducen a sonidos con su panorama y retraso', () => {
  const state = { tanks: [[4, 5, 0, 3, 0, 0], [28, 10, 0, 3, 0, 0]] };
  const [shot] = soundsForEvent({ type: 'shot', slot: 2 }, state);
  assert.equal(shot.name, 'shot');
  assert.equal(shot.args.slot, 2);
  assert.ok(shot.args.pan > 0.4, 'el tanque 2 está a la derecha');
  assert.equal(soundsForEvent({ type: 'bounce', x: 2, y: 2, n: 3 }, state)[0].args.n, 3);
  const hit = soundsForEvent({ type: 'hit', slot: 1, lives: 2, x: 10, y: 5, round: true }, state);
  assert.deepEqual(hit.map((s) => s.name), ['hit', 'spawn']);
  assert.ok(hit[1].delayMs > 1000, 'tras un impacto de ronda la reaparición suena al acabar el zoom');
  assert.ok(soundsForEvent({ type: 'hit', slot: 2, lives: 1, x: 10, y: 5, round: false }, state)[1].delayMs < 500, 'un bot reaparece enseguida');
  assert.deepEqual(soundsForEvent({ type: 'hit', slot: 1, lives: 0, x: 10, y: 5 }, state).map((s) => s.name), ['hit'], 'sin reaparición si era la última vida');
  assert.equal(soundsForEvent({ type: 'match_over', winner: 1, reason: 'lives' }, state)[0].name, 'ko');
  assert.equal(soundsForEvent({ type: 'match_over', winner: null, reason: 'time' }, state)[0].name, 'timeUp');
  assert.deepEqual(soundsForEvent({ type: 'algo_desconocido' }, state), []);
});

test('el motor de cada tanque se crea al moverse, no suena en silencio ni antes del clic', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ context: ctx });
  const before = ctx.made.oscillators;
  sfx.motion(0, 0, 0); // parado: se crea (a volumen 0) pero no falla
  sfx.motion(1, 3, 0.4);
  assert.ok(ctx.made.oscillators > before, 'el motor usa osciladores');
  sfx.silenceMotion();
  sfx.setMuted(true);
  const afterMute = ctx.made.oscillators;
  sfx.motion(2, 4, 0);
  assert.equal(ctx.made.oscillators, afterMute, 'en silencio no se crean más motores');
  assert.equal(createSfx().motion(0, 3, 0), undefined, 'sin Web Audio no pasa nada');
});

test('el movimiento suena como golpes de madera: más seguidos cuanto más rápido, y nada si está parado', () => {
  const slow = fakeContext();
  createSfx({ context: slow }).motionPreview(0, 1, 1);
  const fast = fakeContext();
  createSfx({ context: fast }).motionPreview(0, 4.5, 1);
  const still = fakeContext();
  const quiet = createSfx({ context: still });
  quiet.motion(0, 0, 0);
  assert.ok(slow.made.oscillators >= 6 && slow.made.oscillators <= 10, `a poca velocidad: ${slow.made.oscillators} golpes por segundo`);
  assert.ok(fast.made.oscillators >= 15 && fast.made.oscillators <= 20, `a toda velocidad: ${fast.made.oscillators} golpes por segundo`);
  assert.equal(still.made.oscillators, 0, 'parado no hay golpes');
});

test('la velocidad de movimiento ignora saltos (recolocaciones), tanques eliminados y el primer fotograma', () => {
  assert.equal(speedBetween(0, 0, 0.1, 0, 25), 4);
  assert.equal(speedBetween(0, 0, 5, 0, 16), 0, 'un salto grande es una recolocación');
  assert.equal(speedBetween(0, 0, 1, 0, 0), 0);
  const tracker = createMotionTracker();
  const state = (x0, lives = 3) => ({ tankCount: 4, tanks: [{ x: x0, y: 0, lives: 3 }, { x: 5, y: 5, lives: 3 }, { x: 8, y: 8, lives }, { x: 9, y: 9, lives: 3 }] });
  assert.deepEqual([...tracker.update(state(0), 1000)], [0, 0, 0, 0], 'el primer fotograma no tiene velocidad');
  const speeds = tracker.update(state(0.1, 0), 1025);
  assert.equal(speeds[0], 4);
  assert.equal(speeds[2], 0, 'un bot eliminado no suena');
});

test('el control de volumen limita de 0 a 150 %, se recuerda entre sesiones y avisa a quien escucha', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const sfx = createSfx({ context: fakeContext(), storage });
  assert.deepEqual(sfx.volumes, { master: 1, sfx: 1, music: 1, amb: 1 });
  let notified = 0;
  sfx.onStatus(() => { notified++; });
  sfx.setVolume('master', 0.4);
  sfx.setVolume('music', 9);
  sfx.setVolume('amb', -3);
  sfx.setVolume('inexistente', 0.5);
  assert.equal(sfx.volumes.master, 0.4);
  assert.equal(sfx.volumes.music, 1.5);
  assert.equal(sfx.volumes.amb, 0);
  assert.equal(notified, 3, 'solo avisa de los volúmenes que existen');
  const again = createSfx({ context: fakeContext(), storage });
  assert.deepEqual(again.volumes, { master: 0.4, sfx: 1, music: 1.5, amb: 0 }, 'se recuerda al abrir de nuevo');
  assert.equal(again.play('shot'), true, 'con el volumen bajo sigue sonando (solo el silencio lo apaga)');
});

test('si el audio no se puede montar (sin tarjeta de sonido, máquina virtual) nada lanza errores: el juego sigue en silencio', () => {
  const broken = { ...fakeContext(), createConvolver: () => { throw new Error('NotSupportedError'); } };
  const sfx = createSfx({ context: broken });
  assert.doesNotThrow(() => sfx.unlock());
  assert.equal(sfx.play('shot'), false);
  assert.doesNotThrow(() => { sfx.play('explosion'); sfx.setVolume('music', 0.5); sfx.toggleMute(); });
  assert.notEqual(sfx.status, 'on');
  // y un navegador sin AudioContext tampoco
  const noAudio = createSfx({ context: null });
  assert.doesNotThrow(() => noAudio.unlock());
  assert.equal(noAudio.play('shot'), false);
});
