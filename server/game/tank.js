// Estado y movimiento de un tanque. Hitbox de 1 x 1 (AGENTS.md). No sabe nada de red ni de render.
import { moveBoxX, moveBoxY, boxesOverlap } from '../../shared/geometry.js';
import { TANK_HALF, POWERUP_TYPES } from '../../shared/constants.js';

export function createTank(slot, spawn, aim) {
  return {
    slot,
    x: spawn.x,
    y: spawn.y,
    aim,              // ángulo de apuntado en radianes (0 = +X, el eje Y crece hacia arriba)
    moveX: 0,         // intención de movimiento: vector con longitud <= 1
    moveY: 0,
    vx: 0,            // velocidad actual en celdas por segundo (se acerca a la deseada con aceleración, no de golpe)
    vy: 0,
    cooldown: 0,      // segundos hasta poder volver a disparar
    pendingFire: false, // un disparo pedido justo antes de acabar la cadencia: sale solo cuando se pueda
    dashLeft: 0,      // segundos que le quedan al dash en curso (0 = no está haciendo dash)
    dashDirX: 0,
    dashDirY: 0,
    dashCooldown: 0,  // segundos hasta poder volver a hacer dash
    effects: { double: 0, speed: 0, aoe: 0 }, // segundos restantes de cada power-up
    alive: true,      // modo de un jugador: un bot eliminado (0 vidas) deja de existir para disparos y choques
    invuln: 0,        // segundos de invulnerabilidad tras reaparecer (solo bots en el modo de un jugador)
  };
}

// Vuelve a la salida, parado y listo para disparar. Los power-ups activos se conservan.
export function resetTank(tank, spawn) {
  tank.x = spawn.x;
  tank.y = spawn.y;
  tank.moveX = 0;
  tank.moveY = 0;
  tank.vx = 0;
  tank.vy = 0;
  tank.cooldown = 0;
  tank.pendingFire = false;
  tank.dashLeft = 0;
  tank.dashCooldown = 0;
}

// Empieza un dash (ráfaga corta y rápida). Devuelve false si todavía no se puede.
// Dirección: la del pad de movimiento; si está soltado pero el tanque aún avanza por inercia, la de su velocidad;
// si está quieto, hacia donde apunta.
export function startDash(tank, cfg) {
  if (tank.dashLeft > 0 || tank.dashCooldown > 0) return false;
  let dx = tank.moveX;
  let dy = tank.moveY;
  if (Math.hypot(dx, dy) < 0.2) {
    if (Math.hypot(tank.vx, tank.vy) > 0.5) { dx = tank.vx; dy = tank.vy; }
    else { dx = Math.cos(tank.aim); dy = Math.sin(tank.aim); }
  }
  const len = Math.hypot(dx, dy);
  tank.dashDirX = dx / len;
  tank.dashDirY = dy / len;
  tank.dashLeft = cfg.dashDurationS;
  tank.dashCooldown = tank.dashCooldownS ?? cfg.dashCooldownS; // el tanque de TNI tiene su propia espera (sección 88)
  return true;
}

// Cuenta atrás de la cadencia, del dash y de los power-ups.
export function tickTank(tank, dt) {
  if (tank.cooldown > 0) tank.cooldown = Math.max(0, tank.cooldown - dt);
  if (tank.dashCooldown > 0) tank.dashCooldown = Math.max(0, tank.dashCooldown - dt);
  if (tank.invuln > 0) tank.invuln = Math.max(0, tank.invuln - dt);
  for (let i = 0; i < POWERUP_TYPES.length; i++) {
    const type = POWERUP_TYPES[i];
    if (tank.effects[type] > 0) tank.effects[type] = Math.max(0, tank.effects[type] - dt);
  }
}

// Acerca la velocidad actual (vx, vy) a la deseada sin pasarse: acelera al empezar y frena al soltar.
// Así el tanque no arranca ni se para en seco: se siente más natural y más fácil de controlar.
function approachVelocity(tank, targetX, targetY, dt, cfg) {
  const diffX = targetX - tank.vx;
  const diffY = targetY - tank.vy;
  const distance = Math.hypot(diffX, diffY);
  if (distance < 1e-9) { // restos de coma flotante (p. ej. 6e-16): se iguala del todo para que el tanque quede parado
    tank.vx = targetX;
    tank.vy = targetY;
    return;
  }
  const speeding = Math.hypot(targetX, targetY) >= Math.hypot(tank.vx, tank.vy);
  const maxChange = (speeding ? cfg.tankAccel : cfg.tankBrake) * dt;
  if (distance <= maxChange) {
    tank.vx = targetX;
    tank.vy = targetY;
  } else {
    tank.vx += (diffX / distance) * maxChange;
    tank.vy += (diffY / distance) * maxChange;
  }
}

// Mueve el tanque según su intención, chocando con los muros y con el otro tanque.
// - Velocidad deseada = dirección del pad x velocidad máxima x curva de respuesta: con poco empuje se avanza muy despacio
//   (más precisión) y con el pad a fondo se va a tope. La velocidad real se acerca a la deseada con aceleración/frenado.
// - Cada eje se mueve por separado: al chocar en diagonal se "desliza" por el muro en vez de quedarse parado.
// - Si choca, pierde la velocidad en ese eje (no se queda "empujando" ni sale disparado al girar).
// - Durante un dash el jugador no controla la dirección: va recto a gran velocidad (y también choca con muros y tanques).
//   Al acabar conserva parte de la velocidad, que el frenado va reduciendo.
export function moveTank(tank, dt, solid, other, cfg) {
  let dx;
  let dy;
  if (tank.dashLeft > 0) {
    const step = Math.min(dt, tank.dashLeft); // el último tick del dash recorre solo lo que le queda
    tank.dashLeft = Math.max(0, tank.dashLeft - dt);
    dx = tank.dashDirX * cfg.dashSpeed * step;
    dy = tank.dashDirY * cfg.dashSpeed * step;
    const carry = cfg.tankSpeed * cfg.dashExitSpeedFactor;
    tank.vx = tank.dashDirX * carry; // al acabar el dash conserva esta velocidad
    tank.vy = tank.dashDirY * carry;
  } else {
    const len = Math.hypot(tank.moveX, tank.moveY);
    const maxSpeed = cfg.tankSpeed * (tank.speedFactor ?? 1) * (tank.effects.speed > 0 ? cfg.speedBoost : 1); // speedFactor: tanque de TNI
    if (len < 1e-6) {
      approachVelocity(tank, 0, 0, dt, cfg);
    } else {
      const magnitude = Math.min(len, 1) ** cfg.moveResponseExponent;
      approachVelocity(tank, (tank.moveX / len) * magnitude * maxSpeed, (tank.moveY / len) * magnitude * maxSpeed, dt, cfg);
    }
    dx = tank.vx * dt;
    dy = tank.vy * dt;
    if (dx === 0 && dy === 0) return;
  }

  const previousX = tank.x;
  moveBoxX(solid, tank, dx, TANK_HALF);
  if (overlapsOther(tank, other)) tank.x = previousX;
  if (Math.abs(tank.x - previousX - dx) > 1e-9) tank.vx = 0; // chocó: pierde la velocidad en este eje

  const previousY = tank.y;
  moveBoxY(solid, tank, dy, TANK_HALF);
  if (overlapsOther(tank, other)) tank.y = previousY;
  if (Math.abs(tank.y - previousY - dy) > 1e-9) tank.vy = 0;
}

// "other" es un tanque (1 contra 1) o una lista de tanques (modo de un jugador; los eliminados no cuentan y uno mismo se salta).
function overlapsOther(tank, other) {
  if (!Array.isArray(other)) return boxesOverlap(tank.x, tank.y, TANK_HALF, other.x, other.y, TANK_HALF);
  for (let i = 0; i < other.length; i++) {
    const o = other[i];
    if (o === tank || !o.alive) continue;
    if (boxesOverlap(tank.x, tank.y, TANK_HALF, o.x, o.y, TANK_HALF)) return true;
  }
  return false;
}
