// Página del móvil (/home/): en el móvil o la tableta (sin ratón) no se juega; aquí solo el vídeo de una partida, el aviso de que se juega en el
// ordenador y los enlaces. En el ordenador lleva al juego (/).
import '../theme.css';
import { keepPixelImagesSharp } from '../pixelFit.js';
import { isTouchOnly } from '../touchOnly.js';

const $ = (id) => document.getElementById(id);
if (!isTouchOnly()) window.location.replace('/');
else {
  document.body.classList.add('mobile');
  // La página entera en la pantalla, sin desplazarse; si no cabe, se encoge toda por igual.
  const fitMobile = () => {
    const page = $('mobile-page');
    page.style.transform = 'none';
    const scale = Math.min(1, innerHeight / page.scrollHeight);
    page.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : 'none';
  };
  $('mobile-page').hidden = false;
  fitMobile();
  addEventListener('resize', fitMobile);
  addEventListener('orientationchange', () => setTimeout(fitMobile, 200));
  $('mobile-page').querySelector('video').addEventListener('loadedmetadata', fitMobile);
  keepPixelImagesSharp(); // logos de pixel art con píxeles enteros en cualquier móvil
}
