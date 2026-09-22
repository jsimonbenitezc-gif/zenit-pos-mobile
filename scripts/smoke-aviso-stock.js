#!/usr/bin/env node
// ============================================================================
// scripts/smoke-aviso-stock.js — "faltan existencias" NO es un pedido creado
//
//     npm run smoke:aviso-stock
//
// Cuando a una venta le faltan existencias, `POST /api/orders` responde 200
// con `{ stock_warning: true, warnings }` y NO crea el pedido (§56.3). El
// celular nunca conoció esa respuesta y la tomaba por el pedido:
//
//   · Mesas: la comanda desaparecía sin decir nada (visto en el emulador,
//     2026-09-22, con 0.36 kg de queso para dos pizzas y una hamburguesa);
//   · Nueva venta: decía "Venta registrada" sin haber guardado nada;
//   · la cola offline la marcaba como SUBIDA y la borraba: venta cobrada que
//     nunca llegaba al servidor.
//
// Y el desktop tenía la misma trampa al subir una mesa cobrada en modo local.
//
// Esta prueba carga los archivos REALES y comprueba las cuatro salidas. Si el
// repo del desktop está al lado, comprueba también el suyo.
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');
const DESKTOP = process.env.ZENIT_DESKTOP || path.join(RAIZ, '..', 'zenit-pos-desktop');

function abrirBaseFalsa() {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql, params = []) { return db.prepare(sql).all(...params); },
    async getFirstAsync(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    async withTransactionAsync(fn) { await fn(); },
  };
}
let contadorUuid = 0;
const secureStore = {
  _d: new Map(),
  async getItemAsync(k) { return this._d.has(k) ? this._d.get(k) : null; },
  async setItemAsync(k, v) { this._d.set(k, v); },
  async deleteItemAsync(k) { this._d.delete(k); },
};

// El cliente HTTP que ven los módulos de `offline/`: por defecto responde lo
// que diga `respuesta`, pasando por el createOrder REAL (que es lo que se prueba).
let clienteReal = null;
const apiFalso = {
  token: 'tok',
  cuerpos: [],
  respuesta: null,
  async createOrder(body) {
    this.cuerpos.push(body);
    return clienteReal.createOrder(body);
  },
};

const cache = new Map();
function cargar(rutaRelativa, { apiDeVerdad = false } = {}) {
  const archivo = path.join(RAIZ, rutaRelativa);
  const clave = archivo + (apiDeVerdad ? '#real' : '');
  if (cache.has(clave)) return cache.get(clave);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  cache.set(clave, modulo.exports);
  const req = (spec) => {
    if (spec === 'expo-sqlite') return { openDatabaseAsync: async () => abrirBaseFalsa() };
    if (spec === 'expo-crypto') return { randomUUID: () => `uuid-${++contadorUuid}` };
    if (spec === 'expo-secure-store') return secureStore;
    if (spec === 'expo-file-system') return { File: class {}, Paths: { cache: {} } };
    if (spec === 'expo-sharing') return { isAvailableAsync: async () => false, shareAsync: async () => {} };
    if (spec.endsWith('api/client') && !apiDeVerdad) return { api: apiFalso };
    if (spec.startsWith('.')) {
      const destino = path.relative(RAIZ, path.resolve(path.dirname(archivo), spec)).replace(/\\/g, '/');
      return cargar(destino.endsWith('.js') ? destino : destino + '.js');
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(req, modulo, modulo.exports);
  cache.set(clave, modulo.exports);
  return modulo.exports;
}

let total = 0, fallos = 0;
const ok = (desc, cond, detalle = '') => {
  total++;
  console.log(`  ${cond ? '✓' : '✗'} ${desc}${cond || !detalle ? '' : '\n      → ' + detalle}`);
  if (!cond) fallos++;
};
const soloCodigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const AVISO = {
  stock_warning: true,
  warnings: [{ ingredient_id: 5, ingredient: 'Queso Gouda', unit: 'kg', available: 0.36, required: 0.44 }],
};
const PEDIDO = { id: 900, total: 485, items: [] };

(async () => {
  const aviso = cargar('src/utils/avisoStock.js');

  console.log('\n── 1. El aviso, en palabras que el cajero entiende ──\n');
  const txt = aviso.textoAvisoStock(AVISO.warnings);
  ok('dice qué falta, cuánto hay y cuánto se necesita', txt.includes('Queso Gouda') && txt.includes('0.36 kg') && txt.includes('0.44 kg'), txt);
  const muchos = Array.from({ length: 8 }, (_, i) => ({ ingredient: `Insumo ${i}`, available: 0, required: 1 }));
  ok('con muchos faltantes no llena la pantalla', aviso.textoAvisoStock(muchos).includes('…y 3 más'));
  ok('un aviso mal formado no revienta', typeof aviso.textoAvisoStock(null) === 'string' && aviso.textoAvisoStock([{}]).includes('Producto'));
  ok('reconoce la respuesta de aviso y NO un pedido', aviso.esRespuestaAvisoStock(AVISO) && !aviso.esRespuestaAvisoStock(PEDIDO) && !aviso.esRespuestaAvisoStock(null));

  console.log('\n── 2. api.createOrder (el REAL) no toma el aviso por un pedido ──\n');
  const { api } = cargar('src/api/client.js', { apiDeVerdad: true });
  clienteReal = api;
  let respuesta = AVISO;
  api.request = async () => respuesta;
  let err = null;
  try { await api.createOrder({ items: [] }); } catch (e) { err = e; }
  ok('con aviso de existencias, createOrder LANZA', aviso.esAvisoStock(err), err ? err.message : 'no lanzó: devolvió el aviso como si fuera un pedido');
  ok('y el error lleva los faltantes', err?.warnings?.length === 1 && err.warnings[0].ingredient === 'Queso Gouda');
  respuesta = PEDIDO;
  const creado = await api.createOrder({ items: [] });
  ok('con un pedido de verdad, lo devuelve igual que siempre', creado?.id === 900);

  console.log('\n── 3. Nueva venta: registrarVenta NO dice "registrada" ni la encola ──\n');
  const db = cargar('src/offline/db.js');
  const ventas = cargar('src/offline/ventasOffline.js');
  await db.inicializarDB?.();
  respuesta = AVISO;
  err = null;
  let res = null;
  try { res = await ventas.registrarVenta({ items: [{ product_id: 1, quantity: 1 }] }, true, { total: 85 }); } catch (e) { err = e; }
  ok('online con aviso: registrarVenta LANZA el aviso (la pantalla pregunta)', aviso.esAvisoStock(err), res ? `devolvió ${JSON.stringify(res).slice(0, 80)}` : String(err));
  const pend = await db.obtenerVentas('pendiente');
  ok('y NO la mete a la cola como si fuera falta de red', pend.length === 0, `${pend.length} en la cola`);

  console.log('\n── 4. La cola offline sube con skip_stock_check y no pierde nada ──\n');
  respuesta = { network: true };
  // Sin red: la venta se encola.
  apiFalso.createOrder = async (body) => { apiFalso.cuerpos.push(body); throw new Error('Sin conexión al servidor'); };
  await ventas.registrarVenta({ items: [{ product_id: 1, quantity: 1 }] }, true, { total: 85 });
  ok('sin red, la venta queda en la cola', (await db.obtenerVentas('pendiente')).length === 1);
  // Vuelve la red y el servidor, si no le dicen nada, contestaría con el aviso.
  apiFalso.cuerpos = [];
  apiFalso.createOrder = async (body) => {
    apiFalso.cuerpos.push(body);
    api.request = async () => (body.skip_stock_check ? PEDIDO : AVISO);
    return api.createOrder(body);
  };
  const r1 = await ventas.sincronizarVentasPendientes();
  const subido = apiFalso.cuerpos[0] || {};
  ok('la cola sube con skip_stock_check: true (la venta YA ocurrió)', subido.skip_stock_check === true);
  ok('y la venta queda subida', r1.subidas === 1 && r1.pendientes === 0, JSON.stringify(r1));
  // Aunque algún día faltara el skip: un aviso NUNCA se marca como subida.
  // (el stub va ANTES: crearVenta lanza su propia subida en segundo plano)
  apiFalso.createOrder = async (body) => { api.request = async () => AVISO; return api.createOrder({ ...body, skip_stock_check: false }); };
  await ventas.registrarVenta({ items: [{ product_id: 1, quantity: 1 }] }, false, { total: 85 });
  await new Promise((r) => setTimeout(r, 50));
  const r2 = await ventas.sincronizarVentasPendientes();
  ok('si el servidor contesta con aviso, la venta NO se marca como subida', r2.subidas === 0 && r2.pendientes === 1, JSON.stringify(r2));

  console.log('\n── 5. Las pantallas preguntan y reenvían ──\n');
  const venta = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/screens/main/NuevaVentaScreen.js'), 'utf8'));
  ok('Nueva venta atiende el aviso en su catch y ofrece cobrar igual',
    /if \(esAvisoStock\(e\)\)/.test(venta) && /cobrar\(\{ sinRevisarStock: true \}\)/.test(venta));
  ok('y al reenviar manda skip_stock_check', /sinRevisarStock \? \{ skip_stock_check: true \}/.test(venta));
  const mesas = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/screens/main/MesasScreen.js'), 'utf8'));
  ok('Mesas atiende el aviso y ofrece enviar la comanda igual',
    /if \(esAvisoStock\(e\)\)/.test(mesas) && /confirmarAgregar\(\{ sinRevisarStock: true \}\)/.test(mesas));
  ok('y al reenviar manda skip_stock_check', /sinRevisarStock \? \{ skip_stock_check: true \}/.test(mesas));

  console.log('\n── 6. El desktop ──\n');
  const rutaCliente = path.join(DESKTOP, 'pos', 'api-client.js');
  if (!fs.existsSync(rutaCliente)) {
    console.log('  ⚠️  No está el repo del desktop al lado: se salta.');
  } else {
    const APIClient = require(rutaCliente);
    const c = new APIClient();
    c.request = async () => AVISO;
    let e2 = null;
    try { await c.createOrder({}, []); } catch (e) { e2 = e; }
    ok('su createOrder también LANZA con el aviso', e2?.code === 'STOCK_WARNING', e2 ? e2.message : 'no lanzó');
    const mesasD = soloCodigo(fs.readFileSync(path.join(DESKTOP, 'pos', 'modulo-mesas.js'), 'utf8'));
    const i = mesasD.indexOf('await apiClient.createOrder({');
    const bloque = mesasD.slice(i, mesasD.indexOf('renglonesParaSubir(', i));
    ok('la mesa cobrada en modo local sube con skip_stock_check', i > 0 && /skip_stock_check:\s*true/.test(bloque));
    const syncD = soloCodigo(fs.readFileSync(path.join(DESKTOP, 'pos', 'modulo-sync.js'), 'utf8'));
    ok('y su cola de ventas sigue subiendo con skip_stock_check', /skip_stock_check:\s*true/.test(syncD));
  }

  console.log('');
  if (fallos) {
    console.log(`❌ ${fallos} de ${total} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log(`✅ ${total} comprobaciones: un aviso de existencias ya no se toma por un pedido creado.`);
})().catch((e) => { console.error('❌ La prueba reventó:', e); process.exit(1); });
