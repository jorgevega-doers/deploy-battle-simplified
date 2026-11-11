import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQualityController, MAX_QUALITY_LEVEL } from '../client/host/quality.js';

// Simula "seconds" segundos de fotogramas de "frameMs" ms. Devuelve los niveles a los que se ha bajado.
function simulate(controller, startAt, seconds, frameMs) {
  const changes = [];
  let now = startAt;
  while (now < startAt + seconds * 1000) {
    now += frameMs;
    const change = controller.update(frameMs, now);
    if (change !== null) changes.push({ level: change, at: Math.round(now) });
  }
  return { changes, end: now };
}

test('con 60, 48 o 35 FPS no baja nunca de calidad: se prioriza la alta', () => {
  for (const ms of [16.7, 20.8, 28.5]) {
    const quality = createQualityController();
    assert.deepEqual(simulate(quality, 0, 30, ms).changes, [], `a ${ms} ms`);
    assert.equal(quality.level, 0);
  }
});

test('por debajo de 30 FPS (fotograma medio > 34 ms durante la ventana) baja a MEDIA', () => {
  const quality = createQualityController();
  const { changes } = simulate(quality, 0, 2.5, 40);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].level, 1);
  assert.ok(changes[0].at >= 2000 && changes[0].at <= 2200, `bajó a los ${changes[0].at} ms`);
});

test('en automático se queda en MEDIA aunque siga yendo mal (BAJA es solo manual)', () => {
  const quality = createQualityController({ windowMs: 1000, warmupMs: 200 });
  const { changes } = simulate(quality, 0, 30, 60);
  assert.deepEqual(changes.map((c) => c.level), [1]);
  assert.equal(quality.level, 1);
});

test('nunca vuelve a subir de nivel, aunque el rendimiento mejore', () => {
  const quality = createQualityController({ windowMs: 1000, warmupMs: 200 });
  const bad = simulate(quality, 0, 1.5, 40);
  assert.equal(quality.level, 1);
  assert.deepEqual(simulate(quality, bad.end, 20, 8).changes, []);
  assert.equal(quality.level, 1);
});

test('un parón aislado (pestaña oculta, carga) no cuenta como mal rendimiento', () => {
  const quality = createQualityController({ windowMs: 2000 });
  let now = 0;
  const changes = [];
  for (let i = 0; i < 400; i++) {
    const frameMs = i === 100 ? 3000 : 16.7;
    now += frameMs;
    const change = quality.update(frameMs, now);
    if (change !== null) changes.push(change);
  }
  assert.deepEqual(changes, []);
});

test('en manual (auto = false) no cambia nunca y respeta el nivel inicial', () => {
  const quality = createQualityController({ auto: false, startLevel: 2 });
  assert.deepEqual(simulate(quality, 0, 20, 100).changes, []);
  assert.equal(quality.level, 2);
});

test('setLevel / setAuto: manual no baja solo, automático desde BAJA/MEDIA no sigue bajando, y el nivel se limita', () => {
  const quality = createQualityController({ windowMs: 1000, warmupMs: 200 });
  quality.setAuto(false);
  quality.setLevel(2);
  assert.equal(quality.level, 2);
  assert.deepEqual(simulate(quality, 0, 5, 60).changes, []);
  quality.setAuto(true);
  assert.deepEqual(simulate(quality, 10000, 3, 60).changes, [], 'el automático no baja de MEDIA');
  quality.setLevel(99);
  assert.equal(quality.level, MAX_QUALITY_LEVEL);
  quality.setLevel(-4);
  assert.equal(quality.level, 0);
});
