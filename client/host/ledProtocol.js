// Protocolo del panel LED "iPixel Color" (Bluetooth LE; se anuncia como LED_BLE_xxxxxxxx). Código puro, sin Bluetooth: construye los mensajes y lee
// las respuestas; led.js los envía con Web Bluetooth. Basado en el protocolo publicado por el proyecto pypixelcolor (MIT, lucagoc/pypixelcolor) y
// comprobado con el panel del stand (29-oct: servicio 0x00FA, escritura fa02, avisos fa03; responde tipo 0x81 = 32 x 32). NO es oficial del fabricante.
export const LED_NAME_PREFIX = 'LED_BLE';
export const LED_SERVICE = '000000fa-0000-1000-8000-00805f9b34fb';
export const LED_WRITE = '0000fa02-0000-1000-8000-00805f9b34fb';
export const LED_NOTIFY = '0000fa03-0000-1000-8000-00805f9b34fb';
export const CHUNK_BYTES = 244;          // cada escritura Bluetooth
export const WINDOW_BYTES = 12 * 1024;   // cada bloque de imagen espera su confirmación

// Tipo de panel (byte 4 de la respuesta a la consulta de información) -> tamaño en píxeles.
const SIZES = {
  0x80: [64, 64], 0x81: [32, 32], 0x82: [32, 16], 0x83: [64, 16], 0x84: [96, 16], 0x85: [64, 20], 0x86: [128, 32], 0x87: [144, 16],
  0x88: [192, 16], 0x89: [48, 24], 0x8a: [64, 32], 0x8b: [96, 32], 0x8c: [128, 32], 0x8d: [96, 32], 0x8e: [160, 32], 0x8f: [192, 32],
};

const clampLevel = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
// Consulta de información (lleva la hora: el panel la usa para su reloj). Solo pregunta, no cambia nada.
export const deviceInfoCommand = (date = new Date()) => Uint8Array.of(8, 0, 1, 0x80, date.getHours(), date.getMinutes(), date.getSeconds(), 0);
export const brightnessCommand = (level) => Uint8Array.of(5, 0, 4, 0x80, clampLevel(level));
export const powerCommand = (on) => Uint8Array.of(5, 0, 7, 1, on ? 1 : 0);

// Respuesta a la consulta de información: tipo y tamaño del panel (tipo desconocido = 64 x 64, como la librería de referencia).
export function parseDeviceInfo(data) {
  if (!data || data.length < 5) return null;
  const type = data[4];
  const [width, height] = SIZES[type] ?? [64, 64];
  return { type, width, height, known: type in SIZES };
}

// Confirmación del panel por fa03: 05 .. .. .. código. 0 o 1 = bloque recibido; 3 = todo recibido (también vale como bloque).
export function ackKind(data) {
  if (!data || data.length < 5 || data[0] !== 0x05) return null;
  if (data[4] === 3) return 'done';
  if (data[4] === 0 || data[4] === 1) return 'window';
  return null;
}

let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

// Imagen (PNG) o animación (GIF) entera -> mensajes de hasta 12 KB de datos. Cada mensaje: [longitud total (2, LE)] + [tipo 2 = PNG / 3 = GIF, 0,
// opción (0 el primero, 2 los siguientes)] + [tamaño del archivo (4, LE)] + [CRC32 del archivo (4, LE)] + [0 PNG / 2 GIF, ranura (0 = mostrar)] + datos.
export function imageMessages(file, { gif = false, slot = 0 } = {}) {
  const head = [...u32le(file.length), ...u32le(crc32(file))];
  const messages = [];
  for (let pos = 0, i = 0; pos < file.length; pos += WINDOW_BYTES, i++) {
    const payload = file.subarray(pos, Math.min(pos + WINDOW_BYTES, file.length));
    const frame = [gif ? 3 : 2, 0, i === 0 ? 0 : 2, ...head, gif ? 2 : 0, slot];
    const total = 2 + frame.length + payload.length;
    const message = new Uint8Array(total);
    message.set([total & 255, (total >> 8) & 255, ...frame]);
    message.set(payload, 2 + frame.length);
    messages.push(message);
  }
  return messages;
}

// Trozos para cada escritura Bluetooth.
export function chunks(message, size = CHUNK_BYTES) {
  const out = [];
  for (let pos = 0; pos < message.length; pos += size) out.push(message.subarray(pos, pos + size));
  return out;
}
