// ============================================================================
// COBRAR UNA PARTE DE LA MESA (PLAN_CUENTAS_V1, §70)
//
// El mesero va comensal por comensal: toca lo que paga esta persona y lo cobra;
// la mesa sigue abierta con lo que queda. Aquí vive la CUENTA de esa parte, que
// es la MISMA que hace el servidor (zenit-pos-backend, POST /orders/:id/separar)
// y el desktop (`_calcularParteMesa` en modulo-mesas.js):
//   · la porción de un renglón partido es proporcional a su subtotal;
//   · una promo sale ENTERA (§61.4);
//   · la parte se desglosa con la tasa CONGELADA de la mesa;
//   · lo que queda es el total de la mesa MENOS la parte (suma exacta).
// Si cambias una, cambia las tres.
// ============================================================================
import { agruparRenglones } from './promos';
import { desglosarImpuesto } from './impuestos';

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/** Cuántas piezas tiene un renglón. Una cantidad rara (0.75 kg) es UN bloque. */
export function piezasDeRenglon(it) {
  const q = parseFloat(it && it.quantity);
  return Number.isInteger(q) && q > 1 ? q : 1;
}

/** Las unidades de la mesa: una promo es 1; un renglón de 3 cervezas, 3. */
export function unidadesDeMesa(items) {
  return agruparRenglones(items).reduce((n, g) => n + (g.promo ? 1 : piezasDeRenglon(g.item)), 0);
}

/** La clave de un renglón en la selección: el id, o 'promo:<grupo>'. */
export function claveDeGrupo(g) {
  return g.promo ? 'promo:' + g.promo.grupo : String(g.item.id);
}

/**
 * Tocar un renglón: pasa una pieza más a esta parte. Con una sola pieza (o una
 * promo) el toque alterna. Devuelve la selección NUEVA (no muta la anterior).
 */
export function tocarEnSeleccion(seleccion, g) {
  const clave = claveDeGrupo(g);
  const nueva = { ...seleccion };
  const max = g.promo ? 1 : piezasDeRenglon(g.item);
  const n = nueva[clave] || 0;
  if (max === 1) {
    if (n) delete nueva[clave]; else nueva[clave] = 1;
  } else if (n < max) {
    nueva[clave] = n + 1;
  }
  return nueva;
}

export function quitarUnoDeSeleccion(seleccion, clave) {
  const nueva = { ...seleccion };
  const n = (nueva[clave] || 0) - 1;
  if (n > 0) nueva[clave] = n; else delete nueva[clave];
  return nueva;
}

/**
 * La parte elegida, con su dinero.
 * @param {object} pedido  la mesa abierta (items, total, tax_rate, tax_included)
 * @param {object} seleccion { '<item_id>': cantidad, 'promo:<grupo>': 1 }
 * @returns {{ items: Array<{item_id:number, quantity?:number}>, total:number,
 *             queda:number, vacia:boolean, todo:boolean }}
 */
export function calcularParte(pedido, seleccion) {
  const items = (pedido && pedido.items) || [];
  const cuerpo = [];
  let base = 0;
  let unidades = 0;
  for (const g of agruparRenglones(items)) {
    const clave = claveDeGrupo(g);
    if (g.promo) {
      if (!seleccion[clave]) continue;
      // Basta un renglón: el servidor arrastra el grupo entero.
      cuerpo.push({ item_id: g.items[0].id });
      base += g.items.reduce((s, it) => s + r2(it.subtotal), 0);
      unidades += 1;
      continue;
    }
    const it = g.item;
    const max = piezasDeRenglon(it);
    const q = Math.min(seleccion[clave] || 0, max);
    if (q <= 0) continue;
    cuerpo.push(max === 1 ? { item_id: it.id } : { item_id: it.id, quantity: q });
    base += q === max ? r2(it.subtotal) : r2(parseFloat(it.subtotal) * q / max);
    unidades += q;
  }
  base = r2(base);
  const tasa = parseFloat(pedido && pedido.tax_rate) || 0;
  const incluido = pedido && (pedido.tax_included === true || pedido.tax_included === 'true' || pedido.tax_included === 1);
  const total = desglosarImpuesto(base, { tasa, incluido }).total;
  return {
    items: cuerpo,
    total,
    queda: r2((parseFloat(pedido && pedido.total) || 0) - total),
    vacia: unidades === 0,
    todo: unidades > 0 && unidades >= unidadesDeMesa(items),
  };
}
