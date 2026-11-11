# Fuentes

Archivos `woff2` servidos en local (el stand puede no tener Internet). Descargados de Fontsource (cdn.jsdelivr.net/fontsource) el 23-oct-2026. **Solo hay dos familias**, ambas con la licencia **SIL Open Font License 1.1** (uso comercial permitido, incluida la redistribución junto al juego, sin pagar nada):

| Archivo | Fuente | Copyright | Uso |
|---|---|---|---|
| `tiny5-latin-400-normal.woff2`, `tiny5-latin-ext-400-normal.woff2` | Tiny5 | 2022-2024 The Tiny5 Project Authors (Gissio) | Interfaz del host, del mando y de `/end` |
| `jersey15-latin-400-normal.woff2` | Jersey 15 | 2023 The Soft Type Project Authors (Sporting Type) | Mando y `/end` (móviles; 29-oct): pixel art más detallado y legible que Tiny5 a tamaños pequeños |
| `manrope-latin-wght-normal.woff2` | Manrope (variable) | 2018 The Manrope Project Authors | Solo `/end` (textos largos) y el logotipo provisional "doers" |

Los textos oficiales de la licencia, con el aviso de copyright de cada fuente, están en `licenses/` (copiados de https://github.com/google/fonts, carpeta `ofl/`). Se muestran a los visitantes en `/licencias/` (enlace "Créditos y licencias" al pie de `/end`), que es donde la OFL exige acompañar la licencia a las fuentes que se distribuyen.

**Reglas de la OFL que hay que respetar:**
*   No vender las fuentes por separado (aquí van dentro del juego, que es lo permitido).
*   Mantener el aviso de copyright y la licencia con ellas (hecho: `licenses/` y `/licencias/`).
*   Si alguna vez se modifican (más allá de convertir a `woff2` o quitar caracteres), no usar su nombre reservado y publicar el resultado con la misma licencia.

**Retirada:** Press Start 2P se quitó el 26-oct-2026 (ya no se usaba; tenía un nombre reservado y una licencia más que mantener).
Cuando llegue la tipografía corporativa de DOERS, se cambia el `@font-face` de Manrope en `client/theme.css` y se actualizan esta tabla y `licenses/`.
