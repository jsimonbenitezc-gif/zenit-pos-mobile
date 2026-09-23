#!/usr/bin/env node
// ============================================================================
// scripts/smoke-iconos.js — `npm run smoke:iconos` (PLAN_REDISENO_V1, Bloque 3)
//
// Los iconos de color de Fluent Emoji. Lo que protege:
//   1. TODO emoji que el selector ofrecía hasta hoy (y que por tanto puede estar
//      guardado en un producto) encuentra su dibujo — con y sin FE0F, y con tono
//      de piel (trampa 8). Uno que no lo encuentre se sigue viendo como el emoji
//      del sistema SIN QUE NADIE LO NOTE: por eso esta lista está congelada aquí.
//   2. El catálogo, la tabla de `require` y los PNG cuadran entre sí, sin huecos
//      ni sobrantes, y la licencia de Microsoft viaja con ellos (trampa 10).
//   3. Lo que no es de la lista no se inventa un dibujo (línea, vacío, propio
//      desconocido) y `IconoProducto` mira el catálogo ANTES que los `svg:`.
//   4. Buscar en español y el orden por tipo de negocio.
// Carga los archivos REALES con Babel, como Metro. Sale con 1 si algo falla.
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const RAIZ = path.join(__dirname, '..');
let ok = 0, mal = 0;
const check = (cond, msg) => { if (cond) { ok++; } else { mal++; console.log('  ❌ ' + msg); } };

const cache = new Map();
function cargar(rel) {
  const archivo = path.join(RAIZ, rel);
  if (cache.has(archivo)) return cache.get(archivo);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const m = { exports: {} };
  cache.set(archivo, m.exports);
  const req = (spec) => {
    if (spec.startsWith('.')) {
      const destino = path.resolve(path.dirname(archivo), spec);
      if (destino.endsWith('.png')) return { png: path.relative(RAIZ, destino) };   // lo que da Metro: un id
      if (destino.endsWith('.json')) return JSON.parse(fs.readFileSync(destino, 'utf8'));
      return cargar(path.relative(RAIZ, destino.endsWith('.js') ? destino : destino + '.js'));
    }
    return require(spec);
  };
  new Function('module', 'exports', 'require', code)(m, m.exports, req);
  cache.set(archivo, m.exports);
  return m.exports;
}

const I = cargar('src/iconos/index.js');
const { ARCHIVOS } = cargar('src/iconos/archivos.js');
const { llaveEmoji } = cargar('src/iconos/normalizar.js');

// Lo que ofrecía el selector hasta el Bloque 3 (IconPicker del celular y
// EMOJIS_DISPONIBLES del desktop, idénticos). CONGELADO: son los valores que ya
// pueden estar guardados en productos de verdad.
const OFRECIDOS_HASTA_HOY = (
  '🍔 🍕 🍟 🌭 🌮 🌯 🫔 🥙 🥪 🥗 🥩 🍖 🍗 🥓 🍳 🥚 🧆 🥘 🍲 🫕 🥣 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 ' +
  '🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 ' +
  '🍇 🍈 🍉 🍊 🍋 🍌 🍍 🥭 🍎 🍏 🍐 🍑 🍒 🍓 🫐 🥝 🥥 ' +
  '🍅 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🥜 🫘 🌰 🫒 ' +
  '🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 ' +
  '🥤 ☕ 🫖 🍵 🥛 🍼 🍺 🍻 🍷 🍸 🍹 🍾 🥂 🥃 🧋 🧃 🧉 🧊 🫗 🍶 ' +
  '🍽️ 🍴 🥄 🔪 🫙 🧑‍🍳 🧾 💳 ' +
  '📦 🛒 🛍️ 🏷️ 🔥 ⭐ ✨ 💡 ✂️ 📌 💰 🎉 ❤️ 👍 🏠 🚗 🛵 📱 📋 ✅ ⏰ 🔔'
).split(' ');

// La congelada tiene que ser EXACTAMENTE la del selector viejo (si hay git a la mano).
try {
  const viejo = require('child_process').execFileSync('git', ['show', '336d64a:src/components/IconPicker.js'],
    { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const bloque = viejo.slice(viejo.indexOf('EMOJI_CATEGORIES = {'), viejo.indexOf('};', viejo.indexOf('EMOJI_CATEGORIES = {')));
  const deAntes = [...bloque.matchAll(/'([^'a-zA-Z &]+)'/g)].map(m => m[1]);
  check(deAntes.length === OFRECIDOS_HASTA_HOY.length && deAntes.every((e, i) => e === OFRECIDOS_HASTA_HOY[i]),
    'la lista congelada no es la del IconPicker de 336d64a');
} catch { /* sin git: vale la lista congelada */ }

// ─── 1. Todo lo de hoy encuentra su dibujo ──────────────────────────────────
console.log('\n1. Los emojis de siempre encuentran su dibujo');
const sinDibujo = OFRECIDOS_HASTA_HOY.filter(e => !I.archivoDeValor(e));
check(sinDibujo.length === 0, `sin dibujo: ${sinDibujo.join(' ')}`);
check(OFRECIDOS_HASTA_HOY.length === 149, `la lista congelada cambió (${OFRECIDOS_HASTA_HOY.length})`);

// Trampa 8: la misma cosa escrita de otra forma.
const CON_FE0F = OFRECIDOS_HASTA_HOY.filter(e => e.includes('️'));
check(CON_FE0F.length === 6, 'la lista tendría que traer emojis con FE0F');
for (const e of CON_FE0F) {
  const pelado = e.replace(/️/g, '');
  check(I.archivoDeValor(pelado) && I.archivoDeValor(pelado) === I.archivoDeValor(e), `${e} sin FE0F no encuentra su dibujo`);
}
check(I.archivoDeValor('☕️') === I.archivoDeValor('☕'), '☕ con FE0F de más no encuentra su dibujo');
check(I.archivoDeValor('👍🏽') === I.archivoDeValor('👍'), '👍 con tono de piel no encuentra su dibujo');
check(I.archivoDeValor('💅🏿') === I.archivoDeValor('💅'), '💅 con tono de piel no encuentra su dibujo');
check(I.archivoDeValor(' 🌮 ') === I.archivoDeValor('🌮'), 'un espacio alrededor lo pierde');
check(llaveEmoji('🧑‍🍳') === '1f9d1-200d-1f373', 'el ZWJ de 🧑‍🍳 no se conserva');
check(I.iconoDeValor('🧑') === null || I.iconoDeValor('🧑').id !== I.iconoDeValor('🧑‍🍳').id,
  '🧑 suelto se confunde con 🧑‍🍳 (el ZWJ sí cambia el dibujo)');

// ─── 2. Catálogo, tabla y archivos cuadran ──────────────────────────────────
console.log('2. Catálogo, tabla de require y PNG cuadran');
const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/iconos/catalogo.json'), 'utf8'));
const dirPng = path.join(RAIZ, 'assets/iconos/png');
const pngs = new Set(fs.readdirSync(dirPng).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
const ids = catalogo.iconos.map(i => i.id);
check(new Set(ids).size === ids.length, 'hay ids repetidos en el catálogo');
check(ids.every(id => pngs.has(id)), `sin PNG: ${ids.filter(id => !pngs.has(id)).join(', ')}`);
check([...pngs].every(id => ids.includes(id)), `PNG que no están en el catálogo: ${[...pngs].filter(id => !ids.includes(id)).join(', ')}`);
check(ids.every(id => ARCHIVOS[id] && ARCHIVOS[id].png === `assets/iconos/png/${id}.png`.split('/').join(path.sep)),
  'archivos.js no apunta a cada PNG');
check(Object.keys(ARCHIVOS).length === ids.length, 'archivos.js trae entradas de más');
const llaves = catalogo.iconos.filter(i => i.llave).map(i => i.llave);
check(new Set(llaves).size === llaves.length, 'dos iconos con la misma llave');
check(catalogo.iconos.every(i => !i.llave || i.llave === llaveEmoji(i.emoji)), 'una llave no coincide con su emoji');
check(catalogo.iconos.every(i => i.llave || /^svg:z-[a-z0-9_]+$/.test(i.valor || '')), 'un icono propio sin valor svg:z-');
check(catalogo.grupos.every(g => g.iconos.every(id => ids.includes(id))), 'un grupo apunta a un icono que no existe');
check(catalogo.iconos.every(i => i.nombre && Array.isArray(i.buscar)), 'un icono sin nombre en español');
const pesado = [...pngs].map(id => fs.statSync(path.join(dirPng, id + '.png')).size).reduce((a, b) => a + b, 0);
check(pesado < 1.5 * 1024 * 1024, `los PNG pesan ${(pesado / 1024).toFixed(0)} KB (tope 1,5 MB: trampa 9)`);
const lic = path.join(RAIZ, 'assets/iconos/LICENSE-fluentui-emoji.txt');
check(fs.existsSync(lic) && /MIT License/.test(fs.readFileSync(lic, 'utf8')) && /Microsoft/.test(fs.readFileSync(lic, 'utf8')),
  'falta la licencia MIT de Microsoft junto a los iconos');

// ─── 3. Lo que no es de la lista ────────────────────────────────────────────
console.log('3. Lo que no es de la lista no inventa un dibujo');
check(I.archivoDeValor('svg:burger') === null, 'un icono de línea se tomó por uno de color');
const propios = catalogo.iconos.filter(i => !i.llave);
check(propios.length >= 5, 'no hay iconos propios en el catálogo');
for (const i of propios) {
  check(I.archivoDeValor(i.valor) === ARCHIVOS[i.id], `el propio ${i.valor} no encuentra su dibujo`);
  check(fs.existsSync(path.join(RAIZ, 'scripts/iconos/nuevos', i.valor.slice(6) + '.svg')), `falta el SVG fuente de ${i.valor}`);
}
check(I.archivoDeValor('svg:z-torta') !== null, 'svg:z-torta no encuentra su dibujo');
check(I.archivoDeValor('svg:z-no_existe') === null, 'un icono propio desconocido inventó un dibujo');
check(I.archivoDeValor('') === null && I.archivoDeValor(null) === null && I.archivoDeValor(undefined) === null, 'vacío inventó un dibujo');
check(I.archivoDeValor('🦄') === null, 'un emoji fuera de la lista inventó un dibujo');
check(I.archivoDeValor('Taco') === null, 'un texto cualquiera inventó un dibujo');
for (const i of catalogo.iconos) {
  check(I.iconoDeValor(I.valorDeIcono(i))?.id === i.id, `elegir ${i.id} y volverlo a leer no da el mismo icono`);
}

const fuenteIP = fs.readFileSync(path.join(RAIZ, 'src/components/IconoProducto.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // solo código (§50.8)
const posCatalogo = fuenteIP.indexOf('archivoDeValor(valor)');
const posLinea = fuenteIP.indexOf("valor.startsWith('svg:')");
const posFoto = fuenteIP.indexOf("imagen.startsWith('data:image/')");
check(posCatalogo > 0 && posLinea > 0 && posCatalogo < posLinea, 'IconoProducto no mira el catálogo antes que los svg:');
check(posFoto > 0 && posFoto < posCatalogo, 'IconoProducto ya no deja ganar a la FOTO');

// ─── 4. Buscar y ordenar ────────────────────────────────────────────────────
console.log('4. Buscador en español y orden por tipo de negocio');
const primero = (q) => I.buscarIconos(q)[0]?.emoji;
check(primero('cafe') === '☕', `"cafe" (sin acento) da ${primero('cafe')}`);
check(primero('Cerveza') === '🍺', `"Cerveza" da ${primero('Cerveza')}`);
check(primero('taco') === '🌮', `"taco" da ${primero('taco')}`);
check(primero('pina') === '🍍', `"pina" (sin tilde) da ${primero('pina')}`);
check(primero('platano') === '🍌', `"platano" (sin acento) da ${primero('platano')}`);
check(primero('CAFÉ') === '☕', `"CAFÉ" da ${primero('CAFÉ')}`);
check(I.buscarIconos('pastor').some(i => i.emoji === '🌮'), '"pastor" no encuentra el taco (sinónimo)');
check(I.buscarIconos('   ').length === 0, 'una búsqueda en blanco devuelve algo');
check(I.buscarIconos('xyzzy').length === 0, 'una búsqueda sin sentido devuelve algo');
const orden = (t) => I.gruposParaTipo(t).map(g => g.id);
check(orden('panaderia')[0] === 'panaderia', `panadería abre en ${orden('panaderia')[0]}`);
check(orden('farmacia')[0] === 'farmacia', `farmacia abre en ${orden('farmacia')[0]}`);
check(orden('ropa')[0] === 'ropa', `ropa abre en ${orden('ropa')[0]}`);
check(orden('salon')[0] === 'salon', `salón abre en ${orden('salon')[0]}`);
check(orden('')[0] === catalogo.grupos[0].id, 'sin tipo, el orden no es el del catálogo');
for (const t of ['restaurante', 'tienda', 'ropa', 'salon', 'farmacia', 'panaderia', 'otro', '']) {
  check(orden(t).length === catalogo.grupos.length && new Set(orden(t)).size === catalogo.grupos.length,
    `con tipo "${t}" se pierde o repite un grupo`);
}

// ─── 5. El catálogo es el que sale de la fuente (si Fluent está a la mano) ──
const FLUENT = process.env.FLUENT_DIR;
if (FLUENT && fs.existsSync(path.join(FLUENT, 'assets'))) {
  console.log('5. El catálogo guardado es el que sale de scripts/iconos/fuente.js');
  const { generar, catalogoDe } = require('./iconos/generar-catalogo');
  const { errores, entradas, grupos } = generar(FLUENT);
  check(errores.length === 0, 'la fuente tiene huecos: ' + errores.join('; '));
  check(JSON.stringify(catalogoDe(entradas, grupos)) === JSON.stringify(catalogo),
    'src/iconos/catalogo.json no es el que genera la fuente: corre npm run iconos:generar');
} else {
  console.log('5. (se salta: define FLUENT_DIR con la carpeta de microsoft/fluentui-emoji)');
}

console.log(`\n${mal ? '❌' : '✅'} ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
