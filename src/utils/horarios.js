// ============================================================================
// utils/horarios.js — Horario del negocio (BLOQUE 14)
//
// Espejo de `utils/horarios.js` del backend (y de `modulo-horarios.js` del
// desktop). ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares — igual que
// el impuesto (§29), la propina (§30), los pagos divididos (§31) y los
// modificadores (§32).
//
// LA REGLA DE ORO: EL HORARIO ES UNA SEÑAL, NUNCA UN CANDADO.
//   • JAMÁS se bloquea vender, cobrar, abrir turno ni ver la cocina. Un POS que
//     se niega a vender hace más daño que el riesgo que evita: el negocio que
//     se queda abierto por un partido, el inventario del domingo o el 31 de
//     diciembre se quedarían con la caja muerta sin entender por qué.
//   • Lo único que el horario restringe es APROBAR UNA PANTALLA DE COCINA, y ni
//     siquiera lo prohíbe: fuera de horario lo sube al DUEÑO.
//   • Sin horario configurado —el default— nada de esto se dispara.
//
// ⚠️ LA VENTANA PUEDE CRUZAR LA MEDIANOCHE, y es el caso que más importa: un bar
// de 18:00–02:00 tendría toda su noche marcada como sospechosa si se comparara
// ingenuamente `abre <= ahora < cierra`. Cuando `cierra < abre` la ventana sigue
// viva después de medianoche, así que hay que mirar también la del DÍA ANTERIOR:
// a la 1:30 del martes, quien está abierto es el lunes.
// `abre === cierra` significa abierto TODO EL DÍA, y no se extiende al siguiente.
//
// El teléfono usa su reloj LOCAL, que es el del negocio: a diferencia del
// backend (que corre en UTC), aquí no hay conversión de zona que hacer.
// ============================================================================

export const HORARIO_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const HORARIO_DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'HH:MM' → minutos desde medianoche. null si no tiene ese formato. */
function minutos(texto) {
  const m = RE_HORA.exec(String(texto || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Valida y normaliza una semana. Devuelve `{ ok, horario, error }`.
 * `horario` es null cuando no hay horario definido — incluido el caso de los
 * siete días cerrados, que no es un horario sino la ausencia de uno.
 */
export function normalizarHorario(valor) {
  if (valor === null || valor === undefined || valor === '') return { ok: true, horario: null };

  let bruto = valor;
  if (typeof bruto === 'string') {
    try { bruto = JSON.parse(bruto); }
    catch { return { ok: false, error: 'El horario no tiene un formato válido' }; }
  }
  if (bruto === null) return { ok: true, horario: null };
  if (!Array.isArray(bruto)) return { ok: false, error: 'El horario debe ser una lista de 7 días' };
  if (bruto.length === 0) return { ok: true, horario: null };
  if (bruto.length !== 7) return { ok: false, error: 'El horario debe tener los 7 días' };

  const horario = [];
  for (let i = 0; i < 7; i++) {
    const dia = bruto[i];
    if (!dia || typeof dia !== 'object') {
      return { ok: false, error: `El ${HORARIO_DIAS[i]} no tiene un horario válido` };
    }
    if (dia.cerrado === true || dia.cerrado === 'true') { horario.push({ cerrado: true }); continue; }
    const abre = minutos(dia.abre);
    const cierra = minutos(dia.cierra);
    if (abre === null || cierra === null) {
      return { ok: false, error: `El ${HORARIO_DIAS[i]} necesita apertura y cierre en formato HH:MM` };
    }
    horario.push({ cerrado: false, abre: String(dia.abre).trim(), cierra: String(dia.cierra).trim() });
  }
  if (horario.every(d => d.cerrado)) return { ok: true, horario: null };
  return { ok: true, horario };
}

/** ¿El instante cae dentro del horario? Sin horario → SIEMPRE true. */
export function dentroDeHorario(horario, fecha = new Date()) {
  if (!Array.isArray(horario) || horario.length !== 7) return true;

  const ahora = fecha.getHours() * 60 + fecha.getMinutes();
  const dow = fecha.getDay();

  const hoy = horario[dow];
  if (hoy && !hoy.cerrado) {
    const abre = minutos(hoy.abre);
    const cierra = minutos(hoy.cierra);
    if (abre !== null && cierra !== null) {
      if (abre === cierra) return true;                     // 24 h
      if (cierra > abre) { if (ahora >= abre && ahora < cierra) return true; }
      else if (ahora >= abre) return true;                  // cruza medianoche
    }
  }

  const ayer = horario[(dow + 6) % 7];
  if (ayer && !ayer.cerrado) {
    const abre = minutos(ayer.abre);
    const cierra = minutos(ayer.cierra);
    if (abre !== null && cierra !== null && cierra < abre && ahora < cierra) return true;
  }

  return false;
}

/** Lee la semana desde los settings del negocio. */
export function configHorario(settings = {}) {
  return normalizarHorario(settings?.horario_operacion).horario;
}

/** ¿Este equipo está operando fuera del horario ahora mismo? */
export function fueraDeHorario(horario, fecha = new Date()) {
  if (!Array.isArray(horario) || horario.length !== 7) return false;
  return !dentroDeHorario(horario, fecha);
}

/** Ventana de hoy en texto ("09:00–18:00", "cerrado"), para los mensajes. */
export function ventanaDeHoy(horario, fecha = new Date()) {
  if (!Array.isArray(horario) || horario.length !== 7) return null;
  const dia = horario[fecha.getDay()];
  if (!dia) return null;
  return dia.cerrado ? 'cerrado' : `${dia.abre}–${dia.cierra}`;
}

/** Resumen legible de la semana, agrupando los días con el mismo horario. */
export function resumenHorario(horario) {
  if (!Array.isArray(horario) || horario.length !== 7) return 'Sin horario definido';
  const partes = [];
  let i = 0;
  while (i < 7) {
    const clave = horario[i].cerrado ? 'cerrado' : `${horario[i].abre}–${horario[i].cierra}`;
    let j = i;
    while (j + 1 < 7) {
      const sig = horario[j + 1];
      const claveSig = sig.cerrado ? 'cerrado' : `${sig.abre}–${sig.cierra}`;
      if (claveSig !== clave) break;
      j++;
    }
    const etiqueta = i === j
      ? HORARIO_DIAS_CORTO[i]
      : `${HORARIO_DIAS_CORTO[i]}–${HORARIO_DIAS_CORTO[j]}`;
    partes.push(clave === 'cerrado' ? `${etiqueta}: cerrado` : `${etiqueta} ${clave}`);
    i = j + 1;
  }
  return partes.join(' · ');
}

/** Semana por defecto del editor: lunes a sábado 09:00–18:00, domingo cerrado. */
export function horarioPorDefecto() {
  return HORARIO_DIAS.map((_, i) =>
    i === 0 ? { cerrado: true } : { cerrado: false, abre: '09:00', cierra: '18:00' }
  );
}
