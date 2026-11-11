// Selector de mapa del menú de desarrollador (antes eran 4 cuadros junto al QR; desde el 29-oct el mapa es siempre aleatorio y solo se fija
// desde aquí). 4 cuadros con minimapa: "?" = aleatorio (por defecto) y los 3 mapas. El elegido va en fucsia; con "aleatorio", el mapa que
// toca ahora lleva "·YA" junto al nombre. Qué NO hace: no habla con el servidor; quien lo crea decide qué hacer al pulsar (onPick).
import { createArena, MAPS } from '../../shared/arena.js';

// Iconito de ambiente (luna = noche, sol poniente = atardecer, gota = lluvia): 7 x 7 píxeles, del color de ese ambiente.
const MOOD_PIXELS = {
  night: [['..###..', '.##....', '##.....', '##.....', '##.....', '.##...#', '..###..'], '#cfd6ff'],
  dusk: [['...#...', '.#.#.#.', '..###..', '#######', '.......', '.#####.', '..###..'], '#ffb070'],
  rain: [['...#...', '...#...', '..###..', '.#####.', '#######', '#######', '.#####.'], '#7fb4ff'],
};
const MOOD_ICONS = Object.fromEntries(Object.entries(MOOD_PIXELS).map(([mood, [rows, color]]) => {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return [mood, `<span class="mood" style="color:${color}"><svg viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg></span>`];
}));

const miniMap = (index) => {
  const a = createArena(index);
  let rects = '';
  for (const o of a.obstacles) rects += `<rect x="${o.x}" y="${a.height - o.y - o.h}" width="${o.w}" height="${o.h}" fill="#6f7ba8"/>`;
  const dot = (s, c) => `<rect x="${s.x - 1}" y="${a.height - s.y - 1}" width="2" height="2" fill="${c}"/>`;
  const bg = { night: '#0b0e1a', dusk: '#3a2236', rain: '#0e1830' }[a.mood] ?? '#0b0e1a'; // el fondo de la miniatura ya adelanta el ambiente
  const svg = `<svg viewBox="0 0 ${a.width} ${a.height}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${a.width}" height="${a.height}" fill="${bg}" stroke="#2a3150"/>${rects}${dot(a.spawns[0], '#6f8cff')}${dot(a.spawns[1], '#ff4fa3')}</svg>`;
  return `<div class="thumb">${svg}${MOOD_ICONS[a.mood] ?? ''}</div>`; // con el iconito del ambiente arriba a la izquierda
};

// Crea la rejilla dentro de `parent`. Devuelve update(choice, current): choice = 'random' o el índice fijado; current = mapa que toca ahora.
export function createMapPicker(parent, onPick) {
  const grid = document.createElement('div');
  grid.className = 'map-grid';
  parent.appendChild(grid);
  const options = [['random', '<div class="q">?</div>', 'ALEATORIO'], ...MAPS.map((m, i) => [i, miniMap(i), m.name])];
  for (const [choice, art, name] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-opt';
    button.dataset.choice = String(choice);
    button.innerHTML = `${art}<span class="name">${name}</span>`;
    button.addEventListener('click', (event) => { event.currentTarget.blur(); onPick(choice); }); // blur: la R del reset no lo activa
    grid.appendChild(button);
  }
  return function update(choice = 'random', current = 0) {
    for (const button of grid.children) {
      const value = button.dataset.choice === 'random' ? 'random' : Number(button.dataset.choice);
      button.classList.toggle('on', value === choice);
      button.querySelector('.name').innerHTML = (value === 'random' ? 'ALEATORIO' : MAPS[value].name) + (choice === 'random' && value === current ? ' <span class="now">·YA</span>' : '');
    }
  };
}
