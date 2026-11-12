// Calidad adaptativa: se prioriza la calidad ALTA (nivel 0). Solo si el fotograma medio de una
// ventana de 2 s supera 34 ms (menos de 30 FPS) baja UN nivel, a MEDIA (nivel 1: bloom a menos resolución), y ahí se queda
// (BAJA, nivel 3, solo se elige a mano desde el menú). Nunca vuelve a subir durante la sesión: subir y bajar daría tirones a
// mitad de partida. Niveles: 0 completo, 1 bloom a menos resolución, 2 además resolución de pantalla 1:1, 3 sin bloom.
// Código puro: se prueba en Node con tiempos de fotograma inventados.
export const MAX_QUALITY_LEVEL = 3;

export function createQualityController({ budgetMs = 34, windowMs = 2000, warmupMs = 1200, startLevel = 0, auto = true, maxAutoLevel = 1 } = {}) {
  let level = startLevel;
  let windowStart = null;
  let sum = 0;
  let count = 0;
  let ignoreUntil = 0;

  const reset = () => { windowStart = null; sum = 0; count = 0; };
  return {
    get level() { return level; },
    get auto() { return auto; },
    // Menú: pasar a automático (baja sola si hace falta) o a manual (se queda como está), y fijar un nivel.
    setAuto(on) { auto = on; reset(); },
    setLevel(n) { level = Math.max(0, Math.min(MAX_QUALITY_LEVEL, n)); reset(); },
    // Con el tope de 30 FPS los fotogramas buenos ya duran 33 ms: el límite sube para no bajar la calidad sin motivo.
    setBudget(ms) { budgetMs = ms; reset(); },
    // Se llama una vez por fotograma con lo que ha tardado (ms) y la hora (ms). Devuelve el nuevo nivel si hay que
    // bajar de calidad (para aplicarlo), o null si todo sigue igual.
    update(frameMs, now) {
      if (!auto || level >= maxAutoLevel) return null;
      if (now < ignoreUntil || frameMs > 250) return null; // justo tras un cambio, o parones (pestaña oculta, carga): no cuentan
      if (windowStart === null) windowStart = now;
      sum += frameMs;
      count++;
      if (now - windowStart < windowMs) return null;
      const average = sum / count;
      reset();
      if (average <= budgetMs) return null;
      level++;
      ignoreUntil = now + warmupMs; // los fotogramas del cambio de resolución no se miden
      return level;
    },
  };
}
