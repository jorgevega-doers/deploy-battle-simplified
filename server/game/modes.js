// Modo de juego a partir de cuántos jugadores hay. Lógica pura, sin red ni reloj.
//   1 jugador  -> "solo": él contra 3 bots (los bots SOLO existen en este caso).
//   2 jugadores -> "duel": 1 contra 1.
//   3 jugadores -> "brawl" de 3 (todos contra todos, sin bots).
//   4 jugadores -> "brawl" de 4 (todos contra todos, sin bots). Se quitaron los equipos 2 contra 2 y el relleno con bots (29-oct).
// "brawl" = todos a la vez: el golpeado reaparece en la esquina más lejana (o queda eliminado sin vidas) y la partida sigue sin pausas.
// Un plan es { kind, humans, bots, teams } con teams = null (cada uno por su cuenta) o el equipo (0 / 1) de cada tanque.
export const TEAMS_2V2 = Object.freeze([0, 1, 0, 1]);

export function planFor(humans) {
  if (!(humans >= 1)) return null;
  if (humans === 1) return { kind: 'solo', humans: 1, bots: 3, teams: null };
  if (humans === 2) return { kind: 'duel', humans: 2, bots: 0, teams: null };
  return { kind: 'brawl', humans: Math.min(humans, 4), bots: 0, teams: null };
}

// Número de tanques de un plan.
export const tankCount = (plan) => (plan ? plan.humans + plan.bots : 0);
