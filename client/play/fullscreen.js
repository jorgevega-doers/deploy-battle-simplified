// Pantalla completa y horizontal del mando (sección 60). Los navegadores solo dejan entrar en pantalla completa tras un gesto del
// usuario, así que se pide en los toques de JUGAR / LISTO (enter) y en el primer toque de cualquier sitio. Qué NO hace: en iPhone
// (Safari no permite pantalla completa en páginas) el botón no sale; ahí solo queda el aviso de "gira el móvil".
export function setupFullscreen(button, gate = null, gateButton = null) {
  const root = document.documentElement;
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
  const supported = typeof request === 'function';
  const isFull = () => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
  let wanted = false; // no se fuerza nada hasta que el jugador complete el formulario (arm() al recibir la plaza); si sale a mano, no se vuelve a forzar hasta el siguiente LISTO

  const lockLandscape = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* no todos los navegadores */ } };
  function enter() {
    if (!supported || isFull()) return;
    try {
      const result = request.call(root, { navigationUI: 'hide' });
      Promise.resolve(result).then(lockLandscape).catch(() => {});
    } catch { /* sin pantalla completa: no pasa nada */ }
  }
  function exit() {
    wanted = false;
    gateOn = false; // salir a propósito (botón o fin de partida): no se vuelve a bloquear
    updateGate();
    try { screen.orientation?.unlock?.(); } catch { /* ya está libre */ }
    if (isFull()) { try { (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document); } catch { /* ya está fuera */ } }
  }
  // Pantalla bloqueante: mientras no esté en pantalla completa (y el navegador la soporte) tapa el mando con un solo botón. Si el navegador no la
  // concede (algunos navegadores integrados), tras un toque se abre igualmente: bloquear para siempre sería peor que jugar sin ella.
  let gateOn = supported && gate !== null;
  const updateGate = () => { if (gate) gate.hidden = !(gateOn && !isFull()); };
  const show = () => { button.textContent = isFull() ? 'SALIR DE PANTALLA COMPLETA' : 'PANTALLA COMPLETA'; updateGate(); };

  if (supported) {
    button.hidden = false;
    show();
    document.addEventListener('fullscreenchange', show);
    document.addEventListener('webkitfullscreenchange', show);
    button.addEventListener('click', () => { if (isFull()) exit(); else { wanted = true; gateOn = true; enter(); } });
    gateButton?.addEventListener('click', () => {
      wanted = true;
      enter();
      setTimeout(() => { if (!isFull()) { gateOn = false; updateGate(); } }, 800); // el navegador no la concede: no bloquear
    });
    updateGate();
    // El primer toque en cualquier sitio entra solo en pantalla completa (si el jugador no ha salido a propósito).
    document.addEventListener('pointerup', () => { if (wanted && !isFull()) enter(); });
  }

  // Bloqueo del zoom y del desplazamiento: el mando debe quedarse fijo (los controles no pueden moverse).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (event) => event.preventDefault()); // pellizco en iOS
  document.addEventListener('touchmove', (event) => { if (root.classList.contains('scrollgate') && event.touches.length === 1) return; // la pantalla de "desliza" de iPhone necesita desplazarse
    if (event.touches.length > 1 || !event.target.closest?.('input, textarea')) event.preventDefault(); }, { passive: false });
  document.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  let lastTap = 0;
  document.addEventListener('touchend', (event) => { // doble toque = zoom en algunos navegadores
    const now = Date.now();
    if (now - lastTap < 350 && !event.target.closest?.('input, textarea, button')) event.preventDefault();
    lastTap = now;
  }, { passive: false });

  return { enter, exit, supported, arm() { wanted = true; enter(); } };
}
