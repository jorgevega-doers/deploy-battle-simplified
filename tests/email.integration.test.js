// Email obligatorio al entrar (stand): arranca el servidor de verdad con requireEmail y conecta mandos falsos.
// Comprueba que sin email válido y consentimiento no se entra, que el contacto se guarda solo de quien llega a jugar y que el email
// de prueba (@test.invalid, de los bots del host) entra pero no se guarda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { EVENTS } from '../shared/events.js';

let app;
let url;
const sockets = [];
const newClient = () => { const s = connect(url, { transports: ['websocket'], forceNew: true }); sockets.push(s); return s; };
const waitFor = (socket, event, ms = 6000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});
const connected = (socket) => (socket.connected ? Promise.resolve() : waitFor(socket, 'connect'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pide plaza con estos datos y devuelve lo primero que conteste el servidor.
async function join(extra) {
  const socket = newClient();
  await connected(socket);
  const answer = Promise.race([
    waitFor(socket, EVENTS.SLOT_ASSIGNED).then((d) => ({ type: 'slot', ...d })),
    waitFor(socket, EVENTS.ROOM_FULL).then(() => ({ type: 'full' })),
    waitFor(socket, EVENTS.ERROR_MSG).then((d) => ({ type: 'error', ...d })),
  ]);
  socket.emit(EVENTS.JOIN_ROOM, { role: 'player', ...extra });
  return { socket, answer: await answer };
}

before(async () => {
  app = createApp({ dbPath: ':memory:', requireEmail: true, maxPlayers: 2, gameConfig: { fillBots: false, introS: 0, joinWindowS: 0 } });
  await new Promise((resolve) => app.server.listen(0, resolve));
  url = `http://localhost:${app.server.address().port}`;
  app.startLoop();
});
after(async () => {
  app.stopLoop();
  sockets.forEach((s) => s.disconnect());
  app.io.close();
  await new Promise((resolve) => app.server.close(resolve));
});

test('sin email, con un email roto o sin marcar el consentimiento no se entra; con todo, sí, y se guarda el contacto', async () => {
  assert.equal((await join({ initials: 'AAA' })).answer.code, 'invalid_email');
  assert.equal((await join({ initials: 'AAA', email: 'no-es-un-email', consent: true })).answer.code, 'invalid_email');
  assert.equal((await join({ initials: 'AAA', email: 'ana@doersdf.com' })).answer.code, 'consent_required');
  assert.equal((await join({ initials: 'AAA', email: 'ana@doersdf.com', consent: 'yes' })).answer.code, 'consent_required'); // solo vale true
  assert.equal(await app.contacts.count(), 0, 'nada de lo anterior se guarda');

  const ok = await join({ initials: 'ANA', email: ' Ana@DoersDF.com ', consent: true });
  assert.equal(ok.answer.type, 'slot');
  assert.equal(ok.answer.slot, 1);
  await sleep(150); // el guardado es asíncrono
  const all = await app.contacts.all();
  assert.equal(all.length, 1);
  assert.equal(all[0].email, 'ana@doersdf.com');
  assert.equal(all[0].initials, 'ANA');
  assert.equal(all[0].consent, 'feria-2026-11-v4');
});

test('el email de prueba entra (desde el propio portátil) pero no se guarda; quien se encuentra la sala llena SÍ deja su email (con 0 partidas)', async () => {
  const before = await app.contacts.count();
  const bot = await join({ initials: 'BOT', email: 'bot@test.invalid', consent: true });
  assert.equal(bot.answer.type, 'slot'); // P2: la sala queda llena
  const late = await join({ initials: 'LAT', email: 'tarde@doersdf.com', consent: true });
  assert.equal(late.answer.type, 'full');
  await sleep(150);
  assert.equal(await app.contacts.count(), before + 1, 'el bot no se guarda; el que no pudo entrar, sí');
  const all = await app.contacts.all();
  assert.equal(all.find((c) => c.email === 'tarde@doersdf.com').plays, 0);
  assert.equal(all.find((c) => c.email === 'ana@doersdf.com').plays, 1, 'quien entró cuenta 1 partida (no 2: el email se guarda al validarlo y la partida al tener plaza)');
});

test('el estado del lobby avisa al mando de que el stand pide email', async () => {
  const socket = newClient();
  const state = await waitFor(socket, EVENTS.LOBBY_STATE);
  assert.equal(state.requireEmail, true);
});
