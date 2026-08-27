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
import { configPropina, normalizarSugerencias, propinaPorPorcentaje } from '../../../utils/propinas';
import { formatMoney } from '../../../utils/money';

/**
 * Configuración de propinas (BLOQUE 9).
 *
 * Es un ajuste de la CUENTA, igual que el impuesto: cambia lo que se le PIDE al
 * cliente y lo que el corte le exige al cajero en el cajón, así que lo decide el
 * dueño (el backend responde 403 al resto) y la sección solo se monta con
 * `isOwner`.
 *
 * ⚠️ La propina NO es una venta: no se suma al total del pedido ni paga impuesto.
 * Solo la de EFECTIVO cuenta en el efectivo esperado, porque está en el cajón.
 */
export function SeccionPropinas({ settings, currency = '$', onSaved, styles }) {
  const actual = configPropina(settings);

  const [modal, setModal]         = useState(false);
  const [texto, setTexto]         = useState(actual.sugerencias.join(', '));
  const [guardando, setGuardando] = useState(false);

  // Se normaliza en vivo para que el dueño vea exactamente qué botones le van a
  // salir al cajero, en vez de descubrirlo después de guardar.
  const sugerencias = normalizarSugerencias(texto);

  const resumen = actual.activo
    ? `Activas · sugerencias del ${actual.sugerencias.join('%, ')}%`
    : 'Apagado · el cobro no pide propina';

  function abrir() {
    setTexto(actual.sugerencias.join(', '));
    setModal(true);
  }

  /** Interruptor de la tarjeta. Apagar conserva los porcentajes configurados. */
  async function alternar(valor) {
    setGuardando(true);
    try {
      await api.updateSettings({ propinas_activas: !!valor });
      await onSaved?.();
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(apagar = false) {
    setGuardando(true);
    try {
      await api.updateSettings({
        propinas_activas: !apagar,
        propina_sugerencias: sugerencias,
      });
      // Refresca settings en el AuthContext, que además cachea la config para
      // poder pedir propina SIN internet.
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
      <SectionTitle label="Propinas" />
      <SectionCard>
        <SwitchRow
          label="Aceptar propinas en el cobro"
          sub="La propina no es una venta: se registra aparte y no paga impuesto"
          value={actual.activo}
          onChange={alternar}
        />
        <MenuItem
          label="Porcentajes sugeridos"
          sub={resumen}
          onPress={abrir}
          last
        />
      </SectionCard>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Propinas</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
              <Text style={local.label}>Porcentajes sugeridos (máximo 4)</Text>
              <TextInput
                style={local.input}
                value={texto}
                onChangeText={setTexto}
                placeholder="10, 15, 20"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={local.ejemplo}>
                Aparecen como botones rápidos al cobrar. El cajero siempre puede escribir otro monto.
              </Text>

              {/* Vista previa: se ve el botón tal como le saldrá al cajero, con el
                  monto ya calculado. Es la forma más rápida de entender qué se
                  está configurando. */}
              <Text style={local.label}>Así se verá en el cobro</Text>
              <View style={local.preview}>
                {sugerencias.map(pct => (
                  <View key={pct} style={local.previewBtn}>
                    <Text style={local.previewPct}>{pct}%</Text>
                    <Text style={local.previewMonto}>
                      {formatMoney(propinaPorPorcentaje(200, pct), currency)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={local.ejemplo}>
                Ejemplo sobre una cuenta de {formatMoney(200, currency)}.
              </Text>

              <View style={local.aviso}>
                <Text style={local.avisoTexto}>
                  La propina no se suma al total de la venta ni paga impuesto: se registra
                  aparte y aparece en el corte de caja. La propina en efectivo sí cuenta en el
                  efectivo esperado, porque está en el cajón; cuando se la entregues al
                  empleado, regístrala como un retiro.
                </Text>
              </View>

              <TouchableOpacity
                style={[local.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={() => guardar(false)}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={local.btnGuardarText}>Guardar propinas</Text>}
              </TouchableOpacity>

              {actual.activo && (
                <TouchableOpacity
                  style={local.btnQuitar}
                  onPress={() => guardar(true)}
                  disabled={guardando}
                >
                  <Text style={local.btnQuitarText}>Dejar de pedir propina</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const local = {
  label:  { fontSize: font.sm, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input:  {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.textPrimary, backgroundColor: colors.surface, fontSize: font.md,
  },
  ejemplo: { fontSize: font.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  preview: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  previewBtn: {
    flex: 1, minWidth: 64, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface,
  },
  previewPct:   { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  previewMonto: { fontSize: 11, color: colors.textSecondary },
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
  btnQuitar:      { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  btnQuitarText:  { color: colors.danger, fontSize: font.sm, fontWeight: '600' },
};
