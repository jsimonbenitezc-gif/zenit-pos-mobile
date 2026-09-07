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
//   4. Que no se use ningún nombre que no esté declarado ni importado (el
//      "fantasma": revienta la pantalla entera al abrirla).
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


// ─── 3.c Un identificador que se USA y nunca se declaró ──────────────────────
// EL FANTASMA. Pasó el 2026-09-06 con la pantalla de Turno: usaba <AvisoSinCuenta>
// y `tocaAvisar()` sin importarlos, y el estado `aviso`/`setAviso` sin declararlo.
// La pantalla reventaba entera al abrirse ("Property 'AvisoSinCuenta' doesn't
// exist") y NADA lo avisaba: parsea perfecto, sus imports existen y no hay ningún
// api.X() de más, así que las tres reglas anteriores pasaban en verde.
//
// Es la misma familia que dejó muertas la vista de Turno y la de Mesas del desktop
// (§28, §29) — allí la caza `npm run revisar` desde hace tiempo; aquí faltaba.
//
// Se resuelve con el ÁMBITO REAL de Babel, no con expresiones regulares: hay que
// saber qué nombres están ligados en cada función, y eso una regex no lo sabe.
const traverse = require('@babel/traverse').default;

// Lo que existe sin declararlo: JS, el entorno de React Native y Node (los
// scripts y los shims). Un nombre nuevo aquí es una decisión, no un parche:
// si algo falta en esta lista, es que de verdad no está definido en ninguna parte.
const GLOBALES = new Set([
  // JS
  'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'Promise',
  'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'BigInt',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'globalThis', 'Intl',
  'ArrayBuffer', 'Uint8Array', 'Int8Array', 'DataView', 'TextEncoder', 'TextDecoder',
  // Temporizadores y entorno
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'clearImmediate', 'requestAnimationFrame', 'cancelAnimationFrame',
  'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'AbortSignal',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'FileReader', 'atob', 'btoa',
  'XMLHttpRequest', 'WebSocket', 'EventSource', 'alert', 'navigator', 'performance',
  // React Native / Node
  '__DEV__', 'global', 'process', 'require', 'module', 'exports', '__dirname',
  '__filename', 'Buffer', 'structuredClone', 'queueMicrotask',
]);

for (const f of archivos) {
  const arbol = ast.get(f);
  if (!arbol) continue;
  const vistos = new Set();   // un nombre, un aviso por archivo
  try {
    traverse(arbol, {
      ReferencedIdentifier(camino) {
        const nombre = camino.node.name;
        if (GLOBALES.has(nombre) || vistos.has(nombre)) return;
        // `obj.prop` y `{ prop: 1 }` no son referencias a un nombre suelto.
        if (camino.parentPath?.isMemberExpression({ computed: false }) &&
            camino.parentPath.node.property === camino.node) return;
        if (camino.scope.hasBinding(nombre, /* noGlobals */ true)) return;
        vistos.add(nombre);
        const enJsx = camino.parentPath?.isJSXOpeningElement() ||
                      camino.parentPath?.isJSXClosingElement();
        problemas.push(
          `[fantasma] ${rel(f)}:${camino.node.loc?.start.line}: ` +
          `'${nombre}' se usa${enJsx ? ' como componente JSX' : ''} y no está ` +
          `declarado ni importado — revienta al abrir esa pantalla.`
        );
      },
    });
  } catch (e) {
    problemas.push(`[fantasma] ${rel(f)}: no se pudo analizar el ámbito: ${e.message}`);
  }
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
console.log(`✅ ${archivos.length} archivos: parsean, sus imports locales existen, todos los api.X() están definidos y no hay ningún nombre sin declarar.`);
