#!/usr/bin/env node
// ============================================================================
// scripts/smoke-promos-gemelas.js — las TRES copias de la regla de las promos
// dan lo mismo (PLAN_OFERTAS_V1, Bloque 3).
//
//     npm run smoke:promos-gemelas
//
// La regla de la promo (el precio, el reparto a centavos, el calendario con su
// medianoche y qué cabe en cada hueco) vive en el backend (`utils/promos.js` +
// `utils/ventanas.js`), COPIADA en el desktop (`pos/modulo-promos.js`) y COPIADA
// aquí (`src/utils/promos.js`). Una venta de la cola offline sube como diferida
// y el servidor respeta el precio que se cobró en el teléfono: si esta copia se
// desvía un centavo, el ticket dice un número, el servidor reparte otro y la
// venta queda auditada como sospechosa sin que nadie hiciera nada.
//
// Se cargan las copias —la del backend con `require`, la del celular con Babel
// como la carga Metro, la del desktop tal cual la carga el navegador— y se
// compara lo que DEVUELVEN, que un cambio de formato no puede engañar.
//
// Si el repo del backend no está al lado, se SALTA con un aviso: no es un
// defecto del celular, y ponerse rojo por eso enseña a ignorar la prueba. Sin
// el desktop se comparan solo backend y celular.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

// El reloj del proceso en la zona del negocio: así se compara la hora "del
// equipo" del celular con la "de la zona" del servidor (§37.6).
process.env.TZ = 'America/Mexico_City';

const RAIZ = path.resolve(__dirname, '..');
const BACKEND = process.env.ZENIT_BACKEND || path.join(RAIZ, '..', 'zenit-pos-backend');
const DESKTOP = process.env.ZENIT_DESKTOP || path.join(RAIZ, '..', 'zenit-pos-desktop');
const RUTA_SERVIDOR = path.join(BACKEND, 'utils', 'promos.js');
const RUTA_DESKTOP = path.join(DESKTOP, 'pos', 'modulo-promos.js');

if (!fs.existsSync(RUTA_SERVIDOR)) {
  console.log(`⏭️  No encontré ${RUTA_SERVIDOR}: comparación SALTADA.`);
  console.log('   (clona zenit-pos-backend como carpeta hermana, o apunta ZENIT_BACKEND a él)');
  process.exit(0);
}

const servidor = require(RUTA_SERVIDOR);

// ─── La copia del celular, cargada con Babel como la carga Metro ────────────
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
const celular = cargarMobile('src/utils/promos.js');

// ─── La copia del desktop (opcional) ────────────────────────────────────────
let escritorio = null;
let localDelEscritorio = null;
if (fs.existsSync(RUTA_DESKTOP)) {
  const sandbox = { console, Date, Math, JSON, Intl };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(RUTA_DESKTOP, 'utf8') + '\n;this.__R = PromosRegla; this.__local = localDelEquipo;',
    sandbox
  );
  escritorio = sandbox.__R;
  localDelEscritorio = sandbox.__local;
} else {
  console.log(`ℹ️  No encontré ${RUTA_DESKTOP}: se comparan solo servidor y celular.`);
}

const copias = [['celular', celular], ...(escritorio ? [['desktop', escritorio]] : [])];

let casos = 0, fallos = 0;
const ejemplos = [];
/** `f(copia)` se evalúa en el servidor y en cada copia; todas deben coincidir. */
function igual(desc, f) {
  const esperado = JSON.stringify(f(servidor));
  for (const [nombre, copia] of copias) {
    casos++;
    const obtenido = JSON.stringify(f(copia));
    if (obtenido !== esperado) {
      fallos++;
      if (ejemplos.length < 8) ejemplos.push(`${desc}\n      servidor: ${esperado}\n      ${nombre.padEnd(8)}: ${obtenido}`);
    }
  }
}

// Azar DETERMINISTA: si algo falla, falla igual en la siguiente corrida.
let semilla = 20260921;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
const precio = () => {
  const r = azar();
  if (r < 0.08) return 0;
  if (r < 0.2) return 33.33;
  if (r < 0.3) return 24.5;
  return Math.round(azar() * 40000) / 100;
};

console.log('\n── 1. El calendario: validar lo que manda el dueño ──');
const calendariosCrudos = [
  null, undefined, '', 'basura', '{"dias":[2]}', '{', 42, [], [1, 2],
  {}, { dias: [] }, { dias: [7] }, { dias: [-1] }, { dias: ['2'] }, { dias: [2, 2, 3] },
  { dias: [0, 1, 2, 3, 4, 5, 6] }, { dias: [6, 0] }, { dias: [1.5] },
  { desde: '18:00' }, { hasta: '20:00' }, { desde: '18:00', hasta: '20:00' },
  { desde: '22:00', hasta: '02:00' }, { desde: '8:00', hasta: '10:00' }, { desde: '24:00', hasta: '01:00' },
  { desde: '18:00', hasta: '18:00' }, { desde: ' 18:00 ', hasta: '20:00 ' },
  { fecha_inicio: '2026-10-01' }, { fecha_fin: '2026-10-31' },
  { fecha_inicio: '2026-10-31', fecha_fin: '2026-10-01' }, { fecha_inicio: '2026-13-01' },
  { fecha_inicio: '2026-10-01T05:00:00Z' }, { fecha_inicio: '01/10/2026' },
  { dias: [2], desde: '18:00', hasta: '20:00', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31' },
  { dias: [5], desde: '22:00', hasta: '02:00', fecha_fin: '2026-10-31' },
  { dias: null, desde: null, hasta: null }, { dias: [3], desde: '', hasta: '' },
];
for (const c of calendariosCrudos) {
  igual(`normalizarCalendario(${JSON.stringify(c)})`, (R) => R.normalizarCalendario(c));
  igual(`leerCalendario(${JSON.stringify(c)})`, (R) => R.leerCalendario(c));
}

console.log('── 2. El calendario: ¿vale en este minuto? (con la medianoche) ──');
const calendarios = [
  null,
  { dias: [2] },
  { dias: [1, 2, 3, 4], desde: '18:00', hasta: '20:00' },
  { dias: [5], desde: '22:00', hasta: '02:00' },
  { desde: '23:30', hasta: '00:30' },
  { dias: [0], desde: '12:00', hasta: '12:00' },
  { fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31' },
  { dias: [6], desde: '22:00', hasta: '03:00', fecha_inicio: '2026-10-03', fecha_fin: '2026-10-31' },
  { dias: [4], desde: '20:00', hasta: '01:00', fecha_fin: '2026-10-29' },
  { dias: [0, 6] },
  { desde: '00:00', hasta: '06:00' },
  { dias: [3], fecha_inicio: '2026-12-30' },
];
// Una semana cada 37 minutos en tres épocas: fin de mes, vuelta del año, septiembre.
const inicios = [Date.UTC(2026, 9, 26, 6, 0), Date.UTC(2026, 11, 27, 6, 0), Date.UTC(2026, 8, 28, 6, 0)];
for (const cal of calendarios) {
  for (const t0 of inicios) {
    for (let t = t0; t < t0 + 8 * 86400000; t += 37 * 60000) {
      const local = servidor.localEnZona('America/Mexico_City', new Date(t));
      igual(`calendarioVigente(${JSON.stringify(cal)}, ${JSON.stringify(local)})`, (R) => R.calendarioVigente(cal, local));
    }
  }
}

console.log('── 3. La hora del EQUIPO = la hora de la ZONA del servidor ──');
for (let t = Date.UTC(2026, 0, 1, 5, 30); t < Date.UTC(2027, 0, 1); t += 7 * 3600000 + 13 * 60000) {
  const esperado = JSON.stringify(servidor.localEnZona('America/Mexico_City', new Date(t)));
  const locales = [['celular', celular.localDelEquipo(new Date(t))]];
  if (localDelEscritorio) locales.push(['desktop', JSON.parse(JSON.stringify(localDelEscritorio(new Date(t))))]);
  for (const [nombre, loc] of locales) {
    casos++;
    if (JSON.stringify(loc) !== esperado) {
      fallos++;
      if (ejemplos.length < 8) ejemplos.push(`local en ${new Date(t).toISOString()}\n      servidor: ${esperado}\n      ${nombre}: ${JSON.stringify(loc)}`);
    }
  }
}
for (let i = 0; i < 200; i++) {
  const partes = { year: entero(2025, 2028), month: entero(1, 12), day: entero(1, 28), hour: entero(0, 23), minute: entero(0, 59) };
  igual(`localDesdePartes(${JSON.stringify(partes)})`, (R) => R.localDesdePartes(partes));
}

console.log('── 4. El precio, el reparto y los extras ──');
for (let i = 0; i < 1500; i++) {
  const n = entero(1, 6);
  const precios = Array.from({ length: n }, precio);
  const tipo = azar() < 0.5 ? 'precio_fijo' : 'regalar_mas_barato';
  const promo = tipo === 'precio_fijo'
    ? { tipo, price: azar() < 0.1 ? precio() * 5 : precio() }
    : { tipo, paga: entero(0, n) };
  const elegidos = precios.map((p) => ({ precio: p, delta: azar() < 0.3 ? Math.round((azar() * 30 - 5) * 100) / 100 : 0 }));
  const forzado = azar() < 0.25 ? precio() : null;
  igual('tipoDePromo', (R) => R.tipoDePromo(promo));
  igual(`precioPromo(${JSON.stringify(promo)}, ${JSON.stringify(precios)})`, (R) => R.precioPromo(promo, precios));
  const p = servidor.precioPromo(promo, precios);
  igual(`repartir(${p}, ${JSON.stringify(precios)})`, (R) => R.repartir(p, precios));
  igual(`armarPromo(${JSON.stringify(promo)}, ${JSON.stringify(elegidos)}, ${forzado})`, (R) => R.armarPromo(promo, elegidos, forzado));
}
for (const [promo, precios] of [
  [{ tipo: 'regalar_mas_barato', paga: 1 }, [25, 35]],
  [{ tipo: 'precio_fijo', price: 100 }, [33.33, 33.33, 33.33]],
  [{ tipo: 'regalar_mas_barato', paga: 2 }, [10, 20, 30]],
  [{ tipo: 'precio_fijo', price: 99.99 }, [0, 0, 0]],
  [{ tipo: 'precio_fijo', price: 0.01 }, [10, 10, 10]],
]) {
  igual(`armarPromo del plan ${JSON.stringify([promo, precios])}`,
    (R) => R.armarPromo(promo, precios.map((x) => ({ precio: x, delta: 0 }))));
}

console.log('── 5. Qué cabe en cada hueco ──');
for (let i = 0; i < 800; i++) {
  const huecos = Array.from({ length: entero(1, 3) }, () => azar() < 0.5
    ? { quantity: entero(1, 3), product_ids: [], category_id: entero(1, 3) }
    : { quantity: entero(1, 3), product_ids: Array.from({ length: entero(1, 3) }, () => entero(1, 8)), category_id: null });
  const total = servidor.productosQueLleva(huecos);
  const cuantos = azar() < 0.7 ? total : entero(0, total + 2);
  const productos = Array.from({ length: cuantos }, () => ({ id: entero(1, 8), category_id: entero(1, 3) }));
  igual('productosQueLleva', (R) => R.productosQueLleva(huecos));
  igual(`eleccionCabe(${JSON.stringify(huecos)}, ${JSON.stringify(productos)})`, (R) => R.eleccionCabe(huecos, productos));
  for (const pr of productos.slice(0, 2)) igual('cabeEnHueco', (R) => R.cabeEnHueco(huecos[0], pr));
}

console.log('');
if (fallos) {
  console.log(`❌ ${fallos} de ${casos} casos DIFIEREN de la regla del servidor:`);
  for (const e of ejemplos) console.log(`    · ${e}`);
  console.log('\n   Una copia ya no es la de utils/promos.js: cambia las tres.');
  process.exit(1);
}
console.log(`✅ ${casos} casos: la regla del ${copias.map((c) => c[0]).join(' y del ')} da EXACTAMENTE lo mismo que la del servidor.`);
