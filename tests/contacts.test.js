// Contactos del stand: guardado en SQLite, actualización si el mismo email vuelve a jugar, restricciones y parámetros (sin inyección SQL),
// y la validación del email que llega del móvil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openContacts, createNullContacts } from '../server/db/contacts.js';
import { parseEmail, isTestEmail } from '../server/net/validate.js';

test('guarda un contacto y, si el mismo email vuelve a jugar, no se duplica: solo suma partidas y actualiza iniciales y fecha', async () => {
  const contacts = await openContacts(':memory:');
  await contacts.save({ email: 'ana@doersdf.com', initials: 'ANA', consent: 'v1' });
  await contacts.save({ email: 'ANA@doersdf.com', initials: 'AAA', consent: 'v1' }); // mayúsculas: es el mismo email
  const all = await contacts.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].plays, 2);
  assert.equal(all[0].initials, 'AAA');
  assert.ok(all[0].last_seen >= all[0].first_seen);
  assert.equal(await contacts.count(), 1);
  await contacts.close();
});

test('la base de datos rechaza emails fuera de rango', async () => {
  const contacts = await openContacts(':memory:');
  await assert.rejects(() => contacts.save({ email: 'a@b', initials: 'ABC', consent: 'v1' }));
  await assert.rejects(() => contacts.save({ email: `${'a'.repeat(260)}@x.es`, initials: 'ABC', consent: 'v1' }));
  assert.equal(await contacts.count(), 0);
  await contacts.close();
});

test('un email con comillas o SQL se guarda tal cual: las consultas usan parámetros', async () => {
  const contacts = await openContacts(':memory:');
  const evil = "x'); DROP TABLE contacts;--@evil.es";
  await contacts.save({ email: evil, initials: 'EVL', consent: 'v1' });
  assert.equal((await contacts.all())[0].email, evil);
  assert.equal(await contacts.count(), 1); // la tabla sigue ahí
  await contacts.close();
});

test('el contacto nulo (si falla el disco) no guarda nada y no rompe', async () => {
  const none = createNullContacts();
  await none.save({ email: 'a@b.co', consent: 'v1' });
  assert.deepEqual(await none.all(), []);
  assert.equal(await none.count(), 0);
});

test('parseEmail normaliza los válidos y rechaza lo raro', () => {
  assert.equal(parseEmail('  Ana.Lopez+feria@Doersdf.COM '), 'ana.lopez+feria@doersdf.com');
  assert.equal(parseEmail("o'brien@mail.es"), "o'brien@mail.es");
  for (const bad of ['', 'sin-arroba', 'a@b', 'a@b.c', 'dos espacios@x.es', 'a..b@x.es', '@x.es', 'a@@x.es', '<s>@x.es', 'a@x.es\nb@y.es', 'a@x_y.es', 123, null, undefined, {}]) {
    assert.equal(parseEmail(bad), null, `debería rechazar ${JSON.stringify(bad)}`);
  }
  assert.equal(parseEmail(`${'a'.repeat(65)}@x.es`), null); // la parte local no pasa de 64
  assert.equal(parseEmail(`a@${'x'.repeat(250)}.es`), null); // el total no pasa de 254
});

test('los emails de los bots de prueba se reconocen por su dominio reservado', () => {
  assert.equal(isTestEmail('bot@test.invalid'), true);
  assert.equal(isTestEmail('bot@doersdf.com'), false);
  assert.equal(isTestEmail('bot@test.invalid.evil.com'), false);
});
