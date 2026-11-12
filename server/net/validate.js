// Validación de datos que llegan de los navegadores. Nunca se confía en lo que envía el cliente.

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Pad de movimiento: { x, y } con números entre -1 y 1. Devuelve null si el mensaje no es válido.
export function parsePadMove(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { x, y } = payload;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}

// Paquete compacto del mando: [x, y, a] con x e y enteros en -100..100 (centésimas del pad) y a = ángulo en centésimas de radián o null (sin cambios).
// Devuelve { x, y, angle|null } (x e y en -1..1) o null si no es válido.
export function parsePad(payload) {
  if (!Array.isArray(payload) || payload.length < 2 || payload.length > 3) return null;
  const [x, y, a] = payload;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (a !== undefined && a !== null && !Number.isFinite(a)) return null;
  return { x: clamp(x / 100, -1, 1), y: clamp(y / 100, -1, 1), angle: a === undefined || a === null ? null : a / 100 };
}

// Ángulo que acompaña a un disparo (centésimas de radián), o null.
export function parseFireAngle(payload) {
  return Number.isFinite(payload) ? payload / 100 : null;
}

// Pad de apuntado: { angle } en radianes (cualquier número finito). Devuelve el ángulo o null si no es válido.
export function parseAim(payload) {
  if (!payload || typeof payload !== 'object' || !Number.isFinite(payload.angle)) return null;
  return payload.angle;
}

// Token secreto de reconexión (lo inventa cada pestaña): 16-64 caracteres seguros, o null.
export function parseToken(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? raw : null;
}

// Devuelve las iniciales normalizadas (3 letras A-Z en mayúsculas) o null si no son válidas.
export function parseInitials(raw, blocked = []) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) return null;
  if (blocked.includes(value)) return null;
  return value;
}

// Id de la pantalla de un jugador (sale en lobby_state para que cada pantalla marque su tanque con TÚ): texto corto y sin símbolos.
export function parseScreenId(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(raw) ? raw : null;
}
