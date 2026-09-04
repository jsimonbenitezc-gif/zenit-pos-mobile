// ============================================================================
// src/offline/credenciales.js
// LAS DOS CREDENCIALES DEL POS, VERIFICABLES SIN INTERNET.
//
// Zenit tiene dos credenciales distintas y confundirlas deja funciones muertas
// (CLAUDE.md §19.19): el **PIN de PUESTO** (lo único que teclea el cajero) y la
// **contraseña de CUENTA** del dueño. Hasta ahora las dos se verificaban CONTRA
// EL SERVIDOR, así que sin señal el cajero llegaba a la pantalla de puestos y no
// podía pasar de ahí — y el dueño de un negocio de una sola persona no podía
// entrar en absoluto. La app quedaba sin caja justo cuando el soporte offline
// (§13) promete lo contrario.
//
// REGLA: online manda SIEMPRE el servidor (es la fuente de verdad, y así el PIN
// SHA-256 viejo se migra solo a bcrypt). La verificación local es un FALLBACK
// que solo entra cuando la RED falla, nunca cuando el servidor dice que no.
//
// ⚠️ El PIN se guarda como hash **bcrypt** (el mobile siempre lo genera con
// api.hashProfilePin). El fallback SHA-256 del desktop NO sirve aquí: compararía
// un SHA contra un bcrypt y diría "PIN incorrecto" siempre. Por eso se compara
// con `bcryptjs` — en el mismo orden que el backend en /settings/verify-pin:
// primero `pin_bcrypt`, y solo si no hay, el SHA-256 legacy.
// ============================================================================
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import bcrypt from 'bcryptjs';
import { api } from '../api/client';

const CLAVE_ADMIN = 'zenit_admin_verificador';
const CLAVE_LOCK  = 'zenit_pin_lock';

const MAX_FALLOS   = 5;
const BLOQUEO_MS   = 5 * 60 * 1000;
const COSTO_BCRYPT = 10; // el mismo que usa el backend

/** ¿Este error es de RED (transitorio) y no una respuesta del servidor? */
export function esErrorDeRed(e) {
  const m = String(e?.message || e || '').toLowerCase();
  return (
    m.includes('sin conexión') ||
    m.includes('tardó mucho') ||
    m.includes('network') ||
    m.includes('failed to fetch')
  );
}

// ─── PIN de puesto ──────────────────────────────────────────────────────────

function _hashDelPuesto(permisos, rol) {
  const datos = permisos?.[rol];
  if (!datos || datos.pin_set !== true) return null;
  return datos.pin_bcrypt || datos.pin || null;
}

/**
 * Verifica un PIN de puesto contra los hashes cacheados, sin red.
 * @returns {Promise<boolean>}
 */
export async function verificarPinPuestoLocal(permisos, rol, pin) {
  const hash = _hashDelPuesto(permisos, rol);
  if (!hash || !pin) return false;
  try {
    // bcrypt ($2a$/$2b$/$2y$): el formato que genera el backend hoy.
    if (/^\$2[aby]?\$/.test(hash)) return bcrypt.compareSync(String(pin), hash);
    // SHA-256 hex: PINes puestos por un desktop SIN conexión (formato legacy).
    const sha = await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256, String(pin)
    );
    return sha.toLowerCase() === String(hash).toLowerCase();
  } catch (e) {
    console.warn('[credenciales] verificarPinPuestoLocal:', e?.message);
    return false;
  }
}

/**
 * PUNTO ÚNICO de verificación del PIN de puesto para toda la app.
 *
 * Online pregunta al servidor; si la RED falla, cae a los hashes cacheados. Un
 * "PIN incorrecto" del servidor NO cae al fallback: sería darle una segunda
 * oportunidad a un PIN que ya se rechazó.
 *
 * @param {string} rol       Puesto (cajero, encargado, un rol custom…)
 * @param {string} pin
 * @param {object} permisos  `permisosRolesEfectivos` del AuthContext
 * @returns {Promise<{ valido: boolean, offline: boolean }>}
 */
export async function verificarPinPuesto(rol, pin, permisos) {
  if (api.token) {
    try {
      const result = await api.verifyProfilePin(rol, pin);
      return { valido: result?.valid === true, offline: false };
    } catch (e) {
      // Solo un fallo de RED justifica verificar por nuestra cuenta.
      if (!esErrorDeRed(e)) throw e;
    }
  }
  return { valido: await verificarPinPuestoLocal(permisos, rol, pin), offline: true };
}

// ─── Contraseña del administrador ───────────────────────────────────────────
// Se guarda un VERIFICADOR (hash bcrypt) en el momento en que el servidor ya
// confirmó la contraseña, así que no relaja ninguna regla: solo permite repetir
// offline una comprobación que ya se hizo online. Se refresca en cada login con
// red, de modo que un cambio de contraseña desde otro dispositivo se propaga
// solo. ⚠️ Hasta ese próximo login CON red, este equipo sigue aceptando la
// contraseña vieja sin conexión — el desktop tiene exactamente el mismo
// comportamiento con su contraseña local (CLAUDE.md §26).

/** Guarda el verificador tras un login/validación EXITOSOS. Nunca lanza. */
export async function guardarVerificadorAdmin(email, password) {
  if (!password) return;
  try {
    const hash = bcrypt.hashSync(String(password), COSTO_BCRYPT);
    await SecureStore.setItemAsync(CLAVE_ADMIN, JSON.stringify({ email: email || '', hash }));
  } catch (e) {
    console.warn('[credenciales] guardarVerificadorAdmin:', e?.message);
  }
}

/** ¿Este equipo puede validar al administrador sin red? */
export async function hayVerificadorAdmin() {
  try { return !!(await SecureStore.getItemAsync(CLAVE_ADMIN)); } catch { return false; }
}

/**
 * Verifica la contraseña del administrador sin red.
 * @param {string} password
 * @param {string} email  Cuenta de la sesión actual. El verificador se guardó
 *   para UNA cuenta concreta; si la sesión es de otra, no vale (aunque hoy no se
 *   pueda iniciar sesión sin red, el verificador sobrevive a un cambio de cuenta
 *   si algo falla al limpiar).
 */
export async function verificarPasswordAdminLocal(password, email) {
  if (!password) return false;
  try {
    const raw = await SecureStore.getItemAsync(CLAVE_ADMIN);
    if (!raw) return false;
    const guardado = JSON.parse(raw);
    if (!guardado?.hash) return false;
    if (email && guardado.email && guardado.email !== email) return false;
    return bcrypt.compareSync(String(password), guardado.hash);
  } catch (e) {
    console.warn('[credenciales] verificarPasswordAdminLocal:', e?.message);
    return false;
  }
}

export async function borrarVerificadorAdmin() {
  try { await SecureStore.deleteItemAsync(CLAVE_ADMIN); } catch {}
}

// ─── Bloqueo por intentos fallidos ──────────────────────────────────────────
// Vive en SecureStore y NO solo en memoria: ahora que un PIN se puede probar sin
// red, un contador que se borra al reabrir la app no es una barrera — bastaría
// con matar el proceso entre intento e intento. El desktop ya lo persiste
// (localStorage, CLAUDE.md §7); esto es lo mismo.

let _estado = { fallos: 0, hasta: 0 }; // espejo en memoria; SecureStore es la verdad
let _hidratado = false;

async function _hidratar() {
  if (_hidratado) return;
  _hidratado = true;
  try {
    const raw = await SecureStore.getItemAsync(CLAVE_LOCK);
    if (raw) {
      const v = JSON.parse(raw);
      _estado = { fallos: Number(v.fallos) || 0, hasta: Number(v.hasta) || 0 };
    }
  } catch {}
}

async function _persistir() {
  try { await SecureStore.setItemAsync(CLAVE_LOCK, JSON.stringify(_estado)); } catch {}
}

/** Carga el bloqueo guardado. Se llama una vez al arrancar la app. */
export async function cargarBloqueoPin() {
  await _hidratar();
}

/** ¿Está bloqueada la entrada de PIN ahora mismo? (síncrono: usa el espejo) */
export function pinBloqueado() {
  if (!_estado.hasta) return false;
  if (Date.now() >= _estado.hasta) {
    _estado = { fallos: 0, hasta: 0 };
    _persistir();
    return false;
  }
  return true;
}

/** Minutos que faltan para que se levante el bloqueo. */
export function minutosBloqueoPin() {
  if (!_estado.hasta) return 0;
  return Math.max(0, Math.ceil((_estado.hasta - Date.now()) / 60000));
}

/** Registra un intento fallido; al quinto, bloquea 5 minutos. */
export function registrarFalloPin() {
  _estado.fallos += 1;
  if (_estado.fallos >= MAX_FALLOS) _estado.hasta = Date.now() + BLOQUEO_MS;
  _persistir();
}

/** Limpia los intentos tras un PIN correcto. */
export function resetFallosPin() {
  _estado = { fallos: 0, hasta: 0 };
  _persistir();
}
