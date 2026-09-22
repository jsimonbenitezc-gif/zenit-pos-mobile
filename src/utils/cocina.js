// ============================================================================
// utils/cocina.js — Qué hace el botón "Completado" de la cocina del celular
// (PLAN_OFERTAS_V1, pendiente del Bloque 1)
//
// 🔴 LA COMANDA DE UNA MESA SOLO SE ESCONDE; NUNCA SE MANDA "completado".
//
// Una mesa es una cuenta ABIERTA: la cocina termina el plato, pero la mesa
// sigue comiendo y se cobra después. Mandar `completado` desde aquí CERRABA la
// mesa y dejaba la venta en el corte como efectivo que nadie cobró (§60.4). El
// servidor ya lo impide —responde 200 con `mesa_sigue_abierta` y la mesa sigue
// abierta—, así que la comanda volvía a aparecer en la siguiente recarga, a los
// 30 s. La cocina web (`kds.html`) nunca tuvo el problema porque solo esconde;
// ésta hace lo mismo.
//
// Lo de MOSTRADOR sí se marca `completado`: esa venta ya se cobró y marcarla
// no cambia su dinero, solo dice que salió de la cocina.
// ============================================================================

// Cuántas comandas escondidas se recuerdan. Un id viejo ya no vuelve a salir
// (la mesa se cobra y deja de estar en `registrado`), así que no hace falta más.
export const MAX_OCULTAS = 300;

/** 'ocultar' para una comanda de mesa; 'completar' para una de mostrador. */
export function accionAlCompletar(pedido) {
  const deMesa = pedido && (pedido.table_id !== null && pedido.table_id !== undefined || pedido.table);
  return deMesa ? 'ocultar' : 'completar';
}

/** Las comandas que la cocina sigue viendo: todas menos las escondidas. */
export function comandasVisibles(pedidos, ocultas) {
  const set = ocultas instanceof Set ? ocultas : new Set(ocultas || []);
  return (pedidos || []).filter((p) => p && !set.has(p.id));
}

/** La lista de escondidas con un id más, sin repetir y sin crecer sin fin. */
export function agregarOculta(ocultas, id) {
  const lista = [...(ocultas || []).filter((x) => x !== id), id];
  return lista.slice(-MAX_OCULTAS);
}

/** Lee la lista guardada (JSON) sin reventar nunca. */
export function leerOcultas(texto) {
  try {
    const v = JSON.parse(texto || '[]');
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
