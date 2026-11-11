// Partida de fondo del salvapantallas ("attract mode"): mientras el stand espera jugadores, dos bots juegan una partida
// completa detrás del QR para llamar la atención. NO usa plazas, ni la sesión, ni el ranking: es una partida aparte cuyo
// estado solo ve el host. Al acabar una partida espera unos segundos (el host enseña el KO) y empieza otra.
// Qué NO hace: no sabe de sockets (lo que emite sale por "out") ni decide cuándo debe ejecutarse (lo decide sockets.js).
import { createMatch } from './match.js';
import { createBot } from './bot.js';

const PAUSE_AFTER_MATCH_S = 4.5; // KO + GAME OVER del host duran ~3,8 s

// out = { state(snapshot), events(list) }.
export function createAttract({ arena, getArena = () => arena, cfg, rng = Math.random, out }) {
  let match = null;
  let bots = [];
  let pauseLeft = 0;
  let broadcastAcc = 0;

  function newMatch() {
    match = createMatch({ arena: getArena(), cfg, rng, initials: [null, null] });
    bots = [createBot(1, rng), createBot(2, rng)];
    pauseLeft = 0;
    out.events([{ type: 'attract_reset' }]); // el host limpia los restos de la partida anterior
  }

  return {
    get running() { return match !== null; },
    start() { if (!match) newMatch(); },
    stop() { match = null; bots = []; },
    // Avanza dt segundos. Solo hace algo si está en marcha.
    tick(dt) {
      if (!match) return;
      if (match.over) { // pausa tras el final y nueva partida
        pauseLeft -= dt;
        if (pauseLeft <= 0) newMatch();
        return;
      }
      for (const bot of bots) bot.think(match, dt);
      match.step(dt);
      const events = match.drainEvents();
      if (events.length > 0) out.events(events);
      if (match.over) { out.state(match.snapshot()); pauseLeft = PAUSE_AFTER_MATCH_S; return; }
      broadcastAcc += dt;
      const interval = 1 / cfg.broadcastHz;
      if (broadcastAcc >= interval * 0.75) { // misma tolerancia que la sesión (los pasos del bucle no son exactos)
        broadcastAcc = Math.max(0, broadcastAcc - interval);
        out.state(match.snapshot());
      }
    },
  };
}
