// Sonido de movimiento de cada tanque: el "cla cla cla" de un tanquecito de juguete de MADERA. Cada paso
// de las orugas es un golpecito seco de bloque de madera: un "tok" corto de seno (que alterna entre dos alturas, de ahí el
// cla-clo, cla-clo) más un "clic" de ruido filtrado. Cuanto más rápido va el tanque, más seguidos y fuertes suenan los golpes
// (de 5 a 14 por segundo; el dash los acelera al máximo). Parado no suena. Es retro y acogedor: nada de zumbidos.
// Los golpes se programan en el contexto de audio con unos milisegundos de antelación (no con temporizadores), así el ritmo
// es regular aunque un fotograma se retrase.
// Qué NO hace: no mide velocidades ni sabe de la partida (sfxMotionTracker.js le pasa la velocidad de cada tanque).
const MAX_ENGINES = 4;
const PITCH = [1, 0.88, 1.13, 0.8];   // cada tanque tiene su altura (el jugador, la normal; los bots, algo distintos)
const TOK = [1040, 830];              // Hz de los dos golpes que se alternan (cla / clo): más agudos y brillantes (plástico)
const FULL_SPEED = 4.5;               // celdas por segundo a partir de las que suena al máximo
const MIN_RATE = 6;                   // golpes por segundo a poca velocidad
const MAX_RATE = 18;                  // y a máxima velocidad: más rápido y continuo
const LOOKAHEAD_S = 0.06;             // cuánto futuro programa en cada fotograma
const VOLUME = 0.015;                  // volumen de un golpe a tope (antes del volumen general de sfx.js)

// access = { context(), master(), noise(), ready() } (lo da sfx.js). Devuelve { update(index, speed, pan), silence(), preview() }.
export function createMotionSound(access) {
  const engines = [];
  const heavy = [false, false, false, false]; // tanques de TNI (se recuerda aunque el motor aún no exista)

  function build(index) {
    const ctx = access.context();
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { out.connect(panner); panner.connect(access.master()); } else out.connect(access.master());
    return { out, panner, nextAt: 0, flip: index % 2, pitch: PITCH[index], heavy: heavy[index] };
  }

  // Tanque de TNI: en vez de madera, un golpe de oruga de acero pesado: retumbo grave de seno, gruñido de motor (cuadrada
  // muy grave filtrada) y crujido sordo. Mucho más grave y fuerte que el resto: impone.
  function heavyKnock(e, when, level) {
    const ctx = access.context();
    const vol = VOLUME * 4.5 * (0.6 + 0.4 * level);
    e.flip = 1 - e.flip;
    const voice = (type, from, to, dur, gain) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from * (0.97 + Math.random() * 0.06), when);
      osc.frequency.exponentialRampToValueAtTime(to, when + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(lp); lp.connect(g); g.connect(e.out);
      osc.onended = () => { try { osc.disconnect(); lp.disconnect(); g.disconnect(); } catch { /* ya soltado */ } };
      osc.start(when); osc.stop(when + dur + 0.02);
    };
    voice('sine', e.flip ? 78 : 66, 40, 0.11, vol);         // retumbo de la oruga
    voice('square', e.flip ? 46 : 41, 34, 0.09, vol * 0.45); // gruñido del motor
    const click = ctx.createBufferSource();
    click.buffer = access.noise();
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass'; band.frequency.value = 900;
    const snap = ctx.createGain();
    snap.gain.setValueAtTime(0.0001, when);
    snap.gain.exponentialRampToValueAtTime(vol * 0.5, when + 0.002);
    snap.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    click.connect(band); band.connect(snap); snap.connect(e.out);
    click.onended = () => { try { click.disconnect(); band.disconnect(); snap.disconnect(); } catch { /* ya soltado */ } };
    click.start(when); click.stop(when + 0.06);
  }

  // Un golpe de madera en el instante "when": "tok" de seno que cae un poco + "clic" de ruido de banda estrecha.
  function knock(e, when, level) {
    if (e.heavy) { heavyKnock(e, when, level); return; }
    const ctx = access.context();
    const vol = VOLUME * (0.55 + 0.45 * level);
    const f = TOK[e.flip] * e.pitch * (0.97 + Math.random() * 0.06); // un pelo distinto cada vez: suena a madera, no a máquina
    e.flip = 1 - e.flip;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, when);
    osc.frequency.exponentialRampToValueAtTime(f * 0.92, when + 0.025);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, when);
    body.gain.exponentialRampToValueAtTime(vol, when + 0.001);
    body.gain.exponentialRampToValueAtTime(0.0001, when + 0.03); // seco: sin cola
    osc.connect(body);
    body.connect(e.out);
    osc.onended = () => { try { osc.disconnect(); body.disconnect(); } catch { /* ya soltado */ } };
    osc.start(when);
    osc.stop(when + 0.06);

    const click = ctx.createBufferSource();
    click.buffer = access.noise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3600 * e.pitch;
    band.Q.value = 2.2;
    const snap = ctx.createGain();
    snap.gain.setValueAtTime(0.0001, when);
    snap.gain.exponentialRampToValueAtTime(vol * 0.8, when + 0.001);
    snap.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
    click.connect(band);
    band.connect(snap);
    snap.connect(e.out);
    click.onended = () => { try { click.disconnect(); band.disconnect(); snap.disconnect(); } catch { /* ya soltado */ } };
    click.start(when);
    click.stop(when + 0.03);
  }

  // Programa los golpes de los próximos "horizon" segundos al ritmo que toque por la velocidad.
  function fill(e, level, horizon) {
    const now = access.context().currentTime;
    const rate = (MIN_RATE + level * (MAX_RATE - MIN_RATE)) * (e.heavy ? 0.6 : 1); // el pesado, más lento: cada golpe pesa
    if (e.nextAt < now) e.nextAt = now + 0.004; // acaba de empezar a moverse (o se retrasó): el primer golpe, casi ya
    while (e.nextAt < now + horizon) {
      knock(e, e.nextAt, level);
      e.nextAt += (1 / rate) * (0.94 + Math.random() * 0.12); // ritmo con una pizca de irregularidad, como un juguete real
    }
  }

  return {
    // speed = celdas por segundo del tanque (0 = parado); pan = panorama (-0.7..0.7).
    update(index, speed, pan = 0) {
      if (index < 0 || index >= MAX_ENGINES || !access.ready()) return;
      const e = engines[index] ?? (engines[index] = build(index));
      const level = Math.min(1, Math.max(0, speed / FULL_SPEED));
      if (level <= 0.04) { e.nextAt = 0; return; } // parado: ya no se programan más golpes
      if (e.panner) e.panner.pan.setTargetAtTime(pan, access.context().currentTime, 0.05);
      fill(e, level, LOOKAHEAD_S);
    },
    // Tanque de TNI: su motor suena pesado y grave (true) o normal (false).
    setHeavy(index, on) {
      if (index < 0 || index >= MAX_ENGINES) return;
      heavy[index] = Boolean(on);
      if (engines[index]) engines[index].heavy = heavy[index];
    },
    // Parar todo: no se programan más golpes (los ya programados duran milisegundos).
    silence() { for (const e of engines) if (e) e.nextAt = 0; },
    // Para pruebas de nivel: programa de golpe "seconds" segundos de movimiento a esa velocidad.
    preview(index, speed, seconds) {
      if (!access.ready()) return;
      const e = engines[index] ?? (engines[index] = build(index));
      fill(e, Math.min(1, Math.max(0, speed / FULL_SPEED)), seconds);
    },
    get engines() { return engines.filter(Boolean).length; },
  };
}
