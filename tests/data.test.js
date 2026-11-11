// Datos del stand (sección 78): el Top 10 y los emails NUNCA se pierden. Con archivos de verdad en una carpeta temporal (no en memoria):
// reabrir tras un "reinicio", reiniciar el Top 10 y cambiar la fórmula sin borrar, copiar la base antigua sin tocarla, copias de seguridad y Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { openLeaderboard, SCORE_VERSION } from '../server/db/leaderboard.js';
import { openContacts } from '../server/db/contacts.js';
import { openDatabase } from '../server/db/sqlite.js';
import { prepareDataFile } from '../server/db/dataDir.js';
import { backupNow, startAutoBackup } from '../server/db/backup.js';
import { buildXlsx } from '../server/db/xlsx.js';
import { createApp } from '../server/app.js';

const tempDir = () => mkdtempSync(join(tmpdir(), 'deploy-battle-test-'));

test('el Top 10 y los emails siguen ahí tras cerrar y volver a abrir el archivo (reinicio del equipo)', async () => {
  const file = join(tempDir(), 'datos.db');
  let board = await openLeaderboard(file);
  let contacts = await openContacts(file);
  await board.insert({ initials: 'ANA', accuracy: 50, score: 7000 });
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
  await board.close(); await contacts.close();
  board = await openLeaderboard(file);
  contacts = await openContacts(file);
  assert.deepEqual(await board.top(), [{ initials: 'ANA', score: 7000 }]);
  assert.equal(await contacts.count(), 1);
  await board.close(); await contacts.close();
});

test('reiniciar el Top 10 ARCHIVA las puntuaciones: dejan de contar pero no se borran', async () => {
  const board = await openLeaderboard(':memory:');
  await board.insert({ initials: 'ANA', accuracy: 50, score: 9000 });
  await board.insert({ initials: 'LUI', accuracy: 40, score: 8000 });
  await board.reset([{ initials: 'BOB', accuracy: 0, score: 3000 }]);
  assert.deepEqual(await board.top(), [{ initials: 'BOB', score: 3000 }]);
  assert.equal(await board.rankOf(5000), 1, 'las archivadas no cuentan para la posición');
  const all = await board.all();
  assert.equal(all.length, 3, 'las tres siguen guardadas');
  assert.deepEqual(all.filter((r) => r.archived_at !== null).map((r) => r.initials).sort(), ['ANA', 'LUI']);
});

test('un archivo con una fórmula de puntuación anterior se ARCHIVA al abrir, no se borra', async () => {
  const file = join(tempDir(), 'viejo.db');
  const raw = await openDatabase(file);
  await raw.exec("CREATE TABLE leaderboard (id INTEGER PRIMARY KEY AUTOINCREMENT, initials TEXT NOT NULL, accuracy REAL NOT NULL, score INTEGER NOT NULL, timestamp INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'multi')");
  await raw.run("INSERT INTO leaderboard (initials, accuracy, score) VALUES ('OLD', 10, 4000)");
  await raw.exec(`PRAGMA user_version = ${SCORE_VERSION - 1}`);
  await raw.close();
  const board = await openLeaderboard(file);
  assert.deepEqual(await board.top(), []);
  const all = await board.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].initials, 'OLD');
  assert.notEqual(all[0].archived_at, null);
  await board.close();
});

test('la base de datos antigua de la carpeta del juego se COPIA a la carpeta de datos (la original no se toca) y nunca se pisa una existente', () => {
  const dir = tempDir();
  const legacy = join(dir, 'leaderboard.db');
  writeFileSync(legacy, 'antigua');
  const file = join(dir, 'DeployBattle', 'deploy-battle.db');
  assert.equal(prepareDataFile(file, { legacy, log: () => {} }), 'copied');
  assert.equal(readFileSync(file, 'utf8'), 'antigua');
  assert.ok(existsSync(legacy), 'la antigua sigue en su sitio');
  writeFileSync(legacy, 'otra');
  assert.equal(prepareDataFile(file, { legacy, log: () => {} }), 'ready');
  assert.equal(readFileSync(file, 'utf8'), 'antigua', 'una base de datos que ya existe no se sustituye');
  assert.equal(prepareDataFile(join(dir, 'x', 'nueva.db'), { log: () => {} }), 'new');
  assert.equal(prepareDataFile(':memory:'), 'memory');
});

test('la copia de seguridad es una base de datos completa y nunca pisa otra copia', async () => {
  const dir = tempDir();
  const file = join(dir, 'datos.db');
  const contacts = await openContacts(file);
  await contacts.save({ email: 'eva@doersdf.com', initials: 'EVA', consent: 'v4' });
  const when = new Date(2026, 10, 4, 10, 0, 0);
  const a = await backupNow(file, join(dir, 'copias'), { now: when });
  const b = await backupNow(file, join(dir, 'copias'), { now: when });
  assert.notEqual(a, b);
  const copy = await openContacts(b);
  assert.equal((await copy.all())[0].email, 'eva@doersdf.com');
  await copy.close(); await contacts.close();
  const auto = startAutoBackup(file, join(dir, 'auto'), { everyMs: 60000, log: () => {} });
  const last = await auto.now('prueba');
  auto.stop();
  assert.ok(last && existsSync(last.file));
  assert.ok(readdirSync(join(dir, 'auto')).length >= 1);
});

// Lee un ZIP sin comprimir (el que genera buildXlsx): { nombre: texto }.
function readStoredZip(buf) {
  const files = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const crc = buf.readUInt32LE(p + 14);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    const data = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    assert.equal(zlibCrc32(data) >>> 0, crc, `CRC de ${name}`);
    files[name] = data.toString('utf8');
    p += 30 + nameLen + size;
  }
  return files;
}

test('el Excel (.xlsx) lleva sus partes, las hojas y los datos escapados (sin fórmulas)', () => {
  const xlsx = buildXlsx([{ name: 'Emails', rows: [['Email', 'Partidas'], ['a&b@doersdf.com', 3], ['=HYPERLINK("x")', 0]] }, { name: 'Otra/hoja', rows: [] }]);
  const files = readStoredZip(xlsx);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(part in files, part);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('a&amp;b@doersdf.com'));
  assert.ok(sheet.includes('<c r="B2"><v>3</v></c>'), 'los números van como números');
  assert.ok(sheet.includes('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>'), 'un texto que empieza por = es texto, no fórmula');
  assert.ok(files['xl/workbook.xml'].includes('name="Otra hoja"'), 'nombre de hoja sin caracteres prohibidos');
});

test('exportar a Excel y la información de datos solo desde el propio portátil', async () => {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = `http://localhost:${app.server.address().port}`;
  try {
    await app.contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
    const local = await fetch(`${base}/api/contacts.xlsx`);
    assert.equal(local.status, 200);
    assert.match(local.headers.get('content-type'), /spreadsheetml/);
    const files = readStoredZip(Buffer.from(await local.arrayBuffer()));
    assert.ok(files['xl/worksheets/sheet1.xml'].includes('ana@doersdf.com'));
    assert.equal((await fetch(`${base}/api/contacts.xlsx`, { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status, 403, 'por el túnel, no');
    const info = await (await fetch(`${base}/api/data/info`)).json();
    assert.equal(info.contacts, 1);
    assert.equal((await fetch(`${base}/api/data/info`, { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status, 403);
  } finally {
    app.io.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
});
