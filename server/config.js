// Constantes del servidor. Los valores de la partida se ajustan aquí tras probar jugando; nunca en la lógica.

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  devPassword: process.env.DEV_PASSWORD || '',          // contraseña del modo desarrollador (/db-admin/); sin ella no hay modo dev
  sessionSecret: process.env.SESSION_SECRET || '',     // clave para firmar la cookie del modo dev (si falta, se genera al arrancar)
  maxRooms: Number(process.env.MAX_ROOMS) || 20,        // salas abiertas a la vez
  roomIdleMs: 5 * 60 * 1000,                            // una sala sin nadie conectado se borra pasado este tiempo
  maxSocketsPerRoom: 16,                                // 4 jugadores (pantalla y teclado de cada uno) con margen para reconexiones
  // Socket.io: un socket que no responde en este tiempo se considera caído.
  pingIntervalMs: 5000,
  pingTimeoutMs: 10000,
  // Robustez ante escaneos masivos y abusos.
  maxSockets: Number(process.env.MAX_SOCKETS) || 150, // por encima de este número de conexiones se rechazan las nuevas
  maxEventsPerSecond: 300,  // un socket que manda más eventos por segundo que esto se desconecta (un jugador legítimo manda ~130)
  connectionsPerMinute: 90, // conexiones nuevas por IP y minuto: frena el adivinar códigos de sala
  inputStallMs: 4000,       // un jugador en partida sin mandar NADA durante este tiempo (red caída sin detectar) deja su tanque parado
  idleSocketMs: 60000,      // un socket sin plaza que no hace nada se desconecta pasado este tiempo
  joinCooldownMs: 400,      // tiempo mínimo entre dos intentos de join_room del mismo socket
  game: Object.freeze({
    tickHz: 60,                  // simulación en el servidor
    broadcastHz: 30,             // estados por segundo hacia cada pantalla: la pantalla interpola 90 ms, así que no se nota
    lives: Number(process.env.PUBLIC_LIVES) || 5, // vidas de todos (jugadores y bots); con 3 las partidas se hacían cortas
    matchSeconds: Number(process.env.MATCH_SECONDS) || 180, // MATCH_SECONDS=20 para pruebas rápidas
    joinWindowS: 10,             // una persona pulsa JUGAR y, tras esta cuenta atrás, empieza la partida (si entra alguien vuelve a 10)
    soloJoinWindowS: 10,         // ...igual contra los bots (así da tiempo a que entre alguien)
    maxCancels: 3,               // cuántas veces puede cancelar la cuenta atrás cada jugador por sala de espera (contra el troll que la cancela sin fin)
    cancelGuardS: 0.8,           // no se puede cancelar en el primer instante (el doble clic en JUGAR no la cancela)
    countdownS: 2,               // los últimos números (2, 1) de la presentación, ya con la partida a punto de empezar
    introS: 3,                   // congelación al empezar la partida: 2 s con los nombres grandes + ~1 s en que caen sobre los tanques; el reloj no corre
    roundFreezeS: 2.2,           // pausa tras un impacto, con los tanques de vuelta en su salida; = DONE_MS de client/host/roundTimeline.js
    resultsS: 10,                // desde que acaba la partida hasta volver a la sala: ~3,8 s de animación final (KO...) + ~6 s de resultados
    reconnectGraceS: 10,         // un jugador desconectado pierde por abandono pasado este tiempo
    lobbyGraceS: 6,              // corte breve en la sala de espera: la plaza se guarda estos segundos; si vuelve con su token, sigue como estaba
    tankSpeed: 4,                // velocidad máxima en celdas por segundo
    tankAccel: 30,               // celdas/s por segundo al arrancar o cambiar de dirección: ~0,13 s hasta el tope
    tankBrake: 40,               // frenado al soltar el pad: se para en ~0,1 s en vez de en seco
    moveResponseExponent: 1.35,  // curva del pad: con poco empuje se va despacio (más precisión); 1 = lineal
    dashExitSpeedFactor: 0.6,    // fracción de la velocidad máxima que conserva el tanque al acabar un dash
    speedBoost: 1.5,             // multiplicador del power-up de velocidad
    projectileSpeed: 8.5,        // celdas por segundo (con rebotes, más rápido no daba tiempo a reaccionar y esquivar)
    projectileLifeS: 3,          // vida máxima de un disparo (~25 celdas): desaparece aunque no haya agotado sus rebotes
    projectileRadius: 0.12,
    fireCooldownS: 0.75,
    fireBufferS: 0.25,           // un disparo pedido hasta este tiempo antes de acabar la cadencia sale solo al acabar
    dashSpeed: 16,               // celdas por segundo durante el dash
    dashDurationS: 0.18,         // el dash recorre ~2,9 celdas
    dashCooldownS: 2.5,
    maxProjectilesPerPlayer: 4,  // tope de proyectiles vivos por jugador
    doubleShotSpreadRad: 0.14,   // separación angular del power-up de doble disparo
    aoeRadius: 1.6,              // radio de la explosión del power-up de explosión
    friendlyFire: false,         // tus disparos no te dañan
    // Easter egg: el JUGADOR que se llama TNI lleva un tanque "chetado": más vidas, más rápido, dispara más a menudo y sus disparos son cohetes
    // que NO rebotan: revientan al primer choque (muro, tanque o fin de su vida) en una explosión grande que atraviesa escudos.
    tni: Object.freeze({
      name: 'TNI', lives: 6, speedFactor: 1.35, dashCooldownS: 1.2, fireCooldownS: 0.4, maxProjectiles: 6,
      projectileSpeed: 13, projectileLifeS: 2.2, blastRadius: 2.8, aimAssistConeRad: 0.3, aimAssistStrength: 0.85,
    }),
    // Un jugador solo juega contra 3 bots: reaparecen en la esquina más libre, con invulnerabilidad corta, y cada bot eliminado suma puntos.
    soloBots: Object.freeze(['AXL', 'VEX', 'ZED']), // iniciales de los 3 bots
    soloRespawnInvulnS: 1.6,
    soloStartInvulnS: 2.5,        // el jugador es invulnerable al empezar la partida y tras cada pausa de ronda (los bots no le disparan)
    aimAssistConeRad: 0,          // ayuda de puntería: cono (rad) alrededor del apuntado en el que el disparo se corrige hacia un rival visible
    aimAssistStrength: 0,         // fracción de la desviación que se corrige (0 = sin ayuda); cada dificultad lo ajusta (soloBot.js, DIFFICULTY)
    difficulty: 'media',          // dificultad de los bots (el modo dev la puede cambiar desde su menú)
    soloBotWarmupS: 3,            // los bots tardan este tiempo (más el que les toque) en empezar a disparar al principio y tras cada ronda
    padDeadzone: 0.12,            // por debajo de este valor el pad de movimiento cuenta como 0
    // Segundos que dura cada power-up tras recogerlo. Recoger otro igual renueva el tiempo; recoger otro distinto sustituye al que tenías.
    // El escudo absorbe un disparo y se rompe.
    powerupDurationS: Object.freeze({ double: 6, speed: 5, aoe: 6, shield: 6 }),
    shieldBreakGraceS: 0.3,      // tras romperse el escudo, invulnerable un instante (el 2.º disparo de un doble disparo no debe matar)
    powerupWeights: Object.freeze({ double: 1, speed: 1, aoe: 0.6, shield: 1 }), // probabilidad relativa de cada tipo
    powerupWarnS: 1.5,           // segundos de aviso (columna de luz) antes de que aparezca un power-up
    powerupMax: 2,               // máximo de power-ups en el mapa a la vez
    powerupSpawnS: 15,           // cada cuánto aparece uno nuevo
    powerupFirstSpawnS: 6,       // el primero aparece pronto
    // Pausa: 10 s como mucho, 2 por jugador y partida, 30 s entre pausas (pause.js; solo congela si juegas solo contra los bots).
    pauseMaxS: 10,
    pauseCooldownS: 30,
    pausesPerMatch: 2,
  }),
  // Iniciales que no se aceptan (lista corta; ampliable).
  blockedInitials: Object.freeze(['KKK', 'NZI', 'SEX', 'ASS', 'FUK', 'FUC', 'XXX', 'PTA', 'PUT', 'CUM', 'TIT']),
});
