# Publicar DEPLOY BATTLE (Render, gratis)

Se despliega en Render desde la rama **`main`** de este repositorio (Blueprint: `render.yaml`; cada push a `main` despliega solo).

## Qué es
- `/`: la pantalla del juego. HAZ CLIC PARA EMPEZAR → título → **JUGAR** → tus 3 letras → la cola común te mete en una sala con hueco (o crea una) → sala de espera → partida.
- `/home/`: la página del móvil (allí no se juega). `/end/`: SOBRE DOERS. `/licencias/`: créditos y licencias. `/healthz`: comprobación de Render.
- Sin contraseña para jugar. **`/db-admin/`** pide la contraseña de desarrollador (`DEV_PASSWORD`) y activa el modo desarrollador (menú de pruebas con la tecla M y salas aparte).
- Configuraciones de mandos compartidas en **Turso** (cuando alguien configura un mando no estándar, los demás con el mismo modelo lo reciben ya configurado). Sin Turso, viven en memoria y se pierden al reiniciar.

## Puesta en marcha (una vez)
1. **Turso** (gratis): crear cuenta en turso.tech, crear una base (p. ej. `deploy-battle`, región Frankfurt) y sacar su URL (`libsql://...turso.io`) y un token (`turso db tokens create deploy-battle`, o desde la web). Las tablas se crean solas al arrancar.
2. **Render**: un Blueprint con este `render.yaml` (o, en un servicio ya creado, Settings → Branch: `main`).
3. Variables a mano en Render: `DEV_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. `SESSION_SECRET` la genera Render. Las de versiones anteriores (`ONLINE`, `DB_PATH`, `ACCESS_PASSWORD`) ya no se usan: se pueden borrar.

URL actual: https://doers-force-arena.onrender.com

## Notas
- Se duerme tras ~15 min sin uso: la primera visita tarda ~1 min en despertar (el título lo avisa). Al reiniciarse, las salas abiertas se recrean solas con su código cuando su pantalla reconecta (la partida en curso se pierde).
- Salas a la vez: `MAX_ROOMS` (6 en el plan gratis). Una sola instancia (las salas viven en memoria).
- Probar en local: `DEV_PASSWORD=dev PORT=3100 npm run server` (sin `TURSO_DATABASE_URL`, las configuraciones de mandos van en memoria).
- El `Dockerfile` usa Debian trixie: el binario de `@libsql/client` es para glibc.
