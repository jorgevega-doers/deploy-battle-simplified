// Panel de rendimiento que se enseña/oculta con F3: FPS, tiempo de fotograma,
// llamadas de dibujo, triángulos, ping y estado de la conexión. Sirve para comprobar el presupuesto en un equipo real.
const SAMPLES = 120;      // fotogramas que se miran para la media
const REFRESH_MS = 250;   // cada cuánto se reescribe el texto

export function createDebugPanel(element, renderer) {
  const frameTimes = new Float32Array(SAMPLES);
  let filled = 0;
  let cursor = 0;
  let lastFrameAt = 0;
  let lastRefreshAt = 0;
  let snapshots = 0;
  let snapshotsPerSecond = 0;
  let lastSnapshotWindow = 0;
  const extra = { ping: '-', state: '-', connected: '-', status: '-', quality: '-' };

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'F3' || element.dataset.locked) return; // en las salas online el panel es del modo dev
    event.preventDefault();
    element.hidden = !element.hidden;
  });

  function refresh(now) {
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < filled; i++) { sum += frameTimes[i]; if (frameTimes[i] > worst) worst = frameTimes[i]; }
    const average = filled ? sum / filled : 0;
    const info = renderer ? renderer.info.render : { calls: 0, triangles: 0 };
    element.textContent = [
      `FPS ${average ? Math.round(1000 / average) : '-'} · fotograma ${average.toFixed(1)} ms (peor ${worst.toFixed(1)} ms)`,
      `Dibujo: ${info.calls} llamadas · ${info.triangles} triángulos · calidad ${extra.quality}`,
      `Ping ${extra.ping} ms · estados ${snapshotsPerSecond}/s`,
      `Conexión ${extra.status} · estado ${extra.state} · mandos ${extra.connected}`,
      'F3 para ocultar',
    ].join('\n');
    lastRefreshAt = now;
  }

  return {
    // Llamar una vez por fotograma con la marca de tiempo de requestAnimationFrame.
    frame(now) {
      if (lastFrameAt) {
        frameTimes[cursor] = now - lastFrameAt;
        cursor = (cursor + 1) % SAMPLES;
        if (filled < SAMPLES) filled++;
      }
      lastFrameAt = now;
      if (now - lastSnapshotWindow >= 1000) {
        snapshotsPerSecond = snapshots;
        snapshots = 0;
        lastSnapshotWindow = now;
      }
      if (!element.hidden && now - lastRefreshAt >= REFRESH_MS) refresh(now);
    },
    countSnapshot() { snapshots++; },
    // FPS medios de los últimos fotogramas (0 si aún no hay datos).
    fps() {
      let sum = 0;
      for (let i = 0; i < filled; i++) sum += frameTimes[i];
      return filled && sum ? Math.round((1000 * filled) / sum) : 0;
    },
    set(values) { Object.assign(extra, values); },
  };
}
