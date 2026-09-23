// Ayudas del EDITOR de horario (Ajustes → Horario). No deciden si una hora
// está dentro o fuera: eso es `horarios.js`, que es copia del backend y no se
// toca desde aquí. Esto solo sirve para elegir horas sin teclado.

/** "09:00" → "9:00 a.m."; "00:30" → "12:30 a.m."; basura → la misma cadena. */
export function etiquetaHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return hhmm || '—';
  const h = Number(m[1]);
  const sufijo = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${sufijo}`;
}

/** Las 24 horas para el selector: { valor: '09', texto: '9 a.m.' }. */
export const HORAS = Array.from({ length: 24 }, (_, h) => ({
  valor: String(h).padStart(2, '0'),
  texto: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'a.m.' : 'p.m.'}`,
}));

/**
 * Minutos que ofrece el selector. Si la hora guardada trae otro minuto
 * (09:10, escrito a mano antes), se agrega para no cambiarla sin querer.
 */
export function minutosPara(hhmm) {
  const base = ['00', '15', '30', '45'];
  const m = /^\d{1,2}:(\d{2})$/.exec(String(hhmm || ''));
  if (m && !base.includes(m[1])) return [...base, m[1]].sort();
  return base;
}

/** Separa "09:30" en { h: '09', m: '30' }, con 09:00 si no se entiende. */
export function partesHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return { h: '09', m: '00' };
  return { h: m[1].padStart(2, '0'), m: m[2] };
}

/**
 * Copia las horas del día `desde` a los otros seis. Los días marcados como
 * CERRADOS se quedan cerrados (el domingo que no abres no se abre solo), pero
 * reciben las horas nuevas, así que al abrirlos ya traen ese horario.
 * Devuelve una semana NUEVA y cuántos días abiertos cambiaron.
 */
export function copiarHorario(semana, desde) {
  const origen = semana?.[desde];
  if (!Array.isArray(semana) || !origen || origen.cerrado) return { semana, cambiados: 0 };
  let cambiados = 0;
  const nueva = semana.map((d, i) => {
    if (i === desde) return { ...d };
    if (!d.cerrado) cambiados++;
    return { ...d, abre: origen.abre, cierra: origen.cierra };
  });
  return { semana: nueva, cambiados };
}
