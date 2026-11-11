// Escena 3D de la arena: renderizador, cámara inclinada, luces (solo para los tanques), ciudad, niebla y brillo neón (bloom).
// Conversión de coordenadas: el mundo del juego tiene X a la derecha e Y hacia arriba (en pantalla);
// en Three.js eso es X = x, Z = -y (el "arriba" de la pantalla es el norte, -Z).
// Presupuesto de rendimiento (AGENTS.md, sección 19): sin sombras, sin antialias, la escena a un tercio de la resolución
// (píxel "gordo"), toda la ciudad en una sola malla (cityMesh.js) y el bloom a baja resolución y apagable.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Vector2, Vector3, Color, Fog, Group,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadTextures } from './textures.js';
import { MOODS } from './moods.js';
import { createCityMeshes } from './cityMesh.js';
import { createColorGradePass } from './colorGrade.js';

const VERTICAL_FOV = 28;     // grados: un ángulo estrecho deforma poco la perspectiva
const TILT_DEG = 44;         // inclinación de la cámara respecto a la vertical (0 = cenital puro; antes 20)
// Zona de la pantalla (en coordenadas -1..1) donde debe caber la arena jugable: deja sitio arriba al cronómetro y abajo
// a los marcadores de jugador, que así no tapan el campo.
const FRAME = { left: -0.97, right: 0.97, bottom: -0.72, top: 0.84 };
// Píxel "gordo" como en las referencias: la escena se dibuja a 1/N de la resolución de la pantalla y el navegador la
// amplía sin suavizar (CSS image-rendering: pixelated). N entero para que todos los píxeles midan lo mismo: con
// 1080 de alto, N = 2 (la escena se dibuja a 960 x 540, 4 veces menos píxeles). Con N = 3 (?pixel=3) el píxel es aún
// más grueso, pero los letreros pequeños de la ciudad pierden columnas y no se leen.
const TARGET_HEIGHT = 540;
export const pixelScaleFor = (height) => Math.max(1, Math.round(height / TARGET_HEIGHT));
// Brillo neón: solo brillan los colores más claros (letras de carteles, proyectiles, power-ups). Intensidad moderada:
// con tantos carteles, más fuerza empasta la imagen (y la fuerza no cambia el coste; lo que cuesta es la resolución).
// Bloom "acogedor": suave, poco intenso y teñido de ámbar. Las ventanas están pintadas en tonos medios (por debajo del
// umbral), así que solo brillan las letras de neón y los farolillos; antes, cientos de ventanas blancas sumaban un velo.
const BLOOM = { strength: 0.34, radius: 0.4, threshold: 0.8 };
const BLOOM_TINT = [1.0, 0.8, 0.6]; // el halo de cualquier luz sale cálido
const BACKGROUND = 0x1a1426; // ciruela oscuro cálido: color de la niebla de distancia (y del cielo, que no se ve)
// Zona sin niebla de los bordes (en celdas del mundo): la arena con su borde de edificios; más margen al norte para que
// se vean las fachadas y vallas del fondo. Fuera, la ciudad se funde en bruma cálida (colorGrade.js).
const CLEAR_ZONE = { x0: -0.8, x1: 32.8, y0: -0.6, y1: 20.2 };
// Zoom del KO: la cámara se acerca hasta el 40 % de su distancia de reposo y se centra casi del todo en el tanque.
const ZOOM_AMOUNT = 0.6;
const ZOOM_FOLLOW = 0.92;

export function createScene(canvas, arena, { bloom = true, pixelScale = null } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  canvas.style.imageRendering = 'pixelated';
  renderer.info.autoReset = false; // con post-procesado se dibuja varias veces por fotograma: se reinicia a mano para medir el total

  const scene = new Scene();
  // Con el post-procesado, el color de fondo debe ir en la escena (no solo en setClearColor): si no, se convierte dos veces.
  scene.background = new Color(BACKGROUND);
  scene.fog = new Fog(BACKGROUND, 40, 80); // la distancia real se ajusta en resize(): funde la ciudad de fondo en azul
  const camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.1, 200);
  const center = new Vector3(arena.width / 2, 0, -arena.height / 2);
  const textures = loadTextures();
  // Una ciudad por mapa, cada una en su grupo: se construye la primera vez que se usa y luego solo se enciende o se apaga.
  const maps = new Map();
  let city = null;
  function setMap(mapArena) {
    let entry = maps.get(mapArena.mapIndex);
    if (!entry) {
      const group = new Group();
      scene.add(group);
      entry = { group, arena: mapArena, city: createCityMeshes(group, mapArena), life: null };
      maps.set(mapArena.mapIndex, entry);
      console.info(`Ciudad del mapa ${mapArena.mapName}: ${entry.city.faces} caras, atlas ${entry.city.atlasSize}, creada en ${entry.city.buildMs} ms`);
    }
    for (const other of maps.values()) other.group.visible = other === entry;
    city = entry.city;
    applyMood(mapArena.mood);
    return entry;
  }

  // Luces solo para los tanques (Lambert); la ciudad no usa luces (lleva el sombreado pintado).
  const hemi = new HemisphereLight(0xb8bcff, 0x10102a, 1.15);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffffff, 1.0);
  sun.position.set(center.x - 8, 26, center.z + 12);
  scene.add(sun);

  // Post-procesado: dibujo normal + brillo (bloom) + conversión de color final. El bloom trabaja a media resolución.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  for (const tint of bloomPass.bloomTintColors) tint.set(...BLOOM_TINT);
  composer.addPass(bloomPass);
  const gradePass = createColorGradePass();
  composer.addPass(gradePass);

  // Ambiente de luz del mapa (client/host/moods.js): fondo, niebla, corrección de color, bloom y luces de los tanques.
  function applyMood(name) {
    const mood = MOODS[name] ?? MOODS.night;
    scene.background.setHex(mood.background);
    scene.fog.color.setHex(mood.background);
    const u = gradePass.uniforms;
    u.warmth.value = mood.grade.warmth;
    u.hazeColor.value.set(mood.grade.haze);
    u.haze.value = mood.grade.hazeAmount;
    u.fogColor.value.set(mood.grade.fog);
    u.fogAmount.value = mood.grade.fogAmount;
    u.vignette.value = mood.grade.vignette;
    u.tint.value.set(...mood.grade.tint);
    bloomPass.strength = mood.bloom.strength;
    bloomPass.threshold = mood.bloom.threshold;
    hemi.color.setHex(mood.hemi[0]); hemi.groundColor.setHex(mood.hemi[1]); hemi.intensity = mood.hemi[2];
    sun.color.setHex(mood.sun[0]); sun.intensity = mood.sun[1];
  }
  setMap(arena);
  const clearCorners = [[CLEAR_ZONE.x0, CLEAR_ZONE.y0], [CLEAR_ZONE.x1, CLEAR_ZONE.y0], [CLEAR_ZONE.x1, CLEAR_ZONE.y1], [CLEAR_ZONE.x0, CLEAR_ZONE.y1]]
    .map(([x, y]) => new Vector3(x, 0, -y));
  composer.addPass(new OutputPass());

  // Nivel de calidad (client/host/quality.js): 0 completo, 1 bloom a menos resolución, 2 y 3 sin bloom (siempre con
  // corrección de color, para que el aspecto no cambie). "bloom = false" (?bloom=0) arranca en el nivel 3.
  let qualityLevel = bloom ? 0 : 3;
  let scale = 1;

  // Esquinas del suelo jugable (dentro del borde) que deben verse enteras.
  const corners = [[1, 1], [arena.width - 1, 1], [arena.width - 1, arena.height - 1], [1, arena.height - 1]].map(([x, y]) => new Vector3(x, 0, -y));
  const projected = new Vector3();
  const tilt = (TILT_DEG * Math.PI) / 180;
  const direction = new Vector3(0, Math.cos(tilt), Math.sin(tilt)); // de la arena hacia la cámara (arriba y al sur)

  // Zoom de cámara (impactos y KO; lo calcula juice.js): 0-1 hacia el punto (zx, zz) del mundo de Three.js. La cámara no se
  // mueve ni se inclina en reposo: con pixel art, mover o girar toda la escena hace que los píxeles "bailen".
  const camFx = { zoom: 0, zx: 0, zz: 0 };
  const camTarget = new Vector3();
  let baseDistance = 40;

  // Coloca la cámara según el reposo + los efectos y recalcula la zona sin niebla de los bordes (en pantalla).
  function poseCamera() {
    camTarget.copy(center);
    camTarget.x += (camFx.zx - center.x) * camFx.zoom * ZOOM_FOLLOW;
    camTarget.z += (camFx.zz - center.z) * camFx.zoom * ZOOM_FOLLOW;
    camera.position.copy(camTarget).addScaledVector(direction, baseDistance * (1 - ZOOM_AMOUNT * camFx.zoom));
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    clearCorners.forEach((corner, i) => {
      projected.copy(corner).project(camera);
      gradePass.uniforms.quad.value[i].set((projected.x + 1) / 2, (projected.y + 1) / 2);
    });
  }

  // Coloca la cámara a la distancia justa para que las esquinas quepan en FRAME, y desplaza la imagen en vertical
  // (setViewOffset) para centrar la arena en esa zona sin cambiar la perspectiva.
  function placeCamera(width, height) {
    camera.aspect = width / height;
    camera.clearViewOffset();
    const extents = (distance) => {
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const corner of corners) {
        projected.copy(corner).project(camera);
        minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x);
        minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
      }
      return { minX, maxX, minY, maxY };
    };
    const fits = (e) => e.maxX - e.minX <= FRAME.right - FRAME.left && e.maxY - e.minY <= FRAME.top - FRAME.bottom;
    let near = 5;
    let far = 200;
    for (let i = 0; i < 40; i++) { // búsqueda binaria de la distancia mínima que cabe
      const mid = (near + far) / 2;
      if (fits(extents(mid))) far = mid; else near = mid;
    }
    const e = extents(far);
    // Desplazamiento vertical: que el borde de abajo de la arena quede justo encima de los marcadores.
    const shift = FRAME.bottom - e.minY; // en unidades de pantalla (-1..1); positivo = subir la imagen
    camera.setViewOffset(width, height, 0, (shift * height) / 2, width, height);
    scene.fog.near = far + 7; // empieza pasado el borde norte de la arena: el campo de juego no se empaña
    scene.fog.far = far + 42;
    baseDistance = far;
    // Zona sin niebla de bordes, en coordenadas de pantalla 0-1 (con el desplazamiento de la vista ya aplicado).
    poseCamera();
    gradePass.uniforms.aspect.value = width / height;
  }

  // Coloca la cámara para que toda la arena quepa, sea cual sea la proporción de la pantalla.
  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    scale = pixelScale ?? pixelScaleFor(height * window.devicePixelRatio);
    renderer.setPixelRatio(window.devicePixelRatio / scale);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    // El bloom trabaja a la mitad de la resolución de dibujo (nivel 0) o a un tercio (nivel 1): un halo no necesita detalle.
    const bloomDivisor = qualityLevel === 0 ? 2 : 3;
    bloomPass.setSize(Math.floor((width * renderer.getPixelRatio()) / bloomDivisor), Math.floor((height * renderer.getPixelRatio()) / bloomDivisor));
    bloomPass.enabled = qualityLevel < 2;
    placeCamera(width, height);
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer,
    scene,
    camera,
    textures,
    get city() { return city; }, // lo que devuelve createCityMeshes del mapa actual (client/host/life.js lo usa para dar vida a la ciudad)
    setMap, // cambia de mapa: devuelve { group, arena, city, life } (life lo rellena main.js)
    resize,
    get qualityLevel() { return qualityLevel; },
    get bloomEnabled() { return qualityLevel < 2; },
    get pixelScale() { return scale; },
    // Aplica el zoom de este fotograma (ver camFx). Debe llamarse antes de colocar las etiquetas de los tanques.
    setCameraFx(fx) {
      if (fx.zoom === camFx.zoom && fx.zx === camFx.zx && fx.zz === camFx.zz) return; // sin cambios: nada que recalcular
      camFx.zoom = fx.zoom; camFx.zx = fx.zx; camFx.zz = fx.zz;
      poseCamera();
    },
    // Cambia el nivel de calidad y reajusta la resolución.
    setQuality(level) {
      qualityLevel = level;
      resize();
    },
    // Siempre con el composer, en todos los niveles: la corrección de color (calidez ámbar, niebla de bordes y viñeta)
    // da el aspecto del juego y debe verse igual en cualquier equipo. Dibujar directo en el nivel 3 la hacía desaparecer
    // a mitad de partida, en cuanto la calidad adaptativa bajaba. Lo que se apaga al bajar de nivel es solo el bloom.
    render() {
      renderer.info.reset();
      composer.render();
    },
  };
}
