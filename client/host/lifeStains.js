// Manchas rojas de píxeles en el suelo donde un tanque ha pisado a alguien: tres cuadraditos planos (la mancha y dos salpicaduras)
// que se quedan 5 s y desaparecen encogiéndose a saltos el último segundo. Un único InstancedMesh con un máximo de 12 manchas
// que se reutilizan (la más antigua se pisa si hay más). Qué NO hace: no decide quién muere (lo hace lifeCrowd.js).
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';

const MAX = 12;
const LIFE_MS = 5000;
const SHRINK_MS = 900;
// Cada mancha: [desplazamiento x, desplazamiento z, ancho, fondo, color] de sus tres cuadrados.
const SPLAT = [[0, 0, 0.34, 0.26, 0xa8102a], [0.2, 0.08, 0.14, 0.12, 0x70081c], [-0.18, -0.12, 0.12, 0.1, 0xd01c3c]];

export function createStains(scene) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), MAX * SPLAT.length);
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color(0xffffff));
  const tint = new Color();
  for (let i = 0; i < MAX; i++) SPLAT.forEach(([, , , , hex], k) => mesh.setColorAt(i * SPLAT.length + k, tint.setHex(hex)));
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  const dummy = new Object3D();
  const born = new Float64Array(MAX).fill(-1e9);
  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const turn = new Float32Array(MAX);
  const size = new Float32Array(MAX).fill(1);
  let next = 0;
  let live = 0;

  return {
    // Mancha en (x, y) del mundo; size: 1 = persona, menos = animal.
    add(x, y, now, scale = 1) {
      born[next] = now; px[next] = x; py[next] = y; turn[next] = Math.random() * Math.PI; size[next] = scale;
      next = (next + 1) % MAX;
    },
    update(now) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        const age = now - born[i];
        const alive = age >= 0 && age < LIFE_MS;
        if (alive) any = true;
        const k = !alive ? 0 : age > LIFE_MS - SHRINK_MS ? Math.round((1 - (age - (LIFE_MS - SHRINK_MS)) / SHRINK_MS) * 4) / 4 : 1; // se encoge a saltos
        for (let s = 0; s < SPLAT.length; s++) {
          const [ox, oz, w, d] = SPLAT[s];
          const c = Math.cos(turn[i]);
          const sn = Math.sin(turn[i]);
          dummy.position.set(px[i] + (ox * c - oz * sn) * size[i], 0.014 + s * 0.002, -py[i] + (ox * sn + oz * c) * size[i]);
          dummy.rotation.set(0, turn[i], 0);
          dummy.scale.set(w * size[i] * k, 0.01, d * size[i] * k);
          dummy.updateMatrix();
          mesh.setMatrixAt(i * SPLAT.length + s, dummy.matrix);
        }
      }
      if (any || live) mesh.instanceMatrix.needsUpdate = true;
      live = any ? 1 : 0;
    },
    reset() { born.fill(-1e9); live = 1; },
  };
}
