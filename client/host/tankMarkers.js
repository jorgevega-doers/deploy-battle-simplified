// Ayudas de visibilidad de los tanques (accesibilidad): con una ciudad tan cargada, cada jugador tiene que encontrar su
// tanque de un vistazo. Debajo de cada tanque, un anillo octogonal de su color con contorno oscuro (se lee sobre
// cualquier suelo) que late despacio. Encima, una etiqueta con sus iniciales hecha en HTML (nítida a resolución
// completa aunque la escena se dibuje con píxel grande) que siempre queda por delante, aunque un edificio tape el tanque.
import { Mesh, MeshBasicMaterial, RingGeometry, Group, Vector3 } from 'three';
import { RING_COLORS } from './playerColors.js'; // claros y saturados: se distinguen bien entre sí y sobre la ciudad
import { POWERUP_ICONS } from './powerupIcons.js';
import { GRID_WIDTH, GRID_HEIGHT } from '../../shared/constants.js';
const VS_HALF_UNITS = 6.5;                    // mitad de la anchura del "VS" en unidades de arcadeText (ajustada midiéndolo)
const CENTER_Y = 0.44;                       // misma altura que el "VS" (juice.intro)
let introMode = 0;
const LABEL_HEIGHT = 1.3;                   // altura sobre el suelo del punto donde se apoya la etiqueta

export function createTankMarkers(scene, { camera, layer }) {
  // Octógono (8 lados) para que encaje con el pixel art; un anillo de color y otro oscuro alrededor.
  // 27-oct (accesibilidad): anillo más grueso y grande para que el tanque se encuentre de un vistazo entre tantos estímulos.
  const ringGeometry = new RingGeometry(0.58, 0.8, 8, 1, Math.PI / 8);
  const outlineGeometry = new RingGeometry(0.8, 0.92, 8, 1, Math.PI / 8);
  const outlineMaterial = new MeshBasicMaterial({ color: 0x05050c });
  const projected = new Vector3();

  const markers = RING_COLORS.map((color, i) => {
    const group = new Group();
    const ring = new Mesh(ringGeometry, new MeshBasicMaterial({ color }));
    const outline = new Mesh(outlineGeometry, outlineMaterial);
    ring.rotation.x = -Math.PI / 2;
    outline.rotation.x = -Math.PI / 2;
    group.add(ring, outline);
    group.position.y = 0.025;
    group.visible = false;
    scene.add(group);
    const label = document.createElement('div');
    label.className = `tank-label p${i + 1}`;
    label.textContent = i < 2 ? `P${i + 1}` : `B${i + 1}`;
    label.hidden = true;
    layer?.appendChild(label);
    // Icono del power-up activo: flota aparte, por encima de la etiqueta, y solo existe mientras dura el efecto.
    const fxEl = document.createElement('div');
    fxEl.className = 'tank-fx';
    fxEl.hidden = true;
    layer?.appendChild(fxEl);
    return { group, label, fxEl, fx: null, ending: 0 };
  });

  function place(el, x, y, extraY) { // coloca un elemento HTML sobre el punto del mundo (x, LABEL_HEIGHT, -y)
    projected.set(x, LABEL_HEIGHT, -y).project(camera);
    const sx = Math.round(((projected.x + 1) / 2) * window.innerWidth);
    const sy = Math.round(((1 - projected.y) / 2) * window.innerHeight);
    el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, calc(-100% - ${extraY}px)) scale(1)`;
  }

  return {
    // Iniciales de cada jugador (o "P1"/"P2" si aún no hay).
    setNames(names) {
      markers.forEach((m, i) => { m.label.textContent = names[i] ?? (i < 2 ? `P${i + 1}` : `B${i + 1}`); });
    },
    // Versión pública, sala a distancia: los tanques de los jugadores de ESTA pantalla llevan la etiqueta marcada ("TÚ"), para encontrarse enseguida.
    setMine(flags) {
      markers.forEach((m, i) => { m.label.classList.toggle('mine', Boolean(flags[i])); });
    },
    // Presentación de los tanques al empezar la partida: las etiquetas salen grandes y llamativas (clase "intro") unos segundos.
    // mode: 0 = normal, 1 = ocultas (los nombres grandes salen en el centro), 2 = caen sobre cada tanque.
    // Mode 1: las etiquetas están grandes en el centro (son los nombres del "BOA VS BOB"); mode 2: viajan hasta su tanque.
    // Las tarjetas de los JUGADORES (los primeros "humans" tanques) van rellenas de su color, con un borde blanco y una animación de zoom (clase "intro");
    // las de los bots ya salen como serán sobre su tanque. Vale para 1, 2, 3 o 4 jugadores (en 1 contra 1 son las dos).
    setIntro(mode, count = 2, humans = count) {
      introMode = mode;
      markers.forEach((m, i) => { m.label.classList.toggle('intro', mode > 0 && i < humans); m.label.classList.toggle('intro-fly', mode === 2);
        m.label.classList.toggle('intro-center', mode === 1); // en el centro no lleva la flechita; la gana al viajar al tanque
      });
    },
    // Power-up activo del tanque i ('double', 'speed', 'aoe', 'shield' o null) y segundos que le quedan. Solo toca el DOM si cambia.
    setPowerup(i, kind, seconds = 99) {
      const m = markers[i];
      const ending = seconds <= 1 ? 2 : seconds <= 2 ? 1 : 0; // parpadea los 2 últimos segundos, más rápido en el último
      if (m.fx === kind && m.ending === ending) return;
      m.fx = kind;
      m.ending = ending;
      m.fxEl.className = kind ? `tank-fx fx-${kind}${ending ? ` ending${ending === 2 ? ' last' : ''}` : ''}` : 'tank-fx';
      m.fxEl.innerHTML = kind ? POWERUP_ICONS[kind] : '';
      m.fxEl.hidden = !kind;
    },
    update(i, x, y, now, count = 2) {
      const m = markers[i];
      m.group.visible = true;
      m.group.position.x = x;
      m.group.position.z = -y;
      const pulse = 1 + Math.sin(now * 0.005 + i * 2) * 0.05;
      m.group.scale.set(pulse, 1, pulse);
      // La etiqueta se coloca en pantalla proyectando el punto que hay encima del tanque.
      m.label.hidden = false;
      if (introMode === 1) { // grande, en el centro de la pantalla (izquierda el jugador, derecha el rival o los bots)
        // El tamaño se adapta a la pantalla (por ancho y por alto) para que los nombres no se monten con el "VS" en pantallas pequeñas.
        const W = window.innerWidth;
        const H = window.innerHeight;
        const solo = count > 2;
        // 1 contra 3 bots: las 4 tarjetas en cuadrado alrededor del "VS", como sus esquinas del mapa (el jugador abajo a la izquierda,
        // todas del mismo tamaño); los bots arriba a la derecha, arriba a la izquierda y abajo a la derecha.
        const sBot = Math.max(0.8, Math.min(2.2, W / 580, H / 300));
        const s = solo ? sBot : Math.max(0.8, Math.min(3, W / 430, H / 240));
        const half = (m.label.offsetWidth * s) / 2;
        const unit = Math.min(W * 0.01, window.innerHeight * 0.018); // unidad de las letras arcade (arcadeText.js)
        const vsHalf = unit * VS_HALF_UNITS;
        let cx;
        let cy = H * CENTER_Y;
        if (solo) {
          const dx = W * 0.2;
          const dy = H * 0.19;
          cx = W / 2 + (x < GRID_WIDTH / 2 ? -dx : dx); // la esquina real de su tanque (las salidas cambian según el mapa)
          cy += y < GRID_HEIGHT / 2 ? dy : -dy;
        } else cx = W / 2 + (i === 0 ? -1 : 1) * (vsHalf + 8 + half);
        m.label.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) translate(-50%, calc(-50% - 0px)) scale(calc(${s} * var(--pulse, 1)))`; // --pulse la anima card-zoom (index.html): zoom centrado en la propia tarjeta
      } else place(m.label, x, y, 0);
      if (m.fx) place(m.fxEl, x, y, m.label.offsetHeight + 8); // el icono, encima de la etiqueta
    },
    // Esconde la etiqueta, el icono y el anillo de un solo tanque (el destruido en el KO).
    hideOne(i) {
      markers[i].group.visible = false;
      markers[i].label.hidden = true;
      markers[i].fxEl.hidden = true;
      markers[i].fx = null;
    },
    hide() {
      for (const m of markers) { m.group.visible = false; m.label.hidden = true; m.fxEl.hidden = true; m.fx = null; }
    },
  };
}
