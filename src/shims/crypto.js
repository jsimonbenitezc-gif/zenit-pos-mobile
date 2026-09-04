// ============================================================================
// src/shims/crypto.js
// Sustituto del módulo `crypto` de Node para React Native.
//
// POR QUÉ EXISTE: `bcryptjs` —la librería con la que se verifica el PIN de
// puesto y la contraseña del administrador SIN internet— hace `import
// nodeCrypto from "crypto"` en su punto de entrada. Ese módulo no existe en RN
// y Metro resuelve los imports de forma ESTÁTICA, así que sin este sustituto el
// bundle NI SIQUIERA COMPILA ("Unable to resolve module crypto"). No es un
// problema en tiempo de ejecución: es de empaquetado.
//
// bcryptjs solo usa `crypto` para GENERAR salt (bcrypt.genSalt / bcrypt.hash).
// Aquí únicamente COMPARAMOS contra hashes que ya generó el backend, así que en
// la práctica nunca se llama. Aun así se implementa de verdad con expo-crypto
// —que es un generador seguro del sistema— en vez de devolver ceros: un
// "aleatorio" falso que parece funcionar es peor que uno que no existe.
//
// El alias vive en `metro.config.js`. Si algún día otra dependencia pide
// `crypto` esperando más que `randomBytes`, fallará aquí con un mensaje claro
// en vez de silenciosamente.
// ============================================================================
import * as ExpoCrypto from 'expo-crypto';

/** Bytes aleatorios criptográficamente seguros (API de node:crypto). */
export function randomBytes(len) {
  return ExpoCrypto.getRandomBytes(len);
}

/** Equivalente de `crypto.randomUUID()`. */
export function randomUUID() {
  return ExpoCrypto.randomUUID();
}

/**
 * Cualquier otra cosa de `crypto` falla RUIDOSAMENTE en vez de devolver
 * `undefined`. Sin esto, una dependencia que llamara a `createHash` recibiría un
 * módulo mudo y "funcionaría" produciendo basura — que es exactamente la clase de
 * fallo silencioso que este proyecto lleva cuatro secciones documentando.
 */
function noDisponible(nombre) {
  return () => {
    throw new Error(`crypto.${nombre} no existe en React Native (src/shims/crypto.js). Usa expo-crypto.`);
  };
}

const shim = {
  randomBytes,
  randomUUID,
  createHash: noDisponible('createHash'),
  createHmac: noDisponible('createHmac'),
  pbkdf2Sync: noDisponible('pbkdf2Sync'),
};

// bcryptjs lee `nodeCrypto.default.randomBytes`, así que el objeto tiene que
// apuntarse a sí mismo: el interop CommonJS/ESM de Metro no siempre añade
// `.default` a un módulo que ya es ESM.
shim.default = shim;

export default shim;
