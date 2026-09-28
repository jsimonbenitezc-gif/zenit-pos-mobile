#!/usr/bin/env node
// ============================================================================
// scripts/smoke-partes-mesa.js — la cuenta de "Cobrar una parte" (PLAN_CUENTAS_V1)
//
//     npm run smoke:partes
//
// `src/utils/partesMesa.js` repite la cuenta del servidor (POST
// /orders/:id/separar): porción proporcional, promo entera, tasa congelada,
// "queda" = mesa − parte. Si se desvía un centavo, la pantalla dice "Esta parte:
// $46.40" y el servidor cobra otra cosa. Los casos son los MISMOS números que
// prueba el backend (tests/separar-cuenta.test.js), y si el backend está al lado
// su `desglosar()` sirve de juez del impuesto.
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const RAIZ = path.resolve(__dirname, '..');
const BACKEND = process.env.ZENIT_BACKEND || path.join(RAIZ, '..', 'zenit-pos-backend');

function cargarMobile(rutaRelativa, cache = new Map()) {
  const archivo = path.join(RAIZ, rutaRelativa);
  if (cache.has(archivo)) return cache.get(archivo);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  cache.set(archivo, modulo.exports);
  const req = (spec) => {
    if (spec.startsWith('.')) {
      const destino = path.relative(RAIZ, path.resolve(path.dirname(archivo), spec)).replace(/\\/g, '/');
      return cargarMobile(destino.endsWith('.js') ? destino : destino + '.js', cache);
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(req, modulo, modulo.exports);
  return modulo.exports;
}

const P = cargarMobile('src/utils/partesMesa.js');
const juez = fs.existsSync(path.join(BACKEND, 'utils', 'impuestos.js'))
  ? require(path.join(BACKEND, 'utils', 'impuestos.js'))
  : null;

let fallos = 0, total = 0;
function ok(desc, cond, detalle = '') {
  total++;
  if (cond) console.log('  ✓ ' + desc);
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const igual = (desc, a, b) => ok(desc + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), 'dio ' + JSON.stringify(a));

// La mesa del caso real: 3 cervezas ($120) + 2x1 ($35) con IVA 16% agregado → $179.80.
const promo = (id, sub) => ({ id, quantity: 1, subtotal: String(sub), promo_group: 'g1', promo_name: '2x1', promo_id: 9, list_price: '30.00', product: { name: 'Taco' } });
const mesa = {
  total: '179.80', subtotal: '155.00', tax_amount: '24.80', tax_rate: '16.00', tax_included: false,
  items: [
    { id: 1, quantity: 3, subtotal: '120.00', product: { name: 'Cerveza' } },
    promo(2, 14.58), promo(3, 20.42),
  ],
};

console.log('\nLa cuenta de la parte');
let c = P.calcularParte(mesa, { 1: 1 });
igual('1 de 3 cervezas: lo que sube al servidor', c.items, [{ item_id: 1, quantity: 1 }]);
igual('…cobra $46.40 (40 + 16%)', c.total, 46.4);
igual('…y quedan $133.40', c.queda, 133.4);
igual('…no es toda la cuenta', c.todo, false);

c = P.calcularParte(mesa, { 'promo:g1': 1 });
igual('la promo sube con UN renglón (el servidor arrastra el grupo)', c.items, [{ item_id: 2 }]);
igual('…y cobra la promo entera con IVA ($40.60)', c.total, 40.6);

c = P.calcularParte(mesa, { 1: 3, 'promo:g1': 1 });
igual('todo lo que queda = "es toda la cuenta"', c.todo, true);
igual('nada elegido = vacía', P.calcularParte(mesa, {}).vacia, true);

const incluida = { total: '120.00', subtotal: '103.45', tax_amount: '16.55', tax_rate: '16', tax_included: true,
  items: [{ id: 1, quantity: 3, subtotal: '120.00' }] };
c = P.calcularParte(incluida, { 1: 1 });
igual('IVA incluido: la parte es su precio ($40)', c.total, 40);
igual('…y quedan $80', c.queda, 80);

// Centavos: 3 × $10.33 con 16% agregado. La porción es 1/3 del subtotal y el
// impuesto se redondea sobre la parte.
const raro = { total: '35.95', subtotal: '30.99', tax_amount: '4.96', tax_rate: '16', tax_included: false,
  items: [{ id: 7, quantity: 3, subtotal: '30.99' }] };
c = P.calcularParte(raro, { 7: 1 });
igual('3 × $10.33: una pieza cobra $11.98', c.total, 11.98);
igual('…y queda la RESTA exacta ($23.97)', c.queda, 23.97);
if (juez) {
  const d = juez.desglosar({ base: 10.33, tasa: 16, incluido: false });
  igual('el impuesto coincide con el desglosar() del SERVIDOR', c.total, d.total);
}

console.log('\nTocar los productos');
const grupos = [{ promo: null, item: mesa.items[0] }, { promo: { grupo: 'g1' }, items: [mesa.items[1]] }];
let sel = {};
sel = P.tocarEnSeleccion(sel, grupos[0]);
sel = P.tocarEnSeleccion(sel, grupos[0]);
sel = P.tocarEnSeleccion(sel, grupos[0]);
sel = P.tocarEnSeleccion(sel, grupos[0]);
igual('tocar 4 veces 3 cervezas se queda en 3', sel['1'], 3);
sel = P.quitarUnoDeSeleccion(sel, '1');
igual('"−" quita una', sel['1'], 2);
sel = P.tocarEnSeleccion(sel, grupos[1]);
igual('una promo se elige con un toque', sel['promo:g1'], 1);
sel = P.tocarEnSeleccion(sel, grupos[1]);
igual('…y se suelta con otro', sel['promo:g1'], undefined);
igual('0.75 kg de queso es UNA pieza', P.piezasDeRenglon({ quantity: '0.75' }), 1);
igual('una mesa de 3 cervezas + promo son 4 unidades', P.unidadesDeMesa(mesa.items), 4);

console.log('\n' + (fallos ? `❌ ${fallos} de ${total} fallaron` : `✅ ${total}/${total} comprobaciones`));
process.exit(fallos ? 1 : 0);
