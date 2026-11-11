// Túnel de Cloudflare: el reinicio de emergencia solo toca un túnel que gestione este servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restartTunnel, tunnelState } from '../server/net/tunnel.js';

test('restartTunnel no hace nada (y no rompe nada) si el túnel no lo gestiona este servidor', () => {
  const before = { ...tunnelState };
  assert.equal(restartTunnel(), false);
  assert.deepEqual({ ...tunnelState }, before);
});

import { verifyTunnel } from '../server/net/tunnel.js';

test('verifyTunnel espera a que la URL responda y se rinde si no lo hace', async () => {
  let calls = 0;
  const ok = await verifyTunnel('https://x.trycloudflare.com', { timeoutMs: 2000, intervalMs: 5, fetchFn: async () => { calls++; if (calls < 3) throw new Error('dns'); return { ok: true }; } });
  assert.equal(ok, true);
  assert.equal(calls, 3);
  const never = await verifyTunnel('https://x.trycloudflare.com', { timeoutMs: 60, intervalMs: 5, fetchFn: async () => ({ ok: false }) });
  assert.equal(never, false);
});

import { assetName, untarFile } from '../server/net/cloudflaredInstall.js';

test('assetName elige el binario de cloudflared según el sistema', () => {
  assert.equal(assetName('linux', 'x64'), 'cloudflared-linux-amd64');
  assert.equal(assetName('linux', 'arm64'), 'cloudflared-linux-arm64');
  assert.equal(assetName('win32', 'x64'), 'cloudflared-windows-amd64.exe');
  assert.equal(assetName('darwin', 'arm64'), 'cloudflared-darwin-arm64.tgz');
  assert.equal(assetName('darwin', 'x64'), 'cloudflared-darwin-amd64.tgz');
  assert.equal(assetName('freebsd', 'x64'), null);
});

import { EventEmitter } from 'node:events';
import { onCloudflaredLines, waitForTunnelUrl, protocolFor } from '../server/net/tunnel.js';

// Un proceso falso con stdout/stderr que entregan la salida en trozos arbitrarios, como una tubería real.
function fakeProcess() {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  return p;
}

test('la salida de cloudflared se lee por líneas aunque llegue partida en trozos', () => {
  const p = fakeProcess();
  const lines = [];
  onCloudflaredLines(p, (line) => lines.push(line));
  p.stderr.emit('data', Buffer.from('2026 INF Regis'));
  p.stderr.emit('data', Buffer.from('tered tunnel connection connIndex=0\r\n2026 ERR Failed to dial a quic'));
  p.stderr.emit('data', Buffer.from(' connection\n'));
  assert.deepEqual(lines, ['2026 INF Registered tunnel connection connIndex=0', '2026 ERR Failed to dial a quic connection']);
});

test('la URL del túnel se encuentra aunque venga cortada entre dos trozos', async () => {
  const p = fakeProcess();
  const url = waitForTunnelUrl(p, { timeoutMs: 1000 });
  p.stderr.emit('data', Buffer.from('|  https://alpha-beta-ga'));
  p.stderr.emit('data', Buffer.from('mma.trycloudflare.com  |\n'));
  assert.equal(await url, 'https://alpha-beta-gamma.trycloudflare.com');
});

test('protocolo de cada intento: QUIC por defecto y http2 al reintentar; el pedido o el que funcionó mandan', () => {
  assert.equal(protocolFor(1, undefined, null), null);
  assert.equal(protocolFor(2, undefined, null), 'http2');
  assert.equal(protocolFor(3, undefined, null), 'http2');
  assert.equal(protocolFor(2, 'quic', null), 'quic');
  assert.equal(protocolFor(1, undefined, 'http2'), 'http2');
});

import { isProblem } from '../server/net/tunnel.js';

test('se recogen los fallos de las comprobaciones previas de cloudflared y no las que pasan', () => {
  assert.equal(isProblem('INF |  UDP Connectivity  region1.v2.argotunnel.com  FAIL    QUIC connection failed  |'), true);
  assert.equal(isProblem('INF precheck component="DNS Resolution" status=fail target=region1.v2.argotunnel.com'), true);
  assert.equal(isProblem('INF precheck complete hard_fail=true run_id=x suggested_protocol=http2'), true);
  assert.equal(isProblem('ERR Failed to dial a quic connection error="timeout: no recent network activity"'), true);
  assert.equal(isProblem('INF |  UDP Connectivity  region1.v2.argotunnel.com  PASS    QUIC connection successful    |'), false);
  assert.equal(isProblem('INF precheck component="UDP Connectivity" details="QUIC connection successful" status=pass target=x'), false);
});

test('untarFile saca un archivo de un .tar (macOS: cloudflared viene en un .tgz)', () => {
  const header = (name, size) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 'utf8');
    h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
    return h;
  };
  const pad = (b) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
  const tar = Buffer.concat([header('LICENSE', 5), pad(Buffer.from('hola!')), header('cloudflared', 3), pad(Buffer.from('BIN')), Buffer.alloc(1024)]);
  assert.equal(untarFile(tar, 'cloudflared').toString(), 'BIN');
  assert.equal(untarFile(tar, 'otro'), null);
});
