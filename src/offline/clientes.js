// ============================================================================
// src/offline/clientes.js — la libreta de clientes, con cuenta o sin ella.
//
// En modo local es una libreta simple: nombre, teléfono y dirección. **Sin
// puntos de fidelidad** — los puntos los calcula y descuenta el servidor dentro
// de la misma transacción de la venta (§13), así que aquí no se pueden ofrecer
// sin inventar un saldo que después no cuadraría con nada.
// ============================================================================
import { api } from '../api/client';
import {
  esModoLocal, listarClientesLocales, guardarClienteLocal, obtenerClienteLocal,
} from './local';

export async function listarClientes() {
  if (await esModoLocal()) return await listarClientesLocales();
  return await api.getCustomers();
}

export async function crearCliente(body) {
  if (await esModoLocal()) {
    const id = await guardarClienteLocal(body);
    return await obtenerClienteLocal(id);
  }
  return await api.createCustomer(body);
}

/**
 * Editar un cliente. Con cuenta es una acción con PIN y auditoría (§12.2); sin
 * cuenta no hay puestos ni nadie a quien auditar, así que se guarda y ya.
 */
export async function actualizarCliente(id, body) {
  if (await esModoLocal()) {
    await guardarClienteLocal({ ...body, id });
    return await obtenerClienteLocal(id);
  }
  return await api.updateCustomerWithPin(id, body.payload, body.auth);
}
