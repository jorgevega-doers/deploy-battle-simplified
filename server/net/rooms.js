// Registro de salas. Cada sala es un espacio de nombres de Socket.io ("/r/CODIGO") con su propia sesión de juego y sus propias plazas: dos
// salas nunca se mezclan. Una sala se crea con un código al azar de 5 caracteres (sin letras ni números que se confunden), se borra sola
// cuando lleva un rato sin nadie conectado y hay un tope de salas a la vez. Todas son de la cola común (JUGAR en el título).
// Qué hace: crear, buscar y borrar salas. Qué NO hace: no sabe de reglas de juego (build() lo construye online.js).
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0 ni 1
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const PENDING_MS = 12000; // reserva de un hueco en la cola común mientras se abre la pantalla
const EMPTY_MS = 30000; // una sala sin nadie se borra pasado este tiempo (si idleMs no es menor)
let anonymous = 0; // reservas sin token: cada una con su propia clave

// Reservas de la cola común: room.pending = Map(dueño -> cuándo). El dueño es el token de la pestaña que pidió sala (el mismo con el que luego
// entra o recupera su plaza); sin token, una clave anónima. Así, al entrar alguien se gasta SU reserva y no la de otro que también está llegando.
export function reserve(room, token, at) {
  room.pending.set(token ?? `anon:${(anonymous += 1)}`, at);
}
// Alguien ha entrado en la sala: se gasta su reserva. fresh = entra por primera vez (no es una reconexión): si no tenía reserva con su token,
// se gasta la anónima más vieja. Una reconexión nunca gasta reservas ajenas.
export function claimReservation(room, token, { fresh = false } = {}) {
  if (!room?.pending) return;
  if (token && room.pending.delete(token)) return;
  if (!fresh) return;
  for (const key of room.pending.keys()) if (key.startsWith('anon:')) { room.pending.delete(key); return; }
}

// build(room) -> { ns, session, slots }: crea el espacio de nombres y la sesión de esa sala (lo hace online.js).
export function createRoomRegistry({ build, destroyNamespace, maxRooms, idleMs, now = () => Date.now() }) {
  const rooms = new Map();

  const newCode = () => {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
    return null;
  };

  const registry = {
    // Devuelve la sala nueva o null si ya hay demasiadas.
    // dev: sala abierta en modo desarrollador; su ranking va aparte y la cola común solo la junta con otras salas dev.
    // code: se usa para RESTAURAR una sala con su código (el servidor se reinició con un despliegue nuevo y la pantalla vuelve a conectar).
    create({ dev = false, code: wanted = null } = {}) {
      if (rooms.size >= maxRooms) return null;
      if (wanted !== null && (!CODE_RE.test(wanted) || rooms.has(wanted))) return null;
      const code = wanted ?? newCode();
      if (!code) return null;
      const room = { code, dev, createdAt: now(), emptySince: null, screens: () => 0, pending: new Map() };
      Object.assign(room, build(room));
      rooms.set(code, room);
      return room;
    },
    // Cola común (JUGAR): la sala que espera gente y tiene hueco. Se prefiere la más llena (así las partidas arrancan antes).
    // Cada búsqueda reserva un hueco durante PENDING_MS (lo que tarda la pantalla en entrar), para no mandar a 5 personas a 4 plazas.
    // players(room) = jugadores dentro ahora; open(room) = la sala admite gente (fase de espera). Devuelve la sala (ya con la reserva) o null.
    // token = el de la pestaña (o null). holds(room, token) = ya tiene plaza en esa sala (recargó la página dentro de ella).
    findQuick({ dev = false, players, open, token = null, holds = () => false }) {
      const candidates = [...rooms.values()].filter((room) => room.dev === dev && open(room));
      for (const room of candidates) for (const [key, t] of room.pending) if (now() - t >= PENDING_MS) room.pending.delete(key);
      // Ya tiene plaza (recarga) o reserva (doble clic en JUGAR) en una sala: vuelve a ESA, sin ocupar otro hueco.
      const own = token ? candidates.find((room) => holds(room, token) || room.pending.has(token)) : null;
      if (own) { if (own.pending.has(token)) reserve(own, token, now()); return own; }
      let best = null;
      let bestCount = -1;
      for (const room of candidates) {
        const count = players(room) + room.pending.size;
        if (count < 1 || count >= 4) continue; // vacía (nadie la está usando) o llena
        if (count > bestCount) { best = room; bestCount = count; }
      }
      if (best) reserve(best, token, now());
      return best;
    },
    get: (code) => (typeof code === 'string' ? rooms.get(code.toUpperCase()) ?? null : null),
    all: () => [...rooms.values()],
    get size() { return rooms.size; },
    destroy(code) {
      const room = rooms.get(code);
      if (!room) return;
      rooms.delete(code);
      destroyNamespace(room);
    },
    // Borra las salas que llevan un rato sin ningún socket conectado. Se llama cada pocos segundos.
    sweep() {
      for (const room of rooms.values()) {
        if (room.ns.sockets.size > 0) { room.emptySince = null; continue; }
        room.emptySince ??= now();
        if (now() - room.emptySince > Math.min(idleMs, EMPTY_MS)) registry.destroy(room.code);
      }
    },
  };
  return registry;
}
