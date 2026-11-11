import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLeaderboard, createNullLeaderboard } from '../server/db/leaderboard.js';

const entry = (initials, score, accuracy = 50) => ({ initials, score, accuracy });

test('guarda puntuaciones y devuelve el Top ordenado de mayor a menor', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert(entry('AAA', 1000));
  await board.insert(entry('BBB', 3000));
  await board.insert(entry('CCC', 2000));
  assert.deepEqual(await board.top(10), [
    { initials: 'BBB', score: 3000 },
    { initials: 'CCC', score: 2000 },
    { initials: 'AAA', score: 1000 },
  ]);
  await board.close();
});

test('el Top se limita a 10 y a igualdad de puntos gana la más antigua', async () => {
  const board = await openLeaderboard(':memory:');
  for (let i = 0; i < 15; i++) await board.insert(entry(String.fromCharCode(65 + i).repeat(3), 1000 + i));
  await board.insert(entry('ZZZ', 1014)); // empata con "OOO" (la más reciente de las anteriores): debe quedar detrás
  const top = await board.top(10);
  assert.equal(top.length, 10);
  assert.equal(top[0].initials, 'OOO');
  assert.equal(top[1].initials, 'ZZZ');
  assert.equal(top[0].score, top[1].score);
  await board.close();
});

test('la posición en el ranking cuenta cuántas puntuaciones son mejores; las iguales comparten posición', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert(entry('AAA', 3000));
  await board.insert(entry('BBB', 2000));
  await board.insert(entry('CCC', 2000));
  await board.insert(entry('DDD', 1000));
  assert.equal(await board.rankOf(3000), 1);
  assert.equal(await board.rankOf(2000), 2);
  assert.equal(await board.rankOf(1000), 4);
  assert.equal(await board.rankOf(5000), 1, 'una puntuación mejor que todas sería la 1.ª');
  await board.close();
});

test('rechaza datos que no cumplen las reglas de la tabla', async () => {
  const board = await openLeaderboard(':memory:');
  const bad = [entry('ab1', 100), entry('ABCD', 100), entry('AB', 100), entry('ABC', -1), entry('ABC', 100, 101), entry('ABC', 100, -1)];
  for (const b of bad) await assert.rejects(board.insert(b), undefined, `debería rechazar ${JSON.stringify(b)}`);
  assert.equal(await board.count(), 0);
  await board.close();
});

test('es resistente a inyección SQL: las iniciales con comillas se rechazan o se guardan tal cual, nunca se ejecutan', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert(entry('AAA', 100));
  await assert.rejects(board.insert(entry("A'); DROP TABLE leaderboard;--", 100)));
  assert.equal(await board.count(), 1, 'la tabla sigue intacta');
  await board.close();
});

test('los datos sobreviven a cerrar y volver a abrir la base de datos (reinicio del portátil)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'doersforce-'));
  const file = join(dir, 'leaderboard.db');
  try {
    const first = await openLeaderboard(file);
    await first.insert(entry('JVG', 4242, 66.6));
    await first.close();
    const second = await openLeaderboard(file);
    assert.deepEqual(await second.top(10), [{ initials: 'JVG', score: 4242 }]);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el ranking vacío funciona', async () => {
  const board = await openLeaderboard(':memory:');
  assert.deepEqual(await board.top(10), []);
  assert.equal(await board.rankOf(0), 1);
  await board.close();
});

test('el ranking "nulo" (sin base de datos) tiene la misma API y no falla', async () => {
  const board = createNullLeaderboard();
  await board.insert(entry('AAA', 1));
  assert.deepEqual(await board.top(10), []);
  assert.equal(await board.rankOf(5), null);
  assert.equal(await board.count(), 0);
});

test('reset borra todo el ranking y deja el de ejemplo; si una entrada es inválida, el ranking antiguo queda intacto', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert({ initials: 'AAA', accuracy: 10, score: 500 });
  await board.insert({ initials: 'CCC', accuracy: 20, score: 900 });
  await board.reset(Array.from({ length: 10 }, () => ({ initials: 'BOB', accuracy: 0, score: 3000 })));
  const top = await board.top(10);
  assert.equal(top.length, 10);
  assert.ok(top.every((row) => row.initials === 'BOB' && row.score === 3000));
  assert.equal(await board.count(), 10);
  // Una entrada inválida cancela la transacción entera: queda el ranking de antes.
  await assert.rejects(() => board.reset([{ initials: 'ZZZ', accuracy: 0, score: 1 }, { initials: 'no', accuracy: 0, score: 1 }]));
  assert.equal(await board.count(), 10);
  await board.reset([]); // reset vacío = ranking vacío
  assert.equal(await board.count(), 0);
  await board.close();
});

test('el ranking nulo también acepta reset sin romperse', async () => {
  await assert.doesNotReject(() => createNullLeaderboard().reset([{ initials: 'BOB', score: 3000 }]));
});

test('un único Top 10 para todos los modos: el modo se guarda como dato pero no separa el ranking', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert({ initials: 'AAA', score: 1000, accuracy: 10 });
  await board.insert({ initials: 'SOL', score: 5000, accuracy: 10, mode: 'solo' });
  await board.insert({ initials: 'SOB', score: 4000, accuracy: 10, mode: 'solo' });
  assert.deepEqual((await board.top(10)).map((e) => e.initials), ['SOL', 'SOB', 'AAA']);
  assert.equal(await board.rankOf(4500), 2);
  assert.equal(await board.count(), 3);
  await board.reset([{ initials: 'BOB', score: 3000 }]);
  assert.deepEqual(await board.top(10), [{ initials: 'BOB', score: 3000 }]);
  await board.close();
});

test('las puntuaciones de la fórmula anterior se borran al abrir un archivo antiguo (y se conservan las nuevas al reabrir)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lb-'));
  const file = join(dir, 'old.db');
  try {
    const sqlite3 = (await import('sqlite3')).default;
    await new Promise((resolve, reject) => {
      const raw = new sqlite3.Database(file, (err) => {
        if (err) return reject(err);
        raw.exec("CREATE TABLE leaderboard (id INTEGER PRIMARY KEY AUTOINCREMENT, initials TEXT NOT NULL, accuracy REAL NOT NULL, score INTEGER NOT NULL, timestamp INTEGER NOT NULL DEFAULT 0); INSERT INTO leaderboard (initials, accuracy, score) VALUES ('OLD', 10, 2222);", (e) => (e ? reject(e) : raw.close(resolve)));
      });
    });
    let board = await openLeaderboard(file);
    assert.deepEqual(await board.top(10), []);
    await board.insert({ initials: 'NEW', score: 7000, accuracy: 50 });
    await board.close();
    board = await openLeaderboard(file);
    assert.deepEqual(await board.top(10), [{ initials: 'NEW', score: 7000 }]);
    await board.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
