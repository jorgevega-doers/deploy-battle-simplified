// Final de la partida en el host: cuando el servidor avisa de que ha acabado (match_over) se ejecuta el guion de
// finaleTimeline.js: destello, el tanque destruido estalla en trozos en cámara lenta, la cámara hace zoom, y entran los
// textos arcade (K.O. / XXX WINS / TIME UP!). El cartel de resultados espera a que acabe (whenDone).
// Qué NO hace: no calcula daño ni decide quién gana (viene del servidor) y no toca el HUD ni el sonido.
import { THEMES } from './arcadeText.js';
import { planFor, zoomAt, timeScaleAt } from './finaleTimeline.js';

export function createFinale({ debris, entities, arcade, flashEl }) {
  const fx = { zoom: 0, zx: 0, zz: 0 }; // lo lee juice.js cada fotograma para mover la cámara
  let kill = null;       // { slot, x, y } del último impacto mortal
  let plan = null;
  let startAt = 0;
  let nextText = 0;
  let lastNow = 0;
  const waiting = [];    // funciones que esperan a que acabe el final (el cartel de resultados)

  function start(reason, now, winnerNames) {
    plan = planFor(reason, kill !== null, winnerNames);
    startAt = now;
    nextText = 0;
    lastNow = now;
    if (plan.kind === 'ko') {
      entities.setTankHidden(kill.slot, true);
      debris.explode(kill.x, kill.y, kill.slot);
      entities.spawnRing(kill.x, kill.y, 1.8, 0xffffff, 700, now);
      entities.spawnRing(kill.x, kill.y, 3.4, 0xffd400, 1200, now);
      entities.spawnRing(kill.x, kill.y, 5.2, 0xff0080, 1700, now);
      fx.zx = kill.x;
      fx.zz = -kill.y;
      flashEl?.animate([{ opacity: 0.95 }, { opacity: 0.55, offset: 0.3 }, { opacity: 0 }], { duration: 420, easing: 'steps(4)' });
    }
  }

  function finish() {
    plan = null;
    fx.zoom = 0;
    for (const cb of waiting.splice(0)) cb();
  }

  return {
    fx,
    get active() { return plan !== null; },
    // Eventos del servidor: guarda el impacto mortal y, al llegar match_over, arranca el guion.
    onEvent(event, now) {
      // Golpe mortal que acaba la partida (final: true), o un impacto sin campo "final" (menú de pruebas, 1 contra 1 antiguo).
      if (event.type === 'hit' && (event.final === true || (event.lives <= 0 && event.round !== false && event.final === undefined))) kill = { slot: event.slot, x: event.x, y: event.y };
      if (event.type === 'match_over') start(event.reason, now, event.winnerNames);
    },
    // Una vez por fotograma.
    update(now) {
      if (!plan) return;
      const t = now - startAt;
      while (nextText < plan.texts.length && t >= plan.texts[nextText].at) {
        const { text, theme, ...opts } = plan.texts[nextText++];
        arcade.show(text, { ...opts, theme: THEMES[theme], y: 46 });
      }
      fx.zoom = zoomAt(plan, t);
      debris.step(((now - lastNow) / 1000) * timeScaleAt(t), t);
      lastNow = now;
      if (t >= plan.doneAt) finish();
    },
    // Ejecuta cb cuando no haya final en marcha (inmediatamente si no lo hay).
    whenDone(cb) {
      if (plan) waiting.push(cb); else cb();
    },
    // Lobby / reinicio: se descarta todo.
    reset() {
      plan = null;
      kill = null;
      waiting.length = 0;
      fx.zoom = 0;
      debris.hide();
      arcade.clear();
      for (let slot = 1; slot <= 4; slot++) entities.setTankHidden(slot, false);
    },
  };
}
