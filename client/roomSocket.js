// Qué sala usa esta pestaña: la dirección lleva ?room=CODIGO (lo pone boot.js al encontrar sala con JUGAR). Y la identidad de la pestaña: su token
// (para recuperar la plaza tras un corte) y su id de pantalla (para marcar su tanque con TÚ), además del nombre de 3 letras de la última vez.
// Qué NO hace: no abre el socket por su cuenta (main.js y keyboardPlayer.js llaman a connectToRoom con su "io").
const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
// Se lee de la dirección al cargar y otra vez con readRoomFromUrl() (boot.js pone la sala en la dirección DESPUÉS de cargar este módulo, que el
// empaquetado puede meter en un trozo común que se ejecuta antes). Es "let": quien lo importa ve siempre el valor actual.
export let roomCode = null;
export function readRoomFromUrl() {
  const raw = (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase();
  roomCode = CODE.test(raw) ? raw : null;
}
readRoomFromUrl();

// Token secreto de esta pestaña: con él, si se corta la conexión, el servidor le devuelve su plaza. Se guarda en sessionStorage para sobrevivir
// a una recarga de la página.
function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
}
const stored = (storage, key) => {
  try {
    const saved = storage.getItem(key);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const fresh = makeToken();
    storage.setItem(key, fresh);
    return fresh;
  } catch { return makeToken(); }
};
export const clientToken = stored(sessionStorage, 'df.token');
// Id de esta pantalla (se mantiene al recargar la pestaña).
export const screenId = stored(sessionStorage, 'df.screen');

// Abre el socket de la sala. Solo WebSocket, igual que el servidor. Reconecta rápido (los cortes de red suelen ser cortos y cada segundo cuenta:
// la plaza se pierde a los 10 s).
// asScreen = es la PANTALLA: manda { type: 'quick' } para que el servidor pueda restaurar la sala tras un reinicio. El teclado no lo manda.
export function connectToRoom(io, { asScreen = false } = {}) {
  const options = { transports: ['websocket'], reconnectionDelay: 250, reconnectionDelayMax: 1500, timeout: 8000 };
  return closeOnLeave(io(`/r/${roomCode}`, { ...options, ...(asScreen ? { auth: { type: 'quick' } } : {}) }));
}

// Al irse de la página (SALIR, un enlace, cerrar la pestaña...) Chrome puede guardarla CONGELADA en la caché de atrás/adelante con los WebSocket
// abiertos: el servidor no se enteraba hasta que fallaba el ping (~15 s) y los demás veían un jugador fantasma en la sala. Se cierran a mano (el
// servidor lo sabe al instante y libera el hueco). Si se vuelve con "atrás" a esa página congelada, se recarga: sus conexiones ya no valen.
const openSockets = new Set();
let leaveHooked = false;
function closeOnLeave(socket) {
  openSockets.add(socket);
  if (!leaveHooked) {
    leaveHooked = true;
    window.addEventListener('pagehide', () => { for (const s of openSockets) s.disconnect(); });
    window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
  }
  return socket;
}
// Nombre de 3 letras al azar (sílaba consonante-vocal-consonante: se lee bien y no forma palabras raras con la lista de bloqueo del servidor).
export function randomName() {
  const C = 'BCDFGJKLMNPRSTVXZ';
  const V = 'AEIOU';
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const BLOCKED = new Set(['SEX', 'PUT', 'CUM', 'FUK', 'FUC', 'TIT', 'PUS', 'CAC', 'PIS', 'PEN', 'NAZ']); // la lista del servidor y alguna más que se lee mal
  for (;;) { const name = pick(C) + pick(V) + pick(C); if (!BLOCKED.has(name)) return name; }
}
// Tu nombre en este navegador: el último que usaste o uno al azar que se guarda para la próxima vez.
export function myName() {
  try {
    const saved = localStorage.getItem('df.initials');
    if (/^[A-Z]{3}$/.test(saved ?? '')) return saved;
    const fresh = randomName();
    localStorage.setItem('df.initials', fresh);
    return fresh;
  } catch { return randomName(); }
}
export function saveMyName(name) { try { if (/^[A-Z]{3}$/.test(name)) localStorage.setItem('df.initials', name); } catch { /* da igual */ } }
