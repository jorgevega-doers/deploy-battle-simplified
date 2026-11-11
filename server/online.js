// Versión pública (ONLINE=1, rama public, 6-nov): salas con código, SIN contraseña. Cada sala es un espacio de nombres "/r/CODIGO" con su partida.
//  - "/" = elegir modo (1 PANTALLA o A DISTANCIA). La pantalla que crea la sala recibe la llave de ANFITRIONA (elige mapa y dificultad).
//  - "/db-admin/" = contraseña de desarrollador (DEV_PASSWORD): cookie con el rol "dev" (menú completo de pruebas y ranking aparte).
//  - Ranking global (Turso) solo del 1 contra 3 bots; entre amigos, el marcador de la sala (publicRoom.js).
// Qué NO hace: nada del stand (túnel, emails, Excel, panel LED). Eso sigue en app.js, que llama aquí solo con ONLINE=1.
import express from 'express';
import { resolve } from 'node:path';
import { config } from './config.js';
import { registerSockets } from './net/sockets.js';
import { createSlots } from './net/slots.js';
import { createAuth, createRateLimiter } from './net/auth.js';
import { createRoomRegistry, CODE_RE, reserve } from './net/rooms.js';
import { newHostKey } from './net/publicRoom.js';
import { parseScreenId, parseToken } from './net/validate.js';
import { openGlobalRanking, createNullRanking } from './db/globalRanking.js';
import { openPadConfigs } from './db/padConfigs.js';
import { registerPadRoutes } from './net/padRoutes.js';
import { EVENTS } from '../shared/events.js';

// Cabeceras de seguridad: sin frames ajenos, sin adivinar tipos, sin scripts de fuera. "unsafe-inline" solo en estilos (atributos style).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' ws: wss:", "media-src 'self' blob:", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

const sameHost = (origin, host) => { if (!origin) return true; try { return new URL(origin).host === host; } catch { return false; } };

export function setupOnline({ app, io, distDir, arena, arenas, cfg, rng, devPassword, secret, roomsPerWindow, connectionsPerMinute, roomIdleMs, now, ranking = null, padConfigs = null }) {
  const auth = createAuth({ devPassword, secret, now });
  if (!secret) console.warn('Aviso: sin SESSION_SECRET el modo desarrollador se cierra cada vez que se reinicia el servidor.');
  // Ranking global: se abre en segundo plano; si falla, el juego sigue sin ranking.
  const rankingReady = ranking ? Promise.resolve(ranking) : openGlobalRanking({ now }).catch((err) => {
    console.error('No se pudo abrir el ranking global (Turso); el juego sigue sin ranking:', err.message);
    return createNullRanking();
  });
  // Configuraciones de mandos compartidas (Turso, como el ranking); si falla, cada uno configura su mando en su navegador como siempre.
  const padsReady = padConfigs ? Promise.resolve(padConfigs) : openPadConfigs({ now }).catch((err) => {
    console.error('No se pudo abrir la tabla de mandos (Turso):', err.message);
    return { vote: async () => {}, best: async () => null, close: () => {} };
  });
  // Easter egg de TNI activo (vuelve en la arcade, 11-nov); cuentas atrás públicas en todas las salas.
  const roomCfg = { ...cfg, broadcastHz: Math.min(cfg.broadcastHz, config.onlineBroadcastHz), difficulty: 'media', lives: cfg.publicLives ?? cfg.lives, soloPlayerLives: cfg.publicLives ?? cfg.soloPlayerLives, joinWindowS: cfg.publicJoinWindowS, soloJoinWindowS: cfg.publicSoloJoinWindowS };

  app.set('trust proxy', 1); // detrás del proxy de la plataforma (Render): la IP y el https reales
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.get('/healthz', (_req, res) => res.type('text').send('ok'));

  // Frenar el adivinar códigos de sala: conexiones nuevas por IP y minuto (se mira antes del protocolo de Socket.io).
  const connectionLimiter = createRateLimiter({ limit: connectionsPerMinute, windowMs: 60 * 1000, now });
  io.engine.use((req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() || req.socket.remoteAddress; // la última la pone el proxy
    if (req.url?.startsWith('/socket.io/') && !connectionLimiter(ip)) { res.statusCode = 429; res.end(); return; }
    next();
  });
  io.use((_socket, next) => next(new Error('room_required'))); // no hay partida "global": cada sala es su espacio de nombres

  // Configuración de cada sala. Las `quick` (todo lo de la versión arcade) usan JUGAR sin LISTO (session.js, anyStart) salvo que se active el
  // arranque automático antiguo (publicAutoStartS).
  function roomGameCfg(room, publicQuick) {
    const base = publicQuick ? { ...roomCfg, ...(cfg.publicAutoStartS != null ? { autoStartS: cfg.publicAutoStartS, fullStartS: cfg.publicFullStartS } : {}), hostPromoteMs: 3000 } : roomCfg;
    return room.type === 'quick' && cfg.publicAutoStartS == null ? { ...base, anyStart: true, maxCancels: cfg.publicMaxCancels, cancelGuardS: cfg.publicCancelGuardS } : base;
  }

  let roomParent = null;
  const rooms = createRoomRegistry({
    maxRooms: config.maxRooms,
    idleMs: roomIdleMs,
    now,
    build: (room) => {
      const ns = io.of(`/r/${room.code}`);
      ns.use((socket, next) => (sameHost(socket.handshake.headers.origin, socket.handshake.headers.host) ? next() : next(new Error('bad_origin')))); // secuestro de WebSocket desde otra web
      const slots = createSlots(4);
      // Partida pública (la cola común): arranca sola, sin LISTO, como un online de verdad (autoStartS al haber 2+, fullStartS con 4).
      const publicQuick = room.type === 'quick' && !room.private;
      const session = registerSockets(ns, slots, {
        cfg: roomGameCfg(room, publicQuick), arena, arenas, rng, board: null, room,
        canHost: () => true, // cualquiera puede abrir una pantalla de la sala (sin contraseña); lo delicado lo decide la anfitriona
        allowDebug: (socket) => auth.roleOf(socket.handshake.headers) === 'dev',
        requireEmail: false, // la versión pública no pide el email (se contacta con DOERS desde "SOBRE DOERS")
        maxPlayers: 4,
        publicMode: true,
        // Anfitrión: en la privada, quien la creó; en la pública (10-nov), quien lleva más tiempo en la sala (la primera pantalla que llegó; la sala
        // pública no tiene llave, así que publicRoom.js se la da a la primera). Si se va, a los 3 s pasa a la siguiente más antigua.
        // (La votación de roomVotes.js solo se usaría con managed: false; ya no la usa ninguna sala.)
        managed: true,
        rankSolo: async (entry) => (await rankingReady).insert({ ...entry, dev: room.dev }),
        sendRanking: async (emitter) => {
          const tops = await (await rankingReady).tops(room.dev);
          emitter.emit(EVENTS.LEADERBOARD_UPDATE, { top: tops.week, periods: tops }); // solo ranking semanal
        },
      });
      return { ns, session, slots };
    },
    destroyNamespace: (room) => {
      room.session.dispose?.();
      roomParent?.children.delete(room.ns);
      room.ns.removeAllListeners();
      room.ns.disconnectSockets(true);
      io._nsps?.delete(room.ns.name);
    },
  });

  // Restauración (despliegue nuevo, reinicio o sala barrida): una PANTALLA que conecta con un código válido que no existe la vuelve a crear con
  // ese código (trae el tipo en handshake.auth y, si era la anfitriona, su llave). Un móvil (sin "type") o un origen ajeno reciben "Invalid namespace".
  roomParent = io.of(/^\/r\/[A-HJ-NP-Z2-9]{5}$/);
  roomParent.use((socket, next) => {
    const nsp = socket.nsp;
    const code = nsp.name.slice(3);
    if (rooms.get(code)) return next();
    const drop = () => { roomParent.children.delete(nsp); nsp.removeAllListeners(); io._nsps?.delete(nsp.name); };
    const type = socket.handshake.auth?.type;
    drop(); // se borra el espacio provisional ANTES de construir la sala: rooms.create lo vuelve a crear ya con todo su cableado
    if (!sameHost(socket.handshake.headers.origin, socket.handshake.headers.host) || !['local', 'online', 'quick'].includes(type)) return next(new Error('Invalid namespace'));
    const room = rooms.create(type, { dev: auth.roleOf(socket.handshake.headers) === 'dev', code, hostKey: parseScreenId(socket.handshake.auth?.hostKey), solo: socket.handshake.auth?.solo === true, private: socket.handshake.auth?.private === true });
    next(new Error(room ? 'room_restored' : 'Invalid namespace'));
  });

  // --- API ---
  const roomLimiter = createRateLimiter({ limit: roomsPerWindow, windowMs: 10 * 60 * 1000, now });
  const json = express.json({ limit: '1kb' });
  app.use('/api', (req, res, next) => (req.method === 'GET' || sameHost(req.headers.origin, req.headers.host) ? next() : res.status(403).json({ error: 'bad_origin' })));

  // Modo desarrollador (/db-admin/): la contraseña de desarrollo da la cookie con el rol "dev".
  app.post('/api/login', json, (req, res) => {
    const wait = auth.blockedFor(req.ip);
    if (wait > 0) return res.status(429).json({ error: 'too_many_attempts', retryAfter: wait });
    if (auth.login(req.body?.password) === 'dev') {
      auth.clearFails(req.ip);
      res.setHeader('Set-Cookie', auth.setCookie(auth.issueToken('dev'), req.secure));
      return res.json({ ok: true });
    }
    auth.recordFail(req.ip);
    res.status(401).json({ error: 'bad_password' });
  });
  app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', auth.clearCookie(req.secure)); res.json({ ok: true }); });

  // Crear una sala: { type: 'local' | 'online' } -> { code, type, hostKey }. La llave hace anfitriona a la pantalla que la creó.
  app.post('/api/rooms', json, (req, res) => {
    if (!roomLimiter(req.ip)) return res.status(429).json({ error: 'too_many_rooms' });
    if (req.body?.type === 'quick') return res.status(400).json({ error: 'bad_type' }); // las rápidas solo por /api/quick
    const room = rooms.create(req.body?.type, { dev: auth.roleOf(req.headers) === 'dev', hostKey: newHostKey() });
    if (!room) return res.status(rooms.size >= config.maxRooms ? 503 : 400).json({ error: rooms.size >= config.maxRooms ? 'rooms_full' : 'bad_type' });
    res.status(201).json({ code: room.code, type: room.type, hostKey: room.hostKey });
  });
  // Salas en las que cada uno juega desde su pantalla (10-nov): { solo?: true } o { private?: true } -> { code, type: 'quick', solo, private, hostKey? }.
  //  - solo: sala privada contra los bots. private: sala privada online (se comparte el código o el enlace; quien la crea es la anfitriona).
  //  - sin nada: la cola común (BUSCAR PARTIDA): la sala pública que espera gente (la más llena) o una nueva que ya queda en la cola.
  app.post('/api/quick', json, (req, res) => {
    const dev = auth.roleOf(req.headers) === 'dev';
    const solo = req.body?.solo === true;
    const priv = !solo && req.body?.private === true;
    const open = (room) => room.session.phase === 'LOBBY';
    const players = (room) => room.slots.count();
    // El token de la pestaña (el mismo con el que entrará): la reserva es SUYA y, si ya tiene plaza en una sala (recargó), vuelve a esa.
    const token = parseToken(req.body?.token);
    const holds = (room, t) => room.slots.holds(t);
    let room = solo || priv ? null : rooms.findQuick({ dev, players, open, token, holds });
    if (!room) {
      if (!roomLimiter(req.ip)) return res.status(429).json({ error: 'too_many_rooms' });
      room = rooms.create('quick', { dev, solo, private: priv, hostKey: priv ? newHostKey() : null });
      if (!room) return res.status(503).json({ error: 'rooms_full' });
      if (!room.private) reserve(room, token, now ? now() : Date.now()); // el que la crea ya cuenta: los siguientes de la cola entran aquí
    }
    res.json({ code: room.code, type: 'quick', solo: room.solo, private: room.private, ...(priv ? { hostKey: room.hostKey } : {}) });
  });
  // ¿Existe la sala? (formulario "unirse con código").
  app.get('/api/rooms/:code', (req, res) => {
    const room = CODE_RE.test(String(req.params.code).toUpperCase()) ? rooms.get(req.params.code) : null;
    if (!room) return res.status(404).json({ error: 'room_not_found' });
    res.json({ code: room.code, type: room.type, private: Boolean(room.private), solo: Boolean(room.solo), screens: room.screens(), open: room.session.phase === 'LOBBY' && room.slots.count() < 4 });
  });
  registerPadRoutes(app, { json, padsReady, salt: secret ?? '', now }); // configuraciones de mandos compartidas
  app.get('/api/mode', (req, res) => res.json({ online: true, public: true, dev: auth.roleOf(req.headers) === 'dev' }));

  // Páginas. Versión arcade (11-nov): el inicio ES la pantalla del juego (título, JUGAR, sala y partida en la misma página, así el sonido que se
  // activa con el primer clic no se corta). La antigua elección de modo sigue en /home/ (el móvil la usa: allí no se juega). /login/ lleva a /db-admin/.
  app.get('/', (_req, res) => res.sendFile(resolve(distDir, 'host', 'index.html')));
  app.get(['/login', '/login/'], (_req, res) => res.redirect(301, '/db-admin/'));

  return { rooms, auth, rankingReady };
}
