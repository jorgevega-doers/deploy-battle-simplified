// Qué música y qué ambiente suenan en cada momento del juego. Función pura: main.js la consulta cada
// fotograma y, cuando cambia el resultado, se lo aplica a sfx.js. Aquí se decide DÓNDE suena cada cosa y dónde no:
//   lobby (sala de espera)       música calma + ambiente
//   cuenta atrás                  música calma a media voz + ambiente algo más bajo
//   partida                       música con ritmo + ambiente muy bajo (mandan los efectos)
//   últimos 10 s                  música más rápida
//   final (KO / game over)        sin música (fundido) para que se oiga el golpe y el jingle; ambiente bajo
//   resultados                    música calma + ambiente
// "scale" = fracción del volumen normal del bus.
export const SCAPES = {
  lobby: { music: 'calm', musicScale: 1.3, ambience: 1 },
  ready: { music: 'calm', musicScale: 0.8, ambience: 0.8 },
  playing: { music: 'play', musicScale: 2.4, ambience: 0.45 },
  rush: { music: 'rush', musicScale: 2.5, ambience: 0.4 },
  finale: { music: null, musicScale: 0, ambience: 0.3 },
  results: { music: 'calm', musicScale: 1.2, ambience: 0.7 },
};
export const RUSH_SECONDS = 10;

// state = lobby.state del servidor; timeLeft = segundos que quedan; matchOver = ya ha acabado la partida (animación final);
// resultsShown = ya se ven los resultados.
export function scapeKey({ state, timeLeft = Infinity, matchOver = false, resultsShown = false }) {
  if (state === 'READY') return 'ready';
  if (state === 'PLAYING') return matchOver ? 'finale' : timeLeft <= RUSH_SECONDS ? 'rush' : 'playing';
  if (state === 'GAME_OVER') return resultsShown ? 'results' : 'finale';
  return 'lobby';
}
