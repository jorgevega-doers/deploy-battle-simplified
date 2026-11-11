// Equilibrio de los mapas (28-oct): juega partidas con bots iguales en cada esquina y comprueba que ninguna da una ventaja grande.
// Es determinista (semillas fijas) y corto; el análisis completo y más preciso es "npm run balance" (scripts/balance-sim.js).
// Si cambias la IA de los bots o un mapa y este test falla, ejecuta "npm run balance" para ver qué esquina se ha desequilibrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, createArena } from '../shared/arena.js';
import { playMany, summarize, openness } from '../scripts/balanceCore.js';

const MATCHES = 40; // por reparto de esquinas (4 repartos en 1 contra 3, 2 en 1 contra 1): ~160-80 partidas por esquina

for (const [mapIndex, map] of MAPS.entries()) {
  test(`${map.name}: ninguna esquina de 1 contra 3 se queda muy por debajo ni por encima (cae primero, relación de impactos)`, () => {
    const rows = playMany({ mapIndex, mode: 'ffa', matches: MATCHES }).corners.map(summarize);
    const firstOut = rows.map((r) => r.firstOut);
    const spread = Math.max(...firstOut) - Math.min(...firstOut);
    // Justo = 25 % cada una. Sin las salidas desplazadas, DISTRITO daba 13 % y 38 % (25 puntos de diferencia).
    assert.ok(spread < 0.18, `diferencia de ${(spread * 100).toFixed(0)} puntos: ${rows.map((r) => `${r.name} ${(r.firstOut * 100).toFixed(0)} %`).join(', ')}`);
    for (const r of rows) assert.ok(r.ratio > 0.7 && r.ratio < 1.4, `${r.name}: da ${r.ratio.toFixed(2)} impactos por cada uno que recibe`);
  });

  test(`${map.name}: en 1 contra 1 ningún lado gana claramente más`, () => {
    const [a, b] = playMany({ mapIndex, mode: 'duel', matches: MATCHES * 2 }).corners.map(summarize);
    assert.ok(Math.abs(a.firstOut - b.firstOut) < 0.17, `P1 cae primero ${(a.firstOut * 100).toFixed(0)} % y P2 ${(b.firstOut * 100).toFixed(0)} %`);
    assert.ok(Math.abs(a.win - b.win) < 0.17, `P1 gana ${(a.win * 100).toFixed(0)} % y P2 ${(b.win * 100).toFixed(0)} %`);
  });

  test(`${map.name}: las 4 esquinas tienen sitio de sobra alrededor (espacio libre a 6 pasos de la salida)`, () => {
    const arena = createArena(mapIndex);
    for (const spawn of arena.cornerSpawns) assert.ok(openness(arena, spawn) >= 30, `salida ${spawn.x},${spawn.y}: solo ${openness(arena, spawn)} celdas`);
  });
}
