# DEPLOY BATTLE · versión arcade

Juego web de tanques de 1 a 4 jugadores de DOERS DF. Abres la web, le das a **JUGAR**, pones tus iniciales y juegas: online contra gente de cualquier sitio o contra 3 bots. Se juega en el ordenador con teclado y ratón o con un mando.

Esta rama (`arcade`) es la versión simplificada para el público. La versión pública anterior está en `public` y la del stand de la feria en `main`. El despliegue en Render está en [DEPLOY.md](DEPLOY.md) (Blueprint: `render.yaml`, rama `arcade`).

## Arrancar en local
```
npm install
npm run build                 # genera las páginas en dist/ (repetir tras cambiar algo del frontend)
ONLINE=1 npm run server       # http://localhost:3000
```
- `MATCH_SECONDS=20` para partidas cortas al probar.
- `npm test` ejecuta las pruebas.

## Controles
- **Teclado y ratón:** WASD o flechas mueven, el ratón apunta, clic dispara, ESPACIO impulso, ENTER empezar, ESC pausa.
- **Mando:** stick izquierdo mueve, stick derecho apunta, R1 / RB dispara, L1 / LB impulso, START empezar y pausa.

## Licencias
Créditos y licencias de terceros: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) y la página `/licencias/`.
