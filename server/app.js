// Construye Express + Socket.io SIN abrir el puerto, para poder arrancarlo también desde los tests.
// Dos modos: el del STAND (por defecto: una sola partida, /host solo desde el propio portátil) y la VERSIÓN PÚBLICA (ONLINE=1, rama public:
// salas con código, sin contraseña; todo en server/online.js). AGENTS.md, secciones 1 y 8.
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { createArena, MAPS } from '../shared/arena.js';
import { config } from './config.js';
import { registerSockets } from './net/sockets.js';
import { createSlots } from './net/slots.js';
import { openLeaderboard, createNullLeaderboard } from './db/leaderboard.js';
import { openContacts, createNullContacts } from './db/contacts.js';
import { contactsToCsv } from './db/contactsCsv.js';
import { isLocalRequest } from './net/localOnly.js';
import { buildXlsx } from './db/xlsx.js';
import { backupNow } from './db/backup.js';
import { createSheetsSync } from './db/sheetsSync.js';
import { EVENTS } from '../shared/events.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildVCard, VCARD_PATH, VCARD_FILENAME } from '../shared/vcard.js';
import { getPlayUrl } from './net/publicUrl.js';
import { tunnelState } from './net/tunnel.js';
import { setupOnline } from './online.js';

// gameConfig permite cambiar valores de la partida (p. ej. una partida corta) sin tocar config.js: lo usan los tests.
// dbPath: archivo del ranking (':memory:' en los tests para no tocar el archivo real).
export function createApp({
  gameConfig = {}, rng = Math.random, dbPath = config.dbPath,
  online = config.online, requireEmail = false, backups = null, backupDir = config.backupDir, sheetsFile = null, sheetsDefaults = null, sheetsFetch = fetch, maxPlayers = 4, devPassword = config.devPassword, roomsPerWindow = 10, connectionsPerMinute = config.connectionsPerMinute, secret = config.sessionSecret, roomIdleMs = config.roomIdleMs, now,
  ranking = null, // versión pública: ranking global ya abierto (los tests pasan uno en memoria); sin él se abre Turso (o memoria sin TURSO_DATABASE_URL)
} = {}) {
  const cfg = { ...config.game, ...gameConfig };

  // El ranking se abre en segundo plano (el servidor no espera). Si no se puede abrir, el stand sigue sin ranking.
  const makeBoard = (path) => {
    const ready = openLeaderboard(path).catch((err) => {
      console.error(`No se pudo abrir el ranking (${path}); el juego sigue sin guardar puntuaciones:`, err.message);
      return createNullLeaderboard();
    });
    return {
      insert: async (entry) => (await ready).insert(entry),
      top: async (limit) => (await ready).top(limit),
      rankOf: async (score) => (await ready).rankOf(score),
      count: async (mode) => (await ready).count(mode),
      reset: async (entries) => (await ready).reset(entries),
      all: async () => (await ready).all(),
      wipe: async () => (await ready).wipe(),
      close: async () => (await ready).close(),
    };
  };
  const board = makeBoard(dbPath);
  // Contactos (el email que se pide al escanear el QR): igual en el stand y en las salas online. En Render la base es :memory:, así que allí se pierden al reiniciar el servicio.
  const makeContacts = (path) => {
    const ready = openContacts(path).catch((err) => {
      console.error(`No se pudo abrir la tabla de contactos (${path}); los emails no se guardarán:`, err.message);
      return createNullContacts();
    });
    return {
      save: async (entry) => (await ready).save(entry), all: async () => (await ready).all(), count: async () => (await ready).count(), close: async () => (await ready).close(),
      pending: async (limit) => (await ready).pending(limit), pendingCount: async () => (await ready).pendingCount(), markSynced: async (emails) => (await ready).markSynced(emails), wipe: async () => (await ready).wipe(),
    };
  };
  const contacts = makeContacts(dbPath);
  // Copia de los emails en Google Sheets (sección 79, solo en el stand): cada email nuevo sube a la hoja; sin Internet espera y se reintenta.
  const readSheetsConfig = () => {
    if (process.env.SHEETS === '0') return { url: '', token: '' }; // SHEETS=0: no se envía nada a la hoja (pruebas con emails inventados)
    if (process.env.SHEETS_URL) return { url: process.env.SHEETS_URL, token: process.env.SHEETS_TOKEN || '' };
    const fallback = { url: sheetsDefaults?.url || '', token: sheetsDefaults?.token || '' }; // la hoja fija de config.js (los tests no la pasan: no envían nada)
    if (!sheetsFile) return fallback;
    try { const c = JSON.parse(readFileSync(sheetsFile, 'utf8')); return c.url ? { url: String(c.url), token: String(c.token || '') } : fallback; } catch { return fallback; }
  };
  let sheetsConfig = readSheetsConfig();
  let sheets = createSheetsSync({ ...sheetsConfig, contacts, fetchFn: sheetsFetch, source: online ? 'online' : 'stand' });
  const restartSheets = () => { sheets.stop(); sheetsConfig = readSheetsConfig(); sheets = createSheetsSync({ ...sheetsConfig, contacts, fetchFn: sheetsFetch, source: online ? 'online' : 'stand' }); };
  const saveContact = contacts.save;
  contacts.save = async (entry) => { await saveContact(entry); sheets.kick(); };

  // Las páginas se generan con "npm run build" en la carpeta dist/ (Vite).
  const distDir = resolve(import.meta.dirname, '..', 'dist');
  if (!existsSync(distDir)) {
    console.warn('Aviso: no existe dist/. Ejecuta "npm run build" para generar las páginas.');
  }

  const app = express();
  app.disable('x-powered-by');

  // --- Partida del stand o salas de la versión pública, y bucle de juego ---
  let slots = null;
  let session = null;
  const arenas = MAPS.map((_, i) => createArena(i)); // los 3 mapas, que se alternan partida a partida
  const arena = arenas[0];
  const server = createServer(app);
  const io = new Server(server, {
    // Solo WebSocket (sin polling HTTP): menos latencia y menos cortes detrás de un túnel.
    transports: ['websocket'],
    perMessageDeflate: false,
    pingInterval: config.pingIntervalMs,
    pingTimeout: config.pingTimeoutMs,
    maxHttpBufferSize: 4096, // los mensajes del juego son diminutos: nadie necesita mandar 1 MB
  });

  let rooms = null;
  let auth = null;
  if (online) {
    // Versión pública: salas con código, sin contraseña (server/online.js).
    ({ rooms, auth } = setupOnline({ app, io, distDir, arena, arenas, cfg, rng, devPassword, secret, roomsPerWindow, connectionsPerMinute, roomIdleMs, now, ranking }));
  } else {
    slots = createSlots(maxPlayers); // el stand: hasta 4 jugadores (los tests pueden pedir 2)
    session = registerSockets(io, slots, { arena, arenas, cfg, rng, board, contacts, requireEmail, maxPlayers });
  }

  // --- API y páginas del stand ---
  if (!online) {
    // Raíz del stand: desde el propio portátil lleva a la pantalla principal y desde cualquier otro sitio (alguien que teclea la dirección del túnel) al mando.
    app.get('/', (req, res) => res.redirect(isLocalRequest(req.socket.remoteAddress, req.headers) ? '/host/' : '/play/'));
    // /host solo se puede abrir desde el propio portátil (el túnel hace público el resto).
    // Va ANTES del middleware estático para que este no lo sirva sin pasar por el control.
    app.use('/host', (req, res, next) => {
      if (isLocalRequest(req.socket.remoteAddress, req.headers)) return next();
      res.status(403).send('Acceso denegado');
    });

    // Contactos del stand en CSV (menú del host). Solo desde el propio portátil: son datos personales.
    app.get('/api/contacts.csv', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      try {
        const csv = contactsToCsv(await contacts.all());
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="contactos-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send(csv);
      } catch (err) {
        console.error('No se pudieron exportar los contactos:', err);
        res.status(500).send('No se pudieron exportar los contactos');
      }
    });
    // Emails y puntuaciones en Excel (.xlsx; lo abren Excel, Numbers y Google Sheets). Solo desde el propio portÃ¡til.
    const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : '');
    app.get('/api/contacts.xlsx', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      try {
        const people = await contacts.all();
        const scores = await board.all();
        const xlsx = buildXlsx([
          { name: 'Emails', rows: [['Email', 'Iniciales', 'Partidas jugadas', 'Primera vez', 'Ãšltima vez', 'Consentimiento (versiÃ³n del texto)'],
            ...people.map((c) => [c.email, c.initials ?? '', c.plays, fmtDate(c.first_seen), fmtDate(c.last_seen), c.consent])] },
          { name: 'Puntuaciones', rows: [['Iniciales', 'Puntos', 'PrecisiÃ³n %', 'Modo', 'Fecha', 'En el Top actual'],
            ...scores.map((r) => [r.initials, r.score, Math.round(r.accuracy * 10) / 10, r.mode, fmtDate(r.timestamp), r.archived_at ? 'No (archivada)' : 'SÃ­'])] },
        ]);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="deploy-battle-emails-${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send(xlsx);
      } catch (err) {
        console.error('No se pudo exportar a Excel:', err);
        res.status(500).send('No se pudo exportar');
      }
    });
    // DÃ³nde estÃ¡n los datos y cuÃ¡ntos hay (pestaÃ±a DATOS del menÃº). Solo desde el propio portÃ¡til.
    app.get('/api/data/info', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      let people = null; let scores = null;
      try { people = await contacts.count(); } catch { /* sin base de datos */ }
      try { scores = (await board.all()).length; } catch { /* sin base de datos */ }
      let pending = null;
      try { pending = await contacts.pendingCount(); } catch { /* sin base de datos */ }
      const st = sheets.status;
      res.json({ dbPath, backupDir, contacts: people, scores, lastBackup: backups?.last ?? null,
        sheets: { configurable: Boolean(sheetsFile) && !process.env.SHEETS_URL, enabled: st.enabled, url: sheetsConfig.url, hasToken: Boolean(sheetsConfig.token), pending, lastOkAt: st.lastOkAt, lastError: st.lastError } });
    });
    // Configurar la copia en Google Sheets desde el menú (dirección de la aplicación web de Apps Script y su clave). Solo desde el propio portátil.
    app.post('/api/sheets', express.json({ limit: '2kb' }), (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      if (!sheetsFile) return res.status(409).json({ ok: false, error: 'no disponible' });
      const url = String(req.body?.url ?? '').trim();
      const token = String(req.body?.token ?? '').trim().slice(0, 200);
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return res.status(400).json({ ok: false, error: 'La dirección debe ser la de la aplicación web: https://script.google.com/macros/s/.../exec' });
      try {
        mkdirSync(dirname(sheetsFile), { recursive: true });
        writeFileSync(sheetsFile, JSON.stringify({ url, token }, null, 2));
        restartSheets();
        res.json({ ok: true });
      } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });
    // ELIMINAR TODOS LOS DATOS (menú > DATOS, sección 80): vacía emails y puntuaciones de ESTE equipo. Hay que escribir "eliminar" para confirmar y
    // antes se guarda una copia completa en la carpeta de copias (por si fue un error). La hoja de Google no se toca. Solo desde el propio portátil.
    app.post('/api/data/wipe', express.json({ limit: '1kb' }), async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      if (String(req.body?.confirm ?? '').trim().toLowerCase() !== 'eliminar') return res.status(400).json({ ok: false, error: 'Escribe ELIMINAR para confirmar' });
      try {
        const backup = dbPath === ':memory:' ? null : await backupNow(dbPath, backupDir, { label: 'antes-de-eliminar' });
        await contacts.wipe();
        await board.wipe();
        io.to('host').emit(EVENTS.LEADERBOARD_UPDATE, { top: [] });
        console.log(`Datos: ELIMINADOS desde el menú (copia previa: ${backup ?? 'ninguna, base en memoria'}).`);
        res.json({ ok: true, backup });
      } catch (err) {
        console.error('No se pudieron eliminar los datos:', err);
        res.status(500).json({ ok: false, error: err.message });
      }
    });
    // Enviar ya los pendientes (botón del menú): devuelve cuántos han subido o el error.
    app.post('/api/sheets/flush', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      if (!sheets.status.enabled) return res.json({ ok: false, error: 'sin configurar' });
      const sent = await sheets.flush();
      res.json({ ok: !sheets.status.lastError, sent, error: sheets.status.lastError });
    });
    // Copia de seguridad AHORA y se descarga (tambiÃ©n queda en la carpeta de copias). Solo desde el propio portÃ¡til.
    app.get('/api/backup.db', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      if (dbPath === ':memory:') return res.status(409).send('Sin archivo de datos (modo de prueba)');
      try { res.download(await backupNow(dbPath, backupDir, { label: 'manual' })); } catch (err) {
        console.error('No se pudo hacer la copia:', err);
        res.status(500).send('No se pudo hacer la copia');
      }
    });
    app.get('/api/contacts/count', async (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      try { res.json({ count: await contacts.count() }); } catch { res.json({ count: null }); }
    });

    // Datos que necesita la pantalla principal (la URL del QR y el estado del túnel). Solo desde el propio portátil.
    // URL del QR: PUBLIC_URL si se dio; si no, la del túnel en cuanto esté listo; mientras, la de la red local.
    app.get('/api/host-config', (req, res) => {
      if (!isLocalRequest(req.socket.remoteAddress, req.headers)) return res.status(403).send('Acceso denegado');
      const publicUrl = config.publicUrl || tunnelState.url;
      res.json({
        playUrl: getPlayUrl({ publicUrl, port: config.port }),
        tunnel: config.publicUrl ? 'ready' : tunnelState.status,
        tunnelReason: tunnelState.reason,
      });
    });
  }
  // El mando, la pantalla final y los créditos son públicos (los móviles entran por el QR sin contraseña; sin sala válida no hay juego).
  if (!online) app.get('/api/mode', (_req, res) => res.json({ online: false, dev: false })); // las páginas saben si están en el stand (la versión pública responde en online.js)

  // Tarjeta de contacto de /end (pública, como /end): un archivo .vcf real con su tipo. iPhone lo abre directamente en "Añadir contacto" y Android lo
  // descarga y lo abre con la app de contactos; con un enlace "data:" o "download" el iPhone no lo abría.
  app.get(VCARD_PATH, (_req, res) => {
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${VCARD_FILENAME}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buildVCard());
  });

  // Los archivos con hash en el nombre (assets/host-AbC123.js) no cambian nunca: el navegador los guarda un año.
  app.use(express.static(distDir, {
    setHeaders: (res, file) => { if (/[\\/]assets[\\/][^\\/]+-[\w-]{8}\.(js|css)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); },
  }));

  // Bucle del juego: en cada vuelta se simula el tiempo real transcurrido (como mínimo 1/120 s y como máximo 0,05 s de
  // golpe, para no dar saltos tras un parón). Antes era un paso fijo de 1/60 s: en Windows el temporizador de Node solo
  // despierta cada ~15,6 ms, así que muchas vueltas no llegaban a un paso completo y la entrada del mando esperaba una
  // vuelta más (medido con scripts/input-latency.js: mediana 31 ms -> ver AGENTS.md, sección 19). La simulación ya usa
  // "dt" en todo (movimiento, rebotes por raycast, tiempos), así que funciona igual con pasos de duración variable.
  let loopTimer = null;
  let sweepTimer = null;
  function startLoop() {
    if (loopTimer) return;
    const minStep = 1 / (cfg.tickHz * 2);
    let last = performance.now();
    loopTimer = setInterval(() => {
      const t = performance.now();
      const elapsed = (t - last) / 1000;
      if (elapsed < minStep) return;
      last = t;
      const dt = Math.min(elapsed, 0.05);
      // Un fallo en una partida no puede tumbar el servidor ni las demás salas: se registra y, si es de una sala, se cierra solo esa.
      if (session) { try { session.tick(dt); } catch (err) { console.error('Fallo en el bucle del juego:', err); } }
      if (rooms) {
        for (const room of rooms.all()) {
          try { room.session.tick(dt); } catch (err) { console.error(`Fallo en la sala ${room.code}; se cierra:`, err); rooms.destroy(room.code); }
        }
      }
    }, 4);
    if (rooms) { sweepTimer = setInterval(() => rooms.sweep(), 10000); sweepTimer.unref?.(); }
  }
  function stopLoop() {
    clearInterval(loopTimer);
    clearInterval(sweepTimer);
    loopTimer = null;
    sweepTimer = null;
  }

  return { server, io, slots, session, arena, board, contacts, startLoop, stopLoop, rooms, auth, app };
}
