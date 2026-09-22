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
import { colors, spacing, radius, font } from '../theme';

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

const styles = StyleSheet.create({
  fila:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opcion:       { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  opcionActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  opcionTexto:  { fontSize: font.sm - 1, fontWeight: '700', color: colors.textSecondary },
  detalle:      { marginTop: spacing.sm, gap: spacing.xs },
  dias:         { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  dia:          { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  diaActivo:    { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  diaTexto:     { fontSize: font.sm, fontWeight: '800', color: colors.textSecondary },
  etiqueta:     { fontSize: font.sm - 1, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm },
  input:        { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.md, color: colors.textPrimary, textAlign: 'center' },
  a:            { fontSize: font.sm, color: colors.textMuted },
  nota:         { fontSize: font.sm - 2, color: '#7c3aed' },
});
