import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlayUrl } from '../server/net/publicUrl.js';

const lan = { Wi_Fi: [{ family: 'IPv4', address: '192.168.1.40', internal: false }] };
const onlyLoopback = { lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] };

test('con PUBLIC_URL usa el túnel y quita barras finales', () => {
  assert.equal(getPlayUrl({ publicUrl: 'https://arena.ejemplo.com/', port: 3000, interfaces: lan }), 'https://arena.ejemplo.com/play/');
});

test('sin PUBLIC_URL usa la IP de la red local', () => {
  assert.equal(getPlayUrl({ publicUrl: '', port: 3000, interfaces: lan }), 'http://192.168.1.40:3000/play/');
});

test('sin red local cae a localhost', () => {
  assert.equal(getPlayUrl({ publicUrl: '', port: 3000, interfaces: onlyLoopback }), 'http://localhost:3000/play/');
  assert.equal(getPlayUrl({ publicUrl: '', port: 3000, interfaces: {} }), 'http://localhost:3000/play/');
});

test('ignora las direcciones IPv6 y las internas', () => {
  const mixed = { eth: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '10.0.0.7', internal: false }] };
  assert.equal(getPlayUrl({ publicUrl: '', port: 3100, interfaces: mixed }), 'http://10.0.0.7:3100/play/');
});
