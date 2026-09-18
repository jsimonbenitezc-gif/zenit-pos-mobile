import EventSource from 'react-native-sse';

const MAX_RETRIES = 5;
const INITIAL_DELAY = 5000;   // 5s
const MAX_DELAY = 120000;     // 2min

/**
 * Crea una conexión SSE con reconexión exponential backoff.
 *
 * Acepta como primer argumento un objeto `{ url, options }` o una función que
 * devuelva ese objeto. Pasar una función permite refrescar el token (y la URL)
 * en cada reconexión: si el access token rotó por refresh, el siguiente intento
 * usa el token nuevo en lugar de reintentar con uno expirado.
 *
 * @param {Object|Function|null} configOrGetter - { url, options } o () => { url, options }
 * @param {Function}             onMessage      - callback al recibir mensaje
 * @param {Object}               opts           - { onDisconnected?: () => void }
 * @returns {{ close: Function }}
 */
export function createSSE(configOrGetter, onMessage, opts = {}) {
  const getConfig = typeof configOrGetter === 'function'
    ? configOrGetter
    : () => configOrGetter;

  // Sólo se puede validar de inmediato cuando la config es un objeto directo;
  // los getters (que pueden ser async) se evalúan dentro de connect().
  if (typeof configOrGetter !== 'function' && !configOrGetter) return { close: () => {} };

  let retryCount = 0;
  let retryTimeout = null;
  let es = null;
  let closed = false;

  async function connect() {
    if (closed) return;
    try { es?.close(); } catch {}
    es = null;

    // Releer config en cada conexión (soporta getters async): si el token
    // rotó o estaba por vencer, aquí se obtiene uno fresco en vez de
    // reintentar con uno ya expirado.
    let config = null;
    try { config = await getConfig(); } catch { config = null; }
    if (closed) return;
    if (!config) {
      opts.onDisconnected?.();
      return;
    }

    es = new EventSource(config.url, config.options);

    // Dos formas, y la diferencia es de dónde viene el evento:
    //
    //  · los cinco `/api/<algo>/events` de siempre mandan el evento SIN NOMBRE,
    //    y eso se oye por 'message';
    //  · el unificado `/api/events?channels=…` lo manda CON NOMBRE (`event:
    //    orders`), que es lo que permite traer varios canales por una sola
    //    conexión — y esos NO llegan a 'message'.
    //
    // Por eso `onMessage` recibe también el nombre del canal: una pantalla que
    // escucha dos canales necesita saber cuál se movió.
    const canales = Array.isArray(opts.canales) ? opts.canales : null;
    if (canales && canales.length) {
      for (const canal of canales) {
        es.addEventListener(canal, (event) => {
          retryCount = 0;
          onMessage(event, canal);
        });
      }
    } else {
      es.addEventListener('message', (event) => {
        retryCount = 0;
        onMessage(event, null);
      });
    }

    es.addEventListener('error', () => {
      try { es?.close(); } catch {}
      es = null;
      if (closed) return;

      retryCount++;
      if (retryCount > MAX_RETRIES) {
        opts.onDisconnected?.();
        return;
      }

      const delay = Math.min(INITIAL_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY);
      retryTimeout = setTimeout(connect, delay);
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
      try { es?.close(); } catch {}
      es = null;
    },
  };
}
