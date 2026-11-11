// Vida en las azoteas del interior: FIESTAS (pista de baile de baldosas que cambian de color, luces de colores, altavoces y
// personas bailando con los brazos en alto) y BARBACOAS (parrilla con brasas que parpadean, humo, una mesa y dos personas junto a la parrilla). Todo son cajas en un InstancedMesh
// (props) más las figuras de lifeBodies.js y unas bocanadas de humo: 3 llamadas de dibujo, cero objetos nuevos por fotograma.
// Cuántas y en qué edificio las decide cada mapa (ROOF_LIFE en shared/city/interior.js). Qué NO hace: no tiene colisiones ni reacciona al juego: las azoteas están muy por encima de la acción.
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';
import { createRng } from '../../shared/art/rng.js';
import { createBodies } from './lifeBodies.js';

// Dónde van: el edificio por la esquina de su rectángulo (shared/city/interior.js, ASSIGNMENT) y el punto libre de su azotea
// (los depósitos, antenas y aparatos de aire están en los bordes del tejado; el centro-sur queda libre).
const FLOOR_COLORS = [0xff0080, 0x00f0ff]; // pocos colores y alternos: la fiesta no debe saturar
const LIGHT_COLORS = [0xff0080, 0x00f0ff, 0xffd400];
const EMBERS = [0xff4a00, 0xff9a00, 0xffd400];
const SMOKE = 6;
const SMOKE_LIFE_MS = 2800;

const dummy = new Object3D();
const color = new Color();
const pose = { walk: 0, phase: 0, time: 0, lift: 0, armsUp: 0, visible: true };

function roofTop(building) {
  return Math.max(...building.parts.filter((p) => p.kind === 'box').map((p) => p.z + p.h));
}

export function createRoofParty(scene, city, seed = 0xfe57) {
  const rng = createRng(seed);
  // Cada mapa trae sus fiestas y barbacoas (city.roofLife, de shared/city/interior.js): pueden ser una de cada, dos barbacoas...
  const find = (at) => city.buildings.find((b) => b.rect && b.rect.x === at.key[0] && b.rect.y === at.key[1]);
  const spotOf = (at) => { const b = find(at); return b && { x: b.rect.x + b.rect.w * at.fx, y: b.rect.y + b.rect.h * at.fy, z: roofTop(b) }; };
  const parties = (city.roofLife ?? []).filter((at) => at.kind === 'party').map(spotOf).filter(Boolean);
  const bbqs = (city.roofLife ?? []).filter((at) => at.kind === 'bbq').map(spotOf).filter(Boolean);

  // --- Props: [x, z (a lo largo del eje y del mundo), alto sobre el tejado, ancho, alto, fondo, color, tipo] ---
  const props = [];
  const add = (origin, dx, dy, dz, sx, sy, sz, hex, kind) => props.push({ x: origin.x + dx, y: origin.y + dy, z: origin.z + dz, sx, sy, sz, hex, kind });
  for (const party of parties) {
    // Pista pequeña (2 x 2 baldosas: solo bailan dos) y tranquila: dos colores que se alternan; un foco a cada lado.
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) add(party, (i - 0.5) * 0.19, (j - 0.5) * 0.19, 0.012, 0.18, 0.02, 0.18, FLOOR_COLORS[(i + j) % FLOOR_COLORS.length], 'floor');
    add(party, -0.5, 0.0, 0.12, 0.12, 0.22, 0.1, 0x1a1426, 'solid');         // altavoces
    add(party, 0.5, 0.0, 0.12, 0.12, 0.22, 0.1, 0x1a1426, 'solid');
    for (const dx of [-0.5, 0.5]) add(party, dx, -0.3, 0.3, 0.06, 0.06, 0.06, LIGHT_COLORS[0], 'light'); // focos de colores
    add(party, 0.62, 0.78, 0.07, 0.3, 0.14, 0.14, 0x8d5a3b, 'solid');         // mesa de bebidas
    add(party, 0.58, 0.78, 0.17, 0.06, 0.07, 0.06, 0x00f0ff, 'solid');
  }
  for (const bbq of bbqs) {
    add(bbq, 0, 0, 0.1, 0.32, 0.12, 0.2, 0x2c3756, 'solid');                   // parrilla
    for (let k = 0; k < 3; k++) add(bbq, (k - 1) * 0.09, 0, 0.17, 0.06, 0.03, 0.06, EMBERS[k], 'ember');
    add(bbq, 0.55, 0.15, 0.1, 0.3, 0.2, 0.2, 0x8d5a3b, 'solid');               // mesa
    add(bbq, 0.5, 0.15, 0.22, 0.07, 0.06, 0.07, 0xff4fa3, 'solid');            // cosas encima de la mesa
    add(bbq, 0.62, 0.15, 0.22, 0.07, 0.06, 0.07, 0xffd400, 'solid');
    add(bbq, -0.55, 0.1, 0.07, 0.2, 0.14, 0.14, 0x3a4fd0, 'solid');            // nevera
  }
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), Math.max(1, props.length));
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color(0xffffff));
  scene.add(mesh);
  props.forEach((p, i) => mesh.setColorAt(i, color.setHex(p.hex)));
  mesh.instanceColor.needsUpdate = true;
  props.forEach((p, i) => { // las matrices no cambian: se escriben una vez
    dummy.position.set(p.x, p.z, -p.y);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;

  // --- Personas: 3 bailando en la fiesta y 2 junto a la parrilla ---
  const people = [];
  for (const party of parties) {
    // Solo dos personas bailan en la pista; las demás son invitados repartidos por la azotea, mirando a la pista (lejos de
    // los depósitos y aparatos del tejado): unos charlan, uno anima con los brazos y otro se balancea al ritmo.
    people.push({ at: party, dx: -0.09, dy: 0.0, role: 'dance', phase: rng() * 6, heading: rng() * 6 });
    people.push({ at: party, dx: 0.1, dy: 0.04, role: 'dance', phase: rng() * 6, heading: rng() * 6 });
    const guests = [[-0.55, -0.45, 'chat'], [0.65, -0.4, 'cheer'], [-0.55, 0.75, 'sway'], [0.6, 0.7, 'chat']];
    for (const [dx, dy, role] of guests) people.push({ at: party, dx, dy, role, phase: rng() * 6, heading: Math.atan2(-dy, -dx) });
  }
  for (const bbq of bbqs) {
    people.push({ at: bbq, dx: -0.15, dy: 0.28, role: 'grill', phase: rng() * 6, heading: -Math.PI / 2 }); // frente a la parrilla (mira al norte del tejado)
    people.push({ at: bbq, dx: 0.3, dy: 0.0, role: 'chat', phase: rng() * 6, heading: Math.PI });
  }
  const bodies = createBodies(scene, people.map(() => ({ rig: 'person', scale: 1.3 })), rng);
  for (const q of people) q.goneAt = 0; // pánico (easter egg de TNI, sección 88): se esconden en la escalera y la fiesta queda vacía

  // --- Humo de la barbacoa ---
  const smoke = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0x8e9abd, transparent: true, opacity: 0.5, depthWrite: false }), Math.max(1, SMOKE * bbqs.length));
  smoke.frustumCulled = false;
  smoke.count = SMOKE * bbqs.length;
  scene.add(smoke);
  const puffBorn = Float64Array.from({ length: Math.max(1, SMOKE * bbqs.length) }, (_, i) => -(i % SMOKE) * (SMOKE_LIFE_MS / SMOKE) - Math.floor(i / SMOKE) * 300);

  const lights = props.map((p, i) => i).filter((i) => props[i].kind === 'light' || props[i].kind === 'floor' || props[i].kind === 'ember');
  let lastStep = -1;

  return {
    count: people.length,
    update(now) {
      // Colores de baldosas, focos y brasas: cambian unas 4 veces por segundo (la fiesta, tranquila).
      const step = Math.floor(now / 250);
      if (step !== lastStep) {
        lastStep = step;
        for (const i of lights) {
          const p = props[i];
          const palette = p.kind === 'floor' ? FLOOR_COLORS : p.kind === 'light' ? LIGHT_COLORS : EMBERS;
          const offset = p.kind === 'ember' ? Math.floor(rng() * palette.length) : step + i * (p.kind === 'floor' ? 1 : 2);
          mesh.setColorAt(i, color.setHex(palette[((offset % palette.length) + palette.length) % palette.length]));
        }
        mesh.instanceColor.needsUpdate = true;
      }
      // Personas: los que bailan botan y agitan los brazos; el de la parrilla se mueve un poco; el otro charla.
      for (let i = 0; i < people.length; i++) {
        const q = people[i];
        const t = now * 0.001;
        pose.time = now;
        pose.lift = q.at.z;
        pose.visible = !(q.goneAt && now >= q.goneAt);
        if (q.goneAt && now < q.goneAt) { // pánico: brazos arriba y a correr en el sitio hasta irse
          pose.walk = 1.8; pose.phase = t * 16 + q.phase; pose.armsUp = 1;
          bodies.pose(i, q.at.x + q.dx, q.at.y + q.dy, q.heading, pose);
          continue;
        }
        if (q.role === 'dance') {
          pose.walk = 1.1; pose.phase = t * 9 + q.phase; pose.armsUp = 0.9;
          bodies.pose(i, q.at.x + q.dx, q.at.y + q.dy, q.heading + Math.sin(t * 1.3 + q.phase) * 0.7, pose);
        } else {
          pose.walk = q.role === 'grill' ? 0.25 : q.role === 'sway' ? 0.4 : 0;
          pose.phase = t * (q.role === 'sway' ? 5 : 3) + q.phase;
          pose.armsUp = q.role === 'chat' ? 0.4 + 0.3 * Math.sin(t * 2.2 + q.phase) : q.role === 'cheer' ? 0.5 + 0.5 * Math.sin(t * 3 + q.phase) : 0;
          bodies.pose(i, q.at.x + q.dx, q.at.y + q.dy, q.heading, pose);
        }
      }
      bodies.commit();
      // Humo: sube desde la parrilla, se ensancha y se desvanece.
      for (let b = 0; b < bbqs.length; b++) {
        const bbq = bbqs[b];
        for (let j = 0; j < SMOKE; j++) {
          const i = b * SMOKE + j;
          let age = now - puffBorn[i];
          if (age > SMOKE_LIFE_MS) { puffBorn[i] = now; age = 0; }
          const k = Math.max(0, age) / SMOKE_LIFE_MS;
          dummy.position.set(bbq.x + Math.sin(j * 2 + k * 3) * 0.08 + k * 0.15, bbq.z + 0.22 + k * 0.95, -bbq.y);
          dummy.rotation.set(0, j, 0);
          dummy.scale.setScalar(Math.max(0, (0.08 + 0.2 * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1)));
          dummy.updateMatrix();
          smoke.setMatrixAt(i, dummy.matrix);
        }
      }
      if (bbqs.length) smoke.instanceMatrix.needsUpdate = true;
    },
    // Posiciones de la fiesta y la barbacoa (para depurar y probar).
    spots() { return { party: parties[0], bbq: bbqs[0], parties, bbqs }; },
    panic(now) { for (const q of people) if (!q.goneAt) q.goneAt = now + 400 + rng() * 1200; },
    calm() { for (const q of people) q.goneAt = 0; },
  };
}
