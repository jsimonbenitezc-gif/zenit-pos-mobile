import EventSource from 'react-native-sse';

const MAX_RETRIES = 5;
const INITIAL_DELAY = 5000;   // 5s
const MAX_DELAY = 120000;     // 2min

/**
 * Crea una conexión SSE con reconexión exponential backoff.
 *
 * @param {Object|null} config  - { url, options } de api.getXxxEventsConfig()
 * @param {Function}    onMessage - callback al recibir mensaje
 * @param {Object}      opts      - { onDisconnected?: () => void }
 * @returns {{ close: Function }}
 */
export function createSSE(config, onMessage, opts = {}) {
  if (!config) return { close: () => {} };

  let retryCount = 0;
  let retryTimeout = null;
  let es = null;
  let closed = false;

  function connect() {
    if (closed) return;
    try { es?.close(); } catch {}

    es = new EventSource(config.url, config.options);

    es.addEventListener('message', (event) => {
      retryCount = 0;
      onMessage(event);
    });

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
      if (retryTimeout) clearTimeout(retryTimeout);
      try { es?.close(); } catch {}
      es = null;
    },
  };
}
