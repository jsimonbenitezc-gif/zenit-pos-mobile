// La LLAVE de un emoji (PLAN_REDISENO_V1, trampa 8): un emoji no es un carácter.
// 🌶️ trae un selector de variante (FE0F) que a veces llega y a veces no; 👍🏽 trae un
// tono de piel; 🧑‍🍳 son tres piezas unidas con ZWJ (200D). La llave quita lo que no
// cambia el dibujo (FE0E/FE0F y los cinco tonos) y conserva el ZWJ, que sí lo cambia.
//
//   llaveEmoji('🌶️') === llaveEmoji('🌶') === '1f336'
//   llaveEmoji('🧑‍🍳') === '1f9d1-200d-1f373'
//
// La usan la app (IconoProducto) Y el generador del catálogo: si fueran dos funciones,
// una llave distinta dejaría el producto con el emoji del sistema sin que nadie lo note.

const SOBRANTES = new Set([0xfe0e, 0xfe0f, 0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff]);

export function llaveEmoji(texto) {
  if (typeof texto !== 'string') return '';
  const puntos = [];
  for (const c of texto.trim()) {
    const cp = c.codePointAt(0);
    if (!SOBRANTES.has(cp)) puntos.push(cp.toString(16));
  }
  // Un ZWJ que quedó al final (p. ej. "🧑‍" suelto) no une nada.
  while (puntos.length && puntos[puntos.length - 1] === '200d') puntos.pop();
  return puntos.join('-');
}
