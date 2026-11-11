// "Jugosidad" arcade del host: reúne los efectos de respuesta visual (cuenta atrás y GO! con letras de píxeles, impacto con
// zoom y reaparición, final con KO, recogida de power-ups, celebración del Top 10) detrás de unas pocas funciones que
// main.js llama en cada momento. Qué NO hace: no recibe sockets ni toca el HUD; main.js le pasa los eventos y le pide el zoom.
import { createArcadeText, THEMES } from './arcadeText.js';
import { createConfetti } from './confetti.js';
import { createDebris } from './debris.js';
import { createDust } from './dust.js';
import { createFinale } from './finale.js';
import { createRoundFx } from './roundFx.js';
import { createPickupFx, FLY_MS } from './pickupFx.js';
import { createSoloFx } from './soloFx.js';

export { FLY_MS };

const HEART_LOST_MS = 900; // cuánto tiempo se anima el corazón que se acaba de perder
const TOP_SIZE = 10;       // posiciones del ranking que se celebran

// $ = búsqueda por id; icons = SVG de píxeles de cada power-up; getMaxLives = vidas con las que empezó la partida.
// Solo se crea con la vista 3D.
export function createJuice({ arena, sceneApi, entities, icons, $, getMaxLives }) {
  const arcade = createArcadeText($('arcade'));
  const confetti = createConfetti($('arcade'));
  const debris = createDebris(sceneApi.scene); // un solo juego de trozos: el impacto normal y el KO nunca coinciden
  const finale = createFinale({ debris, entities, arcade, flashEl: $('flash') });
  const round = createRoundFx({ debris, entities, arcade, getMaxLives });
  const cardTarget = (slot) => { // dónde "se suma" el power-up: el centro de la ficha del jugador
    const r = $(`hud-p${slot}`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
  };
  const pickups = createPickupFx(sceneApi.scene, { entities, icons, cardTarget });
  const dust = createDust(sceneApi.scene);
  const timers = new Set(); // temporizadores pendientes (menú de pruebas): se cancelan al reiniciar
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const soloFx = createSoloFx({ debris: createDebris(sceneApi.scene), entities }); // golpes a los bots (modo de un jugador)
  const pickedAt = [{}, {}, {}, {}]; // cuándo recogió cada jugador cada tipo de power-up (el HUD anima su chip)
  const lostAt = [-1e9, -1e9, -1e9, -1e9]; // cuándo perdió su última vida cada jugador (el HUD anima el corazón)
  const lostLives = [0, 0, 0, 0];    // vidas que le quedaban entonces (= índice del corazón que se apaga)

  let namesShown = false; // los nombres ("BOA VS BOB") salen una vez por cuenta atrás

  const api = {
    // Eventos puntuales de la partida (match_event).
    onEvent(event, now) {
      finale.onEvent(event, now);
      round.onEvent(event, now);
      soloFx.onEvent(event, now);
      pickups.onEvent(event, now);
      if (event.type === 'powerup_pick') pickedAt[event.slot - 1][event.powerup] = now;
      if (event.type === 'hit') { lostAt[event.slot - 1] = now; lostLives[event.slot - 1] = Math.max(0, event.lives); }
    },
    pickedAt(slot, kind) { return pickedAt[slot - 1][kind] ?? -1e9; },
    // Índice (0, 1, 2...) del corazón de la ficha que se acaba de perder y debe animarse, o -1.
    lostHeart(slot, now) { return now - lostAt[slot - 1] < HEART_LOST_MS ? lostLives[slot - 1] : -1; },
    // Cuenta atrás de READY. En el 3 salen además los nombres de los jugadores ("BOA VS BOB").
    countdown(seconds, names) {
      arcade.show(String(seconds), { theme: THEMES.white, size: 1.3, x: 50, y: 52, hold: 120, enter: 'slam' });
    },
    // Presentación al empezar la partida (2 s congelada): los nombres en grande en el centro.
    intro(names) {
      // Solo el "VS": los nombres son las propias etiquetas de los tanques (tankMarkers.js), que luego viajan a su tanque.
      arcade.show('VS', { theme: THEMES.amber, size: 0.8, x: 50, y: 44, hold: 1800, enter: 'slam', shake: true });
    },
    matchStart() {
      namesShown = false;
      arcade.show('GO!', { theme: THEMES.amber, size: 1.3, y: 50, hold: 380, enter: 'slam', shake: true });
    },
    // Celebra que una puntuación ha entrado en el ranking (rank = mejor posición de la partida): confeti y cartel.
    celebrate(rank) {
      if (typeof rank !== 'number' || rank < 1 || rank > TOP_SIZE) return;
      arcade.show(rank === 1 ? 'NEW RECORD' : 'TOP 10', { theme: rank === 1 ? THEMES.amber : THEMES.cyan, size: 0.62, y: 18, hold: 2600, enter: 'slam', shake: true });
      confetti.burst(rank === 1 ? 110 : 60);
    },
    // Zoom de cámara de este fotograma (impacto o KO). Va ANTES de entities.update (las etiquetas usan la cámara).
    beforeDraw(now) {
      finale.update(now);
      round.update(now);
      soloFx.update(now);
      sceneApi.setCameraFx(finale.active ? finale.fx : round.fx);
    },
    afterDraw(state, now) { pickups.update(state, now); dust.update(state, now); },
    whenFinaleDone(cb) { finale.whenDone(cb); },
    // Vuelta al lobby (o reinicio global): se descarta todo.
    later,
    reset() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      namesShown = false;
      finale.reset();
      round.reset();
      soloFx.reset();
      pickups.reset();
      dust.reset();
      arcade.clear();
      confetti.clear();
      for (let i = 0; i < 4; i++) { pickedAt[i] = {}; lostAt[i] = -1e9; }
    },
    // Menú de pruebas: lanza una animación con datos inventados y devuelve cuánto dura (ms).
    demo(name, now) {
      const x = arena.width / 2 - 4;
      const y = arena.height / 2;
      switch (name) {
        case 'countdown':
          [3, 2, 1].forEach((s, i) => later(() => api.countdown(s, ['BOA', 'BOB']), i * 1000));
          later(() => api.matchStart(), 3000);
          return 3900;
        case 'go': api.matchStart(); return 1300;
        case 'hit':
          api.onEvent({ type: 'hit', slot: 1, by: 2, lives: Math.max(1, getMaxLives() - 1), x, y }, now);
          return 2700;
        case 'ko':
          api.onEvent({ type: 'hit', slot: 2, by: 1, lives: 0, x, y }, now);
          api.onEvent({ type: 'match_over', winner: 1, winnerNames: ['BOA'], reason: 'lives' }, now);
          return 4400;
        case 'time': api.onEvent({ type: 'match_over', winner: null, reason: 'time' }, now); return 2600;
        case 'powerup': api.onEvent({ type: 'powerup_pick', id: 0, slot: 1, powerup: 'double' }, now); return 2700;
        case 'record': api.celebrate(1); return 4200;
        case 'top10': api.celebrate(5); return 4200;
        default: return 0;
      }
    },
  };
  return api;
}
