// Pruebas de la lógica de la pantalla final (lectura segura del resultado y enlaces).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResult } from '../client/end/result.js';
import { LINKS, detectPlatform, androidIntent, openHref } from '../client/end/links.js';
import { buildVCard, CONTACT, VCARD_PATH } from '../shared/vcard.js';
import { createApp } from '../server/app.js';
import { ICON_NAMES, ICON_SIZE, iconGrid, iconRuns } from '../client/end/icons.js';

test('lee un resultado válido de la dirección', () => {
  const r = parseResult('?i=JVG&s=3218&r=3&l=2&a=45.5&o=w&p=2');
  assert.deepEqual(r, { initials: 'JVG', score: 3218, rank: 3, lives: 2, accuracy: 45.5, outcome: 'w', slot: 2 });
  assert.equal(parseResult('?i=JVG&s=1&p=5').slot, null, 'plaza inválida');
});

test('sin resultado o con datos inválidos no se enseña nada', () => {
  assert.equal(parseResult(''), null);
  assert.equal(parseResult('?i=jvg&s=100'), null, 'iniciales en minúscula');
  assert.equal(parseResult('?i=JVGX&s=100'), null);
  assert.equal(parseResult('?i=JVG&s=abc'), null);
  assert.equal(parseResult('?i=JVG&s=-5'), null);
  assert.equal(parseResult('?i=JVG&s=1.5'), null);
  assert.equal(parseResult('?i=JVG&s=99999999'), null, 'puntuación absurda');
  assert.equal(parseResult('?i=<s>&s=1'), null, 'nada de HTML en las iniciales');
});

test('los campos opcionales inválidos se descartan sin romper el resto', () => {
  const r = parseResult('?i=ABC&s=100&r=x&l=99&a=500&o=z');
  assert.deepEqual(r, { initials: 'ABC', score: 100, rank: null, lives: null, accuracy: null, outcome: null, slot: null });
});

test('los enlaces salen tal cual (sin parámetros de campaña) y mailto/tel también', () => {
  assert.equal(openHref({ ...LINKS.web, id: 'web' }, 'ios'), 'https://doersdf.com/');
  assert.equal(openHref({ href: 'https://doersdf.com/contacto?lang=es', id: 'x' }, 'other'), 'https://doersdf.com/contacto?lang=es');
  assert.equal(openHref({ href: 'mailto:hola@ejemplo.com', id: 'email' }, 'android'), 'mailto:hola@ejemplo.com');
  assert.equal(openHref({ href: 'tel:+34600000000', id: 'phone' }, 'ios'), 'tel:+34600000000');
});

test('los botones de /end (versión arcade): automatización (principal), web y LinkedIn; sin contacto, reunión ni Instagram', () => {
  assert.equal(LINKS.web.href, 'https://doersdf.com/');
  assert.equal(LINKS.contact, undefined, 'sin guardar el contacto');
  assert.equal(LINKS.meeting, undefined, 'sin agendar reunión');
  assert.equal(LINKS.automation.primary, true);
  assert.equal(LINKS.automation.href, 'https://automation.doersdf.com/');
  assert.equal(LINKS.linkedin.href, 'https://www.linkedin.com/company/doersdf/home/');
  assert.equal(LINKS.instagram, undefined, 'Instagram ya no está');
  assert.deepEqual(Object.entries(LINKS).filter(([, l]) => l.href || l.vcard).map(([id]) => id), ['automation', 'web', 'linkedin']);
});

test('detecta la plataforma del móvil', () => {
  assert.equal(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120'), 'android');
  assert.equal(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604'), 'ios');
  assert.equal(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), 'other');
});

test('en Android LinkedIn se abre con un intent a su aplicación y, si no está, cae a la web', () => {
  const web = LINKS.linkedin.href;
  const href = openHref({ ...LINKS.linkedin, id: 'linkedin' }, 'android');
  assert.ok(href.startsWith('intent://www.linkedin.com/company/doersdf/#Intent;scheme=https;package=com.linkedin.android;'));
  assert.ok(href.includes(`S.browser_fallback_url=${encodeURIComponent(web)}`), 'la web como alternativa');
  assert.ok(href.endsWith(';end'));
  assert.ok(openHref({ ...LINKS.linkedin, id: 'linkedin' }, 'android').includes('package=com.linkedin.android'));
  assert.equal(androidIntent({ host: 'a.b', path: '/x/', package: 'p.q' }, 'https://z.es/?a=1'),
    'intent://a.b/x/#Intent;scheme=https;package=p.q;S.browser_fallback_url=https%3A%2F%2Fz.es%2F%3Fa%3D1;end');
});

test('en iOS y en el resto las redes usan la dirección web (los enlaces universales abren la app)', () => {
  for (const platform of ['ios', 'other']) {
    const href = openHref({ ...LINKS.linkedin, id: 'linkedin' }, platform);
    assert.equal(href, 'https://www.linkedin.com/company/doersdf/home/');
  }
  assert.ok(openHref({ ...LINKS.web, id: 'web' }, 'android').startsWith('https://doersdf.com/'), 'la web nunca va por intent');
});

test('cada botón de contacto tiene su icono y todos los iconos son rejillas del tamaño correcto y no están vacíos', () => {
  for (const link of Object.values(LINKS)) assert.ok(ICON_NAMES.includes(link.icon), `falta el icono de ${link.label}`);
  for (const name of ICON_NAMES) {
    const grid = iconGrid(name);
    assert.equal(grid.length, ICON_SIZE);
    assert.ok(grid.every((row) => row.length === ICON_SIZE), `${name}: filas del tamaño incorrecto`);
    const on = grid.flat().filter(Boolean).length;
    assert.ok(on > 30 && on < ICON_SIZE * ICON_SIZE, `${name}: ${on} píxeles encendidos`);
  }
  assert.equal(iconGrid('no-existe'), null);
  assert.equal(iconRuns('no-existe'), null);
});

test('los iconos de objetos simétricos lo son (globo, móvil y correo) e Instagram solo se diferencia por el punto del flash', () => {
  for (const name of ['globe', 'phone', 'mail']) {
    const grid = iconGrid(name);
    grid.forEach((row, y) => row.forEach((value, x) => assert.equal(value, row[ICON_SIZE - 1 - x], `${name}: asimetría en ${x},${y}`)));
  }
  const insta = iconGrid('instagram');
  const differing = [];
  insta.forEach((row, y) => row.forEach((value, x) => { if (value !== row[ICON_SIZE - 1 - x]) differing.push([x, y]); }));
  assert.ok(differing.length > 0 && differing.every(([x, y]) => y <= 4 && (x >= 11 || x <= 5)), 'solo el flash rompe la simetría');
});

test('los tramos de un icono reconstruyen exactamente su rejilla', () => {
  for (const name of ICON_NAMES) {
    const rebuilt = Array.from({ length: ICON_SIZE }, () => Array(ICON_SIZE).fill(false));
    for (const [x, y, w] of iconRuns(name)) for (let i = 0; i < w; i++) rebuilt[y][x + i] = true;
    assert.deepEqual(rebuilt, iconGrid(name), name);
  }
});
test('la tarjeta de contacto (vCard) lleva los datos de Antonio y las líneas acaban en CRLF', () => {
  const v = buildVCard();
  assert.ok(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n') && v.endsWith('END:VCARD\r\n'));
  for (const part of ['FN:Antonio Jiménez Ruiz', 'N:Jiménez Ruiz;Antonio;;;', 'ORG:Doers DF', 'hola@doersdf.com', '+34916722092', 'https://www.linkedin.com/in/antoniojimenez/']) assert.ok(v.includes(part), part);
  assert.ok(v.includes('item1.URL:https://www.linkedin.com/in/antoniojimenez/\r\nitem1.X-ABLabel:LinkedIn'), 'LinkedIn con su etiqueta');
  assert.ok(buildVCard({ ...CONTACT, org: 'A;B, C' }).includes('ORG:A\\;B\\, C'), 'escapa ; y ,');
});

test('el servidor da la tarjeta de contacto como un .vcf real, público y con el tipo que abre la app de contactos', async () => {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${app.server.address().port}${VCARD_PATH}`, { headers: { 'cf-connecting-ip': '1.2.3.4' } }); // como si llegara por el túnel
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/vcard/);
    assert.match(res.headers.get('content-disposition'), /^inline; filename="[^"]+\.vcf"$/);
    assert.equal(await res.text(), buildVCard());
  } finally {
    app.io.close();
    await new Promise((resolve) => app.server.close(resolve));
  }
});

