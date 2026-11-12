// Envío de los controles del jugador (teclado, ratón o mando del PC) al servidor, pensado para redes lentas. Qué hace: junta movimiento y apuntado en UN solo
// paquete corto ("pad": [x, y, ángulo] en enteros), no manda nada si el valor (redondeado en escalones) no ha cambiado, adapta el ritmo al ping,
// espera a que el WebSocket esté libre (si hay datos sin enviar, uno nuevo solo empeora el retardo: se manda el ÚLTIMO estado en cuanto se vacía)
// y repite el estado cada 500 ms mientras se mueve. Qué NO hace: no toca el DOM ni lee el teclado o el mando (lo hace keyboardPlayer.js).
//
// Formato de "pad": [x, y, a]  x e y en -100..100 (centésimas del pad); a = ángulo en centésimas de radián o null (sin cambios).

export const MOVE_STEP = 4;  // escalón del pad de movimiento, en centésimas (el servidor ya tiene su zona muerta; 4 % no se nota al jugar)
export const AIM_STEP = 3;   // escalón del apuntado, en centésimas de radián (~1,7°)

// Tiempo mínimo entre envíos según el ping: con buena red, 16 ms; cuanto peor la red, menos paquetes (así no se acumulan y llegan de golpe).
export function padInterval(ping) {
  if (ping > 250) return 80;
  if (ping > 140) return 50;
  if (ping > 70) return 33;
  return 16;
}

const clampPercent = (v) => Math.max(-100, Math.min(100, Math.round(v * 100)));
const stepped = (value, step) => Math.round(value / step) * step;

// Valor "enviable" del estado actual: movimiento en escalones y ángulo en escalones (o null).
export function quantizePad(x, y, angle) {
  return [
    stepped(clampPercent(x), MOVE_STEP),
    stepped(clampPercent(y), MOVE_STEP),
    angle === null || angle === undefined ? null : stepped(Math.round(angle * 100), AIM_STEP),
  ];
}
export const samePad = (a, b) => Boolean(a && b) && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function createPadLink({ send, sendNow, fire, getPing = () => 0, canSend = () => true, setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now(), keepAliveMs = 500, setRepeat = setInterval, clearRepeat = clearInterval }) {
  const state = { x: 0, y: 0, angle: null };
  let sent = null;          // último paquete enviado (para no repetir)
  let lastSentAt = -1e9;
  let timer = null;
  let keepAlive = null;
  let moveHeld = false;
  let aimHeld = false;

  function flush() {
    timer = null;
    const next = quantizePad(state.x, state.y, aimHeld ? state.angle : null);
    // El ángulo solo viaja mientras se apunta; el servidor se queda con el último que recibió.
    if (samePad(next, sent) || (sent && next[2] === null && next[0] === sent[0] && next[1] === sent[1])) return;
    if (!canSend()) { timer = setTimer(flush, 25); return; } // el socket aún tiene datos por enviar: se espera y se manda lo más reciente
    send(next);
    sent = next;
    lastSentAt = now();
  }
  function schedule() {
    if (timer !== null) return;
    const wait = Math.max(0, padInterval(getPing()) - (now() - lastSentAt));
    timer = setTimer(flush, wait);
  }
  function startKeepAlive() {
    if (keepAlive !== null) return;
    keepAlive = setRepeat(() => {
      if ((moveHeld || aimHeld) && sent && canSend()) send(sent); // por si un paquete "volátil" se perdió: el servidor no se queda con una dirección vieja
    }, keepAliveMs);
  }
  function stopKeepAliveIfIdle() {
    if (!moveHeld && !aimHeld && keepAlive !== null) { clearRepeat(keepAlive); keepAlive = null; }
  }

  return {
    setMove(x, y) { state.x = x; state.y = y; moveHeld = true; startKeepAlive(); schedule(); },
    // Soltar el pad de movimiento: parar SIEMPRE llega (camino fiable y al instante).
    releaseMove() {
      state.x = 0; state.y = 0; moveHeld = false;
      if (timer !== null) { clearTimer(timer); timer = null; }
      const stop = quantizePad(0, 0, null);
      sendNow(stop);
      sent = stop;
      lastSentAt = now();
      stopKeepAliveIfIdle();
    },
    setAim(angle) { state.angle = angle; aimHeld = true; startKeepAlive(); schedule(); },
    // Soltar el pad de apuntado = disparar: el disparo lleva su ángulo definitivo (un solo paquete fiable, sin "pad_aim" aparte).
    fire(angle) {
      if (timer !== null) { clearTimer(timer); timer = null; }
      aimHeld = false;
      stopKeepAliveIfIdle();
      fire(angle === null || angle === undefined ? null : Math.round(angle * 100));
    },
    cancelAim() { aimHeld = false; state.angle = null; stopKeepAliveIfIdle(); },
    get lastSent() { return sent; },
  };
}
