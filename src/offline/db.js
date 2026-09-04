// ============================================================================
// src/offline/db.js — Base de datos local (expo-sqlite) para el modo offline.
// FASE 1: caché del catálogo (para vender sin red) + cola de ventas pendientes.
//
// Usa la API async de expo-sqlite (SDK 54): openDatabaseAsync / execAsync /
// runAsync / getAllAsync / getFirstAsync.
//
// Nada aquí bloquea la venta: si algo falla, se loguea y se sigue.
// ============================================================================
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'zenit-offline.db';

// Init perezoso y único: initDB() puede llamarse varias veces; abre/crea una sola vez.
let _dbPromise = null;

async function _abrir() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS catalogo_categorias (
      id       INTEGER PRIMARY KEY,
      nombre   TEXT,
      emoji    TEXT,
      imagen   TEXT,
      orden    INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalogo_productos (
      id           INTEGER PRIMARY KEY,
      categoria_id INTEGER,
      nombre       TEXT,
      descripcion  TEXT,
      precio       REAL,
      stock        REAL,
      emoji        TEXT,
      imagen       TEXT,
      activo       INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS catalogo_clientes (
      id           INTEGER PRIMARY KEY,
      nombre       TEXT,
      telefono     TEXT,
      direccion    TEXT,
      en_fidelidad INTEGER DEFAULT 0,
      puntos       INTEGER DEFAULT 0
    );
    -- Biblioteca de modificadores (BLOQUE 11). Se cachea entera para poder
    -- armar un carrito con extras sin internet, igual que el catálogo.
    -- Los ids son los del BACKEND: la venta encolada guarda el option_id real,
    -- que es lo que el servidor necesita para resolverla al subir.
    CREATE TABLE IF NOT EXISTS catalogo_modificadores (
      id           INTEGER PRIMARY KEY,
      payload_json TEXT NOT NULL
    );
    -- ── MODO LOCAL (BLOQUE 18) ───────────────────────────────────────────
    -- El negocio SIN CUENTA. Ids propios y un uuid por fila (el uuid es lo que
    -- sobrevive si algún día crea su cuenta y se lleva todo).
    -- 🔴 SEPARADAS de las tablas catalogo_* a propósito: aquéllas guardan datos
    -- del servidor con los ids DEL SERVIDOR. Mezclarlas haría que una venta
    -- apuntara al producto equivocado. Un aparato está en un modo o en el otro.
    CREATE TABLE IF NOT EXISTS local_categorias (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid   TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      emoji  TEXT,
      orden  INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_productos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid         TEXT NOT NULL UNIQUE,
      nombre       TEXT NOT NULL,
      precio       REAL NOT NULL DEFAULT 0,
      emoji        TEXT,
      imagen       TEXT,
      categoria_id INTEGER,
      activo       INTEGER NOT NULL DEFAULT 1
    );
    -- Una venta local NO sube nunca, así que NO va en ventas_pendientes (que
    -- significa "esto se sube en cuanto haya red"). Ver el comentario de local.js.
    CREATE TABLE IF NOT EXISTS local_pedidos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid              TEXT NOT NULL UNIQUE,
      fecha             TEXT NOT NULL,
      total             REAL NOT NULL DEFAULT 0,
      subtotal          REAL,
      impuesto          REAL NOT NULL DEFAULT 0,
      tasa_impuesto     REAL,
      impuesto_incluido INTEGER,
      propina           REAL NOT NULL DEFAULT 0,
      propina_metodo    TEXT,
      descuento         REAL NOT NULL DEFAULT 0,
      metodo_pago       TEXT NOT NULL DEFAULT 'efectivo',
      pagos_json        TEXT,
      tipo              TEXT,
      notas             TEXT,
      cliente_id        INTEGER,
      turno_id          INTEGER
    );
    CREATE TABLE IF NOT EXISTS local_pedido_items (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id          INTEGER NOT NULL,
      producto_id        INTEGER,
      nombre             TEXT NOT NULL,
      cantidad           REAL NOT NULL DEFAULT 1,
      precio_unitario    REAL NOT NULL DEFAULT 0,
      precio_base        REAL,
      modificadores_json TEXT,
      notas              TEXT
    );
    -- Turno de caja local (Etapa 2). Es lo que separa "una calculadora bonita"
    -- de un punto de venta: sin corte, el cajero cobra todo el día y nadie puede
    -- cuadrar el cajón. Los totales se CONGELAN al cerrar, igual que en el
    -- backend (§28): un corte ya leído no puede cambiar después.
    CREATE TABLE IF NOT EXISTS local_turnos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid              TEXT NOT NULL UNIQUE,
      cajero            TEXT,
      apertura          TEXT NOT NULL,
      cierre            TEXT,
      fondo_inicial     REAL NOT NULL DEFAULT 0,
      efectivo_contado  REAL,
      diferencia        REAL,
      notas             TEXT,
      total_pedidos     INTEGER,
      total_ventas      REAL,
      total_efectivo    REAL,
      total_tarjeta     REAL,
      total_transferencia REAL,
      total_propinas    REAL,
      total_propinas_efectivo REAL,
      total_impuesto    REAL,
      total_depositos   REAL,
      total_retiros     REAL,
      total_gastos      REAL
    );
    -- Dinero que entra o sale del cajón por fuera de las ventas (§28).
    -- NUNCA se borra: un movimiento equivocado se ANULA y deja de contar.
    CREATE TABLE IF NOT EXISTS local_movimientos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid      TEXT NOT NULL UNIQUE,
      turno_id  INTEGER NOT NULL,
      tipo      TEXT NOT NULL,          -- retiro | gasto | deposito
      monto     REAL NOT NULL,
      motivo    TEXT,
      fecha     TEXT NOT NULL,
      anulado   INTEGER NOT NULL DEFAULT 0,
      motivo_anulacion TEXT
    );
    CREATE TABLE IF NOT EXISTS local_clientes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid      TEXT NOT NULL UNIQUE,
      nombre    TEXT NOT NULL,
      telefono  TEXT,
      direccion TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_local_pedidos_fecha ON local_pedidos (fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_local_items_pedido ON local_pedido_items (pedido_id);
    CREATE INDEX IF NOT EXISTS idx_local_movs_turno ON local_movimientos (turno_id);
    -- Sesión local: lo mínimo para ARRANCAR sin internet (perfil del usuario y
    -- ajustes del negocio, incluidos los puestos). Va en SQLite y no en
    -- SecureStore porque permisos_roles + el logo pasan de largo el límite
    -- práctico de SecureStore (~2 KB). Guarda los MISMOS hashes de PIN que ya
    -- viajan en GET /api/settings — no expone nada nuevo, y es exactamente lo
    -- que el desktop guarda en su propia SQLite.
    -- Guarda además los ajustes del negocio SIN cuenta, bajo 'ajustes_local'.
    CREATE TABLE IF NOT EXISTS sesion_local (
      clave      TEXT PRIMARY KEY,
      valor_json TEXT NOT NULL,
      guardado_en TEXT
    );
    CREATE TABLE IF NOT EXISTS ventas_pendientes (
      client_uuid  TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      estado       TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | subida | error
      creada_en    TEXT NOT NULL,
      intentos     INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      total        REAL,
      resumen_json TEXT
    );
  `);
  // Migración para BDs ya creadas antes de agregar estas columnas de display.
  for (const col of ['total REAL', 'resumen_json TEXT']) {
    try { await db.execAsync(`ALTER TABLE ventas_pendientes ADD COLUMN ${col};`); } catch { /* ya existe */ }
  }
  // Etapa 2 del modo local sobre una base creada en la Etapa 1.
  for (const col of ['cliente_id INTEGER', 'turno_id INTEGER']) {
    try { await db.execAsync(`ALTER TABLE local_pedidos ADD COLUMN ${col};`); } catch { /* ya existe */ }
  }
  return db;
}

/** Inicializa (o reutiliza) la BD local. Devuelve el handle de la BD. */
export function initDB() {
  if (!_dbPromise) {
    _dbPromise = _abrir().catch((e) => {
      // Si falla la apertura, resetear para reintentar la próxima vez.
      _dbPromise = null;
      console.warn('[offline/db] Error abriendo la BD local:', e?.message);
      throw e;
    });
  }
  return _dbPromise;
}

// ─── CATÁLOGO (caché de solo lectura para vender offline) ───────────────────

/**
 * Reemplaza el catálogo cacheado con lo que venga del backend.
 * @param {Array} categorias  [{ id, nombre, emoji, imagen, productos: [{...}] }]
 */
export async function guardarCatalogo(categorias) {
  if (!Array.isArray(categorias)) return;
  const db = await initDB();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM catalogo_categorias; DELETE FROM catalogo_productos;');
    let ordenCat = 0;
    for (const cat of categorias) {
      await db.runAsync(
        'INSERT OR REPLACE INTO catalogo_categorias (id, nombre, emoji, imagen, orden) VALUES (?, ?, ?, ?, ?)',
        [cat.id, cat.nombre ?? cat.name ?? '', cat.emoji ?? null, cat.imagen ?? cat.image ?? null, ordenCat++]
      );
      const productos = cat.productos ?? cat.products ?? [];
      for (const p of productos) {
        await db.runAsync(
          `INSERT OR REPLACE INTO catalogo_productos
             (id, categoria_id, nombre, descripcion, precio, stock, emoji, imagen, activo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            cat.id,
            p.nombre ?? p.name ?? '',
            p.descripcion ?? p.description ?? null,
            Number(p.precio ?? p.price ?? 0),
            p.stock == null ? null : Number(p.stock),
            p.emoji ?? null,
            p.imagen ?? p.image ?? null,
            (p.activo ?? p.active ?? true) ? 1 : 0,
          ]
        );
      }
    }
  });
}

/**
 * Lee el catálogo cacheado en el MISMO formato que devuelve GET /products/grouped
 * (campos en inglés: { id, name, emoji, products: [{ id, name, price, image, active }] }),
 * para que obtenerCatalogo() sea un reemplazo directo de api.getProductsGrouped().
 */
export async function leerCatalogo() {
  const db = await initDB();
  const cats = await db.getAllAsync('SELECT * FROM catalogo_categorias ORDER BY orden ASC');
  const prods = await db.getAllAsync('SELECT * FROM catalogo_productos ORDER BY nombre ASC');
  const porCategoria = new Map();
  for (const p of prods) {
    if (!porCategoria.has(p.categoria_id)) porCategoria.set(p.categoria_id, []);
    porCategoria.get(p.categoria_id).push({
      id: p.id,
      name: p.nombre,
      description: p.descripcion,
      price: p.precio,
      stock: p.stock,
      emoji: p.emoji,
      image: p.imagen,
      active: p.activo === 1,
      category_id: p.categoria_id,
    });
  }
  return cats.map((c) => ({
    id: c.id,
    name: c.nombre,
    emoji: c.emoji,
    image: c.imagen,
    products: porCategoria.get(c.id) ?? [],
  }));
}

// ─── MODIFICADORES (BLOQUE 11) ─────────────────────────────────────────────
// Se guarda el catálogo COMPLETO como un solo JSON, no normalizado en tablas:
// son unas decenas de filas de texto, se reemplaza entero en cada sync y se lee
// entero al armar el carrito. Normalizarlo sería trabajo sin ninguna consulta
// que lo aproveche.

/** Reemplaza el catálogo de modificadores cacheado. */
export async function guardarCatalogoModificadores(catalogo) {
  if (!catalogo || !Array.isArray(catalogo.groups)) return;
  const db = await initDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO catalogo_modificadores (id, payload_json) VALUES (1, ?)',
    [JSON.stringify({ groups: catalogo.groups, product_groups: catalogo.product_groups || [] })]
  );
}

/**
 * El catálogo cacheado, en el MISMO formato que devuelve GET /api/modifiers.
 * Sin caché (o con un JSON roto) devuelve un catálogo vacío: la venta sigue
 * funcionando, simplemente sin ofrecer extras.
 */
export async function leerCatalogoModificadores() {
  try {
    const db = await initDB();
    const row = await db.getFirstAsync('SELECT payload_json FROM catalogo_modificadores WHERE id = 1');
    if (!row?.payload_json) return { groups: [], product_groups: [] };
    const parsed = JSON.parse(row.payload_json);
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      product_groups: Array.isArray(parsed.product_groups) ? parsed.product_groups : [],
    };
  } catch (e) {
    console.warn('[offline/db] Catálogo de modificadores:', e?.message);
    return { groups: [], product_groups: [] };
  }
}

/** ¿Hay catálogo cacheado? (para decidir si podemos operar offline) */
export async function hayCatalogoCacheado() {
  const db = await initDB();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS n FROM catalogo_productos');
  return (row?.n ?? 0) > 0;
}

// ─── CLIENTES (caché de solo lectura para elegirlos offline) ────────────────

export async function guardarClientes(clientes) {
  if (!Array.isArray(clientes)) return;
  const db = await initDB();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM catalogo_clientes;');
    for (const c of clientes) {
      await db.runAsync(
        'INSERT OR REPLACE INTO catalogo_clientes (id, nombre, telefono, direccion, en_fidelidad, puntos) VALUES (?, ?, ?, ?, ?, ?)',
        [
          c.id,
          c.nombre ?? c.name ?? '',
          c.telefono ?? c.phone ?? null,
          c.direccion ?? c.address ?? null,
          (c.en_fidelidad ?? c.in_loyalty) ? 1 : 0,
          Number(c.puntos ?? c.loyalty_points ?? 0),
        ]
      );
    }
  });
}

/** Lee clientes cacheados en el formato del backend (name, phone, address, in_loyalty, loyalty_points). */
export async function leerClientes() {
  const db = await initDB();
  const rows = await db.getAllAsync('SELECT * FROM catalogo_clientes ORDER BY nombre ASC');
  return rows.map((c) => ({
    id: c.id,
    name: c.nombre,
    phone: c.telefono,
    address: c.direccion,
    in_loyalty: c.en_fidelidad === 1,
    loyalty_points: c.puntos,
  }));
}

// ─── COLA DE VENTAS PENDIENTES ──────────────────────────────────────────────

/**
 * Encola una venta (payload = el orderBody que se manda a POST /api/orders).
 * @param {object} meta  Datos para mostrar en Pedidos sin depender del backend:
 *                       { total, resumen: { items: [{name, quantity}], payment_method } }
 */
export async function encolarVenta(clientUuid, payload, meta = {}) {
  const db = await initDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO ventas_pendientes (client_uuid, payload_json, estado, creada_en, intentos, total, resumen_json) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [
      clientUuid,
      JSON.stringify(payload),
      'pendiente',
      new Date().toISOString(),
      meta.total == null ? null : Number(meta.total),
      meta.resumen ? JSON.stringify(meta.resumen) : null,
    ]
  );
}

/**
 * Devuelve las ventas offline aún NO subidas (pendiente/error) como objetos con
 * forma de "pedido", listos para mostrar en la pantalla de Pedidos.
 */
export async function obtenerVentasParaMostrar() {
  const db = await initDB();
  const rows = await db.getAllAsync(
    "SELECT * FROM ventas_pendientes WHERE estado IN ('pendiente','error') ORDER BY creada_en DESC"
  );
  return rows.map((r) => {
    const resumen = _parse(r.resumen_json) || {};
    const payload = _parse(r.payload_json) || {};
    const items = Array.isArray(resumen.items) ? resumen.items : [];
    return {
      id: 'off-' + String(r.client_uuid).slice(0, 8),
      createdAt: r.creada_en,
      payment_method: resumen.payment_method || payload.payment_method || 'efectivo',
      status: r.estado === 'error' ? 'error' : 'por subir',
      total: r.total != null ? r.total : 0,
      items: items.map((it, i) => ({ id: 'i' + i, quantity: it.quantity || 1, product: { name: it.name || 'Producto' } })),
      _offline: true,
    };
  });
}

/** Devuelve las ventas en un estado dado (por defecto, las pendientes de subir). */
export async function obtenerVentas(estado = 'pendiente') {
  const db = await initDB();
  const rows = await db.getAllAsync(
    'SELECT * FROM ventas_pendientes WHERE estado = ? ORDER BY creada_en ASC',
    [estado]
  );
  return rows.map((r) => ({
    clientUuid: r.client_uuid,
    payload: _parse(r.payload_json),
    estado: r.estado,
    creadaEn: r.creada_en,
    intentos: r.intentos,
    ultimoError: r.ultimo_error,
  }));
}

/** Marca el resultado de un intento de subida. */
export async function marcarVenta(clientUuid, estado, error = null) {
  const db = await initDB();
  await db.runAsync(
    'UPDATE ventas_pendientes SET estado = ?, intentos = intentos + 1, ultimo_error = ? WHERE client_uuid = ?',
    [estado, error, clientUuid]
  );
}

/** Cuenta cuántas ventas quedan por subir (pendiente o error). */
export async function contarPendientes() {
  const db = await initDB();
  const row = await db.getFirstAsync(
    "SELECT COUNT(*) AS n FROM ventas_pendientes WHERE estado IN ('pendiente','error')"
  );
  return row?.n ?? 0;
}

/** Borra las ventas ya subidas (limpieza; se puede llamar de vez en cuando). */
export async function limpiarVentasSubidas() {
  const db = await initDB();
  await db.runAsync("DELETE FROM ventas_pendientes WHERE estado = 'subida'");
}

// ─── SESIÓN LOCAL (arrancar sin internet) ───────────────────────────────────
// Sin esto la app no pasa de la pantalla de login cuando no hay señal: el
// arranque llama a GET /auth/me y GET /settings, y sin red no hay ni usuario ni
// puestos que mostrar. Se cachea lo que hace falta para reconstruir ese arranque.

/** Guarda un valor de sesión (`perfil` | `settings`). Nunca lanza. */
export async function guardarSesionLocal(clave, valor) {
  if (valor == null) return;
  try {
    const db = await initDB();
    await db.runAsync(
      'INSERT OR REPLACE INTO sesion_local (clave, valor_json, guardado_en) VALUES (?, ?, ?)',
      [clave, JSON.stringify(valor), new Date().toISOString()]
    );
  } catch (e) {
    console.warn('[offline/db] guardarSesionLocal:', e?.message);
  }
}

/**
 * Lee un valor de sesión. Devuelve `undefined` cuando NO hay nada guardado y el
 * valor cuando sí lo hay.
 *
 * ⚠️ La diferencia entre `undefined` y `{}` es de SEGURIDAD, no de estilo: unos
 * ajustes vacíos se leen como "este negocio no tiene puestos configurados" y
 * pueden acabar dando acceso de dueño (ver `_resolverPerfil` en AuthContext).
 * "No pude leer los puestos" tiene que poder distinguirse de "no hay puestos".
 */
export async function leerSesionLocal(clave) {
  try {
    const db = await initDB();
    const row = await db.getFirstAsync('SELECT valor_json FROM sesion_local WHERE clave = ?', [clave]);
    if (!row?.valor_json) return undefined;
    const parsed = _parse(row.valor_json);
    return parsed == null ? undefined : parsed;
  } catch (e) {
    console.warn('[offline/db] leerSesionLocal:', e?.message);
    return undefined;
  }
}

/**
 * Borra la sesión cacheada Y el catálogo del negocio. Se llama en el logout: los
 * productos, los clientes y los puestos son de la cuenta que se acaba de cerrar y
 * no significan nada en otra (mismo criterio que la sucursal del equipo, §24).
 *
 * ⚠️ Las ventas pendientes NO se tocan: son dinero ya cobrado que todavía no
 * subió. Borrarlas al cerrar sesión sería perder ventas reales.
 */
export async function limpiarSesionLocal() {
  try {
    const db = await initDB();
    await db.execAsync(
      'DELETE FROM sesion_local; DELETE FROM catalogo_categorias; DELETE FROM catalogo_productos; DELETE FROM catalogo_clientes; DELETE FROM catalogo_modificadores;'
    );
  } catch (e) {
    console.warn('[offline/db] limpiarSesionLocal:', e?.message);
  }
}

function _parse(json) {
  try { return JSON.parse(json); } catch { return null; }
}
