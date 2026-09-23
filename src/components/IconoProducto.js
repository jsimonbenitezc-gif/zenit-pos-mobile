import React from 'react';
import { Text, Image } from 'react-native';
import SvgIcon from './SvgIcon';
import { archivoDeValor } from '../iconos';

/**
 * Renderiza el icono de un producto/categoria.
 * Prioridad: foto > icono Fluent (el emoji de la lista, o un propio `svg:z-`) >
 * icono de línea (`svg:`) > emoji del sistema (el que no está en la lista) > caja.
 * Ver src/iconos/index.js.
 *
 * @param {string} valor — 'svg:burger', '🍔', o null
 * @param {string} imagen — data URI / URL de una foto (opcional; tiene prioridad)
 * @param {number} size — px (default 24)
 * @param {string} color — solo aplica a SVG (default '#374151')
 * @param {object} style — estilos adicionales para el contenedor Text (solo emoji)
 */
export default function IconoProducto({ valor, imagen, size = 24, color = '#374151', style }) {
  // Foto del producto (visible en todos los dispositivos)
  if (imagen && (imagen.startsWith('data:image/') || imagen.startsWith('http'))) {
    return (
      <Image
        source={{ uri: imagen }}
        style={{ width: size, height: size, borderRadius: size * 0.2 }}
        resizeMode="cover"
      />
    );
  }

  if (!valor) {
    return <SvgIcon name="package" size={size} color={color} />;
  }

  // Icono de color (PLAN_REDISENO_V1 §3.3): el emoji guardado se DIBUJA con Fluent,
  // sin cambiarlo en la base; las apps viejas lo siguen viendo como emoji.
  const archivo = archivoDeValor(valor);
  if (archivo) {
    return <Image source={archivo} style={{ width: size, height: size }} resizeMode="contain" />;
  }

  // Un icono propio que este equipo todavía no conoce: caja, nunca un hueco.
  if (valor.startsWith('svg:z-')) {
    return <SvgIcon name="package" size={size} color={color} />;
  }

  if (valor.startsWith('svg:')) {
    const name = valor.slice(4);
    return <SvgIcon name={name} size={size} color={color} />;
  }

  // Emoji unicode
  return (
    <Text style={[{ fontSize: size * 0.9, lineHeight: size * 1.1, textAlign: 'center' }, style]}>
      {valor}
    </Text>
  );
}
