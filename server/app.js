// Construye Express + Socket.io SIN abrir el puerto, para poder arrancarlo también desde los tests.
// Salas, API y páginas del juego: server/online.js. Aquí: el servidor, los archivos estáticos (dist/) y el bucle de juego de todas las salas.
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { createArena, MAPS } from '../shared/arena.js';
import { config } from './config.js';
import { buildVCard, VCARD_PATH, VCARD_FILENAME } from '../shared/vcard.js';
import { setupOnline } from './online.js';

// gameConfig permite cambiar valores de la partida (p. ej. una partida corta) sin tocar config.js: lo usan los tests.
// padConfigs: los tests pasan uno en memoria; sin él se abre Turso (o memoria sin TURSO_DATABASE_URL).
export function createApp({
  gameConfig = {}, rng = Math.random, devPassword = config.devPassword, roomsPerWindow = 10, connectionsPerMinute = config.connectionsPerMinute,
  secret = config.sessionSecret, roomIdleMs = config.roomIdleMs, now, padConfigs = null,
} = {}) {
  const cfg = { ...config.game, ...gameConfig };

  // Las páginas se generan con "npm run build" en la carpeta dist/ (Vite).
  const distDir = resolve(import.meta.dirname, '..', 'dist');
  if (!existsSync(distDir)) {
    console.warn('Aviso: no existe dist/. Ejecuta "npm run build" para generar las páginas.');
  }

  const app = express();
  app.disable('x-powered-by');

  const arenas = MAPS.map((_, i) => createArena(i)); // los mapas; tras cada partida se sortea otro
  const arena = arenas[0];
  const server = createServer(app);
  const io = new Server(server, {
    // Solo WebSocket (sin polling HTTP): menos latencia y menos cortes detrás del proxy.
    transports: ['websocket'],
    perMessageDeflate: false,
    pingInterval: config.pingIntervalMs,
    pingTimeout: config.pingTimeoutMs,
    maxHttpBufferSize: 4096, // los mensajes del juego son diminutos: nadie necesita mandar 1 MB
  });

  const { rooms, auth } = setupOnline({ app, io, distDir, arena, arenas, cfg, rng, devPassword, secret, roomsPerWindow, connectionsPerMinute, roomIdleMs, now, padConfigs });

  // Tarjeta de contacto de /end (SOBRE DOERS): un archivo .vcf real con su tipo. iPhone lo abre directamente en "Añadir contacto" y Android lo
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

  // Bucle del juego: en cada vuelta se simula el tiempo real transcurrido (como mínimo 1/120 s y como máximo 0,05 s de golpe, para no dar saltos
  // tras un parón). Con un paso fijo de 1/60 s, en Windows (el temporizador de Node solo despierta cada ~15,6 ms) muchas vueltas no llegaban a un
  // paso completo y la entrada esperaba una vuelta más. La simulación usa "dt" en todo, así que funciona igual con pasos de duración variable.
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
      // Un fallo en una partida no puede tumbar el servidor ni las demás salas: se registra y se cierra solo esa sala.
      for (const room of rooms.all()) {
        try { room.session.tick(dt); } catch (err) { console.error(`Fallo en la sala ${room.code}; se cierra:`, err); rooms.destroy(room.code); }
      }
    }, 4);
    sweepTimer = setInterval(() => rooms.sweep(), 10000);
    sweepTimer.unref?.();
  }
  function stopLoop() {
    clearInterval(loopTimer);
    clearInterval(sweepTimer);
    loopTimer = null;
    sweepTimer = null;
  }

  return { server, io, arena, startLoop, stopLoop, rooms, auth, app };
}
