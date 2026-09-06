#!/usr/bin/env node
// ============================================================================
// scripts/smoke-migracion.js — "CREAR CUENTA Y LLEVARME TODO" (BLOQUE 18, Etapa 3)
//
// Carga los archivos REALES (`src/offline/db.js`, `local.js`, `migrar.js`) sobre
// el SQLite que trae Node —SQLite auténtico, esquema real— y un backend
// SIMULADO que se comporta como el de verdad en lo que importa: deduplica por
// `client_uuid` (§19.7) y puede fallar cuando se le pida.
//
// LO QUE SE EXIGE, y es lo que pide la verificación del bloque:
//   · el catálogo, los clientes y el historial llegan completos;
//   · **los totales por día y por método de pago coinciden AL CENTAVO** con lo
//     que decía el historial local;
//   · cada venta viaja como DIFERIDA (client_uuid + sold_at + import_historico),
//     que es lo único que hace que conserve su fecha y su precio;
//   · si la red se cae a media migración, **reintentar no duplica nada**;
//   · y lo local queda intacto pase lo que pase.
//
// Uso:  node scripts/smoke-migracion.js
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');

// ─── expo-sqlite simulado sobre el SQLite real de Node ──────────────────────
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
const expoSqliteFalso = { openDatabaseAsync: async () => abrirBaseFalsa() };

let contadorUuid = 0;
const expoCryptoFalso = { randomUUID: () => `uuid-${++contadorUuid}` };
const secureStoreFalso = {
  _d: new Map(),
  async getItemAsync(k) { return this._d.has(k) ? this._d.get(k) : null; },
  async setItemAsync(k, v) { this._d.set(k, v); },
  async deleteItemAsync(k) { this._d.delete(k); },
};

const cache = new Map();
function cargar(rutaRelativa) {
  const archivo = path.join(RAIZ, rutaRelativa);
  if (cache.has(archivo)) return cache.get(archivo);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  cache.set(archivo, modulo.exports);
  const requireFalso = (spec) => {
    if (spec === 'expo-sqlite') return expoSqliteFalso;
    if (spec === 'expo-crypto') return expoCryptoFalso;
    if (spec === 'expo-secure-store') return secureStoreFalso;
    if (spec === 'expo-file-system') return { File: class {}, Paths: { cache: {} } };
    if (spec === 'expo-sharing') return { isAvailableAsync: async () => false, shareAsync: async () => {} };
    if (spec.startsWith('.')) {
      const destino = path.relative(RAIZ, path.resolve(path.dirname(archivo), spec)).replace(/\\/g, '/');
      return cargar(destino.endsWith('.js') ? destino : destino + '.js');
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(requireFalso, modulo, modulo.exports);
  cache.set(archivo, modulo.exports);
  return modulo.exports;
}

let ok = 0;
const fallos = [];
function comprobar(desc, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + desc); }
  else { fallos.push(desc); console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// ─── El backend simulado ────────────────────────────────────────────────────
//
// Se comporta como el real en lo único que la migración necesita creerle: los
// ids que devuelve, y la DEDUPLICACIÓN por client_uuid (§19.7), que es lo que
// hace que reintentar sea seguro.
function crearBackendFalso() {
  let secuencia = 100;
  const estado = {
    ajustes: null,
    categorias: [], productos: [], clientes: [], pedidos: [],
    peticiones: 0,
    // Para simular la red que se cae: falla a partir de la petición N.
    fallarDesde: Infinity,
    fallosProvocados: 0,
  };
  const quizaFallar = () => {
    estado.peticiones++;
    if (estado.peticiones >= estado.fallarDesde) {
      estado.fallosProvocados++;
      throw new Error('Sin conexión al servidor');
    }
  };
  const api = {
    async updateSettings(d) { quizaFallar(); estado.ajustes = d; return d; },
    async createCategory(d) { quizaFallar(); const c = { ...d, id: ++secuencia }; estado.categorias.push(c); return c; },
    async createProduct(d) { quizaFallar(); const p = { ...d, id: ++secuencia }; estado.productos.push(p); return p; },
    async createCustomer(d) { quizaFallar(); const c = { ...d, id: ++secuencia }; estado.clientes.push(c); return c; },
    async createOrder(d) {
      quizaFallar();
      // Igual que POST /api/orders: si ya existe ese client_uuid, se devuelve el
      // pedido de antes y NO se crea otro.
      const previo = estado.pedidos.find((p) => p.client_uuid && p.client_uuid === d.client_uuid);
      if (previo) return previo;
      const o = { ...d, id: ++secuencia };
      estado.pedidos.push(o);
      return o;
    },
  };
  return { api, estado };
}

// ─── El negocio de prueba ───────────────────────────────────────────────────
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString();

(async () => {
  const local = cargar('src/offline/local.js');
  const migrar = cargar('src/offline/migrar.js');
  local.fijarModoLocal(true);

  console.log('\n── Un negocio que lleva meses sin cuenta ──');
  await local.guardarAjustesLocales({
    business_name: 'Taquería El Zenit', currency: '$',
    tax_enabled: true, tax_rate: 16, tax_included: true, tax_name: 'IVA',
    propinas_activas: true,
  });
  const catTacos = await local.guardarCategoriaLocal({ name: 'Tacos', emoji: '🌮' });
  const catBebidas = await local.guardarCategoriaLocal({ name: 'Bebidas', emoji: '🥤' });
  const idTaco = await local.guardarProductoLocal({ name: 'Taco al pastor', price: 24.5, category_id: catTacos });
  const idAgua = await local.guardarProductoLocal({ name: 'Agua de horchata', price: 18, category_id: catBebidas });
  await local.guardarClienteLocal({ name: 'Doña Carmen', phone: '5512345678' });

  // 20 ventas repartidas en 4 meses, con métodos y propinas distintos. Las
  // fechas VIEJAS son el punto: con la ventana de 30 días se perderían.
  const METODOS = ['efectivo', 'tarjeta', 'transferencia'];
  const ventasEsperadas = [];
  for (let i = 0; i < 20; i++) {
    const dias = 120 - i * 6;            // de hace 120 días a hace 6
    const metodo = METODOS[i % 3];
    const cantidad = (i % 3) + 1;
    const bruto = 24.5 * cantidad;
    const propina = i % 4 === 0 ? 10 : 0;
    const pedido = await local.registrarVentaLocal({
      client_uuid: `venta-${i}`,
      sold_at: haceDias(dias),
      items: [{ product_id: idTaco, quantity: cantidad, unit_price: 24.5, base_unit_price: 24.5, name: 'Taco al pastor' }],
      total: bruto,
      subtotal: +(bruto / 1.16).toFixed(2),
      tax_amount: +(bruto - bruto / 1.16).toFixed(2),
      tax_rate: 16,
      tax_included: true,
      tip_amount: propina,
      tip_method: propina ? 'efectivo' : null,
      payment_method: metodo,
      order_type: 'takeout',
    });
    ventasEsperadas.push({ uuid: pedido.uuid, dias, metodo, total: bruto, propina });
  }

  const antes = await migrar.resumenParaMigrar();
  comprobar('el resumen cuenta lo que hay que subir',
    antes.productos === 2 && antes.categorias === 2 && antes.clientes === 1 && antes.ventas === 20,
    JSON.stringify(antes));
  comprobar('y sabe que todavía no se ha subido nada', antes.yaSubido.ventas === 0);

  // ── LA RED SE CAE A MEDIA MIGRACIÓN ───────────────────────────────────────
  console.log('\n── Se cae la red a media migración ──');
  const corte = crearBackendFalso();
  corte.estado.fallarDesde = 9;      // ajustes + 2 cat + 2 prod + 1 cli + unas ventas
  const parcial = await migrar.migrarANube(corte.api);

  comprobar('la migración NO revienta: devuelve un reporte', parcial && typeof parcial.ok === 'boolean');
  comprobar('y dice que quedó incompleta', parcial.ok === false && parcial.fallos.length > 0);
  comprobar('lo local sigue intacto: los 20 pedidos siguen ahí',
    (await local.listarPedidosLocales(100000)).length === 20);
  comprobar('y los 2 productos también', (await local.listarProductosLocales()).length === 2);

  const subidoEnElCorte = corte.estado.pedidos.length;
  comprobar('alcanzó a subir el catálogo antes de caerse',
    corte.estado.categorias.length === 2 && corte.estado.productos.length === 2);

  // ── SE REINTENTA ──────────────────────────────────────────────────────────
  console.log('\n── Vuelve la red y se reintenta ──');
  const bueno = crearBackendFalso();
  // El segundo intento usa un backend NUEVO (como si fuera la misma cuenta):
  // lo que importa es que la migración no vuelva a mandar lo ya anotado.
  const segundo = await migrar.migrarANube(bueno.api);

  comprobar('el reintento termina bien', segundo.ok === true, JSON.stringify(segundo.fallos));
  comprobar('🔒 NO se duplica el catálogo: no se reenvía lo ya subido',
    bueno.estado.categorias.length === 0 && bueno.estado.productos.length === 0,
    `categorías reenviadas: ${bueno.estado.categorias.length}, productos: ${bueno.estado.productos.length}`);
  comprobar('sube exactamente las ventas que faltaban',
    bueno.estado.pedidos.length === 20 - subidoEnElCorte,
    `faltaban ${20 - subidoEnElCorte}, subió ${bueno.estado.pedidos.length}`);

  // Un TERCER intento no debe mandar absolutamente nada.
  const tercero = crearBackendFalso();
  await migrar.migrarANube(tercero.api);
  comprobar('un tercer intento no manda nada: ya está todo',
    tercero.estado.pedidos.length === 0 && tercero.estado.productos.length === 0);

  // ── MIGRACIÓN LIMPIA, DE CERO ─────────────────────────────────────────────
  console.log('\n── Y ahora, una migración limpia de principio a fin ──');
  await migrar.olvidarMigracion();
  const nube = crearBackendFalso();
  const r = await migrar.migrarANube(nube.api);

  comprobar('termina sin fallos', r.ok === true, JSON.stringify(r.fallos));
  comprobar('sube las 2 categorías, 2 productos, 1 cliente y 20 ventas',
    nube.estado.categorias.length === 2 && nube.estado.productos.length === 2 &&
    nube.estado.clientes.length === 1 && nube.estado.pedidos.length === 20);
  comprobar('los ajustes del negocio viajan (nombre e impuesto)',
    nube.estado.ajustes?.nombre_negocio === 'Taquería El Zenit' &&
    nube.estado.ajustes?.tax_rate === 16 && nube.estado.ajustes?.tax_enabled === true);

  // ── LO QUE HACE QUE EL HISTORIAL SEA REAL Y NO FICCIÓN ────────────────────
  console.log('\n── Cada venta viaja como DIFERIDA, o el historial sería de hoy ──');
  comprobar('todas llevan su client_uuid', nube.estado.pedidos.every((p) => !!p.client_uuid));
  comprobar('todas llevan su sold_at real', nube.estado.pedidos.every((p) => !!p.sold_at));
  comprobar('🔒 todas piden la ventana de importación (sin ella se fechan HOY)',
    nube.estado.pedidos.every((p) => p.import_historico === true));
  comprobar('todas conservan la tasa de impuesto con la que se cobraron',
    nube.estado.pedidos.every((p) => p.tax_rate === 16 && p.tax_included === true));
  comprobar('y el precio unitario que de verdad se cobró',
    nube.estado.pedidos.every((p) => p.items.every((it) => cerca(it.unit_price, 24.5))));

  const masVieja = nube.estado.pedidos
    .map((p) => (Date.now() - new Date(p.sold_at).getTime()) / 86400000)
    .sort((a, b) => b - a)[0];
  comprobar('la más antigua tiene 120 días — muy por encima de los 30 de la guarda',
    masVieja > 119 && masVieja < 121, `días: ${masVieja}`);

  // ── EL CUADRE: los totales tienen que coincidir AL CENTAVO ────────────────
  console.log('\n── El cuadre: los totales de la nube contra el historial local ──');
  const sumaLocal = ventasEsperadas.reduce((s, v) => s + v.total, 0);
  const sumaNube = nube.estado.pedidos.reduce((s, p) => {
    const items = p.items.reduce((x, it) => x + it.quantity * it.unit_price, 0);
    return s + items;
  }, 0);
  comprobar('el total vendido coincide al centavo', cerca(sumaLocal, sumaNube),
    `local ${sumaLocal.toFixed(2)} vs nube ${sumaNube.toFixed(2)}`);

  for (const metodo of METODOS) {
    const localM = ventasEsperadas.filter((v) => v.metodo === metodo)
      .reduce((s, v) => s + v.total, 0);
    const nubeM = nube.estado.pedidos.filter((p) => p.payment_method === metodo)
      .reduce((s, p) => s + p.items.reduce((x, it) => x + it.quantity * it.unit_price, 0), 0);
    comprobar(`por método — ${metodo}: coincide al centavo`, cerca(localM, nubeM),
      `local ${localM.toFixed(2)} vs nube ${nubeM.toFixed(2)}`);
  }

  const propinasLocal = ventasEsperadas.reduce((s, v) => s + v.propina, 0);
  const propinasNube = nube.estado.pedidos.reduce((s, p) => s + (p.tip_amount || 0), 0);
  comprobar('las propinas coinciden (y van APARTE del total, §30)', cerca(propinasLocal, propinasNube));

  // Por DÍA, que es la comprobación que pide el plan.
  const porDiaLocal = {};
  for (const v of ventasEsperadas) {
    const d = haceDias(v.dias).slice(0, 10);
    porDiaLocal[d] = (porDiaLocal[d] || 0) + v.total;
  }
  const porDiaNube = {};
  for (const p of nube.estado.pedidos) {
    const d = String(p.sold_at).slice(0, 10);
    porDiaNube[d] = (porDiaNube[d] || 0) + p.items.reduce((x, it) => x + it.quantity * it.unit_price, 0);
  }
  const diasLocal = Object.keys(porDiaLocal).sort();
  comprobar('hay ventas en 20 días distintos', diasLocal.length === 20);
  comprobar('🔒 el total de CADA DÍA coincide al centavo',
    diasLocal.every((d) => cerca(porDiaLocal[d], porDiaNube[d] ?? -1)),
    diasLocal.filter((d) => !cerca(porDiaLocal[d], porDiaNube[d] ?? -1)).join(', '));

  // ── Y lo local sigue intacto al terminar ─────────────────────────────────
  console.log('\n── Nada se borró ──');
  comprobar('los 20 pedidos siguen en el teléfono',
    (await local.listarPedidosLocales(100000)).length === 20);
  comprobar('los productos y el cliente también',
    (await local.listarProductosLocales()).length === 2 &&
    (await local.listarClientesLocales()).length === 1);

  const despues = await migrar.resumenParaMigrar();
  comprobar('el resumen ya dice que está todo subido',
    despues.yaSubido.ventas === 20 && despues.yaSubido.productos === 2);

  // ── Cierre ────────────────────────────────────────────────────────────────
  console.log('');
  if (fallos.length === 0) {
    console.log(`✅ ${ok} comprobaciones de la migración a una cuenta (§49), todas en verde.`);
  } else {
    console.log(`❌ ${fallos.length} de ${ok + fallos.length} comprobaciones FALLARON:`);
    for (const f of fallos) console.log('   · ' + f);
  }
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => {
  console.error('\n❌ El smoke test reventó: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
