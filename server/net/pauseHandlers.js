// Pausa y SALIR. Eventos del teclado de cada jugador (teclado y ratón o mando del PC):
//  - pause_request { on }: congela la partida (pause.js: 10 s como mucho, 2 por partida, 30 s entre pausas). Con otra gente en la partida (cada uno
//    en su pantalla) no se congela nada: se responde { denied: 'online' } y el menú es solo de quien lo abrió.
//  - player_quit: en partida, pierde por abandono al momento (la partida sigue con los demás); en la espera, deja su hueco.
// Qué NO hace: no decide nada del juego (session.js); solo valida quién lo pide y en qué momento.
import { EVENTS } from '../../shared/events.js';

export function registerPauseHandlers(socket, { slots, session, releaseSlot, broadcastLobby }) {
  socket.on(EVENTS.PAUSE_REQUEST, (payload) => {
    try {
      const entry = slots.get(socket.id);
      if (!entry || session.phase !== 'PLAYING') return;
      const on = payload?.on !== false;
      // Cada uno en su pantalla y con otra gente: la partida no se para por nadie.
      if (on && (session.plan?.humans ?? 1) >= 2) { socket.emit(EVENTS.PAUSE_STATE, { denied: 'online' }); return; }
      const result = session.requestPause(entry.slot, on);
      if (result && result.denied) socket.emit(EVENTS.PAUSE_STATE, result);
    } catch (err) {
      console.error('pause_request falló:', err);
    }
  });

  socket.on(EVENTS.PLAYER_QUIT, () => {
    try {
      const entry = slots.get(socket.id);
      if (!entry) return;
      if (session.phase === 'PLAYING') { session.quit(entry.slot); return; } // la plaza sigue hasta el final (resultados), ya sin jugar
      if (session.phase === 'LOBBY' || session.phase === 'READY') { releaseSlot(socket.id); broadcastLobby(); }
    } catch (err) {
      console.error('player_quit falló:', err);
    }
  });
}
