// Contactos captados en el stand (AGENTS.md, sección 57): el email que cada visitante escribe al escanear el QR, con su consentimiento.
// Se guarda en SQLite junto al ranking (mismo archivo) y se exporta a CSV tras el evento (scripts/export-contacts.js). El destino puede
// cambiar en el futuro (webhook, hoja de cálculo, CRM): el resto del servidor solo conoce save(), así que basta con cambiar este módulo.
// Qué NO hace: no valida el email (eso lo hace net/validate.js) ni bloquea la partida si falla (el visitante juega igual; se registra el error).
// Todas las consultas llevan parámetros (?), nunca se pegan valores dentro del texto SQL.
import { openDatabase } from './sqlite.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 6 AND 254),
  initials   TEXT,
  consent    TEXT    NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  plays      INTEGER NOT NULL DEFAULT 1
);
`;

// Abre (o crea) la tabla en "file" (':memory:' en los tests). "consent" = versión del texto de consentimiento que aceptó el visitante.
export async function openContacts(file) {
  const db = await openDatabase(file);
  await db.exec(SCHEMA);
  // Copia en la nube (Google Sheets, sección 79): synced_at = cuándo llegó a la hoja; NULL = pendiente. Los contactos de antes se suben la primera vez.
  const columns = await db.all('PRAGMA table_info(contacts)');
  if (!columns.some((c) => c.name === 'synced_at')) await db.exec('ALTER TABLE contacts ADD COLUMN synced_at INTEGER');
  return {
    // Guarda un contacto; si el email ya estaba, actualiza sus iniciales y la fecha. "played" = llegó a tener plaza (suma una partida); un email
    // escrito con la sala llena también se guarda (played = false). Nunca se borra ninguno.
    async save({ email, initials = null, consent, played = true }) {
      const now = Date.now();
      const add = played ? 1 : 0;
      await db.run(
        `INSERT INTO contacts (email, initials, consent, first_seen, last_seen, plays) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET initials = excluded.initials, consent = excluded.consent, last_seen = excluded.last_seen, plays = plays + ?`,
        [email, initials, consent, now, now, add, add],
      );
    },
    // Todos los contactos, del más antiguo al más reciente (para exportar).
    async all() { return db.all('SELECT email, initials, consent, first_seen, last_seen, plays FROM contacts ORDER BY first_seen ASC, id ASC'); },
    async count() { const [row] = await db.all('SELECT COUNT(*) AS total FROM contacts'); return row.total; },
    // Contactos que aún no están en la hoja de Google (los más antiguos primero). Un email que vuelve a jugar no vuelve a la cola.
    async pending(limit = 50) { return db.all('SELECT email, initials, consent, first_seen FROM contacts WHERE synced_at IS NULL ORDER BY first_seen ASC, id ASC LIMIT ?', [limit]); },
    async pendingCount() { const [row] = await db.all('SELECT COUNT(*) AS total FROM contacts WHERE synced_at IS NULL'); return row.total; },
    async markSynced(emails, at = Date.now()) {
      for (const email of emails) await db.run('UPDATE contacts SET synced_at = ? WHERE email = ? AND synced_at IS NULL', [at, email]);
    },
    // ÚNICO borrado real (sección 80): vacía los contactos. Solo desde el botón del menú, que antes hace una copia. La hoja de Google no se toca.
    async wipe() {
      await db.run('DELETE FROM contacts');
      await db.run("DELETE FROM sqlite_sequence WHERE name = 'contacts'");
    },
    close: () => db.close(),
  };
}

// Si la base de datos no se puede abrir, el stand sigue funcionando sin guardar contactos. Misma API, no guarda nada.
export function createNullContacts() {
  return { async save() {}, async all() { return []; }, async count() { return 0; }, async pending() { return []; }, async pendingCount() { return 0; }, async markSynced() {}, async wipe() {}, async close() {} };
}
