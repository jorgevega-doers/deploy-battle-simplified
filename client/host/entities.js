// Elementos dinámicos de la escena: tanques, proyectiles, power-ups, línea de apuntado y efectos.
// Todo se crea UNA vez al arrancar y después solo se mueve (objetos reutilizados, sin crear nada en cada fotograma).
import {
  Group, Mesh, InstancedMesh, Object3D, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial,
  BufferGeometry, BufferAttribute, Color, DoubleSide, BackSide, AdditiveBlending, Vector3, CylinderGeometry, RingGeometry,
} from 'three';
import { tracePath } from '../../shared/geometry.js';
import { POWERUP_TYPES, AIM_ASSIST_LENGTH } from '../../shared/constants.js';
import { texturedBox } from './textures.js';
import { createTankMarkers } from './tankMarkers.js';
import { createBulletBits } from './bulletBits.js';
import { TANK_COLORS, PROJECTILE_CORE, PROJECTILE_HALO } from './playerColors.js';
import { createTniTank, createTniShots } from './tniFx.js';

// Tanques: P1 azul eléctrico, P2 magenta y, en el modo de un jugador, bots cian y ámbar (claros: se ven sobre la ciudad oscura).
// Disparos: núcleo claro + halo semitransparente del color del jugador (los de explosión, con el halo más grande).
// Tonos por debajo del umbral del bloom para que no deslumbren.
const TANK_GLOW = 0.32;       // brillo propio del tanque (lo despega del fondo; el destello de impacto sube a 0,9)
const AIM_BOUNCES = 2;       // la línea de apuntado enseña como mucho 2 rebotes (AGENTS.md, sección 5)
const AIM_DASH = 0.32;        // longitud de cada trazo de la línea de apuntado, en celdas
const AIM_GAP = 0.22;         // hueco entre trazos
const AIM_WIDTH = 0.11;       // ancho de cada trazo, en celdas
const AIM_FIRST_OFFSET = 0.6; // el primer trazo empieza algo delante del cañón
const MAX_AIM_DASHES = Math.ceil(AIM_ASSIST_LENGTH / (AIM_DASH + AIM_GAP)) + 1;
const SPAWN_MS = 600;                              // animación de reaparición tras un impacto
const SPAWN_SCALES = [0.2, 0.55, 0.95, 1.22, 1.1, 1.0]; // "pop" a saltos del tanque al aparecer
const SHIELD_COLOR = 0x5be38f; // verde apagado (acento de la paleta): el escudo
const SHIELD_INDEX = POWERUP_TYPES.indexOf('shield');
const MAX_PROJECTILES = 32;
const MAX_POWERUPS = 4;
const MAX_EFFECTS = 12; // aros de explosiones, impactos y los 3 del KO

// overlay = { camera, layer }: cámara y capa HTML donde van las etiquetas de los tanques.
export function createEntities(scene, arena, textures, overlay = {}) {
  const dummy = new Object3D();

  // --- Tanques: cuerpo + torreta + cañón (cajas con textura pixel art). El cañón gira con el ángulo de apuntado. ---
  // Cada jugador tiene sus propias cajas porque usan tiles distintos del atlas (t1_* azul, t2_* fucsia).
  const haloGeometry = new BoxGeometry(1.3, 0.06, 1.3);
  const haloMaterial = new MeshBasicMaterial({ color: 0x00f0ff });
  const beamGeometry = new BoxGeometry(0.9, 6, 0.9);
  const shieldGeometry = new CylinderGeometry(0.8, 0.8, 0.8, 8);
  const shieldMaterial = new MeshBasicMaterial({ color: SHIELD_COLOR, transparent: true, opacity: 0.32, depthWrite: false });

  const tanks = TANK_COLORS.map((color, index) => {
    const prefix = `t${index + 1}`;
    const side = `${prefix}_side`;
    const top = `${prefix}_top`;
    const dark = `${prefix}_dark`;
    // Caras: [+x, -x, arriba, abajo, +z, -z]
    const bodyGeometry = texturedBox(0.9, 0.42, 0.9, [side, side, top, dark, side, side]);
    const turretGeometry = texturedBox(0.5, 0.26, 0.5, [dark, dark, top, dark, dark, dark]);
    const barrelGeometry = texturedBox(0.7, 0.14, 0.14, [dark, dark, dark, dark, dark, dark]);
    // El "emissive" aclara un poco la textura y sirve para el destello blanco al recibir un impacto.
    const material = new MeshLambertMaterial({ map: textures.atlas, emissive: color, emissiveIntensity: TANK_GLOW });
    const group = new Group();
    const body = new Mesh(bodyGeometry, material);
    body.position.y = 0.23;
    const turret = new Mesh(turretGeometry, material);
    turret.position.y = 0.6;
    const pivot = new Group(); // gira alrededor del eje vertical en el centro de la torreta
    pivot.position.y = 0.6;
    const barrel = new Mesh(barrelGeometry, material);
    barrel.position.x = 0.42;
    pivot.add(barrel);
    const halo = new Mesh(haloGeometry, haloMaterial);
    halo.position.y = 0.04;
    halo.visible = false;
    const shield = new Mesh(shieldGeometry, shieldMaterial); // burbuja del power-up de escudo (octogonal, como los anillos)
    shield.position.y = 0.4;
    shield.visible = false;
    // Easter egg de TNI (sección 88): su propio tanque, escondido hasta que un jugador se llame así.
    const tni = createTniTank();
    group.add(body, turret, pivot, halo, shield, tni.body);
    pivot.add(tni.barrel);
    group.visible = false;
    scene.add(group);
    // Columna de luz que baja sobre el tanque al reaparecer.
    const beam = new Mesh(beamGeometry, new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    beam.visible = false;
    scene.add(beam);
    return { group, pivot, halo, shield, beam, material, baseColor: color, flashUntil: 0, spawnStart: -1e9, normal: [body, turret, barrel], tni, isTni: false };
  });
  // Cohetes, estela, explosiones y fogonazo del bazuca de TNI.
  const tniShots = createTniShots(scene);

  // --- Línea de apuntado: solo los primeros AIM_ASSIST_LENGTH de recorrido (con sus rebotes), en trazos que se van
  // desvaneciendo con la distancia. Si enseñara toda la trayectoria del disparo, el juego no tendría dificultad.
  // Cada trazo es un segmento con color RGBA por vértice; se rellenan a mano cada fotograma (sin crear objetos). ---
  // Cada trazo es una tira plana (2 triángulos) de AIM_WIDTH de ancho: las líneas de WebGL miden siempre 1 píxel y
  // en una pantalla grande casi no se verían.
  const scratch = [];
  const aimPoint = { x: 0, y: 0 };
  const aimStart = { x: 0, y: 0 };
  const aimIndices = new Uint16Array(MAX_AIM_DASHES * 6);
  for (let d = 0; d < MAX_AIM_DASHES; d++) aimIndices.set([d * 4, d * 4 + 1, d * 4 + 2, d * 4 + 2, d * 4 + 1, d * 4 + 3], d * 6);
  const aimMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  const aimLines = TANK_COLORS.map((hex) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(MAX_AIM_DASHES * 4 * 3), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(MAX_AIM_DASHES * 4 * 4), 4));
    geometry.setIndex(new BufferAttribute(aimIndices, 1));
    const strip = new Mesh(geometry, aimMaterial);
    strip.frustumCulled = false;
    strip.visible = false;
    strip.userData.rgb = new Color(hex);
    scene.add(strip);
    return strip;
  });

  function setAimVertex(position, color, r, g, b, index, x, y, alpha) {
    const p = index * 3;
    position[p] = x;
    position[p + 1] = 0.45;
    position[p + 2] = -y; // mundo (x, y) -> Three.js (x, altura, -y)
    const c = index * 4;
    color[c] = r;
    color[c + 1] = g;
    color[c + 2] = b;
    color[c + 3] = alpha;
  }

  // Punto del recorrido a "distance" celdas del cañón (el recorrido es la lista de puntos de tracePath en "scratch").
  function pointAlongPath(distance) {
    let remaining = distance;
    for (let i = 0; i + 3 < scratch.length; i += 2) {
      const length = Math.hypot(scratch[i + 2] - scratch[i], scratch[i + 3] - scratch[i + 1]);
      if (remaining <= length || i + 5 >= scratch.length) {
        const t = length > 0 ? Math.min(1, remaining / length) : 0;
        aimPoint.x = scratch[i] + (scratch[i + 2] - scratch[i]) * t;
        aimPoint.y = scratch[i + 1] + (scratch[i + 3] - scratch[i + 1]) * t;
        return;
      }
      remaining -= length;
    }
    aimPoint.x = scratch[0];
    aimPoint.y = scratch[1];
  }

  function updateAimLine(lines, tank) {
    tracePath(arena.solid, tank.x, tank.y, tank.aim, AIM_BOUNCES, AIM_ASSIST_LENGTH, scratch);
    let total = 0;
    for (let i = 0; i + 3 < scratch.length; i += 2) total += Math.hypot(scratch[i + 2] - scratch[i], scratch[i + 3] - scratch[i + 1]);

    const position = lines.geometry.attributes.position.array;
    const color = lines.geometry.attributes.color.array;
    const { r, g, b } = lines.userData.rgb;
    let dashes = 0;
    // El primer trazo empieza un poco delante del cañón para que no quede tapado por el tanque.
    for (let start = AIM_FIRST_OFFSET; start < total && dashes < MAX_AIM_DASHES; start += AIM_DASH + AIM_GAP) {
      const end = Math.min(start + AIM_DASH, total);
      const alphaStart = Math.max(0, 1 - start / AIM_ASSIST_LENGTH) ** 1.3; // se desvanece hasta 0 al llegar a la distancia máxima
      const alphaEnd = Math.max(0, 1 - end / AIM_ASSIST_LENGTH) ** 1.3;
      pointAlongPath(start);
      aimStart.x = aimPoint.x;
      aimStart.y = aimPoint.y;
      pointAlongPath(end); // aimPoint queda en el final del trazo
      // Perpendicular al trazo (en el plano del suelo) para darle ancho.
      let nx = -(aimPoint.y - aimStart.y);
      let ny = aimPoint.x - aimStart.x;
      const length = Math.hypot(nx, ny) || 1;
      nx = (nx / length) * AIM_WIDTH / 2;
      ny = (ny / length) * AIM_WIDTH / 2;
      // Vértices del trazo: inicio-izq, inicio-der, fin-izq, fin-der (el orden que usan los índices de los triángulos).
      const base = dashes * 4;
      setAimVertex(position, color, r, g, b, base, aimStart.x - nx, aimStart.y - ny, alphaStart);
      setAimVertex(position, color, r, g, b, base + 1, aimStart.x + nx, aimStart.y + ny, alphaStart);
      setAimVertex(position, color, r, g, b, base + 2, aimPoint.x - nx, aimPoint.y - ny, alphaEnd);
      setAimVertex(position, color, r, g, b, base + 3, aimPoint.x + nx, aimPoint.y + ny, alphaEnd);
      dashes++;
    }
    lines.geometry.setDrawRange(0, dashes * 6);
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.attributes.color.needsUpdate = true;
  }

  // --- Proyectiles: núcleo claro + halo semitransparente del color de su jugador, en dos InstancedMesh con color por
  // instancia (2 llamadas de dibujo para todos). Los de explosión llevan el halo más grande. ---
  const makeProjectileMesh = (size, material) => {
    const mesh = new InstancedMesh(new BoxGeometry(size, size, size), material, MAX_PROJECTILES);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new Color(0xffffff)); // crea el búfer de colores por instancia
    scene.add(mesh);
    return mesh;
  };
  // Visibilidad del disparo (sección 61): núcleo más grande, contorno oscuro (casco invertido) que lo separa de cualquier fondo, halo más ancho y un
  // charco de luz aditivo sobre el suelo que late, del color del jugador. 4 llamadas de dibujo para todos los disparos.
  const cores = makeProjectileMesh(0.23, new MeshBasicMaterial({ color: 0xffffff }));
  const outlines = makeProjectileMesh(0.23, new MeshBasicMaterial({ color: 0x05050c, side: BackSide }));
  const halos = makeProjectileMesh(0.44, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
  const pools = (() => {
    const mesh = new InstancedMesh(new BoxGeometry(1.1, 0.02, 1.1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending }), MAX_PROJECTILES);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new Color(0xffffff));
    scene.add(mesh);
    return mesh;
  })();
  const coreColors = PROJECTILE_CORE.map((hex) => new Color(hex));
  const haloColors = PROJECTILE_HALO.map((hex) => new Color(hex));
  const markers = createTankMarkers(scene, overlay);
  const bits = createBulletBits(scene); // desintegración de los disparos que desaparecen
  const INTRO_SHOW_MS = 2000; // nombres grandes en el centro; después las etiquetas caen sobre los tanques hasta INTRO_MS (= introS del servidor)
  const INTRO_MS = 3000;
  let introAt = -1e9;
  let introMode = -1;

  // --- Power-ups: pocas cajas giratorias reutilizadas ---
  // Cada tipo tiene su propia caja con su icono en las 6 caras (tile pu_double, pu_speed o pu_aoe); un solo material.
  const powerupGeometries = POWERUP_TYPES.map((type) => {
    const tile = `pu_${type}`;
    return texturedBox(0.6, 0.6, 0.6, [tile, tile, tile, tile, tile, tile]);
  });
  const powerupMaterial = new MeshBasicMaterial({ map: textures.atlas });
  const powerups = Array.from({ length: MAX_POWERUPS }, () => {
    const mesh = new Mesh(powerupGeometries[0], powerupMaterial);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });

  // --- Aviso de aparición de un power-up (pool fijo de 3): un rayo muy fino del color del power-up que cae del cielo, chispas
  // cuadradas que suben en espiral y un aro octogonal en el suelo que se cierra hacia el centro. ---
  const WARN_COLORS = { double: 0xffd400, speed: 0x00f0ff, aoe: 0xff9a00, shield: 0x5be38f };
  const WARN_SPARKS = 5;
  const WARN_FADE_OUT_MS = 450; // el aviso se desvanece al aparecer el power-up
  const POPIN_MS = 450;         // el power-up crece y se "enciende" al aparecer (en vez de salir de golpe)
  const warnBeamGeometry = new BoxGeometry(0.07, 6, 0.07);
  const warnHeadGeometry = new BoxGeometry(0.16, 1.1, 0.16); // cabeza brillante del rayo que cae
  const WARN_TOP = 8;    // altura desde la que cae
  const WARN_LAND = 0.55; // altura a la que aterriza (donde queda el power-up)
  const warnSparkGeometry = new BoxGeometry(0.1, 0.1, 0.1);
  const warnRingGeometry = new RingGeometry(0.85, 0.98, 8, 1, Math.PI / 8);
  const warns = Array.from({ length: 3 }, () => {
    const group = new Group();
    const make = (geometry) => new Mesh(geometry, new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    const beam = make(warnBeamGeometry);
    beam.position.y = 3;
    const ring = make(warnRingGeometry);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const sparks = Array.from({ length: WARN_SPARKS }, () => make(warnSparkGeometry));
    const head = make(warnHeadGeometry);
    group.add(beam, head, ring, ...sparks);
    group.visible = false;
    scene.add(group);
    return { group, beam, head, ring, sparks, start: 0, until: 0 };
  });
  let nextWarn = 0;
  const seenAt = {}; // id del power-up -> instante en que se vio por primera vez (para la animación de aparición)

  // --- Efectos (explosiones e impactos): aros que se expanden y se desvanecen, en un pool fijo ---
  const ringGeometry = new BoxGeometry(1, 0.25, 1);
  const effects = Array.from({ length: MAX_EFFECTS }, () => {
    const material = new MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true });
    const mesh = new Mesh(ringGeometry, material);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material, start: 0, duration: 1, size: 1, active: false };
  });
  let nextEffect = 0;
  const hiddenTank = TANK_COLORS.map(() => false); // tanques destruidos que no se dibujan (los sustituyen los trozos)
  let holding = false;                         // true: los tanques se quedan donde estaban (animación de impacto)
  const lastPos = TANK_COLORS.map(() => [0, 0]); // última posición dibujada de cada tanque (mundo)
  const screenPoint = new Vector3();

  function spawnEffect(x, y, size, color, duration, now) {
    const effect = effects[nextEffect];
    nextEffect = (nextEffect + 1) % MAX_EFFECTS;
    effect.active = true;
    effect.start = now;
    effect.duration = duration;
    effect.size = size;
    effect.material.color.setHex(color);
    effect.mesh.position.set(x, 0.3, -y);
    effect.mesh.visible = true;
  }

  let aimers = 99;

  return {
    // Dibuja el estado interpolado (ver interpolation.js). "now" en milisegundos. showAim = false oculta las líneas
    // de apuntado (p. ej. al terminar la partida).
    update(state, now, showAim = true) {
      const solo = state.tankCount > 2; // 1 contra 3 bots: solo el jugador (P1) enseña la línea de apuntado
      // Presentación de los tanques: en los primeros segundos de la partida las etiquetas salen grandes y llamativas.
      const introAge = now - introAt;
      const mode = introAge < INTRO_SHOW_MS ? 1 : introAge < INTRO_MS ? 2 : 0;
      if (mode !== introMode) { introMode = mode; markers.setIntro(mode, state.tankCount, Math.min(aimers, state.tankCount)); }
      for (let i = 0; i < tanks.length; i++) {
        const data = state.tanks[i];
        const tank = tanks[i];
        if (i >= state.tankCount || (solo && data.lives <= 0)) { // sin tanque en este modo, o bot eliminado: no se dibuja
          tank.group.visible = false;
          tank.beam.visible = false;
          aimLines[i].visible = false;
          markers.hideOne(i);
          continue;
        }
        // Durante la animación de un impacto el servidor ya ha devuelto los tanques a su salida, pero se siguen dibujando
        // donde estaban hasta que acaba la animación (holdTanks).
        const x = holding ? lastPos[i][0] : data.x;
        const y = holding ? lastPos[i][1] : data.y;
        if (!holding) { lastPos[i][0] = x; lastPos[i][1] = y; }
        if (hiddenTank[i]) { // tanque destruido: lo sustituyen los trozos de debris.js
          tank.group.visible = false;
          tank.beam.visible = false;
          aimLines[i].visible = false;
          continue;
        }
        tank.group.visible = data.invuln !== 1 || Math.floor(now / 90) % 2 === 0; // recién reaparecido: parpadea
        tank.group.position.set(x, 0, -y);
        tank.pivot.rotation.y = data.aim; // girar +φ alrededor de Y lleva +X hacia (cos φ, -sin φ) en (x, z): justo nuestro mapeo
        tank.halo.visible = data.dashing === 1;
        // Escudo: burbuja que parpadea en los 2 últimos segundos.
        let shieldLeft = 0;
        const fx = state.effects?.[i];
        if (fx) for (let k = 0; k < fx.length; k++) if (fx[k][0] === SHIELD_INDEX) shieldLeft = fx[k][1];
        tank.shield.visible = shieldLeft > 0 && (shieldLeft > 2 || Math.floor(now / 110) % 2 === 0);
        markers.setPowerup(i, fx && fx.length > 0 ? POWERUP_TYPES[fx[0][0]] : null, fx && fx.length > 0 ? fx[0][1] : 99); // solo hay uno activo a la vez
        const flashing = now < tank.flashUntil;
        tank.material.emissive.setHex(flashing ? 0xffffff : tank.baseColor);
        tank.material.emissiveIntensity = flashing ? 0.9 : TANK_GLOW;
        if (tank.isTni) tank.tni.setFlash(flashing);
        // Reaparición: el tanque "salta" de pequeño a grande a pasos y una columna de luz se encoge sobre él.
        const age = (now - tank.spawnStart) / SPAWN_MS;
        const spawning = age >= 0 && age < 1;
        tank.group.scale.setScalar(spawning ? SPAWN_SCALES[Math.floor(age * SPAWN_SCALES.length)] : 1);
        tank.beam.visible = spawning && age < 0.75;
        if (tank.beam.visible) {
          tank.beam.position.set(x, 3, -y);
          tank.beam.scale.set(1 - age * 1.1, 1, 1 - age * 1.1);
          tank.beam.material.opacity = 0.55 * (1 - age / 0.75);
        }
        markers.update(i, x, y, now, state.tankCount);
        const aiming = showAim && state.frozen === 0 && !holding && i < aimers; // solo los tanques de jugadores enseñan la línea (los bots no)
        aimLines[i].visible = aiming;
        if (aiming) updateAimLine(aimLines[i], data);
      }

      tniShots.begin();
      for (let i = 0; i < state.projectileCount; i++) {
        const p = state.projectiles[i];
        const player = Math.min(3, Math.max(0, p.owner - 1));
        dummy.position.set(p.x, 0.5, -p.y);
        dummy.scale.setScalar(1);
        if (tanks[player].isTni) { // cohete de TNI: el disparo normal no se dibuja (escala 0)
          tniShots.add(p, state.tanks[player]?.aim ?? 0, now);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          for (const mesh of [cores, outlines, halos, pools]) mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        dummy.updateMatrix();
        cores.setMatrixAt(i, dummy.matrix);
        cores.setColorAt(i, coreColors[player]);
        dummy.scale.setScalar(1.3); // contorno oscuro: algo más grande que el núcleo (solo se ven sus caras de atrás)
        dummy.updateMatrix();
        outlines.setMatrixAt(i, dummy.matrix);
        dummy.scale.setScalar(p.aoe ? 1.6 : 1);
        dummy.updateMatrix();
        halos.setMatrixAt(i, dummy.matrix);
        halos.setColorAt(i, haloColors[player]);
        dummy.position.y = 0.1; // charco de luz en el suelo, late a pasos
        dummy.scale.setScalar((p.aoe ? 1.35 : 1) * (1 + 0.08 * Math.sign(Math.sin(now * 0.025 + i))));
        dummy.updateMatrix();
        pools.setMatrixAt(i, dummy.matrix);
        pools.setColorAt(i, haloColors[player]);
      }
      dummy.scale.setScalar(1);
      tniShots.end(now);
      for (const mesh of [cores, outlines, halos, pools]) {
        mesh.count = state.projectileCount;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      for (let i = 0; i < MAX_POWERUPS; i++) {
        const mesh = powerups[i];
        const item = state.powerups[i];
        mesh.visible = Boolean(item);
        if (!item) continue;
        mesh.geometry = powerupGeometries[item[1]];
        // Aparición progresiva: la primera vez que se ve un power-up (por su id) crece de pequeño a su tamaño a pasos suaves.
        if (seenAt[item[0]] === undefined) seenAt[item[0]] = now;
        const age = Math.min(1, (now - seenAt[item[0]]) / POPIN_MS);
        mesh.scale.setScalar(0.15 + 0.85 * age * age * (3 - 2 * age));
        mesh.position.set(item[2], 0.5 + Math.sin(now * 0.004 + i) * 0.08 + (1 - age) * 0.5, -item[3]);
        mesh.rotation.y = now * 0.002 + (1 - age) * 4;
      }

      for (const warn of warns) {
        if (!warn.group.visible) continue;
        // Progresivo: el rayo baja del cielo y se hace visible poco a poco, el aro aparece y se cierra, las chispas entran de
        // una en una y, al acabar el aviso (aparece el power-up), todo se desvanece en FADE_OUT_MS en vez de cortarse.
        if (now >= warn.until + WARN_FADE_OUT_MS) { warn.group.visible = false; continue; }
        const span = warn.until - warn.start;
        const t = Math.min(1, Math.max(0, (now - warn.start) / span));
        const out = now > warn.until ? 1 - (now - warn.until) / WARN_FADE_OUT_MS : 1; // 1 -> 0 en el desvanecimiento final
        // El rayo CAE: una cabeza brillante baja del cielo acelerando (t²) y aterriza justo cuando aparece el power-up; detrás
        // deja una estela fina y tenue que llega hasta lo alto.
        const headY = WARN_TOP + (WARN_LAND - WARN_TOP) * Math.min(1, t * t);
        warn.head.position.y = headY;
        warn.head.material.opacity = Math.min(1, t / 0.12) * out;
        const trail = Math.max(0.01, WARN_TOP + 0.6 - headY);                           // de la cabeza hacia arriba
        warn.beam.scale.y = trail / 6;
        warn.beam.position.y = headY + trail / 2;
        warn.beam.material.opacity = (0.08 + 0.22 * t) * out;
        const ringScale = 1.15 - 0.6 * (Math.floor(t * 8) / 8);                         // el aro se cierra a pasos (pixel art)
        warn.ring.scale.set(ringScale, ringScale, 1);
        warn.ring.material.opacity = Math.min(1, t / 0.25) * 0.9 * out;
        for (let s = 0; s < WARN_SPARKS; s++) { // chispas que suben en espiral, a saltos de 1/8 de celda
          const phase = (t * 1.6 + s / WARN_SPARKS) % 1;
          const angle = phase * 9 + s * 1.9;
          const radius = 0.7 * (1 - phase * 0.6);
          const spark = warn.sparks[s];
          spark.position.set(Math.round(Math.cos(angle) * radius * 8) / 8, Math.round(phase * 5 * 8) / 8 + 0.1, Math.round(Math.sin(angle) * radius * 8) / 8);
          const enter = Math.min(1, Math.max(0, (t - 0.1 - s * 0.1) / 0.15)); // cada chispa entra en su momento
          spark.material.opacity = (1 - phase * 0.7) * enter * out;
        }
      }

      bits.update(now);
      for (const effect of effects) {
        if (!effect.active) continue;
        const t = Math.max(0, (now - effect.start) / effect.duration); // el reloj del evento puede ir unos ms por delante
        if (t >= 1) { effect.active = false; effect.mesh.visible = false; continue; }
        const scale = effect.size * (0.25 + 0.75 * t);
        effect.mesh.scale.set(scale, 1, scale);
        effect.material.opacity = 1 - t;
      }
    },

    // Esconde o vuelve a enseñar un tanque (el destruido en el KO se sustituye por trozos que salen volando).
    setTankHidden(slot, hidden) {
      hiddenTank[slot - 1] = hidden;
      if (hidden) markers.hideOne(slot - 1);
    },
    // Congela la posición dibujada de los tanques (true) o vuelve a seguir al servidor (false).
    holdTanks(on) { holding = on; },
    // Mapa actual (la línea de apuntado rebota en sus muros).
    setArena(next) { arena = next; },
    // Arranca la presentación de las etiquetas (ocultas y luego cayendo sobre cada tanque).
    startIntro(now) { introAt = now; },
    // Arranca la animación de reaparición del tanque "slot" (1 o 2).
    playSpawn(slot, now) { tanks[slot - 1].spawnStart = now; },
    playSpawnAll(now) { for (const tank of tanks) tank.spawnStart = now; },
    // Anillo expansivo en el suelo (lo usan el KO y otros efectos de fuera de este módulo).
    spawnRing(x, y, size, color, duration, now) { spawnEffect(x, y, size, color, duration, now); },
    // Posición en pantalla (píxeles) de un tanque, para animaciones HTML que parten de él. Escribe en "out" y lo devuelve.
    tankScreen(slot, out) {
      if (!overlay.camera) return out;
      screenPoint.set(lastPos[slot - 1][0], 0.6, -lastPos[slot - 1][1]).project(overlay.camera);
      out.x = ((screenPoint.x + 1) / 2) * window.innerWidth;
      out.y = ((1 - screenPoint.y) / 2) * window.innerHeight;
      return out;
    },

    // Sin partida (lobby): se esconde todo lo dinámico.
    hide() {
      hiddenTank.fill(false);
      holding = false;
      for (const tank of tanks) { tank.group.visible = false; tank.beam.visible = false; tank.spawnStart = -1e9; }
      for (const line of aimLines) line.visible = false;
      cores.count = 0;
      outlines.count = 0;
      halos.count = 0;
      pools.count = 0;
      markers.hide();
      bits.reset();
      tniShots.reset();
      introAt = -1e9;
      for (const mesh of powerups) mesh.visible = false;
      for (const effect of effects) { effect.active = false; effect.mesh.visible = false; }
      for (const warn of warns) warn.group.visible = false;
      for (const id in seenAt) delete seenAt[id]; // los ids de power-up se repiten en la partida siguiente
    },

    // Iniciales de los jugadores para las etiquetas sobre los tanques.
    setNames(names) { markers.setNames(names); },
    setMine(flags) { markers.setMine(flags); }, // versión pública: los tanques de los jugadores de esta pantalla
    setHumans(n) { aimers = n; }, // cuántos tanques son de jugadores (los primeros); sin plan (salvapantallas) se enseñan todos
    // Easter egg de TNI (sección 88): flags[i] = el tanque i es de TNI (cambia su aspecto y sus disparos).
    setTni(flags) {
      tanks.forEach((tank, i) => {
        const on = Boolean(flags[i]);
        if (on === tank.isTni) return;
        tank.isTni = on;
        for (const mesh of tank.normal) mesh.visible = !on;
        tank.tni.setVisible(on);
      });
    },
    // Fogonazo del bazuca de TNI (slot 1-4) al disparar.
    tniMuzzle(slot, now) {
      const tank = tanks[slot - 1];
      if (!tank?.isTni) return;
      tniShots.muzzle(lastPos[slot - 1][0], lastPos[slot - 1][1], tank.pivot.rotation.y, now);
    },

    // Eventos puntuales de la partida (match_event): explosiones e impactos.
    onEvent(event, now) {
      if (event.type === 'explosion' && event.tni) { // reventón de un cohete de TNI: explosión enorme, ondas de choque y metralla
        tniShots.blast(event.x, event.y, event.radius, now);
        spawnEffect(event.x, event.y, event.radius * 2.6, 0xffffff, 300, now);
        spawnEffect(event.x, event.y, event.radius * 3.4, 0xff8a00, 700, now);
        for (let k = 0; k < 3; k++) bits.burst(event.x + (k - 1) * 0.6, event.y + (k % 2) * 0.5, now);
      } else if (event.type === 'explosion') spawnEffect(event.x, event.y, event.radius * 2.2, 0x00f0ff, 450, now);
      if (event.type === 'powerup_warn') { // va a salir un power-up aquí: rayo fino, chispas y aro del color de ese power-up
        const warn = warns[nextWarn];
        nextWarn = (nextWarn + 1) % warns.length;
        warn.start = now;
        warn.until = now + Math.max(300, event.seconds * 1000);
        warn.group.position.set(event.x, 0, -event.y);
        const color = WARN_COLORS[event.powerup] ?? 0xffffff;
        for (const mesh of [warn.beam, warn.head, warn.ring, ...warn.sparks]) mesh.material.color.setHex(color);
        warn.group.visible = true;
      }
      if (event.type === 'expire' || event.type === 'impact') bits.burst(event.x, event.y, now); // el disparo se deshace en bloquecitos (sin sonido propio)
      if (event.type === 'shield_break') { // el escudo estalla: aro verde y destello del tanque
        spawnEffect(event.x, event.y, 2.4, SHIELD_COLOR, 420, now);
        tanks[event.slot - 1].flashUntil = now + 160;
      }
      if (event.type === 'hit') {
        spawnEffect(event.x, event.y, 1.8, 0xffffff, 350, now);
        tanks[event.slot - 1].flashUntil = now + 220;
      }
    },
  };
}
