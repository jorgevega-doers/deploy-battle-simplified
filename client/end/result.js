// Lee el resultado del jugador que el servidor pone en la dirección (/end/?i=ABC&s=3218&r=3&l=2&a=45.5&o=w&p=1).
// Es solo para enseñarlo: cualquiera podría escribir esa dirección a mano, así que NUNCA se usa para nada importante.
// Todo se valida y se enseña como texto (nunca como HTML).
export function parseResult(search) {
  const params = new URLSearchParams(search);
  const initials = params.get('i') ?? '';
  const score = Number(params.get('s'));
  if (!/^[A-Z]{3}$/.test(initials) || !Number.isInteger(score) || score < 0 || score > 1_000_000) return null;

  const rankText = params.get('r');
  const rank = /^\d{1,6}$/.test(rankText ?? '') ? Number(rankText) : null;
  const lives = Number(params.get('l'));
  const accuracy = Number(params.get('a'));
  const outcome = ['w', 'l', 'd'].includes(params.get('o')) ? params.get('o') : null;
  return {
    initials,
    score,
    rank,
    lives: Number.isInteger(lives) && lives >= 0 && lives <= 9 ? lives : null,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100 ? accuracy : null,
    outcome,
    slot: ['1', '2', '3', '4'].includes(params.get('p')) ? Number(params.get('p')) : null, // solo para el color de las iniciales
  };
}

export const OUTCOME_TEXT = { w: 'GANASTE', l: 'BUEN INTENTO', d: 'EMPATE' };
