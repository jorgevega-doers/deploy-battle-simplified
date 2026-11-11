// Reset global: vacía las plazas y expulsa a todos los mandos. El host se queda conectado.
// También cancela la partida en marcha (session.reset()) y devuelve la sesión al lobby.
import { EVENTS } from '../../shared/events.js';

// ns = el espacio de nombres de la sala (o el Server en el modo del stand): se usa su lista de sockets.
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
