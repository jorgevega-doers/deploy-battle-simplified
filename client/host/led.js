// Panel LED del stand (sección 75): enseña el podio del Top 3 en un panel "iPixel Color" (LED_BLE_..., 32 x 32) por Web Bluetooth desde esta página.
// OPCIONAL: sin panel, sin Bluetooth o si falla, el juego sigue igual (nada aquí lanza errores hacia fuera). La primera vez hay que emparejarlo con un
// clic (menú > PANEL LED > CONECTAR: el navegador lo exige); después se reconecta solo al abrir la pantalla y si se corta.
// Qué NO hace: no toca la partida ni el ranking (solo lee el Top 10 que ya recibe el host).
import { LED_NAME_PREFIX, LED_SERVICE, LED_WRITE, LED_NOTIFY, deviceInfoCommand, brightnessCommand, parseDeviceInfo, ackKind, imageMessages, chunks } from './ledProtocol.js';
import { podiumGif, testPatternGif } from './ledPodium.js';

const BRIGHT_KEY = 'doersforce.led.brightness';
const SKIP_KEY = 'doersforce.led.skipauto'; // el visitante cerró la lista de Bluetooth sin elegir: no se vuelve a abrir sola
const ACK_MS = 8000;      // espera máxima de la confirmación de un bloque de imagen
const SHORT_MS = 1500;    // órdenes cortas: si no contesta, se sigue
const RETRY_MS = 6000;    // reintento de conexión si se corta

export function createLed({ onChange = () => {} } = {}) {
  const bt = typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
  const state = {
    supported: Boolean(bt),
    status: bt ? 'off' : 'unsupported', // off (sin emparejar) | connecting | ready | lost (se cortó, reintentando) | error | unsupported | noadapter (el equipo no tiene Bluetooth)
    detail: '',
    name: '',
    width: 32,
    height: 32,
    brightness: 60,
  };
  try { const b = Number(window.localStorage.getItem(BRIGHT_KEY)); if (b >= 0 && b <= 100 && window.localStorage.getItem(BRIGHT_KEY) !== null) state.brightness = b; } catch { /* da igual */ }

  let device = null;
  let writer = null;
  let top = [];
  let shownKey = '';
  let queue = Promise.resolve();
  let waiter = null;       // { want: 'info' | 'ack', resolve }
  let retryTimer = null;
  let settled = Promise.resolve();

  const set = (patch) => { Object.assign(state, patch); try { onChange({ ...state }); } catch { /* el menú no debe romper nada */ } };
  const run = (job) => { queue = queue.then(job).catch((err) => console.warn('Panel LED:', err?.message ?? err)); return queue; };

  // Respuesta del panel (fa03): la consulta de información o la confirmación de un bloque.
  function onNotify(event) {
    const data = new Uint8Array(event.target.value.buffer.slice(0));
    if (!waiter) return;
    if (waiter.want === 'info') { const w = waiter; waiter = null; w.resolve(data); return; }
    const kind = ackKind(data);
    if (kind && (waiter.want === 'ack' || kind === 'done')) { const w = waiter; waiter = null; w.resolve(kind); }
  }
  const waitFor = (want, ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { if (waiter?.resolve === done) waiter = null; resolve(null); }, ms);
    const done = (value) => { clearTimeout(timer); resolve(value); };
    waiter = { want, resolve: done };
  });

  // Escribe un mensaje en trozos de 244 bytes y espera la respuesta indicada (null = no llegó a tiempo).
  async function send(message, want, ms) {
    if (!writer) throw new Error('sin conexión');
    const answer = want ? waitFor(want, ms) : null;
    for (const piece of chunks(message)) await writer.writeValueWithResponse(piece);
    return answer;
  }

  async function sendImage(file) {
    const messages = imageMessages(file, { gif: true });
    for (let i = 0; i < messages.length; i++) {
      const ack = await send(messages[i], 'ack', ACK_MS);
      if (ack === null) throw new Error('el panel no confirmó la imagen');
    }
  }

  const keyOf = (list) => JSON.stringify(list.slice(0, 3).map((e) => [e.initials, e.score]));
  function pushTop(force = false) {
    if (state.status !== 'ready') return;
    const key = keyOf(top);
    if (!force && key === shownKey) return;
    shownKey = key;
    run(() => sendImage(podiumGif(top, state.width, state.height)));
  }

  async function connect() {
    if (!device) return;
    clearTimeout(retryTimer);
    set({ status: 'connecting', detail: '', name: device.name ?? '' });
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(LED_SERVICE);
      writer = await service.getCharacteristic(LED_WRITE);
      const notify = await service.getCharacteristic(LED_NOTIFY);
      notify.removeEventListener('characteristicvaluechanged', onNotify);
      notify.addEventListener('characteristicvaluechanged', onNotify);
      await notify.startNotifications();
      const info = parseDeviceInfo(await send(deviceInfoCommand(), 'info', 3000));
      set({ status: 'ready', detail: '', ...(info ? { width: info.width, height: info.height } : {}) });
      await run(() => send(brightnessCommand(state.brightness), 'ack', SHORT_MS));
      shownKey = '';
      pushTop(true);
    } catch (err) {
      writer = null;
      set({ status: 'lost', detail: err?.message ?? String(err) });
      retryTimer = setTimeout(connect, RETRY_MS);
      listenForPanel();
    }
  }

  // Un panel recordado pero apagado o lejos: Chrome avisa cuando se oye su anuncio y se conecta en ese momento (si el navegador lo permite).
  let listening = false;
  function listenForPanel() {
    if (listening || !device?.watchAdvertisements) return;
    listening = true;
    const onAdvert = () => { listening = false; device.removeEventListener('advertisementreceived', onAdvert); if (state.status !== 'ready' && state.status !== 'off') { clearTimeout(retryTimer); connect(); } };
    device.addEventListener('advertisementreceived', onAdvert);
    device.watchAdvertisements().catch(() => { listening = false; device.removeEventListener('advertisementreceived', onAdvert); });
  }

  function adopt(found) {
    if (device === found) return connect();
    device = found;
    device.addEventListener('gattserverdisconnected', () => {
      writer = null;
      if (state.status === 'off') return;
      set({ status: 'lost', detail: 'SE HA DESCONECTADO' });
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, RETRY_MS);
    });
    return connect();
  }

  return {
    get state() { return { ...state }; },
    // Emparejar (necesita un clic: el navegador enseña su lista de dispositivos Bluetooth y se elige LED_BLE_...).
    async pair() {
      if (!bt) return;
      try { window.localStorage.removeItem(SKIP_KEY); } catch { /* da igual */ }
      try {
        const found = await bt.requestDevice({ filters: [{ namePrefix: LED_NAME_PREFIX }], optionalServices: [LED_SERVICE] });
        await adopt(found);
      } catch (err) {
        if (err?.name !== 'NotFoundError') set({ status: 'error', detail: err?.message ?? String(err) }); // NotFoundError = se cerró la lista sin elegir
        else this.markSkipped();
      }
    },
    // Al abrir la pantalla: ¿hay Bluetooth en el equipo? y, si el navegador recuerda un panel ya emparejado, se conecta sin clic.
    autoConnect() {
      settled = (async () => {
        if (!bt) return;
        try {
          if (bt.getAvailability && !(await bt.getAvailability())) { set({ status: 'noadapter', detail: '' }); return; }
        } catch { /* sin respuesta: se sigue como si hubiera */ }
        if (!bt.getDevices) { set({ detail: 'ESTE NAVEGADOR NO RECUERDA DISPOSITIVOS: HAY QUE ELEGIR EL PANEL EN CADA ARRANQUE' }); return; }
        try {
          const known = (await bt.getDevices()).find((d) => (d.name ?? '').startsWith(LED_NAME_PREFIX));
          if (known) await adopt(known);
        } catch { /* sin permisos guardados: se pide con el primer gesto o desde el menú */ }
      })();
      return settled;
    },
    // Primer toque o tecla en la pantalla (el navegador solo deja abrir la lista de Bluetooth con un gesto): si no hay panel recordado ni conectándose,
    // se abre la lista UNA vez para elegir LED_BLE_... Si se cierra sin elegir, no se vuelve a abrir sola (queda el botón del menú).
    async pairOnGesture() {
      if (!bt) return;
      await settled;
      if (state.status !== 'off') return;
      try { if (window.localStorage.getItem(SKIP_KEY) === '1') return; } catch { /* da igual */ }
      await this.pair();
    },
    markSkipped() { try { window.localStorage.setItem(SKIP_KEY, '1'); } catch { /* da igual */ } },
    // Top 10 nuevo (el host lo recibe al conectarse y tras cada partida): si cambian los tres primeros, se manda el podio.
    showTop(list) {
      top = Array.isArray(list) ? list : [];
      pushTop(false);
    },
    resend() { pushTop(true); },
    test() { if (state.status === 'ready') { shownKey = ''; run(() => sendImage(testPatternGif(state.width, state.height))); } },
    setBrightness(level) {
      const value = Math.max(0, Math.min(100, Math.round(level)));
      set({ brightness: value });
      try { window.localStorage.setItem(BRIGHT_KEY, String(value)); } catch { /* da igual */ }
      if (state.status === 'ready') run(() => send(brightnessCommand(value), 'ack', SHORT_MS));
    },
    disconnect() {
      clearTimeout(retryTimer);
      set({ status: 'off', detail: '' });
      try { device?.gatt?.disconnect(); } catch { /* ya estaba */ }
      writer = null;
    },
  };
}
