// Cuerpos de la gente, los animales y los coches: un único InstancedMesh con las cajas de todos los individuos (una llamada de
// dibujo). Se crea una vez con el color de cada pieza y, en cada fotograma, solo se recalculan las matrices de posición.
// Sin crear objetos por fotograma. Qué NO hace: no decide a dónde va nadie (eso lo hacen lifeCrowd.js y lifeVehicles.js).
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';
import { RIGS, PALETTES, COLOR_SOURCE } from './lifeRigs.js';

const LEG_SWING = 0.05;   // cuánto se balancea una pierna al andar (celdas)
const WAG = 0.04;         // cuánto se mueve de lado la cola

// defs: [{ rig: 'person' | 'cat' | ..., scale }]. rng: números al azar con semilla (elige los colores de cada uno).
export function createBodies(scene, defs, rng) {
  const entities = [];
  let total = 0;
  for (const def of defs) {
    const parts = RIGS[def.rig];
    const palette = {};
    for (const [key, list] of Object.entries(COLOR_SOURCE[def.rig])) palette[key] = PALETTES[list][Math.floor(rng() * PALETTES[list].length)];
    entities.push({ ...def, parts, palette, first: total });
    total += parts.length;
  }
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), Math.max(1, total));
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
  const color = new Color();
  for (const e of entities) e.parts.forEach((part, i) => mesh.setColorAt(e.first + i, color.setHex(e.palette[part.c])));
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  const dummy = new Object3D();

  return {
    mesh,
    count: entities.length,
    // Solo se dibujan los n primeros individuos (calidad baja).
    setActive(n) { mesh.count = n >= entities.length ? total : (entities[n]?.first ?? total); },
    // Coloca al individuo i en el mundo (x, y) mirando a "heading"; walk (0-1) = cuánto anda, phase = fase del paso,
    // time = reloj (cola), lift = altura extra, visible = false lo esconde (escala 0).
    // "opts" es un objeto que quien llama reutiliza en cada fotograma (así no se crea basura): { walk, phase, time, lift,
    // visible, grow, armsUp }, todos opcionales. armsUp (0-1): cuánto tiene los brazos levantados (huyendo).
    pose(i, x, y, heading, opts) {
      const walk = opts.walk ?? 0;
      const phase = opts.phase ?? 0;
      const time = opts.time ?? 0;
      const lift = opts.lift ?? 0;
      const visible = opts.visible ?? true;
      const grow = opts.grow ?? 1;
      const armsUp = opts.armsUp ?? 0;
      const e = entities[i];
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const k = visible ? e.scale * grow : 0;
      const swing = Math.sin(phase) * LEG_SWING * walk;
      const bob = Math.abs(Math.sin(phase)) * 0.012 * walk;
      for (let p = 0; p < e.parts.length; p++) {
        const part = e.parts[p];
        let ox = part.o[0] + (part.leg ? swing * part.leg : 0);
        let oy = part.o[1] + bob;
        let oz = part.o[2] + (part.wag ? Math.sin(time * 0.012) * WAG : 0);
        if (part.arm) { // brazo: de colgar y balancearse a ir arriba (por encima de la cabeza), moviéndose de pánico
          ox += part.arm * (-swing) * (1 - armsUp) + Math.sin(time * 0.03 + part.arm * 1.7) * 0.03 * armsUp;
          oy += armsUp * 0.15;
          oz += part.arm * 0.015 * armsUp;
        }
        ox *= e.scale;
        oy = oy * e.scale + lift;
        oz *= e.scale;
        dummy.position.set(x + ox * cos + oz * sin, oy, -y - ox * sin + oz * cos);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(part.s[0] * k, part.s[1] * k, part.s[2] * k);
        dummy.updateMatrix();
        mesh.setMatrixAt(e.first + p, dummy.matrix);
      }
    },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
  };
}
