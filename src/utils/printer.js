/**
 * Zenit POS — Impresión Bluetooth (ESC/POS)
 *
 * Usa: react-native-bluetooth-classic
 * Requiere compilación EAS Build (no funciona en Expo Go).
 *
 * Compatible con impresoras térmicas Bluetooth de 58mm y 80mm.
 */

import { Platform } from 'react-native';

let BT = null;
try {
  BT = require('react-native-bluetooth-classic').default;
} catch {
  // No disponible en Expo Go o web
}

// ─── Disponibilidad ───────────────────────────────────────────────────────────

export function isPrinterAvailable() {
  return BT !== null && Platform.OS !== 'web';
}

// ─── Dispositivos ─────────────────────────────────────────────────────────────

/** Devuelve la lista de dispositivos Bluetooth ya emparejados en el sistema */
export async function getPairedDevices() {
  if (!BT) throw new Error('UNAVAILABLE');
  const devices = await BT.getBondedDevices();
  return (devices || []).map(d => ({ name: d.name || 'Desconocido', address: d.address || d.id }));
}

/** Conecta a una impresora por dirección MAC. Devuelve el objeto de conexión. */
export async function connectPrinter(address) {
  if (!BT) throw new Error('UNAVAILABLE');
  const connected = await BT.connectToDevice(address);
  return connected;
}

/** Desconecta todos los dispositivos activos */
export async function disconnectPrinter(address) {
  if (!BT) return;
  try {
    await BT.disconnectFromDevice(address);
  } catch { /* ignorar */ }
}

// ─── Generador ESC/POS ────────────────────────────────────────────────────────
// ESC/POS es el lenguaje que entienden la mayoría de impresoras térmicas.
// Enviamos secuencias de bytes directamente al dispositivo Bluetooth.

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  RESET:        [ESC, 0x40],                   // inicializar impresora
  ALIGN_LEFT:   [ESC, 0x61, 0x00],             // alinear izquierda
  ALIGN_CENTER: [ESC, 0x61, 0x01],             // alinear centro
  ALIGN_RIGHT:  [ESC, 0x61, 0x02],             // alinear derecha
  BOLD_ON:      [ESC, 0x45, 0x01],             // negrita activada
  BOLD_OFF:     [ESC, 0x45, 0x00],             // negrita desactivada
  FONT_NORMAL:  [ESC, 0x21, 0x00],             // tamaño normal
  FONT_LARGE:   [ESC, 0x21, 0x30],             // doble ancho y alto
  CUT:          [GS,  0x56, 0x41, 0x00],       // cortar papel
  FEED_3:       [LF, LF, LF],                  // 3 líneas en blanco
};

/** Convierte un array de números a string de caracteres (para envío por BT) */
function bytesToString(bytes) {
  return String.fromCharCode(...bytes);
}

/** Convierte texto a bytes usando encoding Latin-1 (compatible con impresoras) */
function textToBytes(text) {
  // Reemplazar caracteres especiales del español a equivalentes ASCII
  const normalized = text
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
    .replace(/Ó/g, 'O').replace(/Ú/g, 'U').replace(/Ü/g, 'U')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/¿/g, '?').replace(/¡/g, '!');
  return normalized;
}

// ─── Constructor de ticket ────────────────────────────────────────────────────

class TicketBuilder {
  constructor() {
    this.data = '';
  }

  cmd(...bytes) {
    this.data += bytesToString(bytes.flat());
    return this;
  }

  text(str) {
    this.data += textToBytes(str);
    return this;
  }

  line(str = '') {
    this.data += textToBytes(str) + '\n';
    return this;
  }

  separator(width = 32) {
    return this.line('-'.repeat(width));
  }

  center(str) {
    return this.cmd(CMD.ALIGN_CENTER).line(str);
  }

  left(str) {
    return this.cmd(CMD.ALIGN_LEFT).line(str);
  }

  right(str) {
    return this.cmd(CMD.ALIGN_RIGHT).line(str);
  }

  bold(str, align = CMD.ALIGN_LEFT) {
    return this.cmd(CMD.BOLD_ON).cmd(align).line(str).cmd(CMD.BOLD_OFF);
  }

  /** Línea con texto a la izquierda y precio a la derecha, en 32 columnas */
  splitLine(left, right, width = 32) {
    const spaces = width - left.length - right.length;
    const line = left + ' '.repeat(Math.max(1, spaces)) + right;
    return this.cmd(CMD.ALIGN_LEFT).line(line);
  }

  build() {
    return this.data;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date) {
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

const METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const TIPO   = { local: 'Comer aqui', llevar: 'Para llevar', domicilio: 'Domicilio' };

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Imprime un ticket de venta completo.
 *
 * @param {string}  address          - Dirección MAC de la impresora
 * @param {object}  opts
 * @param {string}  opts.businessName
 * @param {string}  [opts.businessPhone]
 * @param {string}  [opts.businessAddress]
 * @param {boolean} [opts.showPhone]
 * @param {boolean} [opts.showAddress]
 * @param {string}  [opts.currency]        - Símbolo de moneda (default: $)
 * @param {Array}   opts.items             - [{name, qty, price, notes?}]
 * @param {number}  opts.total
 * @param {number}  [opts.discount]
 * @param {string}  [opts.paymentMethod]
 * @param {string}  [opts.orderType]
 * @param {string|number} [opts.orderId]
 * @param {string}  [opts.cashier]
 * @param {string}  [opts.tableName]
 */
export async function printReceipt(address, opts = {}) {
  if (!BT) throw new Error('UNAVAILABLE');

  const {
    businessName  = 'Mi Negocio',
    businessPhone,
    businessAddress,
    showPhone     = true,
    showAddress   = true,
    currency      = '$',
    items         = [],
    total         = 0,
    discount      = 0,
    paymentMethod = 'efectivo',
    orderType,
    orderId,
    cashier,
    tableName,
  } = opts;

  const now    = new Date();
  const ticket = new TicketBuilder();

  ticket.cmd(CMD.RESET);

  // Encabezado
  ticket
    .bold(businessName, CMD.ALIGN_CENTER)
    .cmd(CMD.ALIGN_CENTER);
  if (showPhone && businessPhone) ticket.line(`Tel: ${businessPhone}`);
  if (showAddress && businessAddress) ticket.line(businessAddress);
  ticket.separator();

  // Info del pedido
  ticket.cmd(CMD.ALIGN_LEFT);
  if (orderId)   ticket.line(`Folio: #${orderId}`);
  ticket.line(`Fecha: ${formatDate(now)}`);
  ticket.line(`Hora:  ${formatTime(now)}`);
  if (cashier)   ticket.line(`Cajero: ${cashier}`);
  if (tableName) ticket.line(`Mesa: ${tableName}`);
  if (orderType) ticket.line(`Tipo: ${TIPO[orderType] || orderType}`);
  ticket.separator();

  // Productos
  for (const item of items) {
    const qty      = item.qty || item.quantity || 1;
    const price    = parseFloat(item.price || item.unit_price || 0);
    const subtotal = price * qty;
    ticket.splitLine(`${qty}x ${item.name}`, `${currency}${subtotal.toFixed(2)}`);
    if (item.notes) ticket.left(`   * ${item.notes}`);
  }
  ticket.separator();

  // Totales
  if (discount > 0) {
    const subtotal = total + discount;
    ticket.right(`Subtotal: ${currency}${subtotal.toFixed(2)}`);
    ticket.right(`Descuento: -${currency}${discount.toFixed(2)}`);
  }
  ticket
    .cmd(CMD.BOLD_ON)
    .right(`TOTAL: ${currency}${total.toFixed(2)}`)
    .cmd(CMD.BOLD_OFF)
    .right(`Pago: ${METODO[paymentMethod] || paymentMethod}`);

  // Pie
  ticket
    .cmd(CMD.ALIGN_CENTER)
    .line('')
    .line('Gracias por su preferencia')
    .line('Zenit POS')
    .cmd(CMD.FEED_3)
    .cmd(CMD.CUT);

  // Enviar a la impresora
  const device = await BT.connectToDevice(address);
  await device.write(ticket.build());
  await BT.disconnectFromDevice(address);
}

/**
 * Imprime un ticket de prueba para verificar la conexión.
 *
 * @param {string} address       - Dirección MAC
 * @param {string} businessName  - Nombre del negocio
 * @param {string} currency      - Símbolo de moneda
 */
export async function printTest(address, businessName = 'Mi Negocio', currency = '$') {
  if (!BT) throw new Error('UNAVAILABLE');

  const now    = new Date();
  const ticket = new TicketBuilder();

  ticket
    .cmd(CMD.RESET)
    .bold('PRUEBA DE IMPRESION', CMD.ALIGN_CENTER)
    .center(businessName)
    .separator()
    .left(`${formatDate(now)}  ${formatTime(now)}`)
    .separator()
    .splitLine('1x Producto ejemplo', `${currency}10.00`)
    .splitLine('2x Otro producto', `${currency}25.00`)
    .separator()
    .cmd(CMD.BOLD_ON)
    .right(`TOTAL: ${currency}35.00`)
    .cmd(CMD.BOLD_OFF)
    .cmd(CMD.ALIGN_CENTER)
    .line('')
    .line('Impresora OK')
    .line('Zenit POS')
    .cmd(CMD.FEED_3)
    .cmd(CMD.CUT);

  const device = await BT.connectToDevice(address);
  await device.write(ticket.build());
  await BT.disconnectFromDevice(address);
}
