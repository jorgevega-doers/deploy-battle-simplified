// Easter egg de TNI: el tanque del jugador que se llama TNI es un tanque de lujo (negro y dorado, franja roja,
// bandera y un bazuca en vez de cañón), sus disparos son cohetes con llama y estela de humo, y cuando el servidor dice que revientan
// (evento "explosion" con tni: no rebotan, revientan al primer choque) sale una explosión pixel art enorme (bola de fuego que se abre, se
// rompe en humo y se disipa, con explosiones secundarias encadenadas), pintada por código. Las ventajas de juego las decide el servidor (cfg.tni).
// Qué NO hace: decidir quién es TNI (main.js) ni el pánico de la ciudad (life.js) ni los sonidos (sfxSounds.js).
import {
  Group, Mesh, InstancedMesh, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial, Object3D, Color, CanvasTexture,
  NearestFilter, SRGBColorSpace, Sprite, SpriteMaterial, AdditiveBlending,
} from 'three';

export const TNI_NAME = 'TNI';
// ¿Es TNI este nombre de tanque? (en equipos la etiqueta lleva la letra del equipo detrás: "TNI·A")
export const isTniName = (name) => typeof name === 'string' && name.split('·')[0] === TNI_NAME;

// --- Texturas pixel art (16 x 16, pintadas al arrancar) ---
const GOLD = ['#fff1a8', '#f2c14e', '#c98f22', '#8a5a12']; // brillo, base, sombra, borde
const RED = '#ff2a4a';
const BLACK = ['#2a2a36', '#1d1d27', '#14141b'];
function pixelTexture(paint, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  paint(px, size);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter; texture.minFilter = NearestFilter; texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
const TEX = {
  // Casco: negro carbono en damero, bordes dorados con brillo arriba, franja roja de carreras con filetes blancos y remaches dorados.
  hull: () => pixelTexture((px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = (x + y) % 2 ? BLACK[1] : BLACK[2];
      if (y === 0) c = GOLD[0]; else if (y === 1) c = GOLD[1]; else if (y === 14) c = GOLD[2]; else if (y === 15) c = GOLD[3];
      if (y === 6 || y === 9) c = '#ffffff';
      if (y === 7 || y === 8) c = RED;
      if ((y === 3 || y === 12) && x % 4 === 1) c = GOLD[1];
      px(x, y, c);
    }
  }),
  // Torreta por arriba: negro con marco dorado y una estrella dorada en el centro.
  turretTop: () => pixelTexture((px) => {
    const STAR = ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '.#.....#.'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15; const inner = x === 1 || y === 1 || x === 14 || y === 14;
      let c = edge ? GOLD[3] : inner ? GOLD[1] : (x + y) % 2 ? BLACK[0] : BLACK[1];
      const sx = x - 4; const sy = y - 3;
      if (sx >= 0 && sy >= 0 && sy < STAR.length && sx < STAR[sy].length && STAR[sy][sx] === '#') c = sy < 3 ? GOLD[0] : GOLD[1];
      px(x, y, c);
    }
  }),
  // Orugas: tacos oscuros con brillo arriba y ruedas doradas.
  track: () => pixelTexture((px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = x % 4 === 0 ? '#0c0c11' : y < 3 ? '#4a4a58' : '#2c2c36';
      if (y >= 6 && y <= 10 && (x % 8 === 3 || x % 8 === 4)) c = y === 6 ? GOLD[0] : GOLD[2];
      px(x, y, c);
    }
  }),
  // Bazuca: metal pavonado con anillos dorados en los extremos y banda roja de peligro en el centro.
  tube: () => pixelTexture((px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = y < 4 ? '#5b6378' : y < 11 ? '#3a4052' : '#252a37';
      if (x < 2 || x > 13) c = y < 5 ? GOLD[0] : GOLD[2];
      if (x >= 6 && x <= 9) c = (x + y) % 4 < 2 ? RED : '#1d1d27';
      px(x, y, c);
    }
  }),
  gold: () => pixelTexture((px) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, y < 4 ? GOLD[0] : y < 11 ? GOLD[1] : GOLD[2]); }),
};
let textures = null;
const getTextures = () => (textures ??= Object.fromEntries(Object.entries(TEX).map(([k, make]) => [k, make()])));

// --- El tanque de TNI: cajas con su textura en cada cara. body = lo que va en el grupo del tanque; barrel = lo que gira con el apuntado. ---
export function createTniTank() {
  const t = getTextures();
  const mat = (map) => new MeshLambertMaterial({ map, emissive: 0x2a1a00, emissiveIntensity: 0.4 });
  const materials = { hull: mat(t.hull), top: mat(t.turretTop), track: mat(t.track), tube: mat(t.tube), gold: mat(t.gold), black: new MeshLambertMaterial({ color: 0x14141b }), red: new MeshBasicMaterial({ color: RED }) };
  const box = (w, h, d, m, x, y, z) => { const mesh = new Mesh(new BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); return mesh; };
  const body = new Group();
  body.add(
    box(1.02, 0.3, 0.26, materials.track, 0, 0.15, 0.36), box(1.02, 0.3, 0.26, materials.track, 0, 0.15, -0.36), // orugas
    box(0.86, 0.28, 0.6, [materials.hull, materials.hull, materials.hull, materials.black, materials.hull, materials.hull], 0, 0.38, 0), // casco
    box(0.12, 0.18, 0.6, materials.gold, 0.47, 0.32, 0), // frontal dorado
    box(0.52, 0.24, 0.48, [materials.hull, materials.hull, materials.top, materials.black, materials.hull, materials.hull], -0.02, 0.64, 0), // torreta
    box(0.18, 0.06, 0.18, materials.gold, -0.12, 0.79, 0), // escotilla
    box(0.03, 0.55, 0.03, materials.black, -0.24, 0.98, 0.17), // antena
    box(0.02, 0.1, 0.16, materials.red, -0.24, 1.2, 0.26), // banderín
  );
  const barrel = new Group(); // el bazuca: tubo grueso, boca dorada ancha, tobera trasera y mira roja
  barrel.add(
    box(0.95, 0.2, 0.2, materials.tube, 0.42, 0.02, 0),
    box(0.1, 0.3, 0.3, materials.gold, 0.92, 0.02, 0),
    box(0.14, 0.26, 0.26, materials.black, -0.12, 0.02, 0),
    box(0.12, 0.08, 0.06, materials.red, 0.3, 0.16, 0),
  );
  body.visible = false; barrel.visible = false;
  const lit = [materials.hull, materials.top, materials.track, materials.tube, materials.gold];
  return {
    body, barrel,
    setVisible(on) { body.visible = on; barrel.visible = on; },
    // Destello blanco al recibir un impacto (como el resto de tanques).
    setFlash(on) { for (const m of lit) { m.emissive.setHex(on ? 0xffffff : 0x2a1a00); m.emissiveIntensity = on ? 0.9 : 0.4; } },
  };
}

// --- Explosión pixel art: tira de FRAMES fotogramas de 32 x 32 pintada al arrancar (semilla fija: siempre la misma) ---
const FRAMES = 10;
const EX = 32;
function explosionSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = EX * FRAMES; canvas.height = EX;
  const ctx = canvas.getContext('2d');
  const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y) => hash(Math.floor(x / 3), Math.floor(y / 3), 7); // grano grueso: bordes irregulares de pixel art
  const PUFFS = [[-6, -5, 5], [6, -4, 5.5], [-3, 5, 5], [5, 5, 4.5], [0, -8, 4.5], [-8, 2, 4], [8, 1, 4]];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    const fireR = 4 + 11 * Math.min(1, t * 2.4);
    const grid = Array.from({ length: EX * EX }, () => null);
    for (let y = 0; y < EX; y++) for (let x = 0; x < EX; x++) {
      const dx = x + 0.5 - EX / 2; const dy = y + 0.5 - EX / 2;
      const d = Math.hypot(dx, dy) + (noise(x, y) - 0.5) * 4;
      let c = null;
      // Humo (desde un tercio de la animación): bocanadas que crecen y suben, más claras arriba; al final se deshacen en trama.
      if (t > 0.3) {
        const grow = 0.6 + t; const rise = t * 5;
        for (const [px, py, r] of PUFFS) {
          const pd = Math.hypot(dx - px * grow * 0.7, dy - py * grow * 0.7 + rise) + (noise(x + 9, y) - 0.5) * 2.5;
          if (pd < r * grow) { c = pd < r * grow * 0.5 && dy < 0 ? '#8a8199' : dy < 2 ? '#5a5266' : '#3b3646'; break; }
        }
        if (c && t > 0.65 && hash(x, y, f) < (t - 0.65) / 0.35) c = null;
      }
      // Fuego (primeros dos tercios): núcleo blanco, amarillo, naranja y borde rojo; se apaga de dentro afuera.
      if (t < 0.75) {
        const a = d / fireR;
        if (a < 0.28 * (1 - t)) c = '#ffffff';
        else if (a < 0.55 * (1 - t * 0.7)) c = '#ffe14a';
        else if (a < 0.8) c = t < 0.6 ? '#ff8a00' : (x + y) % 2 ? '#ff8a00' : c;
        else if (a < 1) c = t < 0.45 || (x + y) % 2 ? '#d6262a' : c;
      }
      // Chispas que salen disparadas al principio.
      if (t < 0.5 && !c && hash(x, y, 3) > 0.985 && d < fireR * 1.5) c = '#fff1a8';
      grid[y * EX + x] = c;
    }
    // Contorno oscuro de 1 píxel alrededor (pixel art nítido sobre cualquier fondo) mientras hay fuego.
    for (let y = 0; y < EX; y++) for (let x = 0; x < EX; x++) {
      const c = grid[y * EX + x];
      const solid = (xx, yy) => xx >= 0 && yy >= 0 && xx < EX && yy < EX && grid[yy * EX + xx] && grid[yy * EX + xx] !== '#3a1018';
      if (!c && t < 0.7 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) grid[y * EX + x] = '#3a1018';
    }
    for (let y = 0; y < EX; y++) for (let x = 0; x < EX; x++) { const c = grid[y * EX + x]; if (c) { ctx.fillStyle = c; ctx.fillRect(f * EX + x, y, 1, 1); } }
  }
  return canvas;
}

const MAX_TRACK = 32;      // cohetes que se siguen a la vez
const MAX_BOOMS = 24;      // explosiones a la vez (cada reventón son 7: la principal y 6 secundarias)
const BOOM_MS = 900;       // duración de la explosión principal
// Reventón de un cohete: explosión principal enorme y 6 secundarias que estallan alrededor, encadenadas: [ángulo, distancia (en radios),
// tamaño (en radios), retraso ms].
const SECONDARY = [[0.4, 0.55, 1.1, 90], [2.3, 0.6, 1.0, 160], [4.1, 0.5, 1.2, 230], [5.5, 0.7, 0.9, 300], [1.4, 0.85, 0.8, 380], [3.2, 0.9, 0.85, 450]];
const TRAIL = 64;          // bocanadas de humo de la estela
const TRAIL_MS = 520;

// Cohetes, su estela, las explosiones y el fogonazo del bazuca. Dónde revienta un cohete lo dice el servidor (evento "explosion" con tni).
export function createTniShots(scene) {
  const dummy = new Object3D();
  const color = new Color();
  const part = (w, h, d, material) => { const mesh = new InstancedMesh(new BoxGeometry(w, h, d), material, MAX_TRACK); mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh); return mesh; };
  const bodyMesh = part(0.4, 0.13, 0.13, new MeshBasicMaterial({ color: 0x3a4052 }));
  const stripeMesh = part(0.08, 0.15, 0.15, new MeshBasicMaterial({ color: 0xf2c14e }));
  const noseMesh = part(0.11, 0.1, 0.1, new MeshBasicMaterial({ color: 0xff2a4a }));
  const flameMesh = part(0.24, 0.1, 0.1, new MeshBasicMaterial({ color: 0xffa21a, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
  const parts = [[bodyMesh, 0], [stripeMesh, -0.1], [noseMesh, 0.24], [flameMesh, -0.32]]; // [malla, desplazamiento a lo largo del cohete]

  // Estela: cubos grises que crecen y se desvanecen (pool fijo).
  const trail = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), TRAIL);
  trail.frustumCulled = false; trail.count = 0; trail.setColorAt(0, color.setHex(0xffffff)); scene.add(trail);
  const trailBorn = new Float64Array(TRAIL).fill(-1e9); const trailX = new Float32Array(TRAIL); const trailY = new Float32Array(TRAIL);
  let trailNext = 0; let lastPuff = 0;

  // Explosiones: sprites (siempre de cara a la cámara) que recorren la tira de fotogramas.
  const sheet = explosionSheet();
  const booms = Array.from({ length: MAX_BOOMS }, () => {
    const map = new CanvasTexture(sheet);
    map.magFilter = NearestFilter; map.minFilter = NearestFilter; map.generateMipmaps = false; map.colorSpace = SRGBColorSpace;
    map.repeat.set(1 / FRAMES, 1);
    const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, map, start: 0, size: 1, ms: BOOM_MS, pending: false };
  });
  let nextBoom = 0;

  // Seguimiento de cada cohete por su id: última posición y rumbo (para orientarlo y para saber dónde revienta al desaparecer).
  const ids = new Int32Array(MAX_TRACK).fill(-1);
  const lx = new Float32Array(MAX_TRACK); const ly = new Float32Array(MAX_TRACK); const hd = new Float32Array(MAX_TRACK);
  const seen = new Int32Array(MAX_TRACK);
  let frame = 0; let drawn = 0;

  // delay: la explosión aparece pasados esos ms (las secundarias, encadenadas).
  function boom(x, y, size, ms, now, delay = 0) {
    const b = booms[nextBoom];
    nextBoom = (nextBoom + 1) % MAX_BOOMS;
    b.start = now + delay; b.size = size; b.ms = ms; b.pending = true;
    b.sprite.position.set(x, 0.55 + size * 0.25, -y);
    b.sprite.scale.set(size, size, 1);
    b.map.offset.x = 0;
    b.sprite.visible = false;
  }

  return {
    // Al empezar el fotograma.
    begin() { frame++; drawn = 0; },
    // Un cohete de TNI de este fotograma (p = { id, x, y }); aim = apuntado de su tanque (rumbo del primer fotograma).
    add(p, aim, now) {
      let k = -1;
      for (let i = 0; i < MAX_TRACK; i++) if (ids[i] === p.id) { k = i; break; }
      if (k < 0) {
        for (let i = 0; i < MAX_TRACK; i++) if (ids[i] === -1) { k = i; break; }
        if (k < 0) return;
        ids[k] = p.id; lx[k] = p.x; ly[k] = p.y; hd[k] = aim;
      }
      const dx = p.x - lx[k]; const dy = p.y - ly[k];
      if (dx * dx + dy * dy > 1e-6) hd[k] = Math.atan2(dy, dx);
      lx[k] = p.x; ly[k] = p.y; seen[k] = frame;
      const flick = 1 + 0.35 * Math.sign(Math.sin(now * 0.06 + k)); // la llama late a pasos
      for (const [mesh, along] of parts) {
        dummy.position.set(p.x + Math.cos(hd[k]) * along, 0.5, -(p.y + Math.sin(hd[k]) * along));
        dummy.rotation.set(0, hd[k], 0);
        dummy.scale.set(mesh === flameMesh ? flick : 1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
      }
      if (now - lastPuff > 45) { // humo de la estela, detrás del cohete
        lastPuff = now;
        trailBorn[trailNext] = now; trailX[trailNext] = p.x - Math.cos(hd[k]) * 0.4; trailY[trailNext] = p.y - Math.sin(hd[k]) * 0.4;
        trailNext = (trailNext + 1) % TRAIL;
      }
      drawn++;
    },
    // Al acabar el fotograma: se olvidan los cohetes que ya no están (su explosión llega por el evento del servidor).
    end(now) {
      for (const [mesh] of parts) { mesh.count = drawn; mesh.instanceMatrix.needsUpdate = true; }
      for (let i = 0; i < MAX_TRACK; i++) if (ids[i] !== -1 && seen[i] !== frame) ids[i] = -1;
      // Estela.
      let live = 0;
      for (let i = 0; i < TRAIL; i++) {
        const age = now - trailBorn[i];
        if (age < 0 || age >= TRAIL_MS) dummy.scale.setScalar(0);
        else {
          const k = age / TRAIL_MS;
          dummy.position.set(trailX[i], 0.5 + k * 0.35, -trailY[i]);
          dummy.rotation.set(0, i, 0);
          dummy.scale.setScalar(Math.round((0.12 + k * 0.22) * 16) / 16);
          trail.setColorAt(i, color.setHex(k < 0.2 ? 0xffd27a : k < 0.5 ? 0x8a8199 : 0x5a5266));
          live++;
        }
        dummy.updateMatrix();
        trail.setMatrixAt(i, dummy.matrix);
      }
      trail.count = live ? TRAIL : 0;
      trail.instanceMatrix.needsUpdate = true;
      if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
      // Explosiones: fotograma según la edad.
      for (const b of booms) {
        if (!b.pending) continue;
        const k = (now - b.start) / b.ms;
        if (k < 0) continue; // secundaria que aún no ha estallado
        if (k >= 1) { b.sprite.visible = false; b.pending = false; continue; }
        b.sprite.visible = true;
        b.map.offset.x = Math.min(FRAMES - 1, Math.floor(k * FRAMES)) / FRAMES;
      }
    },
    // Reventón de un cohete en (x, y) con radio de daño "radius": explosión principal enorme y secundarias encadenadas alrededor.
    blast(x, y, radius, now) {
      boom(x, y, radius * 2.9, BOOM_MS, now);
      for (const [a, dist, size, delay] of SECONDARY) boom(x + Math.cos(a) * radius * dist, y + Math.sin(a) * radius * dist, radius * size, 650, now, delay);
    },
    // Fogonazo del bazuca al disparar (pequeño y rápido), delante de la boca.
    muzzle(x, y, aim, now) { boom(x + Math.cos(aim) * 1.0, y + Math.sin(aim) * 1.0, 1.3, 320, now); },
    // Sin partida: todo fuera, sin explosiones de los cohetes que quedaban.
    reset() {
      ids.fill(-1);
      for (const [mesh] of parts) mesh.count = 0;
      trailBorn.fill(-1e9); trail.count = 0;
      for (const b of booms) { b.sprite.visible = false; b.pending = false; }
    },
  };
}
