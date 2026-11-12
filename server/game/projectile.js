// Proyectiles: avanzan en línea recta, rebotan en los muros (máximo 3 veces) e impactan en los tanques.
// Se guardan en un "pool" (lista fija de objetos reutilizables) para no crear objetos en cada disparo.
import { raycastGrid, bounceStart, reflect, segmentBoxHit } from '../../shared/geometry.js';
import { TANK_HALF, MAX_BOUNCES } from '../../shared/constants.js';

const MAX_STEPS = 8; // seguridad: rebotes que se procesan como mucho en un mismo tick
const hit = { t: 0, x: 0, y: 0, nx: 0, ny: 0 };
const start = { x: 0, y: 0 };
const direction = { x: 0, y: 0 };

export function createProjectilePool(size) {
  return Array.from({ length: size }, () => ({
    active: false, id: 0, owner: 0, x: 0, y: 0, dx: 0, dy: 0, speed: 0, bounces: 0, aoe: false, rocket: false, life: Infinity,
  }));
}

// Activa un proyectil libre del pool. Devuelve null si no queda ninguno. "life" = segundos que vive como mucho.
// rocket = cohete del tanque de TNI: no rebota; revienta (onExplode) al primer muro o al acabarse su vida.
export function spawnProjectile(pool, { id, owner, x, y, angle, speed, aoe, life = Infinity, rocket = false }) {
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p.active) continue;
    p.active = true;
    p.id = id;
    p.owner = owner;
    p.x = x;
    p.y = y;
    p.dx = Math.cos(angle);
    p.dy = Math.sin(angle);
    p.speed = speed;
    p.bounces = 0;
    p.aoe = aoe;
    p.rocket = rocket;
    p.life = life;
    return p;
  }
  return null;
}

// Avanza un proyectil durante dt segundos. ctx = { solid, tanks, cfg, events, onTankHit(p, tank, x, y), onExplode(p, x, y) }.
// Si en el mismo tick toca un tanque y un muro, gana lo que esté más cerca. Un proyectil con el power-up de
// explosión estalla en su 2.º rebote (MAX_BOUNCES); los demás desaparecen al tocar un muro por 3.ª vez. Además, ninguno vive más de
// "life" segundos: en un pasillo largo, los rebotes de pared a pared serían demasiado recorrido.
export function advanceProjectile(p, dt, ctx) {
  p.life -= dt;
  if (p.life <= 0) {
    p.active = false;
    if (p.rocket) ctx.onExplode(p, p.x, p.y); // el cohete revienta también al acabarse
    else ctx.events.push({ type: 'expire', x: p.x, y: p.y });
    return;
  }
  let remaining = p.speed * dt;
  for (let step = 0; step < MAX_STEPS && remaining > 0; step++) {
    const hitWall = raycastGrid(ctx.solid, p.x, p.y, p.dx, p.dy, remaining, hit);
    const travel = hitWall ? hit.t : remaining;
    const x1 = p.x + p.dx * travel;
    const y1 = p.y + p.dy * travel;

    // ¿Toca algún tanque antes de llegar al final de este tramo?
    let bestTank = null;
    let bestT = Infinity;
    for (let i = 0; i < ctx.tanks.length; i++) {
      const tank = ctx.tanks[i];
      if ((tank.slot === p.owner && !ctx.cfg.friendlyFire) || ctx.sameTeam?.(p.owner, tank.slot)) continue; // ni el propio tanque ni un compañero
      if (tank.alive === false || tank.invuln > 0) continue; // eliminado o recién reaparecido: el disparo lo atraviesa
      const t = segmentBoxHit(p.x, p.y, x1, y1, tank.x, tank.y, TANK_HALF + ctx.cfg.projectileRadius);
      if (t >= 0 && t < bestT) { bestT = t; bestTank = tank; }
    }
    if (bestTank) {
      p.active = false;
      ctx.onTankHit(p, bestTank, p.x + (x1 - p.x) * bestT, p.y + (y1 - p.y) * bestT);
      return;
    }

    if (!hitWall) {
      p.x = x1;
      p.y = y1;
      return;
    }

    if (p.rocket) { // cohete: sin rebotes, revienta al primer muro
      p.active = false;
      ctx.onExplode(p, hit.x, hit.y);
      return;
    }
    p.bounces++;
    if (p.aoe && p.bounces === MAX_BOUNCES) {
      p.active = false;
      ctx.onExplode(p, hit.x, hit.y);
      return;
    }
    if (p.bounces > MAX_BOUNCES) { // 4.º muro: se acabó el recorrido, ya no rebota
      p.active = false;
      ctx.events.push({ type: 'impact', x: hit.x, y: hit.y });
      return;
    }
    ctx.events.push({ type: 'bounce', x: hit.x, y: hit.y, n: p.bounces });
    bounceStart(hit, start);
    p.x = start.x;
    p.y = start.y;
    reflect(p.dx, p.dy, hit.nx, hit.ny, direction);
    p.dx = direction.x;
    p.dy = direction.y;
    remaining -= travel;
  }
}
