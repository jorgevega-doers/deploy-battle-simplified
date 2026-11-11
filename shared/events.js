// Nombres de los eventos de Socket.io. Se importan siempre desde aquí para evitar erratas
// (el diccionario completo está en AGENTS.md, sección 15). Se irá ampliando con cada paso.
export const EVENTS = Object.freeze({
  // Cliente -> servidor
  HOST_JOIN: 'host_join',
  JOIN_ROOM: 'join_room',
  PAD: 'pad', // movimiento + apuntado en un solo paquete corto: [x, y, a] con x e y en -100..100 y a en centésimas de radián (o null). Sección 63
  PAD_MOVE: 'pad_move',
  PAD_AIM: 'pad_aim',
  FIRE: 'fire',
  DASH: 'dash',
  TUNNEL_RESTART: 'tunnel_restart', // menú del host (stand, opciones de desarrollador): abre un túnel nuevo (cambia el QR) sin reiniciar nada más
  EMERGENCY_RESET: 'emergency_reset', // R mantenida en el host: REINICIO TOTAL de emergencia (partida, sala, mandos, ajustes y túnel); sección 64
  EMERGENCY_RELOAD: 'emergency_reload', // servidor -> pantallas de la sala: recargad la página (reinicio total)
  HARD_RESET: 'hard_reset',
  LEADERBOARD_RESET: 'leaderboard_reset', // TEMPORAL (menú de pruebas del host): borra el Top 10 y deja el de ejemplo
  DIFFICULTY_SET: 'difficulty_set', // el host (menú, pestaña PARTIDA) cambia la dificultad de los bots: { level: 'pro' | 'stand' } (sección 60)
  ATTRACT_SET: 'attract_set', // el host (menú de pruebas) activa o desactiva el salvapantallas: { on: boolean }
  MAP_SELECT: 'map_select', // el host (cuadros junto al QR) elige el mapa: { choice: 'random' | 0 | 1 | 2 } (sección 46), o { reroll: true } (menú de pruebas al iniciar un test: con ALEATORIO sortea ya el mapa, con uno fijo no cambia nada)
  PLAYER_READY: 'player_ready', // el mando pulsa LISTO: cuando todos los jugadores necesarios están listos empieza la cuenta atrás
  PAUSE_REQUEST: 'pause_request', // versión pública: un jugador pide pausa ({ on: true }) o la quita ({ on: false }) en plena partida
  PLAYER_QUIT: 'player_quit', // versión pública: un jugador sale (en partida pierde por abandono y la partida sigue con los demás; en la espera deja su hueco)
  PLAYER_RENAME: 'player_rename', // versión pública: un jugador cambia su nombre en la sala de espera: { initials } (3 letras A-Z). Responde con slot_assigned
  DEBUG_END_TIME: 'debug_end_time', // TEMPORAL (menú de test del host): pone el tiempo de la partida a cero
  LATENCY_PING: 'latency_ping',
  PING_REPORT: 'ping_report', // el mando cuenta su propio ping al servidor (para enseñarlo en el host)
  // Servidor -> clientes
  PLAYER_PING: 'player_ping',
  PLAYER_HUD: 'player_hud', // al mando de cada jugador, ~4 veces por segundo: sus vidas, el tiempo y sus power-ups activos
  LOBBY_STATE: 'lobby_state',
  SLOT_ASSIGNED: 'slot_assigned',
  ROOM_FULL: 'room_full',
  COUNTDOWN: 'countdown',
  STATE_UPDATE: 'state_update',
  MATCH_EVENT: 'match_event',
  GAME_OVER: 'game_over',
  LEADERBOARD_UPDATE: 'leaderboard_update',
  REDIRECT: 'redirect',
  FORCE_DISCONNECT: 'force_disconnect',
  ERROR_MSG: 'error_msg',
  PAUSE_STATE: 'pause_state', // versión pública: { by: plaza que pausó o null, left: segundos } a todos; a quien no puede pausar: { denied: 'busy'|'limit'|'cooldown'|'online', wait? }
  HOST_KEY: 'host_key', // versión pública: el servidor da a una pantalla la llave de anfitrión (la anfitriona se fue y esta pasa a serlo): { hostKey }
});
