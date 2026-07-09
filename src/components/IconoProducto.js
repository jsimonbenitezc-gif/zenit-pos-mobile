import React from 'react';
import { Text, Image } from 'react-native';
import SvgIcon from './SvgIcon';

/**
 * Renderiza el icono de un producto/categoria.
 * Prioridad: imagen (foto) > SVG (prefijo svg:) > emoji unicode.
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
