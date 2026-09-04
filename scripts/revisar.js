#!/usr/bin/env node
// ============================================================================
// scripts/revisar.js — la puerta antes de `eas build`.
//
// POR QUÉ EXISTE: el mobile no tiene tests ni build step, así que un símbolo
// importado que no existe, o un `api.loQueSea()` que nadie escribió, no da la
// cara hasta que alguien abre esa pantalla en un APK ya compilado. Es la misma
// familia de error que en el desktop dejó muertas la vista de Turno, la de Mesas
// y el autocompletado por teléfono (CLAUDE.md §28, §29 y §36) — y en este mismo
// repo ya pasó con `api.getOrder()`, que se llamaba sin existir (§32.12).
//
// Comprueba tres cosas:
//   1. Que TODOS los archivos parseen (Babel, con la config real del proyecto).
//   2. Que cada símbolo importado de un módulo local exista de verdad ahí.
//   3. Que cada `api.X()` exista como método del cliente HTTP.
//
// Sale con código 1 si encuentra algo. Uso:  npm run revisar
// ============================================================================
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const RAIZ = path.resolve(__dirname, '..');
const problemas = [];

// ─── 1. Recolectar archivos ──────────────────────────────────────────────────
function listarJs(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (['node_modules', '.git', '.expo', 'android', 'ios', 'assets'].includes(entrada.name)) continue;
      listarJs(completo, acc);
    } else if (/\.jsx?$/.test(entrada.name)) {
      acc.push(completo);
    }
  }
  return acc;
}

const archivos = [
  ...listarJs(path.join(RAIZ, 'src')),
  path.join(RAIZ, 'App.js'),
].filter(f => fs.existsSync(f));

// ─── 2. Parsear ──────────────────────────────────────────────────────────────
const ast = new Map();
for (const f of archivos) {
  const codigo = fs.readFileSync(f, 'utf8');
  try {
    ast.set(f, parser.parse(codigo, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
    }));
  } catch (e) {
    problemas.push(`[parseo] ${rel(f)}: ${e.message}`);
  }
}

function rel(f) { return path.relative(RAIZ, f).replace(/\\/g, '/'); }

// ─── 3. Exportaciones de cada módulo local ───────────────────────────────────
function exportacionesDe(f) {
  const arbol = ast.get(f);
  if (!arbol) return null;
  const nombres = new Set();
  let hayDefault = false;
  let reexportaTodo = false;
  for (const nodo of arbol.program.body) {
    if (nodo.type === 'ExportNamedDeclaration') {
      if (nodo.declaration) {
        const d = nodo.declaration;
        if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') nombres.add(d.id.name);
        if (d.type === 'VariableDeclaration') {
          for (const dec of d.declarations) {
            if (dec.id.type === 'Identifier') nombres.add(dec.id.name);
            // export const { a, b } = ...
            if (dec.id.type === 'ObjectPattern') for (const p of dec.id.properties) if (p.value?.name) nombres.add(p.value.name);
          }
        }
      }
      for (const esp of nodo.specifiers || []) {
        if (esp.exported?.name) nombres.add(esp.exported.name);
      }
    } else if (nodo.type === 'ExportDefaultDeclaration') {
      hayDefault = true;
    } else if (nodo.type === 'ExportAllDeclaration') {
      reexportaTodo = true; // `export * from ...`: no se persigue, se acepta todo
    }
  }
  return { nombres, hayDefault, reexportaTodo };
}

function resolverLocal(desde, spec) {
  if (!spec.startsWith('.')) return null; // dependencia de npm: fuera de alcance
  const base = path.resolve(path.dirname(desde), spec);
  const candidatos = [base, base + '.js', base + '.jsx', path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  return candidatos.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

for (const f of archivos) {
  const arbol = ast.get(f);
  if (!arbol) continue;
  for (const nodo of arbol.program.body) {
    if (nodo.type !== 'ImportDeclaration') continue;
    const spec = nodo.source.value;
    if (!spec.startsWith('.')) continue;

    const destino = resolverLocal(f, spec);
    if (!destino) {
      problemas.push(`[import] ${rel(f)}: no existe el módulo '${spec}'`);
      continue;
    }
    const exp = exportacionesDe(destino);
    if (!exp || exp.reexportaTodo) continue;

    for (const s of nodo.specifiers) {
      if (s.type === 'ImportDefaultSpecifier') {
        if (!exp.hayDefault) problemas.push(`[import] ${rel(f)}: '${spec}' no tiene export default`);
      } else if (s.type === 'ImportSpecifier') {
        const nombre = s.imported.name;
        if (!exp.nombres.has(nombre)) {
          problemas.push(`[import] ${rel(f)}: '${nombre}' no está exportado por '${spec}'`);
        }
      }
    }
  }
}

// ─── 3.b Un símbolo importado tapado por una declaración local ───────────────
// Pasó de verdad (2026-09-04): la pantalla de Turno importó `cerrarTurno` del
// adaptador y ya tenía su propio `async function cerrarTurno()`. El handler se
// tapaba a sí mismo y se llamaba EN BUCLE en vez de llamar al adaptador. Es JS
// perfectamente válido, así que no lo detecta nada más: ni el parseo, ni Metro,
// ni Hermes. El arreglo es renombrar uno de los dos (con `as` en el import).
for (const f of archivos) {
  const arbol = ast.get(f);
  if (!arbol) continue;
  const importados = new Map();   // nombre local → módulo del que viene
  for (const nodo of arbol.program.body) {
    if (nodo.type !== 'ImportDeclaration') continue;
    for (const s of nodo.specifiers) {
      if (s.local?.name) importados.set(s.local.name, nodo.source.value);
    }
  }
  if (importados.size === 0) continue;

  // Solo declaraciones de nivel de módulo o del cuerpo de un componente: son las
  // que de verdad tapan al import en todo el archivo.
  const declarado = (nombre, linea) => {
    if (!importados.has(nombre)) return;
    problemas.push(
      `[shadow] ${rel(f)}:${linea}: '${nombre}' se declara aquí y además se importa de ` +
      `'${importados.get(nombre)}' — la declaración local lo tapa. Renombra uno (usa 'as' en el import).`
    );
  };
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (nodo.type === 'FunctionDeclaration' && nodo.id?.name) {
      declarado(nodo.id.name, nodo.loc?.start.line);
    }
    if (nodo.type === 'VariableDeclarator' && nodo.id?.type === 'Identifier' && nodo.init) {
      declarado(nodo.id.name, nodo.loc?.start.line);
    }
    for (const k of Object.keys(nodo)) {
      if (k === 'loc') continue;
      const v = nodo[k];
      if (Array.isArray(v)) v.forEach(recorrer);
      else if (v && typeof v.type === 'string') recorrer(v);
    }
  };
  recorrer(arbol.program);
}

// ─── 4. Métodos de `api` ─────────────────────────────────────────────────────
const RUTA_CLIENTE = path.join(RAIZ, 'src/api/client.js');
const metodosApi = new Set();
{
  const arbol = ast.get(RUTA_CLIENTE);
  if (!arbol) {
    problemas.push('[api] no se pudo leer src/api/client.js');
  } else {
    const recorrer = (nodo) => {
      if (!nodo || typeof nodo !== 'object') return;
      if (nodo.type === 'ClassDeclaration' && nodo.id?.name === 'ApiClient') {
        for (const m of nodo.body.body) {
          if (m.key?.name) metodosApi.add(m.key.name);
        }
      }
      for (const k of Object.keys(nodo)) {
        const v = nodo[k];
        if (Array.isArray(v)) v.forEach(recorrer);
        else if (v && typeof v.type === 'string') recorrer(v);
      }
    };
    recorrer(arbol.program);
    // Propiedades asignadas desde fuera (callbacks) o en el constructor.
    for (const extra of ['token', 'refreshToken', 'baseURL', 'onUnauthorized', 'onTokenRefreshed']) metodosApi.add(extra);
  }
}

// Se recorre el AST y no el texto: `api.qrserver.com` aparece dentro de un
// comentario y una búsqueda por texto lo denunciaría como método inexistente.
// Un chequeo con falsos positivos se acaba ignorando, y entonces no sirve.
for (const f of archivos) {
  if (f === RUTA_CLIENTE) continue;
  const arbol = ast.get(f);
  if (!arbol) continue;
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (
      nodo.type === 'MemberExpression' &&
      nodo.object?.type === 'Identifier' && nodo.object.name === 'api' &&
      !nodo.computed && nodo.property?.name && !metodosApi.has(nodo.property.name)
    ) {
      problemas.push(`[api] ${rel(f)}:${nodo.loc?.start.line}: api.${nodo.property.name} no existe en ApiClient`);
    }
    for (const k of Object.keys(nodo)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      const v = nodo[k];
      if (Array.isArray(v)) v.forEach(recorrer);
      else if (v && typeof v.type === 'string') recorrer(v);
    }
  };
  recorrer(arbol.program);
}

// ─── Resultado ───────────────────────────────────────────────────────────────
if (problemas.length) {
  console.error(`\n❌ ${problemas.length} problema(s):\n`);
  for (const p of problemas) console.error('  · ' + p);
  console.error('');
  process.exit(1);
}
console.log(`✅ ${archivos.length} archivos: parsean, sus imports locales existen y todos los api.X() están definidos.`);
