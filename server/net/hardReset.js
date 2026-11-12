// Reinicio de la sala (menú de pruebas del modo dev): vacía las plazas y expulsa a los jugadores. Las pantallas se quedan conectadas.
// También cancela la partida en marcha (session.reset()) y devuelve la sesión al lobby.
import { EVENTS } from '../../shared/events.js';

// ns = el espacio de nombres de la sala: se usa su lista de sockets.
export function performHardReset(ns, slots, session) {
  slots.clear();
  session.reset();
  const sockets = ns.sockets instanceof Map ? ns.sockets : ns.sockets.sockets;
  for (const socket of sockets.values()) {
    if (socket.rooms.has('host')) continue;
    // Primero el aviso (el mando muestra el motivo) y después se cierra la conexión.
    socket.emit(EVENTS.FORCE_DISCONNECT, { reason: 'hard_reset' });
    socket.disconnect(true);
  }
}
