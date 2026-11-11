// Logo de DEPLOY BATTLE en el lobby (izquierda de la tarjeta del QR): fija su tamaño en píxeles enteros y mantiene su animación en bucle.
// El bucle son 4 capas apiladas (el CSS está en lobby.css): humo que "hierve" (3 fotogramas), el rótulo, un destello diagonal que lo
// cruza de vez en cuando (solo sobre el relleno de las letras) y chispas cuadradas que saltan del borde superior (este módulo).
// Qué NO hace: la intro (logoIntro.js) ni el reparto del lobby (main.js: fitLobbyCard).
import { createSparks } from './logoSparks.js';

// Márgenes del lienzo de chispas alrededor del logo (en píxeles del logo): suben por encima de las letras.
const MARGIN = { left: 16, right: 16, top: 26, bottom: 14 };

export function createLobbyLogo({ $, isRunning, onReady = () => {} }) {
  const stack = $('logo-stack');
  const body = $('logo-body');
  const canvas = $('logo-sparks');
  const ctx = canvas.getContext('2d');
  const sparks = createSparks(40, 6);
  let natural = null;           // { w, h } del logo en píxeles
  let spawn = new Int16Array(0); // puntos de salida de las chispas (x, y): el borde superior de las letras
  let last = 0;
  let nextEmit = 0;
  let drawn = false; // si el lienzo tiene algo dibujado (para borrarlo solo cuando hace falta)

  // Busca los píxeles de las letras con aire encima: de ahí salen las chispas.
  function findSpawnPoints() {
    const probe = document.createElement('canvas');
    probe.width = natural.w; probe.height = natural.h;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(body, 0, 0);
    const data = pctx.getImageData(0, 0, natural.w, natural.h).data;
    const points = [];
    for (let y = 1; y < natural.h; y++) for (let x = 0; x < natural.w; x += 2) {
      const solid = data[(y * natural.w + x) * 4 + 3] > 200;
      const clearAbove = data[((y - 1) * natural.w + x) * 4 + 3] < 40;
      if (solid && clearAbove) points.push(x, y);
    }
    spawn = Int16Array.from(points);
  }

  function ready() {
    natural = { w: body.naturalWidth, h: body.naturalHeight };
    canvas.width = natural.w + MARGIN.left + MARGIN.right;
    canvas.height = natural.h + MARGIN.top + MARGIN.bottom;
    stack.style.aspectRatio = `${natural.w} / ${natural.h}`;
    try { findSpawnPoints(); } catch { /* sin chispas: el resto sigue */ }
    onReady();
  }
  if (body.complete && body.naturalWidth) queueMicrotask(ready); else body.addEventListener('load', ready); // asíncrono: onReady usa lo que crea quien nos llama

  return {
    get natural() { return natural; },
    // Cada píxel del logo ocupa `pixel` píxeles de pantalla (main.js lo elige entero tras escalar la fila).
    setPixel(pixel) {
      if (!natural) return;
      stack.style.width = `${natural.w * pixel}px`;
      stack.style.setProperty('--px', `${pixel}px`);
    },
    update(now) {
      if (!natural || !isRunning()) { last = 0; if (sparks.alive) { sparks.clear(); ctx.clearRect(0, 0, canvas.width, canvas.height); } return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (now >= nextEmit && spawn.length) {
        nextEmit = now + 120 + Math.random() * 260;
        const p = ((Math.random() * (spawn.length / 2)) | 0) * 2;
        const hot = Math.random() < 0.35; // algunas chispas salen más rápidas y claras
        sparks.emit(spawn[p] + MARGIN.left, spawn[p + 1] + MARGIN.top - 1, (Math.random() - 0.5) * 7, -(hot ? 20 : 11) - Math.random() * 7,
          0.55 + Math.random() * 0.5, hot ? 0 : 1 + ((Math.random() * 4) | 0), Math.random() < 0.2 ? 2 : 1);
      }
      sparks.step(dt);
      if (drawn || sparks.alive) { ctx.clearRect(0, 0, canvas.width, canvas.height); if (sparks.alive) sparks.draw(ctx); drawn = sparks.alive > 0; }
    },
  };
}
