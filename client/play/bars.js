// Ocultar las barras del navegador en iPhone sin instalar nada (sección 60). iOS no tiene pantalla completa para webs, pero Safari, Chrome y
// Vivaldi esconden su barra de pestañas/URL cuando la página se desplaza hacia arriba. Truco: una pantalla inicial más alta que la ventana
// ("DESLIZA HACIA ARRIBA"); al deslizar, el navegador esconde sus barras y esa pantalla se retira. Solo en iPhone y solo una vez por sesión.
// Qué NO hace: no se puede forzar (el gesto lo hace el jugador) ni evitar que las barras vuelvan si toca arriba del todo.
const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent);

export function setupHideBars(gate, skipButton, { enabled }) {
  let seen = false;
  try { seen = sessionStorage.getItem('df.bars') === '1'; } catch { /* sin almacenamiento */ }
  if (!enabled || !isIPhone() || seen) return { active: false };
  const root = document.documentElement;
  const startHeight = window.innerHeight;
  const release = () => {
    root.classList.remove('scrollgate');
    gate.hidden = true;
    try { sessionStorage.setItem('df.bars', '1'); } catch { /* da igual */ }
    window.removeEventListener('scroll', check);
    window.removeEventListener('resize', check);
  };
  // Las barras se han ocultado si la ventana ha crecido o la página ya se ha desplazado un buen trozo.
  function check() { if (window.scrollY > 60 || window.innerHeight > startHeight + 20) setTimeout(release, 150); }
  gate.hidden = false;
  root.classList.add('scrollgate');
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  skipButton.addEventListener('click', release); // nunca se queda bloqueado
  return { active: true };
}
