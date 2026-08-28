// ============================================================================
// utils/modificadores.js — Modificadores de producto con precio (BLOQUE 11)
//
// Espejo EXACTO de `utils/modificadores.js` del backend (y de
// `modulo-modificadores.js` del desktop). El servidor recalcula el precio de
// toda venta: si esta copia se desviara, el cajero vería un total en la app y el
// ticket saldría con otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares.
//
// LA REGLA DE ORO: LOS MODIFICADORES AJUSTAN EL PRECIO UNITARIO.
//   • El precio del renglón es `precio del catálogo + suma de los deltas`. Todo
//     lo que ya existía (impuesto, descuentos, pagos divididos, corte de caja)
//     sigue leyendo ese precio sin enterarse de que hay extras.
//   • Lo elegido se CONGELA en el renglón: reimprimir un ticket viejo muestra lo
//     que se cobró, aunque el extra haya cambiado de precio después.
//
// NUNCA SE LE CREE EL PRECIO AL CLIENTE: en una venta online el delta lo pone el
// backend a partir del `option_id`. En una venta DIFERIDA (offline) se respeta el
// delta congelado, porque es el que el ticket ya entregado cobró.
//
// LA BIBLIOTECA es del negocio, no del producto: "Extras" se configura una vez y
// se engancha a los 30 tacos que lo usan.
// ============================================================================

export const MODS_MAX_POR_ITEM = 30;
export const MODS_MAX_DELTA = 1000000;
const NOMBRE_MAX = 60;

function redondear(n) {
  return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

function texto(valor, max = NOMBRE_MAX) {
  if (typeof valor !== 'string') return '';
  return valor.trim().slice(0, max);
}

/** @returns {number|null} null = valor inservible. */
export function normalizarDeltaModificador(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  const delta = parseFloat(valor);
  if (!Number.isFinite(delta) || Math.abs(delta) > MODS_MAX_DELTA) return null;
  return redondear(delta);
}

export function deltaDeModificadores(modificadores) {
  if (!Array.isArray(modificadores) || modificadores.length === 0) return 0;
  let suma = 0;
  for (const m of modificadores) {
    const delta = normalizarDeltaModificador(m && m.price_delta);
    if (delta !== null) suma += delta;
  }
  return redondear(suma);
}

/**
 * Precio unitario final: base del catálogo + extras.
 * Nunca baja de 0: un precio negativo convertiría una venta en una devolución
 * silenciosa. Se cobra 0 y el renglón queda visible para corregir la config.
 */
export function precioConModificadores(precioBase, modificadores) {
  const base = parseFloat(precioBase);
  if (!Number.isFinite(base)) return 0;
  return Math.max(0, redondear(base + deltaDeModificadores(modificadores)));
}

/** Texto de la línea de extras del carrito, el ticket y el KDS. */
export function resumenModificadores(modificadores) {
  if (!Array.isArray(modificadores) || modificadores.length === 0) return '';
  return modificadores.map((m) => texto(m && m.name)).filter(Boolean).join(', ');
}

/** Deja la selección en la forma congelada que se guarda con el renglón. */
export function normalizarSeleccionModificadores(modificadores) {
  if (!Array.isArray(modificadores)) return [];
  const limpios = [];
  for (const crudo of modificadores.slice(0, MODS_MAX_POR_ITEM)) {
    if (!crudo || typeof crudo !== 'object') continue;
    const nombre = texto(crudo.name || crudo.nombre);
    if (!nombre) continue;
    const delta = normalizarDeltaModificador(
      crudo.price_delta !== undefined ? crudo.price_delta : crudo.delta
    );
    if (delta === null) continue;
    const optionId = parseInt(crudo.option_id !== undefined ? crudo.option_id : crudo.id);
    const groupId = parseInt(crudo.group_id);
    limpios.push({
      option_id: Number.isInteger(optionId) ? optionId : null,
      group_id: Number.isInteger(groupId) ? groupId : null,
      group: texto(crudo.group || crudo.grupo),
      name: nombre,
      price_delta: delta,
    });
  }
  return limpios;
}

/** Lee el JSON congelado de un renglón sin reventar nunca. */
export function leerModificadores(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Ayudas para armar el carrito ───────────────────────────────────────────

/**
 * Los grupos que ofrece un producto, en el orden configurado.
 * `catalogo` es lo que devuelve `GET /api/modifiers` (o la caché offline).
 */
export function gruposDeProducto(catalogo, productoId) {
  if (!catalogo || !Array.isArray(catalogo.groups)) return [];
  const ids = (catalogo.product_groups || [])
    .filter((e) => e.product_id === productoId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((e) => e.group_id);
  return ids
    .map((id) => catalogo.groups.find((g) => g.id === id))
    .filter((g) => g && (g.options || []).length > 0);
}

/** ¿Hay que preguntar algo al agregar este producto al carrito? */
export function productoTieneModificadores(catalogo, productoId) {
  return gruposDeProducto(catalogo, productoId).length > 0;
}

/**
 * Clave de un renglón del carrito: producto + extras elegidos.
 *
 * Dos tacos, uno con extra queso y otro sin él, son renglones DISTINTOS y se
 * cobran distinto. Agrupar solo por producto haría que el segundo heredara los
 * extras (y el precio) del primero.
 */
export function claveCarrito(productoId, modificadores) {
  const firma = (modificadores || [])
    .map((m) => m.option_id)
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join('-');
  return firma ? `${productoId}|${firma}` : String(productoId);
}

/**
 * Grupos obligatorios a los que todavía les falta una elección.
 * El servidor NO valida `min_select` (rompería a los binarios viejos), así que
 * esta es la única barrera — y por eso vive en la fórmula compartida.
 */
export function gruposIncompletos(grupos, seleccionPorGrupo) {
  return (grupos || []).filter((g) => {
    const min = g.min_select || 0;
    if (min <= 0) return false;
    const elegidas = seleccionPorGrupo[g.id] || [];
    return elegidas.length < min;
  });
}
