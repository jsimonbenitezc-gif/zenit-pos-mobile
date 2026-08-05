// ============================================================================
// src/utils/uuid.js — identificadores de idempotencia
//
// Todo lo que crea registros en el backend (ventas, apertura de mesa, envío de
// productos a una mesa) viaja con un uuid propio. Si la respuesta se pierde por
// una red débil, el reintento lleva el MISMO uuid y el backend lo reconoce en
// vez de duplicar el registro.
// ============================================================================
import * as Crypto from 'expo-crypto';

export function generarUuid() {
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
