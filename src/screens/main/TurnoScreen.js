import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export default function TurnoScreen() {
  const { settings, user, sucursalId, nombreActivo, rolActivo } = useAuth();
  const currency = settings?.currency_symbol || '$';
  const [turno, setTurno]           = useState(null);
  const [totales, setTotales]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [modalApertura, setModal]   = useState(false);
  const [modalCierre, setModalCierre] = useState(false);

  // Apertura
  const [fondoInicial, setFondo]    = useState('');

  // Cierre
  const [efectivoCierre, setEfectivo] = useState('');
  const [notasCierre, setNotas]       = useState('');

  const cargarTurno = useCallback(async () => {
    try {
      const t = await api.getTurnoActivo(sucursalId);
      setTurno(t || null);
      if (t) {
        const tots = await api.getTurnoTotales(t.id).catch(() => null);
        setTotales(tots);
      } else {
        setTotales(null);
      }
    } catch {
      setTurno(null);
      setTotales(null);
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    cargarTurno();
  }, [cargarTurno]);

  async function abrirTurno() {
    const fondo = parseFloat(fondoInicial) || 0;
    setSaving(true);
    try {
      const cajeroNombre = nombreActivo || user?.name || 'Cajero';
      const nuevo = await api.abrirTurno(cajeroNombre, rolActivo || null, fondo, sucursalId);
      setTurno(nuevo);
      setTotales({ total_pedidos: 0, total_ventas: 0, total_efectivo: 0, total_tarjeta: 0, total_transferencia: 0 });
      setModal(false);
      setFondo('');
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo abrir el turno');
    } finally {
      setSaving(false);
    }
  }

  async function cerrarTurno() {
    const efectivo = parseFloat(efectivoCierre) || 0;
    const fondo    = parseFloat(turno?.fondo_inicial) || 0;
    const efectivoVentas = totales?.total_efectivo || 0;
    const diferencia = efectivo - fondo - efectivoVentas;

    Alert.alert(
      'Confirmar cierre de turno',
      `Efectivo contado: ${formatMoney(efectivo, currency)}\nFondo inicial: ${formatMoney(fondo, currency)}\nDiferencia: ${diferencia >= 0 ? '+' : ''}${formatMoney(Math.abs(diferencia), currency)}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar turno',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.cerrarTurno(turno.id, efectivo, notasCierre || null);
              setTurno(null);
              setTotales(null);
              setModalCierre(false);
              setEfectivo('');
              setNotas('');
            } catch (e) {
              Alert.alert('Error', friendlyError(e) || 'No se pudo cerrar el turno');
            } finally {
              setSaving(false);
            }
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
              <InfoRow label="Cajero"        value={turno.cajero_nombre} />
              <InfoRow label="Inicio"        value={formatDate(turno.apertura)} />
              <InfoRow label="Duración"      value={duracion(turno.apertura)} />
              <InfoRow label="Fondo inicial" value={formatMoney(parseFloat(turno.fondo_inicial || 0), currency)} />
            </View>

            {totales && (
              <View style={styles.totalesCard}>
                <Text style={styles.totalesTitle}>Ventas del turno</Text>
                <InfoRow label="Pedidos"      value={totales.total_pedidos || 0} />
                <InfoRow label="Total"        value={formatMoney(totales.total_ventas || 0, currency)} />
                <InfoRow label="Efectivo"     value={formatMoney(totales.total_efectivo || 0, currency)} />
                {(totales.total_tarjeta || 0) > 0 && (
                  <InfoRow label="Tarjeta"    value={formatMoney(totales.total_tarjeta, currency)} />
                )}
                {(totales.total_transferencia || 0) > 0 && (
                  <InfoRow label="Transferencia" value={formatMoney(totales.total_transferencia, currency)} />
                )}
              </View>
            )}

            <TouchableOpacity style={styles.btnRefrescar} onPress={cargarTurno}>
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.btnRefrescarText}>Actualizar totales</Text>
            </TouchableOpacity>

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
                placeholder={`${currency}0.00`}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={styles.hint}>El monto de efectivo con el que inicias el turno</Text>
              <TouchableOpacity
                style={[styles.btnAbrir, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={abrirTurno}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="lock-open-outline" size={20} color="#fff" />}
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
              <InfoRow label="Fondo inicial"    value={formatMoney(parseFloat(turno?.fondo_inicial || 0), currency)} />
              <InfoRow label="Ventas efectivo"  value={formatMoney(totales?.total_efectivo || 0, currency)} />
              <InfoRow label="Duración"         value={duracion(turno?.apertura)} />

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Efectivo contado en caja</Text>
              <TextInput
                style={styles.input}
                value={efectivoCierre}
                onChangeText={setEfectivo}
                placeholder={`${currency}0.00`}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              {efectivoCierre !== '' && (
                <View style={styles.diferenciaCard}>
                  <Text style={styles.diferenciaLabel}>Diferencia</Text>
                  <Text style={[
                    styles.diferenciaValue,
                    {
                      color: ((parseFloat(efectivoCierre) || 0) - parseFloat(turno?.fondo_inicial || 0) - (totales?.total_efectivo || 0)) >= 0
                        ? colors.success
                        : colors.danger
                    }
                  ]}>
                    {(() => {
                      const dif = (parseFloat(efectivoCierre) || 0) - parseFloat(turno?.fondo_inicial || 0) - (totales?.total_efectivo || 0);
                      return `${dif >= 0 ? '+' : ''}${formatMoney(Math.abs(dif), currency)}`;
                    })()}
                  </Text>
                </View>
              )}

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={notasCierre}
                onChangeText={setNotas}
                placeholder="Observaciones del turno..."
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.btnCerrar, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={cerrarTurno}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="lock-closed-outline" size={20} color="#fff" />}
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
  turnoCard:        { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  turnoHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  activeDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  turnoTitle:       { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  totalesCard:      { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  totalesTitle:     { fontSize: font.md, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
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
  btnRefrescar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  btnRefrescarText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
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
