import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

export default function ClientesScreen() {
  const [clientes, setClientes]     = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModal]    = useState(false);
  const [nombre, setNombre]         = useState('');
  const [telefono, setTelefono]     = useState('');
  const [guardando, setGuardando]   = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getCustomers();
      setClientes(data);
    } catch (e) {
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
      const c = await api.createCustomer({ name: nombre.trim(), phone: telefono.trim() });
      setClientes(prev => [c, ...prev]);
      setModal(false);
      setNombre(''); setTelefono('');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  }

  const filtrados = clientes.filter(c =>
    !busqueda ||
    c.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.phone?.includes(busqueda)
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Clientes</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
          <Text style={styles.addBtnText}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre o teléfono..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowPhone}>{item.phone}</Text>
            </View>
            {item.loyalty_points > 0 && (
              <View style={styles.puntosRow}>
                <Ionicons name="star" size={13} color={colors.warning} />
                <Text style={styles.puntos}> {item.loyalty_points}</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hay clientes</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo cliente</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.md }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre completo" placeholderTextColor={colors.textMuted} />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Teléfono *</Text>
              <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} placeholder="10 dígitos" keyboardType="phone-pad" placeholderTextColor={colors.textMuted} />
              <TouchableOpacity style={[styles.btnGuardar, guardando && { opacity: 0.7 }]} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnGuardarText}>Crear cliente</Text>}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  avatarText: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  rowName: { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  rowPhone: { fontSize: font.sm - 1, color: colors.textMuted },
  puntosRow: { flexDirection: 'row', alignItems: 'center' },
  puntos: { fontSize: font.sm, color: colors.warning, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  btnGuardar: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnGuardarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
});
