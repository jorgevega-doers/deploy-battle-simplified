// Descarga de cloudflared (el programa del túnel público) cuando no está instalado: así "npm run server" funciona también en una máquina nueva
// (Ubuntu, Mac mini del stand) sin instalar nada a mano. Se guarda en bin/ del proyecto (ignorado por git). En macOS viene dentro de un .tgz y se extrae aquí.
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin');
export const localBinary = () => join(BIN_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

// Nombre del archivo de las "releases" de Cloudflare para esta máquina, o null si no hay descarga directa.
export function assetName(platform = process.platform, arch = process.arch) {
  if (platform === 'linux') return { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm' }[arch] ?? null;
  if (platform === 'win32') return arch === 'x64' ? 'cloudflared-windows-amd64.exe' : null;
  if (platform === 'darwin') return { arm64: 'cloudflared-darwin-arm64.tgz', x64: 'cloudflared-darwin-amd64.tgz' }[arch] ?? null;
  return null;
}

export function installHint(platform = process.platform) {
  if (platform === 'win32') return 'winget install Cloudflare.cloudflared';
  if (platform === 'darwin') return 'brew install cloudflared';
  return 'npm run tunnel:install (o https://github.com/cloudflare/cloudflared/releases)';
}

// Descarga el binario a bin/. Devuelve su ruta; lanza un Error con el motivo si no puede.
// Saca un archivo de un .tar (cabeceras de 512 bytes: nombre en 0-100, tamaño en octal en 124-136). Devuelve su contenido o null.
export function untarFile(tar, wanted) {
  for (let p = 0; p + 512 <= tar.length;) {
    const name = tar.subarray(p, p + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(p + 124, p + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (name === wanted || name.endsWith(`/${wanted}`)) return tar.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

export async function installCloudflared({ log = console.log } = {}) {
  const asset = assetName();
  if (!asset) throw new Error(`no hay descarga automática para ${process.platform}/${process.arch}; instálalo con: ${installHint()}`);
  const target = localBinary();
  if (existsSync(target)) return target;
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  log(`Túnel: descargando cloudflared (${asset}), solo la primera vez...`);
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`la descarga de cloudflared falló (HTTP ${res.status})`);
  let data = Buffer.from(await res.arrayBuffer());
  if (asset.endsWith('.tgz')) data = untarFile(gunzipSync(data), 'cloudflared') ?? Buffer.alloc(0); // macOS: el programa va dentro del .tgz
  if (data.length < 1_000_000) throw new Error('la descarga de cloudflared salió incompleta');
  mkdirSync(BIN_DIR, { recursive: true });
  writeFileSync(target, data);
  if (process.platform !== 'win32') chmodSync(target, 0o755);
  log(`Túnel: cloudflared instalado en ${target}`);
  return target;
}
