// ============================================================================
// utils/impuestos.js — Impuesto configurable (BLOQUE 8)
//
// Espejo EXACTO de `utils/impuestos.js` del backend (y de `modulo-impuestos.js`
// del desktop). El servidor recalcula el impuesto de toda venta: si esta fórmula
// se desviara, el cajero vería un total en la app y el ticket saldría con otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares.
//
// INTERRUPTOR (`tax_enabled`): el impuesto se enciende y se apaga sin perder la
// tasa configurada. Apagado es el default: la mayoría de los negocios no cobra
// impuesto y no debe ver un solo renglón extra.
//
// DOS MODOS (`tax_included`):
//   • INCLUIDO (DEFAULT) — el precio ya lo trae; el ticket lo desglosa hacia atrás.
//                          Es el estándar en México (precio exhibido con IVA).
//   • AGREGADO           — el precio es la base; el impuesto se SUMA al cobrar.
//
// El descuento (y el canje de puntos) baja la BASE GRAVABLE: se descuenta primero
// y el impuesto se calcula sobre lo que realmente se cobra.
//
// INVARIANTE: total = subtotal + impuesto.
// ============================================================================

export const IMPUESTO_NOMBRE_DEFAULT = 'IVA';
export const IMPUESTO_NOMBRE_MAX = 20;

function redondear(n) {
  return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Normaliza la tasa. Devuelve null si el valor no sirve (→ tratar como 0). */
export function normalizarTasa(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const tasa = parseFloat(valor);
  if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return null;
  return parseFloat(tasa.toFixed(2));
}

/** Los settings pueden llegar como texto ('true'), según cómo los guardó cada cliente. */
export function esIncluido(valor) {
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

/**
 * Config de impuesto a partir de los settings del negocio.
 * `tasa` es la EFECTIVA (0 si está apagado) y es la única que debe usarse para
 * cobrar; `tasaConfigurada` es la guardada, para que apagar y volver a encender
 * no le borre su 16% al dueño.
 */
export function configImpuesto(settings = {}) {
  const nombre = typeof settings?.tax_name === 'string' && settings.tax_name.trim()
    ? settings.tax_name.trim().slice(0, IMPUESTO_NOMBRE_MAX)
    : IMPUESTO_NOMBRE_DEFAULT;
  const tasaConfigurada = normalizarTasa(settings?.tax_rate) ?? 0;
  const valorActivo = settings?.tax_enabled;
  const activo = (valorActivo === undefined || valorActivo === null || valorActivo === '')
    ? tasaConfigurada > 0              // config anterior al interruptor
    : esIncluido(valorActivo);         // acepta true/'true'
  // El modo por defecto es INCLUIDO: en México el precio exhibido ya trae IVA.
  const modo = settings?.tax_included;
  const incluido = (modo === undefined || modo === null || modo === '') ? true : esIncluido(modo);
  return { activo, tasa: activo ? tasaConfigurada : 0, tasaConfigurada, incluido, nombre };
}

/** ¿Este negocio cobra impuesto? Con tasa 0 la UI no muestra renglones extra. */
export function hayImpuesto(cfg) {
  return (cfg?.tasa || 0) > 0;
}

/** Etiqueta del renglón: "IVA (16%)" o "IVA (16%) incluido". */
export function etiquetaImpuesto(cfg) {
  const nombre = cfg?.nombre || IMPUESTO_NOMBRE_DEFAULT;
  return `${nombre} (${cfg?.tasa || 0}%)${cfg?.incluido ? ' incluido' : ''}`;
}

/**
 * Desglosa una venta.
 * @param {number} base  AGREGADO: suma de items − descuentos (sin impuesto).
 *                       INCLUIDO: lo que se cobra (ya trae el impuesto).
 * @param {{tasa:number, incluido:boolean}} cfg
 * @returns {{subtotal:number, impuesto:number, total:number}}
 */
export function desglosarImpuesto(base, cfg) {
  const monto = redondear(parseFloat(base) || 0);
  const tasa = normalizarTasa(cfg?.tasa) ?? 0;

  if (tasa <= 0 || monto <= 0) {
    return { subtotal: monto, impuesto: 0, total: monto };
  }

  if (cfg?.incluido) {
    // El subtotal se define como (cobrado − impuesto) para que el invariante se
    // cumpla al centavo exacto y el ticket sume.
    const impuesto = redondear(monto - monto / (1 + tasa / 100));
    return { subtotal: redondear(monto - impuesto), impuesto, total: monto };
  }

  const impuesto = redondear(monto * tasa / 100);
  return { subtotal: monto, impuesto, total: redondear(monto + impuesto) };
}

/**
 * Desglose de un pedido YA registrado (para el ticket y el detalle). Un pedido
 * anterior al bloque no trae desglose: su total ES lo que se cobró y no se
 * muestra renglón de impuesto.
 */
export function desgloseDePedido(pedido = {}, settings = {}) {
  const total = parseFloat(pedido?.total ?? 0) || 0;
  const impuesto = parseFloat(pedido?.tax_amount ?? 0) || 0;
  const subtotal = pedido?.subtotal === undefined || pedido?.subtotal === null
    ? redondear(total - impuesto)
    : parseFloat(pedido.subtotal) || 0;
  return {
    total,
    impuesto,
    subtotal,
    tasa: normalizarTasa(pedido?.tax_rate) ?? 0,
    incluido: esIncluido(pedido?.tax_included),
    nombre: configImpuesto(settings).nombre,
  };
}
