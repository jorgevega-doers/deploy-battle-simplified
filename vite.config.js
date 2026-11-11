// Vite: build y desarrollo del frontend (host, mando y pantalla final).
// El servidor de juego (Express + Socket.io) NO lo gestiona Vite: corre aparte en el puerto 3000.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const projectRoot = import.meta.dirname;
const clientRoot = resolve(projectRoot, 'client');

export default defineConfig({
  // Las páginas viven en /client; "public" de Vite no se usa para código (ver AGENTS.md, sección 8).
  root: clientRoot,
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // Multi-page: una entrada HTML por pantalla.
      input: {
        host: resolve(clientRoot, 'host/index.html'),
        play: resolve(clientRoot, 'play/index.html'),
        end: resolve(clientRoot, 'end/index.html'),
        home: resolve(clientRoot, 'home/index.html'),   // elegir modo (online)
        'db-admin': resolve(clientRoot, 'db-admin/index.html'), // versión pública: contraseña de desarrollador
        licencias: resolve(clientRoot, 'licencias/index.html'), // créditos y licencias de terceros (fuentes y librerías)
      },
    },
  },
  server: {
    port: 5173,
    // Las páginas importan código de /shared, que está fuera de la raíz de Vite (/client).
    fs: { allow: [projectRoot] },
    // En desarrollo, los sockets se reenvían al servidor de juego.
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
