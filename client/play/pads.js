// Controles táctiles del mando: joystick (pad de movimiento y pad de apuntado) y botón de disparo.
// Usan "pointer events" (no "click"), que responden al instante y admiten varios dedos a la vez.

// Un joystick cuadrado dentro del elemento "el". Llama a onChange(x, y, activo, cancelado) con x e y entre -1 y 1
// (eje Y hacia arriba, como en el mundo del juego). Al soltar vuelve a (0, 0, false); "cancelado" es true si el
// sistema interrumpió el toque (p. ej. un gesto del móvil) en vez de levantar el dedo el jugador.
export function createJoystick(el, onChange) {
  const knob = el.querySelector('.knob');
  let activePointer = null;

  function update(event) {
    const rect = el.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - (rect.left + radius)) / radius;
    let dy = (event.clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`;
    onChange(dx, -dy, true);
  }
  function release(cancelled = false) {
    activePointer = null;
    knob.style.transform = 'translate(0, 0)';
    onChange(0, 0, false, cancelled);
  }

  el.addEventListener('pointerdown', (event) => {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    el.setPointerCapture(event.pointerId);
    update(event);
  });
  el.addEventListener('pointermove', (event) => { if (event.pointerId === activePointer) update(event); });
  el.addEventListener('pointerup', (event) => { if (event.pointerId === activePointer) release(false); });
  el.addEventListener('pointercancel', (event) => { if (event.pointerId === activePointer) release(true); });
  return { release };
}

// Envía como mucho cada "intervalMs" y siempre acaba enviando el último valor (si no, un movimiento rápido
// podría perderse justo antes de soltar el dedo). La función devuelta tiene .cancel(): descarta el envío
// pendiente. Hay que llamarlo al soltar el dedo; si no, ese envío tardío llega DESPUÉS del "parar" y el
// tanque sigue andando en la última dirección.
export function throttleLatest(send, intervalMs) {
  let lastSent = -Infinity; // el primer envío sale siempre al instante (con 0 no salía si la página llevaba menos de un intervalo abierta)
  let timer = null;
  let pending = null;
  const throttled = (...args) => {
    pending = args;
    const wait = (typeof intervalMs === 'function' ? intervalMs() : intervalMs) - (performance.now() - lastSent); // función = intervalo que cambia (red lenta)
    if (wait <= 0) {
      clearTimeout(timer);
      timer = null;
      lastSent = performance.now();
      send(...pending);
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        lastSent = performance.now();
        send(...pending);
      }, wait);
    }
  };
  throttled.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return throttled;
}

// Botón de un solo toque (el dash): llama a onTap en el instante de pulsar. El servidor decide si se puede.
export function createTapButton(el, onTap) {
  const release = () => el.classList.remove('pressed');
  el.addEventListener('pointerdown', (event) => {
    el.setPointerCapture(event.pointerId);
    el.classList.add('pressed');
    onTap();
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  return { release };
}
