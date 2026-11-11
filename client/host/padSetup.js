// Configuración de un mando que el navegador no reconoce (versión pública, 10-nov). Los mandos "estándar" (Xbox, PlayStation...) llegan ya
// ordenados; los genéricos (p. ej. los GAME BOX del stand) llegan "en bruto" y el número de cada botón cambia según el mando: lo que el juego creía
// START era R2 (y L2 + R2 ponían LISTO). Así que, la primera vez que se conecta uno de esos, se pregunta botón a botón (PULSA START, PULSA SELECT...)
// y se guarda para ese modelo de mando (localStorage, la misma clave que el menú MANDOS del stand). Mientras se configura, ese mando no juega.
// Qué NO hace: no lee el mando para jugar (padInput.js, gamepads.js): solo aprende qué es cada botón.
import { defaultMapping, detectInput } from './gamepadMap.js';
import { alertBox } from './alertIcon.js';

export const MAP_KEY = 'doersforce.gamepad.map.'; // + id del mando (= gamepads.js)
// Mandos genéricos que ya conocemos (10-nov): su configuración va dentro del juego y funcionan solos en cualquier ordenador, sin preguntar.
// Cada entrada: [patrón del id que da el navegador (fabricante y producto), configuración copiada de menú > MANDOS > COPIAR SU CONFIGURACIÓN].
const KNOWN_PADS = [];
const knownFor = (id) => KNOWN_PADS.find(([pattern]) => pattern.test(id))?.[1] ?? null;
// Versión de las configuraciones guardadas: la 2 pide R1 (disparo) y L1 (impulso). Las anteriores pedían R2 y L2 (y había quien pulsaba L1 en
// el paso de L2: le quedaba disparo en R2 e impulso en L1), así que no valen: ese mando vuelve a preguntar sus botones.
export const MAPPING_VERSION = 2;
// La configuración de un mando: la que se guardó en este navegador (si es de la versión actual) o, si no, la de un modelo conocido.
export function loadPadMapping(id) {
  try {
    const raw = window.localStorage.getItem(MAP_KEY + id);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.v >= MAPPING_VERSION) return saved;
  } catch { /* sin almacenamiento o guardado roto: como si no hubiera nada */ }
  return knownFor(id);
}
// Pasos: [acción, botón que se pide]. El dibujo del mando ilumina ese botón (más visual que explicar para qué sirve cada uno).
const STEPS = [['start', 'START'], ['select', 'SELECT'], ['a', 'A'], ['b', 'B'], ['fire', 'R1'], ['dash', 'L1']];
// Mando en pixel art (48 x 30): cada botón que se pide lleva data-k con su acción.
const PAD_ART = `<svg class="ps-pad" viewBox="0 0 48 30" shape-rendering="crispEdges" aria-hidden="true">
  <rect class="pp" data-k="dash" x="6" y="2" width="11" height="3"/><rect class="pp" data-k="fire" x="31" y="2" width="11" height="3"/>
  <rect class="pb" x="4" y="5" width="40" height="14"/><rect class="pb" x="2" y="8" width="44" height="10"/>
  <rect class="pb" x="3" y="18" width="13" height="8"/><rect class="pb" x="32" y="18" width="13" height="8"/>
  <rect class="pd" x="8" y="11" width="9" height="3"/><rect class="pd" x="11" y="8" width="3" height="9"/>
  <rect class="pp" data-k="select" x="19" y="11" width="4" height="2"/><rect class="pp" data-k="start" x="25" y="11" width="4" height="2"/>
  <rect class="pd" x="35" y="6" width="3" height="3"/><rect class="pd" x="31" y="10" width="3" height="3"/>
  <rect class="pp" data-k="b" x="39" y="10" width="3" height="3"/><rect class="pp" data-k="a" x="35" y="14" width="3" height="3"/>
  <rect class="pd" x="14" y="18" width="5" height="5"/><rect class="pd" x="29" y="18" width="5" height="5"/>
</svg>`;
const same = (x, y) => x && y && x.i === y.i && (x.t ?? 'b') === (y.t ?? 'b') && (x.sign ?? 0) === (y.sign ?? 0);

// Mantener CUALQUIER botón HOLD_MS (no depende de qué botón sea cada uno: si te equivocaste, START puede no ser START): fuera de la partida,
// vuelve a configurar ese mando; durante la configuración, empieza de nuevo. canHold() = se puede (la pantalla del juego: no en plena partida).
const HOLD_MS = 4000;
const HOLD_HINT_MS = 1000;
export function createPadSetup({ onDone = () => {}, canHold = () => true } = {}) {
  const box = document.createElement('div');
  box.id = 'pad-setup';
  box.className = 'ui-panel';
  box.hidden = true;
  // Visual y simple (10-nov): el mando dibujado con el botón que toca parpadeando, "PULSA X", el progreso en puntos y un solo aviso. Sin más botones que la X.
  box.innerHTML = `<button type="button" class="ps-close" aria-label="Cerrar">×</button>
    <div class="ui-title">CONFIGURA TU MANDO</div>
    ${PAD_ART}
    <p class="ps-step"></p>
    <div class="ps-dots">${STEPS.map(() => '<i></i>').join('')}</div>
    ${alertBox('¿TE EQUIVOCAS? MANTÉN UN BOTÓN 4 S', 'ps-redo')}`;
  document.body.appendChild(box);
  const toast = document.createElement('div'); // "sigue pulsando..." mientras se mantiene un botón
  toast.id = 'pad-hold';
  toast.className = 'ui-panel';
  toast.hidden = true;
  document.body.appendChild(toast);
  const holdSince = new Map(); // mando -> desde cuándo tiene algún botón pulsado
  const holdUsed = new Set();  // mandos cuyo "mantener" ya hizo efecto (hasta que suelten)
  const skipped = new Set(); // mandos que el jugador prefirió no configurar (hasta recargar; se puede abrir con NO CONFIGURADO en su ficha)
  const firstSeen = new Map(); // mando -> sus ejes la primera vez que se vio (su reposo): sale al TOCARLO, no solo por estar enchufado
  let job = null;            // { index, id, step, rest, waitRelease, result }
  const needs = (p) => p.mapping !== 'standard' && !loadPadMapping(p.id);
  const touched = (p) => {
    if (!firstSeen.has(p.index)) firstSeen.set(p.index, [...p.axes]);
    const rest = firstSeen.get(p.index);
    return p.buttons.some((b) => b.pressed) || p.axes.some((v, i) => Math.abs(v - (rest[i] ?? 0)) > 0.5);
  };
  // Configuraciones compartidas: id del mando -> 'loading' | 'none' | 'found'. Sin conexión o sin servidor, 'none' (se configura aquí).
  const fromServer = new Map();
  function askServer(pad) {
    fromServer.set(pad.id, 'loading');
    fetch(`/api/pads?id=${encodeURIComponent(pad.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.mapping) { fromServer.set(pad.id, 'none'); return; }
        const full = { ...defaultMapping(pad, navigator.userAgent), ...data.mapping, learned: true, shared: true, v: MAPPING_VERSION };
        delete full.fire2; delete full.dash2;
        try { window.localStorage.setItem(MAP_KEY + pad.id, JSON.stringify(full)); } catch { /* sin almacenamiento */ }
        fromServer.set(pad.id, 'found');
        onDone();
      })
      .catch(() => fromServer.set(pad.id, 'none'));
  }
  function start(pad) {
    job = { index: pad.index, id: pad.id, step: 0, rest: firstSeen.get(pad.index) ?? [...pad.axes], waitRelease: true, result: {} };
    show();
  }

  // Volver al paso 1 (te equivocaste): se olvida lo aprendido en esta configuración.
  function restart() {
    if (!job) return;
    job.step = 0; job.result = {}; job.waitRelease = true;
    show();
  }
  function show() {
    const [action, label] = STEPS[job.step];
    box.querySelector('.ps-step').textContent = `PULSA ${label}`;
    // Con varios mandos sin configurar, se hacen de uno en uno: el título dice cuál es (el siguiente espera a que acabe este).
    box.querySelector('.ui-title').textContent = job.index === 0 ? 'CONFIGURA TU MANDO' : `CONFIGURA EL MANDO ${job.index + 1}`;
    for (const part of box.querySelectorAll('.pp')) {
      const k = STEPS.findIndex(([a]) => a === part.dataset.k);
      part.classList.toggle('now', part.dataset.k === action);
      part.classList.toggle('done', k < job.step);
    }
    box.querySelectorAll('.ps-dots i').forEach((dot, i) => { dot.className = i < job.step ? 'done' : i === job.step ? 'now' : ''; });
    box.hidden = false;
  }
  function finish(save) {
    if (job && save) {
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.index === job.index);
      const full = { ...(pad ? defaultMapping(pad, navigator.userAgent) : {}), ...job.result, learned: true, v: MAPPING_VERSION };
      delete full.fire2; delete full.dash2; // los de reserva de los mandos estándar no valen aquí
      try { window.localStorage.setItem(MAP_KEY + job.id, JSON.stringify(full)); } catch { /* sin almacenamiento: vale hasta recargar */ }
      // Se comparte: el siguiente que conecte este modelo, en cualquier ordenador, ya lo tendrá configurado (server/db/padConfigs.js).
      fetch('/api/pads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, mapping: { ...job.result, lx: full.lx, ly: full.ly, rx: full.rx, ry: full.ry } }) }).catch(() => {});
    } else if (job) skipped.add(job.id);
    job = null;
    box.hidden = true;
    onDone();
  }
  box.querySelector('.ps-close').addEventListener('click', (event) => { event.currentTarget.blur(); finish(false); });
  // Mantener un botón: cuenta atrás en pantalla desde el primer segundo y, a los 4 s, vuelve a configurar (o empieza de nuevo). Devuelve true si actuó.
  function holdCheck(pads) {
    const now = performance.now();
    let hint = '';
    for (const p of pads) {
      const down = p.buttons.some((b) => b.pressed);
      if (!down) { holdSince.delete(p.index); holdUsed.delete(p.index); continue; }
      if (!holdSince.has(p.index)) holdSince.set(p.index, now);
      if (holdUsed.has(p.index)) continue;
      const mine = job ? job.index === p.index : canHold();
      if (!mine) continue;
      const held = now - holdSince.get(p.index);
      if (held >= HOLD_MS) {
        holdUsed.add(p.index);
        toast.hidden = true;
        if (job) restart(); else { skipped.delete(p.id); start(p); }
        return true;
      }
      if (held >= HOLD_HINT_MS) hint = `SIGUE PULSANDO PARA ${job ? 'EMPEZAR DE NUEVO' : 'VOLVER A CONFIGURAR EL MANDO'} · ${Math.ceil((HOLD_MS - held) / 1000)}`;
    }
    toast.textContent = hint;
    toast.hidden = !hint;
    return false;
  }

  return {
    // ¿Este mando está configurándose? (mientras tanto no juega)
    busy: (index) => job !== null && job.index === index,
    get active() { return job !== null; },
    // ¿Tiene configuración guardada? / Borrarla (menú > MANDOS).
    configured: (id) => Boolean(loadPadMapping(id)),
    mappingOf: (id) => loadPadMapping(id),
    forget(id) { try { window.localStorage.removeItem(MAP_KEY + id); } catch { /* da igual */ } onDone(); },
    // ¿Este mando (índice) necesita configurarse? (para el botón NO CONFIGURADO de su ficha)
    needsSetup(index) { const p = navigator.getGamepads?.()[index]; return Boolean(p && p.connected && needs(p)); },
    // Abre la configuración de ese mando a mano (botón NO CONFIGURADO de su ficha), aunque antes se cerrara.
    open(index) {
      const p = navigator.getGamepads?.()[index];
      if (!p || !p.connected || job) return;
      skipped.delete(p.id);
      start(p);
    },
    // Cada fotograma. Sale solo cuando alguien TOCA un mando sin configurar (enchufado sin más, no molesta a quien no quiere jugar con mando).
    update() {
      const pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected);
      if (holdCheck(pads)) return;
      if (!job) {
        if (!canHold()) return; // en plena partida no salta la ventana: los controles se arreglan en la sala de espera
        const pad = pads.find((p) => touched(p) && needs(p) && !skipped.has(p.id));
        if (!pad) return;
        // Antes de preguntar, ¿alguien ya configuró este modelo? (configuraciones compartidas). Si sí, se usa y no sale la ventana.
        const asked = fromServer.get(pad.id);
        if (asked === undefined) { askServer(pad); return; }
        if (asked === 'none') start(pad); // 'loading': aún esperando la respuesta
        return;
      }
      const pad = pads.find((p) => p.index === job.index);
      if (!pad) { job = null; box.hidden = true; return; } // se desconectó
      if (job.waitRelease) { // hasta que suelte todo (si no, el botón del paso anterior contaría para este)
        const idle = pad.buttons.every((b) => !b.pressed && b.value < 0.3) && pad.axes.every((v, i) => Math.abs(v - (job.rest[i] ?? 0)) < 0.3);
        if (idle) job.waitRelease = false;
        return;
      }
      const action = STEPS[job.step][0];
      const found = detectInput(pad, action, job.rest);
      if (!found || Object.values(job.result).some((r) => same(r, found))) return; // nada, o un botón que ya es otra cosa
      job.result[action] = found;
      job.step += 1;
      job.waitRelease = true;
      if (job.step >= STEPS.length) finish(true); else show();
    },
  };
}
