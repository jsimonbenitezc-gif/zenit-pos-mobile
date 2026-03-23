/**
 * Traduce errores técnicos a mensajes amigables para el usuario.
 */
export function friendlyError(error) {
  const msg = error?.message || String(error || '');
  if (msg.includes('Token') || msg.includes('401') || msg.includes('jwt'))
    return 'Tu sesión expiró. Cierra sesión e inicia de nuevo.';
  if (msg.includes('500') || msg.includes('interno'))
    return 'Hubo un problema con el servidor. Intenta de nuevo.';
  if (msg.includes('no respondió') || msg.includes('timeout') || msg.includes('Timeout') || msg.includes('AbortError'))
    return 'No hay conexión con el servidor. Verifica tu internet.';
  if (msg.includes('403') || msg.includes('No tienes permiso') || msg.includes('requiere autorización'))
    return 'No tienes permiso para esta acción.';
  if (msg.includes('Network') || msg.includes('network') || msg.includes('Failed to fetch'))
    return 'Error de conexión. Verifica tu internet.';
  return msg;
}
