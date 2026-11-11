// Copias de seguridad de la base de datos del stand (sección 78): una copia completa y coherente (VACUUM INTO, aunque se esté escribiendo) en
// la carpeta de copias, al arrancar y cada 10 minutos si ha cambiado algo. Las copias NUNCA se borran (pesan muy poco: decenas de KB).
// Qué NO hace: no restaura (para volver a una copia, se cierra el servidor y se sustituye el archivo a mano).
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from './sqlite.js';

const stamp = (date = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
};

// Hace una copia ahora. Devuelve la ruta del archivo creado.
export async function backupNow(file, dir, { label = 'auto', now = new Date() } = {}) {
  mkdirSync(dir, { recursive: true });
  let target = join(dir, `deploy-battle_${stamp(now)}_${label}.db`);
  for (let n = 2; existsSync(target); n++) target = join(dir, `deploy-battle_${stamp(now)}_${label}-${n}.db`); // nunca se pisa una copia
  const db = await openDatabase(file);
  try { await db.run('VACUUM INTO ?', [target]); } finally { await db.close(); }
  return target;
}

// Copia al arrancar y, después, cada "everyMs" solo si el archivo ha cambiado. Devuelve { stop, get last }.
export function startAutoBackup(file, dir, { everyMs = 10 * 60 * 1000, log = console.log } = {}) {
  let last = null;
  let lastMtime = 0;
  let chain = Promise.resolve(); // una copia detrás de otra, nunca dos a la vez
  const run = (label, force = false) => (chain = chain.then(() => copy(label, force)));
  const copy = async (label, force) => {
    try {
      if (!existsSync(file)) return;
      const mtime = statSync(file).mtimeMs;
      if (!force && mtime === lastMtime) return; // la automática solo si ha cambiado algo
      lastMtime = mtime;
      last = { file: await backupNow(file, dir, { label }), at: Date.now() };
    } catch (err) {
      log(`Datos: no se pudo hacer la copia de seguridad (${err.message}). El juego sigue.`);
    }
  };
  run('arranque', true);
  const timer = setInterval(() => run('auto'), everyMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer), get last() { return last; }, now: (label = 'manual') => run(label, true).then(() => last) };
}
