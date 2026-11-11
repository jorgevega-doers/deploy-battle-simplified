// Envío de los controles del mando (sección 63): paquete único, escalones, ritmo según el ping, espera si el socket está ocupado y parada fiable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPadLink, padInterval, quantizePad, MOVE_STEP, AIM_STEP } from '../client/play/padLink.js';
import { parsePad, parseFireAngle } from '../server/net/validate.js';

// Reloj y temporizadores falsos: avanzar el tiempo ejecuta lo programado.
function fake() {
  let t = 0;
  let nextId = 1;
  const timers = new Map();
  const out = { sent: [], now: [], fired: [], busy: false, ping: 0 };
  const link = createPadLink({
    send: (p) => out.sent.push(p),
    sendNow: (p) => out.now.push(p),
    fire: (a) => out.fired.push(a),
    getPing: () => out.ping,
    canSend: () => !out.busy,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    now: () => t,
    setRepeat: () => 1, // el keep-alive (cada 500 ms mientras el dedo está puesto) se prueba aparte
    clearRepeat: () => {},
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      t = Math.max(t, due[1].at);
      timers.delete(due[0]);
      due[1].fn();
    }
    t = end;
  };
  return { link, out, advance };
}

test('padInterval: cuanto peor el ping, menos paquetes', () => {
  assert.deepEqual([0, 69, 71, 141, 251].map(padInterval), [16, 16, 33, 50, 80]);
});

test('quantizePad: escalones y límites; sin ángulo = null', () => {
  assert.deepEqual(quantizePad(0.43, -0.87, null), [44, -88, null]);
  assert.deepEqual(quantizePad(3, -3, 1.234), [100, -100, 123]);
  assert.equal(MOVE_STEP, 4);
  assert.equal(AIM_STEP, 3);
});

test('el movimiento y el apuntado salen en UN paquete y lo que no cambia no se repite', () => {
  const { link, out, advance } = fake();
  link.setMove(0.5, 0);
  link.setAim(1);
  advance(100);
  assert.equal(out.sent.length, 1);
  assert.deepEqual(out.sent[0], [52, 0, 99]);
  link.setMove(0.501, 0.001); // mismo escalón
  link.setAim(1.004);
  advance(200);
  assert.equal(out.sent.length, 1, 'sin cambios no se manda nada');
  link.setMove(0.9, 0);
  advance(100);
  assert.equal(out.sent.length, 2);
  assert.deepEqual(out.sent[1], [92, 0, 99]);
});

test('con ping alto se manda a menos ritmo y siempre el último valor', () => {
  const { link, out, advance } = fake();
  out.ping = 200; // 50 ms entre paquetes
  link.setMove(0.2, 0);
  advance(1);
  for (let i = 1; i <= 20; i++) { link.setMove(0.2 + i * 0.03, 0); advance(5); } // 100 ms de movimiento rápido
  advance(60);
  assert.ok(out.sent.length <= 4, `${out.sent.length} paquetes en ~160 ms con 200 ms de ping`);
  assert.ok(out.sent.at(-1)[0] >= 76, 'el último paquete lleva el valor más reciente');
});

test('si el socket está ocupado se espera y se manda lo más reciente al vaciarse', () => {
  const { link, out, advance } = fake();
  out.busy = true;
  link.setMove(0.4, 0);
  advance(100);
  link.setMove(0.8, 0);
  advance(100);
  assert.equal(out.sent.length, 0, 'nada mientras está ocupado');
  out.busy = false;
  advance(50);
  assert.equal(out.sent.length, 1);
  assert.equal(out.sent[0][0], 80, 'solo el valor más reciente');
});

test('soltar el movimiento para por el camino fiable y cancela lo pendiente; el disparo lleva su ángulo', () => {
  const { link, out, advance } = fake();
  link.setMove(0.9, 0);
  link.releaseMove(); // antes de que salga el envío pendiente
  advance(100);
  assert.equal(out.sent.length, 0, 'el envío pendiente se descartó');
  assert.deepEqual(out.now, [[0, 0, null]]);
  link.setAim(0.5);
  link.fire(0.5);
  assert.deepEqual(out.fired, [50]);
  link.fire(null);
  assert.deepEqual(out.fired, [50, null], 'un toque sin apuntar dispara sin ángulo');
});

test('el servidor entiende el paquete compacto y rechaza lo inválido', () => {
  assert.deepEqual(parsePad([50, -100, 157]), { x: 0.5, y: -1, angle: 1.57 });
  assert.deepEqual(parsePad([0, 0, null]), { x: 0, y: 0, angle: null });
  assert.deepEqual(parsePad([300, -300]), { x: 1, y: -1, angle: null }, 'se recorta a -1..1');
  for (const bad of [null, 'x', [1], [1, 2, 3, 4], ['a', 1], [1, 2, 'z'], { x: 1, y: 2 }]) assert.equal(parsePad(bad), null);
  assert.equal(parseFireAngle(120), 1.2);
  assert.equal(parseFireAngle(undefined), null);
  assert.equal(parseFireAngle('1'), null);
});
