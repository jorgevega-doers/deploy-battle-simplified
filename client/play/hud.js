// Pantalla de juego del mando: sus vidas, el tiempo y los power-ups que lleva (los manda el servidor en player_hud), y las
// mismas animaciones que el host cuando pierde una vida (el mando se oscurece y se rompe un corazón) o acaba la partida
// (K.O. / GAME OVER / TIME UP!). Reutiliza las letras, los corazones y los guiones del host (client/host/).
// Qué NO hace: no calcula nada del juego; solo dibuja lo que le dice el servidor.
import { POWERUP_TYPES } from '../../shared/constants.js';
import { HEART_FULL, HEART_EMPTY, HEART_LOST } from '../host/hearts.js';
import { POWERUP_NAMES, POWERUP_ICONS } from '../host/powerupIcons.js';
import { createArcadeText, THEMES } from '../host/arcadeText.js';
import { planFor } from '../host/finaleTimeline.js';
import { DONE_MS } from '../host/roundTimeline.js';
import '../host/arcade.css';

// En el móvil (apaisado, ~390 px de alto) la unidad de los textos es pequeña: los tamaños del host se multiplican por esto.
const TEXT_SCALE = 2.4;

const formatTime = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function createPlayHud($) {
  const arcade = createArcadeText($('arcade'));
  const dim = $('dim');
  const chips = new Map(); // tipo de power-up -> elemento
  let maxLives = 0;
  let shownLives = -1;
  let lostIndex = -1;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function renderHearts(lives) {
    if (lives === shownLives && lostIndex < 0) return;
    shownLives = lives;
    let html = '';
    for (let i = 0; i < maxLives; i++) html += i < lives ? HEART_FULL : i === lostIndex ? HEART_LOST : HEART_EMPTY;
    $('hud-hearts').innerHTML = html;
  }

  return {
    // player_hud del servidor: { lives, timeLeft, effects: [[tipo, segundosRestantes], ...] }.
    update({ lives, timeLeft, effects }) {
      maxLives = Math.max(maxLives, lives);
      renderHearts(lives);
      const time = formatTime(timeLeft);
      if ($('timer').textContent !== time) $('timer').textContent = time;
      $('timer').classList.toggle('urgent', timeLeft > 0 && timeLeft <= 10);
      // Power-ups: el chip se crea una vez (con su animación de entrada) y después solo cambia el parpadeo del final.
      const active = new Set();
      for (const [type, seconds] of effects) {
        const kind = POWERUP_TYPES[type];
        active.add(kind);
        let chip = chips.get(kind);
        if (!chip) {
          chip = document.createElement('span');
          chip.innerHTML = `${POWERUP_ICONS[kind]}${POWERUP_NAMES[kind]}`;
          chips.set(kind, chip);
          $('hud-fx').appendChild(chip);
          chip.className = `fx-chip fx-${kind} enter`;
        }
        chip.classList.toggle('ending', seconds <= 2);
        chip.classList.toggle('last', seconds <= 1);
      }
      for (const [kind, chip] of chips) if (!active.has(kind)) { chip.remove(); chips.delete(kind); }
    },
    // Te han dado y sigues vivo: el mando se oscurece y se ve cómo se rompe tu última vida (como en el host).
    onHit(lives) {
      lostIndex = lives;
      renderHearts(lives);
      dim.classList.add('on');
      arcade.showLives({ max: Math.max(maxLives, lives + 1), full: lives + 1, breakIndex: lives }, { size: 2.6, y: 50, hold: 750, enter: 'slam' });
      later(() => { dim.classList.remove('on'); lostIndex = -1; }, DONE_MS - 100);
    },
    // Fin de partida: K.O. y GAME OVER (o TIME UP!) sobre el mando oscurecido. Devuelve cuánto dura (ms).
    onMatchOver(reason, winnerNames) {
      const plan = planFor(reason, reason === 'lives', winnerNames);
      dim.classList.add('on');
      for (const { at, text, theme, size, ...opts } of plan.texts) {
        later(() => arcade.show(text, { ...opts, size: size * TEXT_SCALE, theme: THEMES[theme], y: 50 }), at);
      }
      return plan.doneAt;
    },
    // Vuelta a otra pantalla o nueva partida.
    reset() {
      timers.forEach(clearTimeout);
      timers = [];
      arcade.clear();
      dim.classList.remove('on');
      for (const chip of chips.values()) chip.remove();
      chips.clear();
      maxLives = 0;
      shownLives = -1;
      lostIndex = -1;
      $('hud-hearts').innerHTML = '';
    },
  };
}
