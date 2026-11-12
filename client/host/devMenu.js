// MENÚ DE AJUSTES: se abre y se cierra con la tecla M. Organizado como los ajustes de un videojuego: una fila de pestañas y, debajo, los controles
// de la elegida. Para todos: SONIDO, GRÁFICOS (calidad, fotogramas, pantalla completa) y VOLVER AL INICIO. En modo dev (contraseña en /db-admin/),
// además: DIFICULTAD, PARTIDA (mapa, tests de 1 a 4 jugadores con bots de prueba, acabar el tiempo), MANDOS, PRUEBAS SONIDO y ANIMACIONES.
// Qué NO hace: no toca la lógica del juego; solo envía eventos de depuración al servidor (que solo los acepta en modo dev), lanza animaciones
// y sonidos y cambia los ajustes de sonido y de calidad.
import { EVENTS } from '../../shared/events.js';
import { setupTestBots } from './testBots.js';
import { createMapPicker } from './mapPicker.js';
import { alertBox } from './alertIcon.js';

// [texto del botón, nombre de la animación en juice.demo]
const DEMOS = [
  ['CUENTA ATRÁS', 'countdown'], ['GO!', 'go'], ['IMPACTO (-1 VIDA)', 'hit'], ['KO + GAME OVER', 'ko'],
  ['TIME UP', 'time'], ['POWER-UP', 'powerup'],
];

// [texto del botón, modo de calidad que pide a main.js]
const QUALITY = [['AUTO', 'auto'], ['BAJA', 'low'], ['MEDIA', 'mid'], ['ALTA', 'high']];

// [texto del botón, nombre del sonido en sfxSounds.js]
const SOUNDS = [
  ['DISPARO', 'shot'], ['REBOTE', 'bounce'], ['IMPACTO EN MURO', 'impact'], ['TANQUE ALCANZADO', 'hit'], ['EXPLOSIÓN', 'explosion'], ['ESCUDO ROTO', 'shieldBreak'],
  ['IMPULSO', 'dash'], ['AVISO POWER-UP', 'powerupWarn'], ['POWER-UP APARECE', 'powerupSpawn'], ['POWER-UP RECOGIDO', 'powerupPick'], ['CUENTA ATRÁS', 'countdown'], ['GO!', 'go'],
  ['REAPARECER', 'spawn'], ['KO', 'ko'], ['TIEMPO AGOTADO', 'timeUp'], ['VICTORIA', 'win'], ['DERROTA', 'lose'],
  ['ENTRA JUGADOR', 'join'], ['JUGAR', 'ready'], ['CAMBIO DE MODO', 'mode'],
  ['INTRO: DESLIZAR', 'introSlide'], ['INTRO: CHOQUE', 'introHit'], ['INTRO: FLASH', 'introFlash'], ['INTRO: REVELAR', 'introReveal'], ['PULSA UNA TECLA', 'pressStart'],
];
const MOODS = [['CALMA (LOBBY)', 'calm'], ['PARTIDA', 'play'], ['ÚLTIMOS 10 S', 'rush'], ['PARAR', null]];
// [texto del botón, detalle del ambiente en ambience.js]
const AMBIENCE = [
  ['PASOS', 'footsteps'], ['CONVERSACIÓN', 'murmur'], ['RISA', 'laugh'], ['KONBINI (IRASSHAIMASE)', 'shop'], ['RAMEN (PLANCHA)', 'ramen'],
  ['IZAKAYA (BRINDIS)', 'izakaya'], ['KARAOKE', 'karaoke'], ['SALÓN RECREATIVO', 'arcade'], ['BOCINAZO', 'horn'], ['COCHE LEJANO', 'farCar'],
  ['COCHE CERCA', 'car'], ['GATO', 'cat'], ['PERRO', 'dog'], ['SEMÁFORO', 'beep'], ['VAPOR', 'steam'],
];
// [texto, nombre del volumen en sfx.js]
const VOLUMES = [['GENERAL', 'master'], ['EFECTOS', 'sfx'], ['MÚSICA', 'music'], ['AMBIENTE', 'amb']];
const TAB_KEY = 'doersforce.menu.tab';
const FPS_KEY = 'doersforce.menu.fps2'; // clave nueva (29-oct): ignora lo guardado cuando el defecto era SÍ

// full = modo dev: el menú de pruebas completo; sin él solo SONIDO, GRÁFICOS y VOLVER AL INICIO (los ajustes de siempre de un videojuego).
export function setupDevMenu({ $, socket, juice, sfx, padSetup = null, onDemo, onIntro = null, onQuality, onFpsCap = () => {}, getFpsCap = () => 30, resetVisuals, full = false }) {
  const devOn = full;
  let showFps = () => {};
  const panel = $('dev-panel');
  const menu = $('dev-menu');
  const tabBar = document.createElement('div');
  tabBar.className = 'dev-tabs';
  panel.appendChild(tabBar);
  const pages = new Map(); // nombre -> { page, tab }

  const tab = (name, dev = false) => {
    const page = document.createElement('div');
    page.className = 'dev-page';
    page.hidden = true;
    panel.appendChild(page);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-tab dev-tab';
    button.textContent = name;
    button.addEventListener('click', (event) => { event.target.blur(); select(name); });
    tabBar.appendChild(button);
    button.hidden = dev && !devOn;
    pages.set(name, { page, button, dev });
    return page;
  };
  function select(name) {
    if (!pages.has(name) || (pages.get(name).dev && !devOn)) return;
    for (const [n, p] of pages) { p.page.hidden = n !== name; p.button.classList.toggle('danger', n === name); } // la elegida, en fucsia
    try { window.localStorage.setItem(TAB_KEY, name); } catch { /* da igual */ }
  }
  const title = (page, text) => {
    const el = document.createElement('div');
    el.className = 'dev-title';
    el.textContent = text;
    page.appendChild(el);
  };
  // Los botones de una sección van en una rejilla de 2 columnas (los tests son muchos).
  const grid = (page) => {
    const el = document.createElement('div');
    el.className = 'dev-grid';
    page.appendChild(el);
    return el;
  };
  const button = (parent, text) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ui-tab';
    el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const click = (el, fn) => el.addEventListener('click', (event) => { event.target.blur(); fn(event); }); // blur: la R del reset no lo activa
  // Botón con confirmación (acciones que no se deshacen): el primer pulso lo pone en fucsia con "confirmText"; si no se vuelve a pulsar en 5 s, vuelve solo.
  const confirmButton = (parent, text, confirmText, action) => {
    const el = button(parent, text);
    let timer = null;
    const reset = () => { clearTimeout(timer); timer = null; el.textContent = text; el.classList.remove('danger'); };
    click(el, () => {
      if (timer === null) { el.textContent = confirmText; el.classList.add('danger'); timer = setTimeout(reset, 5000); return; }
      reset();
      action();
    });
    return el;
  };
  const hint = (page, text = '') => {
    const el = document.createElement('div');
    el.className = 'dev-hint';
    el.textContent = text;
    page.appendChild(el);
    return el;
  };

  // --- SONIDO: control de volumen y interruptores ---
  if (sfx) {
    const page = tab('SONIDO');
    title(page, 'VOLUMEN');
    const sliders = new Map();
    for (const [text, name] of VOLUMES) {
      const row = document.createElement('label');
      row.className = 'dev-row';
      const label = document.createElement('span');
      label.textContent = text;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '150';
      input.step = '5';
      const value = document.createElement('span');
      value.className = 'dev-value';
      input.addEventListener('input', () => {
        const wanted = Number(input.value) / 100; // se lee ANTES de unlock(): unlock() avisa a los oyentes y refresh() reescribe el deslizador
        sfx.unlock();
        sfx.setVolume(name, wanted);
      });
      row.append(label, input, value);
      page.appendChild(row);
      sliders.set(name, { input, value });
    }
    const refresh = () => {
      const volumes = sfx.volumes;
      for (const [name, { input, value }] of sliders) { input.value = String(Math.round(volumes[name] * 100)); value.textContent = `${Math.round(volumes[name] * 100)}%`; }
    };
    refresh();
    title(page, 'INTERRUPTORES');
    const toggles = grid(page);
    const soundToggle = button(toggles, '');
    const musicToggle = button(toggles, '');
    const showToggles = () => { soundToggle.textContent = `SONIDO: ${sfx.muted ? 'NO' : 'SÍ'}`; musicToggle.textContent = `MÚSICA: ${sfx.musicMuted ? 'NO' : 'SÍ'}`; };
    click(soundToggle, () => { sfx.unlock(); sfx.toggleMute(); });
    click(musicToggle, () => { sfx.unlock(); sfx.toggleMusic(); });
    showToggles();
    // El sonido se controla solo desde aquí: este aviso dice si el navegador ya lo ha activado.
    const status = document.createElement('div');
    status.className = 'dev-hint';
    page.appendChild(status);
    const showStatus = () => {
      status.textContent = sfx.status === 'locked'
        ? 'ESTADO: SIN ACTIVAR. EL NAVEGADOR NO DEJA SONAR HASTA EL PRIMER CLIC O TECLA EN LA PÁGINA.'
        : sfx.status === 'muted' ? 'ESTADO: SILENCIADO' : 'ESTADO: ACTIVO';
    };
    showStatus();
    sfx.onStatus(() => { refresh(); showToggles(); showStatus(); });
  }

  let showDifficulty = () => {};
  let updateMap = () => {};
  // --- DIFICULTAD de los bots (modo dev): FÁCIL, MEDIA (la de la partida normal) y PRO. ---
  if (full) {
    const diff = tab('DIFICULTAD');
    title(diff, 'DIFICULTAD DE LOS BOTS');
    const levelGrid = grid(diff);
    const levelButtons = new Map();
    for (const [label, level] of [['FÁCIL', 'stand'], ['MEDIA', 'media'], ['PRO', 'pro']]) {
      const b = button(levelGrid, label);
      levelButtons.set(level, b);
      click(b, () => socket.emit(EVENTS.DIFFICULTY_SET, { level }));
    }
    showDifficulty = (level) => { for (const [l, b] of levelButtons) { b.classList.toggle('danger', l === level); b.classList.toggle('checked', l === level); } }; // el activo, en fucsia y con un check
    title(diff, 'FÁCIL: BOTS LENTOS, UNA VIDA MÁS Y AYUDA DE PUNTERÍA. MEDIA: A MEDIO CAMINO. PRO: SIN AYUDAS.');
  }

  // --- PARTIDA (modo dev): mapa, tests con bots de prueba y acabar el tiempo ---
  if (full) {
  const game = tab('PARTIDA', true);
  // Mapa: siempre aleatorio salvo que se fije aquí. Se pone ya en la sala de espera y se mantiene.
  title(game, 'MAPA (ALEATORIO POR DEFECTO)');
  updateMap = createMapPicker(game, (choice) => socket.emit(EVENTS.MAP_SELECT, { choice }));
  title(game, 'TESTS CON BOTS DE PRUEBA (EL MODO SALE DE CUÁNTOS ENTRAN)');
  const tests = grid(game);
  setupTestBots(
    new Map([1, 2, 3, 4].map((n) => [n, button(tests, '')])),
    { randomMap: () => socket.emit(EVENTS.MAP_SELECT, { reroll: true }),
      reset: () => { resetVisuals?.(); socket.emit(EVENTS.HARD_RESET); } }, // al iniciar o parar un test se corta TODA animación y temporizador pendiente
  );
  title(game, 'PARTIDA EN MARCHA');
  const running = grid(game);
  click(button(running, 'ACABAR TIEMPO'), () => socket.emit(EVENTS.DEBUG_END_TIME));
  }

  // --- MANDOS del PC (modo dev): qué mandos ve el navegador, qué pulsan en directo y su configuración ---
  let refreshPads = () => {};
  // MANDOS con el configurador (padSetup.js: START, SELECT, A, B, R1, L1). Cada mando detectado, su estado, lo que pulsa en
  // directo y CONFIGURAR (también para volver a configurarlo) o BORRAR SU CONFIGURACIÓN.
  if (padSetup && full) { // solo en modo desarrollador (el jugador lo arregla manteniendo un botón 4 s)
    const padsPage = tab('MANDOS');
    title(padsPage, 'MANDOS DETECTADOS');
    hint(padsPage).innerHTML = alertBox('¿EL MANDO NO VA BIEN? MANTÉN UN BOTÓN 4 S (FUERA DE LA PARTIDA) PARA CONFIGURARLO');
    const box = document.createElement('div');
    padsPage.appendChild(box);
    let shownKey = '';
    const rows = new Map();
    const statusOf = (p) => (padSetup.configured(p.id) ? 'CONFIGURADO' : p.mapping === 'standard' ? 'LO RECONOCE EL NAVEGADOR (NO HACE FALTA CONFIGURARLO)' : 'SIN CONFIGURAR');
    refreshPads = () => {
      if (!menu.classList.contains('open') || padsPage.hidden) return;
      const list = [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected);
      const key = list.map((p) => `${p.index}:${p.id}:${statusOf(p)}`).join('|');
      if (key !== shownKey) {
        shownKey = key;
        box.replaceChildren();
        rows.clear();
        if (!list.length) hint(box, 'NINGUNO. EL NAVEGADOR SOLO ENSEÑA UN MANDO DESPUÉS DE PULSAR UNO DE SUS BOTONES CON ESTA VENTANA DELANTE.');
        for (const p of list) {
          title(box, `MANDO ${p.index + 1} · ${p.id.slice(0, 60)}`);
          const status = hint(box, statusOf(p));
          const live = hint(box);
          const actions = grid(box);
          click(button(actions, padSetup.configured(p.id) ? 'VOLVER A CONFIGURAR' : 'CONFIGURAR'), () => { menu.classList.remove('open'); padSetup.open(p.index); });
          if (padSetup.configured(p.id)) click(button(actions, 'BORRAR SU CONFIGURACIÓN'), () => { padSetup.forget(p.id); shownKey = ''; });
          // Para incluir este modelo en el juego (que funcione solo en cualquier ordenador): se copia su configuración y se la pasas al desarrollador.
          if (padSetup.configured(p.id)) {
            const copy = button(actions, 'COPIAR SU CONFIGURACIÓN');
            click(copy, async () => {
              const text = JSON.stringify({ id: p.id, mapping: padSetup.mappingOf(p.id) });
              try { await navigator.clipboard.writeText(text); copy.textContent = '¡COPIADA! PÁSASELA AL DESARROLLADOR'; } catch { copy.textContent = text.slice(0, 120); }
            });
          }
          rows.set(p.index, { status, live });
        }
      }
      for (const p of list) {
        const row = rows.get(p.index);
        if (!row) continue;
        const pressed = p.buttons.map((b, i) => (b.pressed ? i : null)).filter((i) => i !== null);
        row.live.textContent = `BOTONES PULSADOS: ${pressed.length ? pressed.join(', ') : '-'} (PULSA UNO PARA VER QUE LO DETECTA)`;
      }
    };
    setInterval(refreshPads, 150);
  }

  // --- GRÁFICOS: AUTO baja sola si va justo (nunca vuelve a subir); BAJA / MEDIA / ALTA la fijan a mano. ---
  // BAJA = nivel 3 (sin bloom y algo menos de gente), MEDIA = nivel 1 (bloom a menos resolución), ALTA = nivel 0 (todo).
  const graphics = tab('GRÁFICOS');
  title(graphics, 'CALIDAD');
  const qualityGrid = grid(graphics);
  const qualityButtons = new Map();
  for (const [text, mode] of QUALITY) {
    const q = button(qualityGrid, text);
    qualityButtons.set(mode, q);
    click(q, () => {
      onQuality(mode);
      for (const [m, b] of qualityButtons) b.classList.toggle('danger', m === mode); // el elegido, en fucsia
    });
  }
  qualityButtons.get('auto').classList.add('danger');
  // Tope de fotogramas: 30 por defecto (al juego le basta); 60 para pantallas y equipos que lo aguanten.
  title(graphics, 'FOTOGRAMAS MÁXIMOS');
  const capButtons = new Map();
  const capGrid = grid(graphics);
  for (const cap of [30, 60]) {
    const b = button(capGrid, `${cap} FPS`);
    capButtons.set(cap, b);
    click(b, () => {
      onFpsCap(cap);
      for (const [c, other] of capButtons) other.classList.toggle('danger', c === cap);
    });
  }
  capButtons.get(getFpsCap()).classList.add('danger');
  // Pantalla completa (lo mismo que F11).
  title(graphics, 'PANTALLA');
  const fsButton = button(grid(graphics), '');
  const showFs = () => { fsButton.textContent = document.fullscreenElement ? 'SALIR DE PANTALLA COMPLETA' : 'PANTALLA COMPLETA'; };
  click(fsButton, () => {
    const done = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    Promise.resolve(done).catch(() => {}).finally(showFs);
  });
  document.addEventListener('fullscreenchange', showFs);
  showFs();
  // Contador de FPS de arriba a la derecha: se enseña u oculta desde aquí (se recuerda entre sesiones; por defecto, oculto).
  if (full) {
    title(graphics, 'CONTADOR DE FPS');
    const fpsButton = button(grid(graphics), '');
    let fpsOn = false;
    const fpsTitle = fpsButton.parentElement.previousElementSibling;
    try { fpsOn = window.localStorage.getItem(FPS_KEY) === '1'; /* por defecto, apagado */ } catch { /* da igual */ }
    showFps = () => { $('fps').hidden = !(fpsOn && devOn); const display = devOn ? '' : 'none'; fpsTitle.style.display = display; fpsButton.parentElement.style.display = display; /* .dev-grid fija su display: el atributo hidden no basta */ fpsButton.textContent = `FPS: ${fpsOn ? 'SÍ' : 'NO'}`; };
    click(fpsButton, () => {
      fpsOn = !fpsOn;
      try { window.localStorage.setItem(FPS_KEY, fpsOn ? '1' : '0'); } catch { /* da igual */ }
      showFps();
    });
    showFps();
  } else {
    $('fps').hidden = true; // los jugadores normales no ven los FPS
  }

  // --- PRUEBAS DE SONIDO: oír cada efecto, cada ánimo de la música y cada detalle del ambiente sin jugar (hace falta haber pulsado
  // algo en la página para que el navegador deje sonar; la música automática del juego retoma el mando en el siguiente cambio). ---
  if (sfx && full) {
    const tests2 = tab('PRUEBAS SONIDO', true);
    title(tests2, 'EFECTOS');
    const effects = grid(tests2);
    for (const [text, name] of SOUNDS) click(button(effects, text), () => { sfx.unlock(); sfx.play(name, { n: name === 'bounce' ? 2 : 1, slot: 1 }); });
    title(tests2, 'MÚSICA');
    const music = grid(tests2);
    for (const [text, mood] of MOODS) click(button(music, text), () => { sfx.unlock(); sfx.musicMood(mood, 1.7); });
    title(tests2, 'AMBIENTE DE TOKIO');
    const ambience = grid(tests2);
    for (const [text, name] of AMBIENCE) click(button(ambience, text), () => { sfx.unlock(); sfx.ambienceOn(true); sfx.ambienceEvent(name, { x: 8 }); });
  }

  // --- ANIMACIONES ---
  if (juice && full) {
    const animations = tab('ANIMACIONES', true);
    if (onIntro) { // la intro del logo (flash blanco y vuelta al lobby), completa o corta
      title(animations, 'INTRO DEL LOGO');
      const intro = grid(animations);
      click(button(intro, 'INTRO COMPLETA'), () => { menu.classList.remove('open'); onIntro(false); });
      click(button(intro, 'INTRO CORTA'), () => { menu.classList.remove('open'); onIntro(true); });
    }
    title(animations, 'VER SIN JUGAR');
    const demos = grid(animations);
    let busy = false;
    for (const [text, name] of DEMOS) {
      click(button(demos, text), () => {
        if (busy) return;
        busy = true;
        onDemo(true);
        const duration = juice.demo(name, performance.now());
        setTimeout(() => { juice.reset(); onDemo(false); busy = false; }, duration);
      });
    }
  }

  // Volver al inicio (cierra esta sala). Pide confirmación para no salir sin querer.
  {
    const leave = button(panel, 'VOLVER AL INICIO');
    let timer = null;
    click(leave, () => {
      if (timer === null) {
        leave.textContent = 'SÍ, SALIR AL INICIO';
        leave.classList.add('danger');
        timer = setTimeout(() => { timer = null; leave.textContent = 'VOLVER AL INICIO'; leave.classList.remove('danger'); }, 5000);
        return;
      }
      window.location.assign('/');
    });
  }

  // Atajos de teclado, siempre a la vista al pie del menú.
  const keys = hint(panel);
  keys.textContent = `ATAJOS: M MENÚ · F11 PANTALLA COMPLETA${devOn ? ' · F3 PANEL DE DEPURACIÓN' : ''}`;

  let saved = null;
  try { saved = window.localStorage.getItem(TAB_KEY); } catch { /* da igual */ }
  select(pages.has(saved) ? saved : [...pages.keys()][0]);

  // Se cierra al pulsar fuera (se abre y se cierra con la tecla M: main.js).
  document.addEventListener('click', (event) => { if (!menu.contains(event.target)) menu.classList.remove('open'); });

  // main.js avisa de lo que dice el servidor (mapa y dificultad) para que los botones no mientan.
  return { setDifficulty(level) { showDifficulty(level); }, setMap(choice, current) { updateMap(choice, current); } };
}
