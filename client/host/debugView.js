// Vista 2D provisional de la arena: sirve para ver y probar la partida antes del 3D (Día 3) y quedará como
// ayuda de depuración. Solo dibuja: no calcula nada del juego.
import { POWERUP_TYPES, TANK_HALF, AIM_ASSIST_LENGTH } from '../../shared/constants.js';
import { tracePath } from '../../shared/geometry.js';

const COLORS = {
  floor: '#05050c',
  grid: '#10102a',
  wall: '#0003ad',
  wallEdge: '#4a52ff',
  tanks: ['#4a52ff', '#ff0080', '#18d8c8', '#ffb81c'], // P1 azul brillante (variante del azul de marca), P2 fucsia, bots cian y ámbar
  projectile: '#ffffff',
  projectileAoe: '#00f0ff',
  powerups: { double: '#ffd400', speed: '#00f0ff', aoe: '#ff9a00', shield: '#5be38f' },
};
const POWERUP_LETTER = { double: 'D', speed: 'S', aoe: 'A', shield: 'E' };
const AIM_BOUNCES = 2; // la línea de apuntado enseña como mucho 2 rebotes (AGENTS.md, sección 5)

export function createDebugView(canvas, arena) {
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / arena.width; // el canvas debe tener la misma proporción que la arena (16:9)
  const walls = arena.wallCells();
  const path = [];
  // El mundo tiene el eje Y hacia arriba; el canvas lo tiene hacia abajo.
  const px = (x) => x * cell;
  const py = (y) => canvas.height - y * cell;

  function drawStatic() {
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= arena.width; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
    }
    for (let i = 0; i <= arena.height; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }
    for (const [x, y] of walls) {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(px(x), py(y + 1), cell, cell);
      ctx.strokeStyle = COLORS.wallEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(px(x) + 1, py(y + 1) + 1, cell - 2, cell - 2);
    }
  }

  return {
    // state: el último state_update recibido (o null si aún no hay partida).
    render(state) {
      drawStatic();
      if (!state) return;

      for (const [, typeIndex, x, y] of state.powerups) {
        const type = POWERUP_TYPES[typeIndex];
        ctx.fillStyle = COLORS.powerups[type];
        ctx.fillRect(px(x) - cell * 0.35, py(y) - cell * 0.35, cell * 0.7, cell * 0.7);
        ctx.fillStyle = '#05050c';
        ctx.font = `bold ${cell * 0.5}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(POWERUP_LETTER[type], px(x), py(y) + 1);
      }

      state.tanks.forEach(([x, y, aim, , dashing], i) => {
        // Línea de apuntado: usa la misma geometría que la simulación del servidor (shared/geometry.js).
        tracePath(arena.solid, x, y, aim, AIM_BOUNCES, AIM_ASSIST_LENGTH, path);
        ctx.strokeStyle = COLORS.tanks[i];
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(px(path[0]), py(path[1]));
        for (let k = 2; k < path.length; k += 2) ctx.lineTo(px(path[k]), py(path[k + 1]));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = COLORS.tanks[i];
        ctx.fillRect(px(x - TANK_HALF), py(y + TANK_HALF), cell, cell);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px(x - TANK_HALF) + 1, py(y + TANK_HALF) + 1, cell - 2, cell - 2);
        if (dashing) { // halo de acento mientras dura el dash
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 4;
          ctx.strokeRect(px(x - TANK_HALF) - 4, py(y + TANK_HALF) - 4, cell + 8, cell + 8);
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.beginPath(); // cañón
        ctx.moveTo(px(x), py(y));
        ctx.lineTo(px(x) + Math.cos(aim) * cell * 0.7, py(y) - Math.sin(aim) * cell * 0.7);
        ctx.lineWidth = 5;
        ctx.stroke();
      });

      for (const [, x, y, aoe] of state.projectiles) {
        ctx.fillStyle = aoe ? COLORS.projectileAoe : COLORS.projectile;
        ctx.fillRect(px(x) - 4, py(y) - 4, 8, 8);
      }

      if (state.frozen) {
        ctx.fillStyle = 'rgba(5, 5, 12, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  };
}
