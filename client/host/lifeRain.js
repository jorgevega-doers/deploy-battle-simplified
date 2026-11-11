// Lluvia del mapa de la noche de lluvia (28-oct): gotas finas y alargadas que caen inclinadas por todo el escenario. Un solo
// InstancedMesh con un pool fijo (una llamada de dibujo, ningún objeto nuevo por fotograma). Es decoración: no afecta al juego.
// Qué NO hace: no moja nada ni sale en los otros mapas (el suelo mojado y los charcos van en shared/art/paint/street.js).
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { createRng } from '../../shared/art/rng.js';

const DROPS = 240;
const TOP = 7;          // altura desde la que caen
const WIND = 1.4;       // empuje lateral (hacia el este)
const SLANT = Math.atan2(WIND, 12); // inclinación de cada gota
const dummy = new Object3D();

export function createRain(scene, arena, seed = 0x7a1) {
  const rng = createRng(seed);
  const mesh = new InstancedMesh(new BoxGeometry(0.03, 0.55, 0.03), new MeshBasicMaterial({ color: 0xb4c8ff, transparent: true, opacity: 0.58, depthWrite: false }), DROPS);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const x = new Float32Array(DROPS); const y = new Float32Array(DROPS); const z = new Float32Array(DROPS); const speed = new Float32Array(DROPS);
  const respawn = (i, high) => {
    x[i] = -3 + rng() * (arena.width + 6);
    y[i] = -3 + rng() * (arena.height + 6);
    z[i] = high ? TOP * (0.5 + rng() * 0.5) : rng() * TOP;
    speed[i] = 11 + rng() * 5;
  };
  for (let i = 0; i < DROPS; i++) respawn(i, false);
  let last = 0;
  let count = DROPS;

  return {
    count: DROPS,
    update(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      mesh.count = count;
      for (let i = 0; i < count; i++) {
        z[i] -= speed[i] * dt;
        x[i] += WIND * dt;
        if (z[i] < 0.03) respawn(i, true);
        dummy.position.set(x[i], z[i], -y[i]);
        dummy.rotation.set(0, 0, SLANT);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    // Nivel de calidad del host: el más bajo deja menos gotas.
    setLevel(level) { count = level >= 3 ? Math.floor(DROPS * 0.55) : DROPS; },
  };
}
