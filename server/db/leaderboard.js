// Ranking guardado en SQLite (AGENTS.md, sección 16): sobrevive a reinicios del portátil.
// Un único Top 10 para todos los modos (sección 70): la puntuación ya es comparable entre modos. La columna "mode" se guarda solo como dato.
// Solo se escribe al terminar una partida y se lee para el Top 10 y la posición de cada jugador, nunca dentro del tick.
// NUNCA se borra una puntuación (sección 78): reiniciar el Top 10 o cambiar la fórmula las ARCHIVA (archived_at) y dejan de contar, pero siguen en el archivo y en la exportación.
// Todas las consultas llevan parámetros (?), nunca se pegan valores dentro del texto SQL.
import { openDatabase } from './sqlite.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leaderboard (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  initials  TEXT    NOT NULL CHECK (length(initials) = 3 AND initials GLOB '[A-Z][A-Z][A-Z]'),
  accuracy  REAL    NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
  score     INTEGER NOT NULL CHECK (score >= 0),
  timestamp INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  mode      TEXT    NOT NULL DEFAULT 'multi' CHECK (mode IN ('multi', 'solo'))
);
`;
const modeOf = (mode) => (mode === 'solo' ? 'solo' : 'multi');
// Versión de la fórmula de puntuación: al subirla, las puntuaciones antiguas (calculadas con otra fórmula, no comparables) se archivan al abrir.
export const SCORE_VERSION = 2;

// Abre (o crea) la base de datos en "file" (o ':memory:' en los tests) y prepara la tabla. Un archivo de antes de los dos
// rankings (sin columna "mode") se actualiza solo: sus puntuaciones pasan a ser del ranking multijugador.
export async function openLeaderboard(file) {
  const db = await openDatabase(file);
  await db.exec(SCHEMA);
  const columns = await db.all('PRAGMA table_info(leaderboard)');
  if (!columns.some((c) => c.name === 'mode')) {
    await db.exec("ALTER TABLE leaderboard ADD COLUMN mode TEXT NOT NULL DEFAULT 'multi' CHECK (mode IN ('multi', 'solo'))");
  }
  if (!columns.some((c) => c.name === 'archived_at')) await db.exec('ALTER TABLE leaderboard ADD COLUMN archived_at INTEGER'); // NULL = cuenta en el ranking
  await db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_score ON leaderboard (mode, score DESC)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC)');
  const [{ user_version: version }] = await db.all('PRAGMA user_version');
  if (version < SCORE_VERSION) { // puntuaciones de una fórmula anterior: se archivan (no cuentan, pero no se borran)
    await db.run('UPDATE leaderboard SET archived_at = ? WHERE archived_at IS NULL', [Date.now()]);
    await db.exec(`PRAGMA user_version = ${SCORE_VERSION}`);
  }

  return {
    // Guarda una puntuación. Si los datos no cumplen las reglas de la tabla (iniciales, rangos), SQLite la rechaza.
    async insert({ initials, accuracy, score, mode = 'multi' }) {
      await db.run('INSERT INTO leaderboard (initials, accuracy, score, mode) VALUES (?, ?, ?, ?)', [initials, accuracy, score, modeOf(mode)]);
    },
    // Las mejores puntuaciones de todos los modos; a igualdad gana la más antigua.
    async top(limit = 10) {
      return db.all('SELECT initials, score FROM leaderboard WHERE archived_at IS NULL ORDER BY score DESC, timestamp ASC, id ASC LIMIT ?', [limit]);
    },
    // Posición de una puntuación en el ranking general (1 = la mejor). Las puntuaciones iguales comparten posición.
    async rankOf(score) {
      const [row] = await db.all('SELECT COUNT(*) AS better FROM leaderboard WHERE archived_at IS NULL AND score > ?', [score]);
      return row.better + 1;
    },
    async count(mode) {
      const [row] = mode
        ? await db.all('SELECT COUNT(*) AS total FROM leaderboard WHERE archived_at IS NULL AND mode = ?', [modeOf(mode)])
        : await db.all('SELECT COUNT(*) AS total FROM leaderboard WHERE archived_at IS NULL');
      return row.total;
    },
    // Todas las puntuaciones guardadas, también las archivadas (para exportar), de la más antigua a la más reciente.
    async all() {
      return db.all('SELECT id, initials, score, accuracy, mode, timestamp, archived_at FROM leaderboard ORDER BY timestamp ASC, id ASC');
    },
    // Empieza un Top 10 nuevo: ARCHIVA las puntuaciones actuales (no se borran) y deja las de "entries" ([{ initials, accuracy, score, mode }]).
    // Va en una transacción: o se queda el ranking nuevo entero o el antiguo intacto.
    async reset(entries = []) {
      await db.exec('BEGIN');
      try {
        await db.run('UPDATE leaderboard SET archived_at = ? WHERE archived_at IS NULL', [Date.now()]);
        for (const { initials, accuracy = 0, score, mode = 'multi' } of entries) {
          await db.run('INSERT INTO leaderboard (initials, accuracy, score, mode) VALUES (?, ?, ?, ?)', [initials, accuracy, score, modeOf(mode)]);
        }
        await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
    },
    // ÚNICO borrado real (sección 80): vacía el ranking, también lo archivado. Solo lo usa el botón "ELIMINAR TODOS LOS DATOS" del menú, que antes hace una copia.
    async wipe() {
      await db.run('DELETE FROM leaderboard');
      await db.run("DELETE FROM sqlite_sequence WHERE name = 'leaderboard'");
    },
    close: () => db.close(),
  };
}

// Si la base de datos no se puede abrir (disco lleno, archivo bloqueado...) el stand sigue funcionando sin ranking:
// la partida no depende de él. Misma API, no guarda nada.
export function createNullLeaderboard() {
  return {
    async insert() {},
    async top() { return []; },
    async rankOf() { return null; },
    async count() { return 0; },
    async all() { return []; },
    async reset() {},
    async wipe() {},
    async close() {},
  };
}
