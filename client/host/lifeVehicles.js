// Tráfico ligero: coches pequeños y motos que dan vueltas por los carriles del anillo de la calle (los de las rayas discontinuas
// pintadas en el suelo). Circulan como en la realidad: si hay un tanque delante lo RODEAN (se desplazan hacia un lado del
// carril, el que tenga hueco y sin muros) y vuelven al carril cuando lo pasan; si no hay hueco, frenan, y si el tanque se
// les echa encima de frente, dan marcha atrás. Si una persona está delante, frenan; si un tanque cae a menos de 0,75, se
// "aparcan" (desaparecen) unos segundos. Son bajos (menos de 0,41 de alto): los proyectiles pasan por encima. Solo decoración.
// Los carriles van un poco hacia dentro de la calle: los más pegados a los edificios del sur quedaban tapados por ellos.
// Entre vehículos (28-oct, "que no se clippeen"): el de atrás frena y sigue al de delante en su carril (no lo adelanta) y, como
// red de seguridad, un vehículo NUNCA entra en el rectángulo de otro (prueba de cajas orientadas): si el movimiento lo metería
// dentro, se queda quieto ese fotograma; si lleva más de 2,5 s así, el de número más alto se "aparca" unos segundos.
// Qué NO hace: no cruza ningún tanque ni se mete entre edificios (solo recorre sus carriles y un desvío corto, con muros comprobados).
import { createRng } from '../../shared/art/rng.js';
import { createBodies } from './lifeBodies.js';
import { laneLoops, loopPoint } from './lifePaths.js';
import { circleFree } from './lifeSteer.js';

const CRUISE = { car: 1.9, scooter: 2.5 };       // celdas por segundo
const PANIC_RUSH = 3;                            // en el pánico (easter egg de TNI) van al triple
// Escala de cada vehículo: con ella, la altura total (rig x escala) se queda por debajo de 0,41, que es donde empieza el
// proyectil (0,5 de altura y 0,18 de lado): los disparos pasan por encima de los vehículos. Lo comprueba tests/life.test.js.
export const VEHICLE_SCALE = { car: 1.2, scooter: 1.1 };
const RADIUS = { car: 0.45, scooter: 0.3 };      // para que la gente los esquive
// Medidas reales de cada cuerpo (mitad del largo y del ancho, ya con la escala): para que dos vehículos no se solapen.
export const HALF_SIZE = { car: { hl: 0.5, hw: 0.3 }, scooter: { hl: 0.28, hw: 0.12 } };
const GAP = 0.3;                                  // hueco mínimo entre el de atrás y el de delante (celdas)
const CLEAR_MARGIN = 0.04;                       // margen de la prueba de solape
const HOLD_PARK_S = 2.5;                         // tiempo atascado antes de aparcar al de número más alto
const LANE_OFFSET = 0.3;
const SWERVE = 0.65;                             // cuánto se desvían del carril para rodear a un tanque
const SWERVE_RATE = 1.7;                         // celdas por segundo que tardan en moverse de lado
const SWERVE_SPEED = 0.8;                        // van un poco más despacio mientras rodean
const MAX_YAW = 0.55;                            // giro máximo del coche al desviarse (~30°)
const ACCEL = 3;
const BRAKE = 9;
const REVERSE_SPEED = 1.4;
const LOOK_AHEAD = [0.9, 1.7, 2.5];              // puntos que mira por delante
const CLEARANCE = 0.95;                          // un tanque a menos de esto de un punto de delante = vía cortada
const PERSON_CLEARANCE = 0.6;                    // y una persona, a menos de esto
const NEAR = 1.5;                                // un tanque a menos de esto = peligro
const PARK_DISTANCE = 0.75;
const PARK_MS = 5000;
const point = { x: 0, y: 0, heading: 0 };
const ahead = { x: 0, y: 0, heading: 0 };
const aheadX = new Float64Array(LOOK_AHEAD.length);
const aheadY = new Float64Array(LOOK_AHEAD.length);
let normalX = 0; // normal (a la izquierda) del rumbo del coche que se está procesando
let normalY = 0;
const pose = { visible: true }; // se reutiliza en cada pose (sin basura)

// ¿Se solapan dos rectángulos orientados? (a = centro, rumbo y mitades de largo y ancho; "margin" los agranda). Prueba de ejes
// separadores. Código puro y sin asignaciones: se prueba en tests/life.test.js.
export function boxesOverlap(ax, ay, ah, ahl, ahw, bx, by, bh, bhl, bhw, margin = 0) {
  const dx = bx - ax;
  const dy = by - ay;
  const ac = Math.cos(ah); const as = Math.sin(ah);
  const bc = Math.cos(bh); const bs = Math.sin(bh);
  // Ejes: los dos de cada caja. Para cada eje se compara la distancia entre centros con la suma de los "radios" proyectados.
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? ac : k === 1 ? -as : k === 2 ? bc : -bs;
    const uy = k === 0 ? as : k === 1 ? ac : k === 2 ? bs : bc;
    const ra = ahl * Math.abs(ux * ac + uy * as) + ahw * Math.abs(-ux * as + uy * ac);
    const rb = bhl * Math.abs(ux * bc + uy * bs) + bhw * Math.abs(-ux * bs + uy * bc);
    if (Math.abs(dx * ux + dy * uy) > ra + rb + margin) return false;
  }
  return true;
}

// ¿Algún tanque cierra el paso a un coche desplazado "lat" celdas de su carril? (usa los puntos de delante ya calculados)
function tankBlocks(state, lat) {
  for (let t = 0; t < (state.tankCount ?? 2); t++) {
    const tank = state.tanks[t];
    for (let k = 0; k < LOOK_AHEAD.length; k++) {
      if (Math.hypot(tank.x - (aheadX[k] + normalX * lat), tank.y - (aheadY[k] + normalY * lat)) < CLEARANCE) return true;
    }
  }
  return false;
}
// ¿Hay suelo libre de muros en el desvío "lat"? (para no rodear a un tanque metiéndose en un edificio)
function wallsClear(arena, lat) {
  for (let k = 0; k < LOOK_AHEAD.length; k++) if (!circleFree(arena, aheadX[k] + normalX * lat, aheadY[k] + normalY * lat, 0.3)) return false;
  return true;
}

// opts.plan (mapa de la lluvia, 28-oct): otro reparto de vehículos (más coches).
export function createVehicles(scene, arena, seed = 0x7a31, { plan: custom = null } = {}) {
  const rng = createRng(seed);
  const lanes = laneLoops(arena, LANE_OFFSET);
  if (lanes.length === 0) return { count: 0, cars: [], update() {}, setVisible() {}, setLevel() {}, panic() {}, calm() {} };
  // Dos coches y dos motos repartidos por los dos carriles, lejos de las salidas de los tanques (esquinas opuestas).
  const plan = custom ?? [
    { rig: 'car', lane: 0, at: 0.3 }, { rig: 'scooter', lane: 1, at: 0.55 }, { rig: 'car', lane: 1, at: 0.9 }, { rig: 'scooter', lane: 0, at: 0.65 },
  ];
  const defs = plan.map(({ rig }) => ({ rig, scale: VEHICLE_SCALE[rig] }));
  const bodies = createBodies(scene, defs, rng);
  const vehicles = plan.map(({ rig, lane, at }) => {
    const { loop, dir } = lanes[lane % lanes.length];
    return { rig, loop, dir, s: at * loop.length, v: CRUISE[rig], hiddenUntil: 0, lat: 0, latTarget: 0, yaw: 0 };
  });
  // Posiciones para la gente (la gente los esquiva): { x, y, r, v }.
  const cars = vehicles.map((car) => ({ x: 0, y: 0, r: RADIUS[car.rig], v: 0, h: 0, hl: HALF_SIZE[car.rig].hl, hw: HALF_SIZE[car.rig].hw, shown: false }));
  vehicles.forEach((car) => { car.held = 0; car.panicAt = 0; car.goneAt = 0; });
  let last = 0;

  return {
    count: vehicles.length,
    cars,
    setLevel() {},
    // Pánico (easter egg de TNI, sección 88): aceleran a tope y, escalonados, se van (desaparecen) hasta calm().
    panic(now) {
      for (const car of vehicles) {
        if (car.panicAt) continue;
        car.panicAt = now + rng() * 300;
        car.goneAt = now + 1200 + rng() * 1600;
      }
    },
    calm(now) {
      for (const car of vehicles) {
        const gone = car.goneAt > 0;
        car.panicAt = 0; car.goneAt = 0;
        if (gone) car.hiddenUntil = now + 1000 + rng() * 4000; // vuelven poco a poco
      }
    },
    setVisible(on) { bodies.mesh.visible = on; },
    // state = estado interpolado (tanques); people = lifeCrowd.agents (frenan si hay alguien delante).
    update(now, state, people = []) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      for (let i = 0; i < vehicles.length; i++) {
        const car = vehicles[i];
        if (car.goneAt && now >= car.goneAt) car.hiddenUntil = Infinity; // pánico: se ha ido (hasta calm())
        loopPoint(car.loop, car.s, car.dir, point);
        const hidden = now < car.hiddenUntil;
        let target = CRUISE[car.rig];
        if (!hidden) {
          normalX = -Math.sin(point.heading); // normal a la izquierda del rumbo
          normalY = Math.cos(point.heading);
          for (let k = 0; k < LOOK_AHEAD.length; k++) { // los puntos de delante se calculan una vez por coche y fotograma
            loopPoint(car.loop, car.s + car.dir * LOOK_AHEAD[k], car.dir, ahead);
            aheadX[k] = ahead.x;
            aheadY[k] = ahead.y;
          }
          let near = false;
          let blocked = false;
          if (state) {
            for (let t = 0; t < (state.tankCount ?? 2); t++) {
              const tank = state.tanks[t];
              const d = Math.hypot(tank.x - (point.x + normalX * car.lat), tank.y - (point.y + normalY * car.lat));
              if (d < PARK_DISTANCE) car.hiddenUntil = now + PARK_MS;
              if (d < NEAR) near = true;
            }
            blocked = tankBlocks(state, car.lat);
            if (blocked) { // rodear: el lado con hueco (sin tanque ni muros); si no hay, frena
              const first = car.lat >= 0 ? SWERVE : -SWERVE;
              let found = false;
              for (let side = 0; side < 2 && !found; side++) {
                const lat = side === 0 ? first : -first;
                if (!tankBlocks(state, lat) && wallsClear(arena, lat)) { car.latTarget = lat; found = true; }
              }
              if (found) { blocked = false; target = CRUISE[car.rig] * SWERVE_SPEED; }
            } else if (car.latTarget !== 0 && !tankBlocks(state, 0) && wallsClear(arena, 0)) {
              car.latTarget = 0; // ya lo ha pasado: vuelve al carril
            }
          } else car.latTarget = 0;
          for (let p = 0; p < people.length && !blocked; p++) { // una persona delante: frena para no atropellarla (ella se aparta)
            const person = people[p];
            if (!person.active) continue;
            for (let k = 0; k < LOOK_AHEAD.length; k++) {
              if (Math.hypot(person.x - (aheadX[k] + normalX * car.lat), person.y - (aheadY[k] + normalY * car.lat)) < PERSON_CLEARANCE + person.r) { blocked = true; break; }
            }
          }
          if (near && blocked) target = -REVERSE_SPEED;       // lo tiene delante y encima y no puede rodearlo: marcha atrás
          else if (blocked) target = 0;                       // lo ve venir y no hay hueco: frena
          else if (near && target > 0 && car.latTarget === 0) target = CRUISE[car.rig] * 1.5; // viene por detrás o de lado: acelera
          if (car.panicAt && now >= car.panicAt && target >= 0) target = CRUISE[car.rig] * PANIC_RUSH; // pánico: a tope (sigue sin chocar)
          // Seguir al de delante en el mismo carril: frena antes de tocarlo y va a su paso (no adelanta).
          if (target > 0) {
            for (let j = 0; j < vehicles.length; j++) {
              const other = vehicles[j];
              if (j === i || other.loop !== car.loop || other.dir !== car.dir || now < other.hiddenUntil) continue;
              const length = car.loop.length;
              const gap = ((((other.s - car.s) * car.dir) % length) + length) % length; // distancia por delante, en el sentido de la marcha
              const need = cars[i].hl + cars[j].hl + GAP; // distancia mínima entre centros
              if (gap < need + 1.2) target = Math.min(target, gap <= need + 0.05 ? 0 : Math.max(0, other.v) + (gap - need) * 1.6);
            }
          }
        }
        const rate = target < car.v ? BRAKE : ACCEL;
        car.v += Math.sign(target - car.v) * Math.min(Math.abs(target - car.v), rate * dt);
        const s0 = car.s;
        const lat0 = car.lat;
        car.s += car.dir * car.v * dt;
        const before = car.lat;
        car.lat += Math.sign(car.latTarget - car.lat) * Math.min(Math.abs(car.latTarget - car.lat), SWERVE_RATE * dt);
        loopPoint(car.loop, car.s, car.dir, point);
        if (!hidden) { // red de seguridad: no entrar nunca en el rectángulo de otro vehículo
          const hx = point.x + -Math.sin(point.heading) * car.lat;
          const hy = point.y + Math.cos(point.heading) * car.lat;
          let blocker = -1;
          for (let j = 0; j < vehicles.length && blocker < 0; j++) {
            if (j === i || !cars[j].shown) continue;
            const o = cars[j];
            if (boxesOverlap(hx, hy, point.heading + car.yaw, cars[i].hl, cars[i].hw, o.x, o.y, o.h, o.hl, o.hw, CLEAR_MARGIN)
              && !(cars[i].shown && boxesOverlap(cars[i].x, cars[i].y, cars[i].h, cars[i].hl, cars[i].hw, o.x, o.y, o.h, o.hl, o.hw, CLEAR_MARGIN))) blocker = j; // solo si ENTRARÍA (si ya estaban solapados, que se separen)
          }
          if (blocker >= 0) { // se queda donde estaba
            car.s = s0; car.lat = lat0; car.v = 0;
            car.held += dt;
            if (car.held > HOLD_PARK_S && i > blocker) { car.hiddenUntil = now + PARK_MS; car.held = 0; }
            loopPoint(car.loop, car.s, car.dir, point);
          } else car.held = 0;
        }
        const x = point.x + -Math.sin(point.heading) * car.lat;
        const y = point.y + Math.cos(point.heading) * car.lat;
        // Al desviarse, el coche GIRA hacia donde va (como si diera un volantazo) en vez de deslizarse de lado: el ángulo sale
        // de la velocidad lateral frente a la de avance, suavizado, y se limita a ~30°. Marcha atrás o casi parado: recto.
        const lateralSpeed = dt > 0 ? (car.lat - before) / dt : 0;
        const wantYaw = Math.abs(car.v) > 0.3 && car.v > 0 ? Math.max(-MAX_YAW, Math.min(MAX_YAW, Math.atan2(lateralSpeed, car.v))) : 0;
        car.yaw += (wantYaw - car.yaw) * Math.min(1, dt * 9);
        cars[i].x = hidden ? -99 : x;
        cars[i].y = hidden ? -99 : y;
        cars[i].h = point.heading + car.yaw;
        cars[i].shown = !hidden;
        cars[i].v = Math.abs(car.v);
        cars[i].lat = car.lat; // desvío del carril (solo para depurar y probar)
        pose.visible = !hidden;
        bodies.pose(i, x, y, point.heading + car.yaw, pose);
      }
      bodies.commit();
    },
  };
}
