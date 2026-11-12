// Secuenciador de la música de fondo: toca en bucle las notas que escribe musicScore.js con instrumentos
// sintetizados (bombo, palmas, hi-hats, bajo rodante filtrado, acordes de fondo, arpegio de pluck, golpes de acorde, golpe metálico
// y una melodía tímida: techno industrial pero acogedor). Programa las
// notas con 250 ms de antelación sobre el RELOJ DE AUDIO (no con temporizadores sueltos), así el ritmo no se descuadra aunque la
// pantalla se retrase. Va por el bus de música de sfx.js, que se agacha con los golpes fuertes.
// Qué NO hace: no compone (musicScore.js), no decide el ánimo (main.js: lobby, partida, últimos 10 s...) ni sube o baja el volumen.
import { composeBar, MOODS } from './musicScore.js';

const LOOKAHEAD_S = 0.25;
const TICK_MS = 40;

// audio = { tone, noise, context(), ready() } (lo da sfx.js).
export function createMusic(audio) {
  const { tone, noise } = audio;
  let mood = null;
  let timer = null;
  let bar = 0;
  let step = 0;
  let nextTime = 0;
  let events = [];

  const stepSeconds = () => 60 / MOODS[mood].bpm / 4;

  // Toca una nota en el instante "when" (tiempo del reloj de audio).
  function play(e, when) {
    const delay = Math.max(0, when - audio.context().currentTime);
    const stepS = stepSeconds();
    const dur = Math.max(0.05, e.length * stepS * (e.kind === 'pad' ? 0.98 : 0.92));
    switch (e.kind) {
      case 'kick': // bombo seco y redondo, con un clic al principio
        tone({ type: 'sine', freq: 165, to: 42, dur: 0.24, vol: e.vol, delay, attack: 0.001, bus: 'music' }); // cuerpo: barrido grave de 165 a 42 Hz
        tone({ type: 'sine', freq: 52, dur: 0.2, vol: e.vol * 0.8, delay, attack: 0.004, bus: 'music' }); // "boom" sostenido (el kick de techno)
        noise({ filter: 'lowpass', from: 1400, to: 260, dur: 0.035, vol: e.vol * 0.55, delay, bus: 'music' }); // clic de ataque
        tone({ type: 'sine', freq: 90, to: 38, dur: 0.42, vol: e.vol * 0.55, delay, attack: 0.002, bus: 'music' }); // cola larga y grave (techno duro)
        tone({ type: 'square', freq: 110, to: 45, dur: 0.07, vol: e.vol * 0.12, delay, lp: 900, bus: 'music' }); // pegada oscura
        break;
      case 'clap': // palma: dos ráfagas de ruido de banda media pegadas
        noise({ filter: 'bandpass', from: 1500, dur: 0.07, vol: e.vol, delay, q: 1, bus: 'music' });
        noise({ filter: 'bandpass', from: 1700, dur: 0.09, vol: e.vol * 0.8, delay: delay + 0.012, q: 1, bus: 'music' });
        break;
      case 'ohat': // hi-hat abierto a contratiempo
        noise({ filter: 'highpass', from: 7000, dur: 0.09, vol: e.vol, delay, q: 0.7, bus: 'music' });
        break;
      case 'hat': // hi-hat cerrado
        noise({ filter: 'highpass', from: 8500, dur: 0.025, vol: e.vol, delay, q: 0.7, bus: 'music' });
        break;
      case 'bass': // bajo rodante: diente de sierra filtrado, corto (un "pluck" grave y cálido)
        tone({ type: 'sawtooth', freq: e.freq, dur, vol: e.vol, delay, lp: 460, attack: 0.004, bus: 'music' });
        tone({ type: 'sawtooth', freq: e.freq * 1.007, dur, vol: e.vol * 0.7, delay, lp: 380, attack: 0.004, bus: 'music' }); // 2.ª sierra desafinada: más grasa
        tone({ type: 'sine', freq: e.freq, dur, vol: e.vol * 0.6, delay, attack: 0.004, bus: 'music' });
        break;
      case 'drone': // zumbido grave de fábrica: sierra muy filtrada que sostiene todo el compás
        tone({ type: 'sawtooth', freq: e.freq, dur, vol: e.vol, delay, lp: 240, attack: 0.15, bus: 'music' });
        break;
      case 'rumble': // retumbo a contratiempo (techno industrial): ruido grave que se apaga, con un seno bajo
        noise({ filter: 'lowpass', from: 220, to: 90, dur: 0.2, vol: e.vol * 0.8, delay, bus: 'music' });
        tone({ type: 'sine', freq: e.freq, dur: 0.18, vol: e.vol * 0.8, delay, attack: 0.01, bus: 'music' });
        break;
      case 'grime': // dark techno sucio: dos sierras desafinadas que caen, un cuadrado grave y ruido sucio; todo muy filtrado
        tone({ type: 'sawtooth', freq: e.freq * 1.5, to: e.freq, dur: dur * 1.6, vol: e.vol, delay, lp: 340, attack: 0.003, bus: 'music' });
        tone({ type: 'sawtooth', freq: e.freq * 1.5 * 1.012, to: e.freq * 1.012, dur: dur * 1.6, vol: e.vol * 0.8, delay, lp: 300, attack: 0.003, bus: 'music' });
        tone({ type: 'square', freq: e.freq * 0.5, dur: dur * 1.2, vol: e.vol * 0.5, delay, lp: 220, attack: 0.003, bus: 'music' });
        noise({ filter: 'bandpass', from: 180, to: 420, dur: dur * 1.2, vol: e.vol * 0.45, delay, q: 1.8, bus: 'music' });
        break;
      case 'anvil': // yunque: golpe metálico mate, más grave que el clank
        noise({ filter: 'bandpass', from: 900, dur: 0.16, vol: e.vol, delay, q: 9, send: 0.25, bus: 'music' });
        tone({ type: 'sine', freq: 415, dur: 0.14, vol: e.vol * 0.7, delay, attack: 0.002, send: 0.2, bus: 'music' });
        break;
      case 'pad': // acordes largos de fondo (oscurecidos: una octava más grave y más filtrados)
        tone({ type: 'triangle', freq: e.freq, dur, vol: e.vol, delay, lp: 800, attack: 0.2, send: 0.4, bus: 'music' });
        tone({ type: 'sine', freq: e.freq * 2, dur, vol: e.vol * 0.35, delay, attack: 0.3, send: 0.3, bus: 'music' });
        break;
      case 'arp': // arpegio de pluck blando
        tone({ type: 'square', freq: e.freq, dur: Math.max(0.07, dur * 1.1), vol: e.vol, delay, lp: 1900, attack: 0.003, pan: step % 2 ? 0.3 : -0.3, send: 0.25, bus: 'music' });
        break;
      case 'stab': // golpe de acorde corto y filtrado
        tone({ type: 'sawtooth', freq: e.freq, dur: Math.max(0.08, dur * 1.2), vol: e.vol, delay, lp: 1100, attack: 0.004, send: 0.3, bus: 'music' });
        break;
      case 'clank': // golpe metálico de fábrica (industrial): ruido de banda estrecha y dos armónicos inarmónicos
        noise({ filter: 'bandpass', from: 3300, dur: 0.14, vol: e.vol, delay, q: 8, send: 0.2, bus: 'music' });
        tone({ type: 'sine', freq: 1180, dur: 0.12, vol: e.vol * 0.5, delay, attack: 0.002, send: 0.25, bus: 'music' });
        tone({ type: 'sine', freq: 1790, dur: 0.09, vol: e.vol * 0.35, delay, attack: 0.002, bus: 'music' });
        break;
      case 'lead': // melodía tímida: triángulo suave con un poco de cuadrada
        tone({ type: 'triangle', freq: e.freq, dur: dur * 1.4, vol: e.vol, delay, lp: 2000, attack: 0.012, send: 0.35, bus: 'music' });
        tone({ type: 'square', freq: e.freq, dur, vol: e.vol * 0.3, delay, lp: 1300, attack: 0.008, bus: 'music' });
        break;
      default:
    }
  }

  function tick() {
    if (!mood || !audio.ready()) { nextTime = 0; return; }
    const now = audio.context().currentTime;
    if (nextTime < now) nextTime = now + 0.05; // acaba de empezar (o se retrasó): se re-sincroniza
    while (nextTime < now + LOOKAHEAD_S) {
      if (step === 0) events = composeBar(bar, mood);
      for (const e of events) if (e.step === step) play(e, nextTime);
      nextTime += stepSeconds();
      step++;
      if (step === 16) { step = 0; bar++; }
    }
  }

  return {
    // mood: 'calm' | 'play' | 'rush' | null (parar). Cambiar de ánimo mantiene el compás: la música no se corta ni vuelve a empezar.
    setMood(next) {
      const wanted = next && MOODS[next] ? next : null;
      if (wanted === mood) return;
      const wasStopped = mood === null;
      mood = wanted;
      if (!mood) { clearInterval(timer); timer = null; return; }
      if (wasStopped) { bar = 0; step = 0; nextTime = 0; }
      else events = composeBar(bar, mood); // el resto del compás ya suena con el ánimo nuevo desde el siguiente paso
      if (!timer) { timer = setInterval(tick, TICK_MS); timer.unref?.(); }
      tick();
    },
    // Solo para medir niveles: programa "bars" compases enteros del ánimo dado desde el instante actual.
    preview(previewMood, bars = 2) {
      if (!audio.ready() || !MOODS[previewMood]) return;
      const keep = mood;
      mood = previewMood;
      let time = audio.context().currentTime + 0.02;
      for (let b = 0; b < bars; b++) {
        for (const e of composeBar(b, mood)) play(e, time + e.step * stepSeconds());
        time += 16 * stepSeconds();
      }
      mood = keep;
    },
    get state() { return { mood, bar, step, bpm: mood ? MOODS[mood].bpm : 0 }; },
  };
}
