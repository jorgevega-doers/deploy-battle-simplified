// Detalles que dan ambiente sin afectar al juego: vapor que sale de los locales de comida y de las alcantarillas del suelo y pétalos
// de cerezo que caen de los árboles de los parques (nacen DENTRO de la copa y el viento se los lleva un poco). Cada cosa es un
// InstancedMesh con un número fijo de piezas que se reutilizan: cero objetos nuevos por fotograma y 2 llamadas de dibujo.
// Se ve en todos los niveles de calidad salvo el 3 (cuesta muy poco): lo que baja de nivel es el bloom, no esto.
import { InstancedMesh, BoxGeometry, MeshBasicMaterial, Object3D, Color } from 'three';
import { createRng } from '../../shared/art/rng.js';
import { MANHOLES } from '../../shared/art/paint/street.js';

const STEAM_TYPES = new Set(['ramen', 'izakaya', 'bathhouse']);
const PUFFS_PER_SOURCE = 7;
const STEAM_LIFE_MS = 2600;
const STEAM_COLOR = 0xe6ebff;
const PETALS_PER_TREE = 10;
const PETAL_COLORS = [0xffb3c4, 0xff8fb3, 0xffd0dc];
// La copa del cerezo (shared/city/interior.js, park): tronco en (centro + 0,25, norte - 0,75), flores entre 0,35 y 1,05 de
// altura y unos 0,45 de radio. Los pétalos nacen ahí dentro.
const CANOPY_RADIUS = 0.45;
const CANOPY_LOW = 0.5;
const CANOPY_HIGH = 1.0;

const dummy = new Object3D();
const rand = (rng, min, max) => min + rng() * (max - min);

// Altura de la azotea de un edificio y su centro, para soltar el vapor.
function roofOf(building) {
  const top = Math.max(...building.parts.filter((p) => p.kind === 'box').map((p) => p.z + p.h));
  return { x: building.rect.x + building.rect.w / 2, y: building.rect.y + building.rect.h / 2, z: Math.min(top, 1.7), size: 1 };
}

export function createAmbient(scene, arena, city, seed = 0xa3b1) {
  const rng = createRng(seed);

  // --- Vapor: de las azoteas de ramen e izakaya y de las rejillas de la calle ---
  const sources = city.buildings.filter((b) => STEAM_TYPES.has(b.type) || (b.type === 'shopRow' && b.rect.x === 12)).map(roofOf);
  for (const m of MANHOLES) if (m.steam && !arena.solid(Math.floor(m.x), Math.floor(m.y))) sources.push({ x: m.x, y: m.y, z: 0.02, size: 0.8 }); // del vapor de las alcantarillas pintadas en el suelo
  const steam = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: STEAM_COLOR, transparent: true, opacity: 0.55, depthWrite: false }), Math.max(1, sources.length * PUFFS_PER_SOURCE));
  steam.frustumCulled = false;
  steam.count = sources.length * PUFFS_PER_SOURCE;
  scene.add(steam);
  const puffBorn = Float64Array.from({ length: steam.count }, (_, i) => -rand(rng, 0, STEAM_LIFE_MS) - i);
  const puffPhase = Float32Array.from({ length: steam.count }, () => rng() * 6.28);

  // --- Pétalos: caen de la copa de cada cerezo y el viento los lleva hacia el este y el sur ---
  const trees = city.buildings.filter((b) => b.type === 'park').map((b) => ({ x: b.rect.x + b.rect.w / 2 + 0.25, y: b.rect.y + b.rect.h - 0.75 }));
  const total = Math.max(1, trees.length * PETALS_PER_TREE);
  const petals = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), total);
  petals.frustumCulled = false;
  petals.count = trees.length * PETALS_PER_TREE;
  petals.setColorAt(0, new Color(0xffffff));
  const tint = new Color();
  for (let i = 0; i < total; i++) petals.setColorAt(i, tint.setHex(PETAL_COLORS[i % PETAL_COLORS.length]));
  petals.instanceColor.needsUpdate = true;
  scene.add(petals);
  const petal = Array.from({ length: petals.count }, (_, i) => ({ tree: trees[Math.floor(i / PETALS_PER_TREE)], x: 0, y: 0, z: 0, vz: 0, wind: 0, born: -1e9, phase: rng() * 6.28, life: 0 }));
  function respawnPetal(p, now) {
    const angle = rng() * 6.28;
    const radius = Math.sqrt(rng()) * CANOPY_RADIUS; // dentro de la copa (reparto uniforme en el círculo)
    p.x = p.tree.x + Math.cos(angle) * radius;
    p.y = p.tree.y + Math.sin(angle) * radius;
    p.z = rand(rng, CANOPY_LOW, CANOPY_HIGH);
    p.vz = rand(rng, 0.18, 0.4);
    p.wind = rand(rng, 0.3, 0.9);
    p.born = now;
    p.life = rand(rng, 3500, 8000);
  }
  petal.forEach((p) => { respawnPetal(p, -rand(rng, 0, 6000)); });

  return {
    // Calidad baja (nivel 3): sin vapor ni pétalos.
    setLevel(level) { steam.visible = petals.visible = level < 3; },
    update(now) {
      // Vapor: cada bocanada sube, crece y se disuelve.
      for (let i = 0; i < steam.count; i++) {
        const src = sources[Math.floor(i / PUFFS_PER_SOURCE)];
        let age = now - puffBorn[i];
        if (age > STEAM_LIFE_MS) { puffBorn[i] = now; age = 0; }
        const k = Math.max(0, age) / STEAM_LIFE_MS;
        const size = (0.12 + 0.34 * k) * src.size * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        dummy.position.set(src.x + Math.sin(puffPhase[i] + k * 4) * 0.14, src.z + 0.1 + k * 1.15, -src.y);
        dummy.rotation.set(0, puffPhase[i], 0);
        dummy.scale.setScalar(Math.max(0, size));
        dummy.updateMatrix();
        steam.setMatrixAt(i, dummy.matrix);
      }
      steam.instanceMatrix.needsUpdate = true;

      // Pétalos: caen balanceándose y el viento los lleva hacia el este y un poco al sur.
      for (let i = 0; i < petals.count; i++) {
        const p = petal[i];
        const t = (now - p.born) / 1000;
        if (now - p.born > p.life || p.z - t * p.vz < 0.04) respawnPetal(p, now);
        const tt = (now - p.born) / 1000;
        dummy.position.set(p.x + tt * 0.4 * p.wind + Math.sin(tt * 2 + p.phase) * 0.08, p.z - tt * p.vz, -(p.y - tt * 0.12 * p.wind + Math.cos(tt * 1.7 + p.phase) * 0.06));
        dummy.rotation.set(tt * 3 + p.phase, tt * 2, 0);
        dummy.scale.setScalar(0.055);
        dummy.updateMatrix();
        petals.setMatrixAt(i, dummy.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
    },
  };
}
