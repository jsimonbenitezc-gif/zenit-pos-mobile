import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

function avatarColor(name) {
  const code = (name || '?').charCodeAt(0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function ClientesScreen() {
  const { settings, user, nombreActivo, rolActivo, permisosRolesEfectivos } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trial';

  const [clientes, setClientes]     = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [tab, setTab]               = useState('todos');       // 'todos' | 'fidelidad'
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling]     = useState(new Set());    // IDs siendo modificados

  // Modal nuevo cliente
  const [modalNuevo, setModalNuevo]     = useState(false);
  const [nombre, setNombre]             = useState('');
  const [telefono, setTelefono]         = useState('');
  const [direccion, setDireccion]       = useState('');
  const [guardando, setGuardando]       = useState(false);

  // Modal editar cliente
  const [modalEditar, setModalEditar]   = useState(false);
  const [editando, setEditando]         = useState(null);
  const [editNombre, setEditNombre]     = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  // Modal PIN para editar cliente
  const [pinEditModal, setPinEditModal] = useState(false);
  const [pinEditValue, setPinEditValue] = useState('');
  const [pinEditError, setPinEditError] = useState('');
  const [pinEditLoading, setPinEditLoading] = useState(false);
  const pinEditRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getCustomers();
      setClientes(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de clientes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function guardar() {
    if (!nombre.trim() || !telefono.trim()) {
      Alert.alert('Campos requeridos', 'Nombre y teléfono son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const payload = { name: nombre.trim(), phone: telefono.trim() };
      if (direccion.trim()) payload.address = direccion.trim();
      const c = await api.createCustomer(payload);
      setClientes(prev => [c, ...prev]);
      setModalNuevo(false);
      setNombre(''); setTelefono(''); setDireccion('');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  function abrirEditar(cliente) {
    setEditando(cliente);
    setEditNombre(cliente.name || '');
    setEditTelefono(cliente.phone || '');
    setEditDireccion(cliente.address || '');
    setModalEditar(true);
  }

  function guardarEdicion() {
    if (!editNombre.trim() || !editTelefono.trim()) {
      Alert.alert('Campos requeridos', 'Nombre y teléfono son obligatorios.');
      return;
    }
    // Mostrar modal de PIN antes de guardar
    setPinEditValue('');
    setPinEditError('');
    setPinEditModal(true);
  }

  async function confirmarEdicionConPin() {
    if (!pinEditValue) { setPinEditError('Ingresa tu PIN'); return; }
    if (api.isPinLocked()) {
      setPinEditError(`Demasiados intentos. Espera ${api.getPinLockRemainingMin()} min.`);
      return;
    }
    setPinEditLoading(true);
    setPinEditError('');
    try {
      const perfilActual = permisosRolesEfectivos?.[rolActivo];
      if (perfilActual?.pin_set) {
        const result = await api.verifyProfilePin(rolActivo, pinEditValue);
        if (!result.valid) {
          api.registerPinFailure();
          setPinEditError(api.isPinLocked() ? 'Demasiados intentos. Espera 5 min.' : 'PIN incorrecto');
          setPinEditLoading(false);
          return;
        }
        api.resetPinAttempts();
      }

      // PIN válido: guardar con auditoría
      setGuardandoEditar(true);
      const payload = { name: editNombre.trim(), phone: editTelefono.trim(), address: editDireccion.trim() || null };
      const updated = await api.updateCustomerWithPin(editando.id, payload, {
        employee_id: rolActivo,
        pin: pinEditValue,
        employee_name: nombreActivo || '',
      });
      setClientes(prev => prev.map(c => c.id === editando.id ? { ...c, ...updated } : c));
      setPinEditModal(false);
      setModalEditar(false);
    } catch (e) {
      setPinEditError(e.message || 'Error al guardar');
    } finally {
      setPinEditLoading(false);
      setGuardandoEditar(false);
    }
  }

  async function toggleFidelidad(cliente) {
    if (!isPremium) {
      Alert.alert('Función Premium', 'El programa de fidelidad está disponible en el plan Premium.');
      return;
    }
    const nuevo = !cliente.in_loyalty;
    setToggling(prev => new Set([...prev, cliente.id]));
    try {
      await api.updateCustomerLoyalty(cliente.id, { in_loyalty: nuevo });
      setClientes(prev =>
        prev.map(c => c.id === cliente.id ? { ...c, in_loyalty: nuevo } : c)
      );
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(cliente.id); return s; });
    }
  }

  const filtrados = clientes.filter(c => {
    const matchBusqueda = !busqueda ||
      c.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.phone?.includes(busqueda);
    const matchTab = tab === 'todos' || c.in_loyalty === true;
    return matchBusqueda && matchTab;
  });

  const enFidelidad = clientes.filter(c => c.in_loyalty).length;

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Clientes</Text>
          <Text style={styles.subtitle}>{clientes.length} registrados</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalNuevo(true)}>
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'todos' && styles.tabActive]}
          onPress={() => setTab('todos')}
        >
          <Text style={[styles.tabText, tab === 'todos' && styles.tabTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'fidelidad' && styles.tabActive]}
          onPress={() => setTab('fidelidad')}
        >
          <Text style={[styles.tabText, tab === 'fidelidad' && styles.tabTextActive]}>
            ⭐ Fidelidad
          </Text>
          {enFidelidad > 0 && (
            <View style={[styles.badge, tab === 'fidelidad' && styles.badgeActive]}>
              <Text style={[styles.badgeText, tab === 'fidelidad' && styles.badgeTextActive]}>
                {enFidelidad}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={tab === 'fidelidad' ? 'Buscar en programa...' : 'Buscar por nombre o teléfono...'}
          placeholderTextColor={colors.textMuted}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Info fidelidad cuando está en ese tab */}
      {tab === 'fidelidad' && (
        <View style={styles.fidelidadInfo}>
          <Ionicons name="star" size={14} color="#7c3aed" />
          <Text style={styles.fidelidadInfoText}>
            {enFidelidad === 0
              ? 'Ningún cliente en el programa aún. Activa la estrella en cada cliente.'
              : `${enFidelidad} ${enFidelidad === 1 ? 'cliente inscrito' : 'clientes inscritos'} en el programa`
            }
          </Text>
        </View>
      )}

      <FlatList
        data={filtrados}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <ClienteCard item={item} onEdit={abrirEditar} onToggleFidelidad={toggleFidelidad} toggling={toggling} isPremium={isPremium} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name={tab === 'fidelidad' ? 'star-outline' : 'people-outline'} size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {tab === 'fidelidad'
                ? 'Ningún cliente en el programa de fidelidad'
                : busqueda ? 'No se encontraron clientes' : 'No hay clientes registrados'
              }
            </Text>
          </View>
        }
      />

      {/* Modal editar cliente */}
      <Modal visible={modalEditar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalEditar(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar cliente</Text>
              <TouchableOpacity onPress={() => setModalEditar(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={editNombre} onChangeText={setEditNombre} placeholder="Nombre completo" placeholderTextColor={colors.textMuted} autoFocus />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>Teléfono *</Text>
              <TextInput style={styles.input} value={editTelefono} onChangeText={setEditTelefono} placeholder="10 dígitos" keyboardType="phone-pad" placeholderTextColor={colors.textMuted} />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>
                Dirección <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(opcional)</Text>
              </Text>
              <TextInput style={styles.input} value={editDireccion} onChangeText={setEditDireccion} placeholder="Calle, número, colonia..." placeholderTextColor={colors.textMuted} />
              <TouchableOpacity
                style={[styles.btnGuardar, guardandoEditar && { opacity: 0.7 }]}
                onPress={guardarEdicion}
                disabled={guardandoEditar}
              >
                {guardandoEditar ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnGuardarText}>Guardar cambios</Text>}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal nuevo cliente */}
      <Modal visible={modalNuevo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalNuevo(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo cliente</Text>
              <TouchableOpacity onPress={() => { setModalNuevo(false); setNombre(''); setTelefono(''); setDireccion(''); }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>Teléfono *</Text>
              <TextInput
                style={styles.input}
                value={telefono}
                onChangeText={setTelefono}
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>
                Dirección <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(opcional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={direccion}
                onChangeText={setDireccion}
                placeholder="Calle, número, colonia..."
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>Crear cliente</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal PIN para editar cliente */}
      <Modal
        visible={pinEditModal}
        transparent
        animationType="fade"
        onShow={() => setTimeout(() => pinEditRef.current?.focus(), 100)}
        onRequestClose={() => setPinEditModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.pinOverlay}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Autorización requerida</Text>
            <Text style={styles.pinMsg}>Editar cliente quedará registrado.{'\n'}Ingresa tu PIN para confirmar.</Text>
            <TextInput
              ref={pinEditRef}
              style={[styles.pinInput, pinEditError ? { borderColor: colors.danger } : null]}
              placeholder="PIN"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={20}
              value={pinEditValue}
              onChangeText={v => { setPinEditValue(v); setPinEditError(''); }}
              onSubmitEditing={confirmarEdicionConPin}
            />
            {pinEditError ? <Text style={styles.pinErrorText}>{pinEditError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnCancel]}
                onPress={() => setPinEditModal(false)}
                disabled={pinEditLoading}
              >
                <Text style={styles.pinBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnConfirm, pinEditLoading && { opacity: 0.6 }]}
                onPress={confirmarEdicionConPin}
                disabled={pinEditLoading}
              >
                {pinEditLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.pinBtnConfirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ClienteCard({ item, onEdit, onToggleFidelidad, toggling, isPremium }) {
  const color = avatarColor(item.name);
  const isToggling = toggling.has(item.id);

  return (
    <View style={styles.card}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <Text style={[styles.avatarText, { color }]}>
          {item.name?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{item.name}</Text>
        <View style={styles.cardRow}>
          <Ionicons name="call-outline" size={12} color={colors.textMuted} />
          <Text style={styles.cardDetail}>{item.phone}</Text>
        </View>
        {item.address ? (
          <View style={styles.cardRow}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.cardDetail} numberOfLines={1}>{item.address}</Text>
          </View>
        ) : null}
        {item.in_loyalty && item.loyalty_points > 0 ? (
          <View style={styles.puntosRow}>
            <Ionicons name="star" size={12} color="#7c3aed" />
            <Text style={styles.puntosText}>{item.loyalty_points} puntos</Text>
          </View>
        ) : item.in_loyalty ? (
          <View style={styles.puntosRow}>
            <Ionicons name="star" size={12} color="#7c3aed" />
            <Text style={styles.puntosText}>En programa · 0 pts</Text>
          </View>
        ) : null}
      </View>

      {/* Botón editar */}
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(item)}>
        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Botón fidelidad */}
      <TouchableOpacity
        style={[styles.starBtn, item.in_loyalty && styles.starBtnActive]}
        onPress={() => onToggleFidelidad(item)}
        disabled={isToggling}
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={item.in_loyalty ? '#7c3aed' : colors.textMuted} />
        ) : (
          <Ionicons
            name={item.in_loyalty ? 'star' : 'star-outline'}
            size={20}
            color={item.in_loyalty ? '#7c3aed' : colors.textMuted}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.background },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  subtitle:    { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 1 },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  addBtnText:  { color: '#fff', fontWeight: '700', fontSize: font.sm },

  // Tabs
  tabs:           { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 3 },
  tab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.md },
  tabActive:      { backgroundColor: colors.primary },
  tabText:        { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary },
  tabTextActive:  { color: '#fff' },
  badge:          { backgroundColor: colors.border, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeActive:    { backgroundColor: '#fff3' },
  badgeText:      { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  badgeTextActive:{ color: '#fff' },

  // Buscador
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  search:      { flex: 1, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },

  // Info fidelidad
  fidelidadInfo:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: '#f5f3ff', borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: '#ddd6fe' },
  fidelidadInfoText: { fontSize: font.sm - 1, color: '#6d28d9', flex: 1 },

  // Lista
  list:        { padding: spacing.lg, paddingTop: spacing.xs },
  emptyWrap:   { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText:   { color: colors.textMuted, fontSize: font.md, textAlign: 'center' },

  // Card de cliente
  card:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  avatar:      { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText:  { fontSize: font.lg, fontWeight: '800' },
  cardName:    { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  cardRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  cardDetail:  { fontSize: font.sm - 1, color: colors.textMuted },
  puntosRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  puntosText:  { fontSize: font.sm - 1, color: '#7c3aed', fontWeight: '600' },
  editBtn:     { padding: spacing.sm },
  starBtn:     { padding: spacing.sm, borderRadius: radius.md },
  starBtnActive:{ backgroundColor: '#f5f3ff' },

  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:  { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  label:       { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  btnGuardar:  { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnGuardarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },

  // Modal PIN
  pinOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  pinBox:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 340 },
  pinTitle:    { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  pinMsg:      { fontSize: font.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  pinInput:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background, textAlign: 'center', letterSpacing: 6, marginBottom: spacing.xs },
  pinErrorText:{ fontSize: font.sm, color: colors.danger, marginBottom: spacing.sm },
  pinActions:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pinBtn:      { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  pinBtnCancel:{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pinBtnCancelText: { color: colors.textSecondary, fontWeight: '600' },
  pinBtnConfirm:{ backgroundColor: colors.primary },
  pinBtnConfirmText: { color: '#fff', fontWeight: '700' },
});
