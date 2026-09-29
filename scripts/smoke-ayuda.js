#!/usr/bin/env node
// ============================================================================
// scripts/smoke-ayuda.js — las burbujas de ayuda (?) dicen LO MISMO en el
// celular y en el desktop (PLAN_AYUDA_V1, IDEA 10).
//
//     npm run smoke:ayuda
//
// Los textos viven en `src/ayuda/textos.js`, COPIADO en el desktop
// (`pos/ayuda-textos.js`), misma regla que la lista de monedas (§51.2). Si uno
// cambia y el otro no, el celular y la caja explican la misma pantalla de dos
// maneras sin que nadie lo note. Aquí se comprueba:
//   1. los dos archivos DEVUELVEN el mismo objeto (no se compara el texto);
//   2. cada texto está completo: título, texto, negritas cerradas, corto;
//   3. cada <Ayuda id="…"> / ayuda="…" apunta a una llave que existe, y cada
//      llave se usa en alguna pantalla.
//
// Si el repo del desktop no está al lado, la comparación se SALTA con un aviso:
// no es un defecto del celular.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..');
const DESKTOP = process.env.ZENIT_DESKTOP || path.join(RAIZ, '..', 'zenit-pos-desktop');
const D_TEXTOS = path.join(DESKTOP, 'pos', 'ayuda-textos.js');

// Llaves que se eligen con una variable (`ayuda={tab}`): el archivo, lo que
// debe decir, y qué llaves cubre. Si la pantalla deja de hacerlo, el smoke lo ve.
const DINAMICAS = [
  { archivo: 'src/screens/main/OfertasScreen.js', dice: 'ayuda={tab}', llaves: ['promos', 'descuentos'] },
  { archivo: 'src/screens/main/InventarioScreen.js', dice: '<Ayuda id={tab} />', llaves: ['preparaciones', 'recetas'] },
];

let ok = 0, mal = 0;
const fallas = [];
function check(cond, msg) {
  if (cond) { ok++; return; }
  mal++;
  fallas.push(msg);
}
const leer = (p) => fs.readFileSync(p, 'utf8');

function cargar(fuente) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fuente.replace(/^export /gm, '') + '\n;this.__T = TEXTOS_AYUDA;', ctx);
  return JSON.parse(JSON.stringify(ctx.__T));
}

const celular = cargar(leer(path.join(RAIZ, 'src', 'ayuda', 'textos.js')));

// ── 1. Iguales al desktop ──
if (fs.existsSync(D_TEXTOS)) {
  const escritorio = cargar(leer(D_TEXTOS));
  const llaves = new Set([...Object.keys(celular), ...Object.keys(escritorio)]);
  for (const k of llaves) {
    const a = JSON.stringify(celular[k]), b = JSON.stringify(escritorio[k]);
    check(a === b, `"${k}" es distinto:\n      celular: ${a}\n      desktop: ${b}`);
  }
} else {
  console.log(`⏭️  No encontré ${D_TEXTOS}: comparación con el desktop SALTADA.`);
  console.log('   (clona zenit-pos-desktop como carpeta hermana, o apunta ZENIT_DESKTOP a él)');
}

// ── 2. Cada texto, completo ──
for (const [k, t] of Object.entries(celular)) {
  check(/^[a-z]+$/.test(k), `la llave "${k}" debe ser minúsculas sin espacios`);
  check(typeof t.titulo === 'string' && t.titulo.trim(), `"${k}" no tiene título`);
  check(typeof t.texto === 'string' && t.texto.trim(), `"${k}" no tiene texto`);
  for (const campo of ['titulo', 'texto', 'ejemplo']) {
    const v = t[campo] || '';
    check((v.match(/\*\*/g) || []).length % 2 === 0, `"${k}".${campo} tiene unas ** sin cerrar`);
  }
  const largo = (t.texto || '').length + (t.ejemplo || '').length;
  check(largo <= 280, `"${k}" mide ${largo} letras: una burbuja es de 2–3 líneas (máx. 280)`);
}

// ── 3. Cada (?) apunta a una llave que existe; cada llave se usa ──
function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : (p.endsWith('.js') ? [p] : []);
  });
}
const usadas = new Set();
for (const f of archivos(path.join(RAIZ, 'src'))) {
  const t = leer(f);
  for (const m of t.matchAll(/<Ayuda\s+id="([^"]*)"/g)) usadas.add(m[1]);
  for (const m of t.matchAll(/\bayuda="([^"]*)"/g)) usadas.add(m[1]);
}
for (const d of DINAMICAS) {
  const t = leer(path.join(RAIZ, d.archivo));
  const dice = t.includes(d.dice);
  check(dice, `${d.archivo} ya no dice ${d.dice}: actualiza DINAMICAS`);
  if (dice) d.llaves.forEach((k) => usadas.add(k));
}
for (const k of usadas) check(k in celular, `hay un (?) con la llave "${k}", que no está en src/ayuda/textos.js`);
for (const k of Object.keys(celular)) check(usadas.has(k), `la llave "${k}" no se usa en ninguna pantalla`);

console.log(`\n${mal ? '❌' : '✅'} Ayuda (?): ${ok} comprobaciones bien, ${mal} mal · ${usadas.size} llaves en pantalla`);
if (mal) {
  console.log('\n  - ' + fallas.join('\n  - '));
  process.exit(1);
}
