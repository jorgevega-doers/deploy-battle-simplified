// /db-admin/: contraseña de DESARROLLADOR. El servidor la comprueba y responde con la cookie del rol "dev" (menú completo de
// pruebas y ranking aparte en las salas que se abran después). Vuelve al inicio (o a ?next=). Nunca guarda la contraseña en el navegador.
import '../theme.css';
import { keepPixelImagesSharp } from '../pixelFit.js';

const $ = (id) => document.getElementById(id);

// Solo se vuelve a rutas del propio sitio (nada de "//otro-sitio" ni "https://..."): evita redirigir a una web ajena.
function safeNext() {
  const next = new URLSearchParams(window.location.search).get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.startsWith('/login') && !next.startsWith('/db-admin') ? next : '/';
}
fetch('/api/mode').then((res) => res.json()).then((info) => { $('dev-on').hidden = info.dev !== true; }).catch(() => {});

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('password').value;
  if (!password) return;
  $('go').disabled = true;
  $('msg').textContent = '';
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (res.ok) { window.location.replace(safeNext()); return; }
    const data = await res.json().catch(() => ({}));
    $('msg').textContent = res.status === 429
      ? `DEMASIADOS INTENTOS. ESPERA ${Math.ceil((data.retryAfter ?? 60) / 60)} MIN.`
      : 'CONTRASEÑA INCORRECTA';
    $('password').value = '';
    $('password').focus();
  } catch {
    $('msg').textContent = 'SIN CONEXIÓN CON EL SERVIDOR';
  } finally {
    $('go').disabled = false;
  }
});

keepPixelImagesSharp(); // logos de pixel art con píxeles enteros en cualquier móvil
