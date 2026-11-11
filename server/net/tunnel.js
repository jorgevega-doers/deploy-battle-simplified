// Túnel público de Cloudflare (AGENTS.md, sección 18): hace accesible el servidor desde cualquier red (Wi-Fi de la feria,
// 4G/5G...) con una URL https://*.trycloudflare.com que va en el QR. Lo usan "npm run server" (lo abre solo, salvo con
// TUNNEL=0 o si ya hay PUBLIC_URL) y "npm run stage". El estado se guarda aquí para que /api/host-config lo cuente al host.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCloudflared, localBinary, installHint } from './cloudflaredInstall.js';

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

// Un cloudflared que quedó vivo de un servidor anterior (terminal cerrada a lo bruto, caída...) se mata al arrancar: su PID se guarda aquí.
const PID_FILE = join(tmpdir(), 'deploy-battle-cloudflared.pid');
function isCloudflared(pid) {
  try {
    const out = process.platform === 'win32'
      ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
      : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
    return /cloudflared/i.test(out);
  } catch { return false; }
}
export function killStaleTunnel() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8'));
    if (pid && isCloudflared(pid)) { process.kill(pid); console.log(`Túnel: cerrado el cloudflared anterior (PID ${pid}).`); }
  } catch { /* no había ninguno */ }
  try { unlinkSync(PID_FILE); } catch { /* da igual */ }
}

// Estado actual: 'off' (no se usa), 'starting', 'ready' (con url) o 'failed' (con motivo).
export const tunnelState = { status: 'off', url: '', reason: '' };
let current = null;       // el proceso cloudflared que gestiona este servidor (null = no hay o lo gestiona otro, como "npm run stage")
let managedPort = null;
let goodProtocol = null;  // el protocolo con el que se registró la última vez (un reinicio lo usa directamente)
const REGISTER_TIMEOUT_MS = 20000;

// Al cerrar el servidor se cierra también su cloudflared. Se registra UNA sola vez (antes se añadía en cada intento y se acumulaban).
let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  const stop = () => { try { current?.kill(); } catch { /* ya cerrado */ } };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { stop(); process.exit(0); });
}

// Protocolo de cada intento: el que se pida (TUNNEL_PROTOCOL) o el que funcionó antes; si no, el de cloudflared (QUIC, por UDP 7844) en el primero
// y http2 (TCP 443) en los siguientes. Muchas redes (y algunos equipos Linux) bloquean ese UDP: cloudflared acaba pasando a http2 por sí solo, pero
// tras varios reintentos que tardan más que la espera, así que el túnel se cerraba antes de conseguirlo una y otra vez.
export function protocolFor(attempt, requested = process.env.TUNNEL_PROTOCOL, remembered = goodProtocol) {
  if (requested) return requested;
  if (remembered) return remembered;
  return attempt === 1 ? null : 'http2';
}

// cloudflared puede no estar en el PATH justo después de instalarlo con winget.
export function findCloudflared() {
  const candidates = [localBinary(), 'cloudflared', 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch { /* probar el siguiente */ }
  }
  return null;
}

// Lee la salida de cloudflared (stdout y stderr) por LÍNEAS completas: la tubería entrega trozos que pueden cortar una línea a la mitad
// (en Linux pasa a menudo), y entonces ni la URL ni "Registered tunnel connection" se encontraban. Llama a onLine con cada línea.
export function onCloudflaredLines(tunnel, onLine) {
  for (const stream of [tunnel.stdout, tunnel.stderr]) {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) onLine(line);
      if (pending.length > 4096) { onLine(pending); pending = ''; } // una "línea" sin fin no debe crecer sin límite
    });
    stream.on('end', () => { if (pending) onLine(pending); pending = ''; });
  }
}

// Espera a que cloudflared escriba su URL pública (la escribe por stderr).
export function waitForTunnelUrl(tunnel, { timeoutMs = 30000, log = () => {} } = {}) {
  return new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared no devolvió una URL en 30 s')), timeoutMs);
    let done = false;
    onCloudflaredLines(tunnel, (line) => {
      log(`${line}\n`);
      const match = !done && line.match(TUNNEL_URL_RE);
      if (match) { done = true; clearTimeout(timer); resolveUrl(match[0]); }
    });
    tunnel.once('exit', (code) => { clearTimeout(timer); if (!done) reject(new Error(`cloudflared se cerró (código ${code})`)); });
  });
}

// Líneas de error o aviso de cloudflared (las últimas), para contar en la consola POR QUÉ no se registra el túnel.
// Incluye las comprobaciones previas que hacen las versiones nuevas (tabla "CONNECTIVITY PRE-CHECKS": DNS, UDP/QUIC, TCP/HTTP2 con PASS/FAIL).
export const isProblem = (line) => /\b(ERR|WRN|FAIL)\b|error|failed|timeout|hard_fail=true/i.test(line) && !/status=pass/.test(line);

// Comprueba que la URL pública responde de verdad (cloudflared la anuncia ANTES de que el túnel esté registrado y el DNS la conozca: un móvil que
// escaneara el QR en ese momento llegaría a una página de error de Cloudflare). Reintenta hasta timeoutMs; devuelve true si contesta el propio servidor.
export async function verifyTunnel(url, { timeoutMs = 45000, intervalMs = 1500, fetchFn = fetch } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetchFn(`${url}/api/mode`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch { /* aún no resuelve o no conecta */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Abre el túnel hacia localhost:port y actualiza tunnelState. No lanza errores: si falla, el QR usa la red local.
export async function startTunnel(port, { attempt = 1 } = {}) {
  killStaleTunnel();
  let cloudflared = findCloudflared();
  if (!cloudflared) { // máquina nueva: se descarga solo (una vez) a bin/
    Object.assign(tunnelState, { status: 'starting', url: '', reason: '' });
    try { cloudflared = await installCloudflared(); } catch (err) { console.warn(`Túnel: ${err.message}`); }
  }
  if (!cloudflared) {
    Object.assign(tunnelState, { status: 'failed', reason: `cloudflared no está instalado (${installHint()})` });
    console.warn(`Túnel: ${tunnelState.reason}. El QR usará la red local.`);
    return null;
  }
  Object.assign(tunnelState, { status: 'starting', url: '', reason: '' });
  const protocol = protocolFor(attempt);
  const args = ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  if (protocol) args.push('--protocol', protocol);
  console.log(`Túnel: abriendo (intento ${attempt}, protocolo ${protocol ?? 'por defecto (QUIC)'})...`);
  const tunnel = spawn(cloudflared, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  current = tunnel;
  managedPort = port;
  hookExit();
  tunnel.on('error', (err) => console.warn(`Túnel: no se pudo ejecutar cloudflared (${err.message}).`));
  // cloudflared dice "Registered tunnel connection" cuando el túnel ya está unido a la red de Cloudflare: esa es la señal rápida y fiable de que la URL funciona.
  const problems = [];
  const registered = new Promise((resolve) => {
    onCloudflaredLines(tunnel, (line) => {
      if (/Registered tunnel connection/i.test(line)) resolve(true);
      else if (isProblem(line)) { problems.push(line.trim()); if (problems.length > 10) problems.shift(); }
    });
    tunnel.once('exit', () => resolve(false));
  });
  try { writeFileSync(PID_FILE, String(tunnel.pid)); } catch { /* sin PID guardado, solo se pierde la limpieza */ }
  const stop = () => { try { tunnel.kill(); } catch { /* ya cerrado */ } };
  try {
    const url = await waitForTunnelUrl(tunnel);
    if (current !== tunnel) return tunnel; // mientras tanto se pidió otro reinicio
    // La URL sale ANTES de que el túnel esté registrado: se espera a la señal de registro (normalmente 1-3 s). Si no llega, se cierra y se abre otro (por http2).
    const ok = await Promise.race([registered, new Promise((r) => setTimeout(() => r(false), REGISTER_TIMEOUT_MS))]);
    if (current !== tunnel) return tunnel;
    if (!ok) {
      stop();
      if (problems.length) console.warn(`Túnel: cloudflared dijo:\n  ${problems.join('\n  ')}`);
      if (attempt < 3) {
        console.warn(`Túnel: no llegó a registrarse en ${REGISTER_TIMEOUT_MS / 1000} s, abriendo otro (protocolo ${protocolFor(attempt + 1) ?? 'por defecto'})...`);
        return startTunnel(port, { attempt: attempt + 1 });
      }
      throw new Error('el túnel no llegó a registrarse (¿la red bloquea la salida hacia Cloudflare por los puertos 7844 y 443?)');
    }
    goodProtocol = protocol; // los reinicios (tecla R, menú) van directos al que funcionó
    // Comprobación extra breve (este PC puede tardar en resolver el nombre nuevo): si responde, perfecto; si no, se da por bueno igualmente porque está registrado.
    if (!(await verifyTunnel(url, { timeoutMs: 6000 }))) console.warn('Túnel: registrado, aunque este equipo aún no resuelve la URL (los móviles sí suelen).');
    Object.assign(tunnelState, { status: 'ready', url });
    console.log(`Túnel listo: ${url}  (el QR ya apunta a ${url}/play/)`);
    tunnel.once('exit', () => { if (current === tunnel) Object.assign(tunnelState, { status: 'failed', url: '', reason: 'el túnel se cerró' }); }); // si lo cerramos para reiniciarlo, no es un fallo
  } catch (err) {
    Object.assign(tunnelState, { status: 'failed', reason: err.message });
    console.warn(`Túnel: ${err.message}. El QR usará la red local.`);
  }
  return tunnel;
}

// Reinicio de emergencia (tecla R): cierra el cloudflared que gestiona este servidor y abre otro (la URL del QR CAMBIA, por eso el host vuelve a
// pedirla). Devuelve false si el túnel no lo gestiona este servidor (PUBLIC_URL, "npm run stage" o TUNNEL=0): ahí no se puede ni se debe tocar.
export function restartTunnel() {
  if (!current || managedPort === null) return false;
  const old = current;
  current = null; // el 'exit' del anterior ya no cuenta como fallo
  Object.assign(tunnelState, { status: 'starting', url: '', reason: '' });
  try { old.kill(); } catch { /* ya estaba cerrado */ }
  startTunnel(managedPort); // sin await: el host consulta el estado cada 2 s
  return true;
}
