import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

const ROL_LABEL = { owner: 'Dueño', cashier: 'Cajero', waiter: 'Mesero', delivery: 'Repartidor' };
const PLAN_LABEL = { free: 'Gratuito', premium: 'Premium', trialing: 'Prueba' };
const PLAN_COLOR = { free: colors.textMuted, premium: '#f59e0b', trialing: colors.primary };

function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function MenuItem({ label, sub, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );
}

function StaffRow({ staff, onDelete }) {
  return (
    <View style={[styles.menuItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={styles.staffAvatar}>
        <Text style={styles.staffAvatarText}>{staff.name?.[0]?.toUpperCase() || '?'}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.menuLabel}>{staff.name}</Text>
        <Text style={styles.menuSub}>{staff.username} · {ROL_LABEL[staff.role] || staff.role}</Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(staff)} style={{ padding: spacing.xs }}>
        <Text style={{ fontSize: 18 }}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AjustesScreen() {
  const { user, isOwner, logout } = useAuth();

  const [staff, setStaff]           = useState([]);
  const [loadingStaff, setLoadStaff] = useState(false);
  const [refreshing, setRefreshing]  = useState(false);

  // Modal nuevo empleado
  const [modalEmpl, setModalEmpl]   = useState(false);
  const [emplNombre, setEmplNombre] = useState('');
  const [emplUser, setEmplUser]     = useState('');
  const [emplPass, setEmplPass]     = useState('');
  const [emplRol, setEmplRol]       = useState('cashier');
  const [guardando, setGuardando]   = useState(false);

  const loadStaff = useCallback(async (isRefresh = false) => {
    if (!isOwner) return;
    if (isRefresh) setRefreshing(true); else setLoadStaff(true);
    try {
      const data = await api.getStaff();
      setStaff(data);
    } catch {
      // silencioso — si falla no bloquea la pantalla
    } finally {
      setLoadStaff(false);
      setRefreshing(false);
    }
  }, [isOwner]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  function abrirNuevoEmpl() {
    setEmplNombre(''); setEmplUser(''); setEmplPass(''); setEmplRol('cashier');
    setModalEmpl(true);
  }

  async function guardarEmpleado() {
    if (!emplNombre.trim() || !emplUser.trim() || !emplPass.trim()) {
      Alert.alert('Campos requeridos', 'Nombre, usuario y contraseña son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const created = await api.createStaff({ name: emplNombre.trim(), username: emplUser.trim(), password: emplPass, role: emplRol });
      setStaff(prev => [...prev, created]);
      setModalEmpl(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarEmpleado(s) {
    Alert.alert('Eliminar empleado', `¿Eliminar a "${s.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteStaff(s.id);
          setStaff(prev => prev.filter(x => x.id !== s.id));
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  }

  function confirmarCerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  }

  const plan = user?.plan || 'free';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStaff(true)} />}
      >
        <Text style={styles.title}>Ajustes</Text>

        {/* Perfil */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>{ROL_LABEL[user?.role] || user?.role}</Text>
            <Text style={styles.profileEmail}>{user?.username}</Text>
          </View>
          {isOwner && (
            <View style={[styles.planBadge, { backgroundColor: PLAN_COLOR[plan] + '22', borderColor: PLAN_COLOR[plan] }]}>
              <Text style={[styles.planBadgeText, { color: PLAN_COLOR[plan] }]}>{PLAN_LABEL[plan] || plan}</Text>
            </View>
          )}
        </View>

        {/* Empleados — solo dueño */}
        {isOwner && (
          <>
            <SectionTitle label="Empleados" />
            <View style={styles.section}>
              {loadingStaff
                ? <ActivityIndicator color={colors.primary} style={{ padding: spacing.lg }} />
                : staff.length === 0
                  ? <Text style={styles.emptySmall}>No hay empleados registrados</Text>
                  : staff.map(s => <StaffRow key={s.id} staff={s} onDelete={eliminarEmpleado} />)
              }
              <TouchableOpacity style={[styles.menuItem, { borderTopWidth: staff.length > 0 ? 1 : 0, borderTopColor: colors.border }]} onPress={abrirNuevoEmpl}>
                <Text style={[styles.menuLabel, { color: colors.primary }]}>+ Agregar empleado</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Cuenta */}
        <SectionTitle label="Cuenta" />
        <View style={styles.section}>
          <MenuItem label="Cerrar sesión" danger onPress={confirmarCerrarSesion} />
        </View>

        <Text style={styles.footer}>Zenit POS · Versión 1.0.0</Text>
      </ScrollView>

      {/* Modal nuevo empleado */}
      <Modal visible={modalEmpl} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo empleado</Text>
              <TouchableOpacity onPress={() => setModalEmpl(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre completo *</Text>
              <TextInput style={styles.input} value={emplNombre} onChangeText={setEmplNombre} placeholder="Ej: María López" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Usuario *</Text>
              <TextInput style={styles.input} value={emplUser} onChangeText={setEmplUser} placeholder="Ej: maria" autoCapitalize="none" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Contraseña *</Text>
              <TextInput style={styles.input} value={emplPass} onChangeText={setEmplPass} placeholder="Contraseña de acceso" secureTextEntry placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Rol</Text>
              {[
                { key: 'cashier', label: '🏪 Cajero' },
                { key: 'waiter', label: '🍽️ Mesero' },
                { key: 'delivery', label: '🛵 Repartidor' },
              ].map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.rolOpcion, emplRol === r.key && styles.rolOpcionActive]}
                  onPress={() => setEmplRol(r.key)}
                >
                  <Text style={[styles.rolOpcionText, emplRol === r.key && { color: '#fff' }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                onPress={guardarEmpleado}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>Crear empleado</Text>
                }
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
  scroll: { padding: spacing.lg },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl, gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: font.xxl, fontWeight: '800' },
  profileName: { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  profileRole: { fontSize: font.sm, color: colors.primary, fontWeight: '600' },
  profileEmail: { fontSize: font.sm - 1, color: colors.textMuted },
  planBadge: { borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  planBadgeText: { fontSize: font.sm - 1, fontWeight: '700' },
  sectionTitle: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.lg },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  menuLabel: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  menuSub: { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  emptySmall: { color: colors.textMuted, fontSize: font.sm, padding: spacing.lg },
  staffAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  staffAvatarText: { fontSize: font.md, fontWeight: '700', color: colors.textSecondary },
  footer: { textAlign: 'center', color: colors.textMuted, fontSize: font.sm - 1, marginTop: spacing.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: font.md },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  rolOpcion: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs, backgroundColor: colors.surface },
  rolOpcionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rolOpcionText: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  btnGuardar: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnGuardarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
});
