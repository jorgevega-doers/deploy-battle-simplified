// Ventanas con vida: encima de unas ~110 ventanas de la ciudad (elegidas con una semilla fija) se ponen capas planas del
// tamaño exacto de la ventana, en UN solo InstancedMesh (una llamada de dibujo). Cuatro tipos: televisión (parpadea en
// azules y rosas), ventana encendida que se apaga un rato, ventana apagada que se enciende, y siluetas de gente que pasa
// por detrás de una ventana encendida. La ciudad sigue siendo una sola malla: no se repinta nada.
// Cómo se sabe dónde está cada ventana: windowPane (shared/art/paint/common.js) las anota al pintar el atlas y aquí se
// pasan de píxeles del atlas a coordenadas del mundo con la cara a la que pertenecen.
import { InstancedMesh, PlaneGeometry, MeshBasicMaterial, Object3D, Color } from 'three';
import { createRng, int } from '../../shared/art/rng.js';
import { CITY_SEED } from '../../shared/city/index.js';
import { toColor } from './cityMesh.js';
import { PAL } from '../../shared/art/palette.js';

const SHADE = { south: 0.9, east: 0.74, west: 0.74 }; // el mismo sombreado fijo por cara que usa cityMesh.js
const EPS = 0.012;                                    // las capas flotan un pelo por delante de la pared
const COUNTS = { tv: 14, off: 12, on: 8, shadow: 10 }; // extras al azar, además de una animada por edificio
const TV_COLORS = [0x6fb4ff, 0xbfe6ff, 0xff6fa8, 0x3a4fd0, 0xd3dcff];
const DARK = 0x0d1020;
const SILHOUETTE = 0x120c1c;

// Rectángulo de una ventana en el mundo (centro, ancho, alto y giro de la cara), o null si la cara no es una pared recta.
export function windowToWorld(face, rect, win) {
  const { part } = face;
  if (part.kind !== 'box') return null;
  const u = ((win.x + win.w / 2) - rect.x) / rect.w;
  const v = ((win.y + win.h / 2) - rect.y) / rect.h;
  const zc = part.z + part.h * (1 - v);
  const h = (win.h / rect.h) * part.h;
  if (face.face === 'south') return { x: part.x + u * part.w, y: part.y - EPS, z: zc, ry: 0, w: (win.w / rect.w) * part.w, h };
  if (face.face === 'east') return { x: part.x + part.w + EPS, y: part.y + u * part.d, z: zc, ry: Math.PI / 2, w: (win.w / rect.w) * part.d, h };
  if (face.face === 'west') return { x: part.x - EPS, y: part.y + (1 - u) * part.d, z: zc, ry: -Math.PI / 2, w: (win.w / rect.w) * part.d, h };
  return null;
}

const MAX_PANE = { w: 6, h: 9 }; // los cristales más grandes (escaparates) se dejan como están: tapados con una capa lisa parecen un cartel apagado

export function createWindowLife(scene, { faceList, regions, windows, city }) {
  const rng = createRng(CITY_SEED + 77);
  // Piezas de los edificios de dentro de la arena (llevan más movimiento: son lo que más se ve de cerca).
  const interiorParts = new Set(city.buildings.filter((b) => b.rect).flatMap((b) => b.parts));
  // Ventanas por cara visible (cada clave del atlas puede estar en varias caras: se usan todas).
  const byKey = new Map();
  for (const w of windows) {
    if (w.w < 2 || w.h < 2 || w.w > MAX_PANE.w || w.h > MAX_PANE.h) continue;
    if (!byKey.has(w.key)) byKey.set(w.key, []);
    byKey.get(w.key).push(w);
  }
  let lit = [];
  let dark = [];
  const byPart = new Map(); // edificio (pieza) -> sus ventanas, para que ninguno se quede sin movimiento
  for (const face of faceList) {
    if (!SHADE[face.face]) continue;
    const rect = regions.get(face.key);
    for (const win of byKey.get(face.key) ?? []) {
      const world = windowToWorld(face, rect, win);
      if (!world) continue;
      const entry = { ...world, shade: SHADE[face.face], used: false };
      (win.lit ? lit : dark).push(entry);
      if (!byPart.has(face.part)) byPart.set(face.part, { lit: [], dark: [] });
      byPart.get(face.part)[win.lit ? 'lit' : 'dark'].push(entry);
    }
  }
  const take = (list, n) => { // n ventanas al azar sin repetir
    const out = [];
    for (let i = 0; i < n && list.length; i++) out.push(list.splice(int(rng, 0, list.length - 1), 1)[0]);
    return out;
  };
  // 1) Reparto por edificio: cada pieza con ventanas lleva al menos una animada (dos si tiene muchas), alternando los tipos.
  const items = [];
  const CYCLE = ['tv', 'shadow', 'off', 'on'];
  let turn = 0;
  for (const [part, group] of byPart) {
    // Los de dentro de la arena llevan al menos 3 ventanas animadas; los del fondo, una por cada ~14 ventanas (entre 1 y 6).
    const total = group.lit.length + group.dark.length;
    const picks = interiorParts.has(part) ? Math.min(8, Math.max(3, Math.round(total / 6))) : Math.min(6, Math.max(1, Math.round(total / 14)));
    for (let n = 0; n < picks; n++) {
      let kind = CYCLE[turn++ % CYCLE.length];
      const pool = kind === 'on' ? group.dark : group.lit;
      const options = pool.filter((w) => !w.used);
      let choice = options[int(rng, 0, Math.max(0, options.length - 1))];
      if (!choice) { // sin ventana del tipo pedido: coge lo que haya (una apagada se enciende, una encendida se apaga)
        const fallback = [...group.lit, ...group.dark].filter((w) => !w.used);
        choice = fallback[int(rng, 0, Math.max(0, fallback.length - 1))];
        if (!choice) continue;
        kind = group.dark.includes(choice) ? 'on' : 'off';
      }
      choice.used = true;
      items.push({ kind, ...choice });
    }
  }
  lit = lit.filter((w) => !w.used);
  dark = dark.filter((w) => !w.used);
  // 2) El resto, al azar por toda la ciudad. Las siluetas se dibujan sobre ventanas encendidas.
  items.push(
    ...take(lit, COUNTS.tv).map((w) => ({ kind: 'tv', ...w })),
    ...take(lit, COUNTS.off).map((w) => ({ kind: 'off', ...w })),
    ...take(dark, COUNTS.on).map((w) => ({ kind: 'on', ...w })),
    ...take(lit, COUNTS.shadow).map((w) => ({ kind: 'shadow', ...w })),
  );
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff }), Math.max(1, items.length));
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
  scene.add(mesh);

  const dummy = new Object3D();
  const color = new Color();
  const warm = toColor(PAL.amber[2]);
  const state = items.map((item, i) => ({ visible: item.kind === 'shadow' || item.kind === 'tv', nextAt: rng() * 3000 + i * 7, step: 0 }));
  let enabled = true;
  let colorsDirty = true;

  function place(i, scaleX = 1, offsetU = 0, visible = state[i].visible) {
    const it = items[i];
    // Desplazamiento a lo largo de la cara (para las siluetas): en el eje X del mundo (sur) o Y (este y oeste).
    const along = offsetU * it.w;
    const wx = it.ry === 0 ? it.x + along : it.x;
    const wy = it.ry === 0 ? it.y : it.y + (it.ry > 0 ? along : -along);
    dummy.position.set(wx, it.z, -wy);
    dummy.rotation.set(0, it.ry, 0);
    dummy.scale.set(visible ? it.w * scaleX : 0, visible ? it.h : 0, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  function paint(i, hex, shade = items[i].shade) {
    color.setHex(hex).multiplyScalar(shade);
    mesh.setColorAt(i, color);
    colorsDirty = true;
  }
  items.forEach((it, i) => {
    if (it.kind === 'on') mesh.setColorAt(i, color.copy(warm).multiplyScalar(it.shade));
    else if (it.kind === 'off') paint(i, DARK);
    else if (it.kind === 'tv') paint(i, TV_COLORS[0]);
    else paint(i, SILHOUETTE, 1);
    place(i);
  });
  mesh.instanceMatrix.needsUpdate = true;

  return {
    count: items.length,
    setEnabled(on) { enabled = on; mesh.visible = on; },
    update(now) {
      if (!enabled) return;
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const s = state[i];
        if (it.kind === 'shadow') { // la silueta cruza la ventana y desaparece un rato
          const present = (Math.floor(now / 1000 + i * 3.7) % 9) < 4;
          const u = Math.sin(now * 0.0007 + i) * 0.28;
          place(i, 0.28, u, present);
          moved = true;
        } else if (now >= s.nextAt) {
          if (it.kind === 'tv') {
            s.step = (s.step + 1 + int(rng, 0, 3)) % TV_COLORS.length;
            s.visible = rng() > 0.08; // de vez en cuando la tele se queda un instante a oscuras
            paint(i, TV_COLORS[s.step]);
            s.nextAt = now + 90 + rng() * 220;
          } else { // off: se apaga y vuelve a encenderse; on: se enciende y se apaga
            s.visible = !s.visible;
            s.nextAt = now + (s.visible ? 3000 + rng() * 9000 : 5000 + rng() * 14000);
          }
          place(i);
          moved = true;
        }
      }
      if (moved) mesh.instanceMatrix.needsUpdate = true;
      if (colorsDirty) { mesh.instanceColor.needsUpdate = true; colorsDirty = false; }
    },
  };
}
