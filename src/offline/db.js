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
    CREATE TABLE IF NOT EXISTS ventas_pendientes (
      client_uuid  TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      estado       TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | subida | error
      creada_en    TEXT NOT NULL,
      intentos     INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT
    );
  `);
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

/** Encola una venta (payload = el orderBody que se manda a POST /api/orders). */
export async function encolarVenta(clientUuid, payload) {
  const db = await initDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO ventas_pendientes (client_uuid, payload_json, estado, creada_en, intentos) VALUES (?, ?, ?, ?, 0)',
    [clientUuid, JSON.stringify(payload), 'pendiente', new Date().toISOString()]
  );
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

function _parse(json) {
  try { return JSON.parse(json); } catch { return null; }
}
