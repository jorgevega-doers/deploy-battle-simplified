// Desintegración de un disparo que desaparece (por rebotes agotados o por tiempo): se deshace en bloquecitos que saltan un poco y
// se encogen, con un minidestello en el sitio. Un solo InstancedMesh con un pool fijo (sin crear objetos por fotograma). Sin sonido.
// Qué NO hace: no decide cuándo desaparece un disparo (eso lo dice el servidor con los eventos "impact" y "expire").
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';

const MAX = 96;
const PER_BURST = 9;
const LIFE_MS = 480;
const COLORS = [0xffffff, 0xc9b8d6, 0x8e9abd, 0xffd400];

export function createBulletBits(scene) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
  scene.add(mesh);
  const dummy = new Object3D();
  const color = new Color();
  const born = new Float64Array(MAX).fill(-1e9);
  const px = new Float32Array(MAX); const py = new Float32Array(MAX); const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX); const vy = new Float32Array(MAX); const vz = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  let next = 0;

  const put = (x, z, s, sx, sy, sz, hex, now) => {
    born[next] = now; px[next] = x; py[next] = 0.45; pz[next] = z; size[next] = s;
    vx[next] = sx; vy[next] = sy; vz[next] = sz;
    mesh.setColorAt(next, color.setHex(hex));
    next = (next + 1) % MAX;
  };

  return {
    // (x, y) en coordenadas del mundo; now en ms.
    burst(x, y, now) {
      put(x, -y, 0.34, 0, 0, 0, 0xffffff, now); // minidestello: un cubo blanco que se encoge enseguida
      for (let i = 0; i < PER_BURST; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.6;
        put(x + Math.cos(a) * 0.1, -y + Math.sin(a) * 0.1, 0.07 + Math.random() * 0.08, Math.cos(a) * speed, 1.2 + Math.random() * 1.2, Math.sin(a) * speed,
          COLORS[Math.floor(Math.random() * COLORS.length)], now);
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(now) {
      let live = 0;
      for (let i = 0; i < MAX; i++) {
        const age = now - born[i];
        if (age < 0 || age >= LIFE_MS) {
          dummy.scale.setScalar(0);
        } else {
          const t = age / 1000;
          const k = age / LIFE_MS;
          dummy.position.set(px[i] + vx[i] * t, Math.max(0.05, py[i] + vy[i] * t - 4.2 * t * t), pz[i] + vz[i] * t);
          dummy.scale.setScalar(size[i] * (1 - k * k));
          live++;
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = live ? MAX : 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
    reset() { born.fill(-1e9); mesh.count = 0; },
  };
}
