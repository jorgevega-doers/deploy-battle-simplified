// Copia de los emails en Google Sheets (sección 79): cada email nuevo sube a la hoja; sin Internet se queda en cola y se reintenta; nada se repite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openContacts } from '../server/db/contacts.js';
import { createSheetsSync } from '../server/db/sheetsSync.js';
import { createApp } from '../server/app.js';

// Estos tests usan una hoja falsa (nunca la real): ignoran el SHEETS=0 / SHEETS_URL del entorno (el flujo de Ubuntu pone SHEETS=0 para todo).
delete process.env.SHEETS;
delete process.env.SHEETS_URL;
delete process.env.SHEETS_TOKEN;

const URL_OK ='https://script.google.com/macros/s/AKfyc_prueba-123/exec';
// Hoja falsa: guarda lo que recibe; "down" simula que no hay Internet.
function fakeSheet() {
  const rows = [];
  const sheet = {
    rows, down: false, calls: 0,
    fetch: async (url, opts) => {
      sheet.calls++;
      if (sheet.down) throw new Error('sin red');
      const body = JSON.parse(opts.body);
      if (body.token !== 'clave') return { ok: true, status: 200, json: async () => ({ ok: false, error: 'clave incorrecta' }) };
      for (const c of body.contacts) if (!rows.some((r) => r.email === c.email)) rows.push(c);
      return { ok: true, status: 200, json: async () => ({ ok: true, added: body.contacts.length }) };
    },
  };
  return sheet;
}
const manualTimers = () => ({ setTimer: () => 0, clearTimer: () => {} }); // los envíos se lanzan a mano con flush()

test('los emails pendientes suben a la hoja y quedan marcados; un email que vuelve a jugar no se repite', async () => {
  const contacts = await openContacts(':memory:');
  const sheet = fakeSheet();
  const sync = createSheetsSync({ url: URL_OK, token: 'clave', contacts, fetchFn: sheet.fetch, log: () => {}, ...manualTimers() });
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
  await contacts.save({ email: 'luis@doersdf.com', initials: 'LUI', consent: 'v4' });
  assert.equal(await sync.flush(), 2);
  assert.deepEqual(sheet.rows.map((r) => r.email), ['ana@doersdf.com', 'luis@doersdf.com']);
  assert.equal(await contacts.pendingCount(), 0);
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' }); // vuelve a jugar
  assert.equal(await sync.flush(), 0, 'no se vuelve a enviar');
  await contacts.save({ email: 'eva@doersdf.com', initials: 'EVA', consent: 'v4' });
  assert.equal(await sync.flush(), 1);
  assert.equal(sheet.rows.length, 3);
});

test('sin Internet los emails se quedan en cola (no se pierden) y suben cuando vuelve la red', async () => {
  const contacts = await openContacts(':memory:');
  const sheet = fakeSheet();
  sheet.down = true;
  const sync = createSheetsSync({ url: URL_OK, token: 'clave', contacts, fetchFn: sheet.fetch, log: () => {}, ...manualTimers() });
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
  assert.equal(await sync.flush(), 0);
  assert.match(sync.status.lastError, /sin red/);
  assert.equal(await contacts.pendingCount(), 1, 'sigue pendiente');
  sheet.down = false;
  assert.equal(await sync.flush(), 1);
  assert.equal(sync.status.lastError, '');
  assert.equal(await contacts.pendingCount(), 0);
});

test('con la clave equivocada la hoja lo rechaza y nada se marca como subido', async () => {
  const contacts = await openContacts(':memory:');
  const sheet = fakeSheet();
  const sync = createSheetsSync({ url: URL_OK, token: 'otra', contacts, fetchFn: sheet.fetch, log: () => {}, ...manualTimers() });
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
  await sync.flush();
  assert.match(sync.status.lastError, /clave incorrecta/);
  assert.equal(await contacts.pendingCount(), 1);
});

test('sin dirección configurada no se envía nada', async () => {
  const contacts = await openContacts(':memory:');
  const sync = createSheetsSync({ url: '', contacts, fetchFn: () => { throw new Error('no debería llamar'); } });
  assert.equal(sync.status.enabled, false);
  assert.equal(await sync.flush(), 0);
});

test('el menú configura la hoja (solo desde el propio equipo), se guarda en la carpeta de datos y un email nuevo sube solo', async () => {
  const sheetsFile = join(mkdtempSync(join(tmpdir(), 'deploy-battle-sheets-')), 'google-sheets.json');
  const sheet = fakeSheet();
  const app = createApp({ dbPath: ':memory:', sheetsFile, sheetsFetch: sheet.fetch });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = `http://localhost:${app.server.address().port}`;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/api/sheets', { url: URL_OK, token: 'clave' }, { 'cf-connecting-ip': '1.2.3.4' })).status, 403, 'por el túnel, no');
    assert.equal((await post('/api/sheets', { url: 'https://evil.example/exec', token: 'clave' })).status, 400, 'solo direcciones de Apps Script');
    assert.equal((await (await post('/api/sheets', { url: URL_OK, token: 'clave' })).json()).ok, true);
    assert.deepEqual(JSON.parse(readFileSync(sheetsFile, 'utf8')), { url: URL_OK, token: 'clave' });
    await app.contacts.save({ email: 'nuevo@doersdf.com', initials: 'NUE', consent: 'v4' });
    for (let i = 0; i < 50 && !sheet.rows.length; i++) await new Promise((r) => setTimeout(r, 20)); // lo envía solo, sin pulsar nada
    assert.deepEqual(sheet.rows.map((r) => r.email), ['nuevo@doersdf.com']);
    const info = await (await fetch(`${base}/api/data/info`)).json();
    assert.equal(info.sheets.enabled, true);
    assert.equal(info.sheets.pending, 0);
  } finally {
    app.io.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
});

test('cada email lleva su origen (stand u online) para la columna Origen de la hoja', async () => {
  const contacts = await openContacts(':memory:');
  let sent = null;
  const fetchFn = async (url, opts) => { sent = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const sync = createSheetsSync({ url: URL_OK, token: 'clave', source: 'online', contacts, fetchFn, log: () => {}, setTimer: () => 0, clearTimer: () => {} });
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
  await sync.flush();
  assert.equal(sent.contacts[0].source, 'online');
});

test('SHEETS=0 desactiva el envío aunque haya una hoja fija (para pruebas con emails inventados)', async () => {
  process.env.SHEETS = '0';
  let called = false;
  const app = createApp({ dbPath: ':memory:', sheetsDefaults: { url: URL_OK, token: 'clave' }, sheetsFetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    await app.contacts.save({ email: 'prueba@ejemplo.com', initials: 'PRU', consent: 'v4' });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(called, false);
    const info = await (await fetch(`http://localhost:${app.server.address().port}/api/data/info`)).json();
    assert.equal(info.sheets.enabled, false);
  } finally {
    delete process.env.SHEETS;
    app.io.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
});
