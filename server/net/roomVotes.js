// Votación de mapa y dificultad en las partidas públicas (versión pública, 10-nov): entre desconocidos nadie es anfitrión, así que por defecto
// el mapa es ALEATORIO y la dificultad MEDIA, y cada pantalla (un jugador) puede votar otra cosa. Gana lo más votado; si hay empate, al azar
// entre los empatados. Lógica pura (sin sockets): sockets.js la llama y aplica el resultado a la sesión.
export const LEVELS = ['stand', 'media', 'pro'];
const DEFAULTS = { map: 'random', level: 'media' };

// rng: () => [0, 1). mapCount: cuántos mapas hay (las opciones son 'random' y 0..mapCount-1).
export function createRoomVotes({ rng = Math.random, mapCount = 3 } = {}) {
  const votes = { map: new Map(), level: new Map() }; // quién (id de la pantalla) -> qué votó

  const valid = (kind, value) => (kind === 'map'
    ? value === 'random' || (Number.isInteger(value) && value >= 0 && value < mapCount)
    : LEVELS.includes(value));

  function tally(kind) {
    const counts = new Map();
    for (const value of votes[kind].values()) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }

  // Lo que sale ahora: sin votos, lo de por defecto; si no, lo más votado (empate: al azar entre los empatados).
  function result(kind) {
    const counts = tally(kind);
    if (!counts.size) return DEFAULTS[kind];
    const best = Math.max(...counts.values());
    const tied = [...counts].filter(([, n]) => n === best).map(([value]) => value);
    return tied.length === 1 ? tied[0] : tied[Math.floor(rng() * tied.length)];
  }

  return {
    valid,
    // Registra (o cambia) el voto de una pantalla. Devuelve el resultado nuevo, o null si el voto no vale.
    vote(who, kind, value) {
      if (!(kind in votes) || !valid(kind, value)) return null;
      votes[kind].set(who, value);
      return result(kind);
    },
    // La pantalla se fue: su voto deja de contar. Devuelve { map, level } con el resultado nuevo.
    forget(who) {
      const had = votes.map.delete(who) | votes.level.delete(who);
      return had ? { map: result('map'), level: result('level') } : null;
    },
    mine(who) { return { map: votes.map.get(who) ?? null, level: votes.level.get(who) ?? null }; },
    // Para enseñar en las pantallas: cuántos votos lleva cada opción ({ map: { random: 1, '0': 2 }, level: { pro: 1 } }).
    info() { return { map: Object.fromEntries(tally('map')), level: Object.fromEntries(tally('level')) }; },
  };
}
