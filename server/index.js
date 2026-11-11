// Arranque del servidor: abre el puerto y, salvo que se desactive, el túnel público de Cloudflare para que el QR
// funcione desde cualquier dispositivo y red (Wi-Fi o 4G/5G). La construcción de Express + Socket.io está en app.js.
// TUNNEL=0 npm run server  -> sin túnel (el QR usa la IP de la red local). Con PUBLIC_URL tampoco se abre (ya hay URL).
import { createApp } from './app.js';
import { config } from './config.js';
import { GAME_NAME } from '../shared/constants.js';
import { startTunnel } from './net/tunnel.js';
import { prepareDataFile } from './db/dataDir.js';
import { startAutoBackup } from './db/backup.js';

// Red de seguridad: un error inesperado se registra y el servicio sigue (en una feria no puede caerse por un mando raro).
process.on('uncaughtException', (err) => console.error('Excepción no capturada:', err));
process.on('unhandledRejection', (err) => console.error('Promesa rechazada sin capturar:', err));

// Datos del stand (secciÃ³n 78): carpeta fuera del proyecto, copia de la base de datos antigua la primera vez y copias de seguridad automÃ¡ticas.
let backups = null;
if (!config.online && config.dbPath !== ':memory:') {
  try {
    prepareDataFile(config.dbPath, { legacy: config.legacyDbPath });
    console.log(`Datos (Top 10 y emails): ${config.dbPath}\n  Copias de seguridad: ${config.backupDir}`);
    backups = startAutoBackup(config.dbPath, config.backupDir);
  } catch (err) {
    console.error(`No se pudo preparar la carpeta de datos (${config.dbPath}): ${err.message}`);
  }
}

const { server, startLoop } = createApp({ requireEmail: config.requireEmail, backups, sheetsDefaults: config.sheetsDefault, sheetsFile: !config.online && config.dbPath !== ':memory:' ? config.sheetsFile : null }); // el stand pide el email al entrar (REQUIRE_EMAIL=0 lo quita)

server.listen(config.port, () => {
  startLoop();
  console.log(`${GAME_NAME} escuchando en http://localhost:${config.port}`);
  if (config.online) { // modo online: lo publica la plataforma (HTTPS propio), sin túnel; la contraseña es obligatoria
    console.log('  MODO ONLINE: salas con código y contraseña de acceso. Inicio: /');
    return;
  }
  console.log(`  Pantalla principal: http://localhost:${config.port}/host/`);
  console.log(`  Mando:              http://localhost:${config.port}/play/`);
  if (!config.publicUrl && process.env.TUNNEL !== '0') {
    console.log('Abriendo el túnel de Cloudflare para el QR...');
    startTunnel(config.port);
  }
});
