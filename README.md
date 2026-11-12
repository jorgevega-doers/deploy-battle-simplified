# DEPLOY BATTLE

Juego web de tanques de 1 a 4 jugadores de **DOERS DF** ("The Badass Team"). Abres la web, le das a **JUGAR**, pones tus 3 iniciales y juegas: contra gente de cualquier sitio o contra 3 bots. Sin registro y sin instalar nada.

**Jugar:** https://deploy-battle-arcade.onrender.com
(El servicio gratuito de Render se duerme tras ~15 min sin uso: la primera visita tarda ~1 min en despertar.)

Se juega en el **ordenador** (navegador con WebGL 2) con teclado y ratón o con un mando. En el móvil solo hay una página informativa (`/home/`).

## Cómo se juega
1. **HAZ CLIC PARA EMPEZAR** → animación de logos → pantalla de título → **JUGAR**.
2. Eliges un nombre de 3 letras y la cola común te mete en una sala con hueco (hasta 4 jugadores por sala).
3. **Sala de espera:** cualquiera pulsa **JUGAR** y arranca una cuenta atrás de 10 s; empieza la partida con quien haya (si estás solo, contra 3 bots). Se puede cancelar, con un límite por jugador.
4. **Partida:** 5 vidas para todos, mapa aleatorio, 180 s como máximo. Al acabar vuelves a la sala de espera.

### Controles
| | Teclado y ratón | Mando |
|---|---|---|
| Mover | `W A S D` o flechas | stick izquierdo |
| Apuntar | ratón | stick derecho |
| Disparar | clic (mantener = continuo) | `R1` / `RB` |
| Acelerón | `ESPACIO` | `L1` / `LB` |
| Jugar / pausa | `ENTER` / `ESC` | `START` |
| Salir | `ESC` | `SELECT` |

Los mandos no estándar se configuran la primera vez que se usan; la configuración se comparte entre jugadores con el mismo modelo.

## Arrancar en local
Requiere **Node 24**.
```
npm install
npm run build        # genera dist/ (repetir tras cambiar algo del frontend)
npm run server       # http://localhost:3000
```
- `npm run dev`: servidor de Vite para el frontend. `npm run server:watch`: servidor con recarga.
- `npm test`: pruebas con `node:test` (lógica pura e integración con sockets reales).
- Para probar rápido: `MATCH_SECONDS=20 npm run server`.
- Modo desarrollador: `DEV_PASSWORD=dev npm run server`, entra en `/db-admin/`. Con la tecla `M` aparece el menú de pruebas (mapa, dificultad, bots, acabar tiempo) y una etiqueta "MODO DEV"; se sale desde el propio menú.

### Variables de entorno
| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | 3000 |
| `MAX_ROOMS` | Salas simultáneas | según config |
| `MAX_SOCKETS` | Conexiones simultáneas | 150 |
| `PUBLIC_LIVES` | Vidas por partida | 5 |
| `MATCH_SECONDS` | Duración máxima de la partida | 180 |
| `DEV_PASSWORD` | Activa el modo desarrollador | (desactivado) |
| `SESSION_SECRET` | Firma de la cookie del modo dev | generada |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Configuraciones de mandos compartidas | (en memoria) |

## Cómo está hecho
- **Servidor autoritativo** (Node + Express + Socket.io, solo WebSocket): el cliente manda intenciones y el servidor decide movimiento, colisiones, daño y rebotes. Simulación a 60 Hz, estado a 30 Hz. Sin librerías de física.
- **Cliente** con Three.js y Vite: interpolación de 90 ms, escena a baja resolución (píxel grande), bloom y corrección de color. Todo el arte y el audio se generan por código.
- Cada sala es un namespace de Socket.io; reconexión con token y tiempos de gracia.

```
server/   index.js · app.js · online.js (salas, API) · net/ (sockets, salas, validación) · game/ (sesión, partida, tanques, bots) · db/
shared/   geometría, mapas, eventos y constantes comunes a cliente y servidor
client/   host/ (título, sala y partida) · home/ (móvil) · end/ (SOBRE DOERS) · licencias/ · db-admin/
assets/   logos, fuentes, texturas y sprites
tests/    pruebas (npm test)
```

## Despliegue
Render, desde la rama `main` (`render.yaml` + `Dockerfile`). Pasos y variables en [DEPLOY.md](DEPLOY.md).

## Licencias
Créditos y licencias de terceros: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) y la página `/licencias/`.
