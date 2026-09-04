// ============================================================================
// metro.config.js
// Config del empaquetador. Lo único que hace es resolver `crypto` (el módulo de
// Node) a un sustituto propio: `bcryptjs` lo importa, React Native no lo tiene y
// Metro resuelve los imports de FORMA ESTÁTICA, así que sin esto el bundle no
// compila. Ver el comentario largo en src/shims/crypto.js.
// ============================================================================
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const SHIM_CRYPTO = path.resolve(__dirname, 'src/shims/crypto.js');
const resolverPrevio = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'crypto' || moduleName === 'node:crypto') {
    return { type: 'sourceFile', filePath: SHIM_CRYPTO };
  }
  return (resolverPrevio || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
