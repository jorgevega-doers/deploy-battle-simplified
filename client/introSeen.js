// ¿Ya se vio la intro (DOERS DF presents → DEPLOY BATTLE) en esta ventana? Versión pública (10-nov): sale la PRIMERA vez que se abre el juego,
// sea en la página que sea (inicio, una sala, un enlace de invitación), y después solo al acabar cada partida. sessionStorage es por pestaña:
// al pasar del inicio a una sala no se repite; una pestaña nueva (otro jugador con el enlace) sí la ve.
const KEY = 'df.intro.seen';

export function introSeen() {
  try { return window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function markIntroSeen() {
  try { window.sessionStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento: como mucho se repite */ }
}
