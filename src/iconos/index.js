// Los iconos de producto (PLAN_REDISENO_V1 §3.3): qué dibujo le toca a un valor guardado,
// y el selector por tipo de negocio con buscador.
//
// Un producto guarda en `emoji` una de tres cosas, y ninguna se migra (trampa 7):
//   '🌮'          → el dibujo de Fluent de ese emoji; las apps viejas ven el emoji del sistema
//   'svg:z-torta' → un icono PROPIO (sin emoji); apps viejas: celular nada, desktop una caja
//   'svg:burger'  → un icono de LÍNEA de siempre (SvgIcon); no pasa por aquí
import catalogo from './catalogo.json';
import { ARCHIVOS } from './archivos';
import { llaveEmoji } from './normalizar';

export const GRUPOS = catalogo.grupos;
export const ICONOS = catalogo.iconos;

const POR_ID = new Map(ICONOS.map(i => [i.id, i]));
const POR_LLAVE = new Map(ICONOS.filter(i => i.llave).map(i => [i.llave, i]));

/** La entrada del catálogo de un valor guardado, o null (emoji fuera de la lista, línea, vacío). */
export function iconoDeValor(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  if (valor.startsWith('svg:z-')) return POR_ID.get('z_' + valor.slice(6)) || null;
  if (valor.startsWith('svg:')) return null;
  return POR_LLAVE.get(llaveEmoji(valor)) || null;
}

/** El `require` del PNG de un valor guardado, o null. */
export function archivoDeValor(valor) {
  const i = iconoDeValor(valor);
  return (i && ARCHIVOS[i.id]) || null;
}

/** Lo que se guarda en el producto al elegir un icono del catálogo. */
export function valorDeIcono(icono) {
  return icono.valor || icono.emoji;
}

/** Los grupos con los del tipo de negocio PRIMERO (el resto conserva su orden). */
export function gruposParaTipo(tipo) {
  if (!tipo) return GRUPOS;
  const suyos = GRUPOS.filter(g => g.tipos[0] === tipo);
  const tambien = GRUPOS.filter(g => g.tipos[0] !== tipo && g.tipos.includes(tipo) && g.id !== 'general');
  const resto = GRUPOS.filter(g => !suyos.includes(g) && !tambien.includes(g));
  return [...suyos, ...tambien, ...resto];
}

const sinAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Busca por nombre o sinónimo en español, sin acentos ("cafe" encuentra ☕). Nombre primero. */
export function buscarIconos(texto) {
  const q = sinAcentos(texto);
  if (!q) return [];
  const porNombre = [], porSinonimo = [];
  for (const i of ICONOS) {
    if (sinAcentos(i.nombre).includes(q)) porNombre.push(i);
    else if (i.buscar.some(s => sinAcentos(s).includes(q))) porSinonimo.push(i);
  }
  return [...porNombre, ...porSinonimo];
}

export function iconoPorId(id) {
  return POR_ID.get(id) || null;
}
