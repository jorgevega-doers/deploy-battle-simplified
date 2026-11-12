// Mide el ping (ida y vuelta) con el servidor mediante un evento con "ack" (respuesta inmediata).
// Se usa en la pantalla del juego (panel F3).
import { EVENTS } from './events.js';

export function startLatencyProbe(socket, onResult, intervalMs = 2000) {
  const probe = () => {
    if (!socket.connected) return;
    const sentAt = performance.now();
    socket.emit(EVENTS.LATENCY_PING, null, () => onResult(Math.round(performance.now() - sentAt)));
  };
  probe();
  const timer = setInterval(probe, intervalMs);
  return () => clearInterval(timer);
}
