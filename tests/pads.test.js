// Prueba del limitador de envíos del mando (client/play/pads.js). El módulo no toca el DOM al importarse,
// así que se puede probar en Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttleLatest } from '../client/play/pads.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('limita los envíos pero siempre acaba enviando el último valor', async () => {
  const sent = [];
  const send = throttleLatest((x) => sent.push(x), 40);
  send(1); send(2); send(3);
  assert.deepEqual(sent, [1]);   // el primero sale al instante
  await sleep(90);
  assert.deepEqual(sent, [1, 3]); // el último valor llega después; el intermedio se descarta
});

test('cancel() descarta el envío pendiente (así no llega una dirección vieja tras soltar el dedo)', async () => {
  const sent = [];
  const send = throttleLatest((x) => sent.push(x), 40);
  send(1);
  send(2);       // queda pendiente
  send.cancel(); // el jugador soltó el pad
  await sleep(90);
  assert.deepEqual(sent, [1], 'el valor pendiente no debe enviarse');
  send(5);       // y después sigue funcionando
  await sleep(10);
  assert.deepEqual(sent, [1, 5]);
});
