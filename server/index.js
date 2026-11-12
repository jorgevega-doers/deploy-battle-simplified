// Arranque del servidor: abre el puerto. La construcción de Express + Socket.io está en app.js.
import { createApp } from './app.js';
import { config } from './config.js';
import { GAME_NAME } from '../shared/constants.js';

// Red de seguridad: un error inesperado se registra y el servicio sigue (una sala rota no debe tumbar las demás).
process.on('uncaughtException', (err) => console.error('Excepción no capturada:', err));
process.on('unhandledRejection', (err) => console.error('Promesa rechazada sin capturar:', err));

const { server, startLoop } = createApp();

server.listen(config.port, () => {
  startLoop();
  console.log(`${GAME_NAME} escuchando en http://localhost:${config.port}`);
});
