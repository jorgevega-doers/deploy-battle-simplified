// Animación al recoger un power-up: un halo de anillos y chispas del color del power-up rodea al tanque durante 2 s, y su
// icono vuela del tanque a la ficha del jugador (que "salta" al llegar; eso lo pinta main.js con las clases CSS del chip).
// Qué NO hace: no decide qué power-up se recoge ni su duración (lo manda el servidor en powerup_pick y en state_update).
import { Group, Mesh, MeshBasicMaterial, RingGeometry, BoxGeometry } from 'three';

export const HALO_MS = 2000;
export const FLY_MS = 700; // lo que tarda el icono en llegar a la ficha; los chips de main.js esperan lo mismo
const COLORS = { double: 0xffd400, speed: 0x00f0ff, aoe: 0xff9a00, shield: 0x5be38f };
const SPARKS = 4;

// icons: { double, speed, aoe } con el SVG de píxeles de cada power-up (HTML); cardTarget(slot) -> { x, y } en pantalla.
export function createPickupFx(scene, { entities, icons, cardTarget }) {
  const ringGeometry = new RingGeometry(0.6, 0.74, 8, 1, Math.PI / 8);
  const sparkGeometry = new BoxGeometry(0.11, 0.11, 0.11);
  const halos = [0, 1, 2, 3].map(() => {
    const group = new Group();
    const make = (geometry) => {
      const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      group.add(mesh);
      return mesh;
    };
    const wave = make(ringGeometry);   // anillo que se expande y se desvanece, varias veces
    const steady = make(ringGeometry); // anillo fijo que gira a saltos
    wave.rotation.x = steady.rotation.x = -Math.PI / 2;
    const sparks = Array.from({ length: SPARKS }, () => make(sparkGeometry));
    group.visible = false;
    scene.add(group);
    return { group, wave, steady, sparks, start: -1e9, hex: 0xffffff };
  });
  const point = { x: 0, y: 0 };

  function fly(slot, kind) {
    const svg = icons[kind];
    if (!svg) return;
    const el = document.createElement('div');
    el.className = `fly-icon fx-${kind}`;
    el.innerHTML = svg;
    document.body.appendChild(el);
    entities.tankScreen(slot, point);
    const from = { x: point.x - 19, y: point.y - 19 };
    const to = cardTarget(slot);
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 }; // sube un poco y cae sobre la ficha
    el.animate([
      { transform: `translate(${from.x}px, ${from.y}px) scale(0.6)` },
      { transform: `translate(${from.x}px, ${from.y - 40}px) scale(2.1)`, offset: 0.2 },
      { transform: `translate(${mid.x}px, ${mid.y}px) scale(1.6)`, offset: 0.55 },
      { transform: `translate(${to.x - 19}px, ${to.y - 19}px) scale(1)` },
    ], { duration: FLY_MS, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' }).onfinish = () => el.remove();
  }

  return {
    onEvent(event, now) {
      if (event.type !== 'powerup_pick') return;
      const halo = halos[event.slot - 1];
      halo.start = now;
      halo.hex = COLORS[event.powerup] ?? 0xffffff;
      for (const mesh of [halo.wave, halo.steady, ...halo.sparks]) mesh.material.color.setHex(halo.hex);
      if (event.slot <= 2) fly(event.slot, event.powerup); // el icono vuela a la ficha de un jugador (los bots no tienen)
    },
    // Coloca los halos sobre los tanques (state = estado interpolado de este fotograma).
    update(state, now) {
      for (let i = 0; i < state.tankCount; i++) {
        const halo = halos[i];
        const age = (now - halo.start) / HALO_MS;
        halo.group.visible = age >= 0 && age < 1;
        if (!halo.group.visible) continue;
        halo.group.position.set(state.tanks[i].x, 0.06, -state.tanks[i].y);
        const phase = (age * 3) % 1;
        halo.wave.scale.setScalar(0.8 + phase * 1.3);
        halo.wave.material.opacity = (1 - phase) * (age > 0.85 ? (1 - age) / 0.15 : 1);
        halo.steady.scale.setScalar(1.1 + Math.sin(now * 0.012) * 0.06);
        halo.steady.rotation.z = Math.floor(now / 90) * (Math.PI / 8); // gira a saltos, como pixel art
        halo.steady.material.opacity = age > 0.85 ? (1 - age) / 0.15 : 0.9;
        halo.sparks.forEach((spark, k) => {
          const a = now * 0.006 + (k * Math.PI * 2) / SPARKS;
          const rise = (age * 2 + k / SPARKS) % 1;
          spark.position.set(Math.cos(a) * 0.85, 0.1 + rise * 1.1, Math.sin(a) * 0.85);
          spark.material.opacity = 1 - rise * 0.8;
          spark.scale.setScalar(age > 0.85 ? (1 - age) / 0.15 : 1);
        });
      }
    },
    reset() {
      for (const halo of halos) { halo.start = -1e9; halo.group.visible = false; }
    },
  };
}
