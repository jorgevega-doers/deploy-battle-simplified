// Fases de la sesión del stand: LOBBY -> READY (presentación) -> PLAYING -> GAME_OVER -> LOBBY (AGENTS.md, secciones 7 y 58).
// No usa sockets ni relojes: el tiempo llega en cada tick(dt) y todo lo que ocurre se comunica mediante las
// funciones de "out". Así se puede probar entera simulando el paso del tiempo.
// El modo de juego sale solo de cuántos jugadores hay (server/game/modes.js) y de dos opciones que cambian ellos en el móvil: rellenar con
// bots (con 2 o 3 jugadores) y equipos 2 contra 2 (con 4). Quien manda en la cuenta atrás es LISTO: con todos listos corre joinWindowS.
import { createMatch } from './match.js';
import { createSoloBot, DIFFICULTY } from './soloBot.js';
import { planFor, tankCount } from './modes.js';
import { createPause } from './pause.js';

const DUEL = Object.freeze({ kind: 'duel', humans: 2, bots: 0, teams: null });

// arenas = los 3 mapas (shared/arena.js); se alterna uno tras cada partida. "arena" sola sirve para los tests (un único mapa).
// maxPlayers = plazas (4). dynamic = false: solo 1 contra 1 con las plazas llenas (ya no lo usa nadie en producción; los tests antiguos lo piden).
export function createSession({ arena, arenas = [arena], cfg, rng = Math.random, out, maxPlayers = 4, dynamic = true }) {
  let mapIndex = 0;
  let mapChoice = 'random'; // 'random' (por defecto: tras cada partida, otro mapa al azar) o el índice de un mapa fijo
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
  let preview = null;   // partida "de exhibición" durante READY: el host dibuja los tanques en su salida mientras sale la intro (nombres) y la cuenta atrás
  let previewAcc = 0;
  let initials = empty();
  let matchPlan = null; // el plan de la partida que se está preparando o jugando (se fija al empezar READY)
  let difficulty = cfg.difficulty in DIFFICULTY ? cfg.difficulty : 'stand'; // dificultad de los bots (no se borra con el reset global: es un ajuste)
  let bots = [];
  const ready = empty().map(() => false); // quién ha pulsado LISTO en el móvil; con todos listos corre la cuenta atrás de entrada
  const clearReady = () => ready.fill(false);
  const humanCount = () => initials.filter((n) => n !== null).length;
  // ¿Están los jugadores necesarios? En el stand basta con 1 (el modo sale de cuántos hay); en una sala online hacen falta los 2.
  const present = () => (dynamic ? humanCount() >= 1 : humanCount() === maxPlayers);
  const allReady = () => present() && initials.every((name, i) => name === null || ready[i]);
  const autoMode = () => cfg.autoStartS != null && humanCount() >= 2; // partida pública con gente: arranca sola
  // Plan de ahora mismo con la gente que hay (null si no hay nadie): el lobby lo enseña y, al empezar READY, se fija.
  const currentPlan = () => {
    const humans = humanCount();
    if (!dynamic) return humans === maxPlayers ? DUEL : null;
    return planFor(humans);
  };
  // Iniciales de todos los tanques de un plan: primero las de los humanos y luego las de los bots.
  const namesFor = (plan) => [...initials.filter((n) => n !== null).slice(0, plan.humans), ...cfg.soloBots.slice(0, plan.bots)];
  let countdownLeft = 0;
  let lastCountdownShown = 0;
  let resultsLeft = 0;
  let broadcastAcc = 0;
  const graceLeft = empty(); // segundos que le quedan a un jugador desconectado antes de perder por abandono
  // Pausa (versión pública): 10 s como mucho, 2 por jugador y partida, 30 s de espera entre pausas (pause.js). out.pause es opcional (el stand no la usa).
  const pause = createPause({ maxS: cfg.pauseMaxS ?? 10, cooldownS: cfg.pauseCooldownS ?? 30, perMatch: cfg.pausesPerMatch ?? 2 });
  const pauseOut = { pause: (state) => out.pause?.(state) };
  // Cuenta atrás de entrada (cfg.joinWindowS): corre mientras TODOS los conectados estén en LISTO y deja que entre gente nueva. Si alguien
  // cancela su LISTO, entra, se va o cambia una opción, se reinicia (si siguen todos listos) o se cancela. Al llegar a 0 empieza la presentación.
  let joinLeft = null;
  let joinShown = 0;
  let joinTotal = 0;
  // Versión arcade (cfg.anyStart): no hay LISTO. Cualquier jugador pulsa JUGAR y corre la cuenta atrás (joinWindowS; soloJoinWindowS contra bots);
  // al llegar a 0 empieza la partida con quien haya. Cualquiera puede cancelarla (cfg.maxCancels veces cada uno por sala de espera, para que un
  // troll no la cancele sin fin); si entra alguien, vuelve a empezar. La cuenta atrás no se puede cancelar en el primer instante (doble clic).
  const cancels = empty().map(() => 0);
  const windowTotal = () => (cfg.soloJoinWindowS != null && currentPlan()?.kind === 'solo') ? cfg.soloJoinWindowS : (cfg.joinWindowS ?? 0);
  function openWindow() {
    const total = windowTotal();
    if (total <= 0) { startReady(); return; } // sin cuenta atrás (tests): empieza enseguida
    joinLeft = total; joinTotal = total; joinShown = Math.ceil(total);
  }
  // Revisa la cuenta atrás de entrada tras un cambio (LISTO, jugadores, opciones). restart = también si ya estaba corriendo.
  function syncWindow(restart = false) {
    if (cfg.anyStart) {
      if (phase !== 'LOBBY' || humanCount() === 0) joinLeft = null;
      else if (joinLeft !== null && restart) openWindow();
      return;
    }
    // Partida pública (cola común, cfg.autoStartS): con 2+ jugadores no hay LISTO; la cuenta atrás corre sola y vuelve a empezar si entra o sale
    // alguien; con la sala llena se acorta a fullStartS. Con un solo jugador sigue la regla de siempre (LISTO = jugar contra los bots).
    if (phase === 'LOBBY' && autoMode()) {
      const full = humanCount() >= maxPlayers;
      const total = full ? (cfg.fullStartS ?? cfg.autoStartS) : cfg.autoStartS;
      if (total <= 0) { startReady(); return; }
      if (joinLeft === null || restart) { joinLeft = total; joinShown = Math.ceil(total); }
      else if (full) joinLeft = Math.min(joinLeft, total);
      return;
    }
    if (phase !== 'LOBBY' || !allReady()) { joinLeft = null; return; }
    // Versión pública: contra los bots la espera es más corta (soloJoinWindowS); el stand no la define y usa joinWindowS siempre.
    const total = (cfg.soloJoinWindowS != null && currentPlan()?.kind === 'solo') ? cfg.soloJoinWindowS : (cfg.joinWindowS ?? 0);
    if (total <= 0) { startReady(); return; } // sin cuenta atrás (tests): empieza enseguida
    if (joinLeft === null || restart) { joinLeft = total; joinShown = Math.ceil(total); }
  }

  const setPhase = (next) => {
    phase = next;
    out.phase(next);
  };

  // Configuración de la partida: la base, la dificultad (el jugador contra 3 bots tiene una vida más en STAND).
  const matchCfg = () => {
    const level = DIFFICULTY[difficulty];
    const base = { ...cfg, soloPlayerLives: (cfg.soloPlayerLives ?? cfg.lives) + level.playerLivesBonus, aimAssistConeRad: level.aimAssist.cone, aimAssistStrength: level.aimAssist.strength };
    return base;
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
    bots = Array.from({ length: matchPlan.bots }, (_, i) => createSoloBot(matchPlan.humans + i + 1, { arena: current(), cfg: { ...cfg, soloBotWarmupS: DIFFICULTY[difficulty].botWarmupS }, rng, skill: DIFFICULTY[difficulty].skills[i % DIFFICULTY[difficulty].skills.length] }));
    graceLeft.fill(null);
    pause.reset();
    broadcastAcc = 0;
    clearReady();
    cancels.fill(0);
    setPhase('PLAYING');
  }

  function endMatch() {
    if (pause.paused) pause.request(0, false, pauseOut); // la partida acabó (alguien salió): sin pausa colgada
    out.events(match.drainEvents());
    out.state(match.snapshot()); // último fotograma para el host
    resultsLeft = cfg.resultsS;
    setPhase('GAME_OVER');
    out.gameOver(match.result);
  }

  // Vuelve al lobby: sin jugadores, sin plan fijado y con las opciones en sus valores por defecto.
  function reset() {
    match = null;
    preview = null;
    matchPlan = null;
    bots = [];
    clearReady();
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
    // El host elige el mapa ('random' o un índice). Un mapa fijo se pone ya si se está en el lobby. Devuelve false si no vale.
    setMapChoice(choice) {
      const valid = choice === 'random' || (Number.isInteger(choice) && choice >= 0 && choice < arenas.length);
      if (!valid) return false;
      mapChoice = choice;
      if (choice !== 'random' && phase === 'LOBBY') mapIndex = choice;
      return true;
    },
    // Menú de pruebas, al iniciar un test: respeta el selector. Con un mapa fijo no hace nada (ya está puesto); con ALEATORIO
    // sortea ya el mapa de la próxima partida. Devuelve true si ha cambiado algo.
    rerollMap() {
      if (mapChoice !== 'random' || phase !== 'LOBBY') return false;
      mapIndex = Math.min(arenas.length - 1, Math.floor(rng() * arenas.length));
      return true;
    },
    get arena() { return current(); },
    // El plan de la partida (fijado al empezar READY) o, en el lobby, el que saldría con la gente de ahora.
    get plan() { return phase === 'LOBBY' ? currentPlan() : matchPlan ?? currentPlan(); },
    get tankCount() { const plan = this.plan; return plan ? tankCount(plan) : 0; },
    // Iniciales de todos los tanques del plan (humanos y luego bots), o las de las plazas si aún no hay plan.
    get tankNames() { const plan = this.plan; return plan ? namesFor(plan) : [...initials]; },
    get allInitials() { return this.tankNames; },
    // Para el ranking y el lobby: hay solo un jugador (1 contra 3 bots).
    get solo() { return this.plan?.kind === 'solo'; },
    get humans() { return humanCount(); },
    get difficulty() { return difficulty; },
    // Cambia la dificultad de los bots ('pro' o 'stand'); vale desde la siguiente partida. Devuelve true si cambió.
    setDifficulty(level) {
      if (!(level in DIFFICULTY) || level === difficulty) return false;
      difficulty = level;
      return true;
    },

    get ready() { return [...ready]; },

    // Un jugador pulsa LISTO; si lo vuelve a pulsar, lo cancela. Cuando todos los conectados lo están empieza la cuenta atrás de entrada.
    // Devuelve true si cambió algo.
    setReady(slot) {
      if (phase !== 'LOBBY' || initials[slot - 1] === null || initials[slot - 1] === undefined) return false;
      if (cfg.anyStart) { // JUGAR: empieza la cuenta atrás; si ya corre, la cancela (con límite y sin dobles clics)
        if (joinLeft === null) { openWindow(); return true; }
        if (joinTotal - joinLeft < (cfg.cancelGuardS ?? 0.8) || cancels[slot - 1] >= (cfg.maxCancels ?? 3)) return false;
        cancels[slot - 1] += 1;
        joinLeft = null;
        return true;
      }
      ready[slot - 1] = !ready[slot - 1];
      syncWindow();
      return true;
    },
    // Cuántas veces más puede cancelar la cuenta atrás cada plazo (arcade); null si no aplica.
    get cancelsLeft() { return cfg.anyStart ? cancels.map((n) => Math.max(0, (cfg.maxCancels ?? 3) - n)) : null; },
    // Segundos que faltan (entero hacia arriba) de la cuenta atrás de entrada, o null si no está corriendo.
    get joinLeft() { return joinLeft === null ? null : Math.max(0, Math.ceil(joinLeft)); },

    // Se llama cuando cambian las plazas ocupadas: [iniciales de P1 | null, ...]. Quien se va deja de estar listo; si ya había empezado la
    // presentación y falta alguien, se cancela y se pide LISTO de nuevo.
    setPlayers(newInitials) {
      const before = humanCount();
      initials = Array.from({ length: maxPlayers }, (_, i) => newInitials[i] ?? null);
      initials.forEach((name, i) => { if (name === null) { ready[i] = false; cancels[i] = 0; } });
      if (phase === 'READY' && (!present() || humanCount() < (matchPlan?.humans ?? 0))) { clearReady(); preview = null; setPhase('LOBBY'); }
      syncWindow(cfg.anyStart ? humanCount() > before : true); // arcade: solo reinicia la cuenta atrás si ENTRA alguien (si se va, sigue) // cambió quién está en la sala: la cuenta atrás de entrada vuelve a empezar (o se cancela si falta alguien por pulsar LISTO)
    },

    // Un jugador cambia de nombre en la sala de espera: solo el nombre (no toca LISTO ni la cuenta atrás). Devuelve true si se aplicó.
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

    // El jugador ha vuelto a tiempo (mismo mando, socket nuevo): se cancela su cuenta de abandono.
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

    // Solo para pruebas (menú de test del host): acaba la partida en curso por tiempo agotado.
    expireTime() { if (phase === 'PLAYING') match.expireTime(); },

    // Reset global: cualquier fase vuelve al lobby.
    reset,

    tick(dt) {
      if (phase === 'LOBBY' && joinLeft !== null) {
        joinLeft -= dt;
        if (joinLeft <= 0) { joinLeft = null; if (allReady() || autoMode() || (cfg.anyStart && humanCount() > 0)) startReady(); else out.phase('LOBBY'); }
        else if (Math.ceil(joinLeft) !== joinShown) { joinShown = Math.ceil(joinLeft); out.phase('LOBBY'); } // un aviso por segundo al host y a los mandos
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
        // Tolerancia del 25 %: los pasos del bucle no miden exactamente 1/60 s (en Windows ~15,6 ms; en coma flotante
        // 0,016666... < 1/60) y, sin ella, el estado salía solo uno de cada dos ticks (30 por segundo aunque se pidieran
        // 60), con un tick más de retardo de entrada.
        if (broadcastAcc >= interval * 0.75) {
          broadcastAcc = Math.max(0, broadcastAcc - interval);
          out.state(match.snapshot());
        }
      } else if (phase === 'GAME_OVER') {
        resultsLeft -= dt;
        if (resultsLeft <= 0) {
          out.redirect();
          mapIndex = nextMap(); // la siguiente partida, en el mapa elegido o en otro al azar
          reset();
          out.finished();
        }
      }
    },
  };
}
