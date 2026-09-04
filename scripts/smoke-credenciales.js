#!/usr/bin/env node
// ============================================================================
// scripts/smoke-credenciales.js
// Prueba las REGLAS de `src/offline/credenciales.js` cargando el archivo REAL
// (no una copia) con expo-secure-store, expo-crypto y el cliente HTTP simulados.
//
// POR QUÉ: aquí se decide quién entra a la caja. Un fallo silencioso —caer al
// fallback local cuando el servidor ya dijo que no, o aceptar un PIN vacío—
// no daría ningún error visible: simplemente dejaría pasar a quien no debe.
//
// Los hashes de PIN se generan con el bcrypt NATIVO del backend, para probar de
// verdad que bcryptjs verifica lo que el servidor produce.
//
// Uso:  node scripts/smoke-credenciales.js
// ============================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const babel = require('@babel/core');

const RAIZ = path.resolve(__dirname, '..');

// ─── Dobles de prueba ────────────────────────────────────────────────────────
const almacen = new Map();
const secureStoreFalso = {
  async getItemAsync(k) { return almacen.has(k) ? almacen.get(k) : null; },
  async setItemAsync(k, v) { almacen.set(k, v); },
  async deleteItemAsync(k) { almacen.delete(k); },
};

const expoCryptoFalso = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  async digestStringAsync(_alg, texto) {
    return crypto.createHash('sha256').update(texto).digest('hex');
  },
  getRandomBytes(n) { return crypto.randomBytes(n); },
};

const apiFalso = {
  token: null,
  _respuesta: null,   // () => resultado | lanza
  llamadas: 0,
  async verifyProfilePin(rol, pin) {
    this.llamadas++;
    return this._respuesta(rol, pin);
  },
};

// ─── Cargador del módulo real ────────────────────────────────────────────────
function cargarModuloReal(rutaRelativa, sustitutos) {
  const archivo = path.join(RAIZ, rutaRelativa);
  const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
    filename: archivo,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const modulo = { exports: {} };
  const requireFalso = (spec) => {
    if (spec in sustitutos) return sustitutos[spec];
    return require(spec); // bcryptjs de verdad
  };
  new Function('require', 'module', 'exports', code)(requireFalso, modulo, modulo.exports);
  return modulo.exports;
}

// ─── Aserciones ──────────────────────────────────────────────────────────────
let ok = 0;
const fallos = [];
function comprobar(descripcion, condicion) {
  if (condicion) { ok++; console.log('  ✓ ' + descripcion); }
  else { fallos.push(descripcion); console.log('  ✗ ' + descripcion); }
}

(async () => {
  const bcryptNativo = require(path.join(RAIZ, '../zenit-pos-backend/node_modules/bcrypt'));

  const cred = cargarModuloReal('src/offline/credenciales.js', {
    'expo-secure-store': secureStoreFalso,
    'expo-crypto': expoCryptoFalso,
    '../api/client': { api: apiFalso },
  });

  // Hashes tal como los produce el backend.
  const hashBcrypt = await bcryptNativo.hash('4321', 10);
  const hashSha    = crypto.createHash('sha256').update('9876').digest('hex');

  const permisos = {
    cajero:    { enabled: true, pin_set: true, pin: hashBcrypt, pin_bcrypt: hashBcrypt },
    encargado: { enabled: true, pin_set: true, pin: hashSha },   // PIN puesto por un desktop sin red
    mesero:    { enabled: true, pin_set: false },                // puesto sin PIN
  };

  console.log('\n── PIN de puesto, sin red ──');
  comprobar('el PIN bcrypt correcto pasa',
    await cred.verificarPinPuestoLocal(permisos, 'cajero', '4321') === true);
  comprobar('un PIN bcrypt equivocado NO pasa',
    await cred.verificarPinPuestoLocal(permisos, 'cajero', '1111') === false);
  comprobar('el PIN SHA-256 legacy (desktop offline) también se verifica',
    await cred.verificarPinPuestoLocal(permisos, 'encargado', '9876') === true);
  comprobar('un PIN SHA-256 equivocado NO pasa',
    await cred.verificarPinPuestoLocal(permisos, 'encargado', '0000') === false);
  comprobar('un puesto SIN pin_set no valida nada',
    await cred.verificarPinPuestoLocal(permisos, 'mesero', '1234') === false);
  comprobar('un puesto inexistente no valida nada',
    await cred.verificarPinPuestoLocal(permisos, 'fantasma', '1234') === false);
  comprobar('un PIN vacío NO pasa',
    await cred.verificarPinPuestoLocal(permisos, 'cajero', '') === false);

  console.log('\n── Quién decide: servidor u offline ──');
  apiFalso.token = 'tok';
  apiFalso._respuesta = () => ({ valid: true });
  apiFalso.llamadas = 0;
  let r = await cred.verificarPinPuesto('cajero', 'loQueSea', permisos);
  comprobar('con sesión, manda el SERVIDOR (acepta aunque el PIN local no coincida)',
    r.valido === true && r.offline === false && apiFalso.llamadas === 1);

  apiFalso._respuesta = () => ({ valid: false });
  r = await cred.verificarPinPuesto('cajero', '4321', permisos);
  comprobar('🔒 un "PIN incorrecto" del servidor NO cae al fallback local (ni con el PIN bueno)',
    r.valido === false && r.offline === false);

  apiFalso._respuesta = () => { throw new Error('Sin conexión al servidor'); };
  r = await cred.verificarPinPuesto('cajero', '4321', permisos);
  comprobar('un fallo de RED sí cae al fallback local y acepta el PIN correcto',
    r.valido === true && r.offline === true);
  r = await cred.verificarPinPuesto('cajero', '1111', permisos);
  comprobar('…y sigue rechazando el equivocado',
    r.valido === false && r.offline === true);

  apiFalso._respuesta = () => { throw new Error('Error 500'); };
  let lanzo = false;
  try { await cred.verificarPinPuesto('cajero', '4321', permisos); } catch { lanzo = true; }
  comprobar('🔒 un error del SERVIDOR (no de red) se propaga: no se verifica por nuestra cuenta',
    lanzo === true);

  apiFalso.token = null;
  apiFalso.llamadas = 0;
  r = await cred.verificarPinPuesto('cajero', '4321', permisos);
  comprobar('sin sesión no se llama al servidor y se verifica local',
    r.valido === true && r.offline === true && apiFalso.llamadas === 0);

  console.log('\n── Contraseña del administrador sin red ──');
  comprobar('sin verificador guardado no hay forma de validar',
    (await cred.hayVerificadorAdmin()) === false &&
    (await cred.verificarPasswordAdminLocal('loQueSea', 'a@b.com')) === false);

  await cred.guardarVerificadorAdmin('a@b.com', 'MiClave123');
  comprobar('tras un login con red, el equipo ya puede validar sin red',
    (await cred.hayVerificadorAdmin()) === true);
  comprobar('la contraseña correcta pasa',
    (await cred.verificarPasswordAdminLocal('MiClave123', 'a@b.com')) === true);
  comprobar('una contraseña equivocada NO pasa',
    (await cred.verificarPasswordAdminLocal('MiClave124', 'a@b.com')) === false);
  comprobar('🔒 el verificador es de UNA cuenta: con otra sesión no vale',
    (await cred.verificarPasswordAdminLocal('MiClave123', 'otro@b.com')) === false);
  comprobar('una contraseña vacía NO pasa',
    (await cred.verificarPasswordAdminLocal('', 'a@b.com')) === false);
  comprobar('el verificador NO guarda la contraseña en claro',
    !JSON.stringify([...almacen.values()]).includes('MiClave123'));

  await cred.borrarVerificadorAdmin();
  comprobar('el logout lo borra',
    (await cred.hayVerificadorAdmin()) === false);

  console.log('\n── Bloqueo por intentos fallidos (sobrevive a cerrar la app) ──');
  await cred.cargarBloqueoPin();
  comprobar('se empieza sin bloqueo', cred.pinBloqueado() === false);
  for (let i = 0; i < 4; i++) cred.registrarFalloPin();
  comprobar('cuatro fallos todavía no bloquean', cred.pinBloqueado() === false);
  cred.registrarFalloPin();
  comprobar('el quinto sí bloquea', cred.pinBloqueado() === true);
  comprobar('e informa cuántos minutos faltan', cred.minutosBloqueoPin() > 0 && cred.minutosBloqueoPin() <= 5);

  // Reabrir la app = cargar el módulo otra vez sobre el mismo SecureStore.
  const credReabierta = cargarModuloReal('src/offline/credenciales.js', {
    'expo-secure-store': secureStoreFalso,
    'expo-crypto': expoCryptoFalso,
    '../api/client': { api: apiFalso },
  });
  await credReabierta.cargarBloqueoPin();
  comprobar('🔒 cerrar y reabrir la app NO levanta el bloqueo',
    credReabierta.pinBloqueado() === true);

  credReabierta.resetFallosPin();
  comprobar('un PIN correcto lo limpia', credReabierta.pinBloqueado() === false);

  // ── Guardas sobre el CÓDIGO de AuthContext ─────────────────────────────────
  // Mismo criterio que `tests/lock-sin-include.test.js` del backend: hay reglas
  // que no se pueden observar desde fuera sin montar toda la app, pero sí se
  // puede exigir que la línea que las impone siga ahí.
  console.log('\n── Guardas del arranque (AuthContext) ──');
  const auth = fs.readFileSync(path.join(RAIZ, 'src/context/AuthContext.js'), 'utf8');
  comprobar('🔒 _resolverPerfil se niega a resolver nada sin ajustes legibles',
    /async function _resolverPerfil\([^)]*\)\s*\{[\s\S]{0,600}?if \(!s\) \{ setProfileReady\(false\); return; \}/.test(auth));
  comprobar('🔒 el arranque se detiene si no hay ni usuario ni ajustes',
    /if \(!me \|\| !s\) \{[\s\S]{0,200}?setArranqueSinCache\(true\);/.test(auth));
  comprobar('restoreSession recupera el perfil del caché cuando falla la red',
    /if \(!esErrorDeRed\(e\)\) throw e;[\s\S]{0,200}?leerSesionLocal\('perfil'\)/.test(auth));
  comprobar('el logout borra el caché de sesión y el verificador del admin',
    /limpiarSesionLocal\(\)/.test(auth) && /borrarVerificadorAdmin\(\)/.test(auth));

  // ── Resultado ──────────────────────────────────────────────────────────────
  console.log('');
  if (fallos.length) {
    console.error(`❌ ${fallos.length} de ${ok + fallos.length} comprobaciones fallaron:`);
    for (const f of fallos) console.error('   · ' + f);
    process.exit(1);
  }
  console.log(`✅ ${ok}/${ok} comprobaciones en verde.`);
})().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});
