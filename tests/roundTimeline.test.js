import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, DONE_MS, TEXT_AT, zoomAt, timeScaleAt } from '../client/host/roundTimeline.js';
import { config } from '../server/config.js';

test('la animación del impacto dura lo mismo que la pausa del servidor', () => {
  assert.equal(DONE_MS / 1000, config.game.roundFreezeS);
});

test('el orden del guion es: texto, reaparición y fin', () => {
  assert.ok(TEXT_AT < HOLD_MS && HOLD_MS < DONE_MS);
});

test('el zoom sube, se mantiene y ya ha vuelto a 0 cuando reaparecen los tanques', () => {
  assert.equal(zoomAt(0), 0);
  assert.ok(zoomAt(150) > 0 && zoomAt(150) < 1);
  assert.equal(zoomAt(700), 1);
  assert.equal(zoomAt(HOLD_MS), 0);
  assert.equal(zoomAt(DONE_MS), 0);
});

test('la cámara lenta empieza lenta y acaba a velocidad normal antes de reaparecer', () => {
  assert.ok(timeScaleAt(0) < 0.25);
  assert.ok(timeScaleAt(900) > timeScaleAt(0));
  assert.equal(timeScaleAt(HOLD_MS), 1);
});
