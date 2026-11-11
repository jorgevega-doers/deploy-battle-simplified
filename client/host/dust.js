// Polvo bajo los tanques al moverse y estela de color en el dash: cubitos que salen detrás del tanque, suben un poco y se
// encogen hasta desaparecer. Un único InstancedMesh con 48 cubos reutilizados (una llamada de dibujo, sin crear objetos por
// fotograma). La velocidad se mide con el movimiento dibujado de cada tanque entre fotogramas.
// Qué NO hace: no influye en la simulación (es solo decoración) ni se emite mientras los tanques están parados.
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';

const MAX = 48;
const LIFE_MS = 520;
const MIN_SPEED = 1.0;         // celdas por segundo a partir de las que levanta polvo
const DUST_EVERY_MS = 95;      // cada cuánto suelta un poco de polvo al andar
const TRAIL_EVERY_MS = 32;     // y cada cuánto una pieza de la estela al hacer dash
const DUST_COLOR = 0x8e9abd;   // gris azulado de la paleta de la interfaz
import { RING_COLORS as TRAIL_COLORS } from './playerColors.js'; // estela del color de cada jugador
const MAX_JUMP = 1.5;          // un salto mayor entre fotogramas es una recolocación (nueva ronda), no movimiento

export function createDust(scene) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
  scene.add(mesh);
  const dummy = new Object3D();
  const color = new Color();
  const born = new Float64Array(MAX).fill(-1e9);
  const px = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const last = Array.from({ length: 4 }, () => ({ x: 0, y: 0, ok: false, emitAt: 0 }));
  let lastNow = 0;
  let next = 0;

  function emit(x, z, hex, s, now) {
    born[next] = now; px[next] = x; pz[next] = z; size[next] = s;
    mesh.setColorAt(next, color.setHex(hex));
    mesh.instanceColor.needsUpdate = true;
    next = (next + 1) % MAX;
  }

  return {
    // state = estado interpolado de este fotograma; now en ms.
    update(state, now) {
      const dt = lastNow ? now - lastNow : 16;
      lastNow = now;
      for (let i = 0; i < state.tankCount; i++) {
        const t = state.tanks[i];
        const prev = last[i];
        if (t.lives <= 0 && state.tankCount > 2) { prev.ok = false; continue; } // bot eliminado
        if (prev.ok && dt > 0) {
          const dx = t.x - prev.x;
          const dy = t.y - prev.y;
          const dist = Math.hypot(dx, dy);
          const speed = (dist / dt) * 1000;
          const dashing = t.dashing === 1;
          if (dist < MAX_JUMP && speed > MIN_SPEED && now - prev.emitAt >= (dashing ? TRAIL_EVERY_MS : DUST_EVERY_MS)) {
            prev.emitAt = now;
            const back = dist > 0 ? -0.38 / dist : 0; // detrás del tanque
            const jitter = (Math.random() - 0.5) * 0.3;
            emit(t.x + dx * back + jitter, -(t.y + dy * back) + jitter, dashing ? TRAIL_COLORS[i] : DUST_COLOR, dashing ? 0.3 : 0.2, now);
          }
        }
        prev.x = t.x; prev.y = t.y; prev.ok = true;
      }
      let live = 0;
      for (let i = 0; i < MAX; i++) {
        const age = now - born[i];
        if (age < 0 || age >= LIFE_MS) { // hueco: se esconde con escala 0
          dummy.scale.setScalar(0);
        } else {
          const k = age / LIFE_MS;
          dummy.position.set(px[i], 0.12 + k * 0.3, pz[i]);
          dummy.scale.setScalar(size[i] * (1 - k * 0.85));
          live++;
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = live ? MAX : 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
    reset() {
      born.fill(-1e9);
      mesh.count = 0;
      for (const l of last) l.ok = false;
      lastNow = 0;
    },
  };
}
