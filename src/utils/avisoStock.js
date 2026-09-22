// ============================================================================
// utils/avisoStock.js — "Falta stock, ¿continuar?" (§56.3 del CLAUDE.md)
//
// Cuando a una venta le faltan existencias, `POST /api/orders` NO crea el
// pedido: responde 200 con `{ stock_warning: true, warnings }` y espera que el
// cajero confirme reenviando con `skip_stock_check: true`. Avisa, no bloquea.
//
// 🔴 El celular nunca conoció esa respuesta. Como es un 200, la trataba como el
// pedido creado: la mesa se quedaba vacía sin decir nada, la venta de mostrador
// decía "Venta registrada" sin haberse guardado, y la cola offline la marcaba
// como SUBIDA y la borraba. Dinero cobrado que nunca llegaba al servidor.
//
// Por eso `api.createOrder` convierte esa respuesta en un ERROR (el cerrojo va
// donde se decide, no en cada pantalla): quien no sepa preguntar, al menos ve
// que algo no se guardó, en vez de creer que sí.
// ============================================================================

export const CODIGO_AVISO_STOCK = 'STOCK_WARNING';

function num(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '?';
  return String(Math.round(n * 100) / 100);
}

/** "Queso Gouda: hay 0.36 kg, se necesitan 0.44 kg" — un renglón por faltante. */
export function textoAvisoStock(warnings, max = 5) {
  const lista = Array.isArray(warnings) ? warnings : [];
  const lineas = lista.slice(0, max).map((w) => {
    const u = w?.unit ? ` ${w.unit}` : '';
    return `• ${w?.ingredient || 'Producto'}: hay ${num(w?.available)}${u}, se necesitan ${num(w?.required)}${u}`;
  });
  if (lista.length > max) lineas.push(`• …y ${lista.length - max} más`);
  return lineas.join('\n');
}

/** El error que lanza `api.createOrder` cuando el servidor pide confirmar. */
export function errorAvisoStock(respuesta) {
  const warnings = Array.isArray(respuesta?.warnings) ? respuesta.warnings : [];
  const e = new Error('Faltan existencias para esta venta:\n' + textoAvisoStock(warnings));
  e.code = CODIGO_AVISO_STOCK;
  e.warnings = warnings;
  return e;
}

export function esAvisoStock(e) {
  return e?.code === CODIGO_AVISO_STOCK;
}

/** ¿Esta respuesta de POST /orders es un aviso y NO un pedido? */
export function esRespuestaAvisoStock(res) {
  return !!(res && res.stock_warning === true);
}
