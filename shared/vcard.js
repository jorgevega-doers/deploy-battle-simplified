// Tarjeta de contacto (vCard 3.0) que el visitante guarda en su móvil desde /end. Código puro: el servidor la sirve en /end/contacto.vcf (server/app.js) y
// iPhone y Android la abren con su app de contactos. Los datos son los que dio DOERS (Antonio Jiménez Ruiz); para cambiarlos basta con editar CONTACT.
export const CONTACT = {
  first: 'Antonio',
  last: 'Jiménez Ruiz',
  org: 'Doers DF',
  email: 'hola@doersdf.com',
  phone: '+34916722092',
  linkedin: 'https://www.linkedin.com/in/antoniojimenez/',
  web: 'https://doersdf.com/',
};
export const VCARD_PATH = '/end/contacto.vcf';
export const VCARD_FILENAME = 'antonio-jimenez-doers-df.vcf';

// Los caracteres \ ; , y los saltos de línea se escapan, como pide el formato.
const esc = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// "itemN.URL" + "itemN.X-ABLabel": así iPhone y Mac guardan cada enlace con su etiqueta (LinkedIn, Web); Android lee los URL sin más.
export function buildVCard(c = CONTACT) {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(c.last)};${esc(c.first)};;;`,
    `FN:${esc(`${c.first} ${c.last}`)}`,
    `ORG:${esc(c.org)}`,
    `EMAIL;TYPE=INTERNET,WORK:${c.email}`,
    `TEL;TYPE=WORK,VOICE:${c.phone}`,
    `item1.URL:${c.linkedin}`,
    'item1.X-ABLabel:LinkedIn',
    `item2.URL:${c.web}`,
    'item2.X-ABLabel:Web',
    'END:VCARD',
    '',
  ].join('\r\n');
}
