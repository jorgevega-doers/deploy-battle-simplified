// Copia de los emails en la nube (sección 79): cada email nuevo se envía a una hoja de Google (un script de Apps Script publicado como aplicación
// web, ver docs/google-sheets-copia.gs) en cuanto se guarda. Sin Internet, los pendientes esperan en la base de datos (contacts.synced_at) y se
// reintentan hasta que llegan: no se pierde ninguno. La hoja solo AÑADE filas (nunca borra) y no repite un email que ya tiene.
// Qué NO hace: no bloquea el juego (todo en segundo plano) ni envía nada si no está configurada (SHEETS_URL vacía).

const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;
const BATCH = 50;

// url = dirección de la aplicación web de Apps Script; token = la misma clave que en el script (para que nadie más escriba en la hoja).
// source = de dónde vienen los emails ('stand' o 'online'), para la columna Origen de la hoja.
export function createSheetsSync({ url, token, source = 'stand', contacts, fetchFn = fetch, log = console.log, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const status = { enabled: Boolean(url), lastOkAt: null, lastError: '', sent: 0 };
  if (!url) return { status, kick() {}, flush: async () => 0, stop() {} };
  let timer = null;
  let running = false;
  let again = false;
  let delay = RETRY_MIN_MS;
  let stopped = false;

  const schedule = (ms) => { if (stopped) return; clearTimer(timer); timer = setTimer(() => { timer = null; flush(); }, ms); };

  // Envía todos los pendientes (por lotes). Devuelve cuántos ha subido. Si falla, programa un reintento con espera creciente (5 s .. 60 s).
  async function flush() {
    if (running) { again = true; return 0; }
    running = true;
    let total = 0;
    try {
      for (;;) {
        const batch = await contacts.pending(BATCH);
        if (!batch.length) break;
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script lee el cuerpo tal cual
          body: JSON.stringify({ token, contacts: batch.map((c) => ({ email: c.email, initials: c.initials ?? '', first_seen: c.first_seen, consent: c.consent, source })) }),
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });
        let answer = null;
        try { answer = await res.json(); } catch { /* respuesta que no es JSON: error */ }
        if (!res.ok || !answer || answer.ok !== true) throw new Error(answer?.error ? `la hoja respondió: ${answer.error}` : `respuesta inesperada (HTTP ${res.status})`);
        await contacts.markSynced(batch.map((c) => c.email));
        total += batch.length;
        status.sent += batch.length;
      }
      status.lastOkAt = Date.now();
      status.lastError = '';
      delay = RETRY_MIN_MS;
    } catch (err) {
      if (status.lastError !== err.message) log(`Copia en Google Sheets: ${err.message}. Se reintenta; los emails están a salvo en la base de datos.`);
      status.lastError = err.message;
      schedule(delay);
      delay = Math.min(RETRY_MAX_MS, delay * 2);
    } finally {
      running = false;
      if (again) { again = false; schedule(0); }
    }
    return total;
  }

  schedule(0); // al arrancar: lo que quedara pendiente (y la primera vez, todos los contactos de antes)
  return {
    status,
    kick() { schedule(0); }, // email nuevo guardado: se envía ya
    flush,
    stop() { stopped = true; clearTimer(timer); },
  };
}
