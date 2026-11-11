// Mide el ping (ida y vuelta) con el servidor mediante un evento con "ack" (respuesta inmediata).
// Se usa en el host (panel F3) y en el mando; también servirá para la prueba del túnel con 4G.
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
