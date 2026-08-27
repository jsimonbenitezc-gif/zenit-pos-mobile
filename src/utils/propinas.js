// ============================================================================
// utils/propinas.js — Propinas (BLOQUE 9)
//
// Espejo EXACTO de `utils/propinas.js` del backend (y de `modulo-propinas.js`
// del desktop). El servidor revalida la propina de toda venta: si esta copia se
// desviara, el cajero cobraría un número y el corte de caja le exigiría otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares.
//
// LA REGLA DE ORO: LA PROPINA NO ES UNA VENTA.
//   • No entra en el total del pedido ni paga impuesto: es dinero del cliente
//     para el empleado que solo pasa por la caja.
//   • Lo que el cliente ENTREGA es `total + propina`. Lo que el negocio VENDIÓ
//     sigue siendo `total`. El ticket muestra los dos números.
//   • El invariante del BLOQUE 8 (total = subtotal + impuesto) queda intacto.
//
// DONDE SÍ CUENTA: EL CAJÓN. La propina en efectivo está físicamente ahí, así
// que el efectivo esperado del corte la suma. Si no, cada propina en efectivo
// saldría como un SOBRANTE. La de tarjeta no entra: llega en la liquidación del
// banco. Cuando se le entrega al empleado sale como un `retiro` del BLOQUE 7.
//
// INTERRUPTOR (`propinas_activas`): nace APAGADO, igual que el impuesto.
// ============================================================================

// Mismo tope que los precios de venta y los movimientos de caja: un monto
// absurdo es un dedazo, no una propina.
export const PROPINA_TOPE = 1000000;
export const PROPINA_SUGERENCIAS_DEFAULT = [10, 15, 20];
export const PROPINA_MAX_SUGERENCIAS = 4;
export const PROPINA_METODOS = ['efectivo', 'tarjeta', 'transferencia'];

function redondear(n) {
  return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Los settings pueden llegar como texto ('true'), según cómo los guardó cada cliente. */
function esVerdadero(valor) {
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

/**
 * Normaliza el monto de propina. Devuelve 0 —nunca un error— ante cualquier
 * valor inservible: una venta jamás debe fallar por una propina mal tecleada.
 * Es el mismo criterio del BLOQUE 5: una venta atascada en la cola offline es
 * peor que una propina perdida.
 */
export function normalizarPropina(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  const monto = parseFloat(valor);
  if (!Number.isFinite(monto) || monto <= 0 || monto > PROPINA_TOPE) return 0;
  return redondear(monto);
}

/** Método de la propina; cae al del pago si no viene o no es válido. */
export function normalizarMetodo(metodoPropina, metodoPago) {
  const candidato = typeof metodoPropina === 'string' ? metodoPropina.toLowerCase().trim() : '';
  if (PROPINA_METODOS.includes(candidato)) return candidato;
  const pago = typeof metodoPago === 'string' ? metodoPago.toLowerCase().trim() : '';
  return PROPINA_METODOS.includes(pago) ? pago : 'efectivo';
}

/** Normaliza los porcentajes sugeridos. Acepta array o el texto "10,15,20". */
export function normalizarSugerencias(valor) {
  let crudas = valor;
  if (typeof crudas === 'string') {
    try {
      const parseado = JSON.parse(crudas);
      crudas = Array.isArray(parseado) ? parseado : crudas.split(',');
    } catch {
      crudas = crudas.split(',');
    }
  }
  if (!Array.isArray(crudas)) return [...PROPINA_SUGERENCIAS_DEFAULT];

  const limpias = [];
  for (const cruda of crudas) {
    const pct = parseFloat(cruda);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    const redondeado = parseFloat(pct.toFixed(2));
    if (!limpias.includes(redondeado)) limpias.push(redondeado);
    if (limpias.length >= PROPINA_MAX_SUGERENCIAS) break;
  }
  return limpias.length ? limpias : [...PROPINA_SUGERENCIAS_DEFAULT];
}

/** Config de propinas a partir de los settings del negocio. */
export function configPropina(settings = {}) {
  return {
    activo: esVerdadero(settings?.propinas_activas),
    sugerencias: normalizarSugerencias(settings?.propina_sugerencias),
  };
}

/** ¿Este negocio recibe propinas? Apagado, la UI no muestra ningún renglón. */
export function hayPropinas(cfg) {
  return !!cfg?.activo;
}

/** Monto que corresponde a un porcentaje sobre el total de la venta. */
export function propinaPorPorcentaje(total, porcentaje) {
  const base = parseFloat(total) || 0;
  const pct = parseFloat(porcentaje) || 0;
  if (base <= 0 || pct <= 0) return 0;
  return redondear(base * pct / 100);
}

/**
 * Lo que el cliente ENTREGA: la venta más la propina.
 * ⚠️ No es la venta del negocio. Este número solo se usa para pedir el dinero y
 * mostrarlo en el cobro; nunca se guarda como total.
 */
export function totalConPropina(total, propina) {
  return redondear((parseFloat(total) || 0) + (parseFloat(propina) || 0));
}

/** Propina de un pedido YA guardado (backend o cola offline), para mostrarla. */
export function propinaDePedido(pedido = {}) {
  const monto = parseFloat(pedido?.tip_amount ?? pedido?.propina ?? 0) || 0;
  if (monto <= 0) return { monto: 0, metodo: null };
  return {
    monto: redondear(monto),
    metodo: normalizarMetodo(pedido?.tip_method ?? pedido?.propina_metodo, pedido?.payment_method),
  };
}

/**
 * Efectivo que debe haber en el cajón:
 *   fondo_inicial + ventas_efectivo + propinas_efectivo + depósitos − retiros − gastos
 *
 * ⚠️ La propina en EFECTIVO se suma porque está en el cajón (BLOQUE 9). Sin
 * ella, cada propina saldría como un SOBRANTE al contar el dinero.
 */
export function efectivoEsperado({ fondoInicial, ventasEfectivo, propinasEfectivo = 0, depositos = 0, retiros = 0, gastos = 0 }) {
  return redondear(
    (parseFloat(fondoInicial) || 0) +
    (parseFloat(ventasEfectivo) || 0) +
    (parseFloat(propinasEfectivo) || 0) +
    (parseFloat(depositos) || 0) -
    (parseFloat(retiros) || 0) -
    (parseFloat(gastos) || 0)
  );
}
