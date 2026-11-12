// Imágenes de pixel art siempre nítidas: una imagen con data-px="N" se dibuja con N píxeles de PANTALLA FÍSICA por cada píxel suyo, en
// número entero, teniendo en cuenta la densidad del móvil (devicePixelRatio, p. ej. 2,75) y cualquier escala (transform) de sus contenedores.
// Si no, un logo a "x2" en un móvil de densidad 2,75 sale a 5,5 píxeles por píxel: unos píxeles de 5 y otros de 6, y se ve "raro".
// Qué NO hace: no toca imágenes sin data-px (las que se ven suavizadas a propósito).
export function fitPixelImages(root = document) {
  const dpr = window.devicePixelRatio || 1;
  for (const img of root.querySelectorAll('img[data-px]')) {
    if (!img.complete || !img.naturalHeight) {
      img.addEventListener('load', () => fitPixelImages(root), { once: true });
      continue;
    }
    const want = Number(img.dataset.px) || 1;
    const layout = img.offsetHeight;
    const rect = img.getBoundingClientRect();
    const zoom = layout && rect.height ? rect.height / layout : 1; // escala de los transform de los padres
    const n = Math.max(1, Math.round(want * zoom * dpr));       // píxeles físicos (enteros) por píxel de la imagen
    const height = (img.naturalHeight * n) / (zoom * dpr);
    if (Math.abs(height - layout) > 0.01) {
      img.style.height = `${height}px`;
      img.style.width = 'auto';
    }
  }
}

// Lo aplica ya, al cambiar el tamaño de la ventana o la orientación y cuando cargan las fuentes (que mueven el diseño).
export function keepPixelImagesSharp(root = document) {
  const run = () => fitPixelImages(root);
  run();
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  document.fonts?.ready.then(run);
  return run;
}
