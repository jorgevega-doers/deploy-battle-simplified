// Ranking global: partidas de 1 contra 3 bots guardadas en Turso (SQLite en la nube, cliente @libsql/client)
// para que sobrevivan a que Render se duerma o se reinicie. Tres tablas a la vista: HOY, ESTA SEMANA e HISTÓRICO (hora de Madrid).
// Sin TURSO_DATABASE_URL usa una base en memoria (pruebas y desarrollo): funciona igual pero se pierde al reiniciar.
// Las salas abiertas en modo desarrollador guardan aparte (dev = 1), para que las pruebas no ensucien el ranking de los jugadores.
// Qué NO hace: no calcula la puntuación (score.js) ni decide qué partidas puntúan (sockets.js).
import { createClient } from '@libsql/client';
import { rankedScore } from '../game/score.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS solo_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initials TEXT NOT NULL CHECK (length(initials) = 3 AND initials GLOB '[A-Z][A-Z][A-Z]'),
    score INTEGER NOT NULL CHECK (score >= 0),
    accuracy REAL NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('stand', 'media', 'pro')),
    dev INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_solo_scores_rank ON solo_scores (dev, score DESC)',
  'CREATE INDEX IF NOT EXISTS idx_solo_scores_time ON solo_scores (dev, created_at)',
];
// Solo hay ranking SEMANAL (10-nov): ni diario ni histórico. periodStarts sigue dando los tres inicios por si algún día vuelven.
export const PERIODS = ['week'];
const SIZE = 10;
const ZONE = 'Europe/Madrid';

// Milisegundos UTC del inicio del día y de la semana (lunes) en Madrid. Se calcula el desfase de Madrid en ese instante (cambia con el horario de verano).
export function periodStarts(nowMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    .formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = localAsUtc - Math.floor(nowMs / 1000) * 1000; // lo que Madrid va por delante de UTC
  const dayStart = Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset;
  const sinceMonday = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 7) % 7;
  return { today: dayStart, week: dayStart - sinceMonday * 86400000, all: 0 };
}

export async function openGlobalRanking({ url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN, now = () => Date.now() } = {}) {
  if (!url) console.warn('Aviso: sin TURSO_DATABASE_URL el ranking global vive en memoria y se pierde al reiniciar.');
  const db = createClient(url ? { url, authToken } : { url: ':memory:' });
  for (const sql of SCHEMA) await db.execute(sql);

  const topSince = async (dev, since) => (await db.execute({
    sql: 'SELECT initials, score, difficulty FROM solo_scores WHERE dev = ? AND created_at >= ? ORDER BY score DESC, created_at ASC LIMIT ?',
    args: [dev, since, SIZE],
  })).rows.map((r) => ({ initials: String(r.initials), score: Number(r.score), difficulty: String(r.difficulty) }));
  const rankSince = async (dev, since, score) => Number((await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM solo_scores WHERE dev = ? AND created_at >= ? AND score > ?', args: [dev, since, score],
  })).rows[0].n) + 1;

  return {
    // Guarda una partida y devuelve { score, rank, ranks: { week } }: la puntuación de ranking y su puesto en la tabla de la semana.
    async insert({ initials, score, accuracy, difficulty, won, elapsed, dev = false }) {
      const ranked = rankedScore({ score, won, elapsed, difficulty });
      const level = ['stand', 'media', 'pro'].includes(difficulty) ? difficulty : 'media';
      if (ranked <= 0) return { score: 0, rank: null, ranks: null };
      await db.execute({
        sql: 'INSERT INTO solo_scores (initials, score, accuracy, difficulty, dev, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [initials, ranked, Math.min(100, Math.max(0, accuracy)), level, dev ? 1 : 0, now()],
      });
      const starts = periodStarts(now());
      const ranks = {};
      for (const p of PERIODS) ranks[p] = await rankSince(dev ? 1 : 0, starts[p], ranked);
      return { score: ranked, rank: ranks.week, ranks };
    },
    // La tabla de la semana (10 primeros).
    async tops(dev = false) {
      const starts = periodStarts(now());
      const out = {};
      for (const p of PERIODS) out[p] = await topSince(dev ? 1 : 0, starts[p]);
      return out;
    },
    close: () => db.close(),
  };
}

// Si Turso no responde, el juego sigue sin ranking (nunca tumba una sala).
export function createNullRanking() {
  return { insert: async () => ({ rank: null, ranks: null }), tops: async () => ({ week: [] }), close: () => {} };
}
