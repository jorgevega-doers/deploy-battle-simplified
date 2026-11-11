// ELIMINAR TODOS LOS DATOS (sección 80): solo desde el propio equipo, solo escribiendo "eliminar", y siempre con una copia previa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { openContacts } from '../server/db/contacts.js';

test('eliminar exige la palabra, solo desde el propio equipo, guarda una copia antes y vacía emails y Top 10', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-battle-wipe-'));
  const dbPath = join(dir, 'datos.db');
  const backupDir = join(dir, 'copias'); // nunca la carpeta real de copias del equipo
  const app = createApp({ dbPath, backupDir });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = `http://localhost:${app.server.address().port}`;
  const wipe = (confirm, headers = {}) => fetch(`${base}/api/data/wipe`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ confirm }) });
  try {
    await app.contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v4' });
    await app.board.insert({ initials: 'ANA', accuracy: 50, score: 7000 });
    assert.equal((await wipe('eliminar', { 'cf-connecting-ip': '1.2.3.4' })).status, 403, 'por el túnel, no');
    assert.equal((await wipe('borrar')).status, 400, 'otra palabra, no');
    assert.equal(await app.contacts.count(), 1, 'sin confirmar no se toca nada');
    const res = await (await wipe('  ELIMINAR ')).json();
    assert.equal(res.ok, true);
    assert.ok(res.backup && existsSync(res.backup), 'copia previa hecha');
    assert.ok(res.backup.startsWith(backupDir));
    assert.equal(await app.contacts.count(), 0);
    assert.deepEqual(await app.board.top(), []);
    assert.equal((await app.board.all()).length, 0, 'también lo archivado');
    const copy = await openContacts(res.backup);
    assert.equal((await copy.all())[0].email, 'ana@doersdf.com', 'la copia conserva lo borrado');
    await copy.close();
  } finally {
    app.io.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
});
