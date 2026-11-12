// Registra los eventos de Socket.io de una sala y conecta la red con su sesión de juego.
// Solo gestiona la red: las reglas del juego están en server/game/. Devuelve la sesión para que app.js la haga avanzar.
// En cada sala hay dos tipos de socket por jugador: su PANTALLA (host_join: recibe la partida) y su TECLADO (join_room: ocupa la plaza y manda
// los controles). Qué NO hace: no decide reglas (session.js) ni crea salas (rooms.js, online.js).
import { EVENTS } from '../../shared/events.js';
import { createSession } from '../game/session.js';
import { config } from '../config.js';
import { parseInitials, parsePadMove, parseAim, parsePad, parseFireAngle, parseToken, parseScreenId } from './validate.js';
import { performHardReset } from './hardReset.js';
import { registerPauseHandlers } from './pauseHandlers.js';
import { claimReservation } from './rooms.js';

// ns = el espacio de nombres de la sala; room = { code, dev, pending... } (rooms.js).
// allowDebug(socket) = la pantalla está en modo desarrollador (menú de pruebas: elegir mapa y dificultad, acabar el tiempo, reiniciar la sala).
export function registerSockets(ns, slots, { arena, arenas = [arena], cfg, rng, room, allowDebug = () => false }) {
  const debugOk = (socket) => Boolean(allowDebug(socket));
  // Pantallas de la sala (cada jugador abre la suya): todas ven la misma partida.
  const hostScreens = new Set();
  const screenCount = () => { for (const id of hostScreens) if (!ns.sockets.has(id)) hostScreens.delete(id); return hostScreens.size; };
  room.screens = screenCount;
  // "connected" cuenta solo los sockets de jugador: se restan los que se han registrado como pantalla.
  const hostCount = () => ns.adapter.rooms.get('host')?.size ?? 0;
  let session; // se crea más abajo; las funciones de aquí solo la usan cuando ya existe
  const lobbyState = () => ({
    state: session.phase,
    difficulty: session.difficulty, // 'stand' (FÁCIL), 'media' o 'pro': solo la cambia el modo dev
    slots: slots.occupancy(),
    maxPlayers: slots.max,
    solo: session.solo, // hay un solo jugador (1 contra 3 bots)
    plan: session.plan, // modo que saldría con la gente de ahora: { kind: 'solo' | 'duel' | 'brawl', humans, bots, teams } o null
    // Iniciales de todos los tanques del plan (los humanos y luego los bots); sin plan, las de las plazas.
    initials: session.plan ? session.tankNames : slots.initials().slice(0, 2),
    cancelsLeft: session.cancelsLeft, // cuántas veces más puede cancelar la cuenta atrás cada jugador
    joinLeft: session.joinLeft, // segundos que faltan de la cuenta atrás de JUGAR, o null
    mapChoice: session.mapChoice, // 'random' o el mapa fijo elegido por el modo dev
    map: session.mapIndex, // mapa de la próxima partida (o de la actual): la pantalla cambia la ciudad si no es el que tiene
    // Se cuentan los sockets del espacio de nombres (no io.engine.clientsCount): al emitirse "disconnect" el socket ya salió de esta lista,
    // pero el contador del motor aún no se ha actualizado y quedaría desfasado en 1.
    connected: ns.sockets.size - hostCount(),
    room: { code: room.code, dev: Boolean(room.dev), screens: screenCount() },
    // De cada plaza, con qué juega ('keyboard' = teclado y ratón de su pantalla) y a qué pantalla pertenece (cada pantalla resalta su tanque: TÚ).
    devices: slots.meta().map((m) => m?.device ?? null),
    screens: slots.meta().map((m) => m?.screen ?? null),
  });
  const broadcastLobby = () => ns.emit(EVENTS.LOBBY_STATE, lobbyState());

  // La sesión no conoce los sockets: todo lo que ocurre en la partida sale por estas funciones.
  session = createSession({
    arena,
    arenas,
    cfg,
    rng,
    maxPlayers: slots.max,
    out: {
      phase: () => broadcastLobby(),
      countdown: (seconds) => ns.emit(EVENTS.COUNTDOWN, { seconds }),
      pause: (state) => ns.emit(EVENTS.PAUSE_STATE, state), // la partida está (o deja de estar) en pausa
      state: (snapshot) => ns.to('host').emit(EVENTS.STATE_UPDATE, snapshot),
      events: (list) => { for (const event of list) ns.to('host').emit(EVENTS.MATCH_EVENT, event); },
      gameOver: (result) => ns.emit(EVENTS.GAME_OVER, result),
      // Fin de los resultados: se quedan en la sala todos los que siguen conectados (los demás dejan su plaza) y vuelven a pulsar JUGAR.
      finished: () => {
        for (const id of slots.socketIds()) if (!ns.sockets.has(id)) slots.release(id);
        for (const moved of slots.compact()) ns.to(moved.socketId).emit(EVENTS.SLOT_ASSIGNED, { slot: moved.slot, initials: moved.initials });
        session.setPlayers(slots.initials());
        broadcastLobby();
      },
    },
  });

  // Jugador mudo (conexión muerta que el servidor aún no ha detectado): su tanque se para en vez de seguir con la última dirección.
  const sessionTick = session.tick;
  session.tick = (dt) => {
    sessionTick(dt);
    if (session.phase !== 'PLAYING') return;
    const now = Date.now();
    for (let slot = 1; slot <= slots.max; slot++) {
      const seenAt = ns.sockets.get(slots.socketId(slot))?.data.lastSeen;
      if (seenAt && now - seenAt > config.inputStallMs) session.setMove(slot, 0, 0);
    }
  };

  // Si hay demasiadas conexiones se rechazan las nuevas: un aluvión de conexiones no debe tumbar el servidor.
  ns.use((_socket, next) => {
    if (ns.server.engine.clientsCount > config.maxSockets) return next(new Error('server_busy'));
    if (ns.sockets.size >= config.maxSocketsPerRoom) return next(new Error('room_busy')); // sala llena de conexiones
    next();
  });

  ns.on('connection', (socket) => {
    let lastJoinAt = 0;
    let idleTimer = null;

    // Inundación: un socket que manda demasiados eventos por segundo se corta (un jugador de verdad manda unos 130).
    let windowStart = Date.now();
    let seen = 0;
    socket.use((_packet, next) => {
      const now = Date.now();
      socket.data.lastSeen = now; // cualquier paquete cuenta como señal de vida (ver el control de jugadores mudos)
      if (now - windowStart >= 1000) { windowStart = now; seen = 0; }
      if (++seen > config.maxEventsPerSecond) { socket.disconnect(true); return; }
      next();
    });

    // Un socket sin plaza que no hace nada se desconecta pasado un tiempo (no acumula estado).
    const startIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => socket.disconnect(true), config.idleSocketMs);
    };
    startIdleTimer();

    // El recién llegado recibe el estado y las pantallas se enteran de la nueva conexión.
    socket.emit(EVENTS.LOBBY_STATE, lobbyState());
    ns.to('host').emit(EVENTS.LOBBY_STATE, lobbyState());

    // Un fallo dentro de un manejador nunca debe tumbar el servidor.
    socket.on(EVENTS.HOST_JOIN, () => {
      try {
        hostScreens.add(socket.id);
        clearTimeout(idleTimer);
        socket.join('host');
        broadcastLobby(); // el contador de jugadores cambia al registrarse una pantalla
      } catch (err) {
        console.error('host_join falló:', err);
      }
    });

    // Menú de pruebas del modo dev: reinicia la sala (expulsa a los jugadores y vuelve a la sala de espera).
    socket.on(EVENTS.HARD_RESET, () => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        performHardReset(ns, slots, session);
        broadcastLobby();
      } catch (err) {
        console.error('hard_reset falló:', err);
      }
    });

    // JUGAR / CANCELAR de la sala de espera.
    socket.on(EVENTS.PLAYER_READY, () => {
      try {
        const entry = slots.get(socket.id);
        if (entry && session.setReady(entry.slot)) broadcastLobby();
      } catch (err) {
        console.error('player_ready falló:', err);
      }
    });

    registerPauseHandlers(socket, { slots, session, releaseSlot, broadcastLobby }); // pausa y SALIR

    // Un jugador cambia su nombre en la sala de espera (EDITAR en su ficha o el nombre que el servidor no aceptó al entrar).
    socket.on(EVENTS.PLAYER_RENAME, (payload) => {
      try {
        if (session.phase !== 'LOBBY') return;
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

    // Modo dev: mapa de la próxima partida ({ choice: 'random' | índice }) o, al iniciar un test, sortearlo ya ({ reroll: true }).
    socket.on(EVENTS.MAP_SELECT, (payload) => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        if (payload?.reroll === true) { session.rerollMap(); broadcastLobby(); return; }
        if (session.setMapChoice(payload?.choice)) broadcastLobby();
      } catch (err) {
        console.error('map_select falló:', err);
      }
    });

    // Modo dev: dificultad de los bots (FÁCIL / MEDIA / PRO).
    socket.on(EVENTS.DIFFICULTY_SET, (payload) => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        if (session.setDifficulty(payload?.level)) broadcastLobby();
      } catch (err) {
        console.error('difficulty_set falló:', err);
      }
    });

    // Modo dev: acaba la partida por tiempo para ver las pantallas finales.
    socket.on(EVENTS.DEBUG_END_TIME, () => {
      try {
        if (!socket.rooms.has('host') || !debugOk(socket)) return;
        session.expireTime();
      } catch (err) {
        console.error('debug_end_time falló:', err);
      }
    });

    // El teclado de una pantalla (o un bot de prueba del modo dev) pide plaza con sus iniciales. Responde slot_assigned, room_full o error_msg.
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
        const device = payload.keyboard === true ? 'keyboard' : 'phone'; // 'phone': los bots de prueba del modo dev
        // Reconexión: un jugador al que se le cortó la conexión recupera su plaza con su token, aunque el servidor aún no haya notado la caída
        // del socket viejo (una segunda pestaña con el mismo token se queda la plaza y la primera deja de jugar).
        const token = parseToken(payload.token);
        const resumed = slots.rebind(token, socket.id);
        if (resumed) {
          clearTimeout(idleTimer);
          ns.sockets.get(resumed.oldSocketId)?.disconnect(true);
          slots.setDevice(socket.id, device);
          session.playerReconnected(resumed.slot);
          claimReservation(room, token); // recargó y volvió a pedir sala: su reserva (solo la suya) ya no hace falta
          socket.emit(EVENTS.SLOT_ASSIGNED, { slot: resumed.slot, initials: resumed.initials });
          broadcastLobby();
          return;
        }
        const initials = parseInitials(payload.initials, config.blockedInitials);
        if (!initials) {
          socket.emit(EVENTS.ERROR_MSG, { code: 'invalid_initials', message: 'Escribe 3 letras (A-Z)' });
          return;
        }
        if (session.phase !== 'LOBBY') { // durante la presentación de los tanques (READY) o la partida no entra nadie
          socket.emit(EVENTS.ROOM_FULL, {});
          return;
        }
        const assigned = slots.assign(socket.id, initials, token, { device, screen: parseScreenId(payload.screen) });
        if (!assigned) {
          socket.emit(EVENTS.ROOM_FULL, {});
          return;
        }
        clearTimeout(idleTimer); // con plaza, el control de inactividad lo lleva el ping de Socket.io
        claimReservation(room, token, { fresh: true }); // cola común: su hueco reservado ya está ocupado
        socket.emit(EVENTS.SLOT_ASSIGNED, assigned);
        session.setPlayers(slots.initials());
        broadcastLobby();
      } catch (err) {
        console.error('join_room falló:', err);
      }
    });

    // Controles: el movimiento y el apuntado llegan como estado actual (no como cambios), así que un paquete perdido se corrige con el
    // siguiente. Cada manejador es muy barato, por eso no hace falta limitarlos.
    // Paquete compacto del teclado: movimiento y apuntado juntos.
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
    // Movimiento y apuntado por separado: los bots de prueba del modo dev (testBots.js).
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
        const angle = parseFireAngle(payload); // el disparo puede llevar su ángulo definitivo (así no hace falta un "pad" aparte)
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

    // El teclado mide su ping y lo cuenta; el servidor lo reenvía a las pantallas con el número de jugador (sale en su ficha del marcador).
    socket.on(EVENTS.PING_REPORT, (payload) => {
      try {
        const entry = slots.get(socket.id);
        const ms = Number(payload?.ms);
        if (entry && Number.isFinite(ms) && ms >= 0 && ms < 60000) {
          ns.to('host').emit(EVENTS.PLAYER_PING, { slot: entry.slot, ms: Math.round(ms) });
        }
      } catch (err) {
        console.error('ping_report falló:', err);
      }
    });

    socket.on('disconnect', (reason) => {
      clearTimeout(idleTimer);
      hostScreens.delete(socket.id);
      const entry = slots.get(socket.id);
      // Se ha ido a propósito (la página cerró la conexión al salir: roomSocket.js), no es un corte de red: no hay gracia que esperar. En partida
      // es un abandono (como SALIR); en la sala o en la intro deja su hueco al momento (como player_quit).
      const left = reason === 'client namespace disconnect';
      if (entry && left && session.phase === 'PLAYING') {
        session.quit(entry.slot);
      } else if (entry && left && (session.phase === 'LOBBY' || session.phase === 'READY')) {
        releaseSlot(socket.id);
      } else if (entry && session.phase === 'PLAYING') {
        session.playerDisconnected(entry.slot); // la plaza queda reservada: si no vuelve, pierde por abandono
      } else if (entry && session.phase === 'GAME_OVER') {
        // la plaza se libera sola al terminar la pantalla de resultados
      } else if (entry && (session.phase === 'LOBBY' || session.phase === 'READY') && slots.hasToken(socket.id)) {
        // Corte breve en la sala o en la presentación: la plaza se guarda lobbyGraceS. Si vuelve con su token (rebind), sigue como estaba: la
        // cuenta atrás no se reinicia y la presentación no se cancela para todos. Si no vuelve, se libera (o, si ya empezó la partida, cuenta
        // como desconectado y pierde por abandono a los 10 s).
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
        releaseSlot(socket.id); // sin token, la plaza se libera al instante
      } // sin plaza (p. ej. la conexión vieja de quien ya recuperó su plaza con otra): no se toca nada
      broadcastLobby();
    });
  });

  // Libera la plaza de un socket y corre a los demás a P1..Pn (su color cambia).
  function releaseSlot(socketId) {
    slots.release(socketId);
    for (const moved of slots.compact()) ns.to(moved.socketId).emit(EVENTS.SLOT_ASSIGNED, { slot: moved.slot, initials: moved.initials });
    session.setPlayers(slots.initials());
  }

  return session;
}
