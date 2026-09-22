// ─── PANTALLA DE TEMAS (PLAN_REDISENO_V1, Bloque 1) ──────────────────────────
//
// Ajustes dejó de ser un formulario largo: arriba, tarjetas grandes por tema
// ("Mi negocio", "Cobros"…) con una línea de estado; abajo, una lista corta. Al
// tocar una, se abre su página con lo de siempre dentro. La estructura es la de
// la propuesta C de la carcasa; los colores, los de la A.
//
// ⚠️ Es PRESENTACIÓN, y por eso vive aquí y no en la pantalla: qué página está
// abierta es un estado de dibujo. El contenido de cada página lo arma la pantalla
// con SUS estados y SUS manejadores, que no se mueven de sitio: así el guardián
// (`npm run revisar:estilo`) puede comprobar que ningún botón cambió.
//
// temas / lista: [{ id, titulo, estado, aviso, icono, tono, contenido, ir }]
//   · contenido  lo que se ve al abrir el tema (un elemento de React)
//   · ir         en vez de abrir una página, ir a otra pantalla (Mi menú)
//   · aviso      pinta un punto ámbar antes del estado ("Sin impresora")
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Cabecera, FranjaSuperior, IconoEnCuadro } from './index';
import Icono from './Icono';
import { zc, radios, espacios, letra, sombra } from '../../theme';

export function PantallaDeTemas({ titulo, subtitulo, arriba, temas = [], lista = [], abajo, pie, refreshControl }) {
  const [abierto, setAbierto] = useState(null);
  const tema = [...temas, ...lista].find((t) => t.id === abierto) || null;
  const scroll = useRef(null);

  // Al irse a otra pestaña y volver, Ajustes vuelve a su inicio: quedarse dentro
  // de la última página abierta desconcierta (se vio en el emulador).
  const enfocada = useIsFocused();
  useEffect(() => { if (!enfocada) setAbierto(null); }, [enfocada]);

  // El botón "atrás" de Android cierra la página antes que salir de Ajustes.
  useEffect(() => {
    if (!tema) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setAbierto(null); return true; });
    return () => sub.remove();
  }, [tema]);

  const abrir = (t) => (t.ir ? t.ir() : setAbierto(t.id));

  if (tema) {
    return (
      <View style={{ flex: 1, backgroundColor: zc.fondo }}>
        <Cabecera
          titulo={tema.titulo}
          subtitulo={tema.estado}
          izquierda={(
            <TouchableOpacity onPress={() => setAbierto(null)} hitSlop={12} style={s.atras} accessibilityLabel="Regresar">
              <Icono nombre="izquierda" size={22} color={zc.enNoche} />
            </TouchableOpacity>
          )}
        />
        <ScrollView
          ref={scroll}
          contentContainerStyle={s.pagina}
          keyboardShouldPersistTaps="handled"
        >
          {tema.contenido}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: zc.fondo }}>
      <FranjaSuperior />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} refreshControl={refreshControl}>
        <Cabecera titulo={titulo} subtitulo={subtitulo}>{arriba}</Cabecera>

        <View style={s.rejilla}>
          {temas.map((t) => (
            <TouchableOpacity key={t.id} activeOpacity={0.8} onPress={() => abrir(t)} style={s.tema}>
              <IconoEnCuadro nombre={t.icono} tono={t.tono} size={38} />
              <Text style={s.temaTitulo} numberOfLines={1}>{t.titulo}</Text>
              <Text style={s.temaEstado} numberOfLines={2}>
                {t.aviso ? <Text style={{ color: zc.ambar }}>● </Text> : null}
                {t.estado}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {lista.length || abajo ? (
          <View style={s.lista}>
            {lista.map((t, i) => (
              <TouchableOpacity key={t.id} activeOpacity={0.7} onPress={() => abrir(t)} style={[s.fila, i > 0 && s.filaLinea]}>
                <IconoEnCuadro nombre={t.icono} tono={t.tono || 'gris'} size={32} />
                <Text style={s.filaTxt} numberOfLines={1}>{t.titulo}</Text>
                {t.estado ? <Text style={s.filaEstado} numberOfLines={1}>{t.estado}</Text> : null}
                <Icono nombre="derecha" size={16} color={zc.flecha} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {abajo}
        {pie}
      </ScrollView>
    </View>
  );
}

/**
 * La tarjeta del negocio que va DENTRO de la cabecera: logo o inicial, nombre y
 * una línea ("Dueño · Plan Premium").
 */
export function TarjetaQuien({ inicial, imagen, nombre, detalle, derecha }) {
  return (
    <View style={s.quien}>
      <View style={s.quienLogo}>
        {imagen || <Text style={s.quienInicial}>{inicial}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.quienNombre} numberOfLines={1}>{nombre}</Text>
        {detalle ? <Text style={s.quienDetalle} numberOfLines={1}>{detalle}</Text> : null}
      </View>
      {derecha}
    </View>
  );
}

const s = StyleSheet.create({
  atras: { width: 32, height: 32, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  pagina: { paddingHorizontal: espacios.borde, paddingTop: 16, paddingBottom: 40 },

  rejilla: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    paddingHorizontal: espacios.borde, marginTop: 16, rowGap: 12,
  },
  tema: {
    width: '48.3%', minHeight: 124, backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta,
    padding: 14, ...sombra,
  },
  temaTitulo: { ...letra.seccion, color: zc.tinta, marginTop: 'auto', paddingTop: 12 },
  temaEstado: { fontSize: 12.5, color: zc.gris, marginTop: 2, lineHeight: 16 },

  lista: {
    backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginHorizontal: espacios.borde,
    marginTop: 14, paddingHorizontal: espacios.dentro, paddingVertical: 2, ...sombra,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  filaLinea: { borderTopWidth: 1, borderTopColor: zc.linea },
  filaTxt: { ...letra.texto, fontSize: 15, color: zc.tinta, flex: 1 },
  filaEstado: { fontSize: 13, color: zc.grisSuave, maxWidth: '45%' },

  quien: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14,
    backgroundColor: zc.vidrio, borderRadius: 14, padding: 12,
  },
  quienLogo: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  quienInicial: { fontSize: 19, fontWeight: '700', color: zc.azul },
  quienNombre: { fontSize: 15.5, fontWeight: '500', color: zc.enNoche },
  quienDetalle: { fontSize: 12.5, color: zc.enNocheGris, marginTop: 1 },
});
