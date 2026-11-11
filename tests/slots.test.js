import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlots } from '../server/net/slots.js';

test('asigna P1, P2, P3 y P4, y rechaza al quinto', () => {
  const slots = createSlots();
  for (const [i, name] of ['AAA', 'BBB', 'CCC', 'DDD'].entries()) assert.deepEqual(slots.assign(`s${i}`, name), { slot: i + 1, initials: name });
  assert.equal(slots.assign('s4', 'EEE'), null);
  assert.equal(slots.isFull(), true);
  assert.equal(slots.count(), 4);
});

test('con 2 plazas (salas online) el tercero ya no cabe', () => {
  const slots = createSlots(2);
  slots.assign('a', 'AAA');
  slots.assign('b', 'BBB');
  assert.equal(slots.assign('c', 'CCC'), null);
  assert.deepEqual(slots.occupancy(), [true, true]);
});

test('un mismo socket no ocupa dos plazas', () => {
  const slots = createSlots();
  slots.assign('a', 'AAA');
  assert.deepEqual(slots.assign('a', 'ZZZ'), { slot: 1, initials: 'AAA' });
  assert.deepEqual(slots.occupancy(), [true, false, false, false]);
});

test('liberar una plaza permite que entre otro jugador en esa misma plaza', () => {
  const slots = createSlots();
  slots.assign('a', 'AAA');
  slots.assign('b', 'BBB');
  assert.equal(slots.release('a'), true);
  assert.deepEqual(slots.occupancy(), [false, true, false, false]);
  assert.deepEqual(slots.assign('c', 'CCC'), { slot: 1, initials: 'CCC' });
});

test('liberar un socket sin plaza no hace nada', () => {
  const slots = createSlots();
  assert.equal(slots.release('nadie'), false);
});

test('compact: al irse alguien, los que quedan pasan a ser P1..Pn y se avisa a los que cambian de número', () => {
  const slots = createSlots();
  for (const [i, name] of ['AAA', 'BBB', 'CCC', 'DDD'].entries()) slots.assign(`s${i}`, name);
  slots.release('s0');
  slots.release('s2');
  assert.deepEqual(slots.compact(), [{ socketId: 's1', slot: 1, initials: 'BBB' }, { socketId: 's3', slot: 2, initials: 'DDD' }]);
  assert.deepEqual(slots.initials(), ['BBB', 'DDD', null, null]);
  assert.equal(slots.get('s3').slot, 2);
  assert.equal(slots.socketId(2), 's3');
  assert.deepEqual(slots.compact(), [], 'si ya están juntos no cambia nadie');
});

test('rebind devuelve la plaza a un socket nuevo con el mismo token (y a nadie más)', () => {
  const slots = createSlots();
  const token = 'tokensecreto1234567890';
  slots.assign('a', 'AAA', null, token);
  slots.assign('b', 'BBB', null, 'otrotoken1234567890xx');
  assert.equal(slots.rebind('falso-falso-falso-falso', 'c'), null);
  const back = slots.rebind(token, 'c');
  assert.deepEqual({ slot: back.slot, initials: back.initials, old: back.oldSocketId }, { slot: 1, initials: 'AAA', old: 'a' });
  assert.equal(slots.get('a'), null);
  assert.equal(slots.get('c').slot, 1);
  assert.equal(slots.socketId(1), 'c');
});

test('clear vacía todas las plazas', () => {
  const slots = createSlots();
  slots.assign('a', 'AAA');
  slots.assign('b', 'BBB');
  slots.clear();
  assert.deepEqual(slots.initials(), [null, null, null, null]);
  assert.equal(slots.isFull(), false);
});
