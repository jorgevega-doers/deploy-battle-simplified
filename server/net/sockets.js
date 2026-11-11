// Registra los eventos de Socket.io y conecta la red con la sesión de juego.
// Solo gestiona la red: las reglas del juego están en server/game/. Devuelve la sesión para que app.js la haga avanzar.
import { EVENTS } from '../../shared/events.js';
import { createSession } from '../game/session.js';
import { createAttract } from '../game/attract.js';
import { config } from '../config.js';
import { isLocalRequest } from './localOnly.js';
import { parseInitials, parsePadMove, parseAim, parsePad, parseFireAngle, parseToken, parseEmail, isTestEmail, parseGamepadName, parseScreenId } from './validate.js';
import { performHardReset } from './hardReset.js';
import { restartTunnel } from './tunnel.js';
import { createPublicRoom } from './publicRoom.js';
import { createRoomVotes } from './roomVotes.js';
import { registerPauseHandlers } from './pauseHandlers.js';

// room (solo en las salas online) = { code, type: 'local' | 'online' }. canHost(socket) decide quién puede ser host (por defecto, el
// propio portátil del stand; en online, quien tiene la cookie de acceso). allowDebug = eventos de pruebas del menú del stand.
// saveRanking = false en las salas online (el Top 10 es del stand).
// publicMode (versión pública, rama public): sala con pantalla anfitriona, revancha sin salir de la sala (no se redirige a /end), marcador de
// victorias y, en cada plaza, de qué pantalla y dispositivo es. rankSolo(result) = guarda en el ranking global la partida de 1 contra 3 bots y
// devuelve su posición (o null); sustituye al Top 10 del stand. Sin publicMode todo funciona como en el stand y las salas antiguas.
// managed = false (partida rápida): nadie es anfitrión; mapa y dificultad quedan fijos (solo el modo dev los cambia).
export function registerSockets(io, slots, { arena, arenas = [arena], cfg, rng, board, room = null, canHost = null, allowDebug = true, saveRanking = true, contacts = null, requireEmail = false, maxPlayers = slots.max, dynamic = true, publicMode = false, managed = true, rankSolo = null, sendRanking = null }) {
  const ns = typeof io.of === 'function' ? io.sockets : io; // un Server (el stand) o el espacio de nombres de una sala
  const online = room !== null;
  let publicRoom = null; // se crea abajo (necesita broadcastLobby)
  // Partida pública (sin anfitrión): mapa y dificultad por votación de las pantallas (roomVotes.js). Por defecto, ALEATORIO y MEDIA.
  const votes = publicMode && !managed ? createRoomVotes({ rng: typeof rng === 'function' ? rng : Math.random, mapCount: arenas.length }) : null;
  // Quién puede elegir mapa y dificultad y reiniciar: en el stand cualquier pantalla (solo hay una, la del portátil); en la pública, la anfitriona o el modo dev.
  const mayManage = (socket) => !publicMode || (managed && publicRoom.isHost(socket)) || debugOk(socket);
  // Reiniciar la sala (echa a todos): en la partida pública, entre desconocidos, el anfitrión solo elige mapa y dificultad; reiniciar, solo el modo dev.
  const publicMatch = room?.type === 'quick' && !room.private;
  const mayReset = (socket) => (publicMatch ? debugOk(socket) : mayManage(socket));
  // allowDebug puede ser un booleano o una función por socket (en las salas online solo el modo dev tiene el menú de pruebas).
  const debugOk = (socket) => (typeof allowDebug === 'function' ? Boolean(allowDebug(socket)) : allowDebug);
  const canHostSocket = canHost ?? ((socket) => isLocalRequest(socket.handshake.address, socket.handshake.headers));
  // Pantallas (hosts) de la sala: todas ven la misma partida. En "local" suele haber una; en "online" cada jugador abre la suya en su casa.
  const hostScreens = new Set();
  const screenCount = () => { for (const id of hostScreens) if (!ns.sockets.has(id)) hostScreens.delete(id); return hostScreens.size; };
  if (room) room.screens = screenCount;
  // "connected" cuenta solo mandos: se restan los sockets que se han registrado como host.
  const hostCount = () => ns.adapter.rooms.get('host')?.size ?? 0;
  let session; // se crea más abajo; las funciones de aquí solo la usan cuando ya existe
  let attract = null; // partida de bots de fondo (salvapantallas); también se crea más abajo
  let attractEnabled = allowDebug === true && config.attractDefault; // el salvapantallas es del stand
  const lobbyState = () => ({
    state: session.phase,
    attract: Boolean(attract?.running) && session.phase === 'LOBBY', // el host enseña una partida de fondo detrás del QR
    difficulty: session.difficulty, // 'stand' (feria) o 'pro'
    attractOn: attractEnabled, // el salvapantallas está activado (aunque ahora no se esté enseñando)
    slots: slots.occupancy(),
    maxPlayers,
    solo: session.solo, // hay un solo jugador (1 contra 3 bots): su Top 10 es aparte
    plan: session.plan, // modo que saldría con la gente de ahora: { kind: 'solo' | 'duel' | 'brawl', humans, bots, teams } o null (sección 58)
    // Iniciales de todos los tanques del plan (los humanos y luego los bots); sin plan, las de las plazas (2 en la pantalla de espera).
    initials: session.plan ? session.tankNames : slots.initials().slice(0, 2),
    ready: session.ready, // quién ha pulsado LISTO (P1, P2)
    cancelsLeft: session.cancelsLeft, // arcade (anyStart): cuántas veces más puede cancelar la cuenta atrás cada jugador (null en el resto)
    joinLeft: session.joinLeft, // segundos que faltan de la cuenta atrás de entrada (todos listos), o null
    requireEmail, // el mando pide el email antes de dejar jugar (stand)
    mapChoice: session.mapChoice, // 'random' o el mapa fijo elegido en el host
    map: session.mapIndex, // mapa de la próxima partida (o de la actual): el host cambia la ciudad si no es el que tiene
    // Se cuentan los sockets del espacio de nombres (no io.engine.clientsCount): al emitirse "disconnect" el socket ya
    // salió de esta lista, pero el contador del motor aún no se ha actualizado y quedaría desfasado en 1.
    connected: ns.sockets.size - hostCount(),
    room: online ? { code: room.code, type: room.type, solo: Boolean(room.solo), private: Boolean(room.private), auto: cfg.autoStartS != null, dev: Boolean(room.dev), screens: screenCount(), ...(publicRoom ? publicRoom.info() : {}), ...(votes ? { votes: votes.info() } : {}) } : null, // sala: su código, tipo y cuántas pantallas la están viendo (pública: anfitriona y marcador)
    // Versión pública: de cada plaza, si es un móvil o un mando ('phone' | 'pad') y a qué pantalla está vinculada (cada pantalla resalta su tanque).
    ...(publicMode ? { devices: slots.meta().map((m) => m?.device ?? null), screens: slots.meta().map((m) => m?.screen ?? null) } : {}),
  });
  const broadcastLobby = () => io.emit(EVENTS.LOBBY_STATE, lobbyState());
  const emitToSlot = (slot, event, payload) => {
    const socketId = slots.socketId(slot);
    if (socketId) io.to(socketId).emit(event, payload);
  };
  // Cada mando recibe lo suyo (vidas, tiempo y power-ups) unas 4 veces por segundo para su pantalla de juego. "volatile":
  // si un paquete se pierde, el siguiente lo corrige.
  let lastHudAt = 0;
  function sendPlayerHud(snapshot) {
    const now = Date.now();
    if (now - lastHudAt < config.playerHudIntervalMs) return;
    lastHudAt = now;
    for (let slot = 1; slot <= maxPlayers; slot++) {
      const socketId = slots.socketId(slot);
      if (socketId && snapshot.tanks[slot - 1]) io.to(socketId).volatile.emit(EVENTS.PLAYER_HUD, { lives: snapshot.tanks[slot - 1][3], timeLeft: snapshot.timeLeft, effects: snapshot.effects[slot - 1] });
    }
  }

  // Ranking: al terminar la partida se guardan las puntuaciones (si son mayores que 0) y se calcula la posición de
  // cada jugador. Si la base de datos falla, la partida y el resultado siguen su curso sin posición.
  let lastResult = null;
  async function saveResult(result, mode) {
    if (rankSolo) { // versión pública: solo puntúa en el ranking global el 1 contra 3 bots (el resto pica con el marcador de la sala)
      for (const s of result.scores) s.rank = null;
      const player = result.scores[0];
      if (mode === 'solo' && player && !player.bot && /^[A-Z]{3}$/.test(player.initials ?? '') && player.score > 0) {
        const won = (result.winners ?? []).includes(1);
        // La puntuación que ve el jugador es la del ranking (con el multiplicador de dificultad y el extra de rapidez).
        try { Object.assign(player, await rankSolo({ initials: player.initials, score: player.score, accuracy: player.accuracy, difficulty: session.difficulty, won, elapsed: result.elapsed })); } catch (err) { console.error('No se pudo guardar en el ranking global:', err.message); }
      }
      return;
    }
    if (!saveRanking) { for (const s of result.scores) s.rank = null; return; }
    const saved = [];
    for (const s of result.scores) {
      s.rank = null;
      if (s.bot || s.tni || !s.initials || s.score <= 0) continue; // los bots no entran en el ranking; el tanque chetado de TNI tampoco (sección 88)
      if (!/^[A-Z]{3}$/.test(s.initials)) continue; // los mandos físicos (MANDO1...) tampoco: no identifican a ninguna persona
      try {
        await board.insert({ initials: s.initials, accuracy: s.accuracy, score: s.score, mode });
        saved.push(s);
      } catch (err) {
        console.error('No se pudo guardar la puntuación:', err);
      }
    }
    for (const s of saved) { // las posiciones se calculan cuando ya están guardadas las dos puntuaciones
      try { s.rank = await board.rankOf(s.score); } catch (err) { console.error('No se pudo calcular la posición:', err); }
    }
  }
  async function sendTop(emitter) {
    try {
      if (sendRanking) { await sendRanking(emitter); return; } // versión pública: ranking global (hoy, semana, histórico)
      // Un único Top 10 de todos los modos (sección 70).
      if (!saveRanking) { emitter.emit(EVENTS.LEADERBOARD_UPDATE, { top: [] }); return; }
      emitter.emit(EVENTS.LEADERBOARD_UPDATE, { top: await board.top(config.leaderboardSize) });
    } catch (err) {
      console.error('No se pudo leer el ranking:', err);
    }
  }
  // Enlace de la pantalla final de cada jugador, con su resultado (solo para mostrarlo: no afecta a nada).
  function endUrlFor(slot) {
    const s = lastResult?.scores[slot - 1];
    if (!s) return config.endPath;
    const winners = lastResult.winners ?? (lastResult.winner === null ? [] : [lastResult.winner]);
    const outcome = winners.length === 0 ? 'd' : winners.includes(slot) ? 'w' : 'l'; // con equipos ganan los dos compañeros
    const query = new URLSearchParams({
      i: s.initials ?? '', s: String(s.score), r: s.rank === null ? '' : String(s.rank),
      l: String(s.lives), a: String(s.accuracy), o: outcome, p: String(slot),
    });
    return `${config.endPath}?${query}`;
  }

  // La sesión no conoce los sockets: todo lo que ocurre en la partida sale por estas funciones.
  session = createSession({
    arena,
    arenas,
    cfg,
    rng,
    maxPlayers,
    dynamic,
    out: {
      phase: () => broadcastLobby(),
      countdown: (seconds) => io.emit(EVENTS.COUNTDOWN, { seconds }),
      pause: (state) => io.emit(EVENTS.PAUSE_STATE, state), // versión pública: la partida está (o deja de estar) en pausa
      // Sin "volatile": probado con el host en el mismo portátil, Socket.io descartaba ~28 % de los estados cuando
      // coincidían con otros mensajes (rebotes, disparos), y la interpolación se veía a tirones. El host está en
      // localhost, así que no hay riesgo de que se acumulen.
      state: (snapshot) => { io.to('host').emit(EVENTS.STATE_UPDATE, snapshot); sendPlayerHud(snapshot); },
      events: (list) => {
        for (const event of list) {
          io.to('host').emit(EVENTS.MATCH_EVENT, event);
          // El mando del herido vibra y enseña su animación de vida perdida (con las vidas que le quedan).
          if (event.type === 'hit') emitToSlot(event.slot, EVENTS.MATCH_EVENT, { type: 'hit', lives: event.lives });
          if (event.type === 'powerup_pick') emitToSlot(event.slot, EVENTS.MATCH_EVENT, { type: 'powerup_pick', powerup: event.powerup });
          if (event.type === 'match_over') for (let slot = 1; slot <= maxPlayers; slot++) emitToSlot(slot, EVENTS.MATCH_EVENT, { type: 'match_over', winner: event.winner, winners: event.winners, winnerNames: event.winnerNames, reason: event.reason });
          // El mando que hizo dash recibe cuánto tarda en volver a estar disponible, para mostrarlo en el botón.
          if (event.type === 'dash') emitToSlot(event.slot, EVENTS.MATCH_EVENT, { type: 'dash', cooldown: event.cooldown });
        }
      },
      gameOver: (result) => {
        lastResult = result;
        if (publicRoom && result.reason !== 'forfeit') publicRoom.recordResult(result); // marcador de la sala (un abandono no cuenta)
        saveResult(result, session.solo ? 'solo' : 'multi')
          .then(() => { io.emit(EVENTS.GAME_OVER, result); return sendTop(io.to('host')); })
          .catch((err) => console.error('Error al cerrar la partida:', err));
      },
      // Versión pública: sin redirección a /end (los jugadores siguen en la sala para la revancha; el mando lleva un botón "SOBRE DOERS").
      redirect: () => { if (publicMode) return; for (let slot = 1; slot <= maxPlayers; slot++) emitToSlot(slot, EVENTS.REDIRECT, { url: endUrlFor(slot) }); },
      finished: () => {
        if (publicMode) { // revancha: se quedan todos los que siguen conectados (los demás dejan su plaza) y vuelven a pulsar LISTO
          for (const id of slots.socketIds()) if (!ns.sockets.has(id)) slots.release(id);
          for (const moved of slots.compact()) io.to(moved.socketId).emit(EVENTS.SLOT_ASSIGNED, { slot: moved.slot, initials: moved.initials });
          session.setPlayers(slots.initials());
        } else slots.clear(); // stand: todas las plazas quedan libres para los siguientes
        broadcastLobby();
      },
    },
  });
  if (publicMode) publicRoom = createPublicRoom({ room, ns, changed: () => broadcastLobby(), promoteMs: cfg.hostPromoteMs }); // hostPromoteMs: solo los tests lo acortan

  // Salvapantallas: mientras la sesión está en LOBBY, hay un host conectado y está activado, dos bots juegan de fondo (su
  // estado solo lo ve el host y no ocupa plazas). Se engancha al tick de la sesión para no tocar el bucle de app.js.
  attract = createAttract({
    getArena: () => session.arena, // la partida de fondo usa el mapa que toca
    cfg,
    rng,
    out: {
      state: (snapshot) => io.to('host').emit(EVENTS.STATE_UPDATE, snapshot),
      events: (list) => { for (const event of list) io.to('host').emit(EVENTS.MATCH_EVENT, event); },
    },
  });
  const sessionTick = session.tick;
  session.tick = (dt) => {
    sessionTick(dt);
    // Mando mudo (conexión muerta que el servidor aún no ha detectado): su tanque se para en vez de seguir con la última dirección.
    if (session.phase === 'PLAYING') {
      const now = Date.now();
      for (let slot = 1; slot <= maxPlayers; slot++) {
        const seenAt = ns.sockets.get(slots.socketId(slot))?.data.lastSeen;
        if (seenAt && now - seenAt > config.inputStallMs) session.setMove(slot, 0, 0);
      }
    }
    const wanted = attractEnabled && session.phase === 'LOBBY' && hostCount() > 0;
    if (wanted !== attract.running) {
      if (wanted) attract.start(); else attract.stop();
      broadcastLobby(); // el host sabe así si debe enseñar la partida de fondo o limpiarla
    }
    attract.tick(dt);
  };

  // Si hay demasiadas conexiones se rechazan las nuevas: un aluvión de escaneos no debe tumbar el servidor.
  io.use((_socket, next) => {
    if (ns.server.engine.clientsCount > config.maxSockets) return next(new Error('server_busy'));
    if (online && ns.sockets.size >= config.maxSocketsPerRoom) return next(new Error('room_busy')); // sala llena de conexiones
    next();
  });

  io.on('connection', (socket) => {
    let lastJoinAt = 0;
    let idleTimer = null;

    // Inundación: un socket que manda demasiados eventos por segundo se corta (un mando de verdad manda unos 130).
    let windowStart = Date.now();
    let seen = 0;
    socket.use((_packet, next) => {
      const now = Date.now();
      socket.data.lastSeen = now; // cualquier paquete del mando cuenta como señal de vida (ver el control de mandos mudos)
      if (now - windowStart >= 1000) { windowStart = now; seen = 0; }
      if (++seen > config.maxEventsPerSecond) { socket.disconnect(true); return; }
      next();
    });

    // Un móvil sin plaza que no hace nada se desconecta pasado un tiempo (no acumula estado).
    const startIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => socket.disconnect(true), config.idleSocketMs);
    };
    startIdleTimer();

    // El recién llegado recibe el estado y los hosts se enteran del nuevo mando; los demás mandos no necesitan nada
    // (antes se reenviaba a todos y, con cada escaneo, se repetía hasta 3 veces seguidas).
    socket.emit(EVENTS.LOBBY_STATE, lobbyState());
    io.to('host').emit(EVENTS.LOBBY_STATE, lobbyState());

    // Un fallo dentro de un handler nunca debe tumbar el servidor (AGENTS.md, sección 9).
    socket.on(EVENTS.HOST_JOIN, (payload) => {
      try {
        if (!canHostSocket(socket)) {
          socket.emit(EVENTS.ERROR_MSG, { code: 'host_forbidden', message: online ? 'Hace falta la contraseña de acceso' : 'El host solo puede abrirse en el portátil del stand' });
          return;
        }
        if (online) hostScreens.add(socket.id); // una sala admite varias pantallas: todas enseñan el mismo QR y la misma partida
        clearTimeout(idleTimer);
        socket.join('host');
        publicRoom?.join(socket, payload); // versión pública: identifica la pantalla y, con su llave, la hace anfitriona
        broadcastLobby(); // el contador de mandos cambia al registrarse un host
        sendTop(socket);  // el host recibe el Top 10 al conectarse
      } catch (err) {
        console.error('host_join falló:', err);
      }
    });

    // Reset global (tecla R mantenida en el host): solo lo acepta un socket registrado como host.
    socket.on(EVENTS.HARD_RESET, () => {
      try {
        if (!socket.rooms.has('host') || !mayReset(socket)) return;
        performHardReset(ns, slots, session);
        broadcastLobby();
      } catch (err) {
        console.error('hard_reset falló:', err);
      }
    });

    // REINICIO TOTAL de emergencia (R mantenida 3 s en el host; sección 64): todo vuelve a empezar como recién arrancado. Partida, animaciones del host, plazas y
    // mandos (se les expulsa), ajustes que se tocan desde el menú (mapa fijo, dificultad, salvapantallas), y en el stand también el túnel de
    // Cloudflare (nueva URL, nuevo QR). Todas las pantallas de la sala recargan su página para empezar de cero (eso reinicia animaciones, audio y sockets).
    // Menú del host (stand): solo el túnel, sin tocar la partida (útil si el QR deja de funcionar). La pantalla repinta el QR sola al tener la URL nueva.
    socket.on(EVENTS.TUNNEL_RESTART, () => {
      try {
        if (online || !socket.rooms.has('host') || !debugOk(socket)) return;
        console.warn('Túnel: reinicio pedido desde el menú del host');
        restartTunnel();
      } catch (err) {
        console.error('tunnel_restart falló:', err);
      }
    });

    socket.on(EVENTS.EMERGENCY_RESET, () => {
      try {
        if (!socket.rooms.has('host') || !mayReset(socket)) return; // versión pública: solo la anfitriona reinicia la sala (en la partida pública, nadie)
        console.warn(`REINICIO TOTAL pedido desde una pantalla${room ? ` de la sala ${room.code}` : ' del stand'}`);
        performHardReset(ns, slots, session);
        session.setMapChoice('random');
        session.setDifficulty(cfg.difficulty ?? config.game.difficulty);
        publicRoom?.reset(); // el marcador de la sala vuelve a cero
        attractEnabled = allowDebug === true && config.attractDefault;
        attract.stop();
        if (!online) restartTunnel(); // en una sala online no hay túnel: la plataforma ya tiene su URL
        io.to('host').emit(EVENTS.EMERGENCY_RELOAD, {});
        broadcastLobby();
      } catch (err) {
        console.error('emergency_reset falló:', err);
        try { io.to('host').emit(EVENTS.EMERGENCY_RELOAD, {}); } catch { /* aun así, que la pantalla se recargue */ }
      }
    });

    // TEMPORAL (menú de pruebas): el host borra todo el Top 10 y deja el ranking de ejemplo (el host ya pide confirmación).
    socket.on(EVENTS.LEADERBOARD_RESET, async () => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        const { initials, score, accuracy, count } = config.leaderboardSample;
        const entries = Array.from({ length: count }, () => ({ initials, score, accuracy }));
        await board.reset(entries);
        await sendTop(io.to('host'));
      } catch (err) {
        console.error('leaderboard_reset falló:', err);
      }
    });

    // Cambio de modo: el botón del host bajo el QR alterna multijugador y solitario (1 contra 3 bots). Para el solitario
    // puede haber como mucho un jugador en la sala (si estaba en P2, pasa a P1).
    // LISTO desde el mando: cuando todos los jugadores necesarios lo han pulsado, empieza la cuenta atrás.
    socket.on(EVENTS.PLAYER_READY, () => {
      try {
        const entry = slots.get(socket.id);
        if (entry && session.setReady(entry.slot)) broadcastLobby();
      } catch (err) {
        console.error('player_ready falló:', err);
      }
    });

    // Versión pública: un jugador cambia su nombre en la sala de espera (pantalla propia: EDITAR en su ficha; mando: estilo recreativa).
    if (publicMode) registerPauseHandlers(socket, { slots, session, room, releaseSlot, broadcastLobby }); // pausa y SALIR

    socket.on(EVENTS.PLAYER_RENAME, (payload) => {
      try {
        if (!publicMode || session.phase !== 'LOBBY') return;
        const entry = slots.get(socket.id);
        const name = entry && parseInitials(payload?.initials, config.blockedInitials);
        if (!name) { if (entry) socket.emit(EVENTS.ERROR_MSG, { code: 'invalid_initials', message: 'Escribe 3 letras (A-Z)' }); return; }
        const renamed = slots.rename(socket.id, name);
        if (renamed && session.rename(renamed.slot, name)) {
          socket.emit(EVENTS.SLOT_ASSIGNED, renamed);
          broadcastLobby();
        }
      } catch (err) {
        console.error('player_rename falló:', err);
      }
    });

    // Salvapantallas (partida de bots tras el QR): lo activa o desactiva el host desde su menú.
    socket.on(EVENTS.MAP_SELECT, (payload) => {
      try {
        if (votes && socket.rooms.has('host') && !debugOk(socket)) { // partida pública: es un voto (solo en la sala de espera)
          if (session.phase !== 'LOBBY') return;
          const choice = votes.vote(socket.id, 'map', payload?.choice);
          if (choice !== null) { session.setMapChoice(choice); broadcastLobby(); }
          return;
        }
        if (!socket.rooms.has('host') || !mayManage(socket)) return;
        if (payload?.reroll === true) { session.rerollMap(); broadcastLobby(); return; } // iniciar un test: respeta lo elegido
        if (session.setMapChoice(payload?.choice)) broadcastLobby();
      } catch (err) {
        console.error('map_select falló:', err);
      }
    });

    socket.on(EVENTS.DIFFICULTY_SET, (payload) => {
      try {
        if (votes && socket.rooms.has('host') && !debugOk(socket)) { // partida pública: es un voto
          if (session.phase !== 'LOBBY') return;
          const level = votes.vote(socket.id, 'level', payload?.level);
          if (level !== null) { session.setDifficulty(level); broadcastLobby(); }
          return;
        }
        if (!socket.rooms.has('host') || !(publicMode ? mayManage(socket) : debugOk(socket))) return; // pública: la anfitriona elige FÁCIL / MEDIA / PRO
        if (session.setDifficulty(payload?.level)) broadcastLobby();
      } catch (err) {
        console.error('difficulty_set falló:', err);
      }
    });

    socket.on(EVENTS.ATTRACT_SET, (payload) => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        attractEnabled = payload?.on === true;
        broadcastLobby();
      } catch (err) {
        console.error('attract_set falló:', err);
      }
    });

    // TEMPORAL (menú de test, sección 28b): el host acaba la partida por tiempo para ver las pantallas finales.
    socket.on(EVENTS.DEBUG_END_TIME, () => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        session.expireTime();
      } catch (err) {
        console.error('debug_end_time falló:', err);
      }
    });

    // Un móvil pide plaza con sus iniciales. Responde slot_assigned, room_full o error_msg.
    socket.on(EVENTS.JOIN_ROOM, (payload) => {
      try {
        if (socket.rooms.has('host')) return;
        const now = Date.now();
        if (now - lastJoinAt < config.joinCooldownMs) return; // anti-spam de reintentos
        lastJoinAt = now;
        startIdleTimer();

        const existing = slots.get(socket.id);
        if (existing) {
          socket.emit(EVENTS.SLOT_ASSIGNED, existing);
          return;
        }
        if (payload?.role !== 'player') {
          socket.emit(EVENTS.ERROR_MSG, { code: 'invalid_role', message: 'Rol no válido' });
          return;
        }
        // Reconexión: un mando al que se le cortó la conexión (4G, pantalla bloqueada...) recupera su plaza con su token,
        // aunque el servidor aún no haya notado la caída del socket viejo.
        const token = parseToken(payload.token);
        const resumed = slots.rebind(token, socket.id);
        if (resumed) {
          clearTimeout(idleTimer);
          ns.sockets.get(resumed.oldSocketId)?.disconnect(true);
          // Versión pública: el relevo puede ser de dispositivo (el móvil coge la plaza del teclado de la partida rápida, o el teclado la recupera).
          if (publicMode) slots.setDevice(socket.id, payload.gamepad === true ? 'pad' : payload.keyboard === true ? 'keyboard' : 'phone');
          session.playerReconnected(resumed.slot);
          socket.emit(EVENTS.SLOT_ASSIGNED, { slot: resumed.slot, initials: resumed.initials });
          broadcastLobby();
          return;
        }
        // Mando físico enchufado a la pantalla del juego (sección 72): entra con su nombre (MANDO1, MANDO2...) en vez de 3 letras y sin email.
        // Solo lo puede pedir quien puede ser pantalla (el propio portátil del stand o, online, quien tiene la cookie de acceso).
        const gamepad = payload.gamepad === true;
        if (gamepad && !canHostSocket(socket)) {
          socket.emit(EVENTS.ERROR_MSG, { code: 'gamepad_forbidden', message: 'Los mandos físicos solo valen en la pantalla del juego' });
          return;
        }
        // Mandos: "MANDO1".. (stand) o, en la versión pública, un nombre de 3 letras (al azar y editable).
        const initials = gamepad ? (parseGamepadName(payload.name) ?? parseInitials(payload.name, config.blockedInitials)) : parseInitials(payload.initials, config.blockedInitials);
        if (!initials) {
          socket.emit(EVENTS.ERROR_MSG, { code: 'invalid_initials', message: 'Escribe 3 letras (A-Z)' });
          return;
        }
        // En el stand el email es obligatorio para entrar (con el consentimiento marcado). Los bots de prueba del propio portátil
        // entran con un email @test.invalid, que no se guarda ni vale desde un móvil.
        let email = null;
        if (requireEmail && !gamepad) {
          email = parseEmail(payload.email);
          const test = email !== null && isTestEmail(email);
          // El email de prueba (@test.invalid) solo vale desde el propio portátil o, en una sala online, desde un host con el rol dev (sus bots de prueba).
          const mayTest = isLocalRequest(socket.handshake.address, socket.handshake.headers) || (online && debugOk(socket));
          if (!email || (test && !mayTest)) {
            socket.emit(EVENTS.ERROR_MSG, { code: 'invalid_email', message: 'Escribe un email válido' });
            return;
          }
          if (!test && payload.consent !== true) {
            socket.emit(EVENTS.ERROR_MSG, { code: 'consent_required', message: 'Acepta el aviso para poder jugar' });
            return;
          }
          if (test) email = null;
          // Todo email válido con consentimiento se guarda YA, aunque luego no haya plaza (sección 78). Si falla el guardado, juega igual.
          if (email && contacts) contacts.save({ email, initials, consent: config.consentVersion, played: false }).catch((err) => console.error('No se pudo guardar el contacto:', err.message));
        }
        if (session.phase !== 'LOBBY') { // durante la presentación de los tanques (READY) o la partida no entra nadie
          socket.emit(EVENTS.ROOM_FULL, {});
          return;
        }
        // Versión pública: móvil o mando, y la pantalla cuyo QR escaneó (o a la que está enchufado el mando).
        // 'keyboard' = teclado y ratón de la propia pantalla (partida rápida).
        const meta = publicMode ? { device: gamepad ? 'pad' : payload.keyboard === true ? 'keyboard' : 'phone', screen: parseScreenId(payload.screen) } : null;
        const assigned = slots.assign(socket.id, initials, null, token, meta);
        if (!assigned) {
          socket.emit(EVENTS.ROOM_FULL, {});
          return;
        }
        clearTimeout(idleTimer); // con plaza, el control de inactividad lo lleva el ping de Socket.io
        if (room?.pending?.length) room.pending.shift(); // cola común: el hueco reservado ya está ocupado
        // Con plaza: se suma una partida a su contacto (ya estaba guardado al validar el email).
        if (email && contacts) contacts.save({ email, initials, consent: config.consentVersion, played: true }).catch((err) => console.error('No se pudo guardar el contacto:', err.message));
        socket.emit(EVENTS.SLOT_ASSIGNED, assigned);
        session.setPlayers(slots.initials()); // con las 2 plazas llenas empieza la cuenta atrás
        broadcastLobby();
      } catch (err) {
        console.error('join_room falló:', err);
      }
    });

    // Mandos: el movimiento y el apuntado llegan como estado actual (no como cambios), así que un paquete
    // perdido se corrige con el siguiente. Cada manejador es muy barato, por eso no hace falta limitarlos.
    // Paquete compacto (sección 63): movimiento y apuntado juntos.
    socket.on(EVENTS.PAD, (payload) => {
      try {
        const entry = slots.get(socket.id);
        const pad = entry && parsePad(payload);
        if (!pad) return;
        session.setMove(entry.slot, pad.x, pad.y);
        if (pad.angle !== null) session.setAim(entry.slot, pad.angle);
      } catch (err) {
        console.error('pad falló:', err);
      }
    });
    socket.on(EVENTS.PAD_MOVE, (payload) => {
      try {
        const entry = slots.get(socket.id);
        const move = entry && parsePadMove(payload);
        if (move) session.setMove(entry.slot, move.x, move.y);
      } catch (err) {
        console.error('pad_move falló:', err);
      }
    });
    socket.on(EVENTS.PAD_AIM, (payload) => {
      try {
        const entry = slots.get(socket.id);
        const angle = entry ? parseAim(payload) : null;
        if (angle !== null) session.setAim(entry.slot, angle);
      } catch (err) {
        console.error('pad_aim falló:', err);
      }
    });
    socket.on(EVENTS.FIRE, (payload) => {
      try {
        const entry = slots.get(socket.id);
        if (!entry) return;
        const angle = parseFireAngle(payload); // el disparo puede llevar su ángulo definitivo (así no hace falta un "pad_aim" aparte)
        if (angle !== null) session.setAim(entry.slot, angle);
        session.fire(entry.slot); // la cadencia la controla la partida
      } catch (err) {
        console.error('fire falló:', err);
      }
    });

    socket.on(EVENTS.DASH, () => {
      try {
        const entry = slots.get(socket.id);
        if (entry) session.dash(entry.slot); // el tiempo de espera lo controla la partida
      } catch (err) {
        console.error('dash falló:', err);
      }
    });

    // Medición de latencia: el cliente manda el evento y el servidor responde con el "ack" (callback).
    socket.on(EVENTS.LATENCY_PING, (_payload, ack) => {
      if (typeof ack === 'function') ack();
    });

    // El mando mide su ping y lo cuenta; el servidor lo reenvía al host con el número de jugador (solo informativo).
    socket.on(EVENTS.PING_REPORT, (payload) => {
      try {
        const entry = slots.get(socket.id);
        const ms = Number(payload?.ms);
        if (entry && Number.isFinite(ms) && ms >= 0 && ms < 60000) {
          io.to('host').emit(EVENTS.PLAYER_PING, { slot: entry.slot, ms: Math.round(ms) });
        }
      } catch (err) {
        console.error('ping_report falló:', err);
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(idleTimer);
      hostScreens.delete(socket.id);
      publicRoom?.leave(socket); // si era la anfitriona, otra pantalla lo será si no vuelve pronto
      const after = votes?.forget(socket.id); // su voto deja de contar (solo se aplica en la sala de espera)
      if (after && session.phase === 'LOBBY') { session.setMapChoice(after.map); session.setDifficulty(after.level); }
      const entry = slots.get(socket.id);
      if (entry && session.phase === 'PLAYING') {
        session.playerDisconnected(entry.slot); // la plaza queda reservada: si no vuelve, pierde por abandono
      } else if (entry && session.phase === 'GAME_OVER') {
        // la plaza se libera sola al terminar la pantalla de resultados
      } else if (entry && (session.phase === 'LOBBY' || session.phase === 'READY') && slots.hasToken(socket.id)) {
        // Corte breve en el lobby o en la presentación (red saturada de la feria): la plaza y su LISTO se guardan lobbyGraceS. Si el mando vuelve con
        // su token (rebind), sigue como estaba: la cuenta atrás no se reinicia y la presentación no se cancela para todos (medido con net-sim
        // "saturada": un corte en los 5 s de la presentación devolvía a todos al lobby una y otra vez). Si no vuelve, se libera como siempre (o, si
        // ya empezó la partida, cuenta como desconectado y pierde por abandono a los 10 s).
        const oldId = socket.id;
        const settle = () => {
          const still = slots.get(oldId);
          if (!still) return; // volvió (su plaza ya es de su socket nuevo) o la sesión se reinició
          if (session.phase === 'LOBBY') { releaseSlot(oldId); broadcastLobby(); }
          else if (session.phase === 'READY') setTimeout(settle, 500); // la presentación ya empezó: se espera a la partida
          else if (session.phase === 'PLAYING') session.playerDisconnected(still.slot);
        };
        setTimeout(settle, (cfg.lobbyGraceS ?? 6) * 1000);
      } else if (entry) {
        releaseSlot(socket.id); // en el lobby (sin token) o en la cuenta atrás la plaza se libera al instante
      } // sin plaza (p. ej. la conexión vieja de un mando que ya recuperó su plaza con otra): no se toca nada; antes avisaba a la sesión y cancelaba la presentación
      broadcastLobby();
    });
  });

  // Libera la plaza de un socket y corre a los demás a P1..Pn (su mando cambia de color).
  function releaseSlot(socketId) {
    slots.release(socketId);
    for (const moved of slots.compact()) io.to(moved.socketId).emit(EVENTS.SLOT_ASSIGNED, { slot: moved.slot, initials: moved.initials });
    session.setPlayers(slots.initials());
  }

  if (publicRoom) session.dispose = () => publicRoom.dispose(); // al cerrar la sala (rooms.destroy)
  return session;
}
