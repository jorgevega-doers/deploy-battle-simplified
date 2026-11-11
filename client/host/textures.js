// Carga de las texturas pixel art y creación de cajas con cada cara asignada a su tile del atlas.
// Las imágenes salen de scripts/generate-textures.js (npm run textures) y Vite las incorpora al build.
import { BoxGeometry, TextureLoader, NearestFilter, SRGBColorSpace } from 'three';
import { remapBoxUVs } from '../../shared/atlas.js';
import atlasUrl from '../../assets/textures/atlas.png';

// Textura de pixel art: filtro "más cercano" (sin suavizado, los píxeles se ven nítidos) y sin mipmaps (AGENTS.md, sección 9).
function loadPixelTexture(url) {
  const texture = new TextureLoader().load(url);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Atlas de tanques y power-ups. La ciudad y el suelo ya no usan imágenes: se pintan al arrancar (cityMesh.js).
export function loadTextures() {
  return { atlas: loadPixelTexture(atlasUrl) };
}

// Caja de w x h x d cuyas 6 caras usan los tiles indicados, en el orden de BoxGeometry: [+x, -x, arriba, abajo, +z, -z].
export function texturedBox(width, height, depth, faceTiles) {
  const geometry = new BoxGeometry(width, height, depth);
  remapBoxUVs(geometry.attributes.uv.array, faceTiles);
  geometry.attributes.uv.needsUpdate = true;
  return geometry;
}
