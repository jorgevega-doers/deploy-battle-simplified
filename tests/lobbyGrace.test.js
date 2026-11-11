// Corte breve en el lobby (red saturada de la feria): con su token, el mando recupera su plaza y su LISTO, y la cuenta atrás de entrada NO vuelve a empezar
// para todos. Si no vuelve, la plaza se libera pasado lobbyGraceS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { EVENTS } from '../shared/events.js';

let app;
let url;
const sockets = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = () => { const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s); return s; };
const once = (s, ev, ms = 5000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms); s.once(ev, (d) => { clearTimeout(t); res(d); }); });
async function player(initials, token) {
  const s = client();
  await once(s, 'connect');
  const slot = once(s, EVENTS.SLOT_ASSIGNED);
  s.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, token });
  return { s, assigned: await slot };
}

before(async () => {
  app = createApp({ dbPath: ':memory:', gameConfig: { introS: 0, joinWindowS: 20, lobbyGraceS: 0.8 } });
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

test('un corte breve en el lobby no quita la plaza ni el LISTO ni reinicia la cuenta atrás; si no vuelve, la plaza se libera', async () => {
  const a = await player('AAA', 'token-aaaaaaaaaaaaaaaaaaaa');
  const b = await player('BBB', 'token-bbbbbbbbbbbbbbbbbbbb');
  a.s.emit(EVENTS.PLAYER_READY);
  b.s.emit(EVENTS.PLAYER_READY);
  await sleep(1500);
  const left = app.session.joinLeft;
  assert.ok(left !== null && left <= 19, `la cuenta atrás corre (${left})`);

  // Corte de A y vuelta con su token antes de lobbyGraceS
  a.s.io.engine.close(); // corte de red (sin despedirse)
  await sleep(300);
  assert.equal(app.slots.count(), 2, 'durante el corte la plaza sigue reservada');
  const back = await player('AAA', 'token-aaaaaaaaaaaaaaaaaaaa');
  assert.equal(back.assigned.slot, a.assigned.slot, 'recupera la misma plaza');
  assert.deepEqual(app.session.ready.slice(0, 2), [true, true], 'conserva su LISTO');
  assert.ok(app.session.joinLeft !== null && app.session.joinLeft <= left, `la cuenta atrás NO vuelve a empezar (${left} → ${app.session.joinLeft})`);

  // Corte de B sin volver: pasado lobbyGraceS se libera y, como A sigue en LISTO y ahora está solo, la cuenta vuelve a empezar (1 contra bots)
  b.s.io.engine.close(); // corte de red (sin despedirse)
  await sleep(300);
  assert.equal(app.slots.count(), 2, 'durante la gracia sigue reservada');
  await sleep(1200);
  assert.equal(app.slots.count(), 1, 'la plaza se libera si no vuelve');
  assert.equal(app.session.joinLeft, 20, 'alguien se fue: la cuenta atrás empieza de nuevo para los que quedan');
});

test('un corte breve durante la presentación (READY) no la cancela: la partida empieza igual con el jugador de vuelta', async () => {
  const app2 = createApp({ dbPath: ':memory:', gameConfig: { introS: 1.5, joinWindowS: 1, lobbyGraceS: 1.5 } });
  await new Promise((resolve) => app2.server.listen(0, resolve));
  const url2 = `http://localhost:${app2.server.address().port}`;
  app2.startLoop();
  const join2 = async (initials, token) => {
    const s = connect(url2, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    await once(s, 'connect');
    const slot = once(s, EVENTS.SLOT_ASSIGNED);
    s.emit(EVENTS.JOIN_ROOM, { role: 'player', initials, token });
    return { s, assigned: await slot };
  };
  try {
    const a = await join2('AAA', 'token-a2aaaaaaaaaaaaaaaaaa');
    const b = await join2('BBB', 'token-b2bbbbbbbbbbbbbbbbbb');
    a.s.emit(EVENTS.PLAYER_READY); b.s.emit(EVENTS.PLAYER_READY);
    for (let i = 0; i < 40 && app2.session.phase !== 'READY'; i++) await sleep(100);
    assert.equal(app2.session.phase, 'READY', 'llega la presentación');
    a.s.io.engine.close(); // corte de red (sin despedirse)
    await sleep(300);
    assert.equal(app2.session.phase, 'READY', 'el corte no cancela la presentación');
    const back = await join2('AAA', 'token-a2aaaaaaaaaaaaaaaaaa');
    assert.equal(back.assigned.slot, a.assigned.slot);
    for (let i = 0; i < 60 && app2.session.phase !== 'PLAYING'; i++) await sleep(100);
    assert.equal(app2.session.phase, 'PLAYING', 'la partida empieza con los dos');
  } finally {
    app2.stopLoop();
    app2.io.close();
    await new Promise((resolve) => app2.server.close(resolve));
  }
});
