import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor, zoomAt, timeScaleAt, ZOOM_OUT } from '../client/host/finaleTimeline.js';

test('un impacto mortal da K.O. y luego GAME OVER (o "XXX WINS" con el nombre del ganador), con zoom; sin tanque conocido solo el segundo texto', () => {
  const ko = planFor('lives', true);
  assert.deepEqual(ko.texts.map((t) => t.text), ['K.O.', 'GAME OVER']);
  assert.equal(ko.zoom, true);
  assert.equal(planFor('lives', false).texts[0].text, 'GAME OVER');
});

test('tiempo agotado y abandono tienen su propio texto y no hacen zoom', () => {
  assert.equal(planFor('time', false).texts[0].text, 'TIME UP!');
  assert.equal(planFor('draw', false).texts[0].text, 'TIME UP!');
  assert.equal(planFor('forfeit', false).texts[0].text, 'GAME OVER');
  assert.equal(planFor('time', false).zoom, false);
});

test('los textos empiezan antes del final y nunca se pasan del guion', () => {
  for (const reason of ['lives', 'time', 'draw', 'forfeit']) {
    const plan = planFor(reason, true);
    for (const t of plan.texts) assert.ok(t.at < plan.doneAt, `${reason}: ${t.text}`);
  }
});

test('el zoom sube, se mantiene y vuelve a 0 al final', () => {
  const ko = planFor('lives', true);
  assert.equal(zoomAt(ko, 0), 0);
  assert.ok(zoomAt(ko, 300) > 0 && zoomAt(ko, 300) < 1);
  assert.equal(zoomAt(ko, 1500), 1);
  assert.equal(zoomAt(ko, ZOOM_OUT[1]), 0);
  assert.equal(zoomAt(planFor('time', false), 1000), 0);
});

test('la cámara lenta empieza lenta y acaba a velocidad normal', () => {
  assert.ok(timeScaleAt(0) < 0.25);
  assert.ok(timeScaleAt(1000) > timeScaleAt(0));
  assert.equal(timeScaleAt(5000), 1);
});

test('el final enseña "XXX WINS" con el nombre del ganador y "GAME OVER" si no se conoce', () => {
  assert.deepEqual(planFor('lives', true, ['BOA']).texts.map((t) => t.text), ['K.O.', 'BOA WINS']);
  assert.equal(planFor('forfeit', false, ['MANDO1']).texts[0].text, 'MANDO1 WINS');
  assert.equal(planFor('lives', false, ['AXL', 'VEX']).texts[0].text, 'AXL & VEX WINS');
  assert.equal(planFor('time', false, ['BOA']).texts[0].text, 'TIME UP!');
});
