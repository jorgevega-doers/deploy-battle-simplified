// Ranking global de la versión pública (Turso; aquí en memoria): puntuación con multiplicador de dificultad, tablas de hoy / semana / histórico
// en hora de Madrid y ranking dev aparte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openGlobalRanking, periodStarts } from '../server/db/globalRanking.js';
import { rankedScore, FAST_BONUS_PER_S, PAR_SECONDS } from '../server/game/score.js';

test('rankedScore: la dificultad multiplica y ganar antes del tiempo de referencia suma sin techo', () => {
  assert.equal(rankedScore({ score: 5000, won: false, elapsed: 10, difficulty: 'media' }), 5000);
  assert.equal(rankedScore({ score: 5000, won: false, elapsed: 10, difficulty: 'stand' }), 3000);
  assert.equal(rankedScore({ score: 5000, won: false, elapsed: 10, difficulty: 'pro' }), 7500);
  assert.equal(rankedScore({ score: 5000, won: true, elapsed: PAR_SECONDS.solo - 5, difficulty: 'media' }), 5000 + 5 * FAST_BONUS_PER_S);
  assert.equal(rankedScore({ score: 5000, won: true, elapsed: PAR_SECONDS.solo + 30, difficulty: 'media' }), 5000, 'más lento que la referencia no resta');
  assert.equal(rankedScore({ score: 0, won: true, elapsed: 1, difficulty: 'pro' }), 0, 'quien no puntúa sigue en 0');
});

test('periodStarts: el día y la semana empiezan a medianoche de Madrid (también con el cambio de hora)', () => {
  // Miércoles 4-nov-2026 15:00 en Madrid (UTC+1) = 14:00 UTC.
  const s = periodStarts(Date.UTC(2026, 10, 4, 14, 0, 0));
  assert.equal(s.today, Date.UTC(2026, 10, 3, 23, 0, 0));
  assert.equal(s.week, Date.UTC(2026, 10, 1, 23, 0, 0), 'lunes 2-nov a las 00:00 de Madrid');
  // Verano (UTC+2): viernes 3-jul-2026 00:30 en Madrid = 22:30 UTC del jueves.
  const v = periodStarts(Date.UTC(2026, 6, 2, 22, 30, 0));
  assert.equal(v.today, Date.UTC(2026, 6, 2, 22, 0, 0));
  assert.equal(v.week, Date.UTC(2026, 5, 28, 22, 0, 0));
});

test('insert y tops: solo ranking semanal (lo de la semana pasada no cuenta) y el dev va aparte', async () => {
  let t = Date.UTC(2026, 10, 2, 10, 0, 0); // lunes por la mañana
  const ranking = await openGlobalRanking({ url: ':memory:', now: () => t });
  await ranking.insert({ initials: 'OLD', score: 9000, accuracy: 50, difficulty: 'media', won: false, elapsed: 60 });
  t = Date.UTC(2026, 10, 9, 10, 0, 0); // una semana después
  const a = await ranking.insert({ initials: 'AAA', score: 4000, accuracy: 40, difficulty: 'media', won: false, elapsed: 60 });
  assert.deepEqual([a.score, a.rank, a.ranks.week], [4000, 1, 1]);
  const b = await ranking.insert({ initials: 'BBB', score: 4000, accuracy: 40, difficulty: 'pro', won: false, elapsed: 60 });
  assert.equal(b.score, 6000);
  assert.equal(b.rank, 1, 'OLD es de la semana pasada: no cuenta');
  await ranking.insert({ initials: 'DEV', score: 9999, accuracy: 90, difficulty: 'pro', won: false, elapsed: 60, dev: true });
  const tops = await ranking.tops();
  assert.deepEqual(Object.keys(tops), ['week']);
  assert.deepEqual(tops.week.map((r) => r.initials), ['BBB', 'AAA']);
  assert.equal(tops.week.some((r) => r.initials === 'DEV'), false, 'las pruebas del modo dev no ensucian el ranking');
  assert.deepEqual((await ranking.tops(true)).week.map((r) => r.initials), ['DEV']);
  assert.equal((await ranking.insert({ initials: 'ZZZ', score: 0, accuracy: 0, difficulty: 'pro', won: false, elapsed: 5 })).rank, null);
  ranking.close();
});
