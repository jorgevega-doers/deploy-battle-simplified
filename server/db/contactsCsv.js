// CSV de los contactos (emails que se dejan al escanear el QR; sección 57): lo usan "npm run contacts:export" y la descarga del menú del host.
// UTF-8 con BOM y separado por ";" para que el Excel en español lo abra bien. Las celdas que empiecen por = + - @ llevan un apóstrofo delante:
// así un email malicioso no se ejecuta como fórmula al abrirlo en Excel.
const cell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const date = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

export function contactsToCsv(rows) {
  const lines = [['email', 'iniciales', 'consentimiento', 'primera_vez', 'ultima_vez', 'partidas'].map(cell).join(';')];
  for (const r of rows) lines.push([r.email, r.initials, r.consent, date(r.first_seen), date(r.last_seen), r.plays].map(cell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
