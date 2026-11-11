// Decide si una petición viene del propio portátil del stand (y no de Internet).
// Importante: el túnel de Cloudflare también conecta desde 127.0.0.1, pero añade cabeceras
// (cf-connecting-ip / x-forwarded-for). Si aparecen, la petición es remota aunque la IP sea local.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalRequest(address, headers = {}) {
  if (headers['cf-connecting-ip'] || headers['x-forwarded-for']) return false;
  return LOOPBACK.has(address);
}
