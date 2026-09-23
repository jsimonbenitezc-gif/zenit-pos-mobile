#!/usr/bin/env node
// Arma src/iconos/catalogo.json, src/iconos/archivos.js y assets/iconos/png/ a partir de
// Fluent Emoji (estilo COLOR) y de los iconos propios (scripts/iconos/nuevos/*.svg).
// PLAN_REDISENO_V1 §3.3. Solo hace falta correrlo al cambiar scripts/iconos/fuente.js.
//
//   npm i --no-save @resvg/resvg-js sharp        (herramientas: NO van al APK)
//   node scripts/iconos/generar-catalogo.js <carpeta de microsoft/fluentui-emoji>
//
// Por qué PNG y no SVG (medido el 2026-09-22, trampa 9): los 188 SVG pesan 3,0 MB y cada
// uno trae ~125 figuras y ~18 degradados — 80 productos en Venta serían ~10.000 figuras de
// react-native-svg. En PNG de 144 px con paleta (48 dp a 3x) son 728 KB y UNA imagen nativa
// por producto. Lado a lado con el original no se distinguen.
//
// Falla (código 1) si un emoji de la fuente no tiene dibujo en Fluent o no tiene nombre:
// un icono sin dibujo saldría como el emoji del sistema sin que nadie lo note.

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const RAIZ = path.join(__dirname, '..', '..');
const { GRUPOS, NOMBRES } = require('./fuente');

function cargarEsm(rel) {
  const archivo = path.join(RAIZ, rel);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
}
const { llaveEmoji } = cargarEsm('src/iconos/normalizar.js');

function indiceFluent(dir) {
  const assets = path.join(dir, 'assets');
  const porLlave = new Map();
  for (const carpeta of fs.readdirSync(assets)) {
    let meta;
    try { meta = JSON.parse(fs.readFileSync(path.join(assets, carpeta, 'metadata.json'), 'utf8')); }
    catch { continue; }
    // Los que tienen tonos de piel guardan el dibujo neutro en Default/.
    const opciones = [path.join(assets, carpeta, 'Color'), path.join(assets, carpeta, 'Default', 'Color')];
    const dirColor = opciones.find(p => fs.existsSync(p));
    if (!dirColor) continue;
    const svg = fs.readdirSync(dirColor).find(f => f.endsWith('.svg'));
    if (!svg) continue;
    const id = carpeta.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    porLlave.set(llaveEmoji(meta.glyph), { id, origen: path.join(dirColor, svg), cldr: meta.cldr });
  }
  return porLlave;
}

// Arma el catálogo. No toca el disco: así la prueba lo puede correr sin herramientas.
function generar(dirFluent) {
  const { NUEVOS = [] } = require('./fuente');
  const fluent = indiceFluent(dirFluent);
  const errores = [];
  const iconos = new Map();   // llave (o 'z-<id>' para los propios) → entrada
  const porGrupo = new Map(GRUPOS.map(g => [g.id, []]));

  for (const g of GRUPOS) {
    for (const emoji of g.emojis.split(/\s+/).filter(Boolean)) {
      const llave = llaveEmoji(emoji);
      const f = fluent.get(llave);
      const nombres = NOMBRES[emoji];
      if (!f) { errores.push(`${emoji} (${g.id}): no hay dibujo en Fluent`); continue; }
      if (!nombres) { errores.push(`${emoji} (${g.id}): falta su nombre en español`); continue; }
      if (!iconos.has(llave)) {
        iconos.set(llave, { id: f.id, nombre: nombres[0], buscar: nombres.slice(1), emoji, llave, grupos: [], _origen: f.origen });
      }
      const e = iconos.get(llave);
      if (!e.grupos.includes(g.id)) e.grupos.push(g.id);
      if (!porGrupo.get(g.id).includes(e.id)) porGrupo.get(g.id).push(e.id);
    }
  }
  for (const emoji of Object.keys(NOMBRES)) {
    if (!iconos.has(llaveEmoji(emoji))) errores.push(`${emoji}: tiene nombre pero no está en ningún grupo`);
  }

  // Los propios: sin emoji, se guardan en el producto como `svg:z-<id>` (trampa 7).
  for (const n of NUEVOS) {
    const origen = path.join(__dirname, 'nuevos', n.id + '.svg');
    if (!/^[a-z0-9_]+$/.test(n.id)) { errores.push(`nuevo "${n.id}": id inválido`); continue; }
    if (!fs.existsSync(origen)) { errores.push(`nuevo "${n.id}": falta scripts/iconos/nuevos/${n.id}.svg`); continue; }
    const id = 'z_' + n.id;
    iconos.set('z-' + n.id, { id, nombre: n.nombre, buscar: n.buscar || [], emoji: null, llave: null,
      valor: 'svg:z-' + n.id, grupos: n.grupos, _origen: origen });
    for (const gid of n.grupos) {
      if (!porGrupo.has(gid)) { errores.push(`nuevo "${n.id}": grupo desconocido ${gid}`); continue; }
      porGrupo.get(gid).push(id);
    }
  }

  const ids = new Set();
  for (const e of iconos.values()) {
    if (ids.has(e.id)) errores.push(`id repetido: ${e.id}`);
    ids.add(e.id);
  }
  const grupos = GRUPOS.map(g => ({ id: g.id, nombre: g.nombre, tipos: g.tipos, iconos: porGrupo.get(g.id) }));
  return { errores, entradas: [...iconos.values()], grupos };
}

function catalogoDe(entradas, grupos) {
  const iconos = entradas.map(({ _origen, ...resto }) => resto);
  return { version: 1, estilo: 'fluent-color', grupos, iconos };
}

module.exports = { generar, catalogoDe };

// El LICENSE viene con saltos a 80 columnas y sangría: en un teléfono se parte feo.
// Se une cada párrafo en una línea; el texto no cambia.
function licenciaEnParrafos(texto) {
  return texto.replace(/\r\n/g, '\n').split(/\n\s*\n/)
    .map(par => par.split('\n').map(l => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean).join('\n\n');
}

async function principal() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, 'assets'))) {
    console.error('Uso: node scripts/iconos/generar-catalogo.js <carpeta de microsoft/fluentui-emoji>');
    process.exit(1);
  }
  let Resvg, sharp;
  try { ({ Resvg } = require('@resvg/resvg-js')); sharp = require('sharp'); }
  catch { console.error('Faltan las herramientas: npm i --no-save @resvg/resvg-js sharp'); process.exit(1); }

  const { errores, entradas, grupos } = generar(dir);
  if (errores.length) { console.error('❌ El catálogo tiene huecos:\n  ' + errores.join('\n  ')); process.exit(1); }

  const destino = path.join(RAIZ, 'assets', 'iconos', 'png');
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  let total = 0;
  for (const e of entradas) {
    const crudo = new Resvg(fs.readFileSync(e._origen), { fitTo: { mode: 'width', value: 144 } }).render().asPng();
    const png = await sharp(crudo).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(path.join(destino, e.id + '.png'), png);
    total += png.length;
  }
  fs.writeFileSync(path.join(RAIZ, 'src', 'iconos', 'catalogo.json'), JSON.stringify(catalogoDe(entradas, grupos), null, 1) + '\n');
  // Metro solo empaqueta imágenes con `require` escrito a mano: por eso esta tabla se GENERA.
  const lineas = entradas.map(e => `  ${e.id}: require('../../assets/iconos/png/${e.id}.png'),`);
  fs.writeFileSync(path.join(RAIZ, 'src', 'iconos', 'archivos.js'),
    '// GENERADO por scripts/iconos/generar-catalogo.js — no se edita a mano.\n' +
    'export const ARCHIVOS = {\n' + lineas.join('\n') + '\n};\n');
  fs.copyFileSync(path.join(dir, 'LICENSE'), path.join(RAIZ, 'assets', 'iconos', 'LICENSE-fluentui-emoji.txt'));
  // La licencia MIT pide que su aviso viaje DENTRO de la app (Ajustes → Licencias).
  fs.writeFileSync(path.join(RAIZ, 'src', 'iconos', 'licencia.js'),
    '// GENERADO por scripts/iconos/generar-catalogo.js — no se edita a mano.\n' +
    'export const LICENCIA_FLUENT = ' + JSON.stringify(licenciaEnParrafos(fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8'))) + ';\n');
  console.log(`✅ ${entradas.length} iconos en ${grupos.length} grupos · ${(total / 1024).toFixed(0)} KB`);
}

if (require.main === module) principal();
