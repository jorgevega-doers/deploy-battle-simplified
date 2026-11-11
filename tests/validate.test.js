import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInitials } from '../server/net/validate.js';

test('acepta 3 letras y las pasa a mayúsculas', () => {
  assert.equal(parseInitials('abc'), 'ABC');
  assert.equal(parseInitials('  Xyz '), 'XYZ');
});

test('rechaza longitudes y caracteres incorrectos', () => {
  for (const bad of ['', 'AB', 'ABCD', 'A1C', 'A C', 'ÑÑÑ', '<s>']) {
    assert.equal(parseInitials(bad), null, `debería rechazar "${bad}"`);
  }
});

test('rechaza lo que no es texto', () => {
  for (const bad of [undefined, null, 123, {}, ['ABC']]) {
    assert.equal(parseInitials(bad), null);
  }
});

test('rechaza las iniciales de la lista de bloqueo', () => {
  assert.equal(parseInitials('sex', ['SEX']), null);
  assert.equal(parseInitials('abc', ['SEX']), 'ABC');
});
