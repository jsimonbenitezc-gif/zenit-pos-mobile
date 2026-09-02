import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { SectionTitle, SectionCard, MenuItem, SwitchRow } from './shared';
import { friendlyError } from '../../../utils/errors';
import {
  configHorario, normalizarHorario, resumenHorario, horarioPorDefecto,
  HORARIO_DIAS_CORTO,
} from '../../../utils/horarios';

/**
 * Horario del negocio (BLOQUE 14).
 *
 * ⚠️ ESTO NO CONFIGURA NINGÚN BLOQUEO. Definir un horario no impide vender,
 * cobrar ni abrir turno a ninguna hora — un POS que se niega a vender hace más
 * daño que el riesgo que evita. Lo que hace es marcar en la auditoría (y avisar
 * al dueño) las acciones SENSIBLES que ocurran fuera de él: cancelaciones,
 * devoluciones, descuentos, ajustes de inventario y movimientos de caja.
 *
 * La única acción que el horario restringe es aprobar una pantalla de cocina, y
 * tampoco la prohíbe: fuera de horario la sube al dueño.
 *
 * Es un ajuste de la CUENTA y lo decide el dueño (el backend responde 403 al
 * resto): que lo cambiara un empleado sería dejarle apagar la alarma que vigila
 * sus propias acciones. Por eso la sección solo se monta con `isOwner`.
 */
export function SeccionHorario({ settings, onSaved, styles }) {
  const actual = configHorario(settings);

  const [modal, setModal]         = useState(false);
  const [semana, setSemana]       = useState(actual || horarioPorDefecto());
  const [guardando, setGuardando] = useState(false);

  const resumen = actual
    ? resumenHorario(actual)
    : 'Sin definir · no se marca ninguna acción';

  function abrir() {
    setSemana(actual ? JSON.parse(JSON.stringify(actual)) : horarioPorDefecto());
    setModal(true);
  }

  /** Interruptor de la tarjeta. Apagarlo quita el horario y con él las señales. */
  async function alternar(valor) {
    if (valor) { abrir(); return; }
    setGuardando(true);
    try {
      await api.updateSettings({ horario_operacion: null });
      await onSaved?.();
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  function cambiarDia(indice, campo, valor) {
    setSemana(prev => {
      const copia = prev.map(d => ({ ...d }));
      const dia = copia[indice];
      if (campo === 'cerrado') {
        // Marcar cerrado NO borra las horas: desmarcarlo las recupera tal cual,
        // que es lo que espera quien cierra un día por temporada.
        dia.cerrado = valor;
        if (!dia.abre)   dia.abre   = '09:00';
        if (!dia.cierra) dia.cierra = '18:00';
      } else {
        dia[campo] = valor;
      }
      return copia;
    });
  }

  async function guardar() {
    const r = normalizarHorario(semana);
    if (!r.ok) { Alert.alert('Horario inválido', r.error); return; }
    if (!r.horario) {
      // Los siete días cerrados no son un horario: es no tenerlo. Se dice en vez
      // de guardarlo en silencio, porque el dueño creería que configuró algo y
      // esperaría unas alertas que nunca van a llegar.
      Alert.alert(
        'Sin horario',
        'Marcaste los siete días como cerrados, así que no hay horario que aplicar. ' +
        'Deja abierto al menos un día, o apaga el horario del negocio.'
      );
      return;
    }

    setGuardando(true);
    try {
      await api.updateSettings({ horario_operacion: r.horario });
      await onSaved?.();
      setModal(false);
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <SectionTitle label="Horario del negocio" />
      <SectionCard>
        <SwitchRow
          label="Definir horario de operación"
          sub="Nunca bloquea la caja: sirve para detectar lo raro (una cancelación a las 3 a.m.)"
          value={!!actual}
          onChange={alternar}
        />
        <MenuItem label="Días y horas" sub={resumen} onPress={abrir} last />
      </SectionCard>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Horario del negocio</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
              {semana.map((dia, i) => (
                <View key={i} style={local.fila}>
                  <Text style={local.dia}>{HORARIO_DIAS_CORTO[i]}</Text>

                  <TouchableOpacity
                    style={[local.chip, dia.cerrado && local.chipActivo]}
                    onPress={() => cambiarDia(i, 'cerrado', !dia.cerrado)}
                  >
                    <Text style={[local.chipTexto, dia.cerrado && local.chipTextoActivo]}>cerrado</Text>
                  </TouchableOpacity>

                  <TextInput
                    style={[local.hora, dia.cerrado && local.horaApagada]}
                    value={dia.abre || ''}
                    editable={!dia.cerrado}
                    onChangeText={t => cambiarDia(i, 'abre', t)}
                    placeholder="09:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <Text style={local.a}>a</Text>
                  <TextInput
                    style={[local.hora, dia.cerrado && local.horaApagada]}
                    value={dia.cierra || ''}
                    editable={!dia.cerrado}
                    onChangeText={t => cambiarDia(i, 'cierra', t)}
                    placeholder="18:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              ))}

              <Text style={local.ayuda}>
                Si cierras después de medianoche, pon la hora de cierre igual (18:00 → 02:00):
                el sistema entiende que la madrugada sigue siendo del día anterior.
                Para 24 horas, pon la misma hora en apertura y cierre.
              </Text>

              <View style={local.aviso}>
                <Text style={local.avisoTexto}>
                  El horario <Text style={{ fontWeight: '700' }}>nunca bloquea la caja</Text>: se puede
                  vender, cobrar y abrir turno a cualquier hora. Lo que hace es marcar en el historial
                  —y avisarte— cuando una cancelación, una devolución, un descuento, un ajuste de
                  inventario o un movimiento de caja ocurren fuera de él. Lo único que restringe es
                  autorizar una pantalla de cocina: fuera de horario solo puedes hacerlo tú.
                </Text>
              </View>

              <TouchableOpacity
                style={[local.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={local.btnGuardarText}>Guardar horario</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const local = {
  fila: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs },
  dia:  { width: 40, fontSize: font.sm, fontWeight: '700', color: colors.textSecondary },
  chip: {
    paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActivo:      { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  chipTexto:       { fontSize: font.sm - 1, color: colors.textMuted },
  chipTextoActivo: { color: colors.primary, fontWeight: '700' },
  hora: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 6, textAlign: 'center',
    color: colors.textPrimary, backgroundColor: colors.surface, fontSize: font.md,
  },
  horaApagada: { opacity: 0.4 },
  a:      { color: colors.textMuted, fontSize: font.sm },
  ayuda:  { fontSize: font.sm, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 20 },
  aviso: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: 10,
    backgroundColor: colors.success + '10', borderWidth: 1, borderColor: colors.success + '55',
  },
  avisoTexto: { fontSize: font.sm, color: colors.textSecondary, lineHeight: 20 },
  btnGuardar: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing.md,
    alignItems: 'center', marginTop: spacing.xl,
  },
  btnGuardarText: { color: '#fff', fontWeight: '700', fontSize: font.md },
};
