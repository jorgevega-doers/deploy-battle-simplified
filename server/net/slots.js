// Gestión de las plazas de jugador (P1..P4; 2 en las salas online de dos pantallas). Solo guarda quién ocupa cada plaza; no sabe de
// sockets reales, solo de sus identificadores, por eso se puede probar sin red.
export const MAX_PLAYERS = 4;

export function createSlots(max = MAX_PLAYERS) {
  const slots = Array(max).fill(null); // índice 0 = P1...; cada plaza guarda { socketId, initials, token }
  const bySocket = new Map(); // socketId -> { slot, initials }

  return {
    max,
    // Devuelve { slot, initials } (1..max) o null si no queda ninguna plaza libre.
    // Si ese socket ya tenía plaza, devuelve la que tiene (no duplica).
    // wanted (solo en las salas online): pide ESE puesto; si está ocupado devuelve null.
    // token (opcional): secreto que genera el mando; si se corta la conexión, con él recupera su plaza (ver rebind).
    // meta (versión pública): { device: 'phone' | 'pad', screen: id de la pantalla a la que se vinculó }; viaja con la plaza al compactar.
    assign(socketId, initials, wanted = null, token = null, meta = null) {
      const existing = bySocket.get(socketId);
      if (existing) return existing;
      const index = Number.isInteger(wanted) && wanted >= 1 && wanted <= max ? (slots[wanted - 1] === null ? wanted - 1 : -1) : slots.indexOf(null);
      if (index === -1) return null;
      slots[index] = { socketId, initials, token, meta };
      const entry = { slot: index + 1, initials };
      bySocket.set(socketId, entry);
      return entry;
    },
    // Libera la plaza de un socket. Devuelve true si tenía una.
    release(socketId) {
      const entry = bySocket.get(socketId);
      if (!entry) return false;
      slots[entry.slot - 1] = null;
      bySocket.delete(socketId);
      return true;
    },
    // Un mando que se reconecta (socket nuevo) recupera su plaza con su token. Devuelve { slot, initials, oldSocketId } o null.
    rebind(token, socketId) {
      if (!token) return null;
      const index = slots.findIndex((s) => s && s.token === token);
      if (index === -1) return null;
      const oldSocketId = slots[index].socketId;
      if (oldSocketId === socketId) return null;
      bySocket.delete(oldSocketId);
      slots[index].socketId = socketId;
      const entry = { slot: index + 1, initials: slots[index].initials };
      bySocket.set(socketId, entry);
      return { ...entry, oldSocketId };
    },
    get: (socketId) => bySocket.get(socketId) ?? null,
    // ¿Alguna plaza es de este token? (la cola común devuelve a su sala a quien recarga la página)
    holds: (token) => Boolean(token) && slots.some((s) => s?.token === token),
    // ¿La plaza de este socket tiene token? (el mando real siempre lo manda: con él puede volver tras un corte)
    hasToken: (socketId) => Boolean(slots[(bySocket.get(socketId)?.slot ?? 0) - 1]?.token),
    // Identificador del socket que ocupa la plaza (1..max), o null si está libre.
    socketId: (slot) => slots[slot - 1]?.socketId ?? null,
    isFull: () => slots.every(Boolean),
    isFree: (slot) => slots[slot - 1] === null,
    occupancy: () => slots.map(Boolean),
    initials: () => slots.map((s) => s?.initials ?? null),
    meta: () => slots.map((s) => s?.meta ?? null),
    // Cambia con qué juega una plaza (el móvil toma el relevo del teclado, o al revés). Mantiene la pantalla a la que está vinculada.
    setDevice(socketId, device) {
      const entry = bySocket.get(socketId);
      const slot = entry ? slots[entry.slot - 1] : null;
      if (slot) slot.meta = { ...(slot.meta ?? {}), device };
    },
    // Cambia el nombre de la plaza de un socket. Devuelve { slot, initials } o null si no tiene plaza.
    rename(socketId, initials) {
      const entry = bySocket.get(socketId);
      if (!entry) return null;
      entry.initials = initials;
      slots[entry.slot - 1].initials = initials;
      return { slot: entry.slot, initials };
    },
    // Ids de socket de todas las plazas ocupadas (para liberar las de mandos que ya no están).
    socketIds: () => slots.filter(Boolean).map((s) => s.socketId),
    // Número de jugadores dentro.
    count: () => slots.filter(Boolean).length,
    // Cuando alguien se va del lobby, los que quedan se corren hacia P1 para que los jugadores sean siempre P1..Pn (los tanques de
    // la partida van en ese orden). Devuelve [{ socketId, slot, initials }] de los que han cambiado de número.
    compact() {
      const moved = [];
      const present = slots.filter(Boolean);
      slots.fill(null);
      present.forEach((entry, index) => {
        slots[index] = entry;
        const known = bySocket.get(entry.socketId);
        if (known.slot !== index + 1) { known.slot = index + 1; moved.push({ socketId: entry.socketId, slot: index + 1, initials: entry.initials }); }
      });
      return moved;
    },
    // Vacía todas las plazas (reset global).
    clear() {
      slots.fill(null);
      bySocket.clear();
    },
  };
}
