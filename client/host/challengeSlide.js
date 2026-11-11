// Pantalla del reto de la secuencia del HOME (AGENTS.md, sección 87): a la izquierda, grande, el retrato pixel art del CTO (sin fondo, deshecho
// en trama por abajo); a la
// derecha, arriba y en grande, "RETA A / NUESTRO CTO" con la letra del logo; debajo, más pequeño, "Y GANA UN PREMIO / INCREÍBLE" con PREMIO en
// fucsia, sus letras saltando una tras otra y confeti constante por encima. Animación: el CTO empieza de espaldas, se gira para mirarte, le brilla
// la calva y en ese momento cae el título; un momento después sale el premio. Todo en celdas enteras. logoIntro.js decide cuándo sale.
// Qué NO hace: el fundido ni el flash (logoIntro.js) ni dibujar el retrato (scripts/avatar-pixel.js genera la tira de fotogramas).
import { renderText, textUnits, PALETTES } from './bigText.js';

const AVATAR_W = 96; // fotograma del retrato (assets/sprites/cto-avatar.png: tira de fotogramas de 96 x 80)
const AVATAR_H = 80;
const AVATAR_ZOOM = 4 / 3; // el retrato va con el píxel algo más grande que las letras (8 px de pantalla a 1080 p frente a 6): el CTO, grande
const FRAMES = ['back', 'turn', 'quarter', 'front', 'blink', 'dare', 'dareBlink', 'shine1', 'shine2', 'shine3', 'shine4']; // el orden de scripts/avatar-pixel.js
const GAP = 4;       // separación retrato - texto (píxeles lógicos; el retrato ya trae aire a los lados)
const TITLE = ['RETA A', 'NUESTRO CTO'];
const PRIZE_LINE = 'Y GANA UN PREMIO';
const PRIZE = PRIZE_LINE.indexOf('PREMIO');
const LAST = 'INCREÍBLE';
// Guion (ms desde que se ve la pantalla). El retrato: de espaldas → tres cuartos → de frente con destello en la calva; luego parpadea y pone
// cara de reto. [desde, fotograma]: vale el último cuyo "desde" ya pasó.
// De espaldas 1,6 s (el negro se retira en los primeros 0,7 s), giro hacia la derecha en dos pasos y, de frente, el destello en la calva.
const FACE = [[0, 'back'], [1600, 'turn'], [1720, 'quarter'], [1840, 'shine1'], [1910, 'shine2'], [1980, 'shine3'], [2050, 'shine4'], [2140, 'front'],
  [3600, 'blink'], [3720, 'front'], [4100, 'dare'], [5050, 'dareBlink'], [5170, 'dare'], [5900, 'front']];
const AT = { title: 1840, prize: 2600 }; // el giro y el destello van en FACE
const SLAM = [1.35, 1.15, 1.05, 1];      // escala del título al caer, 50 ms cada paso (crece desde su borde izquierdo: nunca tapa el retrato)
const SHAKE = [[1, 0], [-1, 1], [1, -1], [-1, 0], [0, 0]]; // sacudida al caer, en celdas, 40 ms cada paso

export function createChallengeSlide({ $ }) {
  const root = $('intro-cto');
  const avatar = $('intro-cto-avatar');
  let built = null; // { key, title, prize, cell }
  let fired = {};
  let shownFrame = null;

  // Monta una línea de texto: todos los "back" debajo de todos los "front". hop = letras [desde, hasta) que saltan y llevan confeti encima.
  function line(text, u, palOf, cell, hop = [-1, -1]) {
    const r = renderText(text, u, palOf);
    const el = document.createElement('div');
    el.className = 'cto-line';
    const back = document.createElement('div'); const front = document.createElement('div');
    back.className = front.className = 'cto-layer';
    let span = null;
    for (const l of r.letters) for (const [layer, canvas] of [[back, l.back], [front, l.front]]) {
      canvas.className = 'cto-ch';
      canvas.style.left = `${l.x * cell}px`;
      canvas.style.width = `${canvas.width * cell}px`; canvas.style.height = `${canvas.height * cell}px`;
      layer.appendChild(canvas);
      if (l.i < hop[0] || l.i >= hop[1]) continue;
      canvas.classList.add('cto-hop'); canvas.style.setProperty('--n', String(l.i - hop[0]));
      span = span ? { x0: Math.min(span.x0, l.x), x1: Math.max(span.x1, l.x + canvas.width) } : { x0: l.x, x1: l.x + canvas.width };
    }
    el.append(back, front);
    el.style.width = `${r.width * cell}px`; el.style.height = `${r.height * cell}px`;
    if (span) {
      const confetti = document.createElement('div');
      confetti.className = 'cto-confetti';
      confetti.style.left = `${span.x0 * cell}px`; confetti.style.width = `${(span.x1 - span.x0) * cell}px`;
      confetti.style.top = `${r.top * cell}px`; // nace justo encima de las letras
      for (let i = 0; i < 14; i++) confetti.appendChild(document.createElement('i'));
      el.appendChild(confetti);
    }
    return { el, w: r.width, h: r.height };
  }

  // Monta la pantalla para celdas de `cell` píxeles de pantalla (las mismas que el logo de la intro).
  function build(cell) {
    const cols = Math.floor(innerWidth / cell); const rows = Math.floor(innerHeight / cell);
    const key = `${cols}|${rows}|${cell}`;
    if (built?.key === key) return;
    for (const el of root.querySelectorAll('.cto-group')) el.remove();
    root.style.setProperty('--cell', `${cell}px`);
    // Retrato: avPx píxeles de pantalla por píxel del retrato (entero, algo mayor que la celda; sin pasar del 85 % del alto de la pantalla).
    let avPx = Math.max(cell, Math.round(cell * AVATAR_ZOOM));
    while (avPx > 1 && AVATAR_H * avPx > innerHeight * 0.85) avPx--;
    const aw = Math.ceil((AVATAR_W * avPx) / cell); const ah = Math.ceil((AVATAR_H * avPx) / cell); // su hueco, en píxeles lógicos
    // Columna de texto: lo que queda del 95 % del ancho tras el retrato. Título grande; premio a ~70 % de su tamaño.
    const colW = Math.min(190, Math.floor(cols * 0.95) - aw - GAP);
    const u1 = Math.min(1.5, Math.floor((colW / Math.max(...TITLE.map(textUnits))) * 20) / 20);
    const u2 = Math.min(u1 * 0.7, Math.floor((colW / Math.max(textUnits(PRIZE_LINE), textUnits(LAST))) * 20) / 20);
    const group = (lines, steps) => {
      const g = document.createElement('div'); g.className = 'cto-group';
      let y = 0; let w = 0;
      for (const l of lines) w = Math.max(w, l.w);
      lines.forEach((l, i) => { l.el.style.left = `${Math.round((w - l.w) / 2) * cell}px`; l.el.style.top = `${y * cell}px`; g.appendChild(l.el); if (i < lines.length - 1) y += steps; }); // líneas centradas
      const h = y + lines[lines.length - 1].h;
      g.style.width = `${w * cell}px`; g.style.height = `${h * cell}px`;
      return { el: g, w, h };
    };
    const title = group([line(TITLE[0], u1, () => PALETTES.white, cell), line(TITLE[1], u1, (i) => (i >= TITLE[1].indexOf('CTO') ? PALETTES.amber : PALETTES.white), cell)], Math.round(20 * u1));
    const prize = group([line(PRIZE_LINE, u2, (i) => (i >= PRIZE ? PALETTES.pink : PALETTES.white), cell, [PRIZE, PRIZE + 6]), line(LAST, u2, () => PALETTES.white, cell)], Math.round(26 * u2));
    // Colocación (píxeles lógicos): texto a la derecha del retrato, todas las líneas centradas en un mismo eje; el bloque de texto, centrado en el
    // alto del retrato.
    const textH = title.h + 2 + prize.h;
    const textW = Math.max(title.w, prize.w);
    const height = Math.max(ah, textH);
    const width = aw + GAP + textW;
    const tx = aw + GAP; const ty = Math.round((height - textH) / 2);
    const place = (el, x, y) => { el.style.left = `${x * cell}px`; el.style.top = `${y * cell}px`; };
    place(title.el, tx + Math.round((textW - title.w) / 2), ty); place(prize.el, tx + Math.round((textW - prize.w) / 2), ty + title.h + 2);
    root.style.left = `${Math.floor((cols - width) / 2) * cell}px`; root.style.top = `${Math.floor((rows - height) / 2) * cell}px`;
    root.style.width = `${width * cell}px`; root.style.height = `${height * cell}px`;
    avatar.style.width = `${AVATAR_W * avPx}px`; avatar.style.height = `${AVATAR_H * avPx}px`;
    avatar.style.backgroundSize = `${AVATAR_W * FRAMES.length * avPx}px ${AVATAR_H * avPx}px`;
    place(avatar, 0, Math.round((height - ah) / 2));
    root.append(title.el, prize.el);
    built = { key, title: title.el, prize: prize.el, cell, avPx };
    shownFrame = null;
  }

  function setFrame(name) {
    if (name === shownFrame) return;
    shownFrame = name;
    avatar.style.backgroundPosition = `${-FRAMES.indexOf(name) * AVATAR_W * built.avPx}px 0px`;
  }

  function reset() {
    fired = {};
    root.classList.remove('live');
    if (!built) return;
    setFrame('back');
    for (const el of [built.title, built.prize]) { el.style.visibility = 'hidden'; el.style.transform = ''; el.style.filter = ''; }
  }

  return {
    // cell = píxeles de pantalla por píxel lógico (los del logo de la intro).
    show(cell) { build(cell); reset(); root.hidden = false; },
    hide() { root.hidden = true; reset(); },
    // ms desde que se ve la pantalla; sound(name, args) suena (o no, en silencio).
    update(ms, sound) {
      if (!built) return;
      const { cell, title, prize } = built;
      let face = FACE[0][1];
      for (const [from, name] of FACE) if (ms >= from) face = name;
      setFrame(face);
      // Sin sonido en el giro ni en el destello (petición del usuario): solo suenan los golpes de las letras.
      // Título: cae con escala a pasos justo cuando el CTO te mira, y luego sacudida y destello.
      const t = ms - AT.title;
      title.style.visibility = t < 0 ? 'hidden' : 'visible';
      if (t >= 0) {
        const s = Math.floor(t / 50);
        if (s < SLAM.length) { title.style.transform = `scale(${SLAM[s]})`; title.style.filter = ''; }
        else {
          const k = Math.floor((t - SLAM.length * 50) / 40);
          const [dx, dy] = SHAKE[Math.min(k, SHAKE.length - 1)];
          title.style.transform = `translate(${dx * cell}px, ${dy * cell}px)`;
          title.style.filter = k < 3 ? 'brightness(1.8)' : '';
        }
        if (s >= SLAM.length - 1 && !fired.title) { fired.title = true; sound('introHit'); }
      }
      // Premio: un momento después, sube en 3 pasos y empiezan los saltos de PREMIO y el confeti.
      const p = ms - AT.prize;
      prize.style.visibility = p < 0 ? 'hidden' : 'visible';
      if (p >= 0) {
        prize.style.transform = `translateY(${Math.max(0, 3 - Math.floor(p / 60)) * 2 * cell}px)`;
        if (!fired.prize) { fired.prize = true; root.classList.add('live'); }
      }
    },
  };
}
