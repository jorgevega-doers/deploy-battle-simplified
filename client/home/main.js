// Inicio de la versión pública (6-nov): elegir 1 PANTALLA (sala "local") o A DISTANCIA (sala "online"), o unirse a una sala con su código.
// Al crear una sala, el servidor da la llave de anfitriona: se guarda (roomSocket.js) y la pantalla que la creó elige mapa y dificultad.
import '../theme.css';
import '../host/lobby.css'; // capas del logo animado (humo, destello, chispas): las mismas del lobby del host
import { keepPixelImagesSharp, fitPixelImages } from '../pixelFit.js';
import { createLobbyLogo } from '../host/lobbyLogo.js';
import { createHomeBackground } from './homeBackground.js';
import { createLogoIntro } from '../host/logoIntro.js';
import { createSfx } from '../host/sfx.js';
import { SCAPES } from '../host/soundscape.js';
import { introSeen, markIntroSeen } from '../introSeen.js';
import { setupPadNav } from './padNav.js';
import { createPadSetup } from '../host/padSetup.js';
import { alertBox } from '../host/alertIcon.js';
import { isTouchOnly } from '../touchOnly.js';

const $ = (id) => document.getElementById(id);
// Móvil o tableta sin ratón: aquí no se juega. Solo los logos, el aviso, el vídeo de una partida y los enlaces (ni botones de partida, ni intro, ni fondo 3D).
const touchOnly = isTouchOnly();
// Versión arcade (11-nov): en el ordenador el inicio es la pantalla del juego (/); esta página queda para el móvil.
if (!touchOnly) window.location.replace('/');
if (touchOnly) document.body.classList.add('mobile');
// Móvil: su página de tarjetas (index.html, #mobile-page) entera en la pantalla, sin desplazarse; si no cabe, se encoge toda por igual.
function fitMobile() {
  const page = $('mobile-page');
  page.style.transform = 'none';
  const scale = Math.min(1, innerHeight / page.scrollHeight);
  page.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : 'none';
}
if (touchOnly) {
  $('mobile-page').hidden = false;
  fitMobile();
  addEventListener('resize', fitMobile);
  addEventListener('orientationchange', () => setTimeout(fitMobile, 200));
  $('mobile-page').querySelector('video').addEventListener('loadedmetadata', fitMobile);
}

// --- Primera pantalla: el bloque de diseño (1400 x 600) se escala para caber en la ventana; el logo, en píxeles enteros ---
const DESIGN = { w: 1500, h: 600 }; // = #stage-inner (index.html)
const LOGO_PIXEL = 3; // píxeles de pantalla por píxel del logo a escala 1
const logo = createLobbyLogo({ $, isRunning: () => !document.hidden, onReady: () => fit() });
function fit() {
  const narrow = touchOnly || innerWidth < 900 || innerHeight < 430; // móvil en vertical o ventana muy baja: columna normal que se desplaza
  document.body.classList.toggle('narrow', narrow);
  const inner = $('stage-inner');
  if (narrow) {
    inner.style.transform = '';
    if (logo.natural) logo.setPixel(Math.max(1, Math.min(LOGO_PIXEL, Math.floor((innerWidth * 0.8) / logo.natural.w))));
    return;
  }
  const box = $('stage').getBoundingClientRect();
  const scale = Math.max(0.3, Math.min(1.3, (box.width - 40) / DESIGN.w, (box.height - 20) / DESIGN.h));
  if (logo.natural) logo.setPixel(Math.max(1, Math.floor(LOGO_PIXEL * scale)) / scale); // tras escalar, cada píxel del logo mide un número entero de píxeles
  inner.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
  // El logo de DOERS de arriba crece con el resto, en múltiplos enteros (x1 en pantallas pequeñas, x2 en grandes).
  const doers = document.querySelector('#top .doers-logo');
  const px = String(Math.max(1, Math.round(scale)));
  if (doers.dataset.px !== px) { doers.dataset.px = px; doers.style.setProperty('--dl', px); }
  fitPixelImages();
}
addEventListener('resize', fit);
fit();

// --- Fondo: la ciudad del juego (si el equipo tiene WebGL 2) y el bucle de animación ---
const background = touchOnly ? null : createHomeBackground($('scene'));
// --- Intro: solo la primera vez que se abre el juego en esta ventana (luego, al acabar cada partida, en la pantalla del juego) ---
let sfx = null;
try { sfx = createSfx({ storage: window.localStorage }); } catch { /* sin audio: la intro sigue */ }
const intro = createLogoIntro({ $, sfx: sfx ?? { play() {}, unlock() {} }, withCto: false });
// Música desde el inicio de la página (10-nov): la misma de la sala de espera (soundscape.js, "lobby") y el ambiente de la ciudad algo más bajo.
// El navegador no deja sonar hasta el primer clic o tecla (o el PULSA UNA TECLA de la intro): en cuanto se puede, empieza; se respeta el silencio
// que el jugador eligiera en el menú (sfx lo recuerda).
if (sfx && !touchOnly) {
  const startMusic = () => {
    if (sfx.status !== 'on') return;
    sfx.ambienceOn(true);
    sfx.ambienceLevel(0.6);
    sfx.musicMood(SCAPES.lobby.music, SCAPES.lobby.musicScale);
  };
  sfx.onStatus(startMusic);
  const unlock = () => { try { sfx.unlock(); } catch { /* sin audio */ } };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  startMusic();
  window.__sfx = sfx; // solo para depurar (como en la pantalla del juego)
}
// Cada vez que se abre: PULSA PARA EMPEZAR (así la música suena desde el principio); la primera vez, con la intro detrás. En el móvil, nada.
if (touchOnly) intro.disable();
else { const first = !introSeen(); if (first) markIntroSeen(); intro.armPressStart({ intro: first }); }
// Un mando que el navegador no reconoce: al tocarlo, la ventana de configurarlo (como en la pantalla del juego).
const padSetup = touchOnly ? null : createPadSetup();
function frame(now) {
  padSetup?.update();
  intro.update(now);
  logo.update(now);
  background?.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const say = (text) => { $('msg').textContent = text; };
const saveHostKey = (code, key) => { try { if (/^[A-Za-z0-9_-]{8,40}$/.test(key)) localStorage.setItem(`df.hostkey.${code}`, key); } catch { /* sin almacenamiento */ } };

const BUSY = 'EL SERVIDOR SE ESTÁ DESPERTANDO. DALE UNOS SEGUNDOS Y PRUEBA OTRA VEZ';
const NO_ROOMS = 'AHORA MISMO NO QUEDAN SALAS LIBRES. PRUEBA EN UN RATO';
const BUTTONS = ['solo', 'quick', 'private', 'local'];
const lock = (on) => { for (const id of BUTTONS) $(id).disabled = on; };
// Sin ratón (móvil o tablet) SOLO y ONLINE no se pueden jugar con teclado: se avisa y se ofrece EN ESTA PANTALLA (el móvil como mando).
const go = (code, query) => window.location.assign(`/host/?room=${encodeURIComponent(code)}&${query}`);

// SOLO, BUSCAR PARTIDA y CREAR SALA PRIVADA: cada uno juega en su pantalla (sala 'quick'). El nombre se pone luego, en tu ficha de la sala.
async function quickRoom(body) {
  if (touchOnly) { say('ESTO SE JUEGA EN UN ORDENADOR CON TECLADO Y RATÓN. DESDE EL MÓVIL, ÚNETE A UNA PARTIDA EN UNA PANTALLA'); return; }
  say('');
  lock(true);
  try {
    const res = await fetch('/api/quick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { say(res.status === 503 ? NO_ROOMS : 'NO HEMOS PODIDO ENTRAR. PRUEBA OTRA VEZ'); return; }
    if (data.hostKey) saveHostKey(data.code, data.hostKey); // sala privada: quien la crea es la anfitriona
    go(data.code, `type=quick${data.solo ? '&solo=1' : ''}${data.private && !data.solo ? '&private=1' : ''}`);
  } catch { say(BUSY); } finally { lock(false); }
}
$('solo').addEventListener('click', () => quickRoom({ solo: true }));
$('quick').addEventListener('click', () => quickRoom({}));
$('private').addEventListener('click', () => quickRoom({ private: true }));

// EN ESTA PANTALLA: una pantalla para todos (sala 'local'); cada jugador entra con su móvil (QR) o con un mando.
$('local').addEventListener('click', async () => {
  if (touchOnly) return; // en el móvil no hay botones de partida (ni se ven)
  say('');
  lock(true);
  try {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'local' }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { say(res.status === 429 ? 'VAS MUY RÁPIDO CREANDO SALAS. ESPERA UN POCO' : res.status === 503 ? NO_ROOMS : 'NO HEMOS PODIDO CREAR LA PARTIDA. PRUEBA OTRA VEZ'); return; }
    saveHostKey(data.code, data.hostKey);
    go(data.code, 'type=local');
  } catch { say(BUSY); } finally { lock(false); }
});

// ¿Te han pasado un código? Se abre TU pantalla de esa sala (online). Si la sala es de una sola pantalla, se entra escaneando su QR.
const clean = (text) => text.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5);
$('code').addEventListener('input', (event) => {
  event.target.value = clean(event.target.value);
  $('join-btn').disabled = event.target.value.length !== 5;
  say('');
});
$('join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = clean($('code').value);
  if (code.length !== 5) return;
  try {
    const res = await fetch(`/api/rooms/${code}`);
    if (res.status === 404) { say('ESA SALA NO EXISTE O YA SE HA CERRADO. ¿SEGURO QUE ES ESE CÓDIGO?'); return; }
    const room = await res.json();
    if (room.type === 'local') { say('ESA PARTIDA ES EN UNA SOLA PANTALLA: ENTRA ESCANEANDO SU QR CON TU MÓVIL'); return; }
    if (room.solo) { say('ESA SALA ES DE UNA PARTIDA EN SOLITARIO'); return; }
    if (touchOnly) { say('LAS SALAS ONLINE SE JUEGAN EN UN ORDENADOR. ÁBRELO ALLÍ CON ESTE CÓDIGO'); return; }
    go(room.code, room.type === 'quick' ? `type=quick${room.private ? '&private=1' : ''}` : 'type=online');
  } catch { say('EL SERVIDOR NO RESPONDE. PRUEBA OTRA VEZ EN UNOS SEGUNDOS'); }
});
// Modo desarrollador (entrando por /db-admin/): aviso y botón para salir.
fetch('/api/mode').then((res) => res.json()).then((info) => { $('dev-badge').hidden = info.dev !== true; }).catch(() => {});
$('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.reload();
});

// Con un mando conectado al PC también se elige con él (cruceta o stick y A).
if (!touchOnly) setupPadNav({ items: () => BUTTONS.map($), isBusy: () => padSetup?.active ?? false, onActive: () => { $('pad-hint').innerHTML = `MANDO: ELIGE CON LA CRUCETA Y PULSA A${alertBox('¿EL MANDO NO VA BIEN? MANTÉN UN BOTÓN 4 S PARA CONFIGURARLO')}`; } });

keepPixelImagesSharp(); // logos de pixel art con píxeles enteros en cualquier móvil (sección 65)
