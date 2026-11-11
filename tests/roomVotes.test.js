// Votación de mapa y dificultad de las partidas públicas (server/net/roomVotes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomVotes } from '../server/net/roomVotes.js';

test('sin votos: mapa aleatorio y MEDIA; gana lo más votado; cambiar el voto lo mueve', () => {
  const v = createRoomVotes({ rng: () => 0 });
  assert.deepEqual(v.forget('nadie'), null);
  assert.equal(v.vote('a', 'map', 1), 1);
  assert.equal(v.vote('b', 'map', 1), 1);
  assert.equal(v.vote('c', 'map', 2), 1, '2 votos contra 1');
  assert.equal(v.vote('a', 'map', 2), 2, 'a cambia su voto: ahora gana el 2');
  assert.deepEqual(v.forget('a'), { map: 1, level: 'media' }, 'empate 1-1 con rng 0: el primero de los empatados');
  assert.deepEqual(v.info(), { map: { 1: 1, 2: 1 }, level: {} });
});

test('empate: al azar entre los empatados; votos que no valen no cuentan', () => {
  const v = createRoomVotes({ rng: () => 0.99 });
  v.vote('a', 'level', 'stand');
  assert.equal(v.vote('b', 'level', 'pro'), 'pro', 'rng 0.99: el último de los empatados');
  assert.equal(v.vote('c', 'level', 'imposible'), null);
  assert.equal(v.vote('c', 'map', 7), null);
  assert.equal(v.vote('c', 'color', 'rojo'), null);
  assert.equal(v.vote('c', 'map', 'random'), 'random');
  assert.deepEqual(v.mine('a'), { map: null, level: 'stand' });
});
