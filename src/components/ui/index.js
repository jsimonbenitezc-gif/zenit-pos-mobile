// ─── PIEZAS DEL DISEÑO A (PLAN_REDISENO_V1 §1) ───────────────────────────────
// Las pantallas rediseñadas se arman con esto en vez de repetir estilos. Si hace
// falta una variante, se agrega AQUÍ, no en la pantalla: así no acaban existiendo
// catorce versiones de "tarjeta".
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Icono from './Icono';
import { zc, tonos, radios, espacios, letra, sombra } from '../../theme';

export { default as Icono } from './Icono';

// ─── Cabecera ────────────────────────────────────────────────────────────────
/**
 * La franja azul noche de arriba. Pinta también la zona de la hora/batería, así
 * que la pantalla NO debe poner el `top` de SafeAreaView.
 *
 * @param titulo, subtitulo
 * @param izquierda  algo antes del título (el logo)
 * @param derecha    acción a la derecha (un botón, un selector)
 * @param solapa     espacio extra abajo para que las tarjetas se monten encima
 * @param children   contenido dentro de la franja (número grande, buscador…)
 */
export function Cabecera({ titulo, subtitulo, izquierda, derecha, solapa = 0, children, style }) {
  const insets = useSafeAreaInsets();
  // La barra del sistema en blanco SOLO mientras esta pantalla se ve: las
  // pestañas quedan montadas, y sin esto la de otra pantalla se quedaría blanca
  // sobre fondo claro.
  const enfocada = useIsFocused();
  // El degradado se dibuja con medidas en números: un Svg con width="100%" se
  // mide antes que su contenido y se queda corto (se vio en el emulador).
  const [tam, setTam] = useState(null);
  return (
    <View
      onLayout={(e) => setTam(e.nativeEvent.layout)}
      style={[{ paddingTop: insets.top + 6, paddingBottom: 20 + solapa, backgroundColor: zc.noche }, s.cab, style]}
    >
      {enfocada ? <StatusBar style="light" /> : null}
      {tam ? <Svg style={StyleSheet.absoluteFill} width={tam.width} height={tam.height}>
        <Defs>
          <LinearGradient id="zenitCabecera" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={zc.noche} />
            <Stop offset="1" stopColor={zc.noche2} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={tam.width} height={tam.height} fill="url(#zenitCabecera)" />
      </Svg> : null}
      <View style={s.cabFila}>
        {izquierda}
        <View style={{ flex: 1, minWidth: 0 }}>
          {titulo ? <Text style={s.cabTitulo} numberOfLines={1}>{titulo}</Text> : null}
          {subtitulo ? <Text style={s.cabSub} numberOfLines={1}>{subtitulo}</Text> : null}
        </View>
        {derecha}
      </View>
      {children}
    </View>
  );
}

/**
 * La franja de la hora/batería, FIJA arriba, en azul noche. Va cuando la
 * Cabecera está dentro de un ScrollView: sin ella, al bajar, las tarjetas
 * blancas pasarían por debajo de los iconos blancos del sistema.
 */
export function FranjaSuperior() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[s.franja, { height: insets.top }]} />;
}

/** Píldora translúcida para poner sobre la cabecera ("Centro ▾"). */
export function Vidrio({ children, icono, onPress, style }) {
  const Cont = onPress ? TouchableOpacity : View;
  return (
    <Cont onPress={onPress} activeOpacity={0.7} style={[s.vidrio, style]}>
      {icono ? <Icono nombre={icono} size={14} color={zc.enNocheSuave} /> : null}
      <Text style={s.vidrioTxt} numberOfLines={1}>{children}</Text>
    </Cont>
  );
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────
/** Blanca, sin borde, con sombra suave: "flota". */
export function Tarjeta({ children, titulo, icono, tono, accion, onAccion, style, sinRelleno }) {
  return (
    <View style={[s.tarjeta, sinRelleno && { padding: 0 }, style]}>
      {titulo ? (
        <View style={[s.tarTitulo, sinRelleno && { padding: espacios.dentro, paddingBottom: 4 }]}>
          {icono ? (tono
            ? <IconoEnCuadro nombre={icono} tono={tono} />
            : <Icono nombre={icono} size={18} color={zc.tinta} />) : null}
          <Text style={s.tarTituloTxt} numberOfLines={1}>{titulo}</Text>
          {accion ? (
            <TouchableOpacity onPress={onAccion} hitSlop={8}>
              <Text style={s.tarAccion}>{accion}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ─── IconoEnCuadro ───────────────────────────────────────────────────────────
/** El cuadrito de color: aquí (y solo aquí) vive el color de la app. */
export function IconoEnCuadro({ nombre, tono = 'azul', size = 34 }) {
  const t = tonos[tono] || tonos.azul;
  return (
    <View style={[s.cuadro, { width: size, height: size, backgroundColor: t.fondo }]}>
      <Icono nombre={nombre} size={Math.round(size * 0.53)} color={t.icono} />
    </View>
  );
}

// ─── Fila ────────────────────────────────────────────────────────────────────
/**
 * Un renglón dentro de una tarjeta: [cuadrito] texto / detalle ··· valor ›
 * `primera` quita la línea de arriba.
 */
export function Fila({ icono, tono, izquierda, texto, detalle, valor, valorColor, flecha, onPress, primera, children, style }) {
  const Cont = onPress ? TouchableOpacity : View;
  return (
    <Cont onPress={onPress} activeOpacity={0.7} style={[s.fila, !primera && s.filaLinea, style]}>
      {icono ? <IconoEnCuadro nombre={icono} tono={tono} /> : null}
      {izquierda}
      <View style={{ flex: 1, minWidth: 0 }}>
        {texto != null ? <Text style={s.filaTxt} numberOfLines={2}>{texto}</Text> : null}
        {detalle != null ? <Text style={s.filaDet} numberOfLines={2}>{detalle}</Text> : null}
        {children}
      </View>
      {valor != null ? <Text style={[s.filaValor, valorColor && { color: valorColor }]}>{valor}</Text> : null}
      {flecha ? <Icono nombre="derecha" size={16} color={zc.flecha} /> : null}
    </Cont>
  );
}

// ─── Botón ───────────────────────────────────────────────────────────────────
/** tipo: 'principal' | 'secundario' | 'peligro' */
export function Boton({ children, onPress, tipo = 'principal', icono, disabled, cargando, style }) {
  const st = BOTON[tipo] || BOTON.principal;
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled || cargando} activeOpacity={0.8}
      style={[s.boton, { backgroundColor: st.fondo }, (disabled || cargando) && { opacity: 0.5 }, style]}
    >
      {cargando
        ? <ActivityIndicator color={st.texto} />
        : <>
            {icono ? <Icono nombre={icono} size={16} color={st.texto} /> : null}
            <Text style={[s.botonTxt, { color: st.texto }]}>{children}</Text>
          </>}
    </TouchableOpacity>
  );
}
const BOTON = {
  principal:  { fondo: zc.azul, texto: '#fff' },
  secundario: { fondo: zc.azulSuave, texto: zc.azul },
  peligro:    { fondo: zc.rojoSuave, texto: zc.rojo },
};

// ─── Chip ────────────────────────────────────────────────────────────────────
export function Chip({ children, activo, onPress, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[s.chip, activo && s.chipOn, style]}>
      <Text style={[s.chipTxt, activo && s.chipTxtOn]} numberOfLines={1}>{children}</Text>
    </TouchableOpacity>
  );
}

// ─── Segmentado ──────────────────────────────────────────────────────────────
/**
 * Opciones de una sola elección. `oscuro` = sobre la cabecera (como "Comer
 * aquí / Llevar / Domicilio" de la carcasa).
 * opciones: [{ valor, texto, icono }]
 */
export function Segmentado({ opciones, valor, onCambio, oscuro, style }) {
  return (
    <View style={[s.seg, oscuro ? s.segOscuro : s.segClaro, style]}>
      {opciones.map((o) => {
        const on = o.valor === valor;
        const colorTxt = on ? zc.tinta : (oscuro ? zc.enNocheSuave : zc.gris);
        return (
          <TouchableOpacity
            key={String(o.valor)} onPress={() => onCambio(o.valor)} activeOpacity={0.8}
            style={[s.segOp, on && s.segOn, on && !oscuro && sombra]}
          >
            {o.icono ? <Icono nombre={o.icono} size={17} color={colorTxt} /> : null}
            <Text style={[s.segTxt, { color: colorTxt }, on && { fontWeight: '500' }]} numberOfLines={1}>{o.texto}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── NumeroGrande ────────────────────────────────────────────────────────────
/** Etiqueta + el número del día. `enNoche` = sobre la cabecera. */
export function NumeroGrande({ etiqueta, valor, enNoche = true, children }) {
  return (
    <View>
      {etiqueta ? <Text style={[s.ngEtq, { color: enNoche ? zc.enNocheGris : zc.gris }]}>{etiqueta}</Text> : null}
      <Text style={[s.ngValor, { color: enNoche ? zc.enNoche : zc.tinta }]} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {children}
    </View>
  );
}

/** "▲ 12%" verde / "▼ 8%" rojo, para ir junto al número grande. */
export function Variacion({ sube, children }) {
  return (
    <Text style={[s.var, { backgroundColor: sube ? zc.subeFondo : zc.bajaFondo, color: sube ? zc.subeTexto : zc.bajaTexto }]}>
      {children}
    </Text>
  );
}

// ─── BarraDeCobrar ───────────────────────────────────────────────────────────
/** La barra oscura que flota sobre las pestañas en Venta (se usa en el Bloque 2). */
export function BarraDeCobrar({ etiqueta, total, textoBoton = 'Cobrar', onPress, disabled, style }) {
  return (
    <View style={[s.cobrar, style]}>
      <View style={{ flex: 1 }}>
        {etiqueta ? <Text style={s.cobrarEtq}>{etiqueta}</Text> : null}
        <Text style={s.cobrarTotal}>{total}</Text>
      </View>
      <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[s.cobrarBtn, disabled && { opacity: 0.5 }]}>
        <Text style={s.cobrarBtnTxt}>{textoBoton}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── tonoPorColor ────────────────────────────────────────────────────────────
/** Traduce un color viejo "a mano" (#ef4444…) al tono de cuadrito más cercano. */
const TONO_DE = {
  '#ef4444': 'rojo', '#dc2626': 'rojo', '#f59e0b': 'ambar', '#d97706': 'ambar',
  '#3b82f6': 'azul', '#2563eb': 'azul', '#8b5cf6': 'lila', '#7c3aed': 'lila',
  '#10b981': 'verde', '#059669': 'verde',
};
export function tonoPorColor(color) {
  return TONO_DE[String(color || '').toLowerCase()] || 'gris';
}

const s = StyleSheet.create({
  franja: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: zc.noche, zIndex: 10 },
  cab: { paddingHorizontal: 18, overflow: 'hidden' },
  cabFila: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 34 },
  cabTitulo: { ...letra.titulo, color: zc.enNoche, letterSpacing: 0.1 },
  cabSub: { ...letra.chica, color: zc.enNocheGris, marginTop: 1 },
  vidrio: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 170,
    backgroundColor: zc.vidrio, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  vidrioTxt: { fontSize: 12.5, color: zc.enNocheSuave },

  tarjeta: {
    backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: espacios.dentro,
    marginHorizontal: espacios.borde, marginBottom: 12, ...sombra,
  },
  tarTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tarTituloTxt: { ...letra.seccion, color: zc.tinta, flex: 1 },
  tarAccion: { fontSize: 12.5, fontWeight: '500', color: zc.azul },

  cuadro: { borderRadius: radios.cuadrito, alignItems: 'center', justifyContent: 'center' },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  filaLinea: { borderTopWidth: 1, borderTopColor: zc.linea },
  filaTxt: { ...letra.texto, color: zc.tinta },
  filaDet: { fontSize: 12.5, color: zc.grisSuave, marginTop: 1 },
  filaValor: { ...letra.texto, color: zc.gris, fontVariant: ['tabular-nums'] },

  boton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radios.boton, paddingVertical: 12, paddingHorizontal: 16, minHeight: 46,
  },
  botonTxt: { fontSize: 15, fontWeight: '500' },

  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: radios.chip,
    backgroundColor: zc.tarjeta, elevation: 1, shadowColor: zc.noche, shadowOpacity: 0.05,
    shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  chipOn: { backgroundColor: zc.noche },
  chipTxt: { fontSize: 13, color: zc.gris },
  chipTxtOn: { color: '#fff' },

  seg: { flexDirection: 'row', gap: 6 },
  segOscuro: {},
  segClaro: {},
  segOp: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, paddingHorizontal: 4, borderRadius: radios.boton, backgroundColor: 'rgba(255,255,255,0.07)',
  },
  segOn: { backgroundColor: '#fff' },
  segTxt: { fontSize: 12 },

  ngEtq: { ...letra.etiqueta, marginTop: 18 },
  ngValor: { ...letra.grande, lineHeight: 42, marginTop: 2, fontVariant: ['tabular-nums'] },
  var: { fontSize: 12, fontWeight: '500', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },

  cobrar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: zc.noche,
    borderRadius: radios.tarjeta, marginHorizontal: espacios.borde, padding: 12, paddingLeft: 16, ...sombra,
  },
  cobrarEtq: { fontSize: 12, color: zc.enNocheGris },
  cobrarTotal: { fontSize: 20, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  cobrarBtn: { backgroundColor: zc.azul, borderRadius: radios.boton, paddingHorizontal: 22, paddingVertical: 11 },
  cobrarBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '500' },
});

export { PantallaDeTemas, TarjetaQuien } from './Temas';
