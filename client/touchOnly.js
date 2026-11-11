// ¿Es un móvil o una tableta sin ratón? (versión pública, 10-nov). Ahí el juego no se juega (se juega en el ordenador; el móvil es el mando):
// el inicio enseña solo el aviso y el vídeo, y las pantallas de partida mandan al inicio.
export function isTouchOnly() {
  try {
    return Boolean(window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches);
  } catch { return false; }
}
