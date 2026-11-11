// Pantalla principal: se conecta al servidor, se registra como host y dibuja la partida en 3D con Three.js.
// Muestra el QR y las plazas mientras se espera, el HUD durante la partida y permite el reset global con la tecla R.
// Con "?view=2d" en la dirección usa la vista 2D de depuración en vez del 3D.
import '../theme.css';
import './arcade.css';
import './lobby.css';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import { insertCoinSvg, coinCols, COIN_ROWS, COIN_PAD } from './insertCoin.js';
import { EVENTS } from '../../shared/events.js';
import { HARD_RESET_HOLD_MS, POWERUP_TYPES } from '../../shared/constants.js';
import { startLatencyProbe } from '../../shared/latency.js';
import { createArena } from '../../shared/arena.js';
import { describePlan, teamLetter } from '../../shared/modeText.js';
import { createSnapshotBuffer } from './interpolation.js';
import { createScene } from './scene.js';
import { createEntities } from './entities.js';
import { createDebugPanel } from './debugPanel.js';
import { createQualityController } from './quality.js';
import { createDebugView } from './debugView.js';
import { createJuice, FLY_MS } from './juice.js';
import { createLife } from './life.js';
import { HEART_FULL, HEART_EMPTY, HEART_LOST } from './hearts.js';
import { POWERUP_NAMES, POWERUP_ICONS } from './powerupIcons.js';
import { createSfx, panFor } from './sfx.js';
import { createMotionTracker } from './sfxMotionTracker.js';
import { scapeKey, SCAPES } from './soundscape.js';
import { soundsForEvent } from './sfxEvents.js';
import { isTniName } from './tniFx.js';
import { createLobbyLogo } from './lobbyLogo.js';
import { createLogoIntro } from './logoIntro.js';
import { setupDevMenu, INTRO_REPEAT_KEY } from './devMenu.js';
import { createGamepads } from './gamepads.js';
import { createLed } from './led.js';
import { fitPixelImages } from '../pixelFit.js'; // TEMPORAL: menú de pruebas
import { roomCode, roomType, roomSolo, roomPrivate, connectToRoom, playLink, inviteLink, screenId, getHostKey, setHostKey, clientToken, myName, saveMyName } from '../roomSocket.js';
import { createKeyboardPlayer } from './keyboardPlayer.js';
import { createQuickLobby } from './quickLobby.js';
import { createNameGate } from './nameGate.js';
import { createControlsCard } from './controlsCard.js';
import { CROWN } from './crown.js';
import { createPauseMenu } from './pauseMenu.js';
import { createPadSetup } from './padSetup.js';
import { createMenuPad } from './menuPad.js';
import { introSeen, markIntroSeen } from '../introSeen.js';
import { isTouchOnly } from '../touchOnly.js';
import { createPublicHost } from './publicHost.js';
import { setupLeaveRoom } from './leaveRoom.js';
import { PUBLIC_TEXT } from './publicTexts.js';
import { ARCADE, goHome } from './arcadeMode.js';
import { createArcadeLobby } from './arcadeLobby.js';

const $ = (id) => document.getElementById(id);
const COIN_TEXT = 'SCAN TO JOIN';
$('insert-coin').innerHTML = insertCoinSvg(COIN_TEXT);
let arena = createArena(0); // mapa actual: el servidor dice cuál toca en cada lobby_state ("map") y switchMap() lo cambia
const query = new URLSearchParams(window.location.search);
// ¿Hay WebGL? El juego SIEMPRE se juega en 3D: sin WebGL (máquina virtual sin gráfica 3D, GPU averiada) NO arranca y enseña una pantalla de error clara
// (antes la excepción del motor 3D dejaba la página muerta sin decir nada). La vista 2D (?view=2d) es solo una herramienta de depuración que hay que pedir a mano:
// nunca se usa sola como sustituto.
function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2'); // three.js (r163 en adelante) solo funciona con WebGL 2
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch { return false; }
}
let use2d = query.get('view') === '2d';
function stopWithoutWebGL(detail) {
  const box = document.getElementById('gl-error');
  if (box) { box.hidden = false; const info = document.getElementById('gl-error-detail'); if (info && detail) info.textContent = String(detail).slice(0, 300); }
  document.body.classList.remove('intro-on');
  throw new Error('Sin WebGL: el juego necesita aceleración gráfica (chrome://gpu)'); // corta la carga de la página: no se arranca nada a medias
}
if (!use2d && !hasWebGL()) stopWithoutWebGL('Chrome no ha podido crear un contexto WebGL.');
// Nivel de calidad forzado desde la dirección (?quality=0..3, o ?bloom=0 = nivel 3); null = automático.
const forcedQuality = query.get('quality') !== null
  ? Math.min(3, Math.max(0, Number(query.get('quality')) || 0))
  : (query.get('bloom') === '0' ? 3 : null);

// Mismo origen que la página; solo WebSocket (igual que el servidor). Con ?room=CODIGO es una sala online (su propio espacio de nombres).
// En la rama public toda sala es de la versión pública (anfitriona, revancha, ranking global...): publicHost.js.
const online = roomCode !== null;
// Versión pública: en un móvil o una tableta sin ratón aquí no se juega (el móvil es el mando): al inicio, que lo explica.
if (online && isTouchOnly()) { window.location.replace('/'); throw new Error('Pantalla de juego abierta en un móvil: al inicio'); }
// Salas en las que cada uno juega en su pantalla (solo, partida pública, sala privada): esta pantalla es también el mando de su jugador (teclado y
// ratón). Entra con el nombre de la última vez (o uno al azar) y se cambia en su ficha (EDITAR).
const quick = online && roomType === 'quick';
const quickInitials = quick ? myName() : null;
// Pantalla compartida ("en esta pantalla"): directamente la sala de espera, aunque aún no haya nadie (ahí cada uno elige móvil o mando).
const sharedRoom = online && roomType === 'local';
const socket = connectToRoom(io, { asScreen: true });
const publicHost = online ? createPublicHost({ $, socket, screenId, onLayout: () => fitLobbyCard() }) : null;
// Versión pública: Escape = "¿salir de la partida?"; otra vez Escape = a la elección de modo.
// En plena partida, ESC es la pausa de quien juega en esta pantalla (pauseMenu.js), no salir de la sala.
const pauseMenu = online ? createPauseMenu({ nameOf: (slot) => lobby?.initials?.[slot - 1] }) : null;
if (pauseMenu) socket.on(EVENTS.PAUSE_STATE, (state) => pauseMenu.serverState(state));
// Mandos que el navegador no reconoce: la primera vez se pregunta botón a botón (PULSA START...) y se guarda (padSetup.js).
const padSetup = online ? createPadSetup({ canHold: () => lobby?.state !== 'PLAYING', onDone: () => { updateControls(); renderWaiting(lobby.joinLeft != null); } }) : null;
// Versión arcade: salir lleva a la pantalla principal (título), sin volver a pedir el clic de empezar.
// En la sala de espera se avisa al servidor (PLAYER_QUIT) para que tu hueco se libere al momento (si no, los demás te ven 6 s más: la espera por si
// era un corte de red). En partida ya lo avisa el menú de pausa (SALIR = abandono).
function leaveHome(note = '') {
  if (!ARCADE.on) { window.location.assign('/'); return; }
  const go = () => goHome(note);
  if (lobby?.state !== 'PLAYING' && keyboard?.socket?.connected) { keyboard.socket.emit(EVENTS.PLAYER_QUIT); setTimeout(go, 150); return; }
  go();
}
if (online) setupLeaveRoom({ isTyping: (event) => /^(INPUT|TEXTAREA)$/.test(event.target?.tagName), skip: () => pauseMenu.open || (quick && lobby?.state === 'PLAYING') || Boolean(nameGate?.open), onLeave: leaveHome });

// --- Dibujo: 3D (por defecto) o vista 2D de depuración ---
let sceneApi = null;
let entities = null;
let juice = null; // efectos arcade (juice.js): solo con la vista 3D
let life = null;  // vida de la ciudad (life.js): solo con la vista 3D
let tniFlags = [];        // easter egg (sección 88): qué tanques son de TNI
let tniPanicked = false;  // la ciudad ya ha huido en esta partida (solo con el primer disparo de TNI)
// Temblor de cámara al reventar un cohete de TNI: la imagen del juego y las etiquetas de los tanques se desplazan a saltos de píxeles enteros
// (múltiplos del píxel grande de la escena: el pixel art no se emborrona) y el temblor se apaga en SHAKE_MS. El HUD no tiembla.
const SHAKE_MS = 650;
const SHAKE_PX = 22; // amplitud inicial a 1080 p (se escala con la ventana)
let shakeAt = -1e9;
let shakeShown = '';
function screenShake(now) { shakeAt = now; }
function applyShake(now) {
  const t = (now - shakeAt) / SHAKE_MS;
  let transform = '';
  if (t >= 0 && t < 1 && sceneApi) {
    const unit = sceneApi.pixelScale || 1;
    const amp = SHAKE_PX * (innerHeight / 1080) * (1 - t) ** 1.5;
    const step = Math.floor((now - shakeAt) / 35); // un salto cada 35 ms
    const rx = Math.sin(step * 12.9898) * 43758.5453; const ry = Math.sin(step * 78.233) * 12345.6789;
    const dx = Math.round(((rx - Math.floor(rx)) * 2 - 1) * amp / unit) * unit;
    const dy = Math.round(((ry - Math.floor(ry)) * 2 - 1) * amp / unit) * unit;
    transform = `translate(${dx}px, ${dy}px)`;
  }
  if (transform === shakeShown) return;
  shakeShown = transform;
  sceneApi.renderer.domElement.style.transform = transform;
  const labels = $('labels');
  if (labels) labels.style.transform = transform;
}
let view2d = null;
let view2dCanvas = null;
function startView2d() {
  use2d = true;
  $('scene').hidden = true;
  $('view2d').hidden = false;
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 960;  // misma proporción que la arena (32 x 18 = 16:9)
  canvas2d.height = 540;
  $('view2d').appendChild(canvas2d);
  view2d = createDebugView(canvas2d, arena);
  view2dCanvas = canvas2d;
  view2d.render(null);
}
if (use2d) {
  startView2d();
} else try {
  // ?pixel=N fuerza el tamaño del píxel de la escena (por defecto, N = alto de pantalla / 360: 3 en 1080p).
  const pixelScale = Number(query.get('pixel')) > 0 ? Math.round(Number(query.get('pixel'))) : null;
  sceneApi = createScene($('scene'), arena, { bloom: forcedQuality !== 3, pixelScale });
  entities = createEntities(sceneApi.scene, arena, sceneApi.textures, { camera: sceneApi.camera, layer: $('labels') });
  if (forcedQuality !== null && forcedQuality !== sceneApi.qualityLevel) sceneApi.setQuality(forcedQuality);
  juice = createJuice({ arena, sceneApi, entities, icons: POWERUP_ICONS, $, getMaxLives: (slot) => (slot ? maxLivesOf[slot - 1] : maxLives) || 3 });
  window.__entities = entities; // solo para depurar (lanzar eventos de prueba, p. ej. powerup_warn)
  window.__juice = juice; // solo para depurar desde la consola (y las pruebas con el MCP): lanzar animaciones sin jugar
  const mapEntry = sceneApi.setMap(arena);
  mapEntry.life = createLife(mapEntry.group, arena, mapEntry.city); // gente, animales, tráfico, luces y detalles ambientales (una por mapa)
  life = mapEntry.life;
  life.setLevel(sceneApi.qualityLevel);
  window.__life = life;
  window.__scene = sceneApi; // solo para depurar (acercar la cámara a mano con setCameraFx desde la consola)
} catch (err) { // el contexto WebGL se pudo probar pero no crear (o falló al montar la escena): pantalla de error, nunca una pantalla muerta ni una vista 2D
  console.error('La vista 3D no arrancó:', err);
  stopWithoutWebGL(err?.message);
}
const panel = createDebugPanel($('debug'), sceneApi?.renderer);
// Partida rápida: el teclado y el ratón de esta pantalla son el mando de su jugador (keyboardPlayer.js) y la espera es la de quickLobby.js.
let drawnState = null; // el último estado dibujado (el teclado apunta desde la posición que se VE del tanque)
const keyboard = quick && sceneApi ? createKeyboardPlayer({
  connect: () => connectToRoom(io), initials: quickInitials, token: clientToken, screen: screenId, camera: sceneApi.camera,
  getTank: (slot) => drawnState?.tanks?.[slot - 1] ?? null, isPlaying: () => lobby.state === 'PLAYING',
  onChange: (_mode, err) => {
    if (err?.code === 'invalid_initials') nameGate?.error('ESE NOMBRE NO VALE. PRUEBA CON OTRAS 3 LETRAS'); // lo rechazó el servidor
    quickLobby?.update(lobby);
    updateControls();
    if (lobby.plan) renderLobbyMode();
  },
  onSource: () => { updateControls(); renderWaiting(lobby.joinLeft != null); },
  pauseMenu, padSetup, blocked: () => Boolean(nameGate?.open), onLobbyPad: (dir) => { if (!ARCADE.on) publicHost?.step(dir); }, onQuit: leaveHome, // SALIR (de la partida o de la sala): vuelve al inicio // tocó el mando o el teclado: la tarjeta de controles resalta el que usa ahora
  onName: (name) => { saveMyName(name); quickLobby?.update(lobby); }, // el nombre de EDITAR se recuerda para la próxima partida
  pointerLock: ARCADE.on, crosshair: $('crosshair'), // arcade: el ratón queda capturado en la partida (no se sale a otra pantalla)
}) : null;
// Versión arcade: su sala de espera (arcadeLobby.js: JUGAR CON BOTS / EMPEZAR, SALIR e inactividad) en lugar de la de las salas públicas.
if (ARCADE.on) $('exit-btn').addEventListener('click', (event) => { event.currentTarget.blur(); keyboard?.openMenu(); });
const quickLobby = keyboard ? (ARCADE.on ? createArcadeLobby({ $, keyboard, onLeave: leaveHome }) : createQuickLobby({ $, keyboard, token: clientToken })) : null;
// En tu pantalla tienes teclado: al entrar se pregunta el nombre (con el de la última vez ya escrito); mientras, ya ocupas tu hueco.
// El nombre solo se guarda cuando el servidor lo confirma (onName), así nunca queda guardado uno que no vale.
// Si es la primera vez que se abre el juego en esta ventana, primero va la intro y luego la pregunta (si no, la tecla de empezar se escribiría en el nombre).
// Versión pública: cada vez que se abre una página del juego sale "PULSA PARA EMPEZAR" (el navegador no deja sonar hasta un clic o una tecla en ESTA
// página: al pasar del inicio a la sala, la música se cortaba hasta volver a pulsar). La primera vez, con la intro detrás; luego, solo la pantalla.
// Versión arcade: el clic de empezar y la intro ya fueron en el título, y el nombre se puso al pulsar JUGAR (aquí solo sale si el servidor no lo acepta).
const firstOpen = online && !ARCADE.on && !introSeen() && query.get('intro') !== '0';
const pressFirst = online && !ARCADE.on && query.get('intro') !== '0';
const nameGate = keyboard ? createNameGate({ initial: quickInitials, onSubmit: (name) => keyboard.setName(name), startHidden: pressFirst || ARCADE.on, button: ARCADE.on ? '¡A JUGAR!' : undefined }) : null;
// Con mando, el "¿CÓMO TE LLAMAS?" se rellena letra a letra (menuPad.js). Mientras está abierto, el mando no juega (keyboardPlayer: blocked).
const namePad = nameGate ? createMenuPad({ isBusy: (index) => padSetup?.busy(index) ?? false }) : null;
if (quick) $('scene').style.cursor = 'crosshair';
// Calidad adaptativa: baja sola si el equipo no llega a ~50 FPS. Con ?quality=N (0-3) o ?bloom=0 queda fija.
const quality = createQualityController({ auto: forcedQuality === null, startLevel: forcedQuality ?? 0 });
panel.set({ quality: sceneApi ? `${sceneApi.qualityLevel}${forcedQuality === null ? ' (auto)' : ' (fija)'}` : '-' });
let lastFrameAt = 0;
// Se dibuja un poco "en el pasado" para mezclar dos estados con fluidez. Con 60 estados por segundo (uno cada 16,7 ms)
// y el host en el mismo portátil que el servidor, 25 ms bastan (antes 70 ms con 30 estados/s: era el mayor retardo).
// 25 ms con el servidor en el mismo portátil; en una sala online los estados llegan por Internet con variación (jitter): más margen.
const buffer = createSnapshotBuffer({ delayMs: online ? 90 : 25 });

let latest = null;          // último state_update recibido (sin interpolar), para el HUD
let lastDrawn2d = null;
let lastHud = undefined;
let matchOver = false;      // tras el resultado se ocultan las líneas de apuntado
let lobby = { state: 'LOBBY', initials: [null, null], slots: [false, false] };
let isDev = !online;      // modo dev (contraseña de desarrollo) o el stand; en una sala online se sabe al preguntar al servidor
let devMenu = null;       // el menú de ajustes; en una sala online se crea cuando el servidor dice si es modo dev
let lastAttractOn = false;
window.__latestState = () => latest; // solo para depurar desde la consola del navegador (y para las pruebas con el MCP)

// --- Conexión y lobby ---
socket.on('connect', () => {
  $('debug').dataset.status = 'conectado';
  panel.set({ status: 'conectado' });
  $('net-banner').hidden = true; // volvió la conexión (o la sala se restauró)
  socket.emit(EVENTS.HOST_JOIN, online ? { screen: screenId, hostKey: getHostKey() ?? undefined } : undefined); // pública: id de pantalla y, si la tiene, la llave de anfitriona
});
// Versión pública: esta pantalla pasa a ser la anfitriona (la anterior se fue o la sala se restauró sin llave).
socket.on(EVENTS.HOST_KEY, ({ hostKey }) => { if (online && hostKey) setHostKey(roomCode, hostKey); });
socket.on('disconnect', () => { panel.set({ status: 'desconectado' }); if (online) $('net-banner').hidden = false; });
// Pantalla completa de aviso (sala cerrada, pantalla ocupada, sin acceso...) con un enlace al inicio.
// canCreate = enseña "CREAR SALA NUEVA" (la sala ya no existe: se reinició el servidor o se cerró); sin sesión lleva al login.
function fatal(text, canCreate = false) {
  $('fatal-msg').textContent = text;
  $('fatal-new').hidden = !canCreate;
  $('fatal').hidden = false;
}
$('fatal-new').addEventListener('click', async () => {
  $('fatal-new').disabled = true;
  try {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: roomType }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setHostKey(data.code, data.hostKey); window.location.replace(`/host/?room=${encodeURIComponent(data.code)}&type=${roomType}`); return; }
    $('fatal-msg').textContent = res.status === 503 ? PUBLIC_TEXT.noRooms : PUBLIC_TEXT.newRoomFailed;
  } catch {
    $('fatal-msg').textContent = PUBLIC_TEXT.offline;
  }
  $('fatal-new').disabled = false;
});
socket.on(EVENTS.ERROR_MSG, (err) => {
  panel.set({ status: err.message });
  if (online && err.code === 'host_forbidden') fatal(PUBLIC_TEXT.screenFailed);
});
socket.on('connect_error', (err) => {
  if (!online) {
    if (err.message === 'room_required') fatal('ESTA PANTALLA NECESITA UNA SALA: CRÉALA DESDE EL INICIO');
    return;
  }
  if (err.message === 'room_restored') { setTimeout(() => socket.connect(), 300); return; } // el servidor se reinició: ha recreado la sala con su código, se reintenta
  if (err.message === 'Invalid namespace') { if (ARCADE.on) goHome('LA SALA SE HA CERRADO. DALE A JUGAR OTRA VEZ'); else fatal(PUBLIC_TEXT.roomGone, true); return; }
  if (err.message === 'room_busy') { fatal(PUBLIC_TEXT.roomBusy); return; }
  if (err.message === 'bad_origin' || err.message === 'server_busy') { fatal(PUBLIC_TEXT.roomFailed); return; }
  $('net-banner').hidden = false; // fallo de red o servidor reiniciándose/despertando: Socket.io reintenta solo, sin tapar la pantalla
});

// Vuelta al lobby (o fin del salvapantallas): se descarta todo lo de la partida anterior.
// Temporizadores de la partida (sonidos con retraso, "GO!" tras la intro): un reinicio global los cancela todos.
const pendingTimers = new Set();
function later(fn, ms) {
  const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
  pendingTimers.add(id);
}
function resetVisuals() {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
  sfx.silenceMotion();
  motionTracker.reset();
  matchOver = false;
  resultsShown = false;
  maxLives = 0;
  maxLivesOf.fill(0);
  playerPing.fill(null);
  latest = null;
  lastDrawn2d = undefined;
  buffer.clear();
  entities?.hide();
  juice?.reset();
  setBanner(null);
}

// --- Sonido (sintetizado por código, sin archivos de audio; AGENTS.md, sección 43) ---
// Los navegadores no dejan sonar hasta el primer clic o tecla: el indicador de arriba a la derecha avisa y se activa con cualquiera.
// Tecla M (o pulsar el indicador) = silenciar; se recuerda entre sesiones.
let sfxStorage = null;
try { sfxStorage = window.localStorage; } catch { /* sin almacenamiento */ }
const sfx = ARCADE.sfx ?? createSfx({ storage: sfxStorage }); // arcade: el del título (ya desbloqueado y con la música sonando)
const motionTracker = createMotionTracker(); // velocidad dibujada de cada tanque, para su sonido de movimiento
// Cuánto se agachan la música y el ambiente con cada golpe fuerte (fracción que se queda): así el golpe se oye limpio.
const DUCK = { explosion: 0.4, hit: 0.5, ko: 0.3, win: 0.55, lose: 0.55, timeUp: 0.5, go: 0.7, tniBoom: 0.25, crowdScream: 0.5 };
const play = (name, args, delayMs = 0) => {
  if (lobby.attract) return; // la partida de fondo del salvapantallas no tiene efectos (sí música y ambiente)
  const go = () => { if (sfx.play(name, args) && DUCK[name]) sfx.duck(DUCK[name]); };
  if (delayMs > 0) later(go, delayMs); else go();
};
// Música y ambiente según el momento (soundscape.js decide cuál y dónde no suenan). Se reaplica cuando cambia el momento o el sonido.
let resultsShown = false;
let currentScape = null;
const carNext = []; // cuándo vuelve a oírse cada coche o moto (ambiente)
const carSwerving = []; // si el coche estaba esquivando un tanque en el fotograma anterior (para el bocinazo)
let hornNext = 0;
function applySoundscape() {
  if (sfx.status !== 'on') { currentScape = null; return; }
  const key = scapeKey({ state: lobby.state, timeLeft: latest?.timeLeft, matchOver, resultsShown });
  if (key === currentScape) return;
  currentScape = key;
  const scape = SCAPES[key];
  sfx.ambienceOn(true);
  sfx.ambienceLevel(scape.ambience);
  sfx.musicMood(scape.music, scape.musicScale);
}
sfx.onStatus(() => { currentScape = null; applySoundscape(); }); // al activarse o cambiar el sonido (desde el menú), se reaplica la música y el ambiente
// Los navegadores no dejan sonar hasta el primer clic o tecla en la página: cualquiera lo activa (el menú de ajustes dice si falta).
const unlockSound = () => sfx.unlock();
window.addEventListener('pointerdown', unlockSound);
window.addEventListener('keydown', (event) => {
  unlockSound();
  // Pantalla compartida (versión pública): en la sala de espera, las flechas del teclado del ordenador eligen mapa (←→) y dificultad (↑↓), como la
  // cruceta de un mando. En las salas en tu pantalla lo hace keyboardPlayer.js (allí el teclado es el del jugador).
  const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.code];
  if (arrow && online && !quick && lobby.state === 'LOBBY' && !pauseMenu?.open && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName)) { event.preventDefault(); publicHost?.step(arrow); }
  // M = abre o cierra el menú de ajustes (no se ve por defecto)
  if (event.code === 'KeyM' && !event.repeat && !event.ctrlKey && !event.metaKey && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName)) {
    const menu = $('dev-menu');
    const open = menu.classList.toggle('open');
    $('dev-toggle').setAttribute('aria-expanded', String(open));
  }
});
// Locales del mapa (konbini, ramen, izakaya, karaoke, salón recreativo...): sus sonidos de ambiente salen de su sitio del estéreo.
const PLACE_TYPES = new Set(['konbini', 'ramen', 'izakaya', 'karaoke', 'arcade']);
function updatePlaces() {
  sfx.ambienceWeather(arena.mood === 'rain' ? 'rain' : null); // la lluvia del mapa de la noche de lluvia
  if (sceneApi) sfx.ambiencePlaces(sceneApi.city.life.city.buildings.filter((b) => PLACE_TYPES.has(b.type)).map((b) => ({ type: b.type, x: b.rect.x + b.rect.w / 2 })));
}
updatePlaces();

// Cambio de mapa (3 mapas que se alternan partida a partida; AGENTS.md, sección 46). La ciudad de cada mapa se construye la
// primera vez (unos cientos de ms, en el lobby) y después solo se enciende o se apaga.
function switchMap(index) {
  arena = createArena(index);
  if (view2d) view2d = createDebugView(view2dCanvas, arena);
  if (!sceneApi) return;
  const entry = sceneApi.setMap(arena);
  arena = entry.arena;
  entry.life ??= createLife(entry.group, arena, entry.city);
  life = entry.life;
  life.setLevel(sceneApi.qualityLevel);
  window.__life = life;
  entities.setArena(arena);
  updatePlaces();
}
window.__switchMap = switchMap; // solo para depurar: ver otro mapa en el host (el servidor lo corrige en el siguiente lobby_state)
window.__sfx = sfx; // solo para depurar y medir niveles desde la consola (con OfflineAudioContext, sin altavoces)
window.__createSfx = createSfx;

socket.on(EVENTS.LOBBY_STATE, (data) => {
  if (typeof data.map === 'number' && data.map !== arena.mapIndex) switchMap(data.map);
  const previousState = lobby.state;
  const previousAttract = Boolean(lobby.attract);
  // Sonidos del lobby: entra un jugador, alguien pulsa LISTO o cambia el modo.
  if (data.state === 'LOBBY' && lobby.state === 'LOBBY') {
    const count = (list) => (list ?? []).filter(Boolean).length;
    if (count(data.slots) > count(lobby.slots)) play('join');
    else if (count(data.ready) > count(lobby.ready) || (ARCADE.on && data.joinLeft != null && lobby.joinLeft == null)) play('ready');
    else if (data.plan?.kind !== lobby.plan?.kind || data.plan?.bots !== lobby.plan?.bots || Boolean(data.plan?.teams) !== Boolean(lobby.plan?.teams)) play('mode');
    // Cuenta atrás de entrada (todos listos): un "tic" por segundo, más agudo en los 3 últimos.
    if (data.joinLeft != null && data.joinLeft !== lobby.joinLeft) play('countdown', { n: data.joinLeft <= 3 ? 1 : 2 });
  }
  lobby = data;
  // Intro al volver al lobby tras una partida (o un reinicio). Stand: la corta, y si entra un jugador mientras suena, se salta.
  // Versión pública (10-nov): la entera (DOERS DF presents → DEPLOY BATTLE), aunque los jugadores sigan en la sala (revancha); solo la corta que empiece otra partida.
  pauseMenu?.phase(data.state); // la partida acabó: ni menú ni aviso de pausa (el de salir de la sala se cierra al empezar)
  // El móvil que era el mando de esta pantalla ha salido (SALIR en el móvil): en la sala de espera, la pantalla vuelve sola al teclado.
  // En plena partida no: el mando elegido para una partida se queda hasta que acabe.
  if (keyboard?.mode === 'phone' && data.state === 'LOBBY' && keyboard.slot !== null) {
    const i = keyboard.slot - 1;
    // Solo si su hueco ya no es de esta pantalla (el móvil lo dejó): mientras el móvil se engancha llega un estado intermedio que aún dice TECLADO.
    if (data.screens?.[i] !== screenId) keyboard.reclaim();
  }
  if (data.state !== 'LOBBY') logoIntro.skip();
  else if ((previousState === 'GAME_OVER' || previousState === 'PLAYING') && !logoIntro.active) logoIntro.start(online && !ARCADE.on ? { prelude: true } : { short: true }); // arcade: la animación rápida del logo
  if (data.plan && !online) logoIntro.skip(); // stand: entra un jugador: la pantalla de espera manda sobre cualquier secuencia
  // Etiquetas sobre los tanques (en equipos, con la letra del equipo) y cuáles son de jugadores (los primeros) para la línea de apuntado.
  entities?.setNames(data.plan?.teams ? data.initials.map((n, i) => `${n}·${teamLetter(data.plan, i)}`) : data.initials);
  entities?.setHumans(data.plan ? data.plan.humans : 99);
  // Easter egg de TNI (sección 88): el tanque de quien se llame TNI cambia de aspecto y dispara bazocazos. Cada partida nueva (o vuelta
  // al lobby) devuelve la ciudad a la normalidad tras el pánico de la anterior.
  tniFlags = online && !ARCADE.on ? [] : (data.initials ?? []).map(isTniName); // la arcade sí tiene el easter egg (vuelve el 11-nov); las salas públicas antiguas no
  if (publicHost) {
    entities?.setMine(publicHost.mineFlags(data)); // sala a distancia: "TÚ" sobre los tanques de los jugadores de esta pantalla
    publicHost.update(data);
    quickLobby?.update(data);
    updateControls();
  }
  entities?.setTni(tniFlags);
  for (let i = 0; i < 4; i++) sfx.motionHeavy(i, Boolean(tniFlags[i])); // su motor, grave y pesado
  if (data.state !== previousState && (data.state === 'READY' || data.state === 'LOBBY')) { tniPanicked = false; life?.calm(performance.now()); }
  panel.set({ state: data.state, connected: data.connected });
  $('lobby').hidden = data.state !== 'LOBBY'; // el QR solo hace falta mientras se espera a los jugadores
  renderLobbyMode();
  devMenu?.setMap(data.mapChoice, data.map); // el selector de mapa vive en el menú de desarrollador
  renderRoom(data.room);
  $('lobby').classList.toggle('attract', Boolean(data.attract)); // con partida de fondo, la trama no oscurece la escena
  lastAttractOn = data.attractOn;
  devMenu?.setAttract(data.attractOn);
  devMenu?.setDifficulty(data.difficulty);
  fitLobbyCard();
  // Con el salvapantallas en marcha la partida de fondo se ve detrás del QR: no se borra en cada aviso del lobby.
  if ((data.state === 'LOBBY' && !data.attract) || (previousAttract && !data.attract)) resetVisuals();
  // Orden: intro (nombres con el VS que viajan a su tanque, 3 s) -> cuenta atrás 2, 1 -> GO!. Todo en READY salvo el GO!.
  if (data.state === 'READY' && previousState !== 'READY') {
    entities?.startIntro(performance.now());
    juice?.intro(data.initials ?? []);
  }
  if (data.state === 'PLAYING') {
    setBanner(null);
    if (previousState !== 'PLAYING') { juice?.matchStart(); play('go'); } // lobby_state se repite durante la partida: "GO!" solo al empezar
  }
  lastHud = undefined; // fuerza a repintar el HUD con las iniciales nuevas
});

// --- HUD ---
// Cartel central (cuenta atrás y resultado) en un panel con su pestaña de título: se lee sobre cualquier parte de la ciudad.
function setBanner(html, tab = '') {
  $('banner').hidden = html === null;
  if (html !== null) $('banner').innerHTML = `<div class="card ui-panel">${tab ? `<div class="ui-title">${tab}</div>` : ''}${html}</div>`;
}
function formatTime(seconds) {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
// Corazones de las fichas: lleno = vida, apagado = perdida (el dibujo vive en hearts.js).
// Vidas con las que empezó cada tanque (se aprende del primer estado recibido: en el modo de un jugador, el jugador tiene más).
const maxLivesOf = [0, 0, 0, 0];
let maxLives = 0; // el máximo de todos (lo usa la animación de vida perdida)
function heartsHtml(lives, slot) {
  maxLivesOf[slot - 1] = Math.max(maxLivesOf[slot - 1], lives);
  maxLives = Math.max(maxLives, lives);
  const max = maxLivesOf[slot - 1];
  const lost = juice ? juice.lostHeart(slot, performance.now()) : -1;
  let html = '';
  for (let i = 0; i < max; i++) html += i < lives ? HEART_FULL : i === lost ? HEART_LOST : HEART_EMPTY;
  return html;
}
const hudCache = ['', ''];
// Ping de cada jugador: lo mide su mando y lo reenvía el servidor.
const playerPing = [null, null];
const pingText = (i) => (playerPing[i] === null ? 'PING --' : `PING ${playerPing[i]} MS`);
socket.on(EVENTS.PLAYER_PING, ({ slot, ms }) => {
  playerPing[slot - 1] = ms;
  const el = document.getElementById(`ping-p${slot}`);
  if (el) el.textContent = pingText(slot - 1);
});
// Ficha de los bots (modo de un jugador, abajo a la derecha): una fila por bot con su color, su nombre y sus corazones;
// los eliminados quedan tachados y apagados.
function botsHtml(state) {
  let html = '';
  for (let i = 1; i < 4; i++) {
    const lives = state ? state.tanks[i][3] : 0;
    const dead = state !== null && lives <= 0;
    // Power-ups activos del bot: solo el icono junto al nombre (parpadea al final, como en las fichas de los jugadores).
    const icons = state && !dead ? state.effects[i].map(([type, sec]) => {
      const kind = POWERUP_TYPES[type];
      return `<span class="botfx fx-${kind} ${sec <= 1 ? 'ending last' : sec <= 2 ? 'ending' : ''}">${POWERUP_ICONS[kind]}</span>`;
    }).join('') : '';
    html += `<div class="botrow${dead ? ' dead' : ''}" style="--bc: var(--p${i + 1})"><span class="chip">B${i + 1}</span><span class="name">${lobby.initials[i] ?? ''}</span>`
      + `${icons}<span class="hearts">${state ? heartsHtml(lives, i + 1) : ''}</span></div>`;
  }
  return html;
}
// Combate de 3 o 4 tanques con 2 o más jugadores: un panel por lado con una fila por tanque (humanos con chip "P", bots con "B").
function rowsHtml(state, indices) {
  const plan = lobby.plan;
  let html = '';
  for (const i of indices) {
    if (i >= lobby.initials.length) continue;
    const lives = state ? state.tanks[i][3] : 0;
    const dead = state !== null && lives <= 0;
    const human = i < (plan?.humans ?? 0);
    const icons = state && !dead ? state.effects[i].map(([type, sec]) => {
      const kind = POWERUP_TYPES[type];
      return `<span class="botfx fx-${kind} ${sec <= 1 ? 'ending last' : sec <= 2 ? 'ending' : ''}">${POWERUP_ICONS[kind]}</span>`;
    }).join('') : '';
    const readyTag = human && lobby.ready?.[i] && lobby.state !== 'PLAYING' && lobby.state !== 'GAME_OVER' ? '<span class="ready">LISTO</span>' : '';
    html += `<div class="botrow${dead ? ' dead' : ''}" style="--bc: var(--p${i + 1})"><span class="chip">${human ? 'P' : 'B'}${i + 1}</span><span class="name">${lobby.initials[i] ?? ''}</span>`
      + `${readyTag}${icons}<span class="hearts">${state ? heartsHtml(lives, i + 1) : ''}</span></div>`;
  }
  if (plan?.teams) html += `<div class="teamtag">${teamLetter(plan, indices[0]) === 'A' ? 'EQUIPO A' : 'EQUIPO B'}</div>`;
  return html;
}
function updateHud(state) {
  const humans = lobby.plan?.humans ?? 0;
  const solo = lobby.initials.length > 2 && humans <= 1; // 1 contra 3 bots: el jugador a la izquierda y los 3 bots a la derecha
  const multi = lobby.initials.length > 2 && humans >= 2; // 3 o 4 tanques con varios jugadores
  for (const i of [0, 1]) {
    const name = lobby.initials[i];
    let html;
    if (multi) {
      html = rowsHtml(state, i === 0 ? [0, 2] : [1, 3]);
    } else if (solo && i === 1) {
      html = botsHtml(state);
    } else if (!name) {
      html = `<div class="row"><span class="chip">P${i + 1}</span><span class="name wait">ESPERANDO JUGADOR</span></div>`;
    } else {
      // Power-ups activos: icono + nombre. El tiempo que queda se ve en el icono: parpadea en los 2 últimos segundos
      // y más rápido en el último (el HTML solo cambia al pasar esos umbrales, así la animación no se reinicia).
      const effects = state ? state.effects[i].map(([type, sec]) => {
        const kind = POWERUP_TYPES[type];
        const ending = sec <= 1 ? 'ending last' : sec <= 2 ? 'ending' : '';
        // Recién recogido: el chip espera a que llegue el icono volador y entonces "salta" (animación en arcade.css).
        const sincePick = juice ? performance.now() - juice.pickedAt(i + 1, kind) : Infinity;
        const entry = sincePick < FLY_MS ? 'incoming' : sincePick < FLY_MS + 600 ? 'enter' : '';
        return `<span class="fx-chip fx-${kind} ${ending} ${entry}">${POWERUP_ICONS[kind]}${POWERUP_NAMES[kind]}</span>`;
      }).join('') : '';
      // Antes de empezar, el lobby enseña quién ya ha pulsado LISTO en su móvil; luego, el ping.
      const readyTag = lobby.ready?.[i] && lobby.state !== 'PLAYING' && lobby.state !== 'GAME_OVER';
      html = `<div class="row"><span class="chip">P${i + 1}</span><span class="name">${name}</span>`
        + (readyTag ? '<span class="ready">LISTO</span>' : `<span class="ping" id="ping-p${i + 1}">${pingText(i)}</span>`) + '</div>'
        + `<div class="hearts">${state ? heartsHtml(state.tanks[i][3], i + 1) : ''}</div><div class="fx">${effects}</div>`;
    }
    if (html !== hudCache[i]) { // solo se toca el DOM si ha cambiado algo
      $(`hud-p${i + 1}`).innerHTML = html;
      hudCache[i] = html;
    }
    $(`hud-p${i + 1}`).classList.toggle('bots', solo && i === 1);
    $(`hud-p${i + 1}`).classList.toggle('multi', multi);
  }
  const timer = state && !lobby.attract ? formatTime(state.timeLeft) : '--:--'; // la partida de fondo no enseña tiempo
  if ($('timer').textContent !== timer) $('timer').textContent = timer;
  // Últimos 10 s: el cronómetro parpadea en fucsia (arcade.css).
  $('timer').classList.toggle('urgent', Boolean(state) && !lobby.attract && state.timeLeft > 0 && state.timeLeft <= 10 && !matchOver);
}

// --- Mensajes de la partida ---
socket.on(EVENTS.COUNTDOWN, ({ seconds }) => {
  play('countdown', { n: seconds });
  if (juice) juice.countdown(seconds, lobby.initials, performance.now()); // letras arcade (sin la tarjeta)
  else setBanner(`<div class="big">${seconds}</div>`, 'PREPARADOS');
});
socket.on(EVENTS.STATE_UPDATE, (state) => {
  latest = state;
  buffer.push(state, performance.now());
  panel.countSnapshot();
});
socket.on(EVENTS.MATCH_EVENT, (event) => {
  const now = performance.now();
  if (event.type === 'attract_reset') { juice?.reset(); return; } // empieza una partida nueva de la partida de fondo
  entities?.onEvent(event, now);
  // Disparo de TNI: bazocazo con fogonazo; el primero de la partida hace que la ciudad entera huya gritando.
  const tniShot = event.type === 'shot' && tniFlags[event.slot - 1] && !lobby.attract;
  if (tniShot) {
    entities?.tniMuzzle(event.slot, now);
    const x = latest?.tanks?.[event.slot - 1]?.[0] ?? arena.width / 2;
    play('bazooka', { pan: panFor(x, arena.width) });
    if (!tniPanicked) { tniPanicked = true; play('crowdScream', {}, 120); life?.panic(now); }
  }
  // Reventón de un cohete de TNI: sonido bestia (en vez de la explosión normal) y temblor de cámara.
  const tniBlast = event.type === 'explosion' && event.tni && !lobby.attract;
  if (tniBlast) { play('tniBoom', { pan: panFor(event.x, arena.width) }); screenShake(now); }
  for (const { name, args, delayMs } of soundsForEvent(event, latest, arena.width)) if (!(tniShot && name === 'shot') && !(tniBlast && name === 'explosion')) play(name, args, delayMs);
  if (!lobby.attract) juice?.onEvent(event, now); // en la partida de fondo no hay textos ni zoom: taparían el QR
});

// --- Top 10: se pinta con textContent (nunca como HTML) por si alguna vez llegara un dato inesperado ---
let top10 = []; // un único Top 10 de todos los modos (sección 70)
// Panel LED del stand (sección 75): el podio del Top 3 por Bluetooth. Solo en el stand; si no hay panel, no hace nada.
const led = online ? null : createLed({ onChange: (s) => devMenu?.setLed?.(s) });
led?.autoConnect();
if (led) { // el primer toque o tecla (p. ej. "PULSA UNA TECLA" del arranque) puede abrir la lista de Bluetooth la primera vez
  const askLed = () => { window.removeEventListener('keydown', askLed); window.removeEventListener('pointerdown', askLed); led.pairOnGesture(); };
  window.addEventListener('keydown', askLed);
  window.addEventListener('pointerdown', askLed);
}
socket.on(EVENTS.LEADERBOARD_UPDATE, (data) => {
  top10 = data.top ?? [];
  if (ARCADE.on) return; // versión arcade: sin Top 10
  if (publicHost) { publicHost.ranking(data); return; } // versión pública: ranking global de la semana
  renderTop10();
  led?.showTop(top10);
});
function renderTop10() {
  if (publicHost) return; // lo pinta publicHost.js
  const top = top10;
  const list = $('top10-list');
  list.replaceChildren();
  if (top.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'SÉ EL PRIMERO EN ENTRAR AL RANKING';
    list.appendChild(empty);
    return;
  }
  top.forEach((entry, index) => {
    const row = document.createElement('li');
    const position = document.createElement('span');
    position.className = 'pos';
    position.textContent = String(index + 1);
    const name = document.createElement('span');
    name.textContent = entry.initials;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = String(entry.score);
    row.append(position, name, score);
    list.appendChild(row);
  });
}
socket.on(EVENTS.GAME_OVER, (result) => {
  matchOver = true;
  resultsShown = false;
  const winners = result.winners ?? (result.winner === null ? [] : [result.winner]);
  const nameOf = (slot) => result.scores[slot - 1].initials ?? `P${slot}`;
  const soloMode = result.kind === 'solo' || (result.kind === undefined && result.scores.length > 2);
  const teamMode = Array.isArray(result.teams);
  const humanWon = winners.some((w) => !result.scores[w - 1].bot);
  // Un jugador: victoria o derrota; equipos: gana la pareja; resto: quién gana.
  const span = (slot) => `<span class="p${slot}">${nameOf(slot)}</span>`;
  const text = winners.length === 0 ? 'EMPATE'
    : soloMode ? (result.winner === 1 ? `¡VICTORIA ${span(1)}!` : `GANA ${span(result.winner)}`)
      : teamMode ? `GANAN ${winners.map(span).join(' Y ')}`
        : `GANA ${span(winners[0])}`;
  // Tabla de resultados: jugador, puntos, vidas, precisión y puesto en el ranking.
  // Versión arcade: sin ranking, sin columna PUESTO.
  const head = ['', 'PUNTOS', 'VIDAS', 'PRECISIÓN', ...(ARCADE.on ? [] : ['PUESTO'])].map((h) => `<span class="head">${h}</span>`).join('');
  const rows = result.scores.map((s) => [
    `<span class="who" style="color: var(--p${s.slot})">${s.initials ?? `P${s.slot}`}</span>`,
    `<span>${s.bot ? '-' : s.score}</span>`, `<span>${Math.max(0, s.lives)}</span>`, `<span>${s.accuracy}%</span>`,
    ...(ARCADE.on ? [] : [`<span>${typeof s.rank === 'number' ? `#${s.rank}` : '-'}</span>`]),
  ].join('')).join('');
  // El cartel de resultados espera a que acabe la animación del final (KO, GAME OVER...).
  const showResults = () => {
    resultsShown = true; // vuelve la música calma
    setBanner(`<div class="big">${text}</div><div class="results">${head}${rows}</div>`, 'RESULTADO');
    // Jingle de resultados: en solitario, victoria o derrota del jugador; en 1 contra 1, siempre el alegre.
    play(humanWon ? 'win' : 'lose');
    // Si alguna puntuación de la partida entra en el Top 10 (rank <= 10): confeti y "NEW RECORD" / "TOP 10".
    const ranks = result.scores.map((s) => s.rank).filter((r) => typeof r === 'number');
    if (ranks.length && !ARCADE.on) juice?.celebrate(Math.min(...ranks));
  };
  if (juice) juice.whenFinaleDone(showResults); else showResults();
});

// --- Bucle de dibujo: un fotograma por cada refresco de la pantalla ---
// Tope de fotogramas: 30 por defecto (a este juego le sobra y el portátil va más fresco y estable); el menú de GRÁFICOS permite 60.
// La holgura de 2 ms evita saltarse un fotograma por redondeos del navegador (en una pantalla de 60 Hz salen 30 exactos).
let fpsCap = 30;
try { if (window.localStorage.getItem('doersforce.menu.fpscap') === '60') fpsCap = 60; } catch { /* sin almacenamiento */ }
let frameInterval = 1000 / fpsCap;
quality.setBudget(fpsCap === 60 ? 34 : 40);
function setFpsCap(cap) {
  fpsCap = cap === 60 ? 60 : 30;
  frameInterval = 1000 / fpsCap;
  quality.setBudget(fpsCap === 60 ? 34 : 40);
  try { window.localStorage.setItem('doersforce.menu.fpscap', String(fpsCap)); } catch { /* da igual */ }
}
let lastRenderAt = 0;
// Con la pestaña oculta el navegador para o retrasa los fotogramas: al volver no se mide ese parón como lentitud.
document.addEventListener('visibilitychange', () => { lastFrameAt = 0; lastRenderAt = 0; });
function frame(now) {
  if (lastRenderAt && now - lastRenderAt < frameInterval - 2) { requestAnimationFrame(frame); return; }
  lastRenderAt = lastRenderAt ? now - ((now - lastRenderAt) % frameInterval) : now; // mantiene el ritmo sin acumular desvío
  panel.frame(now);
  logoIntro.update(now); // intro del título (flash y vuelta al lobby)
  quickLobby?.tick(now); // partida rápida: el reloj de "buscando jugadores" y los botones
  padSetup?.update(); // configurando un mando nuevo (si hay uno)
  if (nameGate?.open && !padSetup?.active) for (const action of namePad.read(now)) nameGate.pad(action); // el nombre, con el mando
  keyboard?.update(now); // teclado y ratón o mando del PC (también en la espera: START = LISTO)
  lobbyLogo.update(now); // chispas del logo del lobby
  if (sceneApi && lastFrameAt && !document.hidden) {
    const lowered = quality.update(now - lastFrameAt, now);
    if (lowered !== null) {
      sceneApi.setQuality(lowered);
      life?.setLevel(lowered);
      panel.set({ quality: `${lowered} (auto)` });
      console.info(`Calidad gráfica bajada al nivel ${lowered} para mantener la fluidez`);
    }
  }
  lastFrameAt = now;
  if (use2d) {
    if (latest !== lastDrawn2d) { view2d.render(latest); lastDrawn2d = latest; }
  } else {
    const state = buffer.sample(now);
    juice.beforeDraw(now); // zoom de cámara (impacto, KO) antes de colocar nada en pantalla
    life.update(now, state); // gente, tráfico y luces: huyen de los tanques y proyectiles del estado dibujado
    applySoundscape(); // música y ambiente del momento actual (solo hace algo cuando cambia)
    // Ambiente: de vez en cuando se oye pasar uno de los coches o motos que se ven (con su posición en el estéreo).
    const cars = life.vehicles?.cars ?? [];
    for (let i = 0; i < cars.length; i++) {
      carNext[i] ??= now + Math.random() * 6000;
      // Bocinazo cuando un coche empieza a esquivar a un tanque (a lo sumo uno cada 9 s y casi siempre; solo con los coches visibles).
      const swerving = cars[i].x > -50 && Math.abs(cars[i].lat ?? 0) > 0.2;
      if (swerving && !carSwerving[i] && now >= hornNext && !matchOver) { hornNext = now + 9000; if (Math.random() < 0.7) sfx.ambienceEvent('horn', { x: cars[i].x }); }
      carSwerving[i] = swerving;
      if (now >= carNext[i] && cars[i].x > -50 && cars[i].v > 0.8) {
        carNext[i] = now + 7000 + Math.random() * 8000;
        if (!matchOver) sfx.ambienceEvent('car', { x: cars[i].x, scooter: cars[i].r < 0.4 });
      }
    }
    if (state) {
      drawnState = state;
      // Partida rápida: el rayo de tu tanque sigue al ratón al instante (sin esperar a que el servidor devuelva el ángulo).
      if (keyboard) { const a = keyboard.aim; if (a !== null && state.tanks[keyboard.slot - 1]) state.tanks[keyboard.slot - 1].aim = a; }
      entities.update(state, now, !matchOver);
      juice.afterDraw(state, now);
      // Sonido de movimiento ("tanquecito de juguete"): solo durante la partida real (ni salvapantallas ni resultados).
      const speeds = motionTracker.update(state, now);
      const quiet = lobby.attract || matchOver || lobby.state !== 'PLAYING';
      for (let i = 0; i < state.tankCount; i++) sfx.motion(i, quiet ? 0 : speeds[i], panFor(state.tanks[i].x));
    }
    sceneApi.render();
    applyShake(now);
  }
  if (latest !== lastHud) { updateHud(latest); lastHud = latest; }
  if (now - lastFpsAt > 500) { // FPS siempre visibles arriba a la derecha (F3 enseña el detalle)
    $('fps').textContent = `${panel.fps()} FPS`;
    lastFpsAt = now;
  }
  requestAnimationFrame(frame);
}
let lastFpsAt = 0;
updateHud(null);
requestAnimationFrame(frame);

startLatencyProbe(socket, (ms) => panel.set({ ping: ms }));
// Calidad desde el menú: "auto" deja que baje sola; "low" / "mid" / "high" la fijan a mano (niveles 3 / 1 / 0).
const QUALITY_LEVELS = { low: 3, mid: 1, high: 0 };
function applyQualityMode(mode) {
  if (!sceneApi) return;
  if (mode === 'auto') { quality.setAuto(true); panel.set({ quality: `${sceneApi.qualityLevel} (auto)` }); return; }
  const level = QUALITY_LEVELS[mode];
  quality.setAuto(false);
  quality.setLevel(level);
  sceneApi.setQuality(level);
  life?.setLevel(level);
  panel.set({ quality: `${level} (fija)` });
}
// Menú de ajustes: el stand lo tiene completo; en una sala online solo lleva SONIDO y GRÁFICOS, salvo en modo dev (otra contraseña),
// que tiene el mismo menú de pruebas que el stand (menos el ranking y la pestaña STAND). Se abre con la tecla M.
// Mandos físicos enchufados a esta pantalla (sección 72): cada uno entra como MANDO1, MANDO2... con START + SELECT.
// Versión pública: en mandos estándar basta START para unirse y para LISTO; nombre al azar, A = ¿cuál soy?, Y = cambiar el nombre. En las salas en las
// que cada uno juega en su pantalla (quick) no hay mandos: esa pantalla ya es un jugador (teclado o su móvil).
const gamepads = quick ? null : createGamepads({ startOnly: online, isLobby: () => lobby.state === 'LOBBY', isPlaying: () => lobby.state === 'PLAYING', pause: pauseMenu, isBusy: (index) => padSetup?.busy(index) ?? false, onLobbyNav: (dir) => publicHost?.step(dir),
  onChange: () => { renderWaiting(lobby.joinLeft != null); setTimeout(() => renderWaiting(lobby.joinLeft != null), 1500); } }); // el destello de A se apaga solo
// Versión pública: la tarjeta ASÍ SE JUEGA (controlsCard.js). Solo enseña los controles de lo que de verdad se usa (10-nov): si nadie juega
// con teclado, no salen los del teclado; igual con el mando y el móvil. Con dos tipos a la vez (pantalla compartida: móviles y mandos), mitad y mitad.
const controls = online ? createControlsCard({ $ }) : null;
function updateControls() {
  if (!controls) return;
  const connectedPad = [...(navigator.getGamepads?.() ?? [])].some((p) => p && p.connected);
  if (keyboard) { // en tu pantalla: lo que estás usando ahora (teclado, mando del PC o tu móvil)
    if (keyboard.mode === 'phone') { controls.set({ sets: ['phone'] }); return; }
    if (keyboard.source === 'pad') { controls.set({ sets: ['pad'], note: `START: ${ARCADE.on ? 'JUGAR' : 'LISTO'} Y PAUSA · MANTÉN SELECT: SALIR · TOCA EL TECLADO PARA VOLVER A ÉL` }); return; }
    controls.set({ sets: ['keyboard'], note: `ENTER: ${ARCADE.on ? 'JUGAR' : 'LISTO'} · ESC: PAUSA${connectedPad ? ' · TOCA EL MANDO PARA JUGAR CON ÉL' : ''}` });
    return;
  }
  // Pantalla compartida: el móvil si alguien juega con él (o aún no hay nadie: el QR invita a entrar con el móvil) y el mando si hay uno.
  const devices = (lobby.devices ?? []).filter(Boolean);
  const phones = devices.includes('phone') || devices.length === 0;
  const pads = connectedPad || devices.includes('pad');
  const sets = [...(phones ? ['phone'] : []), ...(pads ? ['pad'] : [])];
  $('pad-hint').hidden = pads; // "¿TENÉIS MANDO? ENCHUFADLO..." bajo el QR: solo si aún no hay ninguno
  controls.set({ sets: sets.length ? sets : ['phone'], note: pads ? 'MANDO: START ENTRA Y LISTO · MANTÉN SELECT: SALIR · A: ¿CUÁL SOY? · Y: NOMBRE' : '¿TENÉIS MANDO? ENCHUFADLO AL ORDENADOR Y PULSA START' });
}
if (online) for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { updateControls(); renderWaiting(lobby.joinLeft != null); });
const menuDeps = { $, socket, juice, sfx, gamepads, padSetup, onIntro: (short) => logoIntro.start({ short, prelude: !short }), onIntroRepeat: (on) => configureIntroRepeat(on), onQuality: applyQualityMode, onFpsCap: setFpsCap, getFpsCap: () => fpsCap, resetVisuals, onDemo: (on) => { $('lobby').hidden = on || lobby.state !== 'LOBBY'; } };
if (!online) {
  // Stand: por defecto solo ajustes de sonido y vídeo; el interruptor del menú activa las opciones de desarrollador (F3, tecla P, tests...).
  $('debug').dataset.locked = '1';
  isDev = false;
  devMenu = setupDevMenu({ ...menuDeps, led, full: true, withRanking: true, devToggle: true,
    onDevMode: (on) => { isDev = on; if (on) delete $('debug').dataset.locked; else $('debug').dataset.locked = '1'; } });
}
else {
  $('fps').hidden = true;
  $('debug').dataset.locked = '1'; // hasta saber si es modo dev, ni FPS ni panel F3
  fetch('/api/mode').then((res) => res.json()).catch(() => ({})).then((info) => {
    isDev = info.dev === true;
    if (isDev) delete $('debug').dataset.locked;
    devMenu = setupDevMenu({ ...menuDeps, full: isDev, withRanking: isDev, home: true });
    devMenu.setAttract(lastAttractOn);
    devMenu.setDifficulty(lobby.difficulty);
    fitLobbyCard();
  });
}

// Botón bajo el QR: alterna entre multijugador y solitario (1 contra 3 bots). Cada modo tiene su Top 10. Para pasar a solitario
// no puede haber dos jugadores dentro (el servidor también lo comprueba).
// Pantalla de espera (hay jugadores en el lobby): sustituye al logo por la cuenta atrás, la lista de jugadores (listos o no) y un mini tutorial.
let waitingCache = '';
function renderWaiting(joining) {
  const on = lobby.state === 'LOBBY' && (Boolean(lobby.plan) || quick || sharedRoom) && !lobby.attract; // partida rápida y pantalla compartida: siempre la sala de espera (nunca el HOME)
  $('lobby').classList.toggle('waiting', on);
  document.body.classList.toggle('lobby-on', lobby.state === 'LOBBY');
  document.body.classList.toggle('play-on', lobby.state === 'PLAYING');
  document.body.classList.toggle('home-on', lobby.state === 'LOBBY' && !lobby.plan && !sharedRoom); // HOME = lobby vacío: sin barra superior, solo logo + QR + Top 10
  $('waiting').hidden = !on;
  if (!on) return;
  const num = $('wait-num');
  const text = joining ? String(lobby.joinLeft) : '--';
  if (num.textContent !== text) num.textContent = text;
  num.classList.toggle('idle', !joining);
  num.classList.toggle('tick', joining);
  // Con la cuenta atrás en marcha solo se ve "LA PARTIDA EMPIEZA EN" y el número (sin explicaciones); el aviso solo sale mientras faltan LISTOS.
  $('wait-sub').textContent = joining ? '' : online ? PUBLIC_TEXT.waitingReady : 'ESPERANDO A QUE TODOS PULSEN LISTO EN EL MÓVIL';
  // Pantalla compartida sin nadie todavía: cómo se entra (móvil o mando), en vez de una cuenta atrás vacía.
  if (sharedRoom && !lobby.plan && !quick) {
    if ($('wait-title').textContent !== '¿QUIÉN JUEGA?') $('wait-title').textContent = '¿QUIÉN JUEGA?';
    num.textContent = '';
    $('wait-sub').textContent = 'ESCANEA EL QR CON TU MÓVIL O PULSA START EN UN MANDO';
  } else if (sharedRoom && $('wait-title').textContent === '¿QUIÉN JUEGA?') $('wait-title').textContent = 'LA PARTIDA EMPIEZA EN';
  $('wait-count').classList.toggle('only-num', joining && !quick); // en las salas en tu pantalla, la frase de debajo sigue (quickLobby.js)
  const humans = lobby.plan?.humans ?? 0; // partida rápida: la pantalla sale antes de que su teclado haya entrado
  const mine = publicHost ? publicHost.mineFlags(lobby) : [];
  // Sin LISTO/ESPERANDO en las fichas: partida pública con gente (arranca sola) o tu pantalla con un solo jugador (su botón ya dice qué hacer).
  const auto = ARCADE.on || (Boolean(lobby.room?.auto) && humans >= 2) || (quick && humans <= 1);
  const now = performance.now();
  let html = '';
  for (let i = 0; i < 4; i++) {
    if (i < humans) {
      const slot = i + 1;
      const ready = Boolean(lobby.ready?.[i]);
      // Versión pública: con qué juega cada uno (MÓVIL / MANDO / TECLADO) y cuáles son de esta pantalla ("TÚ").
      // Tu jugador con el mando del PC (keyboardPlayer.source): MANDO en tu ficha (el servidor lo sigue contando como teclado de esta pantalla).
      const kind = keyboard && slot === keyboard.slot && keyboard.mode === 'keyboard' && keyboard.source === 'pad' ? 'pad' : lobby.devices?.[i];
      const device = publicHost && kind ? `<span class="dev">${({ pad: 'MANDO', keyboard: 'TECLADO' })[kind] ?? 'MÓVIL'}</span>` : '';
      const you = mine[i] ? '<span class="you">TÚ</span>' : '';
      // Nombre: editable en tu ficha (pantalla propia) o en la de un mando (pantalla compartida); el mando lo edita también letra a letra.
      const pad = lobby.devices?.[i] === 'pad' ? gamepads?.bySlot(slot) : null;
      const canEdit = Boolean(publicHost) && ((keyboard && keyboard.slot === slot && keyboard.mode === 'keyboard') || Boolean(pad));
      let name = lobby.initials[i] ?? '';
      if (editingSlot === slot) name = '<input class="wp-input" maxlength="3" autocomplete="off" spellcheck="false" aria-label="Nuevo nombre (3 letras)">';
      else if (pad?.edit) name = pad.edit.letters.map((l, k) => `<span class="${k === pad.edit.pos ? 'cur' : ''}">${l}</span>`).join('');
      const action = editingSlot === slot ? `<button class="wp-ok" type="button" data-slot="${slot}">OK</button>`
        : pad?.edit ? '<span class="wp-help">↑↓ LETRA · ←→ MOVER · A GUARDA</span>'
          : canEdit ? `<button class="wp-edit" type="button" data-slot="${slot}">EDITAR</button>` : '';
      const flash = pad && now - pad.flashAt < 1400 ? ' flash' : '';
      // Mando sin configurar (no lo reconoce el navegador y se cerró su ventana): NO CONFIGURADO en su ficha abre la configuración (padSetup.js).
      let setupPad = null;
      if (padSetup && pad && padSetup.needsSetup(pad.index)) setupPad = pad.index;
      else if (padSetup && keyboard && keyboard.slot === slot && keyboard.mode === 'keyboard') {
        setupPad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected && padSetup.needsSetup(p.index))?.index ?? null;
      }
      const setupBtn = setupPad !== null ? `<button class="wp-setup" type="button" data-pad="${setupPad}">NO CONFIGURADO</button>` : '';
      // LISTO se ve siempre que alguien lo está (teclado, ratón, mando o móvil); ESPERANDO solo donde hace falta pulsarlo.
      const state = ready ? '<span class="state ok">LISTO</span>' : auto ? '' : '<span class="state no">ESPERANDO</span>';
      // Salas en tu pantalla con gente: corona junto al nombre del anfitrión (privada: quien la creó; pública: quien llegó primero).
      const room = lobby.room;
      // Arcade: nadie elige nada, no hay anfitrión que señalar.
      const crown = !ARCADE.on && room?.type === 'quick' && !room.solo && lobby.screens?.[i] && lobby.screens[i] === room.hostScreen ? CROWN : '';
      html += `<div class="wp${flash}${pad?.edit ? ' editing' : ''}" style="--c: var(--p${slot})"><span class="chip">P${slot}</span>${crown}<span class="name">${name}</span>${action}${setupBtn}${you}${device}${state}</div>`;
    } else {
      if (quick && roomSolo) { // en solitario los huecos son los 3 bots, con sus nombres y su color
        html += `<div class="wp" style="--c: var(--p${i + 1})"><span class="chip">B${i + 1}</span><span class="name">${lobby.initials?.[i] ?? 'BOT'}</span><span class="dev">BOT</span></div>`;
        continue;
      }
      html += `<div class="wp empty" style="--c: #2c3756"><span class="chip">P${i + 1}</span><span class="name">${ARCADE.on ? 'BUSCANDO JUGADORES...' : quick ? (roomPrivate ? 'LIBRE · ¡ÚNETE!' : 'LIBRE · BUSCANDO...') : online ? PUBLIC_TEXT.freeSlot : 'LIBRE · ESCANEA EL QR'}</span></div>`;
    }
  }
  if (html !== waitingCache) {
    $('wait-players').innerHTML = html;
    waitingCache = html;
    const input = $('wait-players').querySelector('.wp-input'); // al repintar, el editor conserva lo escrito y el foco
    if (input) { input.value = editDraft; input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
  quickLobby?.tick(performance.now()); // en tu pantalla, sus textos mandan YA (si no, el texto común se ve un fotograma: parpadeo)
}
// --- EDITAR el nombre (versión pública): en tu ficha (pantalla propia) o en la de un mando (pantalla compartida) ---
let editingSlot = null;
let editDraft = '';
function startEdit(slot) { editingSlot = slot; editDraft = lobby.initials?.[slot - 1] ?? ''; waitingCache = ''; renderWaiting(lobby.joinLeft != null); }
function endEdit(save) {
  const slot = editingSlot;
  editingSlot = null;
  waitingCache = '';
  if (save && /^[A-Z]{3}$/.test(editDraft)) {
    if (keyboard && keyboard.slot === slot) keyboard.rename(editDraft); else gamepads?.renameSlot(slot, editDraft);
  }
  renderWaiting(lobby.joinLeft != null);
}
$('wait-players').addEventListener('click', (event) => {
  const edit = event.target.closest('.wp-edit');
  if (edit) { startEdit(Number(edit.dataset.slot)); return; }
  const setup = event.target.closest('.wp-setup');
  if (setup) { setup.blur(); padSetup?.open(Number(setup.dataset.pad)); return; }
  if (event.target.closest('.wp-ok')) endEdit(true);
});
$('wait-players').addEventListener('input', (event) => {
  if (!event.target.classList.contains('wp-input')) return;
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  editDraft = event.target.value;
});
$('wait-players').addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('wp-input')) return;
  if (event.key === 'Enter') { event.preventDefault(); endEdit(true); }
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endEdit(false); }
});
function renderLobbyMode() {
  const text = { banner: describePlan(lobby.plan), tab: 'TOP 10', hint: '' }; // el modo sale solo de cuántos jugadores hay
  const joining = lobby.joinLeft != null; // todos listos: cuenta atrás de entrada, con el QR a la vista por si llega alguien
  const banner = text.banner; // la cajita sobre el QR sigue enseñando el modo; la cuenta atrás va en su propio panel grande
  if ($('mode-banner').textContent !== banner) $('mode-banner').textContent = banner;
  renderWaiting(joining);
  $('lobby-card').classList.toggle('solo', Boolean(lobby.solo));
  const tabText = lobby.room?.dev ? `${text.tab} · DEV` : text.tab; // el ranking de las salas dev es aparte
  if (!publicHost && $('top10-tab').textContent !== tabText) $('top10-tab').textContent = tabText; // en la pública el título lo pone publicHost.js
  const room = lobby.room;
  $('mode-hint').textContent = joining ? ''
    : text.hint;
  if (room) { // sala: código y cuántas pantallas hay (a distancia, cada jugador abre la suya)
    const line = room.type === 'quick' ? (room.solo ? '' : room.private ? `CÓDIGO DE LA SALA: ${room.code}` : 'CON JUGADORES DE CUALQUIER SITIO')
      : room.type === 'online' ? `A DISTANCIA · SALA ${room.code} · ${room.screens} PANTALLA${room.screens === 1 ? '' : 'S'}` : `1 PANTALLA · SALA ${room.code}`;
    $('room-line').textContent = room.dev ? `${line} · DEV` : line;
    $('room-line').classList.toggle('dev', Boolean(room.dev));
    if (!quick) $('invite-btn').hidden = room.type !== 'online'; // en la partida rápida ese botón es "VOLVER AL TECLADO" (quickLobby.js)
  }
  renderTop10();
  quickLobby?.tick(performance.now()); // los textos de tu sala, en el mismo fotograma (sin parpadeo)
}

// --- QR: la URL la decide el servidor. Con el túnel de Cloudflare (lo abre "npm run server") funciona desde cualquier
// dispositivo y red; mientras se abre se pregunta cada 2 s, y si falla se usa la IP de la red local (solo misma Wi-Fi). ---
let drawnUrl = null;
let pollingQr = false;
async function drawQr() {
  try {
    const { playUrl, tunnel } = await (await fetch('/api/host-config')).json();
    if (tunnel === 'starting') {
      $('play-url').textContent = 'CONECTANDO TÚNEL…';
      if (!pollingQr) setTimeout(drawQr, 2000); // con el sondeo de 5 s ya activo no se apila otra cadena
      return;
    }
    // El enlace no se enseña (el QR basta); solo un aviso si no hay túnel.
    $('play-url').textContent = tunnel === 'failed' ? 'SIN TÚNEL: SOLO MÓVILES EN ESTA WI-FI' : '';
    if (!pollingQr) { pollingQr = true; setInterval(drawQr, 5000); } // si el servidor se reinicia con esta pantalla abierta, el QR se actualiza solo
    if (playUrl !== drawnUrl) {
      // Colores con contraste máximo: un QR con poco contraste falla al escanear.
      await QRCode.toCanvas($('qr'), playUrl, { width: 300, margin: 1, color: { dark: '#05050c', light: '#ffffff' } });
      drawnUrl = playUrl;
    }
  } catch (err) {
    $('play-url').textContent = 'No se pudo generar el QR';
    console.error(err);
    setTimeout(drawQr, 3000);
  }
}
if (online) $('qr').hidden = true; // en una sala el QR lo dibuja renderRoom() en cuanto llega el estado de la sala
else drawQr();

// --- Sala online: QR de ESTA pantalla (el de su puesto). El resto del lobby (modo, Top 10, sala, aviso) lo pinta renderLobbyMode. ---
let roomQrFor = '';
async function renderRoom(room) {
  if (!online || !room || quick) return; // partida rápida: el QR es el del relevo al móvil (quickLobby.js)
  const link = playLink();
  if (roomQrFor !== link) {
    roomQrFor = link;
    $('qr').hidden = false;
    await QRCode.toCanvas($('qr'), link, { width: 300, margin: 1, color: { dark: '#05050c', light: '#ffffff' } });
  }
  $('play-url').textContent = '';
}
$('invite-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(inviteLink()); $('invite-btn').textContent = PUBLIC_TEXT.inviteCopied; } catch { $('invite-btn').textContent = inviteLink(); }
  setTimeout(() => { $('invite-btn').textContent = PUBLIC_TEXT.invite; }, 2500);
});

// La tarjeta del QR y el Top 10 se encoge si la ventana es pequeña: nunca tapa el marcador superior ni las fichas de
// jugador, en cualquier resolución. Se mide la tarjeta sin escalar y se elige la escala que cabe entre la barra
// superior y las fichas. Se recalcula al cambiar el tamaño de la ventana y al mostrar el lobby.
const LOGO_PIXEL = 4; // píxeles de pantalla por píxel del logo a escala 1 (1080 p; era 6, "enorme"); con la ventana más pequeña baja en enteros
// Tamaño de diseño del lobby (1080 p): la pantalla de espera es la más grande; la escala se calcula con ESTAS medidas (o las reales si las superan)
// para que el QR, la cuenta atrás y todo lo demás midan SIEMPRE lo mismo en el logo y en la espera, y solo cambien al cambiar la ventana.
const LOBBY_DESIGN = ARCADE.on ? { width: 1212, height: 720 } : { width: online ? 1480 : 1400, height: 800 }; // la versión pública lleva la columna de mapa y dificultad a la derecha; la arcade, solo jugadores y controles
function fitLobbyCard() {
  const card = $('lobby-row'); // logo (o pantalla de espera) + tarjeta del QR: se escalan y se centran juntos
  const natural = Boolean(lobbyLogo.natural); // hasta que carga la imagen, lobbyLogo llama de nuevo a esta función
  card.style.transform = 'none';
  lobbyLogo.setPixel(LOGO_PIXEL);
  $('lobby').style.padding = '0';
  const height = card.offsetHeight;
  const width = card.offsetWidth;
  if (!height || !width) return; // lobby oculto: se calculará al mostrarlo
  // Hueco libre: debajo de la barra superior (ya reducida) hasta el borde de abajo; el bloque se centra en el hueco y en horizontal en la pantalla.
  const top = document.body.classList.contains('home-on') || ARCADE.on ? 24 : $('topbar').getBoundingClientRect().bottom + 14; // en el HOME (y en la sala arcade) no hay barra superior
  // HOME: abajo en el centro va el cartel SCAN QR CODE, en píxeles enteros (6 de pantalla por píxel a 1080 p); el bloque sube para dejarle sitio.
  const home = document.body.classList.contains('home-on');
  const coinPx = Math.max(2, Math.round(6 * Math.min(innerWidth / 1920, innerHeight / 1080)));
  const coin = $('insert-coin');
  coin.style.width = `${(coinCols(COIN_TEXT) + 2 * COIN_PAD) * coinPx}px`; coin.style.height = `${(COIN_ROWS + 2 * COIN_PAD) * coinPx}px`;
  const bottom = home ? innerHeight - coinPx * (COIN_ROWS + 2 * COIN_PAD + 12) : innerHeight - (ARCADE.on ? 34 + 16 : 24); // arcade: encima del pie
  const scale = Math.max(0.4, Math.min(1, (bottom - top) / Math.max(height, LOBBY_DESIGN.height), (innerWidth - 40) / Math.max(width, LOBBY_DESIGN.width)));
  if (natural) {
    // El logo se escala en enteros (los píxeles del logo deben medir todos lo mismo): ancho tal que, tras la escala de la fila, cada
    // píxel del logo ocupa M píxeles de pantalla. Al encoger solo se hace más pequeño, así que sigue cabiendo.
    let px = Math.max(1, Math.floor(LOGO_PIXEL * scale));
    lobbyLogo.setPixel(px / scale);
    // Versión pública: el logo crece a saltos enteros; si con este salto la fila ya no cabe en el ancho, baja un escalón (si no, se salía por la derecha).
    while (online && px > 1 && card.getBoundingClientRect().width * scale > innerWidth - 40) { px--; lobbyLogo.setPixel(px / scale); }
  }
  const rect = card.getBoundingClientRect(); // medida sin escala (el logo ya puede haber cambiado de tamaño)
  const dx = innerWidth / 2 - (rect.left + rect.width / 2);
  const dy = (top + bottom) / 2 - (rect.top + rect.height / 2);
  card.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale})`;
  // El cartel del HOME va centrado en el hueco entre la tarjeta del QR y el borde de abajo.
  if (home) coin.style.top = `${((($('lobby-card').getBoundingClientRect().bottom + innerHeight) / 2) - coin.offsetHeight / 2).toFixed(1)}px`;
}
// El logo del lobby (capas y chispas) y la intro. Van aquí abajo porque lobbyLogo llama a fitLobbyCard en cuanto carga la imagen.
const logoIntro = createLogoIntro({ $, sfx, onReveal: () => fitLobbyCard(), shouldPlay: () => lobby.state === 'LOBBY', withCto: !online }); // la versión pública no tiene el reto del CTO
const lobbyLogo = createLobbyLogo({ $, isRunning: () => !$('lobby').hidden && !logoIntro.active && !document.hidden, onReady: () => fitLobbyCard() });
window.__lobbyState = () => ({ state: lobby.state, quick, pause: Boolean(pauseMenu?.open), source: keyboard?.source ?? null }); // solo para depurar (pruebas con el navegador)
window.__logoIntro = logoIntro; // solo para depurar desde la consola (y las pruebas con el navegador)
// Repetición de la secuencia del logo en el HOME (20 s después de acabar la anterior: el QR se ve 20 s; antes 15, la secuencia ahora lleva el reto); everyMs 0 = no se repite.
// Con el menú abierto no hay secuencia: si ya estaba sonando se corta (el menú no se puede tapar) y no empieza otra hasta cerrarlo.
let menuOpen = false;
new MutationObserver(() => {
  menuOpen = $('dev-menu').classList.contains('open');
  if (menuOpen) logoIntro.skip();
}).observe($('dev-menu'), { attributes: true, attributeFilter: ['class'] });
function configureIntroRepeat(on) {
  logoIntro.configureRepeat({ everyMs: on ? 20000 : 0, canRepeat: () => !menuOpen && lobby.state === 'LOBBY' && !lobby.plan && !lobby.attract && !document.hidden && $('fatal').hidden });
}
if (ARCADE.on) logoIntro.disable(); // arcade: el clic de empezar y la intro ya fueron en el título (boot.js)
else if (online) {
  // Versión pública: la intro solo la primera vez que se abre el juego en esta ventana (y al acabar cada partida, arriba). Nunca se repite sola.
  if (pressFirst) { if (firstOpen) markIntroSeen(); logoIntro.armPressStart({ intro: firstOpen, onDone: () => nameGate?.show() }); } else logoIntro.disable();
} else if (query.get('intro') === '0') logoIntro.disable();
else {
  logoIntro.armPressStart();
  // Con el lobby vacío (sin jugadores, partida ni salvapantallas) la secuencia completa (DOERS DF presents → negro → DEPLOY BATTLE → reto del CTO) se repite 20 s después de acabar la anterior.
  let introRepeat = true; // se puede apagar desde el menú (pestaña STAND)
  try { introRepeat = window.localStorage.getItem(INTRO_REPEAT_KEY) !== '0'; } catch { /* da igual */ }
  configureIntroRepeat(introRepeat);
} // ?intro=0: sin pantalla de título ni intro (pruebas)

// Escala de la interfaz (--s): la interfaz está diseñada para 1920 x 1080 y se encoge de forma uniforme con la ventana,
// entre 0,5 y 1 (no se agranda por encima del diseño). Primero se fija la escala y luego se ajusta la tarjeta del QR.
function updateUiScale() {
  const scale = Math.max(0.5, Math.min(1, innerWidth / 1700, innerHeight / 950));
  document.documentElement.style.setProperty('--s', scale.toFixed(3));
  document.documentElement.classList.toggle('ui-small', scale < 0.72); // logo de la barra superior: versión mini cuando la interfaz se encoge mucho
  fitLobbyCard();
  fitPixelImages(); // el logo de DOERS, con píxeles enteros (sección 65)
}
addEventListener('resize', updateUiScale);
updateUiScale();

socket.on(EVENTS.EMERGENCY_RELOAD, () => { $('emergency').hidden = false; setTimeout(() => window.location.reload(), 400); });
// --- Reset global: mantener R durante HARD_RESET_HOLD_MS. Soltar la tecla o perder el foco lo cancela ---
let holdStart = null;
let holdTimer = null;
let progressTimer = null;

function cancelHold() {
  clearTimeout(holdTimer);
  clearInterval(progressTimer);
  holdStart = null;
  $('reset-overlay').hidden = true;
  $('reset-bar').style.width = '0';
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyR' || event.repeat || holdStart !== null || /^(INPUT|TEXTAREA)$/.test(event.target?.tagName)) return; // "repeat": el teclado repite la tecla al mantenerla; en un campo de texto (menú) la R se escribe
  if (publicHost && (!publicHost.isHost || (quick && !roomPrivate))) return; // versión pública: solo la anfitriona reinicia la sala (en la partida pública, nadie)
  holdStart = performance.now();
  $('reset-overlay').hidden = false;
  progressTimer = setInterval(() => {
    const elapsed = performance.now() - holdStart;
    $('reset-bar').style.width = `${Math.min(100, (elapsed / HARD_RESET_HOLD_MS) * 100)}%`;
    $('reset-seconds').textContent = `${Math.max(0, Math.ceil((HARD_RESET_HOLD_MS - elapsed) / 1000))}`;
  }, 50);
  holdTimer = setTimeout(() => {
    // REINICIO TOTAL de emergencia (sección 64): el servidor reinicia partida, sala, mandos, ajustes y túnel y manda recargar la página de todas las pantallas
    // (eso borra animaciones, audio, sockets y cualquier estado raro del navegador). Si el servidor no contesta, se recarga igualmente a los 2,5 s.
    cancelHold();
    $('emergency').hidden = false;
    socket.emit(EVENTS.EMERGENCY_RESET);
    setTimeout(() => window.location.reload(), 2500);
  }, HARD_RESET_HOLD_MS);
});
window.addEventListener('keyup', (event) => { if (event.code === 'KeyR') cancelHold(); });
window.addEventListener('blur', cancelHold);
