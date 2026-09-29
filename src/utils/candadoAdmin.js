// ─── CANDADO DEL ADMINISTRADOR (PLAN_SEGURIDAD_V1, sesión 1) ─────────────────
//
// Lo delicado de Ajustes (Puestos y PINs, apagar "pedir contraseña", cerrar
// sesión) pide la contraseña del administrador. Una bien tecleada vale 5 minutos
// PARA ESE PERFIL, para no pedirla en cada toque. Es la misma regla que el
// desktop (`pedirAdminReciente` en pos/modulo-turno.js).
//
// Vive en memoria a propósito: cerrar la app, cambiar de perfil o cerrar sesión
// la olvida.

export const ADMIN_VALIDO_MS = 5 * 60 * 1000;

let _confirmado = { hasta: 0, rol: null };

/** ¿Hay una contraseña de administrador reciente para este perfil? */
export function adminVigente(rol, ahora = Date.now()) {
  return !!rol && _confirmado.rol === rol && ahora < _confirmado.hasta;
}

/** Se llama cuando la contraseña del administrador resultó correcta. */
export function marcarAdmin(rol, ahora = Date.now()) {
  _confirmado = { hasta: ahora + ADMIN_VALIDO_MS, rol: rol || null };
}

/** Cambiar de perfil o cerrar sesión: la próxima vez se vuelve a pedir. */
export function olvidarAdmin() {
  _confirmado = { hasta: 0, rol: null };
}
