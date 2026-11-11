import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalRequest } from '../server/net/localOnly.js';

test('acepta peticiones desde el propio equipo', () => {
  assert.equal(isLocalRequest('127.0.0.1', {}), true);
  assert.equal(isLocalRequest('::1', {}), true);
  assert.equal(isLocalRequest('::ffff:127.0.0.1', {}), true);
});

test('rechaza IPs externas y de la red local', () => {
  assert.equal(isLocalRequest('192.168.1.40', {}), false);
  assert.equal(isLocalRequest('83.12.4.9', {}), false);
});

test('rechaza peticiones que llegan por el túnel aunque la IP sea local', () => {
  assert.equal(isLocalRequest('127.0.0.1', { 'cf-connecting-ip': '83.12.4.9' }), false);
  assert.equal(isLocalRequest('127.0.0.1', { 'x-forwarded-for': '83.12.4.9' }), false);
});
