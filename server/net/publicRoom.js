// Sala de la versión pública (6-nov): quién es la pantalla ANFITRIONA y el marcador de victorias de la sala.
// La anfitriona es la pantalla que creó la sala (trae la llave secreta que dio POST /api/rooms). Solo ella elige mapa y dificultad y puede
// reiniciar la sala con la R. Si se va y no vuelve en PROMOTE_MS, la pantalla más antigua que quede pasa a ser la anfitriona (recibe una llave nueva).
// Marcador: victorias de cada jugador mientras dura la sala (en memoria; se pierde al cerrarse). Es lo que pica entre amigos.
// Qué NO hace: no sabe de reglas de juego ni de plazas; sockets.js lo llama en sus manejadores.
import { randomBytes } from 'node:crypto';
import { EVENTS } from '../../shared/events.js';
import { parseScreenId } from './validate.js';

const PROMOTE_MS = 15000;
const MAX_WINS_SHOWN = 3; // el podio de la sala: cabe en la columna lateral (240 x 560) junto al mapa y la dificultad
export const newHostKey = () => randomBytes(18).toString('base64url');

// room = { code, hostKey, ... } (rooms.js); ns = su espacio de nombres; changed() = avisar a todos del nuevo estado del lobby.
export function createPublicRoom({ room, ns, changed, promoteMs = PROMOTE_MS }) {
  const wins = new Map(); // nombre -> victorias
  let promoteTimer = null;
  const screens = () => [...ns.sockets.values()].filter((s) => s.rooms.has('host')); // en orden de llegada
  const current = () => screens().find((s) => s.data.anfitrion) ?? null;

  function makeHost(socket) {
    for (const s of screens()) s.data.anfitrion = false;
    socket.data.anfitrion = true;
    room.hostScreen = socket.data.screen;
    clearTimeout(promoteTimer);
    promoteTimer = null;
  }
  // Nadie es anfitrión: la pantalla más antigua lo pasa a ser con una llave nueva (la anterior deja de valer).
  function promote() {
    promoteTimer = null;
    if (current()) return;
    const next = screens()[0];
    if (!next) { room.hostScreen = null; room.hostKey = null; return; } // sin pantallas: la primera que llegue será la anfitriona
    room.hostKey = newHostKey();
    makeHost(next);
    next.emit(EVENTS.HOST_KEY, { hostKey: room.hostKey });
    changed();
  }

  return {
    // host_join { screen, hostKey }: la pantalla se identifica y, si trae la llave buena, es la anfitriona. Si la sala no tiene llave (restaurada
    // tras reiniciar el servidor sin ella, o se quedó sin pantallas), la primera que llega lo es y recibe una llave nueva.
    join(socket, payload) {
      socket.data.screen = parseScreenId(payload?.screen) ?? socket.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
      const key = parseScreenId(payload?.hostKey);
      if (key && room.hostKey && key === room.hostKey) makeHost(socket);
      else if (!room.hostKey) { room.hostKey = newHostKey(); makeHost(socket); socket.emit(EVENTS.HOST_KEY, { hostKey: room.hostKey }); }
    },
    isHost: (socket) => socket.data.anfitrion === true,
    leave(socket) {
      if (!socket.data.anfitrion) return;
      socket.data.anfitrion = false;
      clearTimeout(promoteTimer);
      promoteTimer = setTimeout(promote, promoteMs); // da tiempo a recargar la página (vuelve con su llave)
      promoteTimer.unref?.();
    },
    // Suma una victoria a cada ganador humano (los bots no cuentan).
    recordResult(result) {
      const winners = result.winners ?? (result.winner === null ? [] : [result.winner]);
      for (const slot of winners) {
        const s = result.scores[slot - 1];
        if (!s || s.bot || !s.initials) continue;
        wins.set(s.initials, (wins.get(s.initials) ?? 0) + 1);
      }
    },
    // Para lobby_state.room: qué pantalla es la anfitriona y el marcador (de más a menos victorias).
    info: () => ({
      hostScreen: room.hostScreen ?? null,
      wins: [...wins].sort((a, b) => b[1] - a[1]).slice(0, MAX_WINS_SHOWN).map(([name, n]) => ({ name, wins: n })),
    }),
    reset() { wins.clear(); },
    dispose() { clearTimeout(promoteTimer); },
  };
}
