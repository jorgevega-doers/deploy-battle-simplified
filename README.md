# DEPLOY BATTLE

Juego web de tanques de 1 a 4 jugadores de DOERS DF. Abres la web, le das a **JUGAR**, pones tus iniciales y juegas: online contra gente de cualquier sitio o contra 3 bots. Se juega en el ordenador con teclado y ratón o con un mando (en el móvil solo hay una página informativa, `/home/`).

Se despliega en Render desde la rama `main`: ver [DEPLOY.md](DEPLOY.md) (Blueprint: `render.yaml`).

## Arrancar en local
```
npm install
npm run build                 # genera las páginas en dist/ (repetir tras cambiar algo del frontend)
npm run server                # http://localhost:3000
```
- `MATCH_SECONDS=20` para partidas cortas al probar; `DEV_PASSWORD=dev` activa el modo desarrollador en `/db-admin/`.
- `npm test` ejecuta las pruebas.

## Controles
- **Teclado y ratón:** WASD o flechas mueven, el ratón apunta, clic dispara (mantenido, disparo continuo), ESPACIO acelerón, ENTER jugar, ESC pausa.
- **Mando:** stick izquierdo mueve, stick derecho apunta, R1 / RB dispara, L1 / LB acelerón, START jugar y pausa, SELECT salir.

## Licencias
Créditos y licencias de terceros: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) y la página `/licencias/`.
