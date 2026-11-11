// "¿CÓMO TE LLAMAS?" al entrar en una sala en tu pantalla (versión pública, 10-nov): solo, partida pública y sala privada. Ahí cada uno tiene su
// teclado, así que se pregunta siempre, con el nombre de la última vez ya escrito (ENTER y listo). Mientras tanto el jugador ya ocupa su hueco
// (en la cola común no lo pierde) con ese nombre; al confirmar, se cambia si hace falta.
// Con mando (10-nov), como en las recreativas: arriba/abajo cambian la letra (mantenido, más rápido), A pasa a la siguiente y, tras la tercera, al
// botón (A en el botón entra), B vuelve a la anterior. pad(action) lo llama main.js con menuPad.js.
// Qué NO hace: no habla con el servidor (onSubmit lo hace: keyboardPlayer.setName).

// startHidden: no se abre aún (la intro está sonando); show() la abre.
// button: texto del botón; onCancel: ESC o B en la primera letra la cierran (versión arcade: vuelves al título). Sin onCancel no se puede cerrar.
export function createNameGate({ initial, onSubmit, startHidden = false, button: buttonText = '¡A LA SALA!', onCancel = null }) {
  const box = document.createElement('div');
  box.id = 'name-gate';
  box.innerHTML = `<form class="gate-card ui-panel" autocomplete="off">
    <div class="ui-title">¿CÓMO TE LLAMAS?</div>
    <p>Escribe 3 letras para que los demás te reconozcan en la partida.</p>
    <input class="gate-input" maxlength="3" spellcheck="false" autocapitalize="characters" aria-label="Tu nombre (3 letras)">
    <p class="gate-msg" role="alert"></p>
    <button class="ui-tab" type="submit">${buttonText}</button>
    <p class="gate-pad">CON MANDO: ↑↓ CAMBIA LA LETRA · A SIGUIENTE · B ANTERIOR</p>
  </form>`;
  document.body.appendChild(box);
  const form = box.querySelector('form');
  const input = box.querySelector('.gate-input');
  const msg = box.querySelector('.gate-msg');
  const button = box.querySelector('button');
  const valid = () => /^[A-Z]{3}$/.test(input.value);
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let pos = null; // con mando: la letra elegida (0-2) o 3 = el botón; null = se está usando el teclado
  function mark() { // resalta la letra elegida (o el botón)
    button.classList.toggle('focus', pos === 3);
    input.focus();
    if (pos === 3) input.setSelectionRange(3, 3); else input.setSelectionRange(pos, pos + 1);
  }
  const refresh = () => { button.disabled = !valid(); };
  input.value = initial ?? '';
  input.addEventListener('input', () => {
    pos = null; button.classList.remove('focus'); // se está escribiendo con el teclado
    input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    msg.textContent = '';
    refresh();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!valid()) return;
    input.blur(); // si no, el foco se queda en el campo oculto y el mando no toma el control (keyboardPlayer: typingNow)
    pos = null; button.classList.remove('focus');
    box.hidden = true;
    onSubmit(input.value);
  });
  refresh();
  const cancel = () => { input.blur(); pos = null; button.classList.remove('focus'); box.hidden = true; msg.textContent = ''; onCancel(); };
  if (onCancel) {
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } });
    box.addEventListener('pointerdown', (event) => { if (event.target === box) cancel(); }); // clic fuera de la tarjeta
  }
  const focus = () => requestAnimationFrame(() => { input.focus(); input.select(); });
  box.hidden = startHidden;
  if (!startHidden) focus();
  return {
    get open() { return !box.hidden; },
    // Mando: 'up' | 'down' (letra), 'a' (siguiente / entrar), 'b' (anterior).
    pad(action) {
      if (box.hidden) return;
      if (pos === null) { pos = 0; input.value = (input.value + 'AAA').slice(0, 3); refresh(); } // empieza por la primera letra
      if ((action === 'up' || action === 'down') && pos < 3) {
        const letters = [...input.value];
        const k = LETTERS.indexOf(letters[pos]);
        letters[pos] = LETTERS[(k + (action === 'up' ? 1 : 25)) % 26];
        input.value = letters.join('');
        msg.textContent = '';
        refresh();
      } else if (action === 'a') {
        if (pos === 3) { if (valid()) form.requestSubmit(); return; }
        pos += 1;
      } else if (action === 'b' && pos > 0) pos -= 1;
      else if (action === 'b' && onCancel) { cancel(); return; }
      mark();
    },
    show() { box.hidden = false; focus(); },
    // El servidor no aceptó el nombre (p. ej. una palabra de la lista de bloqueo): se vuelve a preguntar.
    error(text) { box.hidden = false; msg.textContent = text; input.focus(); input.select(); },
  };
}
