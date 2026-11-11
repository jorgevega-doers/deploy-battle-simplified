// Textos cortos del modo de juego (los usan el host y el mando, así dicen siempre lo mismo). Código puro, sin servidor ni navegador.
// plan = { kind, humans, bots, teams } (server/game/modes.js) o null si aún no hay nadie.
export function describePlan(plan) {
  if (!plan) return 'ESPERANDO JUGADORES';
  if (plan.kind === 'solo') return '1 JUGADOR VS 3 BOTS';
  if (plan.kind === 'duel') return '1 CONTRA 1';
  if (plan.teams) return 'EQUIPOS 2 CONTRA 2';
  const bots = plan.bots > 0 ? ` + ${plan.bots} BOT${plan.bots > 1 ? 'S' : ''}` : '';
  return `${plan.humans} JUGADORES${bots} · TODOS CONTRA TODOS`;
}

// Nombre del equipo de un tanque (A o B), o null si no hay equipos.
export const teamLetter = (plan, tankIndex) => (plan?.teams ? 'AB'[plan.teams[tankIndex]] : null);
