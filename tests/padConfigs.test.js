// Configuraciones de mandos compartidas: validación, votos (la más votada; en empate, la más reciente) y la API /api/pads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openPadConfigs, parsePadMapping, parsePadId } from '../server/db/padConfigs.js';
import { registerPadRoutes } from '../server/net/padRoutes.js';

const b = (i) => ({ t: 'b', i });
const GOOD = { start: b(11), select: b(10), a: b(2), b: b(1), fire: b(7), dash: b(6), lx: { i: 0, sign: 1 }, ly: { i: 1, sign: 1 } };

test('validación: 6 acciones en botones distintos, ejes opcionales; lo raro se rechaza', () => {
  assert.deepEqual(parsePadMapping(GOOD), GOOD);
  assert.equal(parsePadMapping({ ...GOOD, a: b(11) }), null, 'dos acciones en el mismo botón');
  assert.equal(parsePadMapping({ ...GOOD, fire: b(99) }), null);
  assert.equal(parsePadMapping({ ...GOOD, dash: undefined }), null);
  assert.equal(parsePadMapping({ ...GOOD, lx: { i: 0, sign: 3 } }), null);
  assert.deepEqual(parsePadMapping({ ...GOOD, fire: { t: 'a', i: 5, sign: 1, rest: -1, extra: '<script>' } }).fire, { t: 'a', i: 5, sign: 1, rest: -1 });
  assert.equal(parsePadId('GAME BOX JOYSTICK (Vendor: 0079 Product: 0006)'), 'GAME BOX JOYSTICK (Vendor: 0079 Product: 0006)');
  assert.equal(parsePadId('x'.repeat(200)), null);
  assert.equal(parsePadId('<b>\u0000'), null);
});

test('votos: gana la más votada; en empate, la más reciente; cada uno cambia su propio voto', async () => {
  let t = 1000;
  const db = await openPadConfigs({ url: ':memory:', now: () => t });
  assert.equal(await db.best('PAD'), null);
  await db.vote('PAD', GOOD, 'ana');
  assert.deepEqual(await db.best('PAD'), GOOD);
  const other = { ...GOOD, start: b(9) };
  t = 2000; await db.vote('PAD', other, 'bea');
  assert.deepEqual(await db.best('PAD'), other, 'empate 1-1: la más reciente');
  t = 3000; await db.vote('PAD', GOOD, 'carlos');
  assert.deepEqual(await db.best('PAD'), GOOD, '2 contra 1');
  t = 4000; await db.vote('PAD', other, 'carlos'); // carlos cambia de opinión: 1 contra 2
  assert.deepEqual(await db.best('PAD'), other);
  db.close();
});

test('API: GET 404 sin configuración, POST la guarda (validada) y GET la devuelve', async () => {
  const app = express();
  app.set('trust proxy', 1);
  const padsReady = openPadConfigs({ url: ':memory:' });
  registerPadRoutes(app, { json: express.json({ limit: '1kb' }), padsReady, salt: 's' });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://localhost:${server.address().port}/api/pads`;
  const id = 'GAME BOX JOYSTICK (Vendor: 0079 Product: 0006)';
  assert.equal((await fetch(`${base}?id=${encodeURIComponent(id)}`)).status, 404);
  const post = (body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ id, mapping: { ...GOOD, a: b(11) } })).status, 400, 'mal configurado: no se guarda');
  assert.equal((await post({ id, mapping: GOOD })).status, 201);
  assert.deepEqual((await (await fetch(`${base}?id=${encodeURIComponent(id)}`)).json()).mapping, GOOD);
  server.close();
  (await padsReady).close();
});
