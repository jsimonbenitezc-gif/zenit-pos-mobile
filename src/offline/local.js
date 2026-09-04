// ============================================================================
// src/offline/local.js — MODO LOCAL (BLOQUE 18, Etapa 1)
// El aparato es la ÚNICA fuente de verdad: no hay cuenta, no hay servidor y
// nada de lo que se guarda aquí sube a ningún lado.
//
// 🔴 TRES REGLAS QUE SOSTIENEN TODO EL BLOQUE (plan V5, BLOQUE 18):
//
// 1. **Estas tablas son SEPARADAS de la caché** (`catalogo_*`). Aquéllas guardan
//    datos del servidor con los ids DEL SERVIDOR; éstas, datos propios con ids
//    propios. Mezclarlas produce el peor error posible: un producto local con el
//    mismo número que uno de la nube y una venta que apunta al equivocado. Un
//    aparato está en UN modo o en el otro, nunca en los dos.
//
// 2. **Cada fila nace con su `uuid`**, además del id de SQLite. El id sirve
//    dentro del aparato; el `uuid` es lo único que sobrevive al viaje cuando el
//    negocio cree su cuenta (Etapa 3): se sube, el servidor devuelve su id real
//    y se arma el mapa. Es gratis ahora e IMPOSIBLE de añadir después.
//
// 3. **Una venta local NO es una venta encolada.** `ventas_pendientes` significa
//    "esto sube en cuanto haya red"; una venta local no sube nunca. Por eso vive
//    en `local_pedidos` y no ahí: si no, el contador de "N por subir" crecería
//    para siempre y el sincronizador intentaría subir ventas de un negocio que
//    el servidor no conoce.
//
// Nada aquí calcula dinero: el impuesto, las propinas, los pagos divididos y los
// extras ya los calcula la pantalla con las fórmulas de `src/utils/` (§29-§32).
// Este archivo solo GUARDA y NUMERA.
// ============================================================================
import * as SecureStore from 'expo-secure-store';
import { initDB } from './db';
import { generarUuid } from '../utils/uuid';

// ─── ¿Este aparato trabaja sin cuenta? ──────────────────────────────────────
// Lo consultan las funciones de venta y de catálogo, que no son componentes de
// React y no pueden leer el AuthContext. Se lee UNA vez de SecureStore y se
// recuerda; `fijarModoLocal` lo actualiza al entrar o salir del modo.
//
// Se prefiere leerlo de SecureStore antes que depender de que alguien llame a
// `fijarModoLocal` a tiempo: si esta bandera se quedara en falso estando en modo
// local, la app le pediría el catálogo a un servidor con el que no tiene cuenta.
let _modoLocal = null; // null = todavía no se sabe

export async function esModoLocal() {
  if (_modoLocal === null) {
    try { _modoLocal = (await SecureStore.getItemAsync('zenit_modo_local')) === 'true'; }
    catch { _modoLocal = false; }
  }
  return _modoLocal;
}

export function fijarModoLocal(valor) {
  _modoLocal = !!valor;
}

// ─── Catálogo propio ────────────────────────────────────────────────────────

/** Categorías del negocio local, en el mismo formato que usa la app. */
export async function listarCategoriasLocales() {
  const db = await initDB();
  const filas = await db.getAllAsync('SELECT * FROM local_categorias ORDER BY orden ASC, nombre ASC');
  return filas.map(_categoriaDeFila);
}

export async function guardarCategoriaLocal({ id, name, emoji }) {
  const db = await initDB();
  if (id) {
    await db.runAsync('UPDATE local_categorias SET nombre = ?, emoji = ? WHERE id = ?',
      [name ?? '', emoji ?? null, id]);
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO local_categorias (uuid, nombre, emoji, orden) VALUES (?, ?, ?, ?)',
    [generarUuid(), name ?? '', emoji ?? null, Date.now()]
  );
  return r.lastInsertRowId;
}

/**
 * Borra una categoría. Sus productos NO se borran: quedan sin categoría, que es
 * lo que casi siempre quiere quien borra una categoría por error. Perder el menú
 * entero por tocar el botón equivocado sería inaceptable en un aparato que no
 * tiene respaldo en la nube.
 */
export async function borrarCategoriaLocal(id) {
  const db = await initDB();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE local_productos SET categoria_id = NULL WHERE categoria_id = ?', [id]);
    await db.runAsync('DELETE FROM local_categorias WHERE id = ?', [id]);
  });
}

export async function listarProductosLocales() {
  const db = await initDB();
  const filas = await db.getAllAsync('SELECT * FROM local_productos ORDER BY nombre ASC');
  return filas.map(_productoDeFila);
}

export async function guardarProductoLocal({ id, name, price, emoji, image, category_id, active }) {
  const db = await initDB();
  const activo = active === false ? 0 : 1;
  if (id) {
    await db.runAsync(
      'UPDATE local_productos SET nombre = ?, precio = ?, emoji = ?, imagen = ?, categoria_id = ?, activo = ? WHERE id = ?',
      [name ?? '', Number(price) || 0, emoji ?? null, image ?? null, category_id ?? null, activo, id]
    );
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO local_productos (uuid, nombre, precio, emoji, imagen, categoria_id, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [generarUuid(), name ?? '', Number(price) || 0, emoji ?? null, image ?? null, category_id ?? null, activo]
  );
  return r.lastInsertRowId;
}

export async function obtenerProductoLocal(id) {
  const db = await initDB();
  const fila = await db.getFirstAsync('SELECT * FROM local_productos WHERE id = ?', [id]);
  return fila ? _productoDeFila(fila) : null;
}

export async function obtenerCategoriaLocal(id) {
  const db = await initDB();
  const fila = await db.getFirstAsync('SELECT * FROM local_categorias WHERE id = ?', [id]);
  return fila ? _categoriaDeFila(fila) : null;
}

export async function borrarProductoLocal(id) {
  const db = await initDB();
  // Los renglones ya vendidos guardan el nombre y el precio copiados, así que el
  // historial sigue leyéndose entero aunque el producto desaparezca del menú.
  await db.runAsync('DELETE FROM local_productos WHERE id = ?', [id]);
}

/**
 * El catálogo en el MISMO formato que devuelve `GET /products/grouped`, para que
 * la pantalla de venta no tenga que saber en qué modo está.
 * Los productos sin categoría van en un grupo "Sin categoría" al final.
 */
export async function catalogoLocalAgrupado() {
  const [cats, prods] = await Promise.all([listarCategoriasLocales(), listarProductosLocales()]);
  const porCategoria = new Map();
  const sueltos = [];
  for (const p of prods) {
    if (!p.active) continue;
    if (p.category_id == null) { sueltos.push(p); continue; }
    if (!porCategoria.has(p.category_id)) porCategoria.set(p.category_id, []);
    porCategoria.get(p.category_id).push(p);
  }
  const grupos = cats.map((c) => ({
    id: c.id, name: c.name, emoji: c.emoji, image: null,
    products: porCategoria.get(c.id) ?? [],
  }));
  if (sueltos.length) {
    grupos.push({ id: null, name: 'Sin categoría', emoji: null, image: null, products: sueltos });
  }
  return grupos;
}

// ─── Ventas ─────────────────────────────────────────────────────────────────

/**
 * Guarda una venta local. Recibe el MISMO `orderBody` que se le mandaría al
 * backend, así que la pantalla de venta no cambia sus cálculos: el total, el
 * impuesto, la propina y el reparto de pagos ya vienen resueltos con las
 * fórmulas de `src/utils/` (§29-§32).
 *
 * @param {object} orderBody  cuerpo del pedido (items, total, impuesto, propina…)
 * @param {object} meta       datos de display: { total, resumen: { items: [{name, quantity}] } }
 * @returns {Promise<object>} el pedido guardado, con la forma que espera el ticket
 */
export async function registrarVentaLocal(orderBody, meta = {}) {
  const db = await initDB();
  const uuid = orderBody.client_uuid || generarUuid();
  const fecha = orderBody.sold_at || new Date().toISOString();
  const items = Array.isArray(orderBody.items) ? orderBody.items : [];

  let pedidoId = null;
  await db.withTransactionAsync(async () => {
    const r = await db.runAsync(
      `INSERT INTO local_pedidos
         (uuid, fecha, total, subtotal, impuesto, tasa_impuesto, impuesto_incluido,
          propina, propina_metodo, descuento, metodo_pago, pagos_json, tipo, notas,
          cliente_id, turno_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        fecha,
        Number(orderBody.total) || 0,
        orderBody.subtotal == null ? null : Number(orderBody.subtotal),
        Number(orderBody.tax_amount) || 0,
        orderBody.tax_rate == null ? null : Number(orderBody.tax_rate),
        orderBody.tax_included === true ? 1 : (orderBody.tax_included === false ? 0 : null),
        Number(orderBody.tip_amount) || 0,
        orderBody.tip_method || null,
        Number(orderBody.discount_amount) || 0,
        orderBody.payment_method || 'efectivo',
        Array.isArray(orderBody.payments) && orderBody.payments.length
          ? JSON.stringify(orderBody.payments) : null,
        orderBody.order_type || 'takeout',
        orderBody.notes || null,
        orderBody.customer_id ?? null,
        // El turno se resuelve AQUÍ y no en la pantalla: así toda venta local
        // queda atada al turno abierto sin que la caja tenga que acordarse.
        (await turnoLocalActivo())?.id ?? null,
      ]
    );
    pedidoId = r.lastInsertRowId;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // El NOMBRE se copia, no se referencia: si mañana borran el producto, el
      // ticket de hace un mes tiene que seguir diciendo qué se vendió.
      const nombre = meta.resumen?.items?.[i]?.name || 'Producto';
      await db.runAsync(
        `INSERT INTO local_pedido_items
           (pedido_id, producto_id, nombre, cantidad, precio_unitario, precio_base, modificadores_json, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pedidoId,
          it.product_id ?? null,
          nombre,
          Number(it.quantity) || 1,
          _precioCobrado(it),
          it.base_unit_price == null ? null : Number(it.base_unit_price),
          Array.isArray(it.modifiers) && it.modifiers.length ? JSON.stringify(it.modifiers) : null,
          it.notes || null,
        ]
      );
    }
  });

  return await obtenerPedidoLocal(pedidoId);
}

/** Precio realmente cobrado por unidad: base + los extras elegidos (§32). */
function _precioCobrado(item) {
  const base = parseFloat(item.base_unit_price ?? item.unit_price) || 0;
  const extras = (item.modifiers || []).reduce((s, m) => s + (parseFloat(m.price_delta) || 0), 0);
  return base + extras;
}

/** Últimas ventas locales, con la forma que espera la pantalla de Pedidos. */
export async function listarPedidosLocales(limite = 100) {
  const db = await initDB();
  const filas = await db.getAllAsync(
    'SELECT * FROM local_pedidos ORDER BY fecha DESC LIMIT ?', [limite]
  );
  const conItems = [];
  for (const f of filas) conItems.push(await _pedidoConItems(db, f));
  return conItems;
}

export async function obtenerPedidoLocal(id) {
  const db = await initDB();
  const fila = await db.getFirstAsync('SELECT * FROM local_pedidos WHERE id = ?', [id]);
  if (!fila) return null;
  return await _pedidoConItems(db, fila);
}

/** Totales del día local (para el aviso de la Etapa 2 y el resumen en pantalla). */
export async function totalesDelDiaLocal() {
  const db = await initDB();
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const fila = await db.getFirstAsync(
    'SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM local_pedidos WHERE fecha >= ?',
    [desde.toISOString()]
  );
  return { ventas: fila?.n ?? 0, total: fila?.total ?? 0 };
}

async function _pedidoConItems(db, fila) {
  const items = await db.getAllAsync(
    'SELECT * FROM local_pedido_items WHERE pedido_id = ? ORDER BY id ASC', [fila.id]
  );
  return {
    id: fila.id,
    uuid: fila.uuid,
    createdAt: fila.fecha,
    status: 'completado',
    total: fila.total,
    subtotal: fila.subtotal,
    tax_amount: fila.impuesto,
    tax_rate: fila.tasa_impuesto,
    tax_included: fila.impuesto_incluido == null ? null : fila.impuesto_incluido === 1,
    tip_amount: fila.propina,
    tip_method: fila.propina_metodo,
    discount_amount: fila.descuento,
    payment_method: fila.metodo_pago,
    payments: _parse(fila.pagos_json) || [],
    order_type: fila.tipo,
    notes: fila.notas,
    customer_id: fila.cliente_id,
    turno_id: fila.turno_id,
    _local: true,
    items: items.map((it) => ({
      id: it.id,
      quantity: it.cantidad,
      unit_price: it.precio_unitario,
      base_unit_price: it.precio_base,
      modifiers: _parse(it.modificadores_json) || [],
      notes: it.notas,
      name: it.nombre,
      product: { id: it.producto_id, name: it.nombre },
    })),
  };
}

// ─── Ajustes del negocio local ──────────────────────────────────────────────
// Van en su PROPIA clave y no en la que cachea los ajustes del servidor (§40):
// son de negocios distintos y confundirlos haría que un equipo que alguna vez
// tuvo cuenta arrastrara la configuración de aquélla al modo local.

export async function leerAjustesLocales() {
  const db = await initDB();
  const fila = await db.getFirstAsync("SELECT valor_json FROM sesion_local WHERE clave = 'ajustes_local'");
  return _parse(fila?.valor_json) || {};
}

export async function guardarAjustesLocales(parciales) {
  const db = await initDB();
  const actuales = await leerAjustesLocales();
  const nuevos = { ...actuales, ...(parciales || {}) };
  await db.runAsync(
    'INSERT OR REPLACE INTO sesion_local (clave, valor_json, guardado_en) VALUES (?, ?, ?)',
    ['ajustes_local', JSON.stringify(nuevos), new Date().toISOString()]
  );
  return nuevos;
}

/** ¿Ya hay algo capturado? Sirve para saber si mostrar la ayuda de "empieza aquí". */
export async function hayCatalogoLocal() {
  const db = await initDB();
  const fila = await db.getFirstAsync('SELECT COUNT(*) AS n FROM local_productos');
  return (fila?.n ?? 0) > 0;
}

/**
 * Borra TODO el negocio local. Solo se llama desde "salir del modo local", y la
 * pantalla tiene que advertirlo con todas sus letras: aquí no hay respaldo en la
 * nube que lo recupere.
 */
export async function borrarNegocioLocal() {
  const db = await initDB();
  await db.execAsync(`
    DELETE FROM local_pedido_items;
    DELETE FROM local_pedidos;
    DELETE FROM local_productos;
    DELETE FROM local_categorias;
    DELETE FROM local_movimientos;
    DELETE FROM local_turnos;
    DELETE FROM local_clientes;
    DELETE FROM sesion_local WHERE clave = 'ajustes_local';
  `);
}

function _categoriaDeFila(c) {
  return { id: c.id, uuid: c.uuid, name: c.nombre, emoji: c.emoji, _local: true };
}

function _productoDeFila(p) {
  return {
    id: p.id,
    uuid: p.uuid,
    name: p.nombre,
    price: p.precio,
    emoji: p.emoji,
    image: p.imagen || null,
    stock: null,          // el modo local no lleva inventario (es de la versión con cuenta)
    category_id: p.categoria_id,
    active: p.activo === 1,
    _local: true,
  };
}

function _parse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — TURNO DE CAJA, MOVIMIENTOS Y CLIENTES
//
// El corte de caja es lo que separa "una calculadora bonita" de un punto de
// venta: sin él, el cajero cobra todo el día y nadie puede cuadrar el cajón.
//
// ⚠️ La fórmula del efectivo esperado NO se reescribe aquí: la pantalla usa
// `efectivoEsperado()` de `src/utils/propinas.js`, que ya es el espejo del §28 y
// del §30 y el que usa el modo con cuenta. Si se copiara, un día se desviaría y
// el cajero vería un número al contar el dinero y otro al confirmar.
// ════════════════════════════════════════════════════════════════════════════

/** Turno abierto ahora mismo, o null. */
export async function turnoLocalActivo() {
  const db = await initDB();
  const fila = await db.getFirstAsync(
    'SELECT * FROM local_turnos WHERE cierre IS NULL ORDER BY id DESC LIMIT 1'
  );
  return fila ? _turnoDeFila(fila) : null;
}

export async function abrirTurnoLocal(cajero, fondoInicial = 0) {
  const abierto = await turnoLocalActivo();
  if (abierto) return abierto;   // ya hay uno: nunca dos turnos a la vez
  const db = await initDB();
  const r = await db.runAsync(
    'INSERT INTO local_turnos (uuid, cajero, apertura, fondo_inicial) VALUES (?, ?, ?, ?)',
    [generarUuid(), cajero || 'Cajero', new Date().toISOString(), Number(fondoInicial) || 0]
  );
  const fila = await db.getFirstAsync('SELECT * FROM local_turnos WHERE id = ?', [r.lastInsertRowId]);
  return _turnoDeFila(fila);
}

/**
 * Totales del turno: ventas por método REAL de pago, propinas e impuesto.
 *
 * ⚠️ El reparto por método mira PRIMERO los pagos divididos y solo cae al método
 * único del pedido cuando no hay ninguno (§31, regla §19.24). Leer `metodo_pago`
 * a secas repartiría mal toda venta cobrada con dos métodos, y el corte le
 * exigiría al cajero un efectivo que nunca entró al cajón.
 */
export async function totalesTurnoLocal(turnoId) {
  const db = await initDB();
  const turno = await db.getFirstAsync('SELECT * FROM local_turnos WHERE id = ?', [turnoId]);
  if (!turno) return null;

  const pedidos = await db.getAllAsync(
    'SELECT * FROM local_pedidos WHERE fecha >= ? AND (? IS NULL OR fecha <= ?)',
    [turno.apertura, turno.cierre, turno.cierre]
  );

  const t = {
    total_pedidos: pedidos.length,
    total_ventas: 0,
    total_efectivo: 0, total_tarjeta: 0, total_transferencia: 0,
    total_impuesto: 0,
    total_propinas: 0,
    total_propinas_efectivo: 0, total_propinas_tarjeta: 0, total_propinas_transferencia: 0,
  };
  const sumarVenta = (metodo, monto) => {
    t[`total_${_metodo(metodo)}`] += Number(monto) || 0;
  };
  const sumarPropina = (metodo, monto) => {
    const valor = Number(monto) || 0;
    t[`total_propinas_${_metodo(metodo)}`] += valor;
    t.total_propinas += valor;
  };

  for (const p of pedidos) {
    t.total_ventas   += Number(p.total) || 0;
    t.total_impuesto += Number(p.impuesto) || 0;
    const pagos = _parse(p.pagos_json);
    if (Array.isArray(pagos) && pagos.length) {
      for (const pago of pagos) {
        sumarVenta(pago.method, pago.amount);
        if (pago.tip_amount) sumarPropina(pago.method, pago.tip_amount);
      }
      // Propina anotada en el pedido pero no dentro de ningún pago: se atribuye
      // a su propio método, que puede diferir del de la cuenta (§30).
      const enPagos = pagos.reduce((s, x) => s + (Number(x.tip_amount) || 0), 0);
      const resto = (Number(p.propina) || 0) - enPagos;
      if (resto > 0.004) sumarPropina(p.propina_metodo || p.metodo_pago, resto);
    } else {
      sumarVenta(p.metodo_pago, p.total);
      if (p.propina) sumarPropina(p.propina_metodo || p.metodo_pago, p.propina);
    }
  }

  return { ...t, ...(await totalesMovimientosLocal(turnoId)) };
}

function _metodo(m) {
  const v = String(m || 'efectivo').toLowerCase();
  return ['efectivo', 'tarjeta', 'transferencia'].includes(v) ? v : 'efectivo';
}

/** Totales de movimientos del turno. Los ANULADOS no cuentan (§28). */
export async function totalesMovimientosLocal(turnoId) {
  const db = await initDB();
  const filas = await db.getAllAsync(
    'SELECT tipo, SUM(monto) AS suma FROM local_movimientos WHERE turno_id = ? AND anulado = 0 GROUP BY tipo',
    [turnoId]
  );
  const t = { total_depositos: 0, total_retiros: 0, total_gastos: 0 };
  for (const f of filas) {
    if (f.tipo === 'deposito') t.total_depositos = f.suma || 0;
    if (f.tipo === 'retiro')   t.total_retiros   = f.suma || 0;
    if (f.tipo === 'gasto')    t.total_gastos    = f.suma || 0;
  }
  return t;
}

export async function movimientosTurnoLocal(turnoId) {
  const db = await initDB();
  const filas = await db.getAllAsync(
    'SELECT * FROM local_movimientos WHERE turno_id = ? ORDER BY id DESC', [turnoId]
  );
  return {
    movimientos: filas.map((m) => ({
      id: m.id, tipo: m.tipo, monto: m.monto, motivo: m.motivo,
      createdAt: m.fecha, anulado: m.anulado === 1,
      motivo_anulacion: m.motivo_anulacion,
      employee_name: '',
    })),
    totales: await totalesMovimientosLocal(turnoId),
  };
}

/** Registra un movimiento. Un monto inválido se rechaza (§28.8). */
export async function registrarMovimientoLocal(turnoId, tipo, monto, motivo) {
  const valor = Number(monto);
  if (!isFinite(valor) || valor <= 0 || valor > 1000000) {
    throw new Error('El monto no es válido.');
  }
  if (!['retiro', 'gasto', 'deposito'].includes(tipo)) {
    throw new Error('Tipo de movimiento no válido.');
  }
  // Igual que el backend: en un turno cerrado el corte ya se leyó, y cambiarlo
  // después descuadraría un reporte que alguien ya dio por bueno (§28.6).
  const turno = await turnoLocalActivo();
  if (!turno || turno.id !== turnoId) {
    throw new Error('No se pueden registrar movimientos en un turno cerrado.');
  }
  const db = await initDB();
  await db.runAsync(
    'INSERT INTO local_movimientos (uuid, turno_id, tipo, monto, motivo, fecha) VALUES (?, ?, ?, ?, ?, ?)',
    [generarUuid(), turnoId, tipo, valor, motivo || null, new Date().toISOString()]
  );
  return await movimientosTurnoLocal(turnoId);
}

/** Anula un movimiento: sigue visible y deja de contar. NUNCA se borra (§28.5). */
export async function anularMovimientoLocal(turnoId, movimientoId, motivo) {
  const turno = await turnoLocalActivo();
  if (!turno || turno.id !== turnoId) {
    throw new Error('No se pueden anular movimientos de un turno cerrado.');
  }
  const db = await initDB();
  await db.runAsync(
    'UPDATE local_movimientos SET anulado = 1, motivo_anulacion = ? WHERE id = ? AND turno_id = ?',
    [motivo || null, movimientoId, turnoId]
  );
  return await movimientosTurnoLocal(turnoId);
}

/**
 * Cierra el turno CONGELANDO sus totales (§28.6).
 * @param {number} esperado  el efectivo que debía haber, calculado por la
 *   pantalla con `efectivoEsperado()`. Se recibe en vez de recalcularlo aquí
 *   para que la diferencia guardada sea EXACTAMENTE la que el cajero vio.
 */
export async function cerrarTurnoLocal(turnoId, efectivoContado, notas, esperado) {
  const db = await initDB();
  const t = await totalesTurnoLocal(turnoId);
  const contado = Number(efectivoContado) || 0;
  await db.runAsync(
    `UPDATE local_turnos SET
       cierre = ?, efectivo_contado = ?, diferencia = ?, notas = ?,
       total_pedidos = ?, total_ventas = ?, total_efectivo = ?, total_tarjeta = ?,
       total_transferencia = ?, total_propinas = ?, total_propinas_efectivo = ?,
       total_impuesto = ?, total_depositos = ?, total_retiros = ?, total_gastos = ?
     WHERE id = ?`,
    [
      new Date().toISOString(), contado, contado - (Number(esperado) || 0), notas || null,
      t.total_pedidos, t.total_ventas, t.total_efectivo, t.total_tarjeta,
      t.total_transferencia, t.total_propinas, t.total_propinas_efectivo,
      t.total_impuesto, t.total_depositos, t.total_retiros, t.total_gastos,
      turnoId,
    ]
  );
  const fila = await db.getFirstAsync('SELECT * FROM local_turnos WHERE id = ?', [turnoId]);
  return _turnoDeFila(fila);
}

export async function historialTurnosLocales(limite = 30) {
  const db = await initDB();
  const filas = await db.getAllAsync(
    'SELECT * FROM local_turnos WHERE cierre IS NOT NULL ORDER BY cierre DESC LIMIT ?', [limite]
  );
  return filas.map(_turnoDeFila);
}

function _turnoDeFila(t) {
  return {
    id: t.id, uuid: t.uuid,
    cajero_nombre: t.cajero,
    apertura: t.apertura, cierre: t.cierre,
    fondo_inicial: t.fondo_inicial,
    efectivo_contado: t.efectivo_contado,
    diferencia: t.diferencia,
    notas: t.notas,
    total_pedidos: t.total_pedidos, total_ventas: t.total_ventas,
    total_efectivo: t.total_efectivo, total_tarjeta: t.total_tarjeta,
    total_transferencia: t.total_transferencia,
    total_propinas: t.total_propinas,
    total_propinas_efectivo: t.total_propinas_efectivo,
    total_impuesto: t.total_impuesto,
    total_depositos: t.total_depositos, total_retiros: t.total_retiros,
    total_gastos: t.total_gastos,
    _local: true,
  };
}

// ─── Clientes locales ───────────────────────────────────────────────────────
// Sin puntos de fidelidad: los puntos son de la versión con cuenta, donde el
// servidor los descuenta dentro de la MISMA transacción de la venta (§13).

export async function listarClientesLocales() {
  const db = await initDB();
  const filas = await db.getAllAsync('SELECT * FROM local_clientes ORDER BY nombre ASC');
  return filas.map(_clienteDeFila);
}

export async function guardarClienteLocal({ id, name, phone, address }) {
  const db = await initDB();
  if (id) {
    await db.runAsync(
      'UPDATE local_clientes SET nombre = ?, telefono = ?, direccion = ? WHERE id = ?',
      [name ?? '', phone || null, address || null, id]
    );
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO local_clientes (uuid, nombre, telefono, direccion) VALUES (?, ?, ?, ?)',
    [generarUuid(), name ?? '', phone || null, address || null]
  );
  return r.lastInsertRowId;
}

export async function obtenerClienteLocal(id) {
  const db = await initDB();
  const fila = await db.getFirstAsync('SELECT * FROM local_clientes WHERE id = ?', [id]);
  return fila ? _clienteDeFila(fila) : null;
}

function _clienteDeFila(c) {
  return {
    id: c.id, uuid: c.uuid,
    name: c.nombre, phone: c.telefono, address: c.direccion,
    in_loyalty: false, loyalty_points: 0,
    _local: true,
  };
}
