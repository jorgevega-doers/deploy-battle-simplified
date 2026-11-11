// Codificador GIF animado mínimo (paleta de hasta 256 colores, LZW, bucle infinito). Código puro: sirve en Node (scripts/ship-gif.js) y en el
// navegador (el podio del panel LED, client/host/ledPodium.js). Qué NO hace: transparencia ni cuantizar colores (los píxeles ya son índices).

// LZW de GIF (mismo esquema que el codificador clásico de Kevin Weiner): el tamaño del código sube cuando la tabla pasa de su máximo.
function lzw(pixels, minCode) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const out = [];
  let acc = 0;
  let bits = 0;
  let codeSize = minCode + 1;
  let maxCode = (1 << codeSize) - 1;
  let free = eoi + 1;
  let dict = new Map();
  const emit = (code) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; }
    if (free > maxCode && codeSize < 12) { codeSize++; maxCode = (1 << codeSize) - 1; }
  };
  const reset = () => { dict = new Map(); free = eoi + 1; codeSize = minCode + 1; maxCode = (1 << codeSize) - 1; };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const key = prefix * 256 + pixels[i];
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    emit(prefix);
    if (free < 4096) dict.set(key, free++);
    else { emit(clear); reset(); }
    prefix = pixels[i];
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}

// palette: colores '#rrggbb' o 'rrggbb'; frames: [{ pixels: índices (ancho x alto), delayCs: centésimas de segundo }]. Devuelve un Uint8Array.
export function encodeGif({ width, height, palette, frames }) {
  const bitsPerColor = Math.max(2, Math.ceil(Math.log2(Math.max(2, palette.length)))); // LZW de GIF necesita al menos 2 bits
  const tableSize = 1 << bitsPerColor;
  const bytes = [];
  const u16 = (n) => bytes.push(n & 255, (n >> 8) & 255);
  bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  u16(width); u16(height);
  bytes.push(0x80 | 0x70 | (bitsPerColor - 1), 0, 0); // tabla global de colores
  for (let i = 0; i < tableSize; i++) {
    const hex = (palette[i] ?? '000000').replace('#', '');
    bytes.push(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  }
  bytes.push(0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 3, 1, 0, 0, 0); // NETSCAPE2.0: bucle infinito
  for (const { pixels, delayCs = 10 } of frames) {
    bytes.push(0x21, 0xf9, 4, 0, delayCs & 255, (delayCs >> 8) & 255, 0, 0);
    bytes.push(0x2c); u16(0); u16(0); u16(width); u16(height); bytes.push(0);
    bytes.push(bitsPerColor);
    const data = lzw(pixels, bitsPerColor);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
