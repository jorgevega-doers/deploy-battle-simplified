// Nombres de los eventos de Socket.io. Se importan siempre desde aquí para evitar erratas.
export const EVENTS = Object.freeze({
  // Pantalla / teclado -> servidor
  HOST_JOIN: 'host_join', // la pantalla del jugador se registra en la sala (recibe la partida): { screen }
  JOIN_ROOM: 'join_room', // el teclado pide plaza: { role: 'player', initials, token, keyboard: true, screen }
  PAD: 'pad', // movimiento + apuntado en un solo paquete corto: [x, y, a] con x e y en -100..100 y a en centésimas de radián (o null)
  PAD_MOVE: 'pad_move', // movimiento y apuntado por separado (los bots de prueba del modo dev)
  PAD_AIM: 'pad_aim',
  FIRE: 'fire',
  DASH: 'dash',
  PLAYER_READY: 'player_ready', // JUGAR en la sala de espera: empieza la cuenta atrás; si ya corre, la cancela (con límite)
  PAUSE_REQUEST: 'pause_request', // un jugador pide pausa ({ on: true }) o la quita ({ on: false }) en plena partida
  PLAYER_QUIT: 'player_quit', // un jugador sale (en partida pierde por abandono y la partida sigue con los demás; en la espera deja su hueco)
  PLAYER_RENAME: 'player_rename', // un jugador cambia su nombre en la sala de espera: { initials } (3 letras A-Z). Responde con slot_assigned
  LATENCY_PING: 'latency_ping',
  PING_REPORT: 'ping_report', // el teclado cuenta su propio ping al servidor (sale en su ficha del marcador)
  // Menú de pruebas del modo dev (el servidor solo los acepta con la cookie de desarrollador)
  HARD_RESET: 'hard_reset', // reinicia la sala: echa a los jugadores y vuelve a la sala de espera
  DIFFICULTY_SET: 'difficulty_set', // dificultad de los bots: { level: 'stand' (FÁCIL) | 'media' | 'pro' }
  MAP_SELECT: 'map_select', // mapa: { choice: 'random' | 0 | 1 | 2 } o { reroll: true } (al iniciar un test: con ALEATORIO sortea ya el mapa)
  DEBUG_END_TIME: 'debug_end_time', // pone el tiempo de la partida a cero
  // Servidor -> clientes
  PLAYER_PING: 'player_ping',
  LOBBY_STATE: 'lobby_state',
  SLOT_ASSIGNED: 'slot_assigned',
  ROOM_FULL: 'room_full',
  COUNTDOWN: 'countdown',
  STATE_UPDATE: 'state_update',
  MATCH_EVENT: 'match_event',
  GAME_OVER: 'game_over',
  FORCE_DISCONNECT: 'force_disconnect',
  ERROR_MSG: 'error_msg',
  PAUSE_STATE: 'pause_state', // { by: plaza que pausó o null, left: segundos } a todos; a quien no puede pausar: { denied: 'busy'|'limit'|'cooldown'|'online', wait? }
});
