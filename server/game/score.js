// Puntuación única para todos los modos: máximo SCORE_MAX en cualquier modo y cada factor medido en proporción a lo que
// permite ese modo (no en valores absolutos), para que el Top 10 general sea justo. Contra bots pesan menos el daño y la puntería y más
// sobrevivir y ganar rápido. Lógica pura: match.js le pasa los datos de la partida. Qué NO hace: decidir quién gana ni quién puntúa 0
// (abandonos y quien no acierta nada; eso lo decide match.js).
export const SCORE_MAX = 10000;
export const SCORE_WEIGHTS = {
  humans: { result: 3000, damage: 2500, survival: 1500, accuracy: 1500, speed: 1000, bank: 500 }, // 1 contra 1 y todos contra todos
  bots: { result: 3000, damage: 1500, survival: 2500, accuracy: 800, speed: 1700, bank: 500 },    // 1 contra 3 bots
};
// Tiempo de referencia por modo (s): ganar antes de él da toda la rapidez; después baja en línea recta hasta 0 a las SPEED_ZERO_PARS veces el tiempo
// de referencia. Calibrado con partidas simuladas (29-oct): los ganadores tardan de media ~28 s en 1 contra 1, ~36 s contra bots y ~21 s en todos contra todos.
export const PAR_SECONDS = { duel: 20, solo: 25, brawl: 15 };
export const SPEED_ZERO_PARS = 4;
// Con varios rivales (contra bots o todos contra todos) los rivales también se golpean entre sí: quitar esta parte de sus vidas ya da todo el daño.
export const DAMAGE_SHARE_MULTI = 0.5;
export const ACCURACY_MIN_SHOTS = 8; // con menos disparos no se llega a la precisión máxima (dos tiros con suerte no valen un 100 %)
export const BANK_HITS_FULL = 3;     // golpes de rebote para el máximo del factor de rebotes
// En todos contra todos el resultado depende del puesto: 1.º, 2.º, 3.º y 4.º.
export const PLACE_FACTOR = [1, 0.5, 0.25, 0];

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// Rapidez (0-1): solo para quien gana. elapsed = segundos de partida jugados.
export function speedFactor({ won, elapsed, matchSeconds, par }) {
  if (!won) return 0;
  if (elapsed <= par) return 1;
  const zeroAt = Math.min(matchSeconds, par * SPEED_ZERO_PARS);
  return clamp01((zeroAt - elapsed) / Math.max(1, zeroAt - par));
}

// Precisión (0-1): aciertos / disparos, rebajada si hubo pocos disparos.
export function accuracyFactor(hits, shots) {
  if (shots <= 0) return 0;
  return clamp01(hits / shots) * Math.min(1, shots / ACCURACY_MIN_SHOTS);
}

// Factores de 0 a 1 de un jugador. Datos: result (0-1, ver PLACE_FACTOR), hits (golpes a rivales), enemyLives (vidas iniciales de todos sus
// rivales), rivals (cuántos), livesLeft y livesStart (las suyas), shots, bankHits (golpes que rebotaron antes de dar), won, elapsed, matchSeconds, par.
export function scoreFactors(d) {
  const damageTarget = d.enemyLives * ((d.rivals ?? 1) > 1 ? DAMAGE_SHARE_MULTI : 1);
  return {
    result: clamp01(d.result),
    damage: damageTarget > 0 ? clamp01(d.hits / damageTarget) : 0,
    survival: d.livesStart > 0 ? clamp01(d.livesLeft / d.livesStart) : 0,
    accuracy: accuracyFactor(d.hits, d.shots),
    speed: speedFactor(d),
    bank: clamp01(d.bankHits / BANK_HITS_FULL),
  };
}

// Puntos (entero de 0 a SCORE_MAX). vsBots elige los pesos del modo contra bots.
export function calculateScore(data, { vsBots = false } = {}) {
  const weights = vsBots ? SCORE_WEIGHTS.bots : SCORE_WEIGHTS.humans;
  const factors = scoreFactors(data);
  let total = 0;
  for (const key of Object.keys(weights)) total += weights[key] * factors[key];
  return Math.max(0, Math.min(SCORE_MAX, Math.round(total)));
}

// Precisión en % (0-100, un decimal): impactos / disparos. Sin disparos es 0. Es la que se guarda y se enseña (sin la rebaja por pocos disparos).
export function calculateAccuracy(hits, shots) {
  if (shots <= 0) return 0;
  return Math.min(100, Math.round((hits / shots) * 1000) / 10);
}
