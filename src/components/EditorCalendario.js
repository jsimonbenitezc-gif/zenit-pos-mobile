// ============================================================================
// components/EditorCalendario.js — "¿Cuándo?" (PLAN_OFERTAS_V1 §3.3)
//
// Lo comparten las promos y los descuentos ("10% los lunes"). Edita un
// formulario plano —{ siempre, dias, desde, hasta, fecha_inicio, fecha_fin }—
// y quien guarda lo valida con `calendarioDeFormulario` (utils/promos.js), que
// usa la MISMA validación del servidor: un calendario basura se rechaza antes
// de salir, en vez de caer a "siempre" en silencio.
//
// "De 22:00 a 02:00" es válido y CRUZA la medianoche: se dice aquí para que el
// dueño del bar no crea que se equivocó.
// ============================================================================
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, font, zc, tonos, radios, sombra } from '../theme';

const DIAS = [
  { d: 1, t: 'L' }, { d: 2, t: 'M' }, { d: 3, t: 'M' }, { d: 4, t: 'J' },
  { d: 5, t: 'V' }, { d: 6, t: 'S' }, { d: 0, t: 'D' },
];

export default function EditorCalendario({ valor, onChange }) {
  const v = valor || { siempre: true, dias: [0, 1, 2, 3, 4, 5, 6], desde: '', hasta: '', fecha_inicio: '', fecha_fin: '' };
  const cambiar = (campo, dato) => onChange({ ...v, [campo]: dato });
  const alternarDia = (d) => {
    const dias = v.dias.includes(d) ? v.dias.filter((x) => x !== d) : [...v.dias, d];
    cambiar('dias', dias);
  };
  const cruza = v.desde && v.hasta && v.hasta < v.desde;

  return (
    <View>
      <View style={styles.fila}>
        <TouchableOpacity style={[styles.opcion, v.siempre && styles.opcionActiva]} onPress={() => cambiar('siempre', true)}>
          <Text style={[styles.opcionTexto, v.siempre && { color: '#fff' }]}>Siempre</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.opcion, !v.siempre && styles.opcionActiva]} onPress={() => cambiar('siempre', false)}>
          <Text style={[styles.opcionTexto, !v.siempre && { color: '#fff' }]}>Solo algunos días u horas</Text>
        </TouchableOpacity>
      </View>

      {!v.siempre && (
        <View style={styles.detalle}>
          <View style={styles.dias}>
            {DIAS.map(({ d, t }) => (
              <TouchableOpacity key={d} style={[styles.dia, v.dias.includes(d) && styles.diaActivo]} onPress={() => alternarDia(d)}>
                <Text style={[styles.diaTexto, v.dias.includes(d) && { color: '#fff' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.etiqueta}>De qué hora a qué hora (opcional)</Text>
          <View style={styles.fila}>
            <TextInput style={styles.input} value={v.desde} onChangeText={(x) => cambiar('desde', x.trim())} placeholder="18:00" placeholderTextColor={colors.textMuted} maxLength={5} />
            <Text style={styles.a}>a</Text>
            <TextInput style={styles.input} value={v.hasta} onChangeText={(x) => cambiar('hasta', x.trim())} placeholder="20:00" placeholderTextColor={colors.textMuted} maxLength={5} />
          </View>
          {cruza ? <Text style={styles.nota}>Cruza la medianoche: sigue viva hasta las {v.hasta} del día siguiente.</Text> : null}

          <Text style={styles.etiqueta}>Entre fechas (opcional)</Text>
          <View style={styles.fila}>
            <TextInput style={styles.input} value={v.fecha_inicio} onChangeText={(x) => cambiar('fecha_inicio', x.trim())} placeholder="2026-10-01" placeholderTextColor={colors.textMuted} maxLength={10} />
            <Text style={styles.a}>al</Text>
            <TextInput style={styles.input} value={v.fecha_fin} onChangeText={(x) => cambiar('fecha_fin', x.trim())} placeholder="2026-10-31" placeholderTextColor={colors.textMuted} maxLength={10} />
          </View>
        </View>
      )}
    </View>
  );
}

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };

const styles = StyleSheet.create({
  fila:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opcion:       { flex: 1, paddingVertical: 10, borderRadius: radios.boton, alignItems: 'center', backgroundColor: zc.tarjeta, ...sombra, elevation: 1 },
  opcionActiva: { backgroundColor: zc.noche },
  opcionTexto:  { fontSize: 13.5, color: zc.gris },
  detalle:      { marginTop: 10, gap: 6 },
  dias:         { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  dia:          { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: zc.tarjeta, ...sombra, elevation: 1 },
  diaActivo:    { backgroundColor: tonos.lila.icono },
  diaTexto:     { fontSize: 13.5, fontWeight: '500', color: zc.gris },
  etiqueta:     { fontSize: 13, color: zc.gris, marginTop: 8 },
  input:        { flex: 1, ...campo, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: zc.tinta, textAlign: 'center' },
  a:            { fontSize: 13.5, color: zc.grisSuave },
  nota:         { fontSize: 12.5, color: tonos.lila.icono },
});
