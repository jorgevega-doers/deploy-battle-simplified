import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letterPixels, letterCols, letterSvg, THEMES } from '../client/host/arcadeText.js';
import { heartSvg } from '../client/host/hearts.js';

test('cada letra ocupa su celda de 5 x 7 sin salirse', () => {
  for (const ch of 'KO GAMEVRTUP!-0123') {
    const cells = letterPixels(ch);
    for (const [x, y] of cells) assert.ok(x >= 0 && x < letterCols(ch) && y >= 0 && y < 7, `${ch} (${x},${y})`);
  }
});

test('las letras simétricas lo son, así quedan centradas (sin sombra ni contorno que las descentre)', () => {
  for (const ch of 'AHIMOTUVWXY') {
    const cells = new Set(letterPixels(ch).map(([x, y]) => `${x},${y}`));
    for (const [x, y] of letterPixels(ch)) assert.ok(cells.has(`${4 - x},${y}`), `${ch} no es simétrica en (${x},${y})`);
  }
});

test('el punto de K.O. es un cuadrado de 2 x 2 en una celda estrecha', () => {
  assert.equal(letterCols('.'), 2);
  assert.equal(letterPixels('.').length, 4);
});

test('el SVG de una letra lleva las tres bandas de color del tema y nada más', () => {
  const svg = letterSvg('E', THEMES.amber);
  for (const color of [THEMES.amber.light, THEMES.amber.fill, THEMES.amber.shade]) assert.ok(svg.includes(color), color);
  assert.ok(!svg.includes('#05050c'), 'sin contorno negro');
});

test('el corazón de píxeles pinta lleno y apagado con colores distintos', () => {
  assert.notEqual(heartSvg(true), heartSvg(false));
  assert.ok(heartSvg(false, ' lost').includes('class="heart lost"'));
});
