// Pantalla del juego de cada jugador: se conecta a su sala, la dibuja en 3D con Three.js y es también su mando (teclado y ratón o mando del PC,
// keyboardPlayer.js). La carga boot.js en la misma página del título, cuando ya hay sala (?room=CODIGO en la dirección).
// Con "?view=2d" en la dirección usa la vista 2D de depuración en vez del 3D.
import '../theme.css';
import './arcade.css';
import './lobby.css';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { POWERUP_TYPES } from '../../shared/constants.js';
import { startLatencyProbe } from '../../shared/latency.js';
import { createArena } from '../../shared/arena.js';
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
import { createLogoIntro } from './logoIntro.js';
import { setupDevMenu } from './devMenu.js';
import { fitPixelImages } from '../pixelFit.js';
import { connectToRoom, screenId, clientToken, myName, saveMyName } from '../roomSocket.js';
import { createKeyboardPlayer } from './keyboardPlayer.js';
import { createNameGate } from './nameGate.js';
import { createControlsCard } from './controlsCard.js';
import { createPauseMenu } from './pauseMenu.js';
import { createPadSetup } from './padSetup.js';
import { createMenuPad } from './menuPad.js';
import { setupLeaveRoom } from './leaveRoom.js';
import { ARCADE, goHome } from './arcadeMode.js';
import { createArcadeLobby } from './arcadeLobby.js';

const $ = (id) => document.getElementById(id);
let arena = createArena(0); // mapa actual: el servidor dice cuál toca en cada lobby_state ("map") y switchMap() lo cambia
const query = new URLSearchParams(window.location.search);
// ¿Hay WebGL? El juego SIEMPRE se juega en 3D: sin WebGL (máquina virtual sin gráfica 3D, GPU averiada) NO arranca y enseña una pantalla de error clara.
// La vista 2D (?view=2d) es solo una herramienta de depuración que hay que pedir a mano: nunca se usa sola como sustituto.
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

// La sala (su propio espacio de nombres en el servidor). El nombre es el que se puso al pulsar JUGAR (o, si no hay, el de la última vez).
const startName = myName();
const socket = connectToRoom(io, { asScreen: true });
// En plena partida, ESC es la pausa de quien juega en esta pantalla (pauseMenu.js).
const pauseMenu = createPauseMenu({ nameOf: (slot) => lobby?.initials?.[slot - 1] });
socket.on(EVENTS.PAUSE_STATE, (state) => pauseMenu.serverState(state));
// Mandos que el navegador no reconoce: la primera vez se pregunta botón a botón (PULSA START...) y se guarda (padSetup.js).
const padSetup = createPadSetup({ canHold: () => lobby?.state !== 'PLAYING', onDone: () => { updateControls(); renderWaiting(); } });
// Salir lleva al título, sin volver a pedir el clic de empezar. En la sala de espera se avisa al servidor (PLAYER_QUIT) para que tu hueco se libere
// al momento (si no, los demás te ven 6 s más: la espera por si era un corte de red). En partida ya lo avisa el menú de pausa (SALIR = abandono).
function leaveHome(note = '') {
  const go = () => goHome(note);
  if (lobby?.state !== 'PLAYING' && keyboard?.socket?.connected) { keyboard.socket.emit(EVENTS.PLAYER_QUIT); setTimeout(go, 150); return; }
  go();
}
setupLeaveRoom({ isTyping: (event) => /^(INPUT|TEXTAREA)$/.test(event.target?.tagName), skip: () => pauseMenu.open || lobby?.state === 'PLAYING' || Boolean(nameGate?.open), onLeave: leaveHome });

// --- Dibujo: 3D (por defecto) o vista 2D de depuración ---
let sceneApi = null;
let entities = null;
let juice = null; // efectos arcade (juice.js): solo con la vista 3D
let life = null;  // vida de la ciudad (life.js): solo con la vista 3D
let tniFlags = [];        // easter egg: qué tanques son de TNI
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
  window.__juice = juice; // solo para depurar desde la consola (y las pruebas con el navegador): lanzar animaciones sin jugar
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
// El teclado y el ratón de esta pantalla son el mando de su jugador (keyboardPlayer.js); la sala de espera es la de arcadeLobby.js.
let drawnState = null; // el último estado dibujado (el teclado apunta desde la posición que se VE del tanque)
const keyboard = sceneApi ? createKeyboardPlayer({
  connect: () => connectToRoom(io), initials: startName, token: clientToken, screen: screenId, camera: sceneApi.camera,
  getTank: (slot) => drawnState?.tanks?.[slot - 1] ?? null, isPlaying: () => lobby.state === 'PLAYING',
  onChange: (_mode, err) => {
    if (err?.code === 'invalid_initials') nameGate?.error('ESE NOMBRE NO VALE. PRUEBA CON OTRAS 3 LETRAS'); // lo rechazó el servidor
    arcadeLobby?.update(lobby);
    updateControls();
    if (lobby.plan) renderWaiting();
  },
  onSource: () => { updateControls(); renderWaiting(); }, // tocó el mando o el teclado: la tarjeta de controles enseña el que usa ahora
  pauseMenu, padSetup, blocked: () => Boolean(nameGate?.open), onQuit: leaveHome, // SALIR (de la partida o de la sala): vuelve al título
  onName: (name) => { saveMyName(name); arcadeLobby?.update(lobby); }, // el nombre que el servidor acepta se recuerda para la próxima vez
  pointerLock: true, crosshair: $('crosshair'), // el ratón queda capturado en la partida (no se sale a otra pantalla)
}) : null;
$('exit-btn').addEventListener('click', (event) => { event.currentTarget.blur(); keyboard?.openMenu(); });
const arcadeLobby = keyboard ? createArcadeLobby({ $, keyboard, onLeave: leaveHome }) : null;
// El nombre se puso al pulsar JUGAR: la pregunta solo sale si el servidor no lo acepta (onChange). El nombre solo se guarda cuando el servidor lo
// confirma (onName), así nunca queda guardado uno que no vale.
const nameGate = keyboard ? createNameGate({ initial: startName, onSubmit: (name) => keyboard.setName(name), startHidden: true, button: '¡A JUGAR!' }) : null;
// Con mando, el "¿CÓMO TE LLAMAS?" se rellena letra a letra (menuPad.js). Mientras está abierto, el mando no juega (keyboardPlayer: blocked).
const namePad = nameGate ? createMenuPad({ isBusy: (index) => padSetup.busy(index) }) : null;
$('scene').style.cursor = 'crosshair';
// Calidad adaptativa: baja sola si el equipo no llega a ~50 FPS. Con ?quality=N (0-3) o ?bloom=0 queda fija.
const quality = createQualityController({ auto: forcedQuality === null, startLevel: forcedQuality ?? 0 });
panel.set({ quality: sceneApi ? `${sceneApi.qualityLevel}${forcedQuality === null ? ' (auto)' : ' (fija)'}` : '-' });
let lastFrameAt = 0;
// Se dibuja un poco "en el pasado" para mezclar dos estados con fluidez: los estados llegan por Internet con variación (jitter).
const buffer = createSnapshotBuffer({ delayMs: 90 });

let latest = null;          // último state_update recibido (sin interpolar), para el HUD
let lastDrawn2d = null;
let lastHud = undefined;
let matchOver = false;      // tras el resultado se ocultan las líneas de apuntado
let lobby = { state: 'LOBBY', initials: [null, null], slots: [false, false] };
let devMenu = null;       // el menú de ajustes (tecla M); se crea cuando el servidor dice si es modo dev
window.__latestState = () => latest; // solo para depurar desde la consola del navegador (y para las pruebas con el navegador)

// --- Conexión y sala ---
socket.on('connect', () => {
  $('debug').dataset.status = 'conectado';
  panel.set({ status: 'conectado' });
  $('net-banner').hidden = true; // volvió la conexión (o la sala se restauró)
  socket.emit(EVENTS.HOST_JOIN, { screen: screenId });
});
socket.on('disconnect', () => { panel.set({ status: 'desconectado' }); $('net-banner').hidden = false; });
// Pantalla completa de aviso (sala a tope o sin acceso) con un enlace al inicio.
function fatal(text) {
  $('fatal-msg').textContent = text;
  $('fatal').hidden = false;
}
socket.on(EVENTS.ERROR_MSG, (err) => panel.set({ status: err.message }));
socket.on('connect_error', (err) => {
  if (err.message === 'room_restored') { setTimeout(() => socket.connect(), 300); return; } // el servidor se reinició: ha recreado la sala con su código, se reintenta
  if (err.message === 'Invalid namespace') { goHome('LA SALA SE HA CERRADO. DALE A JUGAR OTRA VEZ'); return; }
  if (err.message === 'room_busy') { fatal('ESTA SALA ESTÁ A TOPE'); return; }
  if (err.message === 'bad_origin' || err.message === 'server_busy') { fatal('NO HEMOS PODIDO ENTRAR EN LA SALA'); return; }
  $('net-banner').hidden = false; // fallo de red o servidor reiniciándose/despertando: Socket.io reintenta solo, sin tapar la pantalla
});

// Vuelta a la sala: se descarta todo lo de la partida anterior.
// Temporizadores de la partida (sonidos con retraso, "GO!" tras la intro): volver a la sala los cancela todos.
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

// --- Sonido (sintetizado por código, sin archivos de audio) ---
// Es el del título (boot.js), ya desbloqueado y con la música sonando. Tecla M (menú) = volumen y silencio; se recuerda entre sesiones.
let sfxStorage = null;
try { sfxStorage = window.localStorage; } catch { /* sin almacenamiento */ }
const sfx = ARCADE.sfx ?? createSfx({ storage: sfxStorage });
const motionTracker = createMotionTracker(); // velocidad dibujada de cada tanque, para su sonido de movimiento
// Cuánto se agachan la música y el ambiente con cada golpe fuerte (fracción que se queda): así el golpe se oye limpio.
const DUCK = { explosion: 0.4, hit: 0.5, ko: 0.3, win: 0.55, lose: 0.55, timeUp: 0.5, go: 0.7, tniBoom: 0.25, crowdScream: 0.5 };
const play = (name, args, delayMs = 0) => {
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
// Los navegadores no dejan sonar hasta el primer clic o tecla en la página: cualquiera lo activa.
const unlockSound = () => sfx.unlock();
window.addEventListener('pointerdown', unlockSound);
window.addEventListener('keydown', (event) => {
  unlockSound();
  // M = abre o cierra el menú de ajustes (no se ve por defecto)
  if (event.code === 'KeyM' && !event.repeat && !event.ctrlKey && !event.metaKey && !/^(INPUT|TEXTAREA)$/.test(event.target?.tagName)) {
    $('dev-menu').classList.toggle('open');
  }
});
// Locales del mapa (konbini, ramen, izakaya, karaoke, salón recreativo...): sus sonidos de ambiente salen de su sitio del estéreo.
const PLACE_TYPES = new Set(['konbini', 'ramen', 'izakaya', 'karaoke', 'arcade']);
function updatePlaces() {
  sfx.ambienceWeather(arena.mood === 'rain' ? 'rain' : null); // la lluvia del mapa de la noche de lluvia
  if (sceneApi) sfx.ambiencePlaces(sceneApi.city.life.city.buildings.filter((b) => PLACE_TYPES.has(b.type)).map((b) => ({ type: b.type, x: b.rect.x + b.rect.w / 2 })));
}
updatePlaces();

// Cambio de mapa (tras cada partida se sortea otro). La ciudad de cada mapa se construye la primera vez (unos cientos de ms, en la sala de espera)
// y después solo se enciende o se apaga.
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
window.__switchMap = switchMap; // solo para depurar: ver otro mapa (el servidor lo corrige en el siguiente lobby_state)
window.__sfx = sfx; // solo para depurar y medir niveles desde la consola (con OfflineAudioContext, sin altavoces)
window.__createSfx = createSfx;

// Tanques de esta pantalla: "TÚ" sobre el tuyo (lobby_state.screens dice de qué pantalla es cada plaza).
const mineFlags = (data) => (data.screens ?? []).map((s) => s === screenId);

socket.on(EVENTS.LOBBY_STATE, (data) => {
  if (typeof data.map === 'number' && data.map !== arena.mapIndex) switchMap(data.map);
  const previousState = lobby.state;
  // Sonidos de la sala: entra un jugador, alguien pulsa JUGAR o cambia el modo; la cuenta atrás, un "tic" por segundo (más agudo en los 3 últimos).
  if (data.state === 'LOBBY' && lobby.state === 'LOBBY') {
    const count = (list) => (list ?? []).filter(Boolean).length;
    if (count(data.slots) > count(lobby.slots)) play('join');
    else if (data.joinLeft != null && lobby.joinLeft == null) play('ready');
    else if (data.plan?.kind !== lobby.plan?.kind || data.plan?.bots !== lobby.plan?.bots) play('mode');
    if (data.joinLeft != null && data.joinLeft !== lobby.joinLeft) play('countdown', { n: data.joinLeft <= 3 ? 1 : 2 });
  }
  lobby = data;
  pauseMenu.phase(data.state); // la partida acabó: ni menú ni aviso de pausa
  // Esta conexión perdió la plaza (otra pestaña con el mismo token se la quedó): en la sala de espera, cuando esa plaza ya no es de esta pantalla,
  // se recupera. En plena partida no: se espera a que acabe.
  if (keyboard?.mode === 'phone' && data.state === 'LOBBY' && keyboard.slot !== null) {
    const i = keyboard.slot - 1;
    if (data.screens?.[i] !== screenId) keyboard.reclaim();
  }
  // Animación corta del logo al volver a la sala tras una partida; la corta que empiece otra.
  if (data.state !== 'LOBBY') logoIntro.skip();
  else if ((previousState === 'GAME_OVER' || previousState === 'PLAYING') && !logoIntro.active) logoIntro.start({ short: true });
  // Etiquetas sobre los tanques y cuáles son de jugadores (los primeros) para la línea de apuntado.
  entities?.setNames(data.initials);
  entities?.setHumans(data.plan ? data.plan.humans : 99);
  entities?.setMine(mineFlags(data));
  arcadeLobby?.update(data);
  updateControls();
  // Easter egg de TNI: el tanque de quien se llame TNI cambia de aspecto y dispara bazocazos. Cada partida nueva (o vuelta a la sala) devuelve la
  // ciudad a la normalidad tras el pánico de la anterior.
  tniFlags = (data.initials ?? []).map(isTniName);
  entities?.setTni(tniFlags);
  for (let i = 0; i < 4; i++) sfx.motionHeavy(i, Boolean(tniFlags[i])); // su motor, grave y pesado
  if (data.state !== previousState && (data.state === 'READY' || data.state === 'LOBBY')) { tniPanicked = false; life?.calm(performance.now()); }
  panel.set({ state: data.state, connected: data.connected });
  $('lobby').hidden = data.state !== 'LOBBY';
  renderWaiting();
  devMenu?.setMap(data.mapChoice, data.map); // el selector de mapa vive en el menú del modo dev
  devMenu?.setDifficulty(data.difficulty);
  fitLobbyCard();
  if (data.state === 'LOBBY') resetVisuals();
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
// Vidas con las que empezó cada tanque (se aprende del primer estado recibido: contra los bots, el jugador puede tener más).
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
// Ping de cada jugador: lo mide su teclado y lo reenvía el servidor.
const playerPing = [null, null];
const pingText = (i) => (playerPing[i] === null ? 'PING --' : `PING ${playerPing[i]} MS`);
socket.on(EVENTS.PLAYER_PING, ({ slot, ms }) => {
  playerPing[slot - 1] = ms;
  const el = document.getElementById(`ping-p${slot}`);
  if (el) el.textContent = pingText(slot - 1);
});
// Iconos de los power-ups activos de un tanque en su fila (parpadean al final, como en las fichas de los jugadores).
const rowFx = (state, i) => state.effects[i].map(([type, sec]) => {
  const kind = POWERUP_TYPES[type];
  return `<span class="botfx fx-${kind} ${sec <= 1 ? 'ending last' : sec <= 2 ? 'ending' : ''}">${POWERUP_ICONS[kind]}</span>`;
}).join('');
// Ficha de los bots (1 contra 3 bots, abajo a la derecha): una fila por bot con su color, su nombre y sus corazones; los eliminados quedan
// tachados y apagados.
function botsHtml(state) {
  let html = '';
  for (let i = 1; i < 4; i++) {
    const lives = state ? state.tanks[i][3] : 0;
    const dead = state !== null && lives <= 0;
    const icons = state && !dead ? rowFx(state, i) : '';
    html += `<div class="botrow${dead ? ' dead' : ''}" style="--bc: var(--p${i + 1})"><span class="chip">B${i + 1}</span><span class="name">${lobby.initials[i] ?? ''}</span>`
      + `${icons}<span class="hearts">${state ? heartsHtml(lives, i + 1) : ''}</span></div>`;
  }
  return html;
}
// Combate de 3 o 4 jugadores: un panel por lado con una fila por tanque (izquierda P1 y P3, derecha P2 y P4).
function rowsHtml(state, indices) {
  let html = '';
  for (const i of indices) {
    if (i >= lobby.initials.length) continue;
    const lives = state ? state.tanks[i][3] : 0;
    const dead = state !== null && lives <= 0;
    const human = i < (lobby.plan?.humans ?? 0);
    const icons = state && !dead ? rowFx(state, i) : '';
    html += `<div class="botrow${dead ? ' dead' : ''}" style="--bc: var(--p${i + 1})"><span class="chip">${human ? 'P' : 'B'}${i + 1}</span><span class="name">${lobby.initials[i] ?? ''}</span>`
      + `${icons}<span class="hearts">${state ? heartsHtml(lives, i + 1) : ''}</span></div>`;
  }
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
      html = `<div class="row"><span class="chip">P${i + 1}</span><span class="name">${name}</span><span class="ping" id="ping-p${i + 1}">${pingText(i)}</span></div>`
        + `<div class="hearts">${state ? heartsHtml(state.tanks[i][3], i + 1) : ''}</div><div class="fx">${effects}</div>`;
    }
    if (html !== hudCache[i]) { // solo se toca el DOM si ha cambiado algo
      $(`hud-p${i + 1}`).innerHTML = html;
      hudCache[i] = html;
    }
    $(`hud-p${i + 1}`).classList.toggle('bots', solo && i === 1);
    $(`hud-p${i + 1}`).classList.toggle('multi', multi);
  }
  const timer = state ? formatTime(state.timeLeft) : '--:--';
  if ($('timer').textContent !== timer) $('timer').textContent = timer;
  // Últimos 10 s: el cronómetro parpadea en fucsia (arcade.css).
  $('timer').classList.toggle('urgent', Boolean(state) && state.timeLeft > 0 && state.timeLeft <= 10 && !matchOver);
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
  entities?.onEvent(event, now);
  // Disparo de TNI: bazocazo con fogonazo; el primero de la partida hace que la ciudad entera huya gritando.
  const tniShot = event.type === 'shot' && tniFlags[event.slot - 1];
  if (tniShot) {
    entities?.tniMuzzle(event.slot, now);
    const x = latest?.tanks?.[event.slot - 1]?.[0] ?? arena.width / 2;
    play('bazooka', { pan: panFor(x, arena.width) });
    if (!tniPanicked) { tniPanicked = true; play('crowdScream', {}, 120); life?.panic(now); }
  }
  // Reventón de un cohete de TNI: sonido bestia (en vez de la explosión normal) y temblor de cámara.
  const tniBlast = event.type === 'explosion' && event.tni;
  if (tniBlast) { play('tniBoom', { pan: panFor(event.x, arena.width) }); screenShake(now); }
  for (const { name, args, delayMs } of soundsForEvent(event, latest, arena.width)) if (!(tniShot && name === 'shot') && !(tniBlast && name === 'explosion')) play(name, args, delayMs);
  juice?.onEvent(event, now);
});

socket.on(EVENTS.GAME_OVER, (result) => {
  matchOver = true;
  resultsShown = false;
  const winners = result.winners ?? (result.winner === null ? [] : [result.winner]);
  const nameOf = (slot) => result.scores[slot - 1].initials ?? `P${slot}`;
  const soloMode = result.kind === 'solo' || (result.kind === undefined && result.scores.length > 2);
  const humanWon = winners.some((w) => !result.scores[w - 1].bot);
  // Un jugador: victoria o derrota; si no, quién gana.
  const span = (slot) => `<span class="p${slot}">${nameOf(slot)}</span>`;
  const text = winners.length === 0 ? 'EMPATE'
    : soloMode ? (result.winner === 1 ? `¡VICTORIA ${span(1)}!` : `GANA ${span(result.winner)}`)
      : `GANA ${span(winners[0])}`;
  // Tabla de resultados: jugador, puntos, vidas y precisión (sin puesto: no hay ranking a la vista).
  const head = ['', 'PUNTOS', 'VIDAS', 'PRECISIÓN'].map((h) => `<span class="head">${h}</span>`).join('');
  const rows = result.scores.map((s) => [
    `<span class="who" style="color: var(--p${s.slot})">${s.initials ?? `P${s.slot}`}</span>`,
    `<span>${s.bot ? '-' : s.score}</span>`, `<span>${Math.max(0, s.lives)}</span>`, `<span>${s.accuracy}%</span>`,
  ].join('')).join('');
  // El cartel de resultados espera a que acabe la animación del final (KO, GAME OVER...).
  const showResults = () => {
    resultsShown = true; // vuelve la música calma
    setBanner(`<div class="big">${text}</div><div class="results">${head}${rows}</div>`, 'RESULTADO');
    play(humanWon ? 'win' : 'lose'); // jingle: en solitario, victoria o derrota del jugador; entre jugadores, siempre el alegre
  };
  if (juice) juice.whenFinaleDone(showResults); else showResults();
});

// --- Bucle de dibujo: un fotograma por cada refresco de la pantalla ---
// Tope de fotogramas: 30 por defecto (a este juego le sobra y el equipo va más fresco y estable); el menú de GRÁFICOS permite 60.
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
  logoIntro.update(now); // animación del logo al volver a la sala
  arcadeLobby?.tick(now); // la sala de espera: textos, botón e inactividad
  padSetup.update(); // configurando un mando nuevo (si hay uno)
  if (nameGate?.open && !padSetup.active) for (const action of namePad.read(now)) nameGate.pad(action); // el nombre, con el mando
  keyboard?.update(now); // teclado y ratón o mando del PC (también en la espera: START = JUGAR)
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
      // El rayo de tu tanque sigue al ratón al instante (sin esperar a que el servidor devuelva el ángulo).
      if (keyboard) { const a = keyboard.aim; if (a !== null && state.tanks[keyboard.slot - 1]) state.tanks[keyboard.slot - 1].aim = a; }
      entities.update(state, now, !matchOver);
      juice.afterDraw(state, now);
      // Sonido de movimiento ("tanquecito de juguete"): solo durante la partida (ni resultados ni sala).
      const speeds = motionTracker.update(state, now);
      const quiet = matchOver || lobby.state !== 'PLAYING';
      for (let i = 0; i < state.tankCount; i++) sfx.motion(i, quiet ? 0 : speeds[i], panFor(state.tanks[i].x));
    }
    sceneApi.render();
    applyShake(now);
  }
  if (latest !== lastHud) { updateHud(latest); lastHud = latest; }
  if (now - lastFpsAt > 500) { // FPS arriba a la derecha (solo en modo dev; F3 enseña el detalle)
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
// La tarjeta ASÍ SE JUEGA (controlsCard.js) enseña los controles de lo que estás usando ahora: teclado y ratón o el mando del PC.
const controls = createControlsCard({ $ });
function updateControls() {
  if (!keyboard) return;
  const connectedPad = [...(navigator.getGamepads?.() ?? [])].some((p) => p && p.connected);
  if (keyboard.source === 'pad') { controls.set({ sets: ['pad'], note: 'START: JUGAR Y PAUSA · MANTÉN SELECT: SALIR · TOCA EL TECLADO PARA VOLVER A ÉL' }); return; }
  controls.set({ sets: ['keyboard'], note: `ENTER: JUGAR · ESC: PAUSA${connectedPad ? ' · TOCA EL MANDO PARA JUGAR CON ÉL' : ''}` });
}
for (const ev of ['gamepadconnected', 'gamepaddisconnected']) addEventListener(ev, () => { updateControls(); renderWaiting(); });
// Menú de ajustes (tecla M): SONIDO y GRÁFICOS para todos; en modo dev (contraseña en /db-admin/), además el menú de pruebas.
$('fps').hidden = true;
$('debug').dataset.locked = '1'; // hasta saber si es modo dev, ni FPS ni panel F3
fetch('/api/mode').then((res) => res.json()).catch(() => ({})).then((info) => {
  const isDev = info.dev === true;
  if (isDev) delete $('debug').dataset.locked;
  devMenu = setupDevMenu({ $, socket, juice, sfx, padSetup, onIntro: (short) => logoIntro.start({ short, prelude: !short }), onQuality: applyQualityMode, onFpsCap: setFpsCap,
    getFpsCap: () => fpsCap, resetVisuals, onDemo: (on) => { $('lobby').hidden = on || lobby.state !== 'LOBBY'; }, full: isDev });
  devMenu.setDifficulty(lobby.difficulty);
  fitLobbyCard();
});

// Sala de espera: la lista de jugadores (los textos, el botón y la cuenta atrás los pone arcadeLobby.js).
let waitingCache = '';
function renderWaiting() {
  const on = lobby.state === 'LOBBY';
  $('lobby').classList.toggle('waiting', on);
  document.body.classList.toggle('lobby-on', on);
  document.body.classList.toggle('play-on', lobby.state === 'PLAYING');
  $('waiting').hidden = !on;
  if (!on) return;
  const humans = lobby.plan?.humans ?? 0; // la pantalla sale antes de que su teclado haya entrado
  const mine = mineFlags(lobby);
  let html = '';
  for (let i = 0; i < 4; i++) {
    if (i >= humans) {
      html += `<div class="wp empty" style="--c: #2c3756"><span class="chip">P${i + 1}</span><span class="name">BUSCANDO JUGADORES...</span></div>`;
      continue;
    }
    const slot = i + 1;
    // Con qué juega cada uno (TECLADO / MANDO; MÓVIL = un bot de prueba del modo dev) y cuál es el tuyo ("TÚ"). Tu jugador con el mando del PC
    // (keyboardPlayer.source): MANDO en tu ficha (el servidor lo sigue contando como el teclado de esta pantalla).
    const kind = keyboard && slot === keyboard.slot && keyboard.mode === 'keyboard' && keyboard.source === 'pad' ? 'pad' : lobby.devices?.[i];
    const device = kind ? `<span class="dev">${({ pad: 'MANDO', keyboard: 'TECLADO' })[kind] ?? 'MÓVIL'}</span>` : '';
    const you = mine[i] ? '<span class="you">TÚ</span>' : '';
    // Un mando conectado que el navegador no reconoce: NO CONFIGURADO en tu ficha abre la configuración (padSetup.js).
    let setupPad = null;
    if (keyboard && keyboard.slot === slot && keyboard.mode === 'keyboard') {
      setupPad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected && padSetup.needsSetup(p.index))?.index ?? null;
    }
    const setupBtn = setupPad !== null ? `<button class="wp-setup" type="button" data-pad="${setupPad}">NO CONFIGURADO</button>` : '';
    html += `<div class="wp" style="--c: var(--p${slot})"><span class="chip">P${slot}</span><span class="name">${lobby.initials[i] ?? ''}</span>${setupBtn}${you}${device}</div>`;
  }
  if (html !== waitingCache) {
    $('wait-players').innerHTML = html;
    waitingCache = html;
  }
  arcadeLobby?.tick(performance.now()); // sus textos mandan YA (si no, el texto anterior se ve un fotograma: parpadeo)
}
$('wait-players').addEventListener('click', (event) => {
  const setup = event.target.closest('.wp-setup');
  if (setup) { setup.blur(); padSetup.open(Number(setup.dataset.pad)); }
});

// La sala de espera se encoge si la ventana es pequeña: nunca tapa el pie, en cualquier resolución. Se mide sin escalar y se elige la escala
// que cabe entre el borde de arriba y el pie (con un tamaño de diseño fijo, así todo mide SIEMPRE lo mismo y solo cambia al cambiar la ventana).
const LOBBY_DESIGN = { width: 1212, height: 720 };
function fitLobbyCard() {
  const card = $('lobby-row');
  card.style.transform = 'none';
  $('lobby').style.padding = '0';
  const height = card.offsetHeight;
  const width = card.offsetWidth;
  if (!height || !width) return; // sala oculta: se calculará al mostrarla
  const top = 24;
  const bottom = innerHeight - (34 + 16); // encima del pie
  const scale = Math.max(0.4, Math.min(1, (bottom - top) / Math.max(height, LOBBY_DESIGN.height), (innerWidth - 40) / Math.max(width, LOBBY_DESIGN.width)));
  const rect = card.getBoundingClientRect();
  const dx = innerWidth / 2 - (rect.left + rect.width / 2);
  const dy = (top + bottom) / 2 - (rect.top + rect.height / 2);
  card.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale})`;
}
// La animación del logo (la corta, al volver a la sala tras una partida). El clic de empezar y la intro completa ya fueron en el título (boot.js).
const logoIntro = createLogoIntro({ $, sfx, onReveal: () => fitLobbyCard(), shouldPlay: () => lobby.state === 'LOBBY' });
logoIntro.disable();
window.__lobbyState = () => ({ state: lobby.state, quick: true, pause: Boolean(pauseMenu.open), source: keyboard?.source ?? null }); // solo para depurar (pruebas con el navegador)
window.__logoIntro = logoIntro; // solo para depurar desde la consola (y las pruebas con el navegador)
// Con el menú abierto no hay animación del logo: si ya estaba sonando se corta (el menú no se puede tapar).
new MutationObserver(() => { if ($('dev-menu').classList.contains('open')) logoIntro.skip(); }).observe($('dev-menu'), { attributes: true, attributeFilter: ['class'] });

// Escala de la interfaz (--s): está diseñada para 1920 x 1080 y se encoge de forma uniforme con la ventana, entre 0,5 y 1 (no se agranda por
// encima del diseño). Primero se fija la escala y luego se ajusta la sala de espera.
function updateUiScale() {
  const scale = Math.max(0.5, Math.min(1, innerWidth / 1700, innerHeight / 950));
  document.documentElement.style.setProperty('--s', scale.toFixed(3));
  fitLobbyCard();
  fitPixelImages(); // el logo de DOERS, con píxeles enteros
}
addEventListener('resize', updateUiScale);
updateUiScale();
