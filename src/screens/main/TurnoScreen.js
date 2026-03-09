import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, radius, font } from '../../theme';

const TURNO_KEY = 'zenit_turno_activo';

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export default function TurnoScreen() {
  const [turno, setTurno]           = useState(null); // null = no hay turno activo
  const [loading, setLoading]       = useState(true);
  const [modalApertura, setModal]   = useState(false);
  const [modalCierre, setModalCierre] = useState(false);

  // Apertura
  const [fondoInicial, setFondo]    = useState('');

  // Cierre
  const [efectivoCierre, setEfectivo] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync(TURNO_KEY).then(saved => {
      if (saved) {
        try { setTurno(JSON.parse(saved)); } catch {}
      }
      setLoading(false);
    });
  }, []);

  async function abrirTurno() {
    const fondo = parseFloat(fondoInicial) || 0;
    const nuevoTurno = {
      inicio: new Date().toISOString(),
      fondoInicial: fondo,
    };
    await SecureStore.setItemAsync(TURNO_KEY, JSON.stringify(nuevoTurno));
    setTurno(nuevoTurno);
    setModal(false);
    setFondo('');
  }

  async function cerrarTurno() {
    const efectivo = parseFloat(efectivoCierre) || 0;
    const fondo    = turno?.fondoInicial || 0;
    const diferencia = efectivo - fondo;

    Alert.alert(
      'Confirmar cierre de turno',
      `Efectivo contado: $${efectivo.toFixed(2)}\nFondo inicial: $${fondo.toFixed(2)}\nDiferencia: ${diferencia >= 0 ? '+' : ''}$${diferencia.toFixed(2)}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar turno',
          style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync(TURNO_KEY);
            setTurno(null);
            setModalCierre(false);
            setEfectivo('');
          },
        },
      ]
    );
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function duracion(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.title}>Turno</Text>

        {turno ? (
          <>
            {/* Turno activo */}
            <View style={styles.turnoCard}>
              <View style={styles.turnoHeader}>
                <View style={styles.activeDot} />
                <Text style={styles.turnoTitle}>Turno activo</Text>
              </View>
              <InfoRow label="Inicio"        value={formatDate(turno.inicio)} />
              <InfoRow label="Duración"      value={duracion(turno.inicio)} />
              <InfoRow label="Fondo inicial" value={`$${(turno.fondoInicial || 0).toFixed(2)}`} />
            </View>

            <TouchableOpacity style={styles.btnCerrar} onPress={() => setModalCierre(true)}>
              <Ionicons name="lock-closed-outline" size={20} color="#fff" />
              <Text style={styles.btnCerrarText}>Cerrar turno</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Sin turno activo */}
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={52} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No hay turno activo</Text>
              <Text style={styles.emptySubtitle}>Abre un turno para comenzar a registrar ventas</Text>
            </View>

            <TouchableOpacity style={styles.btnAbrir} onPress={() => setModal(true)}>
              <Ionicons name="lock-open-outline" size={20} color="#fff" />
              <Text style={styles.btnAbrirText}>Abrir turno</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal apertura */}
      <Modal visible={modalApertura} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Abrir turno</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Fondo inicial en caja</Text>
              <TextInput
                style={styles.input}
                value={fondoInicial}
                onChangeText={setFondo}
                placeholder="$0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={styles.hint}>El monto de efectivo con el que inicias el turno</Text>
              <TouchableOpacity style={[styles.btnAbrir, { marginTop: spacing.xl }]} onPress={abrirTurno}>
                <Ionicons name="lock-open-outline" size={20} color="#fff" />
                <Text style={styles.btnAbrirText}>Confirmar apertura</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal cierre */}
      <Modal visible={modalCierre} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCierre(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cerrar turno</Text>
              <TouchableOpacity onPress={() => setModalCierre(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <InfoRow label="Fondo inicial" value={`$${(turno?.fondoInicial || 0).toFixed(2)}`} />
              <InfoRow label="Duración" value={duracion(turno?.inicio)} />

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Efectivo contado en caja</Text>
              <TextInput
                style={styles.input}
                value={efectivoCierre}
                onChangeText={setEfectivo}
                placeholder="$0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              {efectivoCierre !== '' && (
                <View style={styles.diferenciaCard}>
                  <Text style={styles.diferenciaLabel}>Diferencia</Text>
                  <Text style={[
                    styles.diferenciaValue,
                    { color: (parseFloat(efectivoCierre) - (turno?.fondoInicial || 0)) >= 0 ? colors.success : colors.danger }
                  ]}>
                    {(parseFloat(efectivoCierre) - (turno?.fondoInicial || 0)) >= 0 ? '+' : ''}${((parseFloat(efectivoCierre) || 0) - (turno?.fondoInicial || 0)).toFixed(2)}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={[styles.btnCerrar, { marginTop: spacing.xl }]} onPress={cerrarTurno}>
                <Ionicons name="lock-closed-outline" size={20} color="#fff" />
                <Text style={styles.btnCerrarText}>Confirmar cierre</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.background },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:            { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  turnoCard:        { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  turnoHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  activeDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  turnoTitle:       { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel:        { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  infoValue:        { fontSize: font.sm, color: colors.textPrimary, fontWeight: '700' },
  emptyCard:        { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl, borderWidth: 1, borderColor: colors.border, gap: spacing.sm, marginBottom: spacing.lg },
  emptyTitle:       { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  emptySubtitle:    { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
  btnAbrir:         { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnAbrirText:     { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnCerrar:        { backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnCerrarText:    { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  dragHandleWrap:   { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  label:            { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.xl, fontWeight: '700', color: colors.textPrimary, backgroundColor: colors.surface },
  hint:             { fontSize: font.sm - 1, color: colors.textMuted, marginTop: spacing.xs },
  diferenciaCard:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  diferenciaLabel:  { fontSize: font.md, fontWeight: '600', color: colors.textSecondary },
  diferenciaValue:  { fontSize: font.xl, fontWeight: '800' },
});
