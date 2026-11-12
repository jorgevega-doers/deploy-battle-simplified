// Pantalla final de DOERS: resultado del jugador y accesos directos al contacto con la empresa.
import '../theme.css';
import { keepPixelImagesSharp } from '../pixelFit.js';
import { LINKS, detectPlatform, openHref } from './links.js';
import { parseResult, OUTCOME_TEXT } from './result.js';
import { iconRuns, ICON_SIZE } from './icons.js';
import { VCARD_PATH } from '../../shared/vcard.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

// --- Resultado (solo si la dirección trae uno válido). Todo con textContent: nunca se pinta HTML que venga de la URL ---
const result = parseResult(window.location.search);
if (result) {
  $('result').hidden = false;
  $('result-outcome').textContent = OUTCOME_TEXT[result.outcome] ?? 'FIN DE PARTIDA';
  $('result-initials').textContent = result.initials;
  if (result.slot) $('result-initials').dataset.slot = String(result.slot); // el nombre va en el color de su jugador
  $('result-score').textContent = String(result.score);
  const stats = [];
  if (result.rank !== null) stats.push(['PUESTO', `#${result.rank}`]);
  if (result.lives !== null) stats.push(['VIDAS', String(result.lives)]);
  if (result.accuracy !== null) stats.push(['PRECISIÓN', `${result.accuracy}%`]);
  for (const [name, value] of stats) {
    const chip = document.createElement('span');
    chip.append(`${name} `);
    const strong = document.createElement('b');
    strong.textContent = value;
    chip.append(strong);
    $('result-stats').append(chip);
  }
}

// --- Iconos de píxeles (rejilla de 17 x 17 calculada en icons.js; un rectángulo por tramo horizontal) ---
function iconSvg(name) {
  const runs = iconRuns(name);
  if (!runs) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ICON_SIZE} ${ICON_SIZE}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', runs.map(([x, y, w]) => `M${x} ${y}h${w}v1h-${w}z`).join(''));
  svg.append(path);
  return svg;
}
// --- Botones de contacto: uno por cada enlace que tenga dirección, uno debajo de otro ---
const platform = detectPlatform(navigator.userAgent);
let halfRow = null; // fila compartida por los botones "half" seguidos (web y LinkedIn)
for (const [id, link] of Object.entries(LINKS)) {
  if (!link.href && !link.vcard) continue;
  const a = document.createElement('a');
  a.className = `ui-btn link-btn${link.primary ? ' primary' : ''}`;
  const icon = iconSvg(link.icon);
  if (icon) a.append(icon);
  const label = document.createElement('span');
  label.textContent = link.label;
  a.append(label);
  // Guardar contacto: el .vcf real del servidor (sin "download": el iPhone lo abre en "Añadir contacto"). En Android no hay otra forma desde
  // una web: Chrome no deja abrir la pantalla "Nuevo contacto" (se probó el 4-nov en móviles reales con 3 variantes del "intent" y ninguna
  // funcionó); descarga la tarjeta y al abrirla sale la app de contactos. Por eso en Android va un aviso debajo del botón.
  if (link.vcard) a.href = VCARD_PATH;
  else a.href = openHref({ ...link, id }, platform);
  // Los enlaces con aplicación (LinkedIn) se abren en la misma pestaña para que el móvil pueda entregarlos a su app; el resto, en una nueva.
  if (!link.app && !link.vcard && /^https?:\/\//.test(link.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  if (link.half) {
    if (!halfRow) { halfRow = document.createElement('div'); halfRow.className = 'link-row'; $('links').appendChild(halfRow); }
    halfRow.appendChild(a);
  } else {
    halfRow = null;
    $('links').appendChild(a);
  }
  if (link.vcard && platform === 'android') {
    const hint = document.createElement('p');
    hint.className = 'vcf-hint';
    hint.textContent = 'Se descargará la tarjeta: ábrela desde el aviso de descarga para guardar el contacto.';
    $('links').appendChild(hint);
  }
}

// El logo de DOERS se redibuja a píxeles enteros al cargar y al cambiar el tamaño. La página se desplaza.
keepPixelImagesSharp(); // (antes se registraba fitPixelImages directamente: recibía el evento como raíz y lanzaba una excepción en cada carga y giro)

// 11-nov: la página entera en la pantalla, sin desplazarse: si no cabe (móvil pequeño, en horizontal), se encoge toda por igual.
function fitPage() {
  const page = $('page');
  page.style.transform = 'none';
  const room = window.innerHeight - 16;
  const scale = Math.min(1, room / page.scrollHeight, (window.innerWidth - 16) / page.offsetWidth);
  page.style.transform = scale < 1 ? `scale(${scale.toFixed(3)})` : 'none';
}
addEventListener('resize', fitPage);
addEventListener('orientationchange', () => setTimeout(fitPage, 200));
addEventListener('load', fitPage);
fitPage();