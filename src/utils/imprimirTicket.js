// ============================================================================
// utils/imprimirTicket.js — El puente que faltaba (BLOQUE 11, deuda §12.7)
//
// `printReceipt()` existía desde hace meses en utils/printer.js, pero NO LA
// LLAMABA NADIE: se podía emparejar la impresora y hacer una prueba, y al cobrar
// no salía ticket. Este archivo es lo que conecta el cobro con el papel.
//
// ─── LA REGLA DE ORO ────────────────────────────────────────────────────────
// UN FALLO DE IMPRESORA NUNCA TUMBA UNA VENTA.
//
// La venta ya está registrada cuando se llega aquí. Si la impresora está
// apagada, sin papel, fuera de alcance o simplemente no hay ninguna configurada,
// esto devuelve un resultado y sigue: mismo criterio que el §26 con las ventas
// diferidas — un cobro atascado por un periférico es peor que un ticket perdido.
// Por eso NO lanza nunca y por eso el llamador no necesita try/catch.
//
// El ticket se arma desde el PEDIDO, no desde el carrito: así la reimpresión
// desde el historial produce exactamente el mismo papel que salió al cobrar.
// ============================================================================
import * as SecureStore from 'expo-secure-store';
import { printReceipt, isPrinterAvailable } from './printer';

/**
 * Imprime el ticket de un pedido.
 *
 * @param {object} pedido    Pedido tal como lo devuelve el backend (con `items`
 *                           y, si los hubo, `payments`).
 * @param {object} settings  Ajustes del negocio (los del AuthContext).
 * @param {object} extra     { cashier, tableName } — lo que el pedido no trae.
 *
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 *   ok:false + motivo cuando no se pudo imprimir. El llamador decide si lo
 *   menciona; nunca debe convertirlo en un error de la venta.
 */
export async function imprimirTicketPedido(pedido, settings = {}, extra = {}) {
  if (!pedido) return { ok: false, motivo: 'sin_pedido' };

  // Sin módulo nativo (Expo Go, o un build sin la librería) no hay nada que hacer.
  if (!isPrinterAvailable()) return { ok: false, motivo: 'no_disponible' };

  let address = null;
  try {
    address = await SecureStore.getItemAsync('printer_address');
  } catch {
    return { ok: false, motivo: 'sin_impresora' };
  }
  if (!address) return { ok: false, motivo: 'sin_impresora' };

  try {
    const items = (pedido.items || []).map((it) => ({
      name: it.product?.name || it.name || 'Producto',
      quantity: it.quantity ?? 1,
      // El precio del renglón YA incluye los modificadores (BLOQUE 11).
      unit_price: parseFloat(it.unit_price ?? it.price ?? 0),
      modifiers: it.modifiers,
      notes: it.notes,
    }));

    await printReceipt(address, {
      businessName: settings.nombre_negocio || settings.business_name || 'Mi Negocio',
      businessPhone: settings.business_phone,
      businessAddress: settings.business_address,
      showPhone: settings.show_phone !== false && settings.show_phone !== 'false',
      showAddress: settings.show_direccion !== false && settings.show_direccion !== 'false',
      currency: settings.moneda || settings.currency_symbol || '$',
      items,
      total: parseFloat(pedido.total) || 0,
      discount: parseFloat(pedido.discount_amount) || 0,
      // Impuesto CONGELADO del pedido (BLOQUE 8), no la config de hoy: reimprimir
      // un ticket viejo debe dar el mismo papel que salió el día que se cobró.
      tax: parseFloat(pedido.tax_amount) || 0,
      taxName: settings.tax_name || 'IVA',
      taxRate: parseFloat(pedido.tax_rate) || 0,
      taxIncluded: pedido.tax_included === true || pedido.tax_included === 'true',
      // Propina (BLOQUE 9): fuera del total, con su propio renglón.
      tip: parseFloat(pedido.tip_amount) || 0,
      tipMethod: pedido.tip_method,
      // Reparto por método (BLOQUE 10): solo se imprime si hubo más de uno.
      payments: Array.isArray(pedido.payments) ? pedido.payments : [],
      footer: settings.ticket_footer,
      paymentMethod: pedido.payment_method || 'efectivo',
      orderType: pedido.order_type,
      orderId: pedido.id,
      cashier: extra.cashier,
      tableName: extra.tableName || pedido.table?.name,
      date: pedido.createdAt,
    });
    return { ok: true };
  } catch (e) {
    // Se registra para diagnóstico y se sigue: la venta ya está hecha.
    console.warn('[ticket] No se pudo imprimir:', e?.message);
    return { ok: false, motivo: 'error_impresora' };
  }
}
