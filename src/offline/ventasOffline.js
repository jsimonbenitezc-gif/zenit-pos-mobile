// ============================================================================
// src/offline/ventasOffline.js
// Capa offline de la VENTA (Fase 1). Espejo del patrón del desktop:
//   - Catálogo/clientes: intenta backend, cachea, y cae a la caché local sin red.
//   - Venta instantánea: guarda la venta local con client_uuid y la cierra al
//     instante; sincroniza en segundo plano.
//   - Sync: sube las ventas pendientes; el backend deduplica por client_uuid.
// ============================================================================
import * as Crypto from 'expo-crypto';
import { api } from '../api/client';
import {
  guardarCatalogo, leerCatalogo, hayCatalogoCacheado,
  guardarClientes, leerClientes,
  encolarVenta, obtenerVentas, marcarVenta, limpiarVentasSubidas,
  obtenerVentasParaMostrar,
} from './db';

// Re-exportado para que la pantalla de Pedidos muestre las ventas offline pendientes.
export { obtenerVentasParaMostrar };

const MAX_INTENTOS = 5; // tras estos intentos con error del servidor, marcar para revisión

// ─── Catálogo ───────────────────────────────────────────────────────────────

/**
 * Reemplazo directo de api.getProductsGrouped(): online cachea y devuelve;
 * sin red devuelve la caché. Lanza solo si no hay red NI caché.
 */
export async function obtenerCatalogo() {
  try {
    const grouped = await api.getProductsGrouped();
    guardarCatalogo(grouped).catch((e) => console.warn('[offline] cache catálogo:', e?.message));
    return grouped;
  } catch (e) {
    if (await hayCatalogoCacheado().catch(() => false)) {
      return await leerCatalogo();
    }
    throw e; // sin red y sin caché: que la pantalla muestre su error
  }
}

/** Reemplazo de api.getCustomers(): online cachea; sin red devuelve la caché (o []). */
export async function obtenerClientes() {
  try {
    const clientes = await api.getCustomers();
    guardarClientes(clientes).catch((e) => console.warn('[offline] cache clientes:', e?.message));
    return clientes;
  } catch {
    return await leerClientes().catch(() => []);
  }
}

// ─── Venta instantánea ────────────────────────────────────────────────────────

function generarUuid() {
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Encola una venta local (siempre lleva client_uuid) y dispara el sync en segundo
 * plano. No falla por falta de red. La venta queda registrada al instante.
 * @returns {{ client_uuid: string }}
 */
export async function crearVenta(orderBody, meta = {}) {
  const client_uuid = orderBody.client_uuid || generarUuid();
  const payload = { ...orderBody, client_uuid };
  await encolarVenta(client_uuid, payload, meta);  // ← la venta queda registrada (con datos de display)
  sincronizarVentasPendientes().catch(() => {});   // ← sube en segundo plano si hay red
  return { client_uuid };
}

/**
 * Punto de entrada que usa la pantalla de venta.
 * - ONLINE: intenta el backend directo (feedback inmediato; un error REAL del
 *   servidor —ej. stock, datos inválidos— se propaga para mostrarlo).
 * - Si se cae la RED justo al enviar (error transitorio) → se encola para no
 *   perder la venta.
 * - OFFLINE: se encola directo.
 * @param {object} orderBody  Cuerpo del pedido (SIN loyalty si está offline; ver pantalla)
 * @param {boolean} online    Estado de conectividad actual
 * @param {object} meta        Datos de display para la cola: { total, resumen }
 * @returns {Promise<{ modo: 'online' | 'offline' }>}
 */
export async function registrarVenta(orderBody, online, meta = {}) {
  // Un solo client_uuid para ambos caminos: si el envío online expira pero el
  // pedido SÍ se creó, la cola reintenta con el mismo uuid y el backend deduplica.
  const body = { ...orderBody, client_uuid: orderBody.client_uuid || generarUuid() };
  if (online) {
    try {
      await api.createOrder(body);
      return { modo: 'online' };
    } catch (e) {
      if (!esErrorTransitorio(e)) throw e; // error real del servidor → que la UI lo muestre
      // Se cayó la red al enviar: caemos a la cola local para no perder la venta.
    }
  }
  await crearVenta(body, meta); // body ya trae client_uuid → crearVenta lo reutiliza
  return { modo: 'offline' };
}

// ─── Motor de sincronización ─────────────────────────────────────────────────

function esErrorTransitorio(e) {
  const m = String(e?.message || e || '').toLowerCase();
  return (
    m.includes('sin conexión') ||
    m.includes('tardó mucho') ||
    m.includes('network') ||
    m.includes('failed to fetch')
  );
}

let _sincronizando = false;

/**
 * Sube todas las ventas pendientes. Reentrante-seguro (no corre dos veces a la vez).
 * - Error de red/timeout: se deja pendiente y se corta (se reintenta luego).
 * - Error del servidor: se reintenta hasta MAX_INTENTOS; luego se marca 'error'.
 * @returns {Promise<{ subidas: number, pendientes: number }>}
 */
export async function sincronizarVentasPendientes() {
  // Solo con sesión: sin token, createOrder daría 401 y podría disparar un logout
  // en segundo plano. Sin sesión no hay ventas que subir de todos modos.
  if (!api.token) return { subidas: 0, pendientes: 0 };
  if (_sincronizando) return { subidas: 0, pendientes: 0 };
  _sincronizando = true;
  let subidas = 0;
  try {
    const ventas = await obtenerVentas('pendiente');
    for (const v of ventas) {
      try {
        await api.createOrder(v.payload); // el backend deduplica por client_uuid
        await marcarVenta(v.clientUuid, 'subida');
        subidas++;
      } catch (e) {
        if (esErrorTransitorio(e)) {
          // Sin red: no tiene sentido seguir intentando el resto ahora.
          break;
        }
        // El servidor respondió con error. Reintentar unas veces (5xx transitorio);
        // si persiste, marcar 'error' para revisión manual (no se pierde la venta).
        const intentos = (v.intentos || 0) + 1;
        await marcarVenta(v.clientUuid, intentos >= MAX_INTENTOS ? 'error' : 'pendiente', String(e?.message || e));
      }
    }
    limpiarVentasSubidas().catch(() => {});
  } finally {
    _sincronizando = false;
  }
  const pendientes = (await obtenerVentas('pendiente').catch(() => [])).length;
  return { subidas, pendientes };
}
