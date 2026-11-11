import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelImage } from '../shared/art/pixelImage.js';
import { applyTheme, THEMES } from '../shared/art/theme.js';
import { MAPS, createArena } from '../shared/arena.js';
import { MOODS } from '../client/host/moods.js';

const sample = () => { const img = new PixelImage(4, 1); img.data.set([40, 40, 80, 255, 120, 110, 140, 255, 255, 240, 200, 255, 0, 0, 0, 0]); return img; };

test('la noche (el mapa original) no cambia ningún píxel', () => {
  const img = sample(); const before = Uint8Array.from(img.data);
  applyTheme(img, 'night');
  assert.deepEqual(img.data, before);
});

test('el atardecer aclara y calienta lo apagado; la lluvia lo enfría; los neones muy claros casi no cambian y lo transparente se respeta', () => {
  const dusk = applyTheme(sample(), 'dusk').data;
  const rain = applyTheme(sample(), 'rain').data;
  assert.ok(dusk[0] > 40 && dusk[0] > dusk[2] - 40, 'más claro y más rojizo');
  assert.ok(rain[2] > rain[0], 'la lluvia tira a azul');
  assert.ok(Math.abs(dusk[8] - 255) <= 15 && Math.abs(dusk[9] - 240) <= 25, 'el neón claro casi no cambia');
  assert.equal(dusk[15], 0);
  for (const d of [dusk, rain]) for (let i = 0; i < d.length; i++) assert.ok(d[i] >= 0 && d[i] <= 255);
});

test('cada mapa tiene un ambiente que existe en moods.js y en theme.js', () => {
  assert.deepEqual(MAPS.map((m) => m.mood), ['night', 'dusk', 'rain']);
  for (let i = 0; i < MAPS.length; i++) {
    const a = createArena(i);
    assert.ok(a.mood in MOODS, a.mood);
    assert.ok(a.mood in THEMES, a.mood);
  }
});
