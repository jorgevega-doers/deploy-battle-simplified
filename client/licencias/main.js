// Página de créditos y licencias (/licencias/): cumple el aviso de copyright y licencia que exigen las fuentes (SIL OFL 1.1) y las
// librerías (MIT) que se sirven a los visitantes. Los textos de las fuentes son los oficiales (assets/fonts/licenses). Todo se
// pinta con textContent.
import '../theme.css'; // las fuentes (@font-face) del juego
import tiny5 from '../../assets/fonts/licenses/Tiny5-OFL.txt?raw';
import jersey15 from '../../assets/fonts/licenses/Jersey15-OFL.txt?raw';
import manrope from '../../assets/fonts/licenses/Manrope-OFL.txt?raw';

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const SECTIONS = [
  { title: 'Fuente Tiny5 (interfaz del juego)', note: 'Licencia SIL Open Font License 1.1.', text: tiny5 },
  { title: 'Fuente Jersey 15 (mando y pantalla final)', note: 'Licencia SIL Open Font License 1.1.', text: jersey15 },
  { title: 'Fuente Manrope (pantalla final)', note: 'Licencia SIL Open Font License 1.1.', text: manrope },
  { title: 'three.js', note: 'Gráficos 3D. Licencia MIT. https://threejs.org', text: `Copyright © 2010-2026 three.js authors\n\n${MIT}` },
  { title: 'Socket.IO (cliente)', note: 'Comunicación en tiempo real. Licencia MIT. https://socket.io', text: `Copyright (c) 2014-present Guillermo Rauch and Socket.IO contributors\n\n${MIT}` },
  { title: 'node-qrcode', note: 'Código QR. Licencia MIT. https://github.com/soldair/node-qrcode', text: `Copyright (c) 2012 Ryan Day\n\n${MIT}` },
];

const root = document.getElementById('content');
for (const { title, note, text } of SECTIONS) {
  const heading = document.createElement('h2');
  heading.textContent = title;
  const info = document.createElement('p');
  info.textContent = note;
  const body = document.createElement('pre');
  body.textContent = text.trim();
  root.append(heading, info, body);
}
