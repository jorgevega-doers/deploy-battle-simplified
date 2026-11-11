// Gente y animales por TODA la calle: personas, gatos y perros que van de un punto a otro del suelo libre rodeando los edificios
// (lifeSteer.js), se paran un rato y esquivan a los demás y a los coches: no se atraviesan entre sí ni los muros. Si un tanque
// o un proyectil se acerca, echan a correr alejándose (las personas con los brazos en alto). Si un tanque los pisa, queda una
// mancha roja de 5 s y reaparece alguien lejos de los tanques pasados unos segundos.
// Todo decorativo: no afecta a la simulación ni a las colisiones del juego.
import { createRng } from '../../shared/art/rng.js';
import { createBodies } from './lifeBodies.js';
import { nearestThreat } from './lifePaths.js';
import { chooseHeading, circleFree, pushOutOfWalls, pushOutOfCircle, randomFreeSpot, separateAgents, wrapPi } from './lifeSteer.js';
import { createStains } from './lifeStains.js';

const COUNTS = { person: 11, cat: 2, dog: 2 };
const RADIUS = { person: 0.12, cat: 0.1, dog: 0.14 };
const SPEED = { person: [0.7, 1.1], cat: [0.5, 0.9], dog: [0.9, 1.3] }; // celdas por segundo al pasear
const SCARE = { tank: 3.4, shot: 2.6, car: 1.1 }; // a qué distancia ven un tanque / un proyectil / un coche y echan a correr
const SQUASH = 0.5;                  // un tanque a menos de esto del centro de alguien lo pisa
const RUN_FACTOR = 2.8;              // corren 2,8 veces más rápido de lo que pasean
const FLEE_MS = 1300;
const REPLAN_S = 0.14;               // cada cuánto eligen rumbo
const TURN = { walk: 7, flee: 13 };  // radianes por segundo que pueden girar
const STRIDE = 8;                    // radianes de paso por celda recorrida
const RESPAWN_MS = [9000, 15000];
const RESPAWN_AWAY = 8;              // alguien nuevo aparece al menos a esta distancia de los tanques
// Pánico (easter egg de TNI, AGENTS.md sección 88): todos corren hacia el borde más cercano del mapa y desaparecen al llegar (o, si
// no llegan, a los PANIC_MAX_MS); el mapa queda desierto hasta calm().
const PANIC_EXIT = 1.6;              // a esta distancia del borde del mapa se "van" (se meten entre los edificios del borde)
const PANIC_MAX_MS = 5000;
const PANIC_SPEED = 1.3;             // corren aún más que al huir
const VANISH_MS = 220;               // se encogen a saltos al irse

const rand = (rng, min, max) => min + rng() * (max - min);
const threat = { x: 0, y: 0, d: 0 };
const pose = { walk: 0, phase: 0, time: 0, visible: true, grow: 1, armsUp: 0 }; // se reutiliza en cada pose (sin basura)
const NO_CARS = [];

// opts (mapa de la lluvia, 28-oct): { counts: menos gente, umbrellas: true = todas las personas llevan paraguas }.
export function createCrowd(scene, arena, seed = 0xc20d, { counts = COUNTS, umbrellas = false } = {}) {
  const rng = createRng(seed);
  const stains = createStains(scene);

  // Individuos mezclados (para que al bajar la calidad los que quedan sigan siendo un poco de todo).
  const kinds = Object.entries(counts).flatMap(([rig, n]) => Array.from({ length: n }, () => rig));
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  // Las personas, un poco más grandes que en la realidad (~0,6 de alto, medio tanque) para que se lean a la resolución del
  // juego; los gatos y perros, mucho más pequeños que antes (26-oct, petición del usuario): un gato mide unos 0,2 de alto.
  const defs = kinds.map((rig) => ({ rig: rig === 'person' && umbrellas ? 'personUmbrella' : rig, scale: rig === 'person' ? rand(rng, 1.2, 1.4) : rand(rng, 0.95, 1.15) }));
  const bodies = createBodies(scene, defs, rng);

  const spawns = arena.spawns;
  const agents = kinds.map((rig) => {
    const spot = randomFreeSpot(arena, rng, RADIUS[rig] + 0.1, spawns, 3.5) ?? { x: arena.width / 2, y: 2.5 };
    const [lo, hi] = SPEED[rig];
    return {
      rig, x: spot.x, y: spot.y, r: RADIUS[rig], active: true, heading: rng() * 6.28, desired: 0, speed: rand(rng, lo, hi),
      targetX: spot.x, targetY: spot.y, hasTarget: false, idleUntil: rand(rng, 0, 3000), fleeUntil: 0, fromX: 0, fromY: 0,
      nextPlan: 0, phase: rng() * 6, armsUp: 0, respawnAt: 0, popAt: -1e9, checkAt: 0, checkX: spot.x, checkY: spot.y, moving: 0,
      panicAt: 0, vanishAt: 0, gone: false, exitX: 0, exitY: 0,
    };
  });
  let count = agents.length; // los que se dibujan y se mueven (calidad)
  let last = 0;

  function newTarget(a) {
    const spot = randomFreeSpot(arena, rng, a.r + 0.15);
    if (spot) { a.targetX = spot.x; a.targetY = spot.y; a.hasTarget = true; }
  }

  return {
    count: agents.length,
    agents, // posiciones (x, y, r, active) para que los coches frenen ante la gente
    // Calidad baja (nivel 3): menos gente.
    setLevel(level) {
      count = level >= 3 ? Math.ceil(agents.length * 0.7) : agents.length;
      bodies.setActive(count);
    },
    // state = estado interpolado del host (o null en el lobby: nadie huye); cars = [{ x, y, r, v }] (coches en marcha).
    update(now, state, cars = NO_CARS) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        if (!a.active) { // pisado: reaparece lejos de los tanques pasado un tiempo
          if (now >= a.respawnAt && dt > 0) {
            const away = state ? state.tanks.slice(0, state.tankCount ?? 2) : null;
            const spot = randomFreeSpot(arena, rng, a.r + 0.15, away, RESPAWN_AWAY);
            if (spot) { a.x = spot.x; a.y = spot.y; a.active = true; a.popAt = now; a.idleUntil = now; a.hasTarget = false; a.fleeUntil = 0; a.armsUp = 0; }
          }
          continue;
        }
        // 0) Pánico: corre hacia el borde más cercano y, al llegar (o pasado PANIC_MAX_MS), se encoge y se va.
        const panicking = a.panicAt > 0 && now >= a.panicAt;
        if (panicking) {
          if (a.vanishAt) {
            if (now - a.vanishAt >= VANISH_MS) { a.active = false; a.gone = true; a.respawnAt = Infinity; continue; }
          } else {
            const toLeft = a.x; const toRight = arena.width - a.x; const toBottom = a.y; const toTop = arena.height - a.y;
            const edge = Math.min(toLeft, toRight, toBottom, toTop);
            a.exitX = edge === toLeft ? 0 : edge === toRight ? arena.width : a.x;
            a.exitY = edge === toBottom ? 0 : edge === toTop ? arena.height : a.y;
            if (edge < PANIC_EXIT || now - a.panicAt > PANIC_MAX_MS) a.vanishAt = now;
          }
        }
        // 1) Amenazas: tanque o proyectil cerca = huir; un coche muy cerca también.
        let scared = panicking || nearestThreat(a.x, a.y, state, SCARE.tank, SCARE.shot, threat);
        if (panicking) { /* rumbo hacia la salida (abajo) */ } else if (scared) { a.fromX = threat.x; a.fromY = threat.y; } else {
          for (const car of cars) {
            if (Math.hypot(car.x - a.x, car.y - a.y) < SCARE.car + car.r && car.v > 0.3) { scared = true; a.fromX = car.x; a.fromY = car.y; break; }
          }
        }
        if (scared) a.fleeUntil = now + FLEE_MS;
        const fleeing = now < a.fleeUntil;
        // 2) Pisado por un tanque.
        if (state) {
          const tankCount = state.tankCount ?? 2;
          for (let t = 0; t < tankCount; t++) {
            if (state.tanks[t].lives !== 0 && Math.hypot(state.tanks[t].x - a.x, state.tanks[t].y - a.y) < SQUASH) {
              stains.add(a.x, a.y, now, a.rig === 'person' ? 1 : 0.6);
              a.active = false;
              a.respawnAt = now + rand(rng, RESPAWN_MS[0], RESPAWN_MS[1]);
              break;
            }
          }
          if (!a.active) continue;
        }
        // 3) Decidir rumbo (no en cada fotograma) y si pasea, se para o corre.
        const idle = !fleeing && now < a.idleUntil;
        if (!idle && a.nextPlan <= now) {
          a.nextPlan = now + REPLAN_S * 1000 * (0.7 + rng() * 0.6);
          if (panicking) {
            const h = chooseHeading(arena, a.x, a.y, a.r, a.heading, 'goto', a.exitX, a.exitY);
            if (h !== null) a.desired = h;
          } else if (fleeing) {
            const h = chooseHeading(arena, a.x, a.y, a.r, a.heading, 'flee', a.fromX, a.fromY);
            if (h !== null) a.desired = h;
          } else {
            if (!a.hasTarget) newTarget(a);
            else if (Math.hypot(a.targetX - a.x, a.targetY - a.y) < 0.35) { // llegó: se para un rato (los gatos, más) y elegirá otro destino
              a.idleUntil = now + (a.rig === 'cat' ? rand(rng, 3000, 9000) : rand(rng, 800, 3500));
              a.hasTarget = false;
            }
            if (a.hasTarget) {
              const h = chooseHeading(arena, a.x, a.y, a.r, a.heading, 'goto', a.targetX, a.targetY);
              if (h !== null) a.desired = h;
            }
          }
        }
        if (now >= a.checkAt) { // atascado (casi no avanza mientras anda): cambia de destino
          if (!idle && !fleeing && Math.hypot(a.x - a.checkX, a.y - a.checkY) < 0.12) newTarget(a);
          a.checkAt = now + 1500;
          a.checkX = a.x;
          a.checkY = a.y;
        }
        // 4) Moverse.
        const turn = (fleeing ? TURN.flee : TURN.walk) * dt;
        const delta = wrapPi(a.desired - a.heading);
        a.heading += Math.max(-turn, Math.min(turn, delta));
        const speed = idle ? 0 : a.speed * (panicking ? RUN_FACTOR * PANIC_SPEED : fleeing ? RUN_FACTOR : 1);
        a.x += Math.cos(a.heading) * speed * dt;
        a.y += Math.sin(a.heading) * speed * dt;
        a.moving = speed;
        a.phase += speed * dt * STRIDE;
        a.armsUp += ((fleeing && a.rig === 'person' && !umbrellas ? 1 : 0) - a.armsUp) * Math.min(1, dt * 12); // con paraguas solo corren (no levantan los brazos)
      }
      // 5) Que no se atraviesen entre sí, ni con los coches, ni con los muros.
      separateAgents(agents, count);
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        if (!a.active) continue;
        for (const car of cars) pushOutOfCircle(a, car.x, car.y, car.r);
        pushOutOfWalls(arena, a, a.r);
      }
      // 6) Dibujar.
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        const grow = a.vanishAt ? Math.max(0, 1 - (now - a.vanishAt) / VANISH_MS) : Math.min(1, 0.4 + (now - a.popAt) / 300); // al reaparecer crece a saltos; al irse, se encoge
        pose.walk = Math.min(1.8, a.moving / 1.1); pose.phase = a.phase; pose.time = now; pose.visible = a.active; pose.grow = Math.round(grow * 4) / 4; pose.armsUp = a.armsUp;
        bodies.pose(i, a.x, a.y, a.heading, pose);
      }
      bodies.commit();
      stains.update(now);
    },
    setVisible(on) { bodies.mesh.visible = on; },
    // Para depurar y probar: dónde está cada uno y qué hace.
    snapshot(now) {
      return agents.slice(0, count).map((a) => ({ rig: a.rig, x: +a.x.toFixed(2), y: +a.y.toFixed(2), fleeing: now < a.fleeUntil, dead: !a.active, free: circleFree(arena, a.x, a.y, a.r - 0.02) }));
    },
    reset() { stains.reset(); },
    // Pánico (easter egg de TNI): cada uno echa a correr con un pequeño retraso distinto hacia el borde más cercano y se va.
    panic(now) {
      for (const a of agents) {
        if (a.gone || a.panicAt) continue;
        if (!a.active) { a.gone = true; a.respawnAt = Infinity; continue; } // pisado y esperando a reaparecer: ya no vuelve
        a.panicAt = now + rng() * 350;
      }
    },
    // Fin del pánico: los que se fueron vuelven poco a poco (aparecen lejos de los tanques, como al reaparecer).
    calm(now) {
      for (const a of agents) {
        const left = a.gone || a.vanishAt;
        a.panicAt = 0; a.vanishAt = 0; a.gone = false;
        if (left) { a.active = false; a.respawnAt = now + rand(rng, 500, 4000); }
      }
    },
    // Solo para pruebas: pone una mancha en (x, y) como si un tanque acabara de pisar a alguien allí.
    splat(x, y, now) { stains.add(x, y, now, 1); },
  };
}
