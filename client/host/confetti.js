// Confeti de píxeles para celebrar que una puntuación entra en el Top 10: cuadraditos de colores de la paleta que caen
// balanceándose desde arriba. Son elementos HTML que se crean al lanzar el confeti y se borran solos al terminar
// (pasa una vez por partida, no en el bucle de dibujo). Qué NO hace: no decide cuándo celebrar (juice.js).
const COLORS = ['#ff0080', '#ff4fa3', '#6f8cff', '#0003ad', '#ffd400', '#00f0ff', '#ffffff'];
const rand = (min, max) => min + Math.random() * (max - min);

export function createConfetti(layer) {
  const pieces = new Set();
  return {
    // "amount" piezas que caen durante unos 3 s. Cada pieza es un cuadrado con giro a saltos.
    burst(amount = 70) {
      for (let i = 0; i < amount; i++) {
        const piece = document.createElement('div');
        const size = Math.round(rand(8, 15));
        piece.style.cssText = `position:absolute;left:${rand(2, 98)}%;top:0;width:${size}px;height:${size}px;background:${COLORS[i % COLORS.length]}`;
        layer.appendChild(piece);
        pieces.add(piece);
        const drift = rand(-120, 120);
        const spin = rand(-540, 540);
        const animation = piece.animate([
          { transform: `translate(0, -6vh) rotate(0deg)` },
          { transform: `translate(${drift * 0.5}px, 55vh) rotate(${spin * 0.5}deg)`, offset: 0.5 },
          { transform: `translate(${drift}px, 112vh) rotate(${spin}deg)` },
        ], { duration: rand(2400, 3800), delay: rand(0, 900), easing: 'steps(24)', fill: 'backwards' });
        animation.onfinish = () => { piece.remove(); pieces.delete(piece); };
      }
    },
    clear() { for (const piece of pieces) piece.remove(); pieces.clear(); },
  };
}
