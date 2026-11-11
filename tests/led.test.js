// Panel LED (sección 75): protocolo del panel iPixel Color, el podio del Top 3 y el codificador GIF compartido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, imageMessages, chunks, parseDeviceInfo, ackKind, brightnessCommand, deviceInfoCommand, WINDOW_BYTES, CHUNK_BYTES } from '../client/host/ledProtocol.js';
import { podiumRows, podiumFrames, podiumGif, testPatternGif } from '../client/host/ledPodium.js';
import { encodeGif } from '../shared/art/gif.js';

// Decodificador GIF mínimo (solo para comprobar el codificador): devuelve los índices de cada fotograma.
function decodeGif(b) {
  const width = b[6] | (b[7] << 8);
  const height = b[8] | (b[9] << 8);
  let p = 13 + 3 * (1 << ((b[10] & 7) + 1));
  const frames = [];
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) { p += 2; while (b[p]) p += b[p] + 1; p++; continue; }
    p += 10;
    const min = b[p++];
    const data = [];
    while (b[p]) { data.push(...b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; }
    p++;
    const clear = 1 << min;
    let size = min + 1;
    let dict = [];
    let prev = null;
    let acc = 0;
    let bits = 0;
    const out = [];
    const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = min + 1; prev = null; };
    reset();
    for (const byte of data) {
      acc |= byte << bits; bits += 8;
      while (bits >= size) {
        const code = acc & ((1 << size) - 1); acc >>= size; bits -= size;
        if (code === clear) { reset(); continue; }
        if (code === clear + 1) { bits = -1e9; break; }
        const entry = prev === null ? dict[code] : (dict[code] ?? [...prev, prev[0]]);
        if (prev !== null) { dict.push([...prev, entry[0]]); if (dict.length === 1 << size && size < 12) size++; }
        out.push(...entry);
        prev = entry;
      }
    }
    frames.push(Uint8Array.from(out));
  }
  return { width, height, frames };
}

test('CRC32 estándar', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('una imagen pequeña es un solo mensaje con su cabecera (longitud, tipo GIF, tamaño, CRC, ranura)', () => {
  const file = Uint8Array.from([0x47, 0x49, 0x46, 1, 2, 3]);
  const [m, ...rest] = imageMessages(file, { gif: true });
  assert.equal(rest.length, 0);
  assert.equal(m.length, 2 + 13 + file.length);
  assert.equal(m[0] | (m[1] << 8), m.length, 'longitud total al principio');
  assert.deepEqual([...m.subarray(2, 5)], [3, 0, 0], 'GIF, primer bloque');
  assert.deepEqual([...m.subarray(5, 9)], [6, 0, 0, 0], 'tamaño del archivo');
  const crc = crc32(file);
  assert.deepEqual([...m.subarray(9, 13)], [crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24]);
  assert.deepEqual([...m.subarray(13, 15)], [2, 0], 'GIF, ranura 0 (mostrar)');
  assert.deepEqual([...m.subarray(15)], [...file]);
  assert.deepEqual([...imageMessages(file).at(0).subarray(2, 3)], [2], 'sin gif: PNG');
});

test('un archivo de más de 12 KB va en varios bloques, los siguientes con la opción 2, y cada bloque en trozos de 244', () => {
  const file = new Uint8Array(WINDOW_BYTES * 2 + 100).map((_, i) => i & 255);
  const msgs = imageMessages(file, { gif: true });
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map((m) => m[4]), [0, 2, 2]);
  assert.equal(msgs.reduce((n, m) => n + m.length - 15, 0), file.length);
  const pieces = chunks(msgs[0]);
  assert.ok(pieces.every((c) => c.length <= CHUNK_BYTES));
  assert.equal(pieces.reduce((n, c) => n + c.length, 0), msgs[0].length);
});

test('la respuesta real del panel del stand es un 32 x 32; las confirmaciones se reconocen', () => {
  const info = parseDeviceInfo(Uint8Array.from([0x0c, 0x00, 0x01, 0x80, 0x81, 0x02, 0x0a, 0x00, 0x00, 0x01, 0x00, 0x01]));
  assert.deepEqual([info.width, info.height, info.known], [32, 32, true]);
  assert.deepEqual([parseDeviceInfo(Uint8Array.from([0, 0, 0, 0, 0x80])).width, parseDeviceInfo(Uint8Array.of(1, 2)), parseDeviceInfo(Uint8Array.from([0, 0, 0, 0, 0x99])).known], [64, null, false]);
  assert.equal(ackKind(Uint8Array.of(5, 0, 3, 0, 3)), 'done');
  assert.equal(ackKind(Uint8Array.of(5, 0, 3, 0, 1)), 'window');
  assert.equal(ackKind(Uint8Array.of(0x0c, 0, 1, 0x80, 0x81)), null);
  assert.deepEqual([...brightnessCommand(150)], [5, 0, 4, 0x80, 100]);
  assert.deepEqual([...deviceInfoCommand(new Date(2026, 10, 4, 10, 20, 30))], [8, 0, 1, 0x80, 10, 20, 30, 0]);
});

test('el codificador GIF da una animación que se decodifica igual', () => {
  const a = new Uint8Array(12 * 9).map((_, i) => i % 5);
  const b = new Uint8Array(12 * 9).map((_, i) => (i * 7) % 3);
  const gif = encodeGif({ width: 12, height: 9, palette: ['#000000', '#ff0080', '#ffffff', '#0003ad', '#ffd400'], frames: [{ pixels: a }, { pixels: b }] });
  assert.equal(new TextDecoder().decode(gif.subarray(0, 6)), 'GIF89a');
  const out = decodeGif(gif);
  assert.deepEqual([out.width, out.height, out.frames.length], [12, 9, 2]);
  assert.deepEqual([...out.frames[0]], [...a]);
  assert.deepEqual([...out.frames[1]], [...b]);
});

test('podio: tres filas con barras proporcionales, huecos si faltan y solo letras y números', () => {
  const rows = podiumRows([{ initials: 'ABC', score: 9000 }, { initials: 'x<y', score: 4500 }]);
  assert.deepEqual(rows.map((r) => [r.name, r.fill, r.empty]), [['ABC', 12, false], ['XY', 6, false], ['---', 0, true]]);
  const gif = podiumGif([{ initials: 'ABC', score: 9000 }]);
  const out = decodeGif(gif);
  assert.deepEqual([out.width, out.height], [32, 32]);
  assert.equal(out.frames.length, podiumFrames([]).length);
  assert.ok(gif.length < 12 * 1024, 'cabe en un solo bloque');
  const big = decodeGif(podiumGif([{ initials: 'ABC', score: 1 }], 64, 64));
  assert.equal(big.width, 64);
  assert.deepEqual([...big.frames[0].subarray(0, 8)], [...decodeGif(gif).frames[0].subarray(0, 4)].flatMap((v) => [v, v]), 'en 64 x 64 cada píxel se duplica');
});

test('la imagen de prueba tiene un marco de 1 píxel en los cuatro bordes', () => {
  const { width, height, frames: [px] } = decodeGif(testPatternGif(32, 32));
  for (let i = 0; i < 32; i++) {
    assert.notEqual(px[i], 0); assert.notEqual(px[(height - 1) * width + i], 0);
    assert.notEqual(px[i * width], 0); assert.notEqual(px[i * width + width - 1], 0);
  }
});
