// Fondo de la pantalla de título: la ciudad del juego en 3D con su vida (gente, coches, luces), sin partida, en un mapa
// al azar. Es la misma escena de la partida (scene.js + life.js), a 30 FPS como mucho. Sin WebGL 2 no hay fondo y la página sigue igual (fondo liso).
// Qué NO hace: no se conecta al servidor ni dibuja tanques.
import { createArena, MAPS } from '../../shared/arena.js';
import { createScene } from './scene.js';
import { createLife } from './life.js';

const FRAME_MS = 33;

export function createHomeBackground(canvas) {
  try {
    const probe = document.createElement('canvas').getContext('webgl2'); // three.js solo funciona con WebGL 2
    if (!probe) return null;
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const arena = createArena(Math.floor(Math.random() * MAPS.length));
    const sceneApi = createScene(canvas, arena, { bloom: true });
    const entry = sceneApi.setMap(arena);
    const life = createLife(entry.group, entry.arena, entry.city);
    life.setLevel(sceneApi.qualityLevel);
    let last = 0;
    return {
      update(now) {
        if (document.hidden || now - last < FRAME_MS) return;
        last = now;
        life.update(now, null); // sin partida: la gente pasea y los coches circulan
        sceneApi.render();
      },
      // Versión arcade: el título suelta su contexto WebGL antes de que la pantalla del juego cree el suyo (dos a la vez gastan memoria de vídeo).
      dispose() {
        try { sceneApi.renderer.dispose(); sceneApi.renderer.forceContextLoss(); } catch { /* da igual: la página sigue */ }
        canvas.hidden = true;
      },
    };
  } catch (err) {
    console.warn('Sin fondo 3D en el inicio:', err?.message);
    return null;
  }
}
