// Qué sala online usa esta pestaña (28-oct): la dirección lleva ?room=CODIGO (pantalla principal y mando). Sin "room" es el modo del stand de siempre (el espacio de nombres principal). Lo comparten el host y el mando.
// Versión pública (6-nov): cada pantalla tiene su id (el QR lo lleva para vincular el móvil a ESA pantalla) y la anfitriona guarda su llave.
// Qué NO hace: no abre el socket por su cuenta (cada pantalla llama a connectToRoom con su "io").
const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
// Se leen de la dirección al cargar y otra vez con readRoomFromUrl() (versión arcade: boot.js pone la sala en la dirección DESPUÉS de cargar
// este módulo, que el empaquetado puede meter en un trozo común que se ejecuta antes). Son "let": quien los importa ve siempre el valor actual.
export let roomCode = null;      // null = modo del stand
// Tipo de sala (?type=local|online): lo necesita el servidor para RESTAURAR la sala con su código si se reinició (despliegue nuevo) mientras la pantalla seguía abierta.
export let roomType = 'local';
// Partida rápida contra los bots (sala privada): la pantalla lo recuerda por si el servidor se reinicia y hay que restaurarla.
export let roomSolo = false;
// Sala privada online (cada uno en su pantalla, con código): se recuerda para restaurarla y va en el enlace de invitación.
export let roomPrivate = false;
// Mando que llega por el QR de una partida rápida: entra con el token del jugador de esa pantalla (se queda su plaza, sin pedir nada).
export let bindToken = null;
// Pantalla a la que pertenece este mando (?screen=ID en el enlace del QR): en una sala a distancia, cada pantalla resalta el tanque de los suyos.
export let linkedScreen = null;
export function readRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('room') ?? '').toUpperCase();
  roomCode = CODE.test(raw) ? raw : null;
  roomType = ['online', 'quick'].includes(params.get('type')) ? params.get('type') : 'local';
  roomSolo = params.get('solo') === '1';
  roomPrivate = params.get('private') === '1';
  bindToken = /^[A-Za-z0-9_-]{16,64}$/.test(params.get('bind') ?? '') ? params.get('bind') : null;
  linkedScreen = ID.test(params.get('screen') ?? '') ? params.get('screen') : null;
}
readRoomFromUrl();

// Token secreto de esta pestaña: con él, si se corta la conexión (4G saturada, pantalla bloqueada), el servidor devuelve al
// mando su plaza y a la pantalla su sitio. Se guarda en sessionStorage para sobrevivir a una recarga de la página.
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
// Id de esta pantalla (se mantiene al recargar la pestaña: los móviles ya vinculados siguen siendo "suyos").
export const screenId = stored(sessionStorage, 'df.screen');

// Llave de anfitriona de la sala (la da el servidor al crearla o al pasar el testigo). localStorage: sobrevive a cerrar y abrir la pestaña.
const keyName = () => `df.hostkey.${roomCode}`;
export function getHostKey() { try { const k = localStorage.getItem(keyName()); return k && ID.test(k) ? k : null; } catch { return null; } }
export function setHostKey(code, key) { try { if (ID.test(key)) localStorage.setItem(`df.hostkey.${code}`, key); } catch { /* sin almacenamiento: solo vale esta vez */ } }

// Abre el socket de la sala (o el principal). Solo WebSocket, igual que el servidor. Reconecta rápido (en una red móvil
// saturada los cortes son cortos y cada segundo cuenta: la plaza se pierde a los 10 s).
// asScreen = es una PANTALLA: manda el tipo de sala (y su llave) para que el servidor pueda restaurarla tras un reinicio. Un mando no la manda.
export function connectToRoom(io, { asScreen = false } = {}) {
  const options = { transports: ['websocket'], reconnectionDelay: 250, reconnectionDelayMax: 1500, timeout: 8000 };
  if (!roomCode) return closeOnLeave(io(options));
  // auth como función: se vuelve a leer en cada reconexión (la llave puede llegar después).
  return closeOnLeave(io(`/r/${roomCode}`, { ...options, ...(asScreen ? { auth: (cb) => cb({ type: roomType, hostKey: getHostKey() ?? undefined, solo: roomSolo || undefined, private: roomPrivate || undefined }) } : {}) }));
}

// Al irse de la página (SALIR, el enlace SOBRE DOERS, cerrar la pestaña...) Chrome puede guardarla CONGELADA en la caché de atrás/adelante con los
// WebSocket abiertos: el servidor no se enteraba hasta que fallaba el ping (~15 s) y los demás veían un jugador fantasma en la sala. Se cierran a
// mano (el servidor lo sabe al instante y libera el hueco). Si se vuelve con "atrás" a esa página congelada, se recarga: sus conexiones ya no valen.
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
// Partida rápida: el QR de cada pantalla lleva el token de SU jugador; el móvil que lo escanea se convierte en su mando (mismas iniciales y plaza).
export const bindLink = (token) => `${window.location.origin}/play/?room=${roomCode}&screen=${screenId}&bind=${encodeURIComponent(token)}`;

// Enlace del mando que va dentro del QR de esta pantalla: entra en la siguiente plaza libre y queda vinculado a esta pantalla.
export const playLink = () => `${window.location.origin}/play/?room=${roomCode}&screen=${screenId}`;
// Enlace que se le pasa a otro jugador para que abra su propia pantalla (verá la misma partida y escaneará su QR con su móvil).
export const inviteLink = () => `${window.location.origin}/host/?room=${roomCode}&type=${roomType}${roomPrivate ? '&private=1' : ''}`;
// Nombre de 3 letras al azar (sílaba consonante-vocal-consonante: se lee bien y no forma palabras raras con la lista de bloqueo del servidor).
export function randomName() {
  const C = 'BCDFGJKLMNPRSTVXZ';
  const V = 'AEIOU';
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const BLOCKED = new Set(['SEX', 'PUT', 'CUM', 'FUK', 'FUC', 'TIT', 'PUS', 'CAC', 'PIS', 'PEN', 'NAZ']); // la lista del servidor y alguna más que se lee mal
  for (;;) { const name = pick(C) + pick(V) + pick(C); if (!BLOCKED.has(name)) return name; }
}
// Tu nombre en este navegador (pantalla propia): el último que usaste o uno al azar que se guarda para la próxima vez.
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
