#!/usr/bin/env node
// ============================================================================
// scripts/smoke-promos.js — las PROMOS en el celular (PLAN_OFERTAS_V1, Bloque 3)
//
//     npm run smoke:promos
//
// Carga los archivos REALES (`src/utils/promos.js`, `src/offline/*.js`,
// `src/utils/ticketLineas.js`, `src/utils/cocina.js`) con Babel, sobre el
// SQLite que trae Node, y comprueba cada regla nueva del bloque:
//
//   · el renglón de la promo cobra lo mismo que dice el servidor, online y
//     como venta DIFERIDA desde la cola offline (promo_price + list_price);
//   · la promo se ofrece solo en su día y su hora, y nunca con lo agotado
//     (un stock NULL NO es agotado);
//   · el descuento de la cuenta usa la MISMA base que el servidor (§3.4);
//   · en la mesa, la clave lleva el grupo (trampa 2) y al dividir la promo es
//     UNA unidad (trampa 5);
//   · el ticket la imprime junta y dice "Ahorraste $X";
//   · la caché offline de promos, y que el modo sin cuenta no tiene ninguna;
//   · la cocina ESCONDE la comanda de mesa en vez de cerrarla (§60.4).
//
// Si el repo del backend está al lado, los precios se comparan contra el
// `utils/promos.js` DEL SERVIDOR; si no, esa parte se salta con un aviso.
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

process.env.TZ = 'America/Mexico_City';

const RAIZ = path.resolve(__dirname, '..');
const RUTA_SERVIDOR = path.join(process.env.ZENIT_BACKEND || path.join(RAIZ, '..', 'zenit-pos-backend'), 'utils', 'promos.js');
const servidor = fs.existsSync(RUTA_SERVIDOR) ? require(RUTA_SERVIDOR) : null;

// ─── Dobles de expo-* y del cliente HTTP ────────────────────────────────────
function abrirBaseFalsa() {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(sql, params = []) { return db.prepare(sql).all(...params); },
    async getFirstAsync(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    async withTransactionAsync(fn) { await fn(); },
  };
}
let contadorUuid = 0;
const secureStore = {
  _d: new Map(),
  async getItemAsync(k) { return this._d.has(k) ? this._d.get(k) : null; },
  async setItemAsync(k, v) { this._d.set(k, v); },
  async deleteItemAsync(k) { this._d.delete(k); },
};
const apiFalso = {
  token: 'tok',
  combos: [],
  fallarCombos: false,
  pedidosCreados: [],
  async getCombos() { if (this.fallarCombos) throw new Error('Sin conexión al servidor'); return this.combos; },
  async createOrder(body) { this.pedidosCreados.push(body); throw new Error('Sin conexión al servidor'); },
  async getProductsGrouped() { throw new Error('Sin conexión al servidor'); },
  async getModifiers() { throw new Error('Sin conexión al servidor'); },
  async getCustomers() { throw new Error('Sin conexión al servidor'); },
};

const cache = new Map();
function cargar(rutaRelativa) {
  const archivo = path.join(RAIZ, rutaRelativa);
  if (cache.has(archivo)) return cache.get(archivo);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  cache.set(archivo, modulo.exports);
  const req = (spec) => {
    if (spec === 'expo-sqlite') return { openDatabaseAsync: async () => abrirBaseFalsa() };
    if (spec === 'expo-crypto') return { randomUUID: () => `uuid-${++contadorUuid}` };
    if (spec === 'expo-secure-store') return secureStore;
    if (spec === 'expo-file-system') return { File: class {}, Paths: { cache: {} } };
    if (spec === 'expo-sharing') return { isAvailableAsync: async () => false, shareAsync: async () => {} };
    if (spec.endsWith('api/client')) return { api: apiFalso };
    if (spec.startsWith('.')) {
      const destino = path.relative(RAIZ, path.resolve(path.dirname(archivo), spec)).replace(/\\/g, '/');
      return cargar(destino.endsWith('.js') ? destino : destino + '.js');
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(req, modulo, modulo.exports);
  cache.set(archivo, modulo.exports);
  return modulo.exports;
}

const P = cargar('src/utils/promos.js');
const pagos = cargar('src/utils/pagos.js');
const ticket = cargar('src/utils/ticketLineas.js');
const cocina = cargar('src/utils/cocina.js');
const db = cargar('src/offline/db.js');
const local = cargar('src/offline/local.js');
const ventas = cargar('src/offline/ventasOffline.js');

let total = 0, fallos = 0;
const ok = (desc, cond, detalle = '') => {
  total++;
  console.log(`  ${cond ? '✓' : '✗'} ${desc}${cond || !detalle ? '' : '\n      → ' + detalle}`);
  if (!cond) fallos++;
};
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const soloCodigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ─── El negocio de prueba ───────────────────────────────────────────────────
const TACOS = 1, BEBIDAS = 2;
const productos = [
  { id: 11, name: 'Pastor', price: 25, category_id: TACOS, stock: null, active: true },
  { id: 12, name: 'Arrachera', price: 35, category_id: TACOS, stock: null, active: true },
  { id: 13, name: 'Suadero', price: 24.5, category_id: TACOS, stock: 0, active: true },   // agotado
  { id: 21, name: 'Coca', price: 20, category_id: BEBIDAS, stock: 5, active: true },
];
const categorias = [{ id: TACOS, name: 'Tacos' }, { id: BEBIDAS, name: 'Bebidas' }];
// Lo que devuelve GET /offers/combos: la forma nueva en `slots`.
const comboMartes = {
  id: 7, name: 'Martes 2x1 tacos', tipo: 'regalar_mas_barato', paga: 1, price: 0, active: true,
  calendario: { dias: [2] }, items: [], slots: [{ quantity: 2, product_ids: [], category_id: TACOS }],
};
const promo = P.promoDeCatalogo(comboMartes);
const QUESO = { option_id: 5, group_id: 1, group: 'Extras', name: 'Extra queso', price_delta: 10 };
const elegidos = [
  { product_id: 11, nombre: 'Pastor', precio: 25, modificadores: [QUESO] },
  { product_id: 12, nombre: 'Arrachera', precio: 35, modificadores: [] },
];

(async () => {
  console.log('\n── 1. El renglón de la promo ──\n');
  const renglon = P.armarRenglonPromo(promo, elegidos, { grupo: 'g-1' });
  ok('2x1 pastor + arrachera: la promo cuesta $35 (se regala el más barato)', cerca(renglon.precio_promo, 35));
  ok('el queso extra se COBRA encima: el renglón cobra $45', cerca(renglon.precio, 45), String(renglon.precio));
  ok('reparto proporcional a centavos: 14.58 + 20.42', cerca(renglon.productos[0].parte, 14.58) && cerca(renglon.productos[1].parte, 20.42),
    JSON.stringify(renglon.productos.map(p => p.parte)));
  ok('el cliente ahorra $25', cerca(renglon.ahorro, 25));
  let lanza = false;
  try { P.armarRenglonPromo(promo, elegidos, {}); } catch { lanza = true; }
  ok('sin uuid de grupo el renglón NO se arma (dos promos iguales se fundirían)', lanza);

  const sub = P.renglonParaVenta(renglon);
  ok('a POST /orders viaja como UN renglón con sus productos', sub.promo_id === 7 && sub.promo_group === 'g-1' && sub.productos.length === 2);
  ok('promo_price es la suma de las PARTES, sin extras ($35, no $45)', cerca(sub.promo_price, 35), String(sub.promo_price));
  ok('cada producto lleva su list_price y sus extras', sub.productos[0].list_price === 25 && sub.productos[0].modifiers.length === 1 && !sub.productos[1].modifiers);
  const suelto = P.renglonParaVenta({ product_id: 21, nombre: 'Coca', precio: 20, precio_base: 20, modificadores: [], nota: '' });
  ok('un renglón suelto sale IDÉNTICO a antes del bloque',
    JSON.stringify(suelto) === JSON.stringify({ product_id: 21, quantity: 1, unit_price: 20, base_unit_price: 20, modifiers: undefined, notes: undefined }));

  if (servidor) {
    const online = servidor.precioPromo(promo, sub.productos.map(p => p.list_price));
    ok('ONLINE el servidor cobra lo mismo que el celular', cerca(online, renglon.precio_promo));
    // DIFERIDA: exactamente lo que hace routes/orders.js con la cola offline.
    const diferida = servidor.armarPromo(
      { tipo: 'precio_fijo', price: 0 },
      sub.productos.map((p, i) => ({ precio: p.list_price, delta: i === 0 ? 10 : 0 })),
      sub.promo_price,
    );
    ok('DIFERIDA (cola offline) el servidor reparte las MISMAS partes y unit_price',
      diferida.renglones.every((r, i) => cerca(r.parte, renglon.productos[i].parte) && cerca(r.unit_price, renglon.productos[i].precio)),
      JSON.stringify(diferida.renglones));
  } else {
    console.log('  ⏭️  sin zenit-pos-backend al lado: no se compara contra el servidor');
  }

  const planos = P.aplanarRenglonesVenta([sub, suelto]);
  ok('aplanado: la promo se vuelve un renglón por producto con su parte (como el servidor)',
    planos.length === 3 && cerca(planos[0].unit_price, 24.58) && cerca(planos[0].base_unit_price, 14.58) && planos[0].promo_group === 'g-1' && planos[2].product_id === 21,
    JSON.stringify(planos.map(p => [p.unit_price, p.base_unit_price])));
  const nombres = P.nombresAplanados([renglon, { nombre: 'Coca', product_id: 21 }]);
  ok('los nombres del carrito aplanado van en el MISMO orden', nombres.map(n => n.name).join() === 'Pastor,Arrachera,Coca');

  console.log('\n── 2. Cuándo se ofrece la promo ──\n');
  const martes = new Date(2026, 8, 22, 13, 0);   // martes 22 de sept 2026, 13:00 local
  const miercoles = new Date(2026, 8, 23, 13, 0);
  ok('el martes a la 1 p. m. el 2x1 sale en la pantalla', P.promosActivasAhora([promo], productos, { fecha: martes }).length === 1);
  ok('el miércoles NO existe en la pantalla', P.promosActivasAhora([promo], productos, { fecha: miercoles }).length === 0);
  ok('sin Premium (o sin cuenta) no hay promos', P.promosActivasAhora([promo], productos, { fecha: martes, premium: false }).length === 0);
  const hueco = promo.huecos[0];
  const elegibles = P.productosDelHueco(hueco, productos).map(p => p.id);
  ok('un producto agotado (stock 0) no se ofrece en la hoja (trampa 8)', !elegibles.includes(13));
  ok('stock NULL NO es agotado: "sin control" se ofrece', elegibles.includes(11) && elegibles.includes(12));
  const soloAgotados = productos.map(p => (p.category_id === TACOS ? { ...p, stock: 0 } : p));
  ok('si ya no queda nada elegible, el botón de la promo no se enseña', P.promosActivasAhora([promo], soloAgotados, { fecha: martes }).length === 0);
  const mal = P.promoDeCatalogo({ ...comboMartes, paga: 2 });
  ok('un "2x1" que cobra 2 de 2 no se ofrece (el servidor lo rechazaría)', P.promosActivasAhora([mal], productos, { fecha: martes }).length === 0);
  const viejo = P.promoDeCatalogo({ id: 3, name: 'Combo viejo', price: 50, items: [{ product_id: 11, quantity: 1 }, { product_id: 21, quantity: 1 }] });
  ok('un combo de antes (sin `slots`) se lee de sus productos fijos', viejo.huecos.length === 2 && viejo.tipo === 'precio_fijo' && viejo.lleva === 2);
  const happy = P.promoDeCatalogo({ ...comboMartes, calendario: { dias: [5], desde: '22:00', hasta: '02:00' } });
  ok('happy hour del viernes 22–02 sigue vivo el sábado a la 1:30', P.promosActivasAhora([happy], productos, { fecha: new Date(2026, 8, 26, 1, 30) }).length === 1);
  ok('…y el sábado a las 22:30 no', P.promosActivasAhora([happy], productos, { fecha: new Date(2026, 8, 26, 22, 30) }).length === 0);
  ok('"10% los lunes" solo vale el lunes', P.descuentoVigenteLocal({ active: true, calendario: { dias: [1] } }, new Date(2026, 8, 21, 12)) &&
    !P.descuentoVigenteLocal({ active: true, calendario: { dias: [1] } }, martes));

  // Lo encontrado en el emulador: un combo de productos fijos hacía tocar
  // productos que no tenían alternativa.
  const fijo = P.promoDeCatalogo({ id: 3, name: 'Parejas', price: 200, items: [{ product_id: 11, quantity: 1 }, { product_id: 21, quantity: 2 }] });
  const sinExtras = () => false;
  ok('hoja: si al hueco solo le cabe UN producto, se pone solo', (P.eleccionAutomatica(fijo, [], productos, sinExtras) || {}).id === 11);
  ok('…y sigue con el siguiente hueco', (P.eleccionAutomatica(fijo, [{ hueco: 0 }], productos, sinExtras) || {}).id === 21);
  ok('…pero si ese producto tiene extras, se pregunta (el queso lo decide el cliente)', P.eleccionAutomatica(fijo, [], productos, (id) => id === 11) === null);
  ok('con varios productos posibles no se elige nada solo', P.eleccionAutomatica(promo, [], productos, sinExtras) === null);
  ok('con la promo completa, nada más', P.eleccionAutomatica(fijo, [{ hueco: 0 }, { hueco: 1 }, { hueco: 1 }], productos, sinExtras) === null);

  console.log('\n── 3. Juntar ofertas: la base del descuento (§3.4) ──\n');
  const r35 = P.armarRenglonPromo(promo, [{ product_id: 11, nombre: 'Pastor', precio: 25 }, { product_id: 12, nombre: 'Arrachera', precio: 35 }], { grupo: 'g-2' });
  const carrito = [r35, { product_id: 21, nombre: 'Coca', precio: 20, precio_base: 20 }];
  const diezPct = { type: 'percentage', value: 10 };
  ok('apagado (de fábrica): 10% de promo $35 + coca $20 descuenta $2', cerca(P.montoDescuento(diezPct, P.baseDescuentoDe(carrito, false)), 2));
  ok('encendido: descuenta $5.50', cerca(P.montoDescuento(diezPct, P.baseDescuentoDe(carrito, true)), 5.5));
  ok('un descuento fijo mayor que la base se topa a la base', cerca(P.montoDescuento({ type: 'fixed', value: 50 }, P.baseDescuentoDe(carrito, false)), 20));
  ok('el interruptor se lee de los ajustes; cualquier duda es APAGADO',
    P.ofertasAcumulablesDe({ ofertas_acumulables: true }) && !P.ofertasAcumulablesDe({}) && !P.ofertasAcumulablesDe(null) && !P.ofertasAcumulablesDe({ ofertas_acumulables: 'no' }));

  console.log('\n── 4. La sugerencia "¿Convertir a 2x1?" ──\n');
  const sueltos = [
    { uid: 'a', product_id: 11, nombre: 'Pastor', precio: 25, precio_base: 25 },
    { uid: 'b', product_id: 21, nombre: 'Coca', precio: 20, precio_base: 20 },
    { uid: 'c', product_id: 12, nombre: 'Arrachera', precio: 35, precio_base: 35 },
    { uid: 'd', product_id: 12, nombre: 'Arrachera', precio: 35, precio_base: 35 },
  ];
  const s = P.sugerirPromo(sueltos, [promo], productos);
  ok('con tacos sueltos que llenan el 2x1, se sugiere', Boolean(s));
  ok('elige la pareja MÁS CARA (arrachera + arrachera: ahorra $35)', s && cerca(s.ahorro, 35) && s.indices.sort().join() === '2,3', s && JSON.stringify(s));
  const convertido = P.convertirEnPromo(sueltos, s, { grupo: 'g-s' });
  ok('al convertir: los dos tacos se vuelven UN renglón de promo y lo demás queda igual',
    convertido.length === 3 && convertido.filter(i => i.tipo === 'promo').length === 1 && convertido[0].uid === 'a' && convertido[1].uid === 'b');
  ok('una promo ya armada no se vuelve a sugerir', !P.sugerirPromo([r35], [promo], productos));

  console.log('\n── 5. La mesa ──\n');
  const pastor = productos[0];
  const promoA = { tipo: 'promo', renglon: P.armarRenglonPromo(promo, elegidos, { grupo: 'm-1' }), qty: 1 };
  const promoB = { tipo: 'promo', renglon: P.armarRenglonPromo(promo, elegidos, { grupo: 'm-2' }), qty: 1 };
  const sueltoMesa = { producto: pastor, modificadores: [], qty: 1 };
  const claves = [P.claveCarritoMesa(promoA), P.claveCarritoMesa(promoB), P.claveCarritoMesa(sueltoMesa)];
  ok('trampa 2: la clave lleva el grupo — dos 2x1 iguales y un taco suelto son TRES renglones', new Set(claves).size === 3, claves.join(' | '));
  ok('a POST /orders/:id/items la promo va como renglón de promo', P.renglonParaMesa(promoA).promo_group === 'm-1' && P.renglonParaMesa(sueltoMesa).quantity === 1);
  ok('el total del carrito de mesa cuenta la promo una vez, con sus extras', cerca(P.totalCarritoMesa({ a: promoA, b: sueltoMesa }), 45 + 25));

  // La cuenta como la devuelve el servidor: un OrderItem por producto de la promo.
  const cuenta = [
    { id: 101, product: { name: 'Pastor' }, quantity: 1, subtotal: '14.58', base_unit_price: '14.58', list_price: '25.00', promo_group: 'm-1', promo_name: 'Martes 2x1 tacos' },
    { id: 102, product: { name: 'Arrachera' }, quantity: 1, subtotal: '20.42', base_unit_price: '20.42', list_price: '35.00', promo_group: 'm-1', promo_name: 'Martes 2x1 tacos' },
    { id: 103, product: { name: 'Coca' }, quantity: 2, subtotal: '40.00', unit_price: '20.00' },
  ];
  const unidades = P.unidadesDeCuenta(cuenta);
  const u = unidades.find(x => x.promo);
  ok('trampa 5: al dividir, la promo es UNA unidad de $35 que cubre sus dos renglones',
    unidades.length === 3 && u && cerca(u.subtotal, 35) && u.item_ids.join() === '101,102', JSON.stringify(unidades));
  ok('los dos refrescos siguen siendo dos unidades asignables', unidades.filter(x => x.item_ids[0] === 103).length === 2);
  const totalCuenta = 75;
  const a1 = pagos.montoDeItems(unidades, [u.id], totalCuenta);
  const a2 = pagos.montoDeItems(unidades, unidades.filter(x => !x.promo).map(x => x.id), totalCuenta);
  ok('la división cuadra al centavo con la fórmula compartida (§31)', cerca(a1, 35) && cerca(a2, 40) && cerca(a1 + a2, totalCuenta), `${a1} + ${a2}`);
  const g = P.agruparRenglones(cuenta);
  ok('la cuenta enseña la promo JUNTA con su ahorro', g.length === 2 && g[0].promo && cerca(g[0].promo.total, 35) && cerca(g[0].promo.ahorro, 25));

  console.log('\n── 6. El ticket ──\n');
  const itemsTicket = cuenta.map(it => ({ ...it, name: it.product.name }));
  const lineas = ticket.lineasDeProductos(itemsTicket, '$');
  ok('la promo sale como "1x Martes 2x1 tacos $35.00", no como tacos a $14.58',
    lineas[0].izq === '1x Martes 2x1 tacos' && lineas[0].der === '$35.00' && !lineas.some(l => l.der === '$14.58'), JSON.stringify(lineas.slice(0, 3)));
  ok('y sus productos van debajo', lineas.some(l => l.texto && l.texto.includes('Pastor')) && lineas.some(l => l.texto && l.texto.includes('Arrachera')));
  ok('al pie: "Ahorraste $25.00"', ticket.lineaAhorro(itemsTicket, '$') === 'Ahorraste $25.00');
  ok('un ticket sin promo no dice nada de ahorro', ticket.lineaAhorro([{ name: 'Coca', unit_price: 20, quantity: 1 }], '$') === null);

  console.log('\n── 7. Sin internet: la caché y la cola ──\n');
  apiFalso.combos = [comboMartes];
  const bajadas = await ventas.obtenerPromos();
  ok('online: se bajan las promos del servidor', bajadas.length === 1);
  apiFalso.fallarCombos = true;
  const deCache = await ventas.obtenerPromos();
  ok('sin red: salen de la caché del teléfono', deCache.length === 1 && deCache[0].slots[0].category_id === TACOS);
  local.fijarModoLocal(true);
  ok('en MODO LOCAL no hay promos (son Premium; el modo sin cuenta es Free)', (await ventas.obtenerPromos()).length === 0);
  local.fijarModoLocal(false);
  await db.limpiarSesionLocal();
  ok('al cerrar sesión se borran las promos cacheadas', (await ventas.obtenerPromos()).length === 0);
  apiFalso.fallarCombos = false;

  const body = { items: [sub, suelto], payment_method: 'efectivo', total: 65 };
  const res = await ventas.registrarVenta(body, true, {
    total: 65, impuesto: 0,
    resumen: { payment_method: 'efectivo', items: P.nombresAplanados([renglon, { nombre: 'Coca' }]).map(n => ({ name: n.name, quantity: 1 })) },
  });
  const cola = await db.obtenerVentas('pendiente');
  const payload = cola[0] && cola[0].payload;
  ok('la red se cayó al cobrar: la venta quedó en la cola', res.modo === 'offline' && cola.length === 1);
  ok('en la cola la promo va como DIFERIDA: sold_at + promo_price + list_price',
    payload && payload.sold_at && payload.items[0].promo_price === 35 && payload.items[0].productos.every(p => Number.isFinite(p.list_price)));
  const itemsOff = res.pedido.items;
  ok('el ticket offline aplana la promo con el reparto del servidor y los nombres en su lugar',
    itemsOff.length === 3 && itemsOff[0].name === 'Pastor' && cerca(itemsOff[0].unit_price, 24.58) && itemsOff[0].promo_group === 'g-1' && itemsOff[2].name === 'Coca',
    JSON.stringify(itemsOff.map(i => [i.name, i.unit_price])));
  ok('…y ese ticket también dice "Ahorraste $25.00"', ticket.lineaAhorro(itemsOff, '$') === 'Ahorraste $25.00');

  console.log('\n── 8. Ofertas: el formulario ──\n');
  const f2x1 = P.plantillaPromo('2x1', { nombre: 'Martes 2x1', huecos: [{ quantity: 1, que: `c:${TACOS}` }], calendario: P.formularioDeCalendario({ dias: [2] }) });
  const v = P.validarFormularioPromo(f2x1);
  ok('la plantilla 2x1 arma "2 de Tacos, se cobra 1" y pasa la validación',
    v.ok && v.cuerpo.tipo === 'regalar_mas_barato' && v.cuerpo.paga === 1 && v.items[0].category_id === TACOS && v.items[0].quantity === 2, JSON.stringify(v));
  ok('el calendario del formulario viaja validado', v.ok && JSON.stringify(v.cuerpo.calendario) === '{"dias":[2]}');
  ok('un 2x1 que cobra 2 de 2 se rechaza ANTES de salir', !P.validarFormularioPromo({ ...f2x1, paga: 2 }).ok);
  ok('un calendario basura se rechaza, no cae a "siempre"',
    !P.validarFormularioPromo({ ...f2x1, calendario: { siempre: false, dias: [2], desde: '25:00', hasta: '02:00' } }).ok);
  ok('sin nombre, no', !P.validarFormularioPromo({ ...f2x1, nombre: ' ' }).ok);
  const fCombo = { ...P.plantillaPromo('combo', f2x1), huecos: [{ quantity: 1, que: 'p:11' }, { quantity: 1, que: 'p:21' }], precio: '60' };
  const vp = P.vistaPreviaPromo(P.promoDeFormulario(fCombo), productos, categorias);
  ok('trampa 7: un combo de $60 con productos de $45 se avisa en ÁMBAR', vp.ambar && /MÁS/.test(vp.texto), vp.texto);
  const vp2 = P.vistaPreviaPromo(P.promoDeFormulario(f2x1), productos, categorias);
  ok('la vista previa usa productos reales: "… → cobras $35.00"', !vp2.ambar && /cobras \$35\.00/.test(vp2.texto), vp2.texto);
  const ida = P.formularioDePromo(P.promoDeCatalogo(comboMartes));
  ok('editar una promo guardada llena el formulario y vuelve igual', JSON.stringify(P.validarFormularioPromo(ida).items) === JSON.stringify([{ category_id: TACOS, quantity: 2 }]));

  // El orden al guardar (el servidor valida contra lo que ya tiene).
  const llamadas = [];
  const cliente = (falla) => ({
    async updateCombo(id, c) { llamadas.push('PUT'); if (falla === 'PUT' && llamadas.filter(x => x === 'PUT').length === 1) throw new Error('400'); },
    async setComboItems(id, i) { llamadas.push('ITEMS'); if (falla === 'ITEMS') throw new Error('400'); },
    async createCombo(c) { llamadas.push('POST'); return { id: 99 }; },
    async deleteCombo(id) { llamadas.push('DELETE'); },
  });
  await P.guardarPromoEnServidor(cliente('PUT'), v, 7);
  ok('al editar, si la regla rebota primero, van los productos y luego la regla', llamadas.join() === 'PUT,ITEMS,PUT', llamadas.join());
  llamadas.length = 0;
  let fallo = false;
  try { await P.guardarPromoEnServidor(cliente('ITEMS'), v); } catch { fallo = true; }
  ok('al crear, si los productos fallan, la promo recién creada se borra', fallo && llamadas.join() === 'POST,ITEMS,DELETE', llamadas.join());

  console.log('\n── 9. La cocina del celular (pendiente del Bloque 1) ──\n');
  ok('la comanda de una MESA solo se esconde', cocina.accionAlCompletar({ id: 1, table_id: 4 }) === 'ocultar' && cocina.accionAlCompletar({ id: 1, table: { name: 'M1' } }) === 'ocultar');
  ok('la de mostrador sí se marca completado (ya está cobrada)', cocina.accionAlCompletar({ id: 2, table_id: null }) === 'completar');
  const vis = cocina.comandasVisibles([{ id: 1 }, { id: 2 }], cocina.agregarOculta([], 1));
  ok('la escondida ya no se ve, la otra sí', vis.length === 1 && vis[0].id === 2);
  let lista = [];
  for (let i = 0; i < cocina.MAX_OCULTAS + 50; i++) lista = cocina.agregarOculta(lista, i);
  ok('la lista de escondidas no crece sin fin', lista.length === cocina.MAX_OCULTAS && lista[lista.length - 1] === cocina.MAX_OCULTAS + 49);
  ok('una lista guardada rota no revienta la pantalla', cocina.leerOcultas('{basura').length === 0 && cocina.leerOcultas('[1,2]').length === 2);
  const kds = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/screens/main/KDSScreen.js'), 'utf8'));
  const ini = kds.indexOf('async function completarPedido');
  const cuerpoKds = kds.slice(ini, kds.indexOf('\n  }\n', ini));
  ok('KDSScreen decide con accionAlCompletar ANTES de mandar completado',
    ini > 0 && cuerpoKds.includes("accionAlCompletar(order) === 'ocultar'") &&
    cuerpoKds.indexOf('accionAlCompletar') < cuerpoKds.indexOf('updateOrderStatus'));
  ok('y dibuja solo las visibles', /visibles\.map\(/.test(kds) && !/\{orders\.map\(/.test(kds));

  console.log('\n── 10. Las pantallas usan la regla (no una copia propia) ──\n');
  const venta = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/screens/main/NuevaVentaScreen.js'), 'utf8'));
  ok('Nueva Venta manda los renglones con renglonParaVenta', /items:\s*carrito\.map\(renglonParaVenta\)/.test(venta));
  ok('Nueva Venta calcula el descuento sobre baseDescuentoDe', /montoDescuento\(descuentoDef,\s*baseDesc\)/.test(venta) && /baseDescuentoDe\(carrito/.test(venta));
  ok('Nueva Venta ofrece solo las promos de promosActivasAhora', /promosActivasAhora\(promos,\s*productos/.test(venta));
  ok('Nueva Venta vuelve a leer las promos al ENTRAR (una recién creada sale sin reiniciar)',
    /useFocusEffect\(\s*useCallback\(\(\) => \{\s*let vivo = true;\s*obtenerPromos\(\)/.test(venta));
  const hoja = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/components/HojaPromo.js'), 'utf8'));
  ok('la hoja usa eleccionAutomatica y enseña la foto del producto', /eleccionAutomatica\(promo, elegidos/.test(hoja) && /imagen=\{p\.image\}/.test(hoja));
  const mesas = soloCodigo(fs.readFileSync(path.join(RAIZ, 'src/screens/main/MesasScreen.js'), 'utf8'));
  ok('Mesas arma la clave con claveCarritoMesa (trampa 2)', /claveCarritoMesa\(\{ producto, modificadores \}\)/.test(mesas) && !/claveCarrito\(producto\.id/.test(mesas));
  ok('Mesas divide con unidadesDeCuenta (trampa 5)', /useMemo\(\(\) => unidadesDeCuenta\(itemsCuenta\)/.test(mesas) && /flatMap\(u => u\.item_ids\)/.test(mesas));
  ok('Mesas quita renglones con removeOrderItem, a nombre del puesto (trampa 4)', /api\.removeOrderItem\(ordenActiva\.id,\s*item\.id,\s*nombreActivo/.test(mesas));

  console.log('');
  if (fallos) {
    console.log(`❌ ${fallos} de ${total} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log(`✅ ${total} comprobaciones: las promos del celular cobran, se ofrecen, se imprimen y sobreviven sin internet.`);
})().catch((e) => { console.error('❌ La prueba reventó:', e); process.exit(1); });
