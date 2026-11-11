# Publicar la versión arcade (Render, gratis)

La versión arcade vive en la rama **`arcade`** y se despliega en Render. La pública anterior sigue en **`public`** y el stand en **`main`** (no se publica).

## Qué es
- `/`: elegir **1 PANTALLA** (misma habitación, hasta 4 jugadores) o **A DISTANCIA** (cada uno con su pantalla y su móvil), o unirse con el código.
- Sin contraseña. **`/db-admin/`** pide la contraseña de desarrollador (`DEV_PASSWORD`) y activa el modo desarrollador (menú completo de pruebas, ranking aparte).
- Ranking global del 1 contra 3 bots en **Turso** (hoy, semana e histórico). Sin Turso, el ranking vive en memoria y se pierde al reiniciar.

## Puesta en marcha (una vez)
1. **Turso** (gratis): crear cuenta en turso.tech, crear una base (p. ej. `deploy-battle`, región Frankfurt) y sacar su URL (`libsql://...turso.io`) y un token (`turso db tokens create deploy-battle`, o desde la web). Las tablas se crean solas al arrancar.
2. **Render**: el servicio debe desplegar la rama `arcade` (en el panel: Settings → Branch, o un Blueprint nuevo con este `render.yaml`).
3. Variables a mano en Render: `DEV_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. `ACCESS_PASSWORD` ya no se usa (se puede borrar). `SESSION_SECRET` la genera Render.

URL actual: https://doers-force-arena.onrender.com

## Notas
- Se duerme tras ~15 min sin uso: la primera visita tarda ~1 min en despertar. Al reiniciarse, las salas abiertas se recrean solas con su código cuando su pantalla reconecta (la partida en curso se pierde).
- Salas a la vez: `MAX_ROOMS` (6 en el plan gratis). Una sola instancia (las salas viven en memoria).
- Probar en local: `ONLINE=1 DEV_PASSWORD=dev PORT=3100 DB_PATH=:memory: npm run server` (sin `TURSO_DATABASE_URL`, ranking en memoria).
- El `Dockerfile` usa Debian trixie porque el binario de `sqlite3` necesita glibc 2.38 (el de `@libsql/client` también es para glibc).
