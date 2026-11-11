// Pantalla de título de DEPLOY BATTLE (AGENTS.md, sección 56): "PULSA UNA TECLA" al abrir el host (el navegador no deja sonar hasta el
// primer clic o tecla), y la intro: sobre la ciudad oscurecida, DEPLOY entra deslizándose desde la izquierda y BATTLE desde la derecha con
// rayas de velocidad, chocan con sacudida y chispas, flash blanco y, al irse el blanco, aparece el lobby completo (barra superior, logo,
// tarjeta del QR, fichas). Versión completa al arrancar (~3,4 s) y corta (~1,9 s) al volver al lobby tras una partida.
// Todo a pasos y en celdas enteras del logo (sin suavizados ni medios píxeles). Qué NO hace: el bucle del lobby (lobbyLogo.js).
import { createSparks } from './logoSparks.js';
import { createChallengeSlide } from './challengeSlide.js';

// Guion de la versión completa, en ms; la corta lo multiplica por SHORT. Los sonidos salen en los mismos instantes.
const T = { deployIn: 250, deployOut: 950, battleIn: 550, battleOut: 1250, hit: 1250, flash: 2650, swap: 2850, end: 3400 };
// Secuencia completa (con preludio) = DOERS DF presents → DEPLOY BATTLE → pantalla del reto → flash → lobby (sección 87). En vez del flash
// blanco, DEPLOY BATTLE se funde a negro en 4 pasos, debajo aparece el reto (el negro se retira en otros 4), dura SLIDE_MS y entonces
// llega el flash blanco de siempre hacia el lobby.
const SLIDE_MS = 6800; // 1,6 s de espaldas + giro + ~4,5 s con el texto
const FADE_STEP = 175;
const CTO = { fadeFrom: T.flash, show: T.flash + 4 * FADE_STEP, flash: T.flash + 4 * FADE_STEP + SLIDE_MS };
CTO.swap = CTO.flash + (T.swap - T.flash); CTO.end = CTO.flash + (T.end - T.flash);
const SHORT = 0.55;
// Preludio de la secuencia completa (ms): logo de DOERS DF que aparece a pasos, "presents..." que se escribe, y fundido a negro. Después empieza la animación de DEPLOY BATTLE (T).
const PRE_MS = 2900;
const PRE = { logoIn: 150, logoSteps: 4, logoStep: 150, typeFrom: 900, typeEvery: 80, fadeFrom: 2200, fadeSteps: 4, fadeStep: 175 };
const PRESENTS = 'presents...';
const SHAKE = [[2, 0], [-2, 1], [2, -1], [-1, 1], [1, 0], [-1, 0], [0, 0]]; // sacudida del choque, en celdas, 40 ms cada paso
const LINES = 6; // rayas de velocidad por palabra
const RAIN = [[0, 36], [130, 30], [290, 24]]; // lluvia del choque: [ms tras el choque, partículas] de cada oleada

// Borde inferior del rótulo (las dos palabras juntas) en cada columna: la fila más baja con un píxel opaco, o -1. De ahí cae la lluvia.
function measureBottoms(imgs) {
  const w = imgs[0].naturalWidth; const h = imgs[0].naturalHeight;
  const bottom = new Int16Array(w).fill(-1);
  for (const img of imgs) {
    const probe = document.createElement('canvas');
    probe.width = w; probe.height = h;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(img, 0, 0);
    const data = pctx.getImageData(0, 0, w, h).data;
    for (let x = 0; x < w; x++) for (let y = h - 1; y > bottom[x]; y--) if (data[(y * w + x) * 4 + 3] > 200) { bottom[x] = y; break; }
  }
  let xMin = -1; let xMax = -1;
  for (let x = 0; x < w; x++) if (bottom[x] >= 0) { if (xMin < 0) xMin = x; xMax = x; }
  if (xMin < 0 || xMax - xMin < 8) throw new Error('sin rótulo');
  return { bottom, xMin, xMax };
}

// Borde por el que entra una palabra y altura de sus letras ahí: la primera (o última) columna con letra y el alto de las 12 siguientes.
// Cuenta como letra un píxel opaco y claro (el reborde y la sombra son oscuros). Se lee del PNG de la palabra, así sigue su inclinación.
function measureWord(img, fromLeft) {
  const w = img.naturalWidth; const h = img.naturalHeight;
  const probe = document.createElement('canvas');
  probe.width = w; probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, 0);
  const data = pctx.getImageData(0, 0, w, h).data;
  const lit = (x, y) => { const o = (y * w + x) * 4; return data[o + 3] > 200 && data[o] + data[o + 1] + data[o + 2] > 150; };
  let edge = -1;
  for (let i = 0; i < w && edge < 0; i++) { const x = fromLeft ? i : w - 1 - i; for (let y = 0; y < h; y++) if (lit(x, y)) { edge = x; break; } }
  if (edge < 0) throw new Error('sin letras');
  let y0 = h; let y1 = -1;
  for (let k = 0; k < 12; k++) {
    const x = fromLeft ? edge + k : edge - k;
    if (x < 0 || x >= w) break;
    for (let y = 0; y < h; y++) if (lit(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { edge, y0, y1 };
}
const easeOut = (p) => 1 - (1 - p) ** 3;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// withCto = false en la versión pública: la secuencia es DOERS DF presents -> DEPLOY BATTLE -> QR, sin el reto del CTO.
export function createLogoIntro({ $, sfx, onReveal = () => {}, shouldPlay = () => true, withCto = true }) {
  const root = $('intro');
  const logo = $('intro-logo');
  const wordDeploy = $('intro-deploy');
  const wordBattle = $('intro-battle');
  const outlineDeploy = $('intro-deploy-o'); // rebordes y sombras: se mueven con su palabra pero van debajo de todas las letras
  const outlineBattle = $('intro-battle-o');
  const canvas = $('intro-fx');
  const ctx = canvas.getContext('2d');
  const flash = $('intro-flash');
  const press = $('press-start');
  const doers = $('intro-doers');
  const doersLogo = $('intro-doers-logo');
  const presentsEl = $('intro-presents');
  const sparks = createSparks(120, 26);
  const slide = createChallengeSlide({ $ });
  const black = $('intro-black');
  let cto = false;     // esta reproducción lleva la pantalla del reto (solo la secuencia completa)
  let blackShown = null;
  let phase = 'idle'; // 'press' (esperando una tecla) | 'play' | 'idle'
  let t0 = 0; let scale = 1; let lastNow = 0;
  let cell = 6; let cols = 0; let rows = 0; let col0 = 0; let row0 = 0; let natW = 0; let natH = 0;
  let done = null; let shown = null; let frozen = null;
  let edges = null; // { deploy, battle }: borde de entrada y altura de las letras de cada palabra (se mide una vez)
  let profile = null; // { bottom[x], xMin, xMax }: borde inferior del rótulo entero columna a columna (se mide una vez)
  let pre = 0;         // duración del preludio de DOERS DF de esta reproducción (0 = sin preludio)
  let preOver = true;
  let quiet = false;   // las repeticiones automáticas van sin sonido (cada 10 s sería insoportable)
  let lastEndAt = null; // cuándo terminó la última secuencia: la siguiente empieza repeatMs después de ESE momento (más espaciado)
  let repeatMs = 0; let canRepeat = () => false;
  let preShown = { opacity: null, text: null };
  let wave = 0;       // oleada de la lluvia del choque por la que va
  const lines = Array.from({ length: LINES * 2 }, () => ({ y: 0, len: 0, color: '#ffffff', thick: 1 })); // reparto fijo de cada intro
  const fired = { s1: false, s2: false, hit: false, flash: false, swap: false, cto: false };

  const sound = (name, args) => { if (quiet) return; try { sfx.play(name, args); } catch { /* sin audio: la intro sigue */ } };
  const setFlash = (opacity) => { if (opacity !== shown) { shown = opacity; flash.style.opacity = String(opacity); } };
  const setBlack = (opacity) => { if (opacity !== blackShown) { blackShown = opacity; black.style.opacity = String(opacity); } };

  function finish() {
    phase = 'idle';
    lastEndAt = performance.now();
    sparks.clear();
    root.hidden = true;
    root.classList.remove('revealed');
    logo.hidden = false;
    logo.style.transform = ''; logo.style.filter = '';
    doers.hidden = true; root.classList.remove('prelude'); pre = 0; preOver = true;
    slide.hide(); cto = false; setBlack(0);
    setFlash(0);
    document.body.classList.remove('intro-on');
    done?.();
  }

  // short = versión corta (al volver al lobby tras una partida). onDone avisa cuando acaba (o se salta).
  // prelude = antepone el logo de DOERS DF + "presents..." y el fundido a negro (solo en la versión completa). silent = sin sonido.
  function start({ short = false, onDone = null, prelude = false, silent = false } = {}) {
    quiet = silent;
    natW = wordDeploy.naturalWidth; natH = wordDeploy.naturalHeight;
    done = onDone;
    if (!natW || !natH || phase === 'play') { finish(); return; } // la imagen no ha cargado: sin intro, el lobby sale directo
    scale = short ? SHORT : 1;
    pre = prelude && !short && doersLogo.naturalWidth ? PRE_MS : 0;
    preOver = pre === 0;
    let ctoOff = false;
    try { ctoOff = window.localStorage.getItem('doersforce.menu.ctoSlide') === '0'; } catch { /* da igual */ } // interruptor del menú (GRÁFICOS)
    cto = pre > 0 && !ctoOff && withCto; slide.hide(); setBlack(0); // la versión pública no tiene la pantalla del reto
    // Una celda = un píxel del logo en pantalla, en enteros: grande, ocupando como mucho el 78 % del ancho y el 62 % del alto.
    cell = Math.max(1, Math.floor(Math.min((innerWidth * 0.78) / natW, (innerHeight * 0.62) / natH)));
    cols = Math.ceil(innerWidth / cell); rows = Math.ceil(innerHeight / cell);
    canvas.width = cols; canvas.height = rows;
    canvas.style.width = `${cols * cell}px`; canvas.style.height = `${rows * cell}px`;
    col0 = Math.floor((cols - natW) / 2); row0 = Math.floor((rows - natH) / 2);
    logo.style.left = `${col0 * cell}px`; logo.style.top = `${row0 * cell}px`;
    logo.style.width = `${natW * cell}px`; logo.style.height = `${natH * cell}px`;
    // Las rayas salen a la altura de las letras de SU palabra, en el borde por donde entra (no en todo el alto del logo).
    try { edges ??= { deploy: measureWord(wordDeploy, true), battle: measureWord(wordBattle, false) }; } catch { edges = null; }
    try { profile ??= measureBottoms([wordDeploy, wordBattle]); } catch { profile = null; }
    wave = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const band = edges ? (i < LINES ? edges.deploy : edges.battle) : { y0: 4, y1: natH - 4 };
      l.y = row0 + band.y0 + Math.floor(Math.random() * (band.y1 - band.y0 + 1));
      l.len = 0.6 + Math.random() * 0.9;
      l.color = ['#ffffff', '#ffffff', '#ff9cca', '#9fb0ff'][i % 4];
      l.thick = Math.random() < 0.3 ? 2 : 1;
    }
    for (const key of Object.keys(fired)) fired[key] = false;
    sparks.clear();
    wordDeploy.style.transform = outlineDeploy.style.transform = `translateX(${-(col0 + natW) * cell}px)`;
    wordBattle.style.transform = outlineBattle.style.transform = `translateX(${(cols - col0) * cell}px)`;
    root.classList.remove('revealed');
    root.classList.toggle('prelude', pre > 0);
    if (pre > 0) { // el logo de DOERS en celdas enteras, como mucho el 50 % del ancho y el 22 % del alto
      const pc = Math.max(1, Math.floor(Math.min((innerWidth * 0.5) / doersLogo.naturalWidth, (innerHeight * 0.22) / doersLogo.naturalHeight)) || 1);
      doersLogo.style.width = `${doersLogo.naturalWidth * pc}px`; doersLogo.style.height = `${doersLogo.naturalHeight * pc}px`;
      presentsEl.style.fontSize = `${pc * 9}px`; presentsEl.style.marginTop = `${pc * 6}px`;
      doers.hidden = false; doers.style.opacity = '0'; presentsEl.textContent = '';
      preShown = { opacity: 0, text: '' };
    } else doers.hidden = true;
    root.hidden = false;
    document.body.classList.add('intro-on');
    shown = null; setFlash(0);
    t0 = 0; lastNow = 0;
    phase = 'play';
  }

  // Preludio (t en ms desde el principio de la secuencia): el logo aparece a pasos, "presents..." se escribe letra a letra y todo se funde a negro.
  function drawPrelude(t) {
    let opacity = 1;
    if (t < PRE.logoIn) opacity = 0;
    else if (t < PRE.logoIn + PRE.logoSteps * PRE.logoStep) opacity = Math.ceil((t - PRE.logoIn + 1) / PRE.logoStep) / PRE.logoSteps;
    if (t >= PRE.fadeFrom) opacity = Math.max(0, 1 - Math.ceil((t - PRE.fadeFrom + 1) / PRE.fadeStep) / PRE.fadeSteps);
    if (opacity !== preShown.opacity) { preShown.opacity = opacity; doers.style.opacity = String(opacity); }
    const typed = t < PRE.typeFrom ? 0 : Math.min(PRESENTS.length, Math.floor((t - PRE.typeFrom) / PRE.typeEvery) + 1);
    const cursorOn = typed > 0 && Math.floor(t / 350) % 2 === 0 && (typed < PRESENTS.length || t < PRE.fadeFrom);
    // Siempre se pinta la frase entera + el cursor y lo que aún no toca va invisible: así el ancho no cambia y el texto centrado no se mueve al parpadear.
    const key = `${typed}|${cursorOn}`;
    if (key !== preShown.text) {
      preShown.text = key;
      presentsEl.innerHTML = `${PRESENTS.slice(0, typed)}<span style="visibility:${cursorOn ? 'visible' : 'hidden'}">_</span><span style="visibility:hidden">${PRESENTS.slice(typed)}</span>`;
    }
  }

  // Raya de velocidad detrás de una palabra que se mueve: nace en su borde de entrada, a la altura de sus letras, y se alarga hacia atrás.
  function streaks(first, offset, dir, p, edge) {
    if (p <= 0 || p >= 1) return;
    for (let i = first; i < first + LINES; i++) {
      const l = lines[i];
      const len = Math.round((10 + 70 * (1 - p)) * l.len);
      const anchor = col0 + offset + edge + (dir > 0 ? 3 : -3); // 3 celdas dentro de la palabra: la raya queda pegada a su borde
      ctx.fillStyle = l.color;
      ctx.fillRect(dir > 0 ? anchor - len : anchor, l.y, len, l.thick);
    }
  }

  // Cae polvo y chispas del borde inferior de las letras en TODO su ancho, con más densidad en el centro y casi nada en los extremos
  // (peso senoidal): ahí además duran menos y son de una celda, así se notan menos.
  function rain(count) {
    const span = profile.xMax - profile.xMin;
    for (let tries = 0, placed = 0; tries < count * 14 && placed < count; tries++) {
      const x = profile.xMin + Math.floor(Math.random() * (span + 1));
      const bottom = profile.bottom[x];
      if (bottom < 0) continue;
      const weight = Math.sin((Math.PI * (x - profile.xMin)) / span) ** 1.3;
      if (Math.random() > weight) continue;
      sparks.emit(col0 + x, row0 + bottom + 1 + Math.floor(Math.random() * 2), (Math.random() - 0.5) * 5, -3 + Math.random() * 8,
        (0.5 + 0.9 * weight) * (0.7 + Math.random() * 0.6), Math.floor(Math.random() * 5), weight > 0.55 && Math.random() < 0.35 ? 2 : 1);
      placed++;
    }
  }

  function ring(t) { // onda cuadrada que se abre desde el choque, a pasos de 60 ms
    const step = Math.floor((t - T.hit) / 60);
    if (step < 0 || step > 5) return;
    const r = 6 + step * 6; const cx = col0 + Math.round(natW * 0.5); const cy = row0 + Math.round(natH * 0.55);
    ctx.fillStyle = step < 3 ? '#ffffff' : '#ff9cca';
    const w = r * 2; const h = Math.round(r * 1.1);
    ctx.fillRect(cx - w, cy - h, w * 2, 1); ctx.fillRect(cx - w, cy + h, w * 2, 1);
    ctx.fillRect(cx - w, cy - h, 1, h * 2); ctx.fillRect(cx + w, cy - h, 1, h * 2);
  }

  function update(now) {
    // Repetición automática: con el lobby vacío, la secuencia completa vuelve a empezar repeatMs después de acabar la anterior (sin sonido). Si en ese momento no toca (hay
    // jugadores, partida...), se vuelve a mirar en cada fotograma hasta que toque.
    if (phase === 'idle') {
      if (repeatMs && lastEndAt !== null && now - lastEndAt >= repeatMs && canRepeat()) start({ short: false, prelude: true });
      return;
    }
    if (phase !== 'play') return;
    if (!t0) { t0 = now; lastNow = now; }
    const raw = frozen ?? (now - t0) / scale; // tiempo desde el principio (frozen: solo para depurar, ver seek)
    if (!preOver) {
      if (raw < pre) { drawPrelude(raw); return; }
      preOver = true; root.classList.remove('prelude'); doers.hidden = true; // negro total: empieza la animación de DEPLOY BATTLE
    }
    const t = raw - pre; // tiempo en la escala de la versión completa de la animación de DEPLOY BATTLE
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;

    const tl = cto ? CTO : T; // con el reto, el flash hacia el lobby llega más tarde
    if (t >= tl.swap) {
      if (!fired.swap) { // blanco total: debajo se cambia la intro por el lobby de verdad
        fired.swap = true;
        logo.hidden = true; ctx.clearRect(0, 0, cols, rows); sparks.clear();
        slide.hide(); setBlack(0);
        root.classList.add('revealed');
        document.body.classList.remove('intro-on');
        sound('introReveal');
        onReveal();
      }
      if (t >= tl.end) { finish(); return; }
      setFlash(1 - Math.floor(clamp01((t - tl.swap) / (tl.end - tl.swap)) * 5) / 5); // el blanco se retira en 5 pasos
      return;
    }
    // Pantalla del reto: DEPLOY BATTLE se funde a negro en 4 pasos, debajo aparece el reto y el negro se retira en otros 4.
    if (cto && t >= CTO.fadeFrom) {
      const steps = (from) => Math.min(4, Math.floor((t - from) / FADE_STEP) + 1);
      setBlack(t < CTO.show ? steps(CTO.fadeFrom) / 4 : 1 - steps(CTO.show) / 4);
      if (t >= CTO.show) {
        if (!fired.cto) { fired.cto = true; logo.hidden = true; ctx.clearRect(0, 0, cols, rows); sparks.clear(); slide.show(cell); }
        slide.update(t - CTO.show, sound);
        if (t >= CTO.flash) { // flash blanco en 4 pasos hacia el lobby
          if (!fired.flash) { fired.flash = true; sound('introFlash'); }
          setFlash(Math.floor(clamp01((t - CTO.flash) / (CTO.swap - CTO.flash)) * 4) / 4);
        }
        return;
      }
    }

    // Las dos palabras entran deslizándose y frenan en seco al encajar.
    const pD = easeOut(clamp01((t - T.deployIn) / (T.deployOut - T.deployIn)));
    const pB = easeOut(clamp01((t - T.battleIn) / (T.battleOut - T.battleIn)));
    const offD = Math.round((1 - pD) * -(col0 + natW)); const offB = Math.round((1 - pB) * (cols - col0));
    wordDeploy.style.transform = outlineDeploy.style.transform = `translateX(${offD * cell}px)`;
    wordBattle.style.transform = outlineBattle.style.transform = `translateX(${offB * cell}px)`;
    if (!fired.s1 && t >= T.deployIn) { fired.s1 = true; sound('introSlide', { pan: -0.55 }); }
    if (!fired.s2 && t >= T.battleIn) { fired.s2 = true; sound('introSlide', { pan: 0.55 }); }
    if (!fired.hit && t >= T.hit) {
      fired.hit = true;
      sound('introHit'); sfx.duck?.(0.35, 0.5, 0.9);
      if (!profile) sparks.burst(col0 + natW * 0.5, row0 + natH * 0.55, 44, 46, 0.9); // sin medir las letras: estallido desde el centro
    }
    // Lluvia de partículas del choque: cae de todo el ancho de las letras, en 3 oleadas.
    if (fired.hit && profile && wave < RAIN.length && t >= T.hit + RAIN[wave][0]) rain(RAIN[wave++][1]);
    // Sacudida y destello de brillo en el choque.
    const si = Math.floor((t - T.hit) / 40);
    logo.style.transform = fired.hit && si < SHAKE.length ? `translate(${SHAKE[si][0] * cell}px, ${SHAKE[si][1] * cell}px)` : '';
    logo.style.filter = fired.hit && t - T.hit < 110 ? 'brightness(1.7)' : '';

    ctx.clearRect(0, 0, cols, rows);
    streaks(0, offD, 1, pD, edges?.deploy.edge ?? natW * 0.4);
    streaks(LINES, offB, -1, pB, edges?.battle.edge ?? natW * 0.6);
    if (fired.hit) ring(t);
    sparks.step(dt);
    if (sparks.alive) sparks.draw(ctx);

    if (!cto && t >= T.flash) { // flash blanco en 4 pasos hasta el blanco total
      if (!fired.flash) { fired.flash = true; sound('introFlash'); }
      setFlash(Math.floor(clamp01((t - T.flash) / (T.swap - T.flash)) * 4) / 4);
    }
  }

  // Pantalla "PULSA UNA TECLA": la primera tecla o toque activa el audio, suena y arranca la intro completa.
  // onDone: avisa cuando la intro acaba (o no llega a sonar), p. ej. para preguntar el nombre DESPUÉS (si no, la tecla de empezar se escribiría en él).
  // intro = false: solo la pantalla (para desbloquear el sonido al entrar en otra página del juego), sin la animación.
  function armPressStart({ onDone = null, intro = true } = {}) {
    phase = 'press';
    done = onDone;
    press.hidden = false;
    let pressed = false;
    const go = () => {
      if (pressed) return;
      pressed = true;
      window.removeEventListener('keydown', go); window.removeEventListener('pointerdown', go);
      try { sfx.unlock(); } catch (err) { console.warn('Sonido:', err); } // el audio NUNCA puede impedir que el juego arranque
      press.classList.add('pressed'); // el texto parpadea rápido un momento
      setTimeout(() => { try { sound('pressStart'); } catch { /* sin sonido */ } }, 90); // el audio tarda unos ms en reanudarse tras el primer gesto
      setTimeout(() => {
        press.hidden = true; press.classList.remove('pressed'); phase = 'idle';
        try {
          if (intro && shouldPlay()) start({ short: false, prelude: true, onDone }); else finish(); // con una partida en marcha no se tapa con la intro
        } catch (err) { // si la animación falla, se salta: el lobby sale igual
          console.error('La intro ha fallado, se salta:', err);
          try { finish(); } catch { document.body.classList.remove('intro-on'); root.hidden = true; }
        }
      }, 520);
    };
    window.addEventListener('keydown', go); window.addEventListener('pointerdown', go);
  }

  return {
    get active() { return phase !== 'idle'; },
    start,
    update,
    skip() { if (phase === 'play') finish(); },
    // Solo para depurar (window.__logoIntro en la consola y las capturas de prueba): para la intro en el instante `ms` (versión completa); release() la suelta.
    seek(ms) { if (phase !== 'play') start({ short: false }); frozen = ms; },
    seekFull(ms) { if (phase !== 'play') start({ short: false, prelude: true }); frozen = ms; }, // igual, con el preludio de DOERS DF (ms desde el principio de la secuencia)
    configureRepeat({ everyMs, canRepeat: can }) { repeatMs = everyMs; canRepeat = can; },
    release() { frozen = null; },
    armPressStart,
    // Sin pantalla de título ni intro (?intro=0): el lobby sale directo.
    disable() { phase = 'idle'; press.hidden = true; root.hidden = true; document.body.classList.remove('intro-on'); },
  };
}
