// ============================================================================
// src/offline/caja.js — el turno de caja, con cuenta o sin ella.
//
// La pantalla de Turno hace lo mismo en los dos modos: abrir, registrar
// movimientos, anularlos y cerrar contando el efectivo. Lo único que cambia es
// dónde vive el turno, y esa decisión está aquí — igual que `ventasOffline.js`
// para la venta y `catalogoEditable.js` para el menú.
//
// ⚠️ La fórmula del efectivo esperado NO está aquí ni se duplica: la pantalla
// usa `efectivoEsperado()` de `src/utils/propinas.js`, que ya es el espejo del
// §28 y del §30. Este archivo solo decide de dónde salen los números.
// ============================================================================
import { api } from '../api/client';
import {
  esModoLocal,
  turnoLocalActivo, abrirTurnoLocal, totalesTurnoLocal, cerrarTurnoLocal,
  movimientosTurnoLocal, registrarMovimientoLocal, anularMovimientoLocal,
} from './local';

export async function turnoActivo(sucursalId) {
  if (await esModoLocal()) return await turnoLocalActivo();
  return await api.getTurnoActivo(sucursalId);
}

export async function abrirTurno(cajero, rol, fondo, sucursalId) {
  if (await esModoLocal()) return await abrirTurnoLocal(cajero, fondo);
  return await api.abrirTurno(cajero, rol, fondo, sucursalId);
}

export async function totalesTurno(turnoId) {
  if (await esModoLocal()) return await totalesTurnoLocal(turnoId);
  return await api.getTurnoTotales(turnoId);
}

/**
 * @param {number} esperado  el efectivo que la pantalla calculó y le mostró al
 *   cajero. Solo lo usa el modo local, para guardar EXACTAMENTE la diferencia
 *   que él vio; con cuenta la calcula el backend.
 */
export async function cerrarTurno(turnoId, efectivoContado, notas, esperado) {
  if (await esModoLocal()) return await cerrarTurnoLocal(turnoId, efectivoContado, notas, esperado);
  return await api.cerrarTurno(turnoId, efectivoContado, notas);
}

export async function movimientosCaja(turnoId) {
  if (await esModoLocal()) return await movimientosTurnoLocal(turnoId);
  return await api.getMovimientosCaja(turnoId);
}

export async function registrarMovimiento(turnoId, datos) {
  if (await esModoLocal()) {
    return await registrarMovimientoLocal(turnoId, datos.tipo, datos.monto, datos.motivo);
  }
  return await api.registrarMovimientoCaja(turnoId, datos);
}

export async function anularMovimiento(turnoId, movimientoId, datos) {
  if (await esModoLocal()) {
    return await anularMovimientoLocal(turnoId, movimientoId, datos?.motivo);
  }
  return await api.anularMovimientoCaja(turnoId, movimientoId, datos);
}
