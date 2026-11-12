// Fases de la sesión de una sala: LOBBY -> READY (presentación) -> PLAYING -> GAME_OVER -> LOBBY.
// No usa sockets ni relojes: el tiempo llega en cada tick(dt) y todo lo que ocurre se comunica mediante las funciones de "out". Así se puede
// probar entera simulando el paso del tiempo. El modo de juego sale solo de cuántos jugadores hay (server/game/modes.js).
// Arranque: no hay LISTO. Cualquier jugador pulsa JUGAR y corre la cuenta atrás (joinWindowS; soloJoinWindowS contra bots); al
// llegar a 0 empieza la partida con quien haya. Cualquiera puede cancelarla (maxCancels veces cada uno por sala de espera, para que un troll no la
// cancele sin fin); si entra alguien, vuelve a empezar. No se puede cancelar en el primer instante (cancelGuardS: el doble clic en JUGAR).
import { createMatch } from './match.js';
import { createSoloBot, DIFFICULTY } from './soloBot.js';
import { planFor, tankCount } from './modes.js';
import { createPause } from './pause.js';

// arenas = los mapas (shared/arena.js); tras cada partida se sortea otro. "arena" sola sirve para los tests (un único mapa).
export function createSession({ arena, arenas = [arena], cfg, rng = Math.random, out, maxPlayers = 4 }) {
  let mapIndex = 0;
  let mapChoice = 'random'; // 'random' (tras cada partida, otro mapa al azar) o el índice de un mapa fijo (solo el modo dev lo cambia)
  const current = () => arenas[mapIndex];
  // Mapa de la siguiente partida: el elegido o, en aleatorio, uno distinto del actual.
  const nextMap = () => {
    if (mapChoice !== 'random') return mapChoice;
    if (arenas.length < 2) return 0;
    const other = Math.floor(rng() * (arenas.length - 1));
    return other >= mapIndex ? other + 1 : other;
  };
  const empty = () => Array(maxPlayers).fill(null);
  let phase = 'LOBBY';
  let match = null;
  let preview = null;   // partida "de exhibición" durante READY: la pantalla dibuja los tanques en su salida mientras sale la intro (nombres) y la cuenta atrás
  let previewAcc = 0;
  let initials = empty();
  let matchPlan = null; // el plan de la partida que se está preparando o jugando (se fija al empezar READY)
  let difficulty = cfg.difficulty in DIFFICULTY ? cfg.difficulty : 'media'; // dificultad de los bots (el reset no la borra: es un ajuste)
  let bots = [];
  const humanCount = () => initials.filter((n) => n !== null).length;
  // Plan de ahora mismo con la gente que hay (null si no hay nadie): la sala lo enseña y, al empezar READY, se fija.
  const currentPlan = () => planFor(humanCount());
  // Iniciales de todos los tanques de un plan: primero las de los humanos y luego las de los bots.
  const namesFor = (plan) => [...initials.filter((n) => n !== null).slice(0, plan.humans), ...cfg.soloBots.slice(0, plan.bots)];
  let countdownLeft = 0;
  let lastCountdownShown = 0;
  let resultsLeft = 0;
  let broadcastAcc = 0;
  const graceLeft = empty(); // segundos que le quedan a un jugador desconectado antes de perder por abandono
  const pause = createPause({ maxS: cfg.pauseMaxS ?? 10, cooldownS: cfg.pauseCooldownS ?? 30, perMatch: cfg.pausesPerMatch ?? 2 });
  const pauseOut = { pause: (state) => out.pause?.(state) };
  // Cuenta atrás de JUGAR: null = parada.
  let joinLeft = null;
  let joinShown = 0;
  let joinTotal = 0;
  const cancels = empty().map(() => 0);
  const windowTotal = () => (currentPlan()?.kind === 'solo' ? cfg.soloJoinWindowS ?? cfg.joinWindowS : cfg.joinWindowS) ?? 0;
  function openWindow() {
    const total = windowTotal();
    if (total <= 0) { startReady(); return; } // sin cuenta atrás (tests): empieza enseguida
    joinLeft = total; joinTotal = total; joinShown = Math.ceil(total);
  }

  const setPhase = (next) => {
    phase = next;
    out.phase(next);
  };

  // Configuración de la partida: la base y la dificultad (con FÁCIL el jugador contra 3 bots tiene una vida más y ayuda de puntería).
  const matchCfg = () => {
    const level = DIFFICULTY[difficulty];
    return { ...cfg, soloPlayerLives: (cfg.soloPlayerLives ?? cfg.lives) + level.playerLivesBonus, aimAssistConeRad: level.aimAssist.cone, aimAssistStrength: level.aimAssist.strength };
  };

  // READY dura introS (los nombres en grande viajan a su tanque) + countdownS (2, 1); la partida empieza justo después.
  function startReady() {
    joinLeft = null;
    matchPlan = currentPlan();
    countdownLeft = (cfg.introS ?? 0) + cfg.countdownS;
    lastCountdownShown = 0;
    preview = createMatch({ arena: current(), cfg: matchCfg(), rng, initials: namesFor(matchPlan), plan: matchPlan });
    previewAcc = 0;
    setPhase('READY');
    out.state(preview.snapshot());
  }

  function startMatch() {
    preview = null;
    match = createMatch({ arena: current(), cfg: { ...matchCfg(), introS: 0 }, rng, initials: namesFor(matchPlan), plan: matchPlan }); // la intro ya ocurrió en READY
    const level = DIFFICULTY[difficulty];
    bots = Array.from({ length: matchPlan.bots }, (_, i) => createSoloBot(matchPlan.humans + i + 1, { arena: current(), cfg: { ...cfg, soloBotWarmupS: level.botWarmupS }, rng, skill: level.skills[i % level.skills.length] }));
    graceLeft.fill(null);
    pause.reset();
    broadcastAcc = 0;
    cancels.fill(0);
    setPhase('PLAYING');
  }

  function endMatch() {
    if (pause.paused) pause.request(0, false, pauseOut); // la partida acabó (alguien salió): sin pausa colgada
    out.events(match.drainEvents());
    out.state(match.snapshot()); // último fotograma para la pantalla
    resultsLeft = cfg.resultsS;
    setPhase('GAME_OVER');
    out.gameOver(match.result);
  }

  // Vuelve a la sala de espera: sin jugadores, sin plan fijado y sin cuenta atrás.
  function reset() {
    match = null;
    preview = null;
    matchPlan = null;
    bots = [];
    cancels.fill(0);
    joinLeft = null;
    initials = empty();
    graceLeft.fill(null);
    if (phase !== 'LOBBY') setPhase('LOBBY');
  }

  return {
    maxPlayers,
    get phase() { return phase; },
    get match() { return match; },
    get mapIndex() { return mapIndex; },
    get mapChoice() { return mapChoice; },
    // El modo dev elige el mapa ('random' o un índice). Un mapa fijo se pone ya si se está en la sala de espera. Devuelve false si no vale.
    setMapChoice(choice) {
      const valid = choice === 'random' || (Number.isInteger(choice) && choice >= 0 && choice < arenas.length);
      if (!valid) return false;
      mapChoice = choice;
      if (choice !== 'random' && phase === 'LOBBY') mapIndex = choice;
      return true;
    },
    // Menú de pruebas del modo dev, al iniciar un test: con ALEATORIO sortea ya el mapa de la próxima partida; con uno fijo no hace nada.
    rerollMap() {
      if (mapChoice !== 'random' || phase !== 'LOBBY') return false;
      mapIndex = Math.min(arenas.length - 1, Math.floor(rng() * arenas.length));
      return true;
    },
    get arena() { return current(); },
    // El plan de la partida (fijado al empezar READY) o, en la sala de espera, el que saldría con la gente de ahora.
    get plan() { return phase === 'LOBBY' ? currentPlan() : matchPlan ?? currentPlan(); },
    get tankCount() { const plan = this.plan; return plan ? tankCount(plan) : 0; },
    // Iniciales de todos los tanques del plan (humanos y luego bots), o las de las plazas si aún no hay plan.
    get tankNames() { const plan = this.plan; return plan ? namesFor(plan) : [...initials]; },
    // Hay solo un jugador (1 contra 3 bots).
    get solo() { return this.plan?.kind === 'solo'; },
    get humans() { return humanCount(); },
    get difficulty() { return difficulty; },
    // Cambia la dificultad de los bots ('stand' = FÁCIL, 'media' o 'pro'); vale desde la siguiente partida. Devuelve true si cambió.
    setDifficulty(level) {
      if (!(level in DIFFICULTY) || level === difficulty) return false;
      difficulty = level;
      return true;
    },

    // JUGAR (evento player_ready): empieza la cuenta atrás; si ya corre, la cancela (con límite y sin dobles clics). Devuelve true si cambió algo.
    setReady(slot) {
      if (phase !== 'LOBBY' || initials[slot - 1] === null || initials[slot - 1] === undefined) return false;
      if (joinLeft === null) { openWindow(); return true; }
      if (joinTotal - joinLeft < (cfg.cancelGuardS ?? 0.8) || cancels[slot - 1] >= (cfg.maxCancels ?? 3)) return false;
      cancels[slot - 1] += 1;
      joinLeft = null;
      return true;
    },
    // Cuántas veces más puede cancelar la cuenta atrás cada plaza.
    get cancelsLeft() { return cancels.map((n) => Math.max(0, (cfg.maxCancels ?? 3) - n)); },
    // Segundos que faltan (entero hacia arriba) de la cuenta atrás de JUGAR, o null si no está corriendo.
    get joinLeft() { return joinLeft === null ? null : Math.max(0, Math.ceil(joinLeft)); },

    // Se llama cuando cambian las plazas ocupadas: [iniciales de P1 | null, ...]. Si entra alguien, la cuenta atrás vuelve a empezar; si se va, sigue.
    // Si ya había empezado la presentación y falta alguien del plan, se cancela y se vuelve a la sala de espera.
    setPlayers(newInitials) {
      const before = humanCount();
      initials = Array.from({ length: maxPlayers }, (_, i) => newInitials[i] ?? null);
      initials.forEach((name, i) => { if (name === null) cancels[i] = 0; });
      if (phase === 'READY' && (humanCount() === 0 || humanCount() < (matchPlan?.humans ?? 0))) { preview = null; setPhase('LOBBY'); }
      if (phase !== 'LOBBY' || humanCount() === 0) joinLeft = null;
      else if (joinLeft !== null && humanCount() > before) openWindow();
    },

    // Un jugador cambia de nombre en la sala de espera (no toca la cuenta atrás). Devuelve true si se aplicó.
    rename(slot, name) {
      if (phase !== 'LOBBY' || initials[slot - 1] === null || initials[slot - 1] === undefined) return false;
      initials[slot - 1] = name;
      return true;
    },

    // Un jugador se ha desconectado durante la partida: se queda parado y, si no vuelve, pierde por abandono.
    playerDisconnected(slot) {
      if (phase !== 'PLAYING') return;
      match.setMove(slot, 0, 0);
      graceLeft[slot - 1] = cfg.reconnectGraceS;
    },

    // El jugador ha vuelto a tiempo (socket nuevo con su token): se cancela su cuenta de abandono.
    playerReconnected(slot) {
      graceLeft[slot - 1] = null;
    },

    // Pausa: on = true la pide (devuelve true o { denied, wait }), on = false la quita (cualquiera). Solo en partida.
    requestPause(slot, on) { return phase === 'PLAYING' ? pause.request(slot, on, pauseOut) : false; },
    get paused() { return pause.paused; },
    pausesLeft(slot) { return pause.usesLeft(slot); },
    // El jugador sale de la partida (SALIR en el menú de pausa): pierde por abandono al momento; si quedan jugadores, la partida sigue.
    quit(slot) {
      if (phase !== 'PLAYING') return false;
      graceLeft[slot - 1] = null;
      if (pause.paused) pause.request(slot, false, pauseOut); // si no, la partida seguiría congelada con quien ya se fue
      match.forfeit(slot);
      return true;
    },

    setMove(slot, x, y) { if (phase === 'PLAYING' && graceLeft[slot - 1] === null) match.setMove(slot, x, y); },
    setAim(slot, angle) { if (phase === 'PLAYING' && graceLeft[slot - 1] === null) match.setAim(slot, angle); },
    fire(slot) { return phase === 'PLAYING' && graceLeft[slot - 1] === null ? match.fire(slot) : false; },
    dash(slot) { return phase === 'PLAYING' && graceLeft[slot - 1] === null ? match.dash(slot) : false; },

    // Solo para el menú de pruebas del modo dev: acaba la partida en curso por tiempo agotado.
    expireTime() { if (phase === 'PLAYING') match.expireTime(); },

    // Reset (menú de pruebas del modo dev): cualquier fase vuelve a la sala de espera.
    reset,

    tick(dt) {
      if (phase === 'LOBBY' && joinLeft !== null) {
        joinLeft -= dt;
        if (joinLeft <= 0) { joinLeft = null; if (humanCount() > 0) startReady(); else out.phase('LOBBY'); }
        else if (Math.ceil(joinLeft) !== joinShown) { joinShown = Math.ceil(joinLeft); out.phase('LOBBY'); } // un aviso por segundo
      } else if (phase === 'READY') {
        countdownLeft -= dt;
        previewAcc += dt;
        if (preview && previewAcc >= 0.1) { previewAcc = 0; out.state(preview.snapshot()); }
        const shown = countdownLeft > cfg.countdownS ? 0 : Math.max(0, Math.ceil(countdownLeft)); // los números solo salen tras la intro
        if (shown !== lastCountdownShown && shown > 0) {
          lastCountdownShown = shown;
          out.countdown(shown);
        }
        if (countdownLeft <= 0) startMatch();
      } else if (phase === 'PLAYING') {
        if (pause.tick(dt, pauseOut)) return; // en pausa: nada avanza (ni el reloj, ni los bots, ni las balas)
        for (let i = 0; i < maxPlayers; i++) {
          if (graceLeft[i] === null) continue;
          graceLeft[i] -= dt;
          if (graceLeft[i] <= 0) { graceLeft[i] = null; match.forfeit(i + 1); }
        }
        for (const bot of bots) bot.think(match, dt);
        match.step(dt);
        const events = match.drainEvents();
        if (events.length > 0) out.events(events);
        if (match.over) { endMatch(); return; }
        broadcastAcc += dt;
        const interval = 1 / cfg.broadcastHz;
        // Tolerancia del 25 %: los pasos del bucle no miden exactamente 1/60 s (en Windows ~15,6 ms) y, sin ella, el estado salía uno de cada
        // dos ticks, con un tick más de retardo de entrada.
        if (broadcastAcc >= interval * 0.75) {
          broadcastAcc = Math.max(0, broadcastAcc - interval);
          out.state(match.snapshot());
        }
      } else if (phase === 'GAME_OVER') {
        resultsLeft -= dt;
        if (resultsLeft <= 0) {
          mapIndex = nextMap(); // la siguiente partida, en el mapa elegido o en otro al azar
          reset();
          out.finished();
        }
      }
    },
  };
}
