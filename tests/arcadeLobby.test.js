// Sala de espera de la versión arcade en el cliente (client/host/arcadeLobby.js), sin navegador: un DOM mínimo de mentira. Cubre la
// inactividad (90 s sin tocar nada -> fuera, con aviso los últimos 15 s; no cuenta con la cuenta atrás ni a solas en la sala pública) y el botón.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Map();
globalThis.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); };
globalThis.document = { body: { classList: { add() {}, remove() {}, toggle() {} } } };
const fire = (type) => (listeners.get(type) ?? []).forEach((fn) => fn({}));
const { createArcadeLobby } = await import('../client/host/arcadeLobby.js');

function fakeElement() {
  const classes = new Set();
  const handlers = {};
  return {
    hidden: false, disabled: false, textContent: '', handlers,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), has: (c) => classes.has(c) },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    blur() {},
  };
}
let els; let left; let readies; let lobby;
const $ = (id) => (els[id] ??= fakeElement());
beforeEach(() => {
  els = {}; left = []; readies = 0; listeners.clear();
  lobby = createArcadeLobby({ $, keyboard: { slot: 1, source: 'keyboard', ready: () => { readies += 1; } }, onLeave: (note) => left.push(note) });
});
const T0 = () => performance.now();
const state = (over = {}) => ({ state: 'LOBBY', joinLeft: null, plan: { humans: 2 }, cancelsLeft: [3, 3, 3, 3], room: { solo: false }, ...over });

test('con más gente y sin cuenta atrás: aviso a los 75 s ("¿SIGUES AHÍ?") y fuera a los 90 s, una sola vez', () => {
  lobby.update(state());
  const t0 = T0();
  lobby.tick(t0 + 74000);
  assert.equal(els['wait-sub'].textContent, '');
  lobby.tick(t0 + 80000);
  assert.match(els['wait-sub'].textContent, /SIGUES AHÍ\? TE SACAMOS DE LA SALA EN 1\d S/);
  assert.ok(els['wait-sub'].classList.has('warn'));
  lobby.tick(t0 + 90500);
  lobby.tick(t0 + 95000);
  assert.equal(left.length, 1);
  assert.match(left[0], /INACTIVIDAD/);
});

test('cualquier tecla, clic o movimiento de ratón reinicia el reloj de inactividad', () => {
  lobby.update(state());
  const t0 = T0();
  lobby.tick(t0 + 60000);
  fire('pointermove'); // performance.now() real: el reloj vuelve a empezar "ahora"
  lobby.tick(T0() + 60000);
  assert.equal(left.length, 0);
  fire('keydown');
  lobby.tick(T0() + 89000);
  assert.equal(left.length, 0);
});

test('con la cuenta atrás en marcha nadie es expulsado (aunque no toque nada)', () => {
  lobby.update(state({ joinLeft: 7 }));
  const t0 = T0();
  for (let s = 0; s <= 200; s += 10) lobby.tick(t0 + s * 1000);
  assert.equal(left.length, 0);
  assert.equal(els['quick-ready'].textContent, 'CANCELAR');
});

test('a solas en la sala pública esperando rivales no cuenta (no bloquea a nadie); en una sala privada contra bots, sí', () => {
  lobby.update(state({ plan: { humans: 1 } }));
  const t0 = T0();
  for (let s = 0; s <= 300; s += 10) lobby.tick(t0 + s * 1000);
  assert.equal(left.length, 0);
  assert.equal(els['wait-title'].textContent, 'BUSCANDO RIVALES');
  assert.equal(els['quick-ready'].textContent, 'JUGAR CON BOTS');
  lobby.update(state({ plan: { humans: 1 }, room: { solo: true } }));
  const t1 = t0 + 300000; // sigue el mismo reloj falso
  lobby.tick(t1 + 91000);
  assert.equal(left.length, 1);
});

test('en partida no cuenta, y al volver a la sala el reloj empieza de cero', () => {
  lobby.update(state({ state: 'PLAYING' }));
  const t0 = T0();
  lobby.tick(t0 + 500000);
  lobby.update(state());
  lobby.tick(T0() + 80000);
  assert.equal(left.length, 0);
});

test('el botón: JUGAR con rivales, CANCELAR en la cuenta atrás y apagado cuando ya no puedes cancelar más', () => {
  lobby.update(state());
  lobby.tick(T0());
  assert.equal(els['wait-title'].textContent, '¡HAY RIVALES!');
  assert.equal(els['quick-ready'].textContent, 'JUGAR');
  els['quick-ready'].handlers.click({ currentTarget: els['quick-ready'] });
  assert.equal(readies, 1, 'el clic manda JUGAR');
  lobby.update(state({ joinLeft: 9 }));
  lobby.tick(T0());
  assert.equal(els['wait-title'].textContent, 'LA PARTIDA EMPIEZA EN');
  assert.equal(els['wait-num'].textContent, '9');
  assert.equal(els['quick-ready'].disabled, false);
  lobby.update(state({ joinLeft: 9, cancelsLeft: [0, 3, 3, 3] }));
  lobby.tick(T0());
  assert.equal(els['quick-ready'].textContent, 'YA NO SE PUEDE CANCELAR');
  assert.equal(els['quick-ready'].disabled, true);
});

test('el botón SALIR vuelve al título', () => {
  els['arcade-exit'].handlers.click();
  assert.deepEqual(left, [undefined]);
});
