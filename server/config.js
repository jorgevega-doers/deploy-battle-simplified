// Constantes del servidor. Los valores de juego (vidas, tiempos...) se irán añadiendo aquí.
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

// Carpeta de datos del stand (Top 10, emails y copias de seguridad), FUERA del proyecto para que un git pull, volver a clonar o borrar la carpeta del juego no la toquen (sección 78).
const dataDir = process.env.DATA_DIR || join(homedir(), 'DeployBattle');

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  // URL pública (túnel) que irá en el QR. Vacía = se usa la IP de la red local (útil para probar con un móvil en la misma Wi-Fi).
  publicUrl: process.env.PUBLIC_URL || '',
  // Página a la que se redirige a los móviles al terminar la partida.
  endPath: '/end/',
  // Modo online (28-oct): salas con código, contraseña de acceso y host en cualquier navegador. Sin ONLINE=1 el servidor funciona
  // exactamente como en el stand (una sola partida, /host solo desde el portátil, sin contraseña).
  online: process.env.ONLINE === '1',
  accessPassword: process.env.ACCESS_PASSWORD || '',   // contraseña de acceso al sitio (obligatoria con ONLINE=1)
  devPassword: process.env.DEV_PASSWORD || '',          // contraseña del modo desarrollador online (menú completo de pruebas); sin ella no hay modo dev
  sessionSecret: process.env.SESSION_SECRET || '',     // clave para firmar la cookie de acceso (si falta, se genera al arrancar)
  maxRooms: Number(process.env.MAX_ROOMS) || 20,        // salas online abiertas a la vez
  roomIdleMs: 5 * 60 * 1000,                            // una sala sin nadie conectado se borra pasado este tiempo
  maxSocketsPerRoom: 16,                                // hasta 4 pantallas y 4 móviles (cada uno desde su casa) y margen para reconexiones
  attractDefault: process.env.ATTRACT === '1', // ATTRACT=1 arranca con el salvapantallas (partida de bots tras el QR) activado
  playerHudIntervalMs: 250,      // cada cuánto recibe cada mando sus vidas, tiempo y power-ups (player_hud)
  // Archivo SQLite del ranking y los emails (sección 78): en la carpeta de datos (~/DeployBattle). DB_PATH permite cambiarlo (los tests usan :memory:).
  dataDir,
  dbPath: process.env.DB_PATH || join(dataDir, 'deploy-battle.db'),
  backupDir: process.env.BACKUP_DIR || join(dataDir, 'copias'),
  // Copia de los emails en Google Sheets (sección 79): la dirección y la clave se guardan desde el menú (DATOS) en este archivo; SHEETS_URL / SHEETS_TOKEN mandan.
  sheetsFile: join(dataDir, 'google-sheets.json'),
  // Hoja de DOERS (30-oct): fija para que funcione en cualquier equipo (stand, portátil, Render) sin configurar nada. El archivo de arriba o
  // SHEETS_URL / SHEETS_TOKEN mandan sobre esto. Con la URL solo se pueden AÑADIR filas a la hoja, no leerla.
  sheetsDefault: {
    url: 'https://script.google.com/macros/s/AKfycbyKibABeIWxNElW5EhZoBC0BBz2idjqixX8GFVZesMR1RoIlZt-B5LW5VxMyP3itkfHtQ/exec',
    token: 'DeployBattle!',
  },
  legacyDbPath: resolve(import.meta.dirname, '..', 'leaderboard.db'), // donde estaba antes del 30-oct: se copia a la carpeta de datos la primera vez
  leaderboardSize: 10,
  // Ranking de ejemplo que deja el botón "resetear Top 10" del menú de pruebas: 10 puntuaciones iguales.
  leaderboardSample: { initials: 'BOB', score: 3000, accuracy: 0, count: 10 }, // se deja igual en el ranking multijugador y en el solitario
  // Socket.io: un socket que no responde en este tiempo se considera caído (AGENTS.md, sección 11).
  pingIntervalMs: 5000,
  pingTimeoutMs: 10000,
  // Robustez ante escaneos masivos (AGENTS.md, sección 9).
  maxSockets: Number(process.env.MAX_SOCKETS) || (process.env.ONLINE === '1' ? 150 : 50), // por encima de este número de conexiones se rechazan las nuevas
  onlineBroadcastHz: 30,    // estados por segundo hacia el host en una sala online: la mitad de tráfico por Internet; el host interpola 90 ms, así que no se nota
  maxEventsPerSecond: 300,  // un socket que manda más eventos por segundo que esto se desconecta (un mando legítimo manda ~130)
  connectionsPerMinute: 90, // conexiones nuevas por IP y minuto (online): frena el adivinar códigos de sala
  inputStallMs: 4000,       // un mando en partida sin mandar NADA durante este tiempo (red saturada o caída sin detectar) deja su tanque parado
  idleSocketMs: 60000,     // un móvil sin plaza que no hace nada se desconecta pasado este tiempo
  joinCooldownMs: 400,      // tiempo mínimo entre dos intentos de join_room del mismo socket
  requireEmail: process.env.REQUIRE_EMAIL !== '0', // en el stand, el email es obligatorio para entrar a jugar (REQUIRE_EMAIL=0 lo quita; igual en las salas online)
  consentVersion: 'feria-2026-11-v4', // versión del texto de consentimiento que acepta el visitante (cambiarla si cambia el texto del mando)
  // Parámetros de la partida (AGENTS.md, sección 11). Se ajustan aquí tras probar jugando; nunca en la lógica.
  game: Object.freeze({
    tickHz: 60,                  // simulación en el servidor
    broadcastHz: 60,             // envío de state_update al host (antes 30: el host está en el mismo portátil y cada estado
                                 // que llega antes recorta retardo de entrada; medido con scripts/input-latency.js)
    publicLives: Number(process.env.PUBLIC_LIVES) || 5, // versión arcade (11-nov): vidas de todos en las salas públicas (jugadores y bots); con 3 las partidas se hacían cortas
    lives: Number(process.env.LIVES) || 3, // LIVES=1 para ver el KO enseguida en las pruebas
    matchSeconds: Number(process.env.MATCH_SECONDS) || 180, // MATCH_SECONDS=20 para pruebas rápidas
    joinWindowS: 20,             // cuenta atrás de entrada: desde que TODOS los conectados pulsan LISTO hasta que empieza la presentación; si entra, sale o cancela alguien se reinicia
    publicJoinWindowS: 10,       // versión arcade (11-nov): una persona pulsa JUGAR y, tras esta cuenta atrás, empieza la partida (sin LISTO; si entra alguien vuelve a 10)
    publicSoloJoinWindowS: 10,   // ...igual contra los bots (así da tiempo a que entre alguien)
    publicMaxCancels: 3,         // cuántas veces puede cancelar la cuenta atrás cada jugador por sala de espera (contra el troll que la cancela sin fin)
    publicCancelGuardS: 0.8,     // no se puede cancelar en el primer instante (el doble clic en JUGAR no la cancela)
    quickBotsAfterS: 10,         // partida rápida: si estás solo esperando, a los N s aparece JUGAR CON BOTS (lo enseña la pantalla)
    // Partida pública sin LISTO (arranque solo con 2+). Versión arcade (11-nov): null = apagado, cada uno pulsa EMPEZAR (si no, tras una partida la
    // cuenta atrás arrancaba sola y nadie podía cancelarla). Con un número vuelve el arranque automático.
    publicAutoStartS: null,
    publicFullStartS: 5,         // ...y con la sala llena (4), en estos segundos
    countdownS: 2,               // los últimos números (2, 1) de la presentación, ya con la partida a punto de empezar
    introS: 3,                   // congelación al empezar la partida: 2 s con los nombres grandes + ~1 s en que caen sobre los tanques (host: INTRO_*); el reloj no corre
    roundFreezeS: 2.2,           // pausa tras un impacto, con los tanques de vuelta en su salida; = DONE_MS de client/host/roundTimeline.js (animación del host)
    resultsS: 10,                // desde que acaba la partida hasta redirigir a /end: ~3,8 s de animación final (KO...) + ~6 s de resultados
    reconnectGraceS: 10,         // un jugador desconectado pierde por abandono pasado este tiempo
    lobbyGraceS: 6, // corte breve en el lobby (red saturada): la plaza y su LISTO se guardan estos segundos; si vuelve con su token, la cuenta atrás no se reinicia
    tankSpeed: 4,                // velocidad máxima en celdas por segundo (antes 5: se sentía demasiado rápido)
    tankAccel: 30,               // celdas/s por segundo al arrancar o cambiar de dirección: ~0,13 s hasta el tope (antes 22,
                                 // ~0,18 s: se notaba como retardo del mando)
    tankBrake: 40,               // frenado al soltar el pad: se para en ~0,1 s en vez de en seco (antes 30)
    moveResponseExponent: 1.35,  // curva del pad: con poco empuje se va despacio (más precisión); 1 = lineal
    dashExitSpeedFactor: 0.6,    // fracción de la velocidad máxima que conserva el tanque al acabar un dash
    speedBoost: 1.5,             // multiplicador del power-up de velocidad
    projectileSpeed: 8.5,        // celdas por segundo (antes 11: con rebotes no daba tiempo a reaccionar y esquivar)
    projectileLifeS: 3,          // vida máxima de un disparo (~25 celdas): desaparece aunque no haya rebotado 3 veces
    projectileRadius: 0.12,
    fireCooldownS: 0.75,         // antes 0,6: menos spam de balas rebotando
    fireBufferS: 0.25,           // un disparo pedido hasta este tiempo antes de acabar la cadencia sale solo al acabar
    dashSpeed: 16,               // celdas por segundo durante el dash
    dashDurationS: 0.18,         // el dash recorre ~2,9 celdas
    dashCooldownS: 2.5,
    maxProjectilesPerPlayer: 4,  // (antes 6) tope de proyectiles vivos por jugador
    doubleShotSpreadRad: 0.14,   // separación angular del power-up de doble disparo
    aoeRadius: 1.6,              // radio de la explosión del power-up de explosión
    friendlyFire: false,         // tus disparos no te dañan
    // Easter egg (AGENTS.md, sección 88): el JUGADOR que se llama TNI lleva un tanque "chetado": más vidas, más rápido, dispara más
    // a menudo y sus disparos son cohetes que NO rebotan: revientan al primer choque (muro, tanque o fin de su vida) en una explosión
    // grande que atraviesa escudos. Sus partidas no entran en el Top 10 (sockets.js).
    tni: Object.freeze({
      name: 'TNI', lives: 6, speedFactor: 1.35, dashCooldownS: 1.2, fireCooldownS: 0.4, maxProjectiles: 6,
      projectileSpeed: 13, projectileLifeS: 2.2, blastRadius: 2.8, aimAssistConeRad: 0.3, aimAssistStrength: 0.85,
    }),
    // Modo de un jugador (1 contra 3 bots): los bots reaparecen en la esquina más libre, con invulnerabilidad corta, y
    // cada bot eliminado suma puntos extra al jugador.
    soloBots: Object.freeze(['AXL', 'VEX', 'ZED']), // iniciales de los 3 bots
    soloPlayerLives: Number(process.env.SOLO_LIVES) || 4, // vidas del jugador contra los 3 bots (ellos tienen `lives`)
    soloRespawnInvulnS: 1.6,
    soloStartInvulnS: 2.5,        // el jugador es invulnerable al empezar la partida y tras cada pausa de ronda (los bots no le disparan)
    aimAssistConeRad: 0,          // ayuda de puntería de los jugadores: cono (rad) alrededor de su apuntado en el que el disparo se corrige hacia un rival visible
    aimAssistStrength: 0,         // fracción de la desviación que se corrige (0 = sin ayuda); STAND/PRO lo ajustan en DIFFICULTY
    difficulty: process.env.DIFFICULTY === 'pro' ? 'pro' : 'stand', // dificultad de los bots: 'stand' (feria, más suave) o 'pro' (la de siempre); se cambia desde el menú
    soloBotWarmupS: 3,            // los bots tardan este tiempo (más el que les toque) en empezar a disparar al principio y tras cada ronda
    padDeadzone: 0.12,           // por debajo de este valor el pad de movimiento cuenta como 0
    // Segundos que dura cada power-up tras recogerlo. Cortos a propósito para limitar su potencial.
    // Recoger otro igual renueva el tiempo (no se acumula).
    // Solo hay uno activo a la vez: recoger otro sustituye al que tenías. El escudo absorbe un disparo y se rompe.
    powerupDurationS: Object.freeze({ double: 6, speed: 5, aoe: 6, shield: 6 }),
    shieldBreakGraceS: 0.3,      // tras romperse el escudo, invulnerable un instante (el 2.º disparo de un doble disparo no debe matar)
    powerupWeights: Object.freeze({ double: 1, speed: 1, aoe: 0.6, shield: 1 }), // probabilidad relativa de cada tipo (la explosión, menos: 27-oct)
    powerupWarnS: 1.5,           // segundos de aviso (columna de luz) antes de que aparezca un power-up
    powerupMax: 2,              // máximo de power-ups en el mapa a la vez
    powerupSpawnS: 15,           // cada cuánto aparece uno nuevo
    powerupFirstSpawnS: 6,       // el primero aparece pronto
  }),
  // Iniciales que no se aceptan (lista corta; ampliable).
  blockedInitials: Object.freeze(['KKK', 'NZI', 'SEX', 'ASS', 'FUK', 'FUC', 'XXX', 'PTA', 'PUT', 'CUM', 'TIT']),
});
