import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline, Polygon } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

// ─── ICONOS DE INTERFAZ, DE LÍNEA FINA (PLAN_REDISENO_V1 §1, Bloque 0) ───────
//
// El desktop dibuja sus iconos de línea propios (svg-icons.js) y el celular usa
// Ionicons, que son redondos y a veces rellenos: parte de lo que hacía que las
// dos apps no se parecieran. Estos son del juego LUCIDE (licencia ISC, © Lucide
// Contributors), el mismo lenguaje que los del desktop: trazo 1.8, puntas
// redondas, 24×24.
//
// ⚠️ Los iconos de PRODUCTO no viven aquí: siguen en SvgIcon.js, que es espejo
// del desktop. Esto es solo interfaz (flechas, campanas, recibos...).
//
// Cada pantalla cambia sus iconos cuando se rediseña, no antes: por eso existe
// IONICONS_A_LINEA — se puede pasar el nombre de Ionicons de siempre y sale el
// de línea. Si un nombre no está en la tabla, se dibuja con Ionicons como hoy
// (nunca un hueco en blanco).

const C = (cx, cy, r) => ({ t: 'c', p: { cx, cy, r } });
const P = (d) => ({ t: 'p', p: { d } });
const R = (x, y, width, height, rx = 0) => ({ t: 'r', p: { x, y, width, height, rx } });
const L = (x1, y1, x2, y2) => ({ t: 'l', p: { x1, y1, x2, y2 } });
const PL = (points) => ({ t: 'pl', p: { points } });
const PG = (points) => ({ t: 'pg', p: { points } });

const ESCUDO = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';
const ENGRANE = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z';
const USUARIO = [P('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), C(12, 7, 4)];
const CANDADO = R(3, 11, 18, 11, 2);

export const ICONOS_LINEA = {
  mas: [P('M5 12h14'), P('M12 5v14')],
  menos: [P('M5 12h14')],
  cerrar: [P('M18 6 6 18'), P('m6 6 12 12')],
  palomita: [P('M20 6 9 17l-5-5')],
  derecha: [P('m9 18 6-6-6-6')],
  abajo: [P('m6 9 6 6 6-6')],
  arriba: [P('m18 15-6-6-6 6')],
  flechaArriba: [P('m5 12 7-7 7 7'), P('M12 19V5')],
  flechaAbajo: [P('M12 5v14'), P('m19 12-7 7-7-7')],
  intercambio: [P('M8 3 4 7l4 4'), P('M4 7h16'), P('m16 21 4-4-4-4'), P('M20 17H4')],
  regresar: [P('M9 14 4 9l5-5'), P('M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11')],
  refrescar: [P('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'), P('M21 3v5h-5'), P('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'), P('M8 16H3v5')],
  buscar: [C(11, 11, 8), P('m21 21-4.3-4.3')],
  basura: [P('M3 6h18'), P('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'), P('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2')],
  lapiz: [P('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'), P('m15 5 4 4')],
  editar: [P('M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'), P('M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z')],
  etiqueta: [P('M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'), C(7.5, 7.5, 0.5)],
  usuario: USUARIO,
  usuarios: [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), C(9, 7, 4), P('M22 21v-2a4 4 0 0 0-3-3.87'), P('M16 3.13a4 4 0 0 1 0 7.75')],
  usuarioMas: [...USUARIO, P('M19 8v6'), P('M22 11h-6')],
  usuarioCirculo: [C(12, 12, 10), C(12, 10, 3), P('M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662')],
  billete: [R(2, 6, 20, 12, 2), C(12, 12, 2), P('M6 12h.01'), P('M18 12h.01')],
  tarjeta: [R(2, 5, 20, 14, 2), L(2, 10, 22, 10)],
  aviso: [P('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'), P('M12 9v4'), P('M12 17h.01')],
  alerta: [C(12, 12, 10), L(12, 8, 12, 12), L(12, 16, 12.01, 16)],
  reloj: [C(12, 12, 10), PL('12 6 12 12 16 14')],
  calendario: [R(3, 4, 18, 18, 2), L(16, 2, 16, 6), L(8, 2, 8, 6), L(3, 10, 21, 10)],
  impresora: [P('M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'), P('M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6'), R(6, 14, 12, 8, 1)],
  candado: [CANDADO, P('M7 11V7a5 5 0 0 1 10 0v4')],
  candadoAbierto: [CANDADO, P('M7 11V7a5 5 0 0 1 9.9-1')],
  llave: [C(7.5, 15.5, 5.5), P('m21 2-9.6 9.6'), P('m15.5 7.5 3 3L22 7l-3-3')],
  escudo: [P(ESCUDO)],
  escudoOk: [P(ESCUDO), P('m9 12 2 2 4-4')],
  carrito: [C(8, 21, 1), C(19, 21, 1), P('M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12')],
  bolsa: [P('M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z'), P('M3 6h18'), P('M16 10a4 4 0 0 1-8 0')],
  cubiertos: [P('M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2'), P('M7 2v20'), P('M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7')],
  bici: [C(5.5, 17.5, 3.5), C(18.5, 17.5, 3.5), C(15, 5, 1), P('M12 17.5V14l-3-3 4-3 2 3h2')],
  celular: [R(5, 2, 14, 20, 2), P('M12 18h.01')],
  telefono: [P('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z')],
  capas: [P('m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'), P('m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'), P('m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65')],
  cuadricula: [R(3, 3, 7, 7, 1), R(14, 3, 7, 7, 1), R(14, 14, 7, 7, 1), R(3, 14, 7, 7, 1)],
  regalo: [R(3, 8, 18, 4, 1), P('M12 8v13'), P('M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7'), P('M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5')],
  caja: [P('M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'), P('M12 22V12'), P('m3.3 7 8.7 5 8.7-5')],
  circuloMas: [C(12, 12, 10), P('M8 12h8'), P('M12 8v8')],
  circuloMenos: [C(12, 12, 10), P('M8 12h8')],
  circuloX: [C(12, 12, 10), P('m15 9-6 6'), P('m9 9 6 6')],
  circuloOk: [C(12, 12, 10), P('m9 12 2 2 4-4')],
  circulo: [C(12, 12, 10)],
  circuloPunto: [C(12, 12, 10), C(12, 12, 4)],
  cuadro: [R(3, 3, 18, 18, 2)],
  cuadroOk: [R(3, 3, 18, 18, 2), P('m9 12 2 2 4-4')],
  tele: [R(2, 7, 20, 15, 2), PL('17 2 12 7 7 2')],
  monitor: [R(2, 3, 20, 14, 2), L(8, 21, 16, 21), L(12, 17, 12, 21)],
  tendencia: [PL('22 7 13.5 15.5 8.5 10.5 2 17'), PL('16 7 22 7 22 13')],
  barras: [P('M3 3v18h18'), P('M18 17V9'), P('M13 17V5'), P('M8 17v-3')],
  recibo: [P('M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z'), P('M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8'), P('M12 17.5v-11')],
  documento: [P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'), P('M14 2v4a2 2 0 0 0 2 2h4'), P('M10 9H8'), P('M16 13H8'), P('M16 17H8')],
  nube: [P('M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z')],
  nubeSubir: [P('M12 13v8'), P('M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'), P('m8 17 4-4 4 4')],
  nubeApagada: [P('m2 2 20 20'), P('M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193'), P('M21.532 16.5A4.5 4.5 0 0 0 17.5 8h-1.79A7.008 7.008 0 0 0 10 5.07')],
  engrane: [P(ENGRANE), C(12, 12, 3)],
  ajustes: [L(21, 4, 14, 4), L(10, 4, 3, 4), L(21, 12, 12, 12), L(8, 12, 3, 12), L(21, 20, 16, 20), L(12, 20, 3, 20), L(14, 2, 14, 6), L(8, 10, 8, 14), L(16, 18, 16, 22)],
  enviar: [P('m22 2-7 20-4-9-9-4Z'), P('M22 2 11 13')],
  correo: [R(2, 4, 20, 16, 2), P('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7')],
  mensaje: [P('M7.9 20A9 9 0 1 0 4 16.1L2 22Z')],
  ubicacion: [P('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'), C(12, 10, 3)],
  imagen: [R(3, 3, 18, 18, 2), C(9, 9, 2), P('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21')],
  matraz: [P('M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2'), P('M8.5 2h7'), P('M7 16h10')],
  vaso: [P('M4.5 3h15'), P('M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3'), P('M6 14h12')],
  ojo: [P('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'), C(12, 12, 3)],
  libro: [P('M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'), P('M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z')],
  rama: [L(6, 3, 6, 15), C(18, 6, 3), C(6, 18, 3), P('M18 9a9 9 0 0 1-9 9')],
  medalla: [C(12, 8, 6), P('M15.477 12.89 17 22l-5-3-5 3 1.523-9.11')],
  trofeo: [P('M6 9H4.5a2.5 2.5 0 0 1 0-5H6'), P('M18 9h1.5a2.5 2.5 0 0 0 0-5H18'), P('M4 22h16'), P('M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'), P('M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'), P('M18 2H6v7a6 6 0 0 0 12 0V2Z')],
  tienda: [P('m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7'), P('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'), P('M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4'), P('M2 7h20'), P('M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7')],
  estrella: [PG('12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2')],
  campana: [P('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'), P('M10.3 21a1.94 1.94 0 0 0 3.4 0')],
  salir: [P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), PL('16 17 21 12 16 7'), L(21, 12, 9, 12)],
  izquierda: [P('m15 18-6-6 6-6')],
  porcentaje: [L(19, 5, 5, 19), C(6.5, 6.5, 2.5), C(17.5, 17.5, 2.5)],
  edificio: [R(4, 2, 16, 20, 2), P('M9 22v-4h6v4'), P('M8 6h.01'), P('M12 6h.01'), P('M16 6h.01'), P('M8 10h.01'), P('M12 10h.01'), P('M16 10h.01'), P('M8 14h.01'), P('M12 14h.01'), P('M16 14h.01')],
  hoy: [R(3, 4, 18, 18, 2), L(16, 2, 16, 6), L(8, 2, 8, 6), L(3, 10, 21, 10), P('M8 14h.01'), P('M12 14h.01')],
};

// Nombre de Ionicons → icono de línea. Son los 98 nombres que usaba la app el
// 2026-09-22 (sacados con Babel de los 33 archivos que importan Ionicons).
// `relleno: true` = el original era un icono RELLENO (una estrella encendida):
// se dibuja con relleno para no perder lo que significaba.
export const IONICONS_A_LINEA = {
  'add': 'mas', 'add-circle-outline': 'circuloMas', 'remove': 'menos',
  'remove-circle-outline': 'circuloMenos', 'close': 'cerrar', 'close-circle': 'circuloX',
  'close-circle-outline': 'circuloX', 'checkmark': 'palomita', 'checkmark-circle': 'circuloOk',
  'checkmark-circle-outline': 'circuloOk', 'checkbox': 'cuadroOk', 'square-outline': 'cuadro',
  'radio-button-off': 'circulo', 'radio-button-on': 'circuloPunto',
  'chevron-forward': 'derecha', 'chevron-down': 'abajo', 'chevron-down-outline': 'abajo',
  'chevron-up': 'arriba', 'chevron-up-outline': 'arriba',
  'arrow-up-outline': 'flechaArriba', 'arrow-down-outline': 'flechaAbajo',
  'swap-horizontal-outline': 'intercambio', 'return-down-back-outline': 'regresar',
  'refresh-outline': 'refrescar', 'search-outline': 'buscar', 'trash-outline': 'basura',
  'pencil-outline': 'lapiz', 'create-outline': 'editar',
  'pricetag': 'etiqueta', 'pricetag-outline': 'etiqueta',
  'person': 'usuario', 'person-outline': 'usuario', 'person-add-outline': 'usuarioMas',
  'person-circle-outline': 'usuarioCirculo', 'people': 'usuarios', 'people-outline': 'usuarios',
  'cash-outline': 'billete', 'card-outline': 'tarjeta',
  'warning-outline': 'aviso', 'alert-circle': 'alerta', 'alert-circle-outline': 'alerta',
  'time': 'reloj', 'time-outline': 'reloj', 'calendar-outline': 'calendario', 'today-outline': 'hoy',
  'print-outline': 'impresora', 'lock-closed': 'candado', 'lock-closed-outline': 'candado',
  'lock-open-outline': 'candadoAbierto', 'key-outline': 'llave',
  'shield-outline': 'escudo', 'shield-checkmark-outline': 'escudoOk',
  'cart': 'carrito', 'cart-outline': 'carrito', 'bag-handle-outline': 'bolsa',
  'restaurant-outline': 'cubiertos', 'bicycle-outline': 'bici',
  'phone-portrait-outline': 'celular', 'call-outline': 'telefono',
  'layers': 'capas', 'layers-outline': 'capas', 'grid': 'cuadricula', 'grid-outline': 'cuadricula',
  'gift-outline': 'regalo', 'cube': 'caja', 'cube-outline': 'caja',
  'tv-outline': 'tele', 'trending-up': 'tendencia', 'trending-up-outline': 'tendencia',
  'bar-chart': 'barras', 'bar-chart-outline': 'barras',
  'receipt': 'recibo', 'receipt-outline': 'recibo', 'document-text-outline': 'documento',
  'cloud-outline': 'nube', 'cloud-upload-outline': 'nubeSubir', 'cloud-offline-outline': 'nubeApagada',
  'settings': 'engrane', 'settings-outline': 'engrane', 'options-outline': 'ajustes',
  'send': 'enviar', 'mail-unread-outline': 'correo',
  'chatbubble-ellipses': 'mensaje', 'chatbubble-ellipses-outline': 'mensaje', 'logo-whatsapp': 'mensaje',
  'location-outline': 'ubicacion', 'image-outline': 'imagen', 'images': 'imagen',
  'flask-outline': 'matraz', 'beaker-outline': 'vaso', 'eye-outline': 'ojo', 'book-outline': 'libro',
  'git-branch-outline': 'rama', 'medal': 'medalla', 'trophy-outline': 'trofeo',
  'storefront-outline': 'tienda',
  'star': { nombre: 'estrella', relleno: true }, 'star-outline': 'estrella',
};

const COMPONENTE = { c: Circle, p: Path, r: Rect, l: Line, pl: Polyline, pg: Polygon };

/** Traduce un nombre (de línea o de Ionicons) a { nombre, relleno } o null. */
export function resolverIcono(nombre) {
  if (ICONOS_LINEA[nombre]) return { nombre, relleno: false };
  const t = IONICONS_A_LINEA[nombre];
  if (!t) return null;
  return typeof t === 'string' ? { nombre: t, relleno: false } : t;
}

/**
 * <Icono nombre="recibo" size={18} color="#2563eb" />
 * Acepta un nombre de ICONOS_LINEA o uno de Ionicons (se traduce solo).
 */
export default function Icono({ nombre, size = 18, color = '#111827', grosor = 1.8, relleno, style }) {
  const r = resolverIcono(nombre);
  if (!r) return <Ionicons name={nombre} size={size} color={color} style={style} />;
  const lleno = relleno ?? r.relleno;
  return (
    <Svg
      width={size} height={size} viewBox="0 0 24 24" style={style}
      fill={lleno ? color : 'none'} stroke={color} strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {ICONOS_LINEA[r.nombre].map((el, i) => {
        const Comp = COMPONENTE[el.t];
        return <Comp key={i} {...el.p} />;
      })}
    </Svg>
  );
}
