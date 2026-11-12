// Acceso con contraseña del modo online (28-oct). Una sola contraseña para todo el sitio; al acertarla el navegador recibe una cookie
// firmada (HttpOnly, SameSite=Lax, "Secure" detrás de HTTPS) que caduca a las 12 h. Los jugadores NO la necesitan: entran en su sala
// por la cola común (JUGAR) y solo pueden jugar.
// Qué hace: comprobar la contraseña en tiempo constante, firmar y verificar la cookie y limitar los intentos fallidos por IP.
// Qué NO hace: no guarda nada en disco (si el servidor se reinicia sin SESSION_SECRET, hay que volver a entrar) ni conoce las salas.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'df_auth';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000; // ventana de intentos
const MAX_FAILS = 8;              // fallos permitidos por IP en esa ventana

const ROLES = ['user', 'dev'];

// devPassword (opcional) abre el modo desarrollador: la misma cookie lleva el rol 'dev' y el menú completo de pruebas.
// Sin "password" el sitio es abierto y solo existe el rol 'dev' (página /db-admin/ con DEV_PASSWORD).
export function createAuth({ password = '', devPassword = '', secret = '', now = () => Date.now() }) {
  const key = secret || randomBytes(32).toString('hex');
  const sign = (value) => createHmac('sha256', key).update(value).digest('base64url');
  const digest = (text) => createHash('sha256').update(text).digest();
  const expected = password ? digest(password) : null;
  const expectedDev = devPassword ? digest(devPassword) : null;
  const same = (input, hash) => typeof input === 'string' && input.length <= 200 && timingSafeEqual(digest(input), hash);
  // Valor de la cookie: "caducidad.rol.firma"; el rol va firmado, no se puede cambiar sin la clave.
  const parse = (token) => {
    if (typeof token !== 'string') return null;
    const [expires, role, signature] = token.split('.');
    if (!expires || !signature || !/^\d{10,15}$/.test(expires) || !ROLES.includes(role)) return null;
    const good = Buffer.from(sign(`${expires}.${role}`));
    const given = Buffer.from(signature);
    return good.length === given.length && timingSafeEqual(good, given) && Number(expires) > now() ? role : null;
  };
  const fails = new Map(); // ip -> { count, resetAt }

  const api = {
    // Compara en tiempo constante (sin revelar cuántas letras coinciden).
    checkPassword: (input) => (expected ? same(input, expected) : false),
    // 'dev' | 'user' | null. Se comparan las dos siempre (mismo tiempo acierte la que acierte).
    login(input) {
      const dev = expectedDev ? same(input, expectedDev) : false;
      const user = expected ? same(input, expected) : false;
      return dev ? 'dev' : user ? 'user' : null;
    },
    issueToken(role = 'user') {
      const expires = String(now() + MAX_AGE_MS);
      return `${expires}.${role}.${sign(`${expires}.${role}`)}`;
    },
    verifyToken: (token) => parse(token) !== null,
    // Lee la cookie de acceso de una cabecera "Cookie".
    tokenFrom(cookieHeader) {
      if (typeof cookieHeader !== 'string') return null;
      for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE_NAME) return rest.join('=');
      }
      return null;
    },
    isAuthed: (headers) => api.verifyToken(api.tokenFrom(headers?.cookie)),
    roleOf: (headers) => parse(api.tokenFrom(headers?.cookie)), // 'user' | 'dev' | null
    setCookie: (token, secure) => `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${secure ? '; Secure' : ''}`,
    clearCookie: (secure) => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
    // Limitador de intentos fallidos por IP. blockedFor(ip) = segundos que le faltan si está bloqueada (0 = puede intentar).
    blockedFor(ip) {
      const entry = fails.get(ip);
      if (!entry || entry.resetAt <= now()) return 0;
      return entry.count >= MAX_FAILS ? Math.ceil((entry.resetAt - now()) / 1000) : 0;
    },
    recordFail(ip) {
      const entry = fails.get(ip);
      if (!entry || entry.resetAt <= now()) fails.set(ip, { count: 1, resetAt: now() + WINDOW_MS });
      else entry.count++;
      if (fails.size > 5000) for (const [k, v] of fails) if (v.resetAt <= now()) fails.delete(k); // no crece sin límite
    },
    clearFails: (ip) => fails.delete(ip),
  };
  return api;
}

// Limitador simple por IP para otras acciones (crear salas): máximo "limit" cada "windowMs".
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return (ip) => {
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now()) { hits.set(ip, { count: 1, resetAt: now() + windowMs }); return true; }
    entry.count++;
    return entry.count <= limit;
  };
}
