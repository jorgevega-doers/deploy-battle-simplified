// Dónde viven los datos del stand (Top 10 y emails) para que NUNCA se pierdan (sección 78): en una carpeta del usuario FUERA del proyecto
// (~/DeployBattle por defecto; DATA_DIR la cambia), así ni el "git pull" del arranque, ni volver a clonar el repositorio, ni borrar la carpeta del
// juego los tocan. Qué NO hace: no borra nada nunca (la base de datos antigua de la carpeta del juego se COPIA, no se mueve).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Deja lista la carpeta de "file" y, si aún no existe y hay una base de datos antigua en "legacy" (la de la raíz del proyecto, de antes del 30-oct),
// la copia. Devuelve qué ha hecho: 'memory' | 'ready' (ya existía) | 'copied' | 'new'.
export function prepareDataFile(file, { legacy = null, log = console.log } = {}) {
  if (!file || file === ':memory:') return 'memory';
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) return 'ready';
  if (legacy && existsSync(legacy)) {
    copyFileSync(legacy, file);
    log(`Datos: copiada la base de datos antigua (${legacy}) a ${file}. La antigua se deja como estaba.`);
    return 'copied';
  }
  return 'new';
}
