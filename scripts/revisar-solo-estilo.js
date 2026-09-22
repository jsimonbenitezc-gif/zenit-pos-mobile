#!/usr/bin/env node
// ============================================================================
// scripts/revisar-solo-estilo.js — `npm run revisar:estilo`
//
// EL GUARDIÁN DEL REDISEÑO (PLAN_REDISENO_V1, trampa 1).
//
// Un rediseño no cambia lo que hace la app, solo cómo se ve. El peligro real es
// romper un botón sin querer: mover un `onPress`, perder un `disabled`, cambiar
// a qué función llama. Nada de eso da un error: el botón simplemente deja de
// hacer lo que hacía, o hace otra cosa.
//
// Este script toma cada pantalla que cambió desde el COMMIT BASE del bloque
// (scripts/estilo-base.json) y compara su "huella de lógica" con la de antes:
//
//   · manejadores   on*={...} y disabled/value/visible/editable/refreshing/…
//   · llamadas      api.X(...) y lo importado de src/offline/ o src/api/
//   · hooks         useState/useEffect/useCallback/... (el código entero)
//   · funciones     las funciones con nombre en minúscula (no componentes),
//                   con su código entero
//
// Tienen que ser IGUALES (como multiconjunto; el orden no importa, porque
// reacomodar la pantalla es justo lo que se permite). Lo único que puede cambiar
// es presentación: estilos, envoltorios, textos, iconos y los COMPONENTES
// (funciones en Mayúscula), que son dibujo.
//
// Grupos: cuando una pantalla se parte en varias (Ajustes, Bloque 1), se declara
// en estilo-base.json → "grupos": { "viejo.js": ["nuevo1.js", "nuevo2.js"] } y
// se compara la huella del archivo viejo contra la SUMA de los nuevos.
//
// ⚠️ Si cambias lógica A PROPÓSITO fuera del rediseño, mueve la base: si no,
// este guardián la tomará por un botón roto (que es su trabajo).
//
// Sale con código 1 si algo que no es presentación cambió.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

const RAIZ = path.resolve(__dirname, '..');

const ATRIBUTOS_LOGICA = new Set([
  'disabled', 'editable', 'value', 'visible', 'refreshing', 'selectedValue',
  'secureTextEntry', 'checked', 'selected', 'refreshControl', 'maxLength',
]);
// Hooks que solo sirven para dibujar: se pueden agregar sin que sea lógica.
const HOOKS_DE_DIBUJO = new Set(['useSafeAreaInsets', 'useWindowDimensions', 'useIsFocused']);

const PLUGINS = ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining',
  'nullishCoalescingOperator', 'dynamicImport'];

const codigoDe = (nodo) => generate(nodo, { comments: false, compact: true }).code;

/** La huella de lógica de un archivo: { manejadores, llamadas, hooks, funciones } */
function huella(fuente) {
  const arbol = parser.parse(fuente, { sourceType: 'module', plugins: PLUGINS });

  // Qué nombres vienen de src/offline/ o src/api/ (salvo `api`, que se mira aparte)
  const deDatos = new Set();
  for (const n of arbol.program.body) {
    if (n.type === 'ImportDeclaration' && /(^|\/)(offline|api)\//.test(n.source.value)) {
      for (const e of n.specifiers) deDatos.add(e.local.name);
    }
  }

  const h = { manejadores: [], llamadas: [], hooks: [], funciones: [] };

  traverse(arbol, {
    JSXAttribute(p) {
      const nombre = p.node.name && p.node.name.name;
      if (typeof nombre !== 'string') return;
      if (!/^on[A-Z]/.test(nombre)) {
        if (!ATRIBUTOS_LOGICA.has(nombre)) return;
        // `value`, `disabled`, `visible`… son lógica en un CONTROL (algo que
        // también tiene un on*: un botón, un campo, un modal). En una tarjeta
        // de solo dibujo (`<StatCard value=...>`) son presentación.
        const hermanos = p.parent.attributes || [];
        const esControl = hermanos.some((a) => a.type === 'JSXAttribute'
          && typeof a.name.name === 'string' && /^on[A-Z]/.test(a.name.name));
        if (!esControl) return;
      }
      const v = p.node.value;
      const cod = !v ? 'true' : v.type === 'JSXExpressionContainer' ? codigoDe(v.expression) : codigoDe(v);
      h.manejadores.push(`${nombre}=${cod}`);
    },
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'api') {
        h.llamadas.push(codigoDe(p.node));
      } else if (c.type === 'Identifier' && deDatos.has(c.name)) {
        h.llamadas.push(codigoDe(p.node));
      } else if (c.type === 'Identifier' && /^use[A-Z]/.test(c.name) && !HOOKS_DE_DIBUJO.has(c.name)) {
        h.hooks.push(codigoDe(p.node));
      }
    },
    FunctionDeclaration(p) {
      const n = p.node.id && p.node.id.name;
      if (n && /^[a-z_]/.test(n)) h.funciones.push(codigoDe(p.node));
    },
    VariableDeclarator(p) {
      const init = p.node.init;
      if (p.node.id.type !== 'Identifier' || !init) return;
      if (!/^[a-z_]/.test(p.node.id.name)) return;
      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        h.funciones.push(`${p.node.id.name}=${codigoDe(init)}`);
      }
    },
  });
  for (const k of Object.keys(h)) h[k].sort();
  return h;
}

function sumar(huellas) {
  const t = { manejadores: [], llamadas: [], hooks: [], funciones: [] };
  for (const h of huellas) for (const k of Object.keys(t)) t[k].push(...h[k]);
  for (const k of Object.keys(t)) t[k].sort();
  return t;
}

/** Diferencias entre dos huellas: [{ tipo, falta|sobra, codigo }] */
function comparar(vieja, nueva) {
  const dif = [];
  for (const k of Object.keys(vieja)) {
    const cuenta = new Map();
    for (const x of vieja[k]) cuenta.set(x, (cuenta.get(x) || 0) + 1);
    for (const x of nueva[k]) cuenta.set(x, (cuenta.get(x) || 0) - 1);
    for (const [x, n] of cuenta) {
      if (n > 0) dif.push({ tipo: k, cambio: 'desapareció', codigo: x });
      if (n < 0) dif.push({ tipo: k, cambio: 'apareció', codigo: x });
    }
  }
  return dif;
}

/** Compara dos fuentes (o una contra varias). Lo usa también el smoke test. */
function compararFuentes(viejo, nuevos) {
  const lista = Array.isArray(nuevos) ? nuevos : [nuevos];
  return comparar(huella(viejo), sumar(lista.map(huella)));
}

module.exports = { huella, compararFuentes };

// ─── Uso desde la línea de comandos ──────────────────────────────────────────
if (require.main === module) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'estilo-base.json'), 'utf8'));
  const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8' });

  // Solo lo que es PANTALLA o componente: las piezas nuevas y el tema son
  // presentación por definición.
  const vigilado = (f) => /^src\/(screens|components|navigation)\//.test(f) && !/^src\/components\/ui\//.test(f);

  const cambiados = git('diff', '--name-only', '--diff-filter=MD', cfg.base, '--', 'src')
    .split('\n').map((s) => s.trim()).filter(Boolean).filter(vigilado);

  const grupos = cfg.grupos || {};
  const problemas = [];
  let revisados = 0;
  for (const f of cambiados) {
    const viejo = git('show', `${cfg.base}:${f}`);
    const nuevos = (grupos[f] || [f]).map((n) => {
      const p = path.join(RAIZ, n);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    });
    if (nuevos.every((n) => !n)) {
      problemas.push(`${f}: se BORRÓ y no está declarado en "grupos" de estilo-base.json`);
      continue;
    }
    revisados++;
    for (const d of compararFuentes(viejo, nuevos.filter(Boolean))) {
      problemas.push(`${f} [${d.tipo}] ${d.cambio}: ${d.codigo.slice(0, 160)}`);
    }
  }

  console.log(`\n── Solo estilo (base ${cfg.base}) ──`);
  console.log(`   ${revisados} pantalla(s) cambiada(s) revisada(s)${revisados ? ': ' + cambiados.join(', ') : ''}`);
  if (problemas.length) {
    console.log(`\n❌ ${problemas.length} cambio(s) que NO son presentación:\n`);
    for (const p of problemas) console.log('   · ' + p);
    console.log('\n   Un rediseño no cambia lo que hace la app. Si fue a propósito, anótalo y mueve la base.\n');
    process.exit(1);
  }
  console.log('✅ Solo cambió la presentación.\n');
}
