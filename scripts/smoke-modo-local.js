#!/usr/bin/env node
// ============================================================================
// scripts/smoke-modo-local.js — el MODO LOCAL contra SQLite de verdad.
//
// Carga los archivos REALES (`src/offline/db.js` y `src/offline/local.js`) con
// expo-sqlite sustituido por el SQLite que trae Node. Es SQLite auténtico: se
// ejercitan el esquema real, las transacciones y las consultas tal cual se
// ejecutarán en el teléfono, no una imitación.
//
// POR QUÉ: aquí vive el negocio de alguien que no tiene respaldo en ninguna
// parte. Un error en el guardado de una venta o en el borrado de un producto no
// se nota hasta que el historial ya está mal, y entonces no hay de dónde
// recuperarlo.
//
// Uso:  node scripts/smoke-modo-local.js
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
    // Suficiente para lo que hace el código: agrupa las escrituras. Sin BEGIN/COMMIT
    // reales no se prueba el rollback, pero sí que la secuencia de sentencias es
    // válida y que el resultado final es el correcto.
    async withTransactionAsync(fn) { await fn(); },
  };
}

const expoSqliteFalso = {
  openDatabaseAsync: async () => abrirBaseFalsa(),
};

let contadorUuid = 0;
const expoCryptoFalso = { randomUUID: () => `uuid-${++contadorUuid}` };
const secureStoreFalso = {
  _d: new Map(),
  async getItemAsync(k) { return this._d.has(k) ? this._d.get(k) : null; },
  async setItemAsync(k, v) { this._d.set(k, v); },
  async deleteItemAsync(k) { this._d.delete(k); },
};

// ─── Cargador de módulos reales, con sus dependencias entre sí ──────────────
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
function comprobar(desc, cond) {
  if (cond) { ok++; console.log('  ✓ ' + desc); }
  else { fallos.push(desc); console.log('  ✗ ' + desc); }
}
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

(async () => {
  const local = cargar('src/offline/local.js');
  local.fijarModoLocal(true);

  console.log('\n── El negocio captura su menú ──');
  const catBebidas = await local.guardarCategoriaLocal({ name: 'Bebidas', emoji: '🥤' });
  const catTacos   = await local.guardarCategoriaLocal({ name: 'Tacos', emoji: '🌮' });
  const idTaco  = await local.guardarProductoLocal({ name: 'Taco de pastor', price: 24.5, category_id: catTacos });
  const idAgua  = await local.guardarProductoLocal({ name: 'Agua de horchata', price: 18, category_id: catBebidas });
  const idOculto = await local.guardarProductoLocal({ name: 'Descontinuado', price: 10, category_id: catTacos, active: false });

  const productos = await local.listarProductosLocales();
  comprobar('se guardan los tres productos', productos.length === 3);
  comprobar('con su precio exacto (decimales incluidos)',
    cerca(productos.find(p => p.id === idTaco).price, 24.5));
  comprobar('🔒 cada fila nace con su uuid (sin él, migrar a una cuenta sería imposible)',
    productos.every(p => !!p.uuid) && new Set(productos.map(p => p.uuid)).size === 3);

  const agrupado = await local.catalogoLocalAgrupado();
  comprobar('el catálogo sale agrupado por categoría', agrupado.length === 2);
  comprobar('un producto inactivo NO se ofrece en la venta',
    !JSON.stringify(agrupado).includes('Descontinuado'));

  console.log('\n── Borrar una categoría no borra el menú ──');
  await local.borrarCategoriaLocal(catBebidas);
  const trasBorrar = await local.listarProductosLocales();
  comprobar('🔒 el agua sigue existiendo tras borrar su categoría',
    trasBorrar.some(p => p.id === idAgua));
  comprobar('…y queda sin categoría, no colgando de una que ya no existe',
    trasBorrar.find(p => p.id === idAgua)?.category_id == null &&
    trasBorrar.some(p => p.id === idAgua));
  const agrupado2 = await local.catalogoLocalAgrupado();
  comprobar('aparece bajo "Sin categoría" para poder seguir vendiéndolo',
    agrupado2.some(g => g.name === 'Sin categoría' && g.products.some(p => p.id === idAgua)));

  console.log('\n── Una venta con impuesto y propina ──');
  // Los números vienen ya calculados por la pantalla con las fórmulas de
  // src/utils/ (§29, §30): aquí solo se comprueba que se GUARDEN intactos.
  const pedido = await local.registrarVentaLocal({
    total: 116, subtotal: 100, tax_amount: 16, tax_rate: 16, tax_included: false,
    tip_amount: 20, tip_method: 'efectivo', payment_method: 'tarjeta',
    order_type: 'takeout',
    items: [
      { product_id: idTaco, quantity: 4, base_unit_price: 24.5,
        modifiers: [{ option_id: 9, name: 'Extra queso', price_delta: 5 }] },
      { product_id: idAgua, quantity: 1, base_unit_price: 18 },
    ],
  }, { total: 116, resumen: { items: [{ name: 'Taco de pastor' }, { name: 'Agua de horchata' }] } });

  comprobar('la venta queda guardada con su total', cerca(pedido.total, 116));
  comprobar('el impuesto se conserva tal cual se cobró', cerca(pedido.tax_amount, 16));
  comprobar('🔒 la propina NO se suma al total (§30)', cerca(pedido.total, 116) && cerca(pedido.tip_amount, 20));
  comprobar('el método de pago no se pierde', pedido.payment_method === 'tarjeta');
  comprobar('se guardan los dos renglones', pedido.items.length === 2);
  comprobar('el precio del renglón es el COBRADO: base + extras (§32)',
    cerca(pedido.items[0].unit_price, 29.5));
  comprobar('los extras quedan congelados en el renglón',
    pedido.items[0].modifiers?.[0]?.name === 'Extra queso');
  comprobar('el nombre del producto se COPIA en el renglón',
    pedido.items[0].name === 'Taco de pastor');

  console.log('\n── El historial sobrevive a que cambie el menú ──');
  await local.borrarProductoLocal(idTaco);
  const historial = await local.listarPedidosLocales();
  comprobar('la venta sigue en el historial tras borrar el producto', historial.length === 1);
  comprobar('🔒 y el ticket sigue diciendo QUÉ se vendió y a cuánto',
    historial[0].items[0].name === 'Taco de pastor' && cerca(historial[0].items[0].unit_price, 29.5));

  const totales = await local.totalesDelDiaLocal();
  comprobar('los totales del día cuadran', totales.ventas === 1 && cerca(totales.total, 116));

  console.log('\n── Ajustes del negocio local ──');
  await local.guardarAjustesLocales({ business_name: 'Taquería El Zenit', tax_enabled: true, tax_rate: 16 });
  await local.guardarAjustesLocales({ currency_symbol: '$' });
  const ajustes = await local.leerAjustesLocales();
  comprobar('se guardan y se leen', ajustes.business_name === 'Taquería El Zenit');
  comprobar('guardar una clave no borra las demás',
    ajustes.tax_enabled === true && ajustes.currency_symbol === '$');

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 2 — un día completo de caja. El criterio es el mismo del banco de
  // pruebas del backend (§38): **la diferencia del corte tiene que dar $0**.
  // ══════════════════════════════════════════════════════════════════════════
  const utils = cargar('src/utils/propinas.js');

  console.log('\n── Un día completo de caja ──');
  await local.guardarProductoLocal({ name: 'Torta', price: 58 });

  const turno = await local.abrirTurnoLocal('Rosa', 500);
  comprobar('el turno abre con su fondo inicial', turno.fondo_inicial === 500);
  comprobar('no se pueden abrir dos turnos a la vez',
    (await local.abrirTurnoLocal('Otro', 999)).id === turno.id);

  // Venta 1: efectivo, con impuesto agregado.
  await local.registrarVentaLocal({
    total: 116, subtotal: 100, tax_amount: 16, payment_method: 'efectivo',
    items: [{ product_id: 1, quantity: 2, base_unit_price: 58 }],
  }, { resumen: { items: [{ name: 'Torta' }] } });

  // Venta 2: tarjeta.
  await local.registrarVentaLocal({
    total: 200, payment_method: 'tarjeta',
    items: [{ product_id: 1, quantity: 1, base_unit_price: 200 }],
  }, { resumen: { items: [{ name: 'Torta' }] } });

  // Venta 3: DIVIDIDA — 60 en efectivo (con 20 de propina en efectivo) y 40 con
  // tarjeta. Es el caso que descuadra la caja si el reparto se lee mal (§31).
  await local.registrarVentaLocal({
    total: 100, payment_method: 'multiple',
    tip_amount: 20, tip_method: 'efectivo',
    payments: [
      { method: 'efectivo', amount: 60, tip_amount: 20 },
      { method: 'tarjeta',  amount: 40 },
    ],
    items: [{ product_id: 1, quantity: 1, base_unit_price: 100 }],
  }, { resumen: { items: [{ name: 'Torta' }] } });

  await local.registrarMovimientoLocal(turno.id, 'gasto', 50, 'Cilantro');
  await local.registrarMovimientoLocal(turno.id, 'deposito', 100, 'Más cambio');
  const anulable = await local.registrarMovimientoLocal(turno.id, 'retiro', 300, 'Me equivoqué');
  await local.anularMovimientoLocal(turno.id, anulable.movimientos[0].id, 'Fue un error');

  const t2 = await local.totalesTurnoLocal(turno.id);
  comprobar('cuenta las tres ventas', t2.total_pedidos === 3);
  comprobar('🔒 el efectivo reparte bien la venta dividida (116 + 60 = 176)',
    cerca(t2.total_efectivo, 176));
  comprobar('🔒 y la tarjeta también (200 + 40 = 240)', cerca(t2.total_tarjeta, 240));
  comprobar('la propina en efectivo se registra aparte de la venta',
    cerca(t2.total_propinas_efectivo, 20) && cerca(t2.total_ventas, 416));
  comprobar('🔒 un movimiento ANULADO deja de contar', cerca(t2.total_retiros, 0));
  comprobar('el gasto y el depósito sí cuentan',
    cerca(t2.total_gastos, 50) && cerca(t2.total_depositos, 100));

  // La fórmula NO se reescribe: es la misma que usa la pantalla con cuenta.
  const esperado = utils.efectivoEsperado({
    fondoInicial:     turno.fondo_inicial,
    ventasEfectivo:   t2.total_efectivo,
    propinasEfectivo: t2.total_propinas_efectivo,
    depositos:        t2.total_depositos,
    retiros:          t2.total_retiros,
    gastos:           t2.total_gastos,
  });
  comprobar('el efectivo esperado es 500 + 176 + 20 + 100 − 50 = 746', cerca(esperado, 746));

  const cerrado = await local.cerrarTurnoLocal(turno.id, esperado, 'Todo bien', esperado);
  comprobar('🔒 contando lo que debía haber, LA DIFERENCIA DEL CORTE ES $0',
    cerca(cerrado.diferencia, 0));
  comprobar('los totales quedan CONGELADOS en el turno cerrado',
    cerca(cerrado.total_efectivo, 176) && cerca(cerrado.total_ventas, 416));
  comprobar('el turno cerrado ya no es el activo', (await local.turnoLocalActivo()) === null);

  let lanzo = false;
  try { await local.registrarMovimientoLocal(turno.id, 'gasto', 10, 'tarde'); } catch { lanzo = true; }
  comprobar('🔒 no se aceptan movimientos en un turno ya cerrado', lanzo);

  lanzo = false;
  try { await local.registrarMovimientoLocal(turno.id, 'gasto', -5, 'negativo'); } catch { lanzo = true; }
  comprobar('un monto inválido se rechaza', lanzo);

  const hist = await local.historialTurnosLocales();
  comprobar('el turno aparece en el historial', hist.length === 1 && cerca(hist[0].diferencia, 0));

  console.log('\n── Clientes locales ──');
  const idCliente = await local.guardarClienteLocal({ name: 'Doña Rosa', phone: '5512345678' });
  await local.guardarClienteLocal({ id: idCliente, name: 'Doña Rosa', phone: '5512345678', address: 'Calle 5' });
  const clientes = await local.listarClientesLocales();
  comprobar('se guarda y se edita', clientes.length === 1 && clientes[0].address === 'Calle 5');
  comprobar('nace con su uuid', !!clientes[0].uuid);
  comprobar('🔒 sin cuenta NO hay puntos de fidelidad (los lleva el servidor)',
    clientes[0].in_loyalty === false && clientes[0].loyalty_points === 0);

  console.log('\n── El respaldo ──');
  const respaldo = cargar('src/offline/respaldo.js');
  const copia = await respaldo.armarRespaldo();
  comprobar('lleva el catálogo, los clientes, las ventas y los turnos',
    copia.productos.length > 0 && copia.clientes.length === 1 &&
    copia.pedidos.length === 4 && copia.turnos.length === 1);
  comprobar('🔒 cada fila viaja con su uuid (es lo que permitirá migrar a una cuenta)',
    copia.productos.every(p => !!p.uuid) && copia.pedidos.every(p => !!p.uuid) &&
    copia.clientes.every(c => !!c.uuid));
  comprobar('el resumen cuadra con lo vendido', cerca(copia.resumen.total_vendido, 532));
  comprobar('lleva versión, para que el importador sepa qué está leyendo',
    copia.zenit_respaldo === respaldo.VERSION_RESPALDO);


  console.log('\n── Borrar el negocio local ──');
  await local.borrarNegocioLocal();
  comprobar('se va todo: productos, categorías, ventas, turnos, clientes y ajustes',
    (await local.historialTurnosLocales()).length === 0 &&
    (await local.listarClientesLocales()).length === 0 &&
    (await local.listarProductosLocales()).length === 0 &&
    (await local.listarCategoriasLocales()).length === 0 &&
    (await local.listarPedidosLocales()).length === 0 &&
    Object.keys(await local.leerAjustesLocales()).length === 0);

  // ── Guardas sobre el código: reglas que no se ven desde fuera ─────────────
  console.log('\n── Guardas del BLOQUE 18 ──');
  const dbSrc     = fs.readFileSync(path.join(RAIZ, 'src/offline/db.js'), 'utf8');
  const ventasSrc = fs.readFileSync(path.join(RAIZ, 'src/offline/ventasOffline.js'), 'utf8');

  comprobar('🔒 las tablas locales son SEPARADAS de la caché del servidor',
    /CREATE TABLE IF NOT EXISTS local_productos/.test(dbSrc) &&
    /CREATE TABLE IF NOT EXISTS catalogo_productos/.test(dbSrc));
  comprobar('🔒 una venta local NO entra en la cola de "por subir"',
    /if \(await esModoLocal\(\)\) \{[\s\S]{0,300}?registrarVentaLocal[\s\S]{0,120}?return \{ modo: 'local'/.test(ventasSrc));
  comprobar('🔒 el catálogo local no se le pide al servidor',
    /export async function obtenerCatalogo\(\) \{[\s\S]{0,300}?if \(await esModoLocal\(\)\) return await catalogoLocalAgrupado\(\)/.test(ventasSrc));
  comprobar('🔒 borrar una categoría suelta sus productos en vez de borrarlos',
    /UPDATE local_productos SET categoria_id = NULL WHERE categoria_id = \?/.test(
      fs.readFileSync(path.join(RAIZ, 'src/offline/local.js'), 'utf8')));

  console.log('');
  if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${ok + fallos.length} comprobaciones fallaron:`);
    for (const f of fallos) console.error('   · ' + f);
    process.exit(1);
  }
  console.log(`✅ ${ok}/${ok} comprobaciones en verde.`);
})().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});
