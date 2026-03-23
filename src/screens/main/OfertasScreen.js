import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, TouchableOpacity, TextInput, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';

const TIPO_LABEL = { percentage: 'Porcentaje', fixed: 'Monto fijo' };

function DiscountCard({ discount, currency, onEdit }) {
  const isPercent = discount.type === 'percentage';
  return (
    <TouchableOpacity
      style={[styles.card, !discount.active && styles.cardInactive]}
      onPress={() => onEdit(discount)}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{discount.name}</Text>
        <View style={styles.valueBadge}>
          <Text style={styles.valueText}>
            {isPercent ? `${discount.value}%` : formatMoney(parseFloat(discount.value), currency)}
          </Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.cardTipo}>{TIPO_LABEL[discount.type] || discount.type}</Text>
        {discount.requires_pin && (
          <View style={styles.pinBadge}>
            <Ionicons name="key-outline" size={11} color="#7c3aed" />
            <Text style={styles.pinBadgeText}>PIN</Text>
          </View>
        )}
        {!discount.active && (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveText}>Inactivo</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PremiumGate() {
  return (
    <View style={styles.premiumWrap}>
      <Ionicons name="pricetag-outline" size={52} color={colors.textMuted} />
      <Text style={styles.premiumTitle}>Función Premium</Text>
      <Text style={styles.premiumSubtitle}>
        Las ofertas y descuentos están disponibles en el plan Premium.
        Actívalo desde la app de escritorio Zenit POS.
      </Text>
    </View>
  );
}

// Estado inicial vacío para el form
const FORM_EMPTY = { nombre: '', tipo: 'percentage', valor: '', active: true, requires_pin: false };

export default function OfertasScreen() {
  const { user, settings } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trial';
  const isOwner = user?.role === 'owner';
  const currency = settings?.currency_symbol || '$';

  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);

  // Modal crear/editar
  const [modal, setModal]         = useState(false);
  const [editando, setEditando]   = useState(null); // null = crear, objeto = editar
  const [form, setForm]           = useState(FORM_EMPTY);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const data = await api.getDiscounts();
      setDiscounts(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las ofertas.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_EMPTY);
    setModal(true);
  }

  function abrirEditar(d) {
    if (!isOwner) return;
    setEditando(d);
    setForm({
      nombre: d.name,
      tipo: d.type,
      valor: String(d.value),
      active: d.active,
      requires_pin: !!d.requires_pin,
    });
    setModal(true);
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { Alert.alert('Error', 'Escribe un nombre'); return; }
    const v = parseFloat(form.valor);
    if (!v || v <= 0) { Alert.alert('Error', 'Valor inválido'); return; }
    if (form.tipo === 'percentage' && (v < 1 || v > 100)) {
      Alert.alert('Error', 'El porcentaje debe estar entre 1 y 100');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.nombre.trim(),
        type: form.tipo,
        value: v,
        applies_to: 'all',
        active: form.active,
        requires_pin: form.requires_pin,
      };
      if (editando) {
        await api.updateDiscount(editando.id, payload);
      } else {
        await api.createDiscount(payload);
      }
      setModal(false);
      await load(true);
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo guardar el descuento.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrar = (d) => {
    Alert.alert(
      'Eliminar descuento',
      `¿Eliminar "${d.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => borrar(d.id) },
      ]
    );
  };

  const borrar = async (id) => {
    try {
      await api.deleteDiscount(id);
      await load(true);
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo eliminar el descuento.');
    }
  };

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Ofertas</Text>
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Ofertas</Text>
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={12} color="#f59e0b" />
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
        {isOwner && (
          <TouchableOpacity style={styles.btnAdd} onPress={abrirCrear}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.btnAddText}>Nueva</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={discounts}
        keyExtractor={d => String(d.id)}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <DiscountCard discount={item} currency={currency} onEdit={abrirEditar} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
            <Text style={styles.empty}>No hay descuentos creados</Text>
            {isOwner && <Text style={styles.emptyHint}>Toca "Nueva" para agregar uno</Text>}
          </View>
        }
      />

      {/* Modal crear / editar */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editando ? 'Editar descuento' : 'Nuevo descuento'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {editando && (
                  <TouchableOpacity onPress={() => { setModal(false); confirmarBorrar(editando); }}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={form.nombre}
                onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
                placeholder="Ej: 10% en todo"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Tipo</Text>
              <View style={styles.tipoRow}>
                <TouchableOpacity
                  style={[styles.tipoBtn, form.tipo === 'percentage' && styles.tipoBtnActive]}
                  onPress={() => setForm(f => ({ ...f, tipo: 'percentage' }))}
                >
                  <Text style={[styles.tipoText, form.tipo === 'percentage' && styles.tipoTextActive]}>% Porcentaje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBtn, form.tipo === 'fixed' && styles.tipoBtnActive]}
                  onPress={() => setForm(f => ({ ...f, tipo: 'fixed' }))}
                >
                  <Text style={[styles.tipoText, form.tipo === 'fixed' && styles.tipoTextActive]}>Monto</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: spacing.md }]}>Valor</Text>
              <TextInput
                style={styles.input}
                value={form.valor}
                onChangeText={v => setForm(f => ({ ...f, valor: v }))}
                placeholder={form.tipo === 'percentage' ? 'Ej: 10' : `${currency}50`}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Activo</Text>
                  <Text style={styles.switchSub}>Si está inactivo, no aparece en Nueva Venta</Text>
                </View>
                <Switch
                  value={form.active}
                  onValueChange={v => setForm(f => ({ ...f, active: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={[styles.switchRow, { marginTop: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Requiere PIN</Text>
                  <Text style={styles.switchSub}>Pide PIN al cajero antes de aplicarlo</Text>
                </View>
                <Switch
                  value={form.requires_pin}
                  onValueChange={v => setForm(f => ({ ...f, requires_pin: v }))}
                  trackColor={{ true: '#7c3aed' }}
                />
              </View>

              <TouchableOpacity
                style={[styles.btnGuardar, saving && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={saving}
              >
                <Text style={styles.btnGuardarText}>{saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear descuento'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },
  centered:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  title:             { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, padding: spacing.lg, paddingBottom: spacing.sm },
  premiumBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2, gap: 3 },
  premiumBadgeText:  { fontSize: font.sm - 2, fontWeight: '700', color: '#f59e0b' },
  card:              { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardInactive:      { opacity: 0.5 },
  cardTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardName:          { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  valueBadge:        { backgroundColor: colors.primary + '20', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  valueText:         { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  cardMeta:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTipo:          { fontSize: font.sm - 1, color: colors.textMuted },
  pinBadge:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ede9fe', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  pinBadgeText:      { fontSize: font.sm - 2, color: '#7c3aed', fontWeight: '700' },
  inactiveBadge:     { backgroundColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  inactiveText:      { fontSize: font.sm - 2, color: colors.textMuted, fontWeight: '600' },
  premiumWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:      { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:   { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyWrap:         { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty:             { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  emptyHint:         { color: colors.textMuted, fontSize: font.sm },
  btnAdd:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnAddText:        { fontSize: font.sm - 1, fontWeight: '700', color: colors.primary },
  overlay:           { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalBox:          { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
  modalTitle:        { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  modalBody:         { padding: spacing.lg },
  label:             { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input:             { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.md, color: colors.textPrimary },
  tipoRow:           { flexDirection: 'row', gap: spacing.sm },
  tipoBtn:           { flex: 1, paddingVertical: spacing.sm - 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tipoBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoText:          { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  tipoTextActive:    { color: '#fff' },
  switchRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md },
  switchLabel:       { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  switchSub:         { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  btnGuardar:        { marginTop: spacing.lg, backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnGuardarText:    { color: '#fff', fontWeight: '800', fontSize: font.md },
});
