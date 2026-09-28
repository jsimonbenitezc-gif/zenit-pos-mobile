/**
 * utils/tz.js — Zona horaria del negocio (Bloque 2 · PLAN_ARREGLOS_V5).
 *
 * El backend corre en UTC. Cada negocio guarda su zona IANA en `settings.tz` y el
 * backend la usa para cortar el día en el dashboard, los reportes y los resúmenes
 * automáticos. Aquí solo elegimos/mostramos la zona: los cálculos son del servidor.
 */

export const ZONA_HORARIA_DEFAULT = 'America/Mexico_City';

export const ZONAS_HORARIAS = [
  ['America/Mexico_City',            'México — Centro (CDMX, Guadalajara)'],
  ['America/Monterrey',              'México — Monterrey'],
  ['America/Cancun',                 'México — Cancún / Quintana Roo'],
  ['America/Hermosillo',             'México — Hermosillo / Sonora'],
  ['America/Mazatlan',               'México — Mazatlán / Sinaloa'],
  ['America/Tijuana',                'México — Tijuana / Baja California'],
  ['America/Guatemala',              'Guatemala'],
  ['America/El_Salvador',            'El Salvador'],
  ['America/Tegucigalpa',            'Honduras'],
  ['America/Managua',                'Nicaragua'],
  ['America/Costa_Rica',             'Costa Rica'],
  ['America/Panama',                 'Panamá'],
  ['America/Bogota',                 'Colombia'],
  ['America/Caracas',                'Venezuela'],
  ['America/Guayaquil',              'Ecuador'],
  ['America/Lima',                   'Perú'],
  ['America/La_Paz',                 'Bolivia'],
  ['America/Santiago',               'Chile'],
  ['America/Asuncion',               'Paraguay'],
  ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['America/Montevideo',             'Uruguay'],
  ['America/Sao_Paulo',              'Brasil — São Paulo'],
  ['America/Santo_Domingo',          'República Dominicana'],
  ['America/Havana',                 'Cuba'],
  ['America/Puerto_Rico',            'Puerto Rico'],
  ['America/New_York',               'EE.UU. — Este (Nueva York, Miami)'],
  ['America/Chicago',                'EE.UU. — Central (Chicago, Houston)'],
  ['America/Denver',                 'EE.UU. — Montaña (Denver)'],
  ['America/Phoenix',                'EE.UU. — Phoenix'],
  ['America/Los_Angeles',            'EE.UU. — Pacífico (Los Ángeles)'],
  ['Europe/Madrid',                  'España'],
  ['UTC',                            'UTC (hora universal)'],
];

/**
 * Zona horaria del teléfono/tablet. Es la mejor suposición al crear una cuenta.
 * En Hermes el soporte de Intl varía por versión de Android, así que validamos el
 * resultado y caemos a la default si no parece una zona IANA real.
 */
export function zonaDelDispositivo() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && /^[A-Za-z0-9_+\-/]+$/.test(tz) && tz.includes('/')) return tz;
  } catch {
    // Hermes sin Intl completo: usamos la default
  }
  return ZONA_HORARIA_DEFAULT;
}

/** Etiqueta legible de una zona. Si no está en la lista curada, muestra el id IANA. */
export function etiquetaZona(tz) {
  const encontrada = ZONAS_HORARIAS.find(([id]) => id === tz);
  return encontrada ? encontrada[1] : (tz || ZONA_HORARIA_DEFAULT);
}

/** Lista para el selector, con la zona actual incluida aunque no sea de la lista. */
export function opcionesZona(tzActual) {
  const opciones = ZONAS_HORARIAS.slice();
  if (tzActual && !opciones.some(([id]) => id === tzActual)) opciones.unshift([tzActual, tzActual]);
  return opciones;
}

/**
 * Los últimos `n` días del calendario, terminando en `hoyLocal` ('YYYY-MM-DD').
 * `hoyLocal` lo manda el servidor con la zona del NEGOCIO; si no llega (servidor
 * viejo), se usa la fecha del teléfono. Antes la gráfica usaba `toISOString()`
 * (UTC) y una venta de las 7 p.m. en México caía en el día siguiente.
 * La cuenta va en UTC puro sobre la fecha ya local: no hay horario de verano que la mueva.
 */
export function ultimosDias(hoyLocal, n = 7) {
  let base;
  if (typeof hoyLocal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hoyLocal)) {
    const [y, m, d] = hoyLocal.split('-').map(Number);
    base = Date.UTC(y, m - 1, d);
  } else {
    const h = new Date();
    base = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  }
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base - (n - 1 - i) * 86400000);
    return { fecha: d.toISOString().slice(0, 10), diaSemana: d.getUTCDay() };
  });
}
