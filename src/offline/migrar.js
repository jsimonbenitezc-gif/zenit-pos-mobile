// ============================================================================
// src/offline/migrar.js — "CREAR CUENTA Y LLEVARME TODO" (BLOQUE 18, Etapa 3)
//
// Aquí es donde el bloque se convierte en dinero. Un negocio que lleva meses
// usando Zenit SIN cuenta crea la suya y se lleva su menú, sus clientes y su
// historial de ventas. Si tuviera que volver a teclear sus 60 productos, no lo
// haría: se quedaría en local para siempre o se iría con otro.
//
// ── LAS TRES REGLAS ────────────────────────────────────────────────────────
//
// 1. 🔴 NO SE BORRA NADA. Lo local queda intacto pase lo que pase. La cuenta
//    nueva es una COPIA; el teléfono sigue teniendo su negocio hasta que la
//    persona decida borrarlo, que es una acción aparte y con doble confirmación
//    (§41.8). Si algo falla a media migración, no se ha perdido nada.
//
// 2. 🔴 SE PUEDE REANUDAR, Y REANUDAR NO DUPLICA. Cada fila subida se anota en
//    `local_migracion` con su `uuid` → id del servidor. Un reintento salta lo ya
//    subido. Sin eso, quedarse sin red a la mitad y volver a intentarlo dejaría
//    el menú duplicado — que es peor que no haber migrado.
//
// 3. 🔴 NINGÚN FALLO DETIENE EL RESTO. Si un producto no sube, se anota y se
//    sigue con los demás. Al final se reporta qué faltó y se puede reintentar
//    solo eso. Es el mismo criterio del §26: un dato imperfecto es mejor que un
//    proceso atascado.
//
// ── EL ORDEN NO ES ARBITRARIO ──────────────────────────────────────────────
// ajustes → categorías → productos → clientes → ventas.
// Los productos necesitan el id real de su categoría; las ventas, el de sus
// productos y su cliente. Por eso el mapa del punto 2 es también la agenda.
//
// ⚠️ LAS VENTAS VIAJAN COMO **VENTAS DIFERIDAS** (§26): con su `client_uuid` y
// su `sold_at` real. Eso es lo que hace que el servidor respete su fecha, su
// precio y su impuesto congelados en vez de recalcularlo todo con los valores de
// hoy. Y como son de hace meses, además hay que pedirle al backend que abra la
// ventana de los 30 días con `import_historico` — que solo concede al DUEÑO.
// ============================================================================
import { initDB } from './db';
import {
  listarProductosLocales, listarCategoriasLocales, listarClientesLocales,
  listarPedidosLocales, leerAjustesLocales,
} from './local';

/** Cuánto historial se sube de una vez. El backend limita ventas por minuto. */
const PAUSA_ENTRE_VENTAS_MS = 60;

// ─── El mapa uuid → id del servidor ─────────────────────────────────────────

async function leerMapa() {
  const db = await initDB();
  const filas = await db.getAllAsync('SELECT uuid, tipo, server_id FROM local_migracion');
  const mapa = new Map();
  for (const f of filas) mapa.set(f.uuid, f.server_id);
  return mapa;
}

async function anotar(uuid, tipo, serverId) {
  const db = await initDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO local_migracion (uuid, tipo, server_id, subido_en) VALUES (?, ?, ?, ?)',
    [uuid, tipo, serverId ?? null, new Date().toISOString()]
  );
}

/** Borra el mapa. Solo para empezar una migración desde cero a propósito. */
export async function olvidarMigracion() {
  const db = await initDB();
  await db.runAsync('DELETE FROM local_migracion');
}

// ─── Qué hay para subir ─────────────────────────────────────────────────────

/**
 * Lo que se va a migrar y lo que ya está subido. Alimenta la pantalla de
 * confirmación: nadie debería empezar esto sin ver cuánto es.
 */
export async function resumenParaMigrar() {
  const [categorias, productos, clientes, pedidos, mapa] = await Promise.all([
    listarCategoriasLocales(),
    listarProductosLocales(),
    listarClientesLocales(),
    listarPedidosLocales(100000),
    leerMapa(),
  ]);
  const pendientes = (lista) => lista.filter((x) => !mapa.has(x.uuid)).length;
  return {
    categorias: categorias.length,
    productos: productos.length,
    clientes: clientes.length,
    ventas: pedidos.length,
    totalVendido: pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0),
    // La venta más antigua decide si hace falta la ventana ampliada.
    desde: pedidos.length ? pedidos[pedidos.length - 1].createdAt : null,
    yaSubido: {
      categorias: categorias.length - pendientes(categorias),
      productos: productos.length - pendientes(productos),
      clientes: clientes.length - pendientes(clientes),
      ventas: pedidos.length - pendientes(pedidos),
    },
  };
}

// ─── La migración ───────────────────────────────────────────────────────────

/**
 * Sube el negocio local a la cuenta que ya está iniciada.
 *
 * ⚠️ La cuenta se crea ANTES, con el registro de siempre (`registerOwner`): esto
 * no registra a nadie. Cuando esta función corre, `api` ya tiene su token.
 *
 * @param {object} api               el cliente HTTP ya autenticado
 * @param {(p:object)=>void} [onPaso] avisa del avance para la barra de progreso
 * @returns {Promise<{ok:boolean, subido:object, fallos:Array}>} NUNCA lanza.
 */
export async function migrarANube(api, onPaso = () => {}) {
  const fallos = [];
  const subido = { categorias: 0, productos: 0, clientes: 0, ventas: 0, ajustes: false };
  const mapa = await leerMapa();

  const avisar = (etapa, hechos, total) => {
    try { onPaso({ etapa, hechos, total }); } catch { /* la UI no puede tumbar esto */ }
  };

  const fallar = (tipo, nombre, e) => {
    fallos.push({ tipo, nombre, error: e?.message || String(e) });
  };

  // ── 1. Ajustes del negocio ────────────────────────────────────────────────
  // Van primero para que el nombre, la moneda, el impuesto y las propinas de la
  // cuenta nueva sean los que el negocio ya venía usando. Un fallo aquí no
  // detiene nada: se puede reconfigurar a mano en Ajustes.
  avisar('ajustes', 0, 1);
  try {
    const aj = (await leerAjustesLocales()) || {};
    if (!mapa.has('__ajustes__')) {
      await api.updateSettings({
        nombre_negocio: aj.business_name || undefined,
        moneda: aj.currency || undefined,
        tax_enabled: aj.tax_enabled,
        tax_rate: aj.tax_rate,
        tax_included: aj.tax_included,
        tax_name: aj.tax_name,
        propinas_activas: aj.propinas_activas,
        propina_sugerencias: aj.propina_sugerencias,
      });
      await anotar('__ajustes__', 'ajustes', null);
    }
    subido.ajustes = true;
  } catch (e) { fallar('ajustes', 'configuración del negocio', e); }

  // ── 2. Categorías ─────────────────────────────────────────────────────────
  const categorias = await listarCategoriasLocales();
  avisar('categorias', 0, categorias.length);
  for (let i = 0; i < categorias.length; i++) {
    const c = categorias[i];
    if (mapa.has(c.uuid)) { subido.categorias++; avisar('categorias', i + 1, categorias.length); continue; }
    try {
      const creada = await api.createCategory({ name: c.name, emoji: c.emoji || null });
      mapa.set(c.uuid, creada.id);
      await anotar(c.uuid, 'categoria', creada.id);
      subido.categorias++;
    } catch (e) { fallar('categoria', c.name, e); }
    avisar('categorias', i + 1, categorias.length);
  }

  // ── 3. Productos ──────────────────────────────────────────────────────────
  // El `category_id` sale del mapa: el id local no significa nada en el servidor.
  const productos = await listarProductosLocales();
  avisar('productos', 0, productos.length);
  const idPorProductoLocal = new Map();   // id LOCAL → id del servidor (lo usan los items)
  for (let i = 0; i < productos.length; i++) {
    const p = productos[i];
    if (mapa.has(p.uuid)) {
      idPorProductoLocal.set(p.id, mapa.get(p.uuid));
      subido.productos++;
      avisar('productos', i + 1, productos.length);
      continue;
    }
    try {
      const catLocal = categorias.find((c) => c.id === p.category_id);
      const creado = await api.createProduct({
        name: p.name,
        price: p.price,
        emoji: p.emoji || null,
        image: p.image || null,
        category_id: catLocal ? (mapa.get(catLocal.uuid) ?? null) : null,
        // El modo local no lleva inventario: sin control de stock, como estaba.
        stock: null,
      });
      mapa.set(p.uuid, creado.id);
      idPorProductoLocal.set(p.id, creado.id);
      await anotar(p.uuid, 'producto', creado.id);
      subido.productos++;
    } catch (e) { fallar('producto', p.name, e); }
    avisar('productos', i + 1, productos.length);
  }

  // ── 4. Clientes ───────────────────────────────────────────────────────────
  const clientes = await listarClientesLocales();
  avisar('clientes', 0, clientes.length);
  const idPorClienteLocal = new Map();
  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i];
    if (mapa.has(c.uuid)) {
      idPorClienteLocal.set(c.id, mapa.get(c.uuid));
      subido.clientes++;
      avisar('clientes', i + 1, clientes.length);
      continue;
    }
    try {
      const creado = await api.createCustomer({ name: c.name, phone: c.phone || null, address: c.address || null });
      mapa.set(c.uuid, creado.id);
      idPorClienteLocal.set(c.id, creado.id);
      await anotar(c.uuid, 'cliente', creado.id);
      subido.clientes++;
    } catch (e) { fallar('cliente', c.name, e); }
    avisar('clientes', i + 1, clientes.length);
  }

  // ── 5. Las ventas ─────────────────────────────────────────────────────────
  // De la más VIEJA a la más nueva, para que el historial se construya en orden.
  const pedidos = (await listarPedidosLocales(100000)).slice().reverse();
  avisar('ventas', 0, pedidos.length);
  for (let i = 0; i < pedidos.length; i++) {
    const ped = pedidos[i];
    if (mapa.has(ped.uuid)) { subido.ventas++; avisar('ventas', i + 1, pedidos.length); continue; }
    try {
      await api.createOrder(_cuerpoDeVenta(ped, idPorProductoLocal, idPorClienteLocal));
      await anotar(ped.uuid, 'pedido', null);
      subido.ventas++;
    } catch (e) {
      fallar('venta', `venta del ${String(ped.createdAt).slice(0, 10)}`, e);
    }
    avisar('ventas', i + 1, pedidos.length);
    // Respiro para no chocar con el limitador de peticiones del backend.
    if (PAUSA_ENTRE_VENTAS_MS) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_VENTAS_MS));
  }

  return { ok: fallos.length === 0, subido, fallos };
}

/**
 * El cuerpo de una venta migrada.
 *
 * ⚠️ ES UNA VENTA DIFERIDA (§26), y de eso depende TODO lo demás: sin
 * `client_uuid` + `sold_at`, el servidor le pone la fecha de hoy y recalcula los
 * precios con el catálogo actual. Y sin `import_historico`, una venta de más de
 * 30 días pierde igualmente la fecha (utils/ventaOffline.js del backend).
 *
 * ⚠️ EL DESCUENTO NO VIAJA, y es a propósito: el backend exige autorizarlo con
 * un descuento configurado o un PIN (§19.14), y en modo local no existe ninguna
 * de las dos cosas — mandarlo daría 403 y perdería la venta entera. En la
 * práctica es cero: el modo local no ofrece descuentos. Si alguno lo trae, se
 * conserva en `notes` para que el número no desaparezca sin dejar rastro.
 */
function _cuerpoDeVenta(ped, idPorProductoLocal, idPorClienteLocal) {
  const items = (ped.items || []).map((it) => ({
    product_id: idPorProductoLocal.get(it.product?.id) ?? null,
    quantity: it.quantity,
    // El precio BASE, sin extras: el backend suma los modificadores (§32).
    unit_price: it.base_unit_price ?? it.unit_price,
    notes: it.notes || null,
  })).filter((it) => it.product_id);

  const descuento = Number(ped.discount_amount) || 0;
  const notaDescuento = descuento > 0
    ? `[migrado] descuento aplicado en el modo local: ${descuento.toFixed(2)}`
    : null;

  return {
    client_uuid: ped.uuid,
    sold_at: ped.createdAt,
    import_historico: true,
    skip_stock_check: true,
    items,
    payment_method: ped.payment_method || 'efectivo',
    ...(Array.isArray(ped.payments) && ped.payments.length > 1 ? { payments: ped.payments } : {}),
    tip_amount: ped.tip_amount || 0,
    tip_method: ped.tip_method || null,
    // Impuesto CONGELADO: se acepta solo en ventas diferidas, y por eso importa
    // que las dos marcas de arriba viajen (§29.7).
    tax_rate: ped.tax_rate ?? undefined,
    tax_included: ped.tax_included ?? undefined,
    order_type: ped.order_type || 'takeout',
    customer_id: idPorClienteLocal.get(ped.customer_id) ?? null,
    notes: [ped.notes, notaDescuento].filter(Boolean).join(' · ') || null,
  };
}
