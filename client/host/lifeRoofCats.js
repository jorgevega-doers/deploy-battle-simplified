// Gatos por los tejados: sentados en las azoteas de los edificios (los del borde, que se ven mucho, y algunos del interior),
// dando algún paseo corto, moviendo la cola y girando la cabeza hacia el tanque más cercano si está a menos de 7 celdas.
// Están muy por encima de la acción: no huyen ni se pisan. Qué NO hace: no usa colisiones (las azoteas son pequeñas y
// los gatos diminutos; si uno se mete un poco en una caseta del tejado no se nota).
import { createRng, int } from '../../shared/art/rng.js';
import { createBodies } from './lifeBodies.js';
import { wrapPi } from './lifeSteer.js';

// Cuántos gatos por tipo de edificio (types de shared/city: interiores y border-n/s/e/w).
const PLAN = { 'border-s': 2, 'border-w': 1, 'border-e': 1, 'border-n': 1, interior: 2 };
const WATCH = 7;          // a qué distancia miran al tanque
const SPEED = 0.35;
const INSET = 0.3;

const rand = (rng, min, max) => min + rng() * (max - min);
const pose = { walk: 0, phase: 0, time: 0, lift: 0, visible: true }; // se reutiliza en cada pose (sin basura)
const PANIC_HOP_MS = 300; // pánico (easter egg de TNI): el gato da un salto y desaparece del tejado

// Azotea de un edificio: su caja principal (la primera parte) con su altura.
function roofOf(building) {
  const body = building.parts.find((p) => p.kind === 'box');
  if (!body) return null;
  const w = body.w;
  const d = body.d;
  if (w < INSET * 2 + 0.3 || d < INSET * 2 + 0.3) return null;
  return { x0: body.x + INSET, y0: body.y + INSET, x1: body.x + w - INSET, y1: body.y + d - INSET, z: body.z + body.h };
}

export function createRoofCats(scene, city, seed = 0xca75) {
  const rng = createRng(seed);
  const groups = { interior: [] };
  for (const b of city.buildings) {
    const roof = roofOf(b);
    if (!roof) continue;
    const key = b.type in PLAN ? b.type : b.rect ? 'interior' : null;
    if (key) (groups[key] ??= []).push(roof);
  }
  const cats = [];
  for (const [key, how] of Object.entries(PLAN)) {
    const roofs = [...(groups[key] ?? [])];
    for (let n = 0; n < how && roofs.length; n++) {
      const roof = roofs.splice(int(rng, 0, roofs.length - 1), 1)[0];
      const x = rand(rng, roof.x0, roof.x1);
      const y = rand(rng, roof.y0, roof.y1);
      cats.push({ roof, x, y, tx: x, ty: y, heading: rng() * 6.28, idleUntil: rand(rng, 0, 5000), phase: rng() * 6, moving: 0, goneAt: 0 });
    }
  }
  const bodies = createBodies(scene, cats.map(() => ({ rig: 'cat', scale: rand(rng, 0.95, 1.15) })), rng);

  return {
    count: cats.length,
    // Para depurar y probar: dónde está cada gato (x, y del mundo y la altura de su azotea).
    snapshot() { return cats.map((c) => ({ x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.roof.z.toFixed(2) })); },
    // Pánico (easter egg de TNI, sección 88): cada gato salta y se va del tejado con un retraso distinto; calm() los devuelve.
    panic(now) { for (const c of cats) if (!c.goneAt) c.goneAt = now + rand(rng, 100, 1100); },
    calm() { for (const c of cats) c.goneAt = 0; },
    update(now, state, dt) {
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        if (c.goneAt && now >= c.goneAt - PANIC_HOP_MS) { // salto (a pasos) y desaparece
          const hop = Math.max(0, (now - (c.goneAt - PANIC_HOP_MS)) / PANIC_HOP_MS);
          pose.walk = 0; pose.phase = c.phase; pose.time = now; pose.lift = c.roof.z + Math.round(Math.sin(Math.min(1, hop) * Math.PI) * 4) * 0.06;
          pose.visible = hop < 1;
          bodies.pose(i, c.x, c.y, c.heading, pose);
          continue;
        }
        pose.visible = true;
        const walking = now >= c.idleUntil;
        if (walking) {
          const dx = c.tx - c.x;
          const dy = c.ty - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.08) { // llegó: se sienta un buen rato y luego elige otro sitio de la azotea
            c.idleUntil = now + rand(rng, 4000, 14000);
            c.tx = rand(rng, c.roof.x0, c.roof.x1);
            c.ty = rand(rng, c.roof.y0, c.roof.y1);
            c.moving = 0;
          } else {
            const want = Math.atan2(dy, dx);
            c.heading += Math.max(-6 * dt, Math.min(6 * dt, wrapPi(want - c.heading)));
            c.x += Math.cos(c.heading) * SPEED * dt;
            c.y += Math.sin(c.heading) * SPEED * dt;
            c.moving = SPEED;
            c.phase += SPEED * dt * 8;
          }
        } else {
          c.moving = 0;
          if (state) { // sentado, mira al tanque más cercano si está cerca
            let best = WATCH;
            let angle = null;
            for (let t = 0; t < (state.tankCount ?? 2); t++) {
              const d = Math.hypot(state.tanks[t].x - c.x, state.tanks[t].y - c.y);
              if (d < best) { best = d; angle = Math.atan2(state.tanks[t].y - c.y, state.tanks[t].x - c.x); }
            }
            if (angle !== null) c.heading += Math.max(-4 * dt, Math.min(4 * dt, wrapPi(angle - c.heading)));
          }
        }
        pose.walk = c.moving > 0 ? 0.9 : 0; pose.phase = c.phase; pose.time = now; pose.lift = c.roof.z;
        bodies.pose(i, c.x, c.y, c.heading, pose);
      }
      bodies.commit();
    },
  };
}
