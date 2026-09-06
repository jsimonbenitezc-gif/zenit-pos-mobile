/**
 * SMOKE TEST — En modo local NO hay sesión que expirar.
 *
 * ── EL DEFECTO QUE VIGILA (reportado usando la app, 2026-09-06) ─────────────
 *
 * Entrar sin cuenta, ir a "Pedidos" y tocar un botón sacaba al usuario con
 * "Sesión expirada". Un negocio sin cuenta no tiene token, así que la llamada
 * volvía con 401, y `api.onUnauthorized` borraba todo y cerraba la sesión —
 * de un modo que ni siquiera tiene cuenta. El usuario perdía el acceso a su
 * propio negocio, que vive solo en ese teléfono.
 *
 * La causa concreta: un pedido local nace con `status: 'completado'`
 * (`_pedidoConItems` en offline/local.js), así que la tarjeta del historial
 * pintaba **"Marcar entregado"**, y ese botón llama a `api.updateOrderStatus`.
 * Lo mismo valía para "Completar" y "Cancelar" en cualquier pedido local.
 *
 * ── EL ARREGLO, EN DOS CAPAS ────────────────────────────────────────────────
 *
 *   1. RAÍZ — `onUnauthorized` no hace nada en modo local. Protege TODAS las
 *      pantallas, incluidas las llamadas que se escapen mañana. El cerrojo va
 *      en el punto que DECIDE, no en cada quien que llama (§40.1, §41.6).
 *   2. LA PANTALLA — una venta local no cambia de estado: aquí el historial es
 *      historial, se consulta y se reimprime.
 *
 * Se comprueba sobre el CÓDIGO FUENTE, igual que `tests/lock-sin-include.test.js`
 * del backend (§19.25): el cerrojo de `onUnauthorized` no se puede observar
 * desde fuera sin montar la app entera.
 *
 * Uso:  node scripts/smoke-modo-local-sin-sesion.js
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'src');
const leer = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

/**
 * Quita comentarios antes de analizar.
 *
 * ⚠️ No es cosmético: este archivo documenta el arreglo con comentarios que
 * NOMBRAN a `esModoLocal()`, así que al probar la prueba quitando el cerrojo de
 * verdad seguía pasando en verde — por el comentario. Una comprobación que se
 * satisface con su propia documentación no comprueba nada.
 */
const soloCodigo = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

let fallos = 0;
let total = 0;
const ok = (descripcion, condicion, detalle = '') => {
    total++;
    console.log(`  ${condicion ? '✓' : '✗'} ${descripcion}${condicion || !detalle ? '' : '\n      → ' + detalle}`);
    if (!condicion) fallos++;
};

console.log('\n── En modo local no hay sesión que expirar ──\n');

// ── 1. La raíz: onUnauthorized ──────────────────────────────────────────────
const auth = leer('context/AuthContext.js');

const iniCb = auth.indexOf('api.onUnauthorized =');
const finCb = auth.indexOf('api.onTokenRefreshed =', iniCb);
ok('el callback onUnauthorized sigue existiendo', iniCb > -1 && finCb > iniCb);
const cuerpoCb = soloCodigo(auth.slice(iniCb, finCb));

ok('🔒 onUnauthorized comprueba el modo local ANTES de borrar nada',
    /esModoLocal\(\)/.test(cuerpoCb),
    'sin esto, cualquier 401 expulsa a un negocio que no tiene cuenta');

// El guard tiene que estar antes del primer borrado, no después.
const posGuard = cuerpoCb.indexOf('esModoLocal()');
const posBorrado = cuerpoCb.indexOf('deleteItemAsync');
ok('🔒 y el guard va ANTES del primer borrado de credenciales',
    posGuard > -1 && posBorrado > -1 && posGuard < posBorrado,
    'comprobar después de borrar no sirve de nada');

// Tiene que CORTAR, no solo avisar.
const trozoGuard = cuerpoCb.slice(posGuard, posGuard + 400);
ok('🔒 y CORTA la ejecución (return), no solo escribe un aviso',
    /\breturn\b/.test(trozoGuard));

ok('el callback es async (esModoLocal lee de SecureStore)',
    /api\.onUnauthorized\s*=\s*async/.test(auth));

ok('esModoLocal está importado en AuthContext',
    /import\s*\{[^}]*\besModoLocal\b[^}]*\}\s*from\s*'\.\.\/offline\/local'/.test(auth));

// ── 2. La pantalla de pedidos ───────────────────────────────────────────────
const pedidos = soloCodigo(leer('screens/main/PedidosScreen.js'));

// Cada botón que llama a onCambiarEstado tiene que estar excluido para _local.
const bloquesEstado = [...pedidos.matchAll(/\{([^}]*?)pedido\.status === '(registrado|completado)'[^}]*?&&/g)];
ok('los botones de estado siguen condicionados por el status del pedido',
    bloquesEstado.length >= 2,
    `encontrados ${bloquesEstado.length}, se esperaban 2`);

const todosExcluyenLocal = bloquesEstado.every((m) => /!pedido\._local/.test(m[0]));
ok('🔒 y NINGUNO se pinta para una venta local (`!pedido._local`)',
    todosExcluyenLocal,
    'un pedido local nace "completado": sin esto sale "Marcar entregado", que llama al backend');

ok('🔒 reimprimir no pide el pedido al servidor si es local',
    /!pedido\._local\s*&&\s*\(!pedido\.items/.test(pedidos),
    'los pedidos locales ya traen sus items; pedirlos al backend da 401');

// ── 3. La forma del pedido local no cambió bajo los pies ────────────────────
const local = soloCodigo(leer('offline/local.js'));
ok('un pedido local sigue marcándose con `_local: true`',
    /_local:\s*true/.test(local),
    'si se renombra, los guards de arriba dejan de aplicar EN SILENCIO');
ok('...y sigue naciendo como "completado" (por eso salía "Marcar entregado")',
    /status:\s*'completado'/.test(local));
ok('...y `listarPedidosLocales` sigue devolviendo los items',
    /_pedidoConItems/.test(local) && /items:\s*items\.map/.test(local));

console.log(
    `\n${fallos === 0 ? '✅' : '❌'} ${total - fallos} de ${total} comprobaciones del modo local sin sesión.\n`
);
process.exit(fallos === 0 ? 0 : 1);
