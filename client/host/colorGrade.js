// Corrección de color final del host (un paso de post-procesado muy barato: una lectura por píxel). Da el ambiente
// "cozy" de noche japonesa:
//  - balance de blancos cálido (todo tira a ámbar; las luces, más),
//  - neblina cálida suave que levanta un poco las sombras,
//  - niebla en los bordes: lo que queda fuera de la arena (la ciudad de alrededor, que no importa para jugar) se funde en
//    una bruma cálida, con trama ordenada de 4 x 4 para que el degradado salga en escalones de píxel como el resto,
//  - viñeta suave.
// La zona sin niebla es un cuadrilátero en pantalla (las esquinas de la arena proyectadas), que fija scene.js.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Color, Vector2 } from 'three';

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    warmth: { value: 1.0 },
    hazeColor: { value: new Color('#3a2a3c') },
    haze: { value: 0.18 },
    fogColor: { value: new Color('#2a1f30') },
    fogAmount: { value: 0.72 },
    fogWidth: { value: 0.16 },
    quad: { value: [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)] },
    aspect: { value: 16 / 9 },
    vignette: { value: 0.55 },
    tint: { value: new Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform vec3 hazeColor;
    uniform float haze;
    uniform vec3 fogColor;
    uniform float fogAmount;
    uniform float fogWidth;
    uniform vec2 quad[4];
    uniform float aspect;
    uniform float vignette;
    uniform vec3 tint;
    varying vec2 vUv;

    // Distancia con signo al cuadrilátero de la arena (positiva fuera), en unidades de alto de pantalla.
    float edgeDistance(vec2 p) {
      vec2 s = vec2(aspect, 1.0);
      float d = -1e9;
      for (int i = 0; i < 4; i++) {
        vec2 a = quad[i] * s;
        vec2 b = quad[(i + 1) % 4] * s;
        vec2 e = normalize(b - a);
        d = max(d, dot(p * s - a, vec2(e.y, -e.x)));
      }
      return d;
    }
    // Umbral de la matriz de Bayer 4 x 4 para el píxel actual (trama ordenada).
    float bayer4(vec2 fragCoord) {
      int x = int(mod(fragCoord.x, 4.0));
      int y = int(mod(fragCoord.y, 4.0));
      int i = y * 4 + x;
      float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
      return (m[i] + 0.5) / 16.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      // Balance de blancos cálido para todo y aún más en las luces.
      color.rgb *= mix(vec3(1.0), vec3(1.07, 0.98, 0.86), warmth);
      color.rgb = mix(color.rgb, color.rgb * vec3(1.08, 0.97, 0.8), smoothstep(0.03, 0.45, luma) * warmth);
      // Neblina cálida: levanta las sombras hacia un tono ciruela.
      color.rgb = mix(color.rgb, hazeColor, haze * (1.0 - smoothstep(0.0, 0.5, luma)));
      // Niebla de los bordes, en 4 escalones con trama.
      float f = clamp(edgeDistance(vUv) / fogWidth, 0.0, 1.0);
      float stepped = floor(f * 4.0 + bayer4(gl_FragCoord.xy)) / 4.0;
      color.rgb = mix(color.rgb, fogColor, clamp(stepped, 0.0, 1.0) * fogAmount);
      vec2 d = vUv - 0.5;
      color.rgb *= 1.0 - dot(d, d) * vignette;
      color.rgb *= tint; // tinte global del ambiente del mapa (atardecer, lluvia...)
      gl_FragColor = color;
    }`,
};

export function createColorGradePass() {
  return new ShaderPass(ColorGradeShader);
}
