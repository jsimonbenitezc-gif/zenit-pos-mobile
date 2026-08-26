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
import { configImpuesto, desglosarImpuesto } from '../../../utils/impuestos';
import { formatMoney } from '../../../utils/money';

/**
 * Configuración del impuesto (BLOQUE 8).
 *
 * Es un ajuste de la CUENTA: lo decide el dueño y aplica a todos los equipos del
 * negocio (el backend responde 403 si lo manda alguien que no es el dueño), por
 * eso la sección solo se monta cuando `isOwner`.
 */
export function SeccionImpuestos({ settings, currency = '$', onSaved, styles }) {
  const actual = configImpuesto(settings);

  const [modal, setModal]       = useState(false);
  const [tasa, setTasa]         = useState(actual.tasaConfigurada > 0 ? String(actual.tasaConfigurada) : '');
  const [nombre, setNombre]     = useState(actual.nombre);
  const [incluido, setIncluido] = useState(actual.incluido);
  const [guardando, setGuardando] = useState(false);

  const tasaNum = parseFloat(String(tasa).replace(',', '.')) || 0;
  // Ejemplo en vivo con un producto de $100: es la única forma de que "incluido"
  // vs "agregado" se entienda sin explicaciones — se ve qué va a cobrar la caja.
  const ejemplo = desglosarImpuesto(100, { tasa: tasaNum, incluido });

  const resumen = actual.activo
    ? `${actual.nombre} ${actual.tasaConfigurada}% · ${actual.incluido ? 'incluido en el precio' : 'se suma al cobrar'}`
    : (actual.tasaConfigurada > 0
        ? `Apagado · ${actual.nombre} ${actual.tasaConfigurada}% guardado`
        : 'Apagado · las ventas no llevan impuesto');

  function abrir() {
    setTasa(actual.tasaConfigurada > 0 ? String(actual.tasaConfigurada) : '');
    setNombre(actual.nombre);
    setIncluido(actual.incluido);
    setModal(true);
  }

  /**
   * Interruptor de la tarjeta. Encender sin tasa configurada abre el formulario
   * en vez de guardar un impuesto del 0% que no haría nada; apagar conserva la
   * tasa para que reactivarlo no obligue a teclearla otra vez.
   */
  async function alternar(valor) {
    if (valor && actual.tasaConfigurada <= 0) { abrir(); return; }
    setGuardando(true);
    try {
      await api.updateSettings({ tax_enabled: !!valor });
      await onSaved?.();
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(apagar = false) {
    const tasaFinal = apagar ? 0 : tasaNum;
    if (!apagar && (tasaFinal <= 0 || tasaFinal > 100)) {
      Alert.alert('Tasa inválida', 'La tasa debe ser mayor a 0 y hasta 100.');
      return;
    }

    // Avisar la consecuencia ANTES: en modo AGREGADO los tickets suben de precio
    // desde la siguiente venta, y eso lo nota el cliente en la caja.
    if (!apagar && !incluido) {
      const confirmado = await new Promise(resolve => {
        Alert.alert(
          '¿Aplicar el impuesto?',
          `A partir de ahora se cobrará ${tasaFinal}% de ${nombre || 'IVA'} SOBRE el precio de cada producto. ` +
          `Un producto de ${formatMoney(100, currency)} pasará a cobrarse en ${formatMoney(ejemplo.total, currency)}.`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sí, aplicar', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmado) return;
    }

    setGuardando(true);
    try {
      // Apagar NO borra la tasa: se guarda el interruptor y la config queda
      // intacta para cuando el negocio quiera volver a cobrar impuesto.
      await api.updateSettings({
        tax_enabled: !apagar,
        tax_rate: apagar ? actual.tasaConfigurada : tasaFinal,
        tax_included: !!incluido,
        tax_name: (nombre || '').trim().slice(0, 20) || 'IVA',
      });
      // Refresca settings en el AuthContext, que además cachea la config para
      // poder cobrar el impuesto correcto SIN internet.
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
      <SectionTitle label="Impuestos" />
      <SectionCard>
        <SwitchRow
          label="Cobrar impuesto en las ventas"
          sub="Apagado no cambia nada: el sistema funciona igual que sin impuestos"
          value={actual.activo}
          onChange={alternar}
        />
        <MenuItem
          label="Configurar impuesto"
          sub={resumen}
          onPress={abrir}
          last
        />
      </SectionCard>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Impuesto</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={local.label}>Nombre del impuesto</Text>
              <TextInput
                style={local.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="IVA"
                placeholderTextColor={colors.textMuted}
                maxLength={20}
              />

              <Text style={local.label}>Tasa (%)</Text>
              <TextInput
                style={local.input}
                value={tasa}
                onChangeText={setTasa}
                placeholder="16"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={local.label}>Tus precios de catálogo…</Text>
              {/* INCLUIDO primero: es el default y el estándar en México. */}
              <TouchableOpacity
                style={[local.opcion, incluido && local.opcionActiva]}
                onPress={() => setIncluido(true)}
              >
                <Ionicons
                  name={incluido ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={incluido ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={local.opcionTitulo}>YA incluyen impuesto</Text>
                  <Text style={local.opcionSub}>Se desglosa en el ticket; el cliente paga lo etiquetado</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[local.opcion, !incluido && local.opcionActiva]}
                onPress={() => setIncluido(false)}
              >
                <Ionicons
                  name={!incluido ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={!incluido ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={local.opcionTitulo}>NO incluyen impuesto</Text>
                  <Text style={local.opcionSub}>Se suma al cobrar; el total sube</Text>
                </View>
              </TouchableOpacity>

              {tasaNum > 0 && (
                <Text style={local.ejemplo}>
                  {incluido
                    ? `Un producto de ${formatMoney(100, currency)} se cobra en ${formatMoney(100, currency)}, de los cuales ${formatMoney(ejemplo.impuesto, currency)} son ${nombre || 'IVA'}.`
                    : `Un producto de ${formatMoney(100, currency)} se cobra en ${formatMoney(ejemplo.total, currency)} (${formatMoney(100, currency)} + ${formatMoney(ejemplo.impuesto, currency)} de ${nombre || 'IVA'}).`}
                </Text>
              )}

              <TouchableOpacity
                style={[local.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={() => guardar(false)}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={local.btnGuardarText}>Guardar impuesto</Text>}
              </TouchableOpacity>

              {actual.activo && (
                <TouchableOpacity
                  style={local.btnQuitar}
                  onPress={() => guardar(true)}
                  disabled={guardando}
                >
                  <Text style={local.btnQuitarText}>Dejar de cobrar impuesto</Text>
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
    color: colors.text, backgroundColor: colors.surface, fontSize: font.md,
  },
  opcion: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  opcionActiva: { borderColor: colors.primary },
  opcionTitulo: { fontSize: font.md, color: colors.text, fontWeight: '600' },
  opcionSub:    { fontSize: font.sm, color: colors.textSecondary },
  ejemplo:      { fontSize: font.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  btnGuardar: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing.md,
    alignItems: 'center', marginTop: spacing.xl,
  },
  btnGuardarText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  btnQuitar:      { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  btnQuitarText:  { color: colors.danger, fontSize: font.sm, fontWeight: '600' },
};
