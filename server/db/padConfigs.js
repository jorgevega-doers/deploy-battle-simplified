// Configuraciones de mandos compartidas: cuando alguien configura un mando que el navegador no reconoce, su
// configuración se guarda aquí para ese modelo (el id que da el navegador: nombre, fabricante y producto), y el siguiente que conecte ese
// mismo modelo, en cualquier ordenador, la recibe sin tener que configurar nada.
// Contra una configuración mal hecha: cada pantalla (voter) tiene UN voto por modelo (si vuelve a configurarlo, cambia su voto); se usa la
// configuración más votada y, en empate, la más reciente. Así un error se corrige en cuanto otro lo configura bien.
// Turso (TURSO_DATABASE_URL y TURSO_AUTH_TOKEN); sin ellas, en memoria. Qué NO hace: no lee mandos ni sabe de botones (eso, el navegador).
import { createClient } from '@libsql/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pad_configs (
    pad_id TEXT NOT NULL CHECK (length(pad_id) BETWEEN 1 AND 120),
    voter TEXT NOT NULL,
    mapping TEXT NOT NULL CHECK (length(mapping) <= 600),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (pad_id, voter)
  )`,
];
const ACTIONS = ['start', 'select', 'a', 'b', 'fire', 'dash'];
const STICKS = ['lx', 'ly', 'rx', 'ry'];

// Id de mando válido: texto corto y legible (lo da el navegador; nunca se enseña como HTML).
export function parsePadId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= 120 && /^[\x20-\x7E]+$/.test(id) ? id : null;
}

// Configuración válida: las 6 acciones (botón { t: 'b', i } o gatillo analógico { t: 'a', i, sign, rest }) y, opcionales, los ejes de los
// sticks ({ i, sign }). Cada acción en un botón distinto. Lo demás se descarta. Devuelve la versión limpia o null.
export function parsePadMapping(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const k of ACTIONS) {
    const v = m[k];
    if (!v || typeof v !== 'object') return null;
    const t = v.t ?? 'b';
    if (t === 'b' && Number.isInteger(v.i) && v.i >= 0 && v.i < 32) out[k] = { t: 'b', i: v.i };
    else if (t === 'a' && Number.isInteger(v.i) && v.i >= 0 && v.i < 16 && (v.sign === 1 || v.sign === -1) && typeof v.rest === 'number' && Math.abs(v.rest) <= 1) {
      out[k] = { t: 'a', i: v.i, sign: v.sign, rest: Math.round(v.rest * 100) / 100 };
    } else return null;
  }
  const keys = ACTIONS.map((k) => `${out[k].t}${out[k].i}${out[k].sign ?? ''}`);
  if (new Set(keys).size !== keys.length) return null; // dos acciones en el mismo botón: mal configurado
  for (const k of STICKS) {
    const v = m[k];
    if (v === undefined) continue;
    if (!v || !Number.isInteger(v.i) || v.i < 0 || v.i >= 16 || (v.sign !== 1 && v.sign !== -1)) return null;
    out[k] = { i: v.i, sign: v.sign };
  }
  return out;
}

export async function openPadConfigs({ url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN, now = () => Date.now() } = {}) {
  const db = createClient(url ? { url, authToken } : { url: ':memory:' });
  for (const sql of SCHEMA) await db.execute(sql);
  return {
    // Guarda (o cambia) el voto de esa pantalla para ese modelo. mapping ya validado (parsePadMapping).
    async vote(padId, mapping, voter) {
      await db.execute({
        sql: 'INSERT INTO pad_configs (pad_id, voter, mapping, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (pad_id, voter) DO UPDATE SET mapping = excluded.mapping, created_at = excluded.created_at',
        args: [padId, voter, JSON.stringify(mapping), now()],
      });
    },
    // La configuración que se usa para ese modelo (la más votada; en empate, la más reciente), o null.
    async best(padId) {
      const row = (await db.execute({
        sql: 'SELECT mapping, COUNT(*) AS n, MAX(created_at) AS last FROM pad_configs WHERE pad_id = ? GROUP BY mapping ORDER BY n DESC, last DESC LIMIT 1',
        args: [padId],
      })).rows[0];
      return row ? JSON.parse(String(row.mapping)) : null;
    },
    close: () => db.close(),
  };
}
