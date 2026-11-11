// Entrada de la pantalla del juego. Versión arcade (11-nov, "como el Brawl Stars: le das a jugar y juegas"):
//   "/"  -> HAZ CLIC PARA EMPEZAR (solo al abrir o recargar: desbloquea el sonido) -> intro del logo -> TÍTULO (logo, una frase, JUGAR, INSERT COIN)
//        -> JUGAR -> tus 3 letras -> se busca sala (/api/quick, cola común) -> la sala de espera y la partida (main.js), en la MISMA página.
//   Cualquier otra dirección (/host/?room=..., el stand) carga main.js directamente, como siempre.
// Ojo: roomSocket.js lee la sala de la dirección al cargarse; tras ponerla, se le pide que la vuelva a leer (readRoomFromUrl).
import '../theme.css';
import './lobby.css';
import './title.css';
import { ARCADE, takeSkip, takeNote } from './arcadeMode.js';
import { isTouchOnly } from '../touchOnly.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const arcade = window.location.pathname === '/';

function hasWebGL() {
  try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return Boolean(gl); } catch { return false; }
}

if (!arcade) import('./main.js');
else if (isTouchOnly()) window.location.replace('/home/'); // en el móvil no se juega: su página de tarjetas
else {
  // Una recarga dentro de una sala vuelve al título (la sala se queda en la dirección solo para que main.js sepa dónde entrar).
  if (params.has('room')) history.replaceState(null, '', '/');
  if (!hasWebGL()) import('./main.js'); // sin WebGL 2, main.js enseña la pantalla de error
  else startTitle();
}

async function startTitle() {
  const [{ createSfx }, { SCAPES }, { createLogoIntro }, { createLobbyLogo }, { insertCoinSvg, coinCols, COIN_ROWS, COIN_PAD }, { createNameGate },
    { createMenuPad }, { createPadSetup }, { createHomeBackground }, { fitPixelImages }] = await Promise.all([
    import('./sfx.js'), import('./soundscape.js'), import('./logoIntro.js'), import('./lobbyLogo.js'), import('./insertCoin.js'), import('./nameGate.js'),
    import('./menuPad.js'), import('./padSetup.js'), import('../home/homeBackground.js'), import('../pixelFit.js'),
  ]);
  document.body.classList.add('arcade', 'title-on');
  $('title').hidden = false;

  // --- Sonido: se desbloquea con el primer clic o tecla y la música de la sala suena ya en el título. main.js reutiliza este mismo sonido. ---
  let sfx = null;
  try { sfx = createSfx({ storage: window.localStorage }); } catch { /* sin audio: el juego sigue */ }
  const silent = { play() {}, unlock() {}, duck() {} };
  if (sfx) {
    ARCADE.sfx = sfx;
    const startMusic = () => { if (sfx.status !== 'on') return; sfx.ambienceOn(true); sfx.ambienceLevel(0.6); sfx.musicMood(SCAPES.lobby.music, SCAPES.lobby.musicScale); };
    sfx.onStatus(startMusic);
    const unlock = () => { try { sfx.unlock(); } catch { /* sin audio */ } };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    startMusic();
  }

  // --- Fondo (la ciudad del juego) y logo animado (las mismas capas del lobby: se presta el logo y se devuelve al entrar en la sala) ---
  const background = createHomeBackground($('title-bg'));
  const logoHome = $('lobby-logo').parentElement;
  $('title-logo').appendChild($('lobby-logo'));
  const logo = createLobbyLogo({ $, isRunning: () => !document.hidden, onReady: () => fit() });
  $('title-coin').innerHTML = insertCoinSvg('INSERT COIN');
  function fit() {
    const h = innerHeight; const w = innerWidth;
    if (logo.natural) logo.setPixel(Math.max(1, Math.min(Math.floor((w * 0.8) / logo.natural.w), Math.floor((h * 0.44) / logo.natural.h))));
    const coinPx = Math.max(2, Math.round(5 * Math.min(w / 1920, h / 1080)));
    const coin = $('title-coin');
    coin.style.width = `${(coinCols('INSERT COIN') + 2 * COIN_PAD) * coinPx}px`;
    coin.style.height = `${(COIN_ROWS + 2 * COIN_PAD) * coinPx}px`;
    document.documentElement.style.setProperty('--ts', Math.max(0.55, Math.min(1.25, w / 1600, h / 900)).toFixed(3));
    fitPixelImages();
  }
  addEventListener('resize', fit);
  fit();
  const note = takeNote();
  $('title-msg').textContent = note;

  // --- PULSA PARA EMPEZAR + intro: solo al abrir la web o recargarla. Al volver de una sala (SALIR), directamente el título. ---
  // onReveal: en el destello final el título ya se ve debajo; desde ese momento JUGAR responde (si no, el clic de quien pulsa en cuanto lo ve se
  // perdía durante el ~0,5 s que tarda en retirarse el blanco).
  const intro = createLogoIntro({ $, sfx: sfx ?? silent, withCto: false, onReveal: () => { ready = true; } });
  let gate = null; // el nombre (más abajo): titleReady puede llamarse antes de crearlo (sin intro)
  let ready = false; // el título ya acepta JUGAR (no mientras suena la intro)
  // Durante la intro solo se ve el mapa (sin logo, frase ni botones): se muestran al acabar. Si ya se abrió el nombre, el foco se queda en él
  // (si no, ENTER con el nombre ya relleno no hacía nada).
  const titleReady = () => { ready = true; document.body.classList.remove('intro-on'); if (!gate?.open) $('title-play').focus({ preventScroll: true }); };
  const skipIntro = takeSkip() || params.get('intro') === '0'; // takeSkip() gasta el aviso: se llama una sola vez
  if (!skipIntro) document.body.classList.add('intro-on');
  if (skipIntro) { intro.disable(); titleReady(); }
  else {
    $('press-start').querySelector('.ps-text').textContent = 'HAZ CLIC PARA EMPEZAR';
    $('press-start').querySelector('.ps-sub').textContent = 'O PULSA UNA TECLA';
    intro.armPressStart({ intro: true, onDone: titleReady });
  }

  // --- JUGAR -> nombre -> sala ---
  let busy = false;
  const savedName = () => { try { const n = localStorage.getItem('df.initials'); return /^[A-Z]{3}$/.test(n ?? '') ? n : ''; } catch { return ''; } };
  gate = createNameGate({ initial: savedName(), startHidden: true, button: '¡A JUGAR!', onSubmit: (name) => enter(name), onCancel: () => { $('title-play').focus({ preventScroll: true }); } });
  function play() {
    if (!ready || busy || gate.open) return;
    sfx?.play('ready');
    gate.show();
  }
  $('title-play').addEventListener('click', play);
  addEventListener('keydown', (event) => {
    if (gate.open || /^(INPUT|TEXTAREA)$/.test(event.target?.tagName)) return;
    if ((event.key === 'Enter' || event.code === 'Space') && !event.repeat && ready) { event.preventDefault(); play(); }
  });

  async function enter(name) {
    if (busy) return;
    busy = true;
    try { localStorage.setItem('df.initials', name); } catch { /* da igual */ }
    $('title-play').disabled = true;
    $('title-play').textContent = 'BUSCANDO SALA…';
    $('title-msg').textContent = '';
    try {
      // El token de esta pestaña: la reserva de hueco es suya (se gasta cuando entra) y, si recargó dentro de una sala, vuelve a la misma.
      const { clientToken } = await import('../roomSocket.js');
      const res = await fetch('/api/quick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: clientToken }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) throw Object.assign(new Error('sin sala'), { status: res.status });
      // La sala va en la dirección: main.js (roomSocket.js) la lee al cargarse.
      history.replaceState(null, '', `/?room=${encodeURIComponent(data.code)}&type=quick`);
      (await import('../roomSocket.js')).readRoomFromUrl(); // por si ya estaba cargado (trozo común del empaquetado): que lea la sala nueva
      running = false;
      background?.dispose();
      logoHome.prepend($('lobby-logo')); // el logo vuelve a su sitio del lobby
      $('title').hidden = true;
      document.body.classList.remove('title-on');
      ARCADE.on = true;
      await import('./main.js');
    } catch (err) {
      busy = false;
      $('title-play').disabled = false;
      $('title-play').textContent = 'JUGAR';
      $('title-msg').textContent = err.status === 503 ? 'AHORA MISMO ESTÁN TODAS LAS SALAS LLENAS. PRUEBA EN UN RATO'
        : err.status ? 'NO HEMOS PODIDO ENTRAR. PRUEBA OTRA VEZ' : 'EL SERVIDOR SE ESTÁ DESPERTANDO. DALE UNOS SEGUNDOS Y PRUEBA OTRA VEZ';
    }
  }

  // --- Mando: A = JUGAR; en el nombre, letra a letra (nameGate.pad). Un mando que el navegador no reconoce: su ventana de configurar. ---
  const padSetup = createPadSetup();
  const pad = createMenuPad({ isBusy: (index) => padSetup.busy?.(index) ?? false });
  let running = true;
  function frame(now) {
    if (!running) return;
    padSetup.update();
    if (!padSetup.active) for (const action of pad.read(now)) { if (gate.open) gate.pad(action); else if (action === 'a') play(); }
    intro.update(now);
    logo.update(now);
    background?.update(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
