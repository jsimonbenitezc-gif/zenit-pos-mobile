// ============================================================================
// utils/ticketLineas.js — Los renglones de productos del ticket, en texto
// (PLAN_OFERTAS_V1, Bloque 3)
//
// Vive aparte de printer.js para poder PROBARSE sin impresora: printer.js carga
// el módulo nativo de Bluetooth y aquí solo se decide qué se escribe.
//
// Una PROMO se imprime JUNTA —"1x 2x1 Tacos $35.00" y sus productos debajo—, no
// como dos tacos sueltos a $14.58 y $20.42: el cliente pidió un 2x1 y eso es lo
// que tiene que poder verificar en el papel. Al pie va "Ahorraste $X".
// ============================================================================
import { resumenModificadores, leerModificadores } from './modificadores';
import { agruparRenglones, ahorroDePromos } from './promos';

/**
 * Las líneas de productos. Cada una es `{ izq, der }` (renglón con precio a la
 * derecha) o `{ texto }` (detalle a la izquierda).
 */
export function lineasDeProductos(items, currency = '$') {
  const lineas = [];
  const extrasDe = (it) => resumenModificadores(leerModificadores(it.modifiers ?? it.modificadores));
  for (const g of agruparRenglones(items)) {
    if (g.promo) {
      lineas.push({ izq: `1x ${g.promo.nombre}`, der: `${currency}${g.promo.total.toFixed(2)}` });
      for (const it of g.items) {
        lineas.push({ texto: `   · ${it.name || 'Producto'}` });
        // Los extras del producto de la promo se COBRAN (§2 del plan): van
        // escritos para que el cliente vea de dónde sale la diferencia.
        const extras = extrasDe(it);
        if (extras) lineas.push({ texto: `     ${extras}` });
        if (it.notes) lineas.push({ texto: `     * ${it.notes}` });
      }
      continue;
    }
    const it = g.item;
    const qty = it.qty || it.quantity || 1;
    const price = parseFloat(it.price || it.unit_price || 0);
    lineas.push({ izq: `${qty}x ${it.name}`, der: `${currency}${(price * qty).toFixed(2)}` });
    // MODIFICADORES (BLOQUE 11). Van bajo el renglón, NO como cargo aparte: el
    // precio del renglón ya los incluye.
    const extras = extrasDe(it);
    if (extras) lineas.push({ texto: `   ${extras}` });
    if (it.notes) lineas.push({ texto: `   * ${it.notes}` });
  }
  return lineas;
}

/** "Ahorraste $25.00", o null si no hubo promo que ahorrara algo. */
export function lineaAhorro(items, currency = '$') {
  const ahorro = ahorroDePromos(items);
  return ahorro > 0.004 ? `Ahorraste ${currency}${ahorro.toFixed(2)}` : null;
}
