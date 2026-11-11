// Calcula la URL del mando (/play/) que va dentro del QR.
// Prioridad: PUBLIC_URL (el túnel público, para móviles con 4G/5G) > IP de la red local > localhost.
import { networkInterfaces } from 'node:os';

export function getPlayUrl({ publicUrl, port, interfaces = networkInterfaces() }) {
  if (publicUrl) return `${publicUrl.replace(/\/+$/, '')}/play/`;
  for (const addresses of Object.values(interfaces)) {
    const lan = (addresses ?? []).find((a) => a.family === 'IPv4' && !a.internal);
    if (lan) return `http://${lan.address}:${port}/play/`;
  }
  return `http://localhost:${port}/play/`;
}
