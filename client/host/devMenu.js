// MENÚ DE AJUSTES (AGENTS.md, secciones 44, 53 y 71): se abre y se cierra con la tecla M. Organizado como los ajustes de un videojuego: una fila
// de pestañas y, debajo, los controles de la elegida. Siempre: SONIDO, GRÁFICOS (calidad, fotogramas, pantalla completa) y DIFICULTAD. Con las
// opciones de desarrollador (stand) o el modo dev (online): PARTIDA (mapa, tests de 1 a 4 jugadores, acabar tiempo, salvapantallas),
// STAND (túnel y QR, contactos, intro, reinicio total; solo en el stand), RANKING, PRUEBAS SONIDO y ANIMACIONES.
// Qué NO hace: no toca la lógica del juego; solo envía eventos de depuración al servidor, lanza animaciones y sonidos del host
// y cambia los ajustes de sonido y de calidad.
import { EVENTS } from '../../shared/events.js';
import { setupTestBots } from './testBots.js';
import { createMapPicker } from './mapPicker.js';

// [texto del botón, nombre de la animación en juice.demo]
const DEMOS = [
  ['CUENTA ATRÁS', 'countdown'], ['GO!', 'go'], ['IMPACTO (-1 VIDA)', 'hit'], ['KO + GAME OVER', 'ko'],
  ['TIME UP', 'time'], ['POWER-UP', 'powerup'], ['NEW RECORD', 'record'], ['TOP 10 (CONFETI)', 'top10'],
];

// [texto del botón, modo de calidad que pide a main.js]
const QUALITY = [['AUTO', 'auto'], ['BAJA', 'low'], ['MEDIA', 'mid'], ['ALTA', 'high']];

// [texto del botón, nombre del sonido en sfxSounds.js]
const SOUNDS = [
  ['DISPARO', 'shot'], ['REBOTE', 'bounce'], ['IMPACTO EN MURO', 'impact'], ['TANQUE ALCANZADO', 'hit'], ['EXPLOSIÓN', 'explosion'], ['ESCUDO ROTO', 'shieldBreak'],
  ['IMPULSO', 'dash'], ['AVISO POWER-UP', 'powerupWarn'], ['POWER-UP APARECE', 'powerupSpawn'], ['POWER-UP RECOGIDO', 'powerupPick'], ['CUENTA ATRÁS', 'countdown'], ['GO!', 'go'],
  ['REAPARECER', 'spawn'], ['KO', 'ko'], ['TIEMPO AGOTADO', 'timeUp'], ['VICTORIA', 'win'], ['DERROTA', 'lose'],
  ['ENTRA JUGADOR', 'join'], ['LISTO', 'ready'], ['CAMBIO DE MODO', 'mode'],
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
export const CTO_SLIDE_KEY = 'doersforce.menu.ctoSlide'; // '0' = la secuencia del HOME no enseña la pantalla del reto del CTO (la lee logoIntro.js)
export const INTRO_REPEAT_KEY = 'doersforce.menu.introRepeat'; // '0' = la secuencia del logo no se repite en el HOME
const DEV_KEY = 'doersforce.menu.dev';

// full = menú completo de pruebas (el stand y el modo dev); sin él solo lleva SONIDO y GRÁFICOS (los ajustes de siempre de un videojuego).
// withRanking = la pestaña RANKING (online no se guarda ranking).
// devToggle = en el stand, un interruptor en el menú: apagado (lo normal) solo hay SONIDO y GRÁFICOS; encendido aparece el resto (se recuerda).
// onDevMode(on) avisa a main.js (panel F3, tecla P).
// home = en una sala online, un botón para volver a la pantalla de elegir local / online.
import { alertBox } from './alertIcon.js';

export function setupDevMenu({ $, socket, juice, sfx, gamepads = null, padSetup = null, led = null, onDemo, onIntro = null, onIntroRepeat = () => {}, onQuality, onFpsCap = () => {}, getFpsCap = () => 30, resetVisuals, full = true, withRanking = true, home = false, devToggle = false, onDevMode = () => {} }) {
  let devOn = full;
  if (devToggle) { try { devOn = window.localStorage.getItem(DEV_KEY) === '1'; } catch { devOn = false; } }
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
    refreshStand();
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

  // --- PARTIDA: tests con bots, acabar tiempo y salvapantallas ---
  let attractOn = false;
  let showAttract = () => {};
  let showDifficulty = () => {};
  let updateMap = () => {};
  // --- DIFICULTAD (pestaña propia, visible en el stand aunque las opciones de desarrollador estén apagadas y en las salas online solo en modo dev):
  // STAND = la de la feria (más suave y con ayuda de puntería, para que cualquiera pueda jugar sin frustrarse); PRO = la de siempre. ---
  if (full || !home) {
    const diff = tab('DIFICULTAD');
    title(diff, 'DIFICULTAD DE LOS BOTS');
    const levelGrid = grid(diff);
    const levelButtons = new Map();
    // Versión pública (home): FÁCIL (= la de la feria), MEDIA y PRO; normalmente las elige la anfitriona junto al QR.
    for (const [label, level] of home ? [['FÁCIL', 'stand'], ['MEDIA', 'media'], ['PRO', 'pro']] : [['STAND (FERIA)', 'stand'], ['PRO', 'pro']]) {
      const b = button(levelGrid, label);
      levelButtons.set(level, b);
      click(b, () => socket.emit(EVENTS.DIFFICULTY_SET, { level }));
    }
    showDifficulty = (level) => { for (const [l, b] of levelButtons) { b.classList.toggle('danger', l === level); b.classList.toggle('checked', l === level); } }; // el activo, en fucsia y con un check
    title(diff, home ? 'FÁCIL: BOTS LENTOS, UNA VIDA MÁS Y AYUDA DE PUNTERÍA. MEDIA: A MEDIO CAMINO. PRO: SIN AYUDAS.' : 'STAND: BOTS MÁS LENTOS Y MENOS PRECISOS, UNA VIDA MÁS Y AYUDA DE PUNTERÍA. PRO: LA DE SIEMPRE.');
  }

  if (full) {
  const game = tab('PARTIDA', true);
  // Mapa: siempre aleatorio salvo que se fije aquí (antes eran los cuadros junto al QR). Se pone ya en el lobby y se mantiene.
  title(game, 'MAPA (ALEATORIO POR DEFECTO)');
  updateMap = createMapPicker(game, (choice) => socket.emit(EVENTS.MAP_SELECT, { choice }));
  title(game, 'TESTS CON MANDOS FALSOS (EL MODO SALE DE CUÁNTOS ENTRAN)');
  const tests = grid(game);
  setupTestBots(
    new Map([1, 2, 3, 4].map((n) => [n, button(tests, '')])),
    { randomMap: () => socket.emit(EVENTS.MAP_SELECT, { reroll: true }),
      reset: () => { resetVisuals?.(); socket.emit(EVENTS.HARD_RESET); } }, // al iniciar o parar un test se corta TODA animación y temporizador pendiente
  );
  title(game, 'PARTIDA EN MARCHA Y FONDO');
  const running = grid(game);
  click(button(running, 'ACABAR TIEMPO'), () => socket.emit(EVENTS.DEBUG_END_TIME));
  // Salvapantallas: partida de bots de fondo detrás del QR mientras el stand espera jugadores.
  const attractButton = button(running, 'SALVAPANTALLAS: NO');
  showAttract = () => { attractButton.textContent = `SALVAPANTALLAS: ${attractOn ? 'SÍ' : 'NO'}`; };
  click(attractButton, () => {
    attractOn = !attractOn;
    showAttract();
    socket.emit(EVENTS.ATTRACT_SET, { on: attractOn });
  });
  }

  // --- DATOS (solo en el stand, visible sin las opciones de desarrollador): los emails y el Top 10 se guardan en ~/DeployBattle y NUNCA se borran
  // (sección 78). Descargar en Excel / CSV y hacer una copia de seguridad al momento. Las descargas solo funcionan desde el propio equipo del stand. ---
  let refreshData = () => {};
  let refreshStand = () => {};
  if (full && !home) {
    const data = tab('DATOS');
    title(data, 'EMAILS Y PUNTUACIONES');
    const dataInfo = hint(data, 'DATOS: ...');
    const dataButtons = grid(data);
    click(button(dataButtons, 'DESCARGAR EMAILS (EXCEL)'), () => { window.location.href = '/api/contacts.xlsx'; });
    click(button(dataButtons, 'DESCARGAR EMAILS (CSV)'), () => { window.location.href = '/api/contacts.csv'; });
    click(button(dataButtons, 'COPIA DE SEGURIDAD AHORA (.DB)'), () => { window.location.href = '/api/backup.db'; });
    const whereInfo = hint(data, '');
    hint(data, 'EL EXCEL TRAE DOS HOJAS: EMAILS (CON LAS PARTIDAS DE CADA UNO) Y TODAS LAS PUNTUACIONES. NADA SE BORRA: AL REINICIAR EL TOP 10 LAS PUNTUACIONES SE ARCHIVAN. HAY UNA COPIA AUTOMÁTICA AL ARRANCAR Y CADA 10 MINUTOS.');
    // Google Sheets va PLEGADO y marcado como DELICADO: la hoja ya está configurada (sheetsDefault en config.js) y no hay que tocarla en la feria.
    // Todo lo de dentro funciona igual que antes; solo está escondido hasta que se abre el desplegable.
    const fold = document.createElement('details');
    fold.className = 'dev-fold';
    const foldTitle = document.createElement('summary');
    foldTitle.textContent = 'GOOGLE SHEETS · DELICADO: YA ESTÁ CONFIGURADO, NO TOCAR';
    foldTitle.addEventListener('click', (event) => event.currentTarget.blur()); // blur: la R del reset no lo activa
    const sheets = document.createElement('div');
    sheets.className = 'dev-fold-body';
    fold.append(foldTitle, sheets);
    data.appendChild(fold);
    title(sheets, 'COPIA EN LA NUBE (GOOGLE SHEETS): CADA EMAIL NUEVO SE AÑADE A LA HOJA');
    const sheetsInfo = hint(sheets, 'GOOGLE SHEETS: ...');
    const field = (placeholder) => {
      const input = document.createElement('input');
      input.type = 'text'; input.placeholder = placeholder; input.spellcheck = false; input.autocomplete = 'off';
      input.className = 'dev-input';
      sheets.appendChild(input);
      return input;
    };
    const urlInput = field('https://script.google.com/macros/s/.../exec');
    const tokenInput = field('CLAVE (LA MISMA QUE EN EL SCRIPT)');
    const sheetsButtons = grid(sheets);
    const post = async (path, body) => (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json();
    click(button(sheetsButtons, 'GUARDAR Y CONECTAR'), async () => {
      sheetsInfo.textContent = 'GOOGLE SHEETS: GUARDANDO...';
      try {
        const r = await post('/api/sheets', { url: urlInput.value, token: tokenInput.value });
        if (!r.ok) { sheetsInfo.textContent = `GOOGLE SHEETS: ${String(r.error).toUpperCase()}`; return; }
        setTimeout(refreshData, 1500);
      } catch { sheetsInfo.textContent = 'GOOGLE SHEETS: SIN RESPUESTA DEL SERVIDOR'; }
    });
    click(button(sheetsButtons, 'ENVIAR PENDIENTES AHORA'), async () => {
      sheetsInfo.textContent = 'GOOGLE SHEETS: ENVIANDO...';
      try { await post('/api/sheets/flush'); } catch { /* se ve en el estado */ }
      refreshData();
    });
    hint(sheets, 'CÓMO SE CREA LA HOJA: DOCS/GOOGLE-SHEETS-COPIA.GS (INSTRUCCIONES DENTRO).');
    title(data, 'ZONA PELIGROSA');
    const wipeButton = button(grid(data), 'ELIMINAR TODOS LOS DATOS...');
    wipeButton.classList.add('danger');
    hint(data, 'BORRA LOS EMAILS Y TODAS LAS PUNTUACIONES DE ESTE EQUIPO. ANTES SE GUARDA UNA COPIA EN LA CARPETA DE COPIAS. LA HOJA DE GOOGLE NO SE TOCA.');
    click(wipeButton, () => openWipeDialog());
    let sheetsFilled = false;
    const when = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    refreshData = async () => {
      if (!menu.classList.contains('open') || data.hidden) return;
      try {
        const info = await (await fetch('/api/data/info')).json();
        dataInfo.textContent = info.contacts === null ? 'DATOS: NO DISPONIBLES (REVISA LA CONSOLA DEL SERVIDOR)' : `EMAILS GUARDADOS: ${info.contacts} · PUNTUACIONES: ${info.scores}${info.lastBackup ? ` · ÚLTIMA COPIA: ${when(info.lastBackup.at)}` : ''}`;
        whereInfo.textContent = `ARCHIVO: ${info.dbPath} · COPIAS: ${info.backupDir}`;
        const sh = info.sheets;
        if (sh) {
          if (!sheetsFilled) { urlInput.value = sh.url || ''; sheetsFilled = true; }
          urlInput.disabled = tokenInput.disabled = !sh.configurable;
          sheetsInfo.textContent = !sh.enabled ? 'GOOGLE SHEETS: SIN CONFIGURAR (LOS EMAILS SOLO ESTÁN EN ESTE EQUIPO)'
            : sh.lastError ? `GOOGLE SHEETS: ERROR (${sh.lastError.toUpperCase()}) · PENDIENTES: ${sh.pending} · SE REINTENTA SOLO`
              : `GOOGLE SHEETS: OK${sh.lastOkAt ? ` · ÚLTIMO ENVÍO ${when(sh.lastOkAt)}` : ''} · PENDIENTES: ${sh.pending}${sh.hasToken ? '' : ' · SIN CLAVE'}`;
        }
      } catch { dataInfo.textContent = 'DATOS: SIN RESPUESTA DEL SERVIDOR'; }
    };
  }

  // Ventana de confirmación para ELIMINAR TODOS LOS DATOS: hay que escribir "eliminar" (sin importar mayúsculas) para que se active el botón.
  function openWipeDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'wipe-overlay';
    const box = document.createElement('div');
    box.className = 'wipe-box ui-panel';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const heading = document.createElement('div');
    heading.className = 'wipe-title';
    heading.textContent = '¿ELIMINAR TODOS LOS DATOS?';
    const text = document.createElement('p');
    text.textContent = 'SE BORRARÁN TODOS LOS EMAILS Y TODAS LAS PUNTUACIONES (TAMBIÉN EL TOP 10) DE ESTE EQUIPO. ANTES SE GUARDA UNA COPIA DE SEGURIDAD. LA HOJA DE GOOGLE NO SE TOCA. PARA CONFIRMAR, ESCRIBE ELIMINAR:';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dev-input';
    input.placeholder = 'ELIMINAR';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const status = document.createElement('p');
    status.className = 'wipe-status';
    const actions = document.createElement('div');
    actions.className = 'dev-grid';
    const cancel = button(actions, 'CANCELAR');
    const confirm = button(actions, 'ELIMINAR');
    confirm.classList.add('danger');
    confirm.disabled = true;
    box.append(heading, text, input, status, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    const close = () => overlay.remove();
    input.addEventListener('input', () => { confirm.disabled = input.value.trim().toLowerCase() !== 'eliminar'; });
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); if (event.key === 'Enter' && !confirm.disabled) confirm.click(); });
    click(cancel, close);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
    click(confirm, async () => {
      confirm.disabled = true;
      status.textContent = 'ELIMINANDO...';
      try {
        const r = await (await fetch('/api/data/wipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: input.value }) })).json();
        if (!r.ok) { status.textContent = String(r.error || 'NO SE PUDO ELIMINAR').toUpperCase(); confirm.disabled = false; return; }
        status.textContent = r.backup ? `HECHO. COPIA PREVIA: ${r.backup}` : 'HECHO.';
        refreshData();
        setTimeout(close, 2500);
      } catch { status.textContent = 'SIN RESPUESTA DEL SERVIDOR'; confirm.disabled = false; }
    });
  }

  // --- STAND (solo en el portátil del stand, con las opciones de desarrollador): túnel y QR, intro del logo y reinicio total. ---
  if (full && !home) {
    const stand = tab('STAND', true);
    title(stand, 'TÚNEL Y CÓDIGO QR');
    const tunnelInfo = hint(stand, 'TÚNEL: ...');
    confirmButton(grid(stand), 'ABRIR UN TÚNEL NUEVO (CAMBIA EL QR)', 'SÍ, CAMBIAR EL QR', () => { socket.emit(EVENTS.TUNNEL_RESTART); tunnelInfo.textContent = 'TÚNEL: CONECTANDO...'; });
    const refreshTunnel = async () => {
      try {
        const { playUrl, tunnel, tunnelReason } = await (await fetch('/api/host-config')).json();
        tunnelInfo.textContent = tunnel === 'ready' ? `TÚNEL: LISTO · ${playUrl}` : tunnel === 'starting' ? 'TÚNEL: CONECTANDO...'
          : tunnel === 'failed' ? `SIN TÚNEL (${tunnelReason || 'ERROR'}): EL QR SOLO SIRVE EN ESTA WI-FI · ${playUrl}` : `SIN TÚNEL · ${playUrl}`;
      } catch { tunnelInfo.textContent = 'TÚNEL: SIN RESPUESTA DEL SERVIDOR'; }
    };
    title(stand, 'PANTALLA DE INICIO');
    const introButton = button(grid(stand), '');
    let introRepeat = true;
    try { introRepeat = window.localStorage.getItem(INTRO_REPEAT_KEY) !== '0'; } catch { /* da igual */ }
    const showIntro = () => { introButton.textContent = `REPETIR LA INTRO DEL LOGO: ${introRepeat ? 'SÍ' : 'NO'}`; };
    click(introButton, () => {
      introRepeat = !introRepeat;
      try { window.localStorage.setItem(INTRO_REPEAT_KEY, introRepeat ? '1' : '0'); } catch { /* da igual */ }
      onIntroRepeat(introRepeat);
      showIntro();
    });
    showIntro();
    title(stand, 'EMERGENCIA');
    confirmButton(grid(stand), 'REINICIO TOTAL (COMO R 3 S)', 'SÍ, REINICIAR TODO', () => {
      menu.classList.remove('open');
      $('emergency').hidden = false;
      socket.emit(EVENTS.EMERGENCY_RESET);
      setTimeout(() => window.location.reload(), 2500);
    });
    hint(stand, 'EXPULSA A LOS MÓVILES, CANCELA LA PARTIDA, VUELVE A LOS AJUSTES DE FÁBRICA Y ABRE UN TÚNEL NUEVO.');
    // Se refresca al abrir el menú o la pestaña y, mientras se ve, cada 3 s.
    refreshStand = () => { if (menu.classList.contains('open') && !stand.hidden) refreshTunnel(); refreshData(); };
    setInterval(refreshStand, 3000);
  }

  // --- RANKING: borrar el Top 10 y dejar el de ejemplo (10 x BOB con 3000). Pide confirmación para que no se borre sin querer:
  // el primer pulso cambia el botón a "SÍ, BORRAR" (en fucsia) y aparece "CANCELAR"; si no se confirma en 5 s, vuelve solo. ---
  if (full && withRanking) {
  const ranking = tab('RANKING', true);
  title(ranking, 'TOP 10 NUEVO (LAS PUNTUACIONES ACTUALES SE ARCHIVAN, NO SE BORRAN: SIGUEN EN EL EXCEL)');
  const resets = grid(ranking);
  { // un único Top 10 (sección 70): un solo botón
    const label = 'EMPEZAR UN TOP 10 NUEVO';
    const resetButton = button(resets, label);
    const cancelButton = button(resets, 'CANCELAR');
    cancelButton.hidden = true;
    let confirmTimer = null;
    const endConfirm = () => {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      resetButton.textContent = label;
      resetButton.classList.remove('danger');
      cancelButton.hidden = true;
    };
    click(resetButton, () => {
      if (confirmTimer === null) {
        resetButton.textContent = 'SÍ, EMPEZAR DE CERO';
        resetButton.classList.add('danger');
        cancelButton.hidden = false;
        confirmTimer = setTimeout(endConfirm, 5000);
        return;
      }
      endConfirm();
      socket.emit(EVENTS.LEADERBOARD_RESET, {});
    });
    click(cancelButton, endConfirm);
  }
  }

  // --- MANDOS físicos enchufados a la pantalla (sección 72): qué mandos ve el navegador, qué pulsan en directo y su configuración. ---
  let refreshPads = () => {};
  // Versión pública: MANDOS con el configurador nuevo (padSetup.js: START, SELECT, A, B, R1, L1). Cada mando detectado, su estado, lo que pulsa en
  // directo y CONFIGURAR (también para volver a configurarlo) o BORRAR SU CONFIGURACIÓN.
  if (home && padSetup && full) { // solo en modo desarrollador (el jugador lo arregla manteniendo un botón 4 s)
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
  if (gamepads && !home) {
    const padsPage = tab('MANDOS');
    title(padsPage, 'CÓMO SE JUEGA CON MANDO');
    hint(padsPage, 'GAME BOX JOYSTICK (WINDOWS): L2 + R2 A LA VEZ = UNIRSE (MANDO1, MANDO2...) · OTRA VEZ = LISTO · STICK IZQUIERDO = MOVER · STICK DERECHO = APUNTAR · L1 = IMPULSO · R1 = DISPARAR. EN MANDOS ESTÁNDAR: START + SELECT, L2 Y R2.');
    title(padsPage, 'MANDOS DETECTADOS');
    const box = document.createElement('div');
    padsPage.appendChild(box);
    const learnInfo = hint(padsPage);
    let shownKey = '';
    const rows = new Map(); // índice -> { status, live }
    const render = (list) => {
      box.replaceChildren();
      rows.clear();
      if (!list.length) { hint(box, 'NINGUNO. EL NAVEGADOR SOLO LOS ENSEÑA DESPUÉS DE PULSAR UN BOTÓN DEL MANDO (CON ESTA PANTALLA DELANTE).'); return; }
      for (const pad of list) {
        title(box, `${pad.name} · ${pad.id}`);
        const status = hint(box);
        const live = hint(box);
        const actions = grid(box);
        click(button(actions, 'CONFIGURAR BOTONES'), () => {
          learnInfo.textContent = '';
          gamepads.learn(pad.index, {
            onStep: (text) => { learnInfo.textContent = `CONFIGURANDO ${pad.name}: ${text}`; },
            onDone: (ok) => { learnInfo.textContent = ok ? `${pad.name}: CONFIGURACIÓN GUARDADA (VALE PARA TODOS LOS MANDOS IGUALES).` : 'CONFIGURACIÓN CANCELADA.'; shownKey = ''; },
          });
        });
        click(button(actions, 'USAR LA CONFIGURACIÓN AUTOMÁTICA'), () => { gamepads.cancelLearn(); gamepads.resetMapping(pad.id); learnInfo.textContent = `${pad.name}: CONFIGURACIÓN AUTOMÁTICA.`; shownKey = ''; });
        rows.set(pad.index, { status, live });
      }
    };
    refreshPads = () => {
      if (!menu.classList.contains('open') || padsPage.hidden) return;
      const list = gamepads.list();
      const key = list.map((p) => `${p.index}:${p.id}:${p.custom}`).join('|');
      if (key !== shownKey) { shownKey = key; render(list); }
      for (const pad of list) {
        const row = rows.get(pad.index);
        if (!row) continue;
        row.status.textContent = `${pad.joined ? (pad.ready ? 'EN LA PARTIDA · LISTO' : 'EN LA PARTIDA') : 'SIN UNIRSE'} · CONFIGURACIÓN ${pad.custom ? 'PERSONALIZADA' : pad.standard ? 'AUTOMÁTICA (ESTÁNDAR)' : 'AUTOMÁTICA (MANDO GENÉRICO)'}`;
        row.live.textContent = `BOTONES PULSADOS: ${pad.pressed.length ? pad.pressed.join(', ') : '-'} · EJES: ${pad.axes.map((v) => v.toFixed(2)).join(' ')}`;
      }
    };
    setInterval(refreshPads, 150);
  }

  // --- GRÁFICOS: AUTO baja sola si va justo (nunca vuelve a subir); BAJA / MEDIA / ALTA la fijan a mano. ---
  // BAJA = nivel 3 (sin bloom y algo menos de gente), MEDIA = nivel 1 (bloom a menos resolución), ALTA = nivel 0 (todo).
  // --- PANEL LED del stand (sección 75): emparejar el panel por Bluetooth, brillo, imagen de prueba y reenviar el podio del Top 3. ---
  let showLed = () => {};
  if (led) {
    const ledPage = tab('PANEL LED');
    title(ledPage, 'PANEL LED (BLUETOOTH)');
    const ledInfo = hint(ledPage, 'PANEL: ...');
    const ledButtons = grid(ledPage);
    click(button(ledButtons, 'CONECTAR PANEL'), () => led.pair());
    click(button(ledButtons, 'VOLVER A ENVIAR EL TOP 3'), () => led.resend());
    click(button(ledButtons, 'IMAGEN DE PRUEBA'), () => led.test());
    click(button(ledButtons, 'DESCONECTAR'), () => led.disconnect());
    title(ledPage, 'BRILLO');
    const row = document.createElement('label');
    row.className = 'dev-row';
    const label = document.createElement('span');
    label.textContent = 'BRILLO';
    const input = document.createElement('input');
    input.type = 'range'; input.min = '5'; input.max = '100'; input.step = '5';
    const value = document.createElement('span');
    value.className = 'dev-value';
    input.addEventListener('change', () => led.setBrightness(Number(input.value)));
    input.addEventListener('input', () => { value.textContent = `${input.value}%`; });
    row.append(label, input, value);
    ledPage.appendChild(row);
    hint(ledPage, 'LA PRIMERA VEZ SE ABRE SOLA LA LISTA DE BLUETOOTH AL PULSAR UNA TECLA (O CONECTAR PANEL): ELIGE LED_BLE_... DESPUÉS SE CONECTA SOLO Y ENSEÑA EL PODIO DEL TOP 3 CADA VEZ QUE CAMBIA.');
    const TEXT = { unsupported: 'ESTE NAVEGADOR NO TIENE BLUETOOTH (USA CHROME O EDGE)', off: 'SIN CONECTAR', connecting: 'CONECTANDO...', ready: 'CONECTADO', lost: 'NO LLEGA AL PANEL: REINTENTANDO...', error: 'ERROR', noadapter: 'ESTE EQUIPO NO TIENE BLUETOOTH (EL PANEL VA POR BLUETOOTH; EL USB SOLO LE DA CORRIENTE)' };
    showLed = (st) => {
      ledInfo.textContent = `PANEL: ${TEXT[st.status] ?? st.status}${st.name ? ` · ${st.name}` : ''}${st.status === 'ready' ? ` · ${st.width}X${st.height}` : ''}${st.detail ? ` · ${String(st.detail).toUpperCase()}` : ''}`;
      input.value = String(st.brightness);
      value.textContent = `${st.brightness}%`;
    };
    showLed(led.state);
  }

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
  // Pantalla completa (lo mismo que F11; el lanzador iniciar.bat / iniciar.sh ya abre el host así).
  title(graphics, 'PANTALLA');
  const fsButton = button(grid(graphics), '');
  const showFs = () => { fsButton.textContent = document.fullscreenElement ? 'SALIR DE PANTALLA COMPLETA' : 'PANTALLA COMPLETA'; };
  click(fsButton, () => {
    const done = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    Promise.resolve(done).catch(() => {}).finally(showFs);
  });
  document.addEventListener('fullscreenchange', showFs);
  showFs();
  // Pantalla del reto del CTO de la secuencia del HOME (logoIntro.js la lee al empezar cada secuencia). Siempre visible, sin opciones de desarrollador.
  // La versión pública (home) no la tiene.
  if (!home) {
    title(graphics, 'PANTALLA DEL RETO DEL CTO');
    const ctoButton = button(grid(graphics), '');
    let ctoOn = true;
    try { ctoOn = window.localStorage.getItem(CTO_SLIDE_KEY) !== '0'; } catch { /* da igual */ }
    const showCto = () => { ctoButton.textContent = `PANTALLA DEL RETO DEL CTO: ${ctoOn ? 'SÍ' : 'NO'}`; };
    click(ctoButton, () => {
      ctoOn = !ctoOn;
      try { window.localStorage.setItem(CTO_SLIDE_KEY, ctoOn ? '1' : '0'); } catch { /* da igual */ }
      showCto();
    });
    showCto();
  }
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

  // Volver a la pantalla de elegir local / online (cierra esta pantalla de la sala). Pide confirmación para no salir sin querer.
  if (home) {
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

  // Interruptor de las opciones de desarrollador (stand).
  if (devToggle) {
    const toggle = button(panel, '');
    const show = () => { toggle.textContent = `OPCIONES DE DESARROLLADOR: ${devOn ? 'SÍ' : 'NO'}`; toggle.classList.toggle('danger', devOn); };
    click(toggle, () => {
      devOn = !devOn;
      try { window.localStorage.setItem(DEV_KEY, devOn ? '1' : '0'); } catch { /* da igual */ }
      for (const p of pages.values()) if (p.dev) p.button.hidden = !devOn;
      showFps();
      onDevMode(devOn);
      if (!devOn) socket.emit(EVENTS.MAP_SELECT, { choice: 'random' }); // sin opciones de desarrollador el mapa vuelve a ser aleatorio
      const current = [...pages].find(([, p]) => !p.page.hidden);
      if (!current || (current[1].dev && !devOn)) select([...pages.keys()][0]);
      show();
      showKeys();
    });
    show();
    showFps();
    onDevMode(devOn);
  }

  // Atajos de teclado, siempre a la vista al pie del menú.
  const keys = hint(panel);
  const showKeys = () => { keys.textContent = `ATAJOS: M MENÚ · R (3 S) REINICIO TOTAL · F11 PANTALLA COMPLETA${devOn ? ' · F3 PANEL DE DEPURACIÓN' : ''}`; };
  showKeys();

  let saved = null;
  try { saved = window.localStorage.getItem(TAB_KEY); } catch { /* da igual */ }
  select(pages.has(saved) ? saved : [...pages.keys()][0]);

  // Se abre con la pestaña de arriba a la izquierda y se cierra al pulsar fuera.
  $('dev-toggle').addEventListener('click', (event) => {
    event.stopPropagation();
    $('dev-toggle').blur();
    const open = menu.classList.toggle('open');
    $('dev-toggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) { menu.classList.remove('open'); $('dev-toggle').setAttribute('aria-expanded', 'false'); }
  });

  // main.js abre y cierra el menú con la tecla M: al abrirlo se refresca la pestaña STAND.
  new MutationObserver(() => refreshStand()).observe(menu, { attributes: true, attributeFilter: ['class'] });

  // main.js avisa de lo que dice el servidor (lobby_state.attractOn) para que el botón no mienta tras recargar el host.
  return { setLed(st) { showLed(st); }, setAttract(on) { attractOn = Boolean(on); showAttract(); }, setDifficulty(level) { showDifficulty(level); }, setMap(choice, current) { updateMap(choice, current); } };
}
