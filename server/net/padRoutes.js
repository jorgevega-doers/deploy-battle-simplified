// API de configuraciones de mandos compartidas (server/db/padConfigs.js):
//  - GET  /api/pads?id=ID          -> { mapping } (la más votada para ese modelo) o 404 si nadie lo ha configurado aún.
//  - POST /api/pads { id, mapping } -> guarda el voto de quien lo configuró (uno por IP y modelo; la IP no se guarda: solo una huella).
// Límite: 20 votos cada 10 minutos por IP. Qué NO hace: no decide nada del juego.
import { createHash } from 'node:crypto';
import { createRateLimiter } from './auth.js';
import { parsePadId, parsePadMapping } from '../db/padConfigs.js';

export function registerPadRoutes(app, { json, padsReady, salt = '', now }) {
  const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000, now });
  const voterOf = (ip) => createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 20);

  app.get('/api/pads', async (req, res) => {
    const id = parsePadId(req.query?.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    try {
      const mapping = await (await padsReady).best(id);
      return mapping ? res.json({ mapping }) : res.status(404).json({ error: 'unknown_pad' });
    } catch (err) {
      console.error('No se pudo leer la configuración del mando:', err.message);
      return res.status(503).json({ error: 'unavailable' });
    }
  });

  app.post('/api/pads', json, async (req, res) => {
    if (!limiter(req.ip)) return res.status(429).json({ error: 'too_many' });
    const id = parsePadId(req.body?.id);
    const mapping = parsePadMapping(req.body?.mapping);
    if (!id || !mapping) return res.status(400).json({ error: 'bad_mapping' });
    try {
      await (await padsReady).vote(id, mapping, voterOf(req.ip));
      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('No se pudo guardar la configuración del mando:', err.message);
      return res.status(503).json({ error: 'unavailable' });
    }
  });
}
