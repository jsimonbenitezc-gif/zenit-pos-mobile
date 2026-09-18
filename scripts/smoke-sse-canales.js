/**
 * SMOKE: el SSE por CANALES del celular (§56.7, 2026-09-17).
 *
 * El backend unificó los cinco `/events` en `GET /api/events?channels=…`, que
 * manda los eventos CON NOMBRE. El celular abre SSE por pantalla, así que casi
 * siempre le basta una conexión — la excepción era **Mesas**, que abría dos
 * (pedidos e insumos). Ahora pide los dos canales por una sola.
 *
 * 🔴 LO QUE PUEDE ROMPERSE SIN QUE NADA FALLE A LA VISTA: un evento con nombre
 * NO llega al listener de 'message'. Si alguien "simplifica" `createSSE` para
 * que siempre escuche 'message', la pantalla de Mesas deja de refrescarse sola
 * y no hay ningún error en ninguna parte. Eso es lo que se comprueba aquí,
 * cargando el `src/utils/sse.js` REAL con un EventSource de mentira.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const RAIZ = path.join(__dirname, '..');
let ok = 0;
const fallos = [];

function comprobar(desc, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + desc); }
  else { fallos.push(desc); console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// ── Un EventSource de mentira que apunta a qué se suscribió ────────────────
const creados = [];
class EventSourceFalso {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    creados.push(this);
  }
  addEventListener(tipo, fn) {
    if (!this.listeners.has(tipo)) this.listeners.set(tipo, []);
    this.listeners.get(tipo).push(fn);
  }
  close() { this.cerrado = true; }
  /** Simula que el servidor manda un evento de ese canal. */
  emitir(tipo, datos) {
    for (const fn of this.listeners.get(tipo) || []) fn({ type: tipo, data: datos });
  }
}

function cargarSse() {
  const archivo = path.join(RAIZ, 'src', 'utils', 'sse.js');
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  const requireFalso = (spec) => {
    if (spec === 'react-native-sse') return { __esModule: true, default: EventSourceFalso };
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(requireFalso, modulo, modulo.exports);
  return modulo.exports;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const { createSSE } = cargarSse();

  console.log('\n── SSE por canales (§56.7) ──\n');

  // ── 1. Sin `canales`: el camino de siempre, por 'message' ────────────────
  creados.length = 0;
  const recibidosViejo = [];
  const viejo = createSSE({ url: 'http://x/api/orders/events', options: {} }, (e, canal) => recibidosViejo.push(canal));
  await esperar(20);

  comprobar('sin canales se abre una conexión', creados.length === 1);
  comprobar('…y escucha por "message", como los endpoints de siempre',
    creados[0] && creados[0].listeners.has('message'));
  creados[0].emitir('message', '{}');
  comprobar('…y el callback se dispara', recibidosViejo.length === 1);
  viejo.close();

  // ── 2. Con `canales`: eventos NOMBRADOS ──────────────────────────────────
  creados.length = 0;
  const recibidos = [];
  const nuevo = createSSE(
    { url: 'http://x/api/events?channels=orders,inventory', options: {} },
    (e, canal) => recibidos.push(canal),
    { canales: ['orders', 'inventory'] }
  );
  await esperar(20);

  comprobar('🔒 dos canales viajan por UNA sola conexión', creados.length === 1,
    'se abrieron ' + creados.length);
  const es = creados[0];
  comprobar('🔒 se suscribe al canal "orders"', es.listeners.has('orders'));
  comprobar('🔒 se suscribe al canal "inventory"', es.listeners.has('inventory'));
  comprobar('🔒 …y NO a "message": un evento con nombre nunca llega ahí',
    !es.listeners.has('message'));

  es.emitir('orders', '{}');
  es.emitir('inventory', '{}');
  comprobar('🔒 el callback sabe QUÉ canal se movió',
    JSON.stringify(recibidos) === JSON.stringify(['orders', 'inventory']),
    'llegó: ' + JSON.stringify(recibidos));

  nuevo.close();
  comprobar('cerrar cierra la conexión', es.cerrado === true);

  // ── 3. Y que Mesas sea la que la usa ─────────────────────────────────────
  const mesas = fs.readFileSync(path.join(RAIZ, 'src', 'screens', 'main', 'MesasScreen.js'), 'utf8');
  comprobar('🔒 Mesas pide los dos canales por una conexión',
    /getEventsConfig\(\[\s*'orders',\s*'inventory'\s*\]\)/.test(mesas));
  comprobar('🔒 …y ya no abre dos SSE',
    !mesas.includes('getOrdersEventsConfig') && !mesas.includes('getInventoryEventsConfig'));
  comprobar('…distinguiendo el canal antes de recargar', /canal === 'inventory'/.test(mesas));
  // 🔴 Este de aquí lo añadí DESPUÉS de comprobar los dientes: quitarle a Mesas
  // el `{ canales: [...] }` dejaba la prueba en verde, y sin esa opción
  // createSSE escucha 'message' y no le llega ni un evento del endpoint
  // unificado. Era justo el fallo silencioso que esta prueba dice vigilar.
  comprobar('🔒 …y DECLARA los canales (sin eso escucharía "message" y no llegaría nada)',
    /\{\s*canales:\s*\[\s*'orders',\s*'inventory'\s*\]\s*\}/.test(mesas));

  // ── 4. El cliente construye bien la URL ──────────────────────────────────
  const cliente = fs.readFileSync(path.join(RAIZ, 'src', 'api', 'client.js'), 'utf8');
  comprobar('el cliente tiene getEventsConfig', cliente.includes('async getEventsConfig('));
  comprobar('…y apunta al endpoint unificado', cliente.includes('/events?channels='));
  comprobar('🔒 los cinco endpoints viejos SIGUEN existiendo (binarios instalados)',
    ['getOrdersEventsConfig', 'getInventoryEventsConfig', 'getSettingsEventsConfig',
     'getAuditEventsConfig', 'getTurnoEventsConfig'].every((m) => cliente.includes(m)),
    'falta alguno de los cinco');

  console.log('');
  if (fallos.length) {
    console.log('❌ ' + fallos.length + ' de ' + (ok + fallos.length) + ' comprobaciones FALLARON.\n');
    process.exit(1);
  }
  console.log('✅ ' + ok + ' comprobaciones del SSE por canales, todas en verde.\n');
}

principal().catch((e) => {
  console.error('\n❌ ' + (e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
