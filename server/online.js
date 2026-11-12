// Salas y API del juego. Cada sala es un espacio de nombres "/r/CODIGO" con su partida (hasta 4 jugadores, cada uno en su pantalla).
//  - "/" = la pantalla del juego (título, JUGAR, sala y partida en la misma página). POST /api/quick = la cola común: te mete en la sala con
//    hueco (la más llena) o crea una.
//  - "/db-admin/" = contraseña de desarrollador (DEV_PASSWORD): cookie con el rol "dev" (menú de pruebas y salas aparte).
//  - Configuraciones de mandos compartidas (/api/pads, en Turso).
// Qué NO hace: no sabe de reglas de juego (server/game/) ni del bucle (app.js).
import express from 'express';
import { resolve } from 'node:path';
import { config } from './config.js';
import { registerSockets } from './net/sockets.js';
import { createSlots } from './net/slots.js';
import { createAuth, createRateLimiter } from './net/auth.js';
import { createRoomRegistry, reserve } from './net/rooms.js';
import { parseToken } from './net/validate.js';
import { openPadConfigs } from './db/padConfigs.js';
import { registerPadRoutes } from './net/padRoutes.js';

// Cabeceras de seguridad: sin frames ajenos, sin adivinar tipos, sin scripts de fuera. "unsafe-inline" solo en estilos (atributos style).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' ws: wss:", "media-src 'self' blob:", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

const sameHost = (origin, host) => { if (!origin) return true; try { return new URL(origin).host === host; } catch { return false; } };

export function setupOnline({ app, io, distDir, arena, arenas, cfg, rng, devPassword, secret, roomsPerWindow, connectionsPerMinute, roomIdleMs, now, padConfigs = null }) {
  const auth = createAuth({ devPassword, secret, now });
  if (!secret) console.warn('Aviso: sin SESSION_SECRET el modo desarrollador se cierra cada vez que se reinicia el servidor.');
  // Configuraciones de mandos compartidas (Turso); si falla, cada uno configura su mando en su navegador como siempre.
  const padsReady = padConfigs ? Promise.resolve(padConfigs) : openPadConfigs({ now }).catch((err) => {
    console.error('No se pudo abrir la tabla de mandos (Turso):', err.message);
    return { vote: async () => {}, best: async () => null, close: () => {} };
  });

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

  let roomParent = null;
  const rooms = createRoomRegistry({
    maxRooms: config.maxRooms,
    idleMs: roomIdleMs,
    now,
    build: (room) => {
      const ns = io.of(`/r/${room.code}`);
      ns.use((socket, next) => (sameHost(socket.handshake.headers.origin, socket.handshake.headers.host) ? next() : next(new Error('bad_origin')))); // secuestro de WebSocket desde otra web
      const slots = createSlots(4);
      const session = registerSockets(ns, slots, {
        cfg, arena, arenas, rng, room,
        allowDebug: (socket) => auth.roleOf(socket.handshake.headers) === 'dev',
      });
      return { ns, session, slots };
    },
    destroyNamespace: (room) => {
      roomParent?.children.delete(room.ns);
      room.ns.removeAllListeners();
      room.ns.disconnectSockets(true);
      io._nsps?.delete(room.ns.name);
    },
  });

  // Restauración (despliegue nuevo, reinicio o sala barrida): una PANTALLA que conecta con un código válido que no existe la vuelve a crear con
  // ese código (se reconoce porque trae { type: 'quick' } en handshake.auth). Un teclado (sin "type") o un origen ajeno reciben "Invalid namespace".
  roomParent = io.of(/^\/r\/[A-HJ-NP-Z2-9]{5}$/);
  roomParent.use((socket, next) => {
    const nsp = socket.nsp;
    const code = nsp.name.slice(3);
    if (rooms.get(code)) return next();
    const drop = () => { roomParent.children.delete(nsp); nsp.removeAllListeners(); io._nsps?.delete(nsp.name); };
    drop(); // se borra el espacio provisional ANTES de construir la sala: rooms.create lo vuelve a crear ya con todo su cableado
    if (!sameHost(socket.handshake.headers.origin, socket.handshake.headers.host) || socket.handshake.auth?.type !== 'quick') return next(new Error('Invalid namespace'));
    const room = rooms.create({ dev: auth.roleOf(socket.handshake.headers) === 'dev', code });
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

  // Cola común (JUGAR): { token } -> { code }. La sala que espera gente (la más llena) o una nueva que ya queda en la cola.
  app.post('/api/quick', json, (req, res) => {
    const dev = auth.roleOf(req.headers) === 'dev';
    const open = (room) => room.session.phase === 'LOBBY';
    const players = (room) => room.slots.count();
    // El token de la pestaña (el mismo con el que entrará): la reserva es SUYA y, si ya tiene plaza en una sala (recargó), vuelve a esa.
    const token = parseToken(req.body?.token);
    const holds = (room, t) => room.slots.holds(t);
    let room = rooms.findQuick({ dev, players, open, token, holds });
    if (!room) {
      if (!roomLimiter(req.ip)) return res.status(429).json({ error: 'too_many_rooms' });
      room = rooms.create({ dev });
      if (!room) return res.status(503).json({ error: 'rooms_full' });
      reserve(room, token, now ? now() : Date.now()); // el que la crea ya cuenta: los siguientes de la cola entran aquí
    }
    res.json({ code: room.code });
  });
  registerPadRoutes(app, { json, padsReady, salt: secret ?? '', now }); // configuraciones de mandos compartidas
  app.get('/api/mode', (req, res) => res.json({ dev: auth.roleOf(req.headers) === 'dev' }));

  // Páginas: el inicio ES la pantalla del juego (así el sonido que se activa con el primer clic no se corta al entrar en la sala).
  // /home/ es la página del móvil (allí no se juega). /login/ lleva a /db-admin/. Las direcciones de la versión anterior (/host/, /play/) llevan al inicio.
  app.get('/', (_req, res) => res.sendFile(resolve(distDir, 'host', 'index.html')));
  app.get(['/login', '/login/'], (_req, res) => res.redirect(301, '/db-admin/'));
  app.get(['/host', '/host/', '/play', '/play/'], (_req, res) => res.redirect(301, '/'));

  return { rooms, auth };
}
