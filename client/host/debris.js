// Trozos de un tanque destruido: 34 cubos (cascos del color del jugador, piezas oscuras y chispas de fuego) que salen
// volando, caen con gravedad y rebotan en el suelo. Un único InstancedMesh con color por pieza, que se reutiliza en cada
// explosión (sin crear objetos por fotograma). Lo usan el impacto normal (roundFx.js) y el KO (finale.js), que nunca coinciden.
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';

const PIECES = 34;
const SPARK_FROM = 20; // las piezas desde este índice son chispas (se encogen con el tiempo)
const GRAVITY = 15;
const FLOOR = 0.08;
import { DEBRIS_BODY as BODY } from './playerColors.js'; // cascos de cada jugador (claro y medio)
const DARK = [0x1a1f3a, 0x2c3756];
const FIRE = [0xffd400, 0xff9a00, 0xffffff];
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createDebris(scene) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), PIECES);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
  scene.add(mesh);
  const dummy = new Object3D();
  const color = new Color();
  const pos = new Float32Array(PIECES * 3);
  const vel = new Float32Array(PIECES * 3);
  const rot = new Float32Array(PIECES * 3);
  const spin = new Float32Array(PIECES * 3);
  const size = new Float32Array(PIECES);

  return {
    get visible() { return mesh.visible; },
    // Lanza los trozos desde (x, y) del mundo con los colores del jugador "slot" (1 o 2).
    explode(x, y, slot) {
      for (let i = 0; i < PIECES; i++) {
        const spark = i >= SPARK_FROM;
        const angle = rand(0, Math.PI * 2);
        const speed = spark ? rand(1.5, 6.5) : rand(0.8, 3.8);
        pos.set([x, 0.5, -y], i * 3);
        vel.set([Math.cos(angle) * speed, rand(spark ? 4 : 3, spark ? 10 : 7.5), -Math.sin(angle) * speed], i * 3);
        rot.set([0, 0, 0], i * 3);
        spin.set([rand(-9, 9), rand(-9, 9), rand(-9, 9)], i * 3);
        size[i] = spark ? rand(0.08, 0.17) : rand(0.17, 0.36);
        mesh.setColorAt(i, color.setHex(spark ? pick(FIRE) : i < 12 ? pick(BODY[slot - 1]) : pick(DARK)));
      }
      mesh.instanceColor.needsUpdate = true;
      mesh.visible = true;
    },
    // Avanza la física dtSec segundos (ya ralentizados por quien llama); ageMs = tiempo desde la explosión (encoge las chispas).
    step(dtSec, ageMs) {
      if (!mesh.visible) return;
      for (let i = 0; i < PIECES; i++) {
        const p = i * 3;
        vel[p + 1] -= GRAVITY * dtSec;
        for (let k = 0; k < 3; k++) { pos[p + k] += vel[p + k] * dtSec; rot[p + k] += spin[p + k] * dtSec; }
        if (pos[p + 1] < FLOOR) { // rebota en el suelo y pierde energía
          pos[p + 1] = FLOOR;
          vel[p + 1] *= -0.35;
          vel[p] *= 0.7;
          vel[p + 2] *= 0.7;
          for (let k = 0; k < 3; k++) spin[p + k] *= 0.6;
        }
        dummy.position.set(pos[p], pos[p + 1], pos[p + 2]);
        dummy.rotation.set(rot[p], rot[p + 1], rot[p + 2]);
        dummy.scale.setScalar(i >= SPARK_FROM ? size[i] * Math.max(0, 1 - ageMs / 3200) : size[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    hide() { mesh.visible = false; },
  };
}
