import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

export default function PerfilScreen() {
  const { permisosRolesEfectivos, seleccionarPerfil, verificarPasswordAdmin, sessionEmail, logout } = useAuth();
  const permisos = permisosRolesEfectivos || {};

  const puestosActivos = (() => {
    const builtin = ['cajero', 'encargado'];
    const custom  = Object.keys(permisos).filter(k => permisos[k]?._custom === true);
    return [...builtin, ...custom]
      .filter(k => permisos[k]?.enabled === true)
      .map(k => ({
        rol:    k,
        label:  permisos[k]._label || (k === 'cajero' ? 'Cajero' : k === 'encargado' ? 'Encargado' : k),
        nombre: permisos[k].nombre || '',
        pin:    permisos[k].pin    || null,
        pinSet: permisos[k].pin_set === true,
      }));
  })();

  // ── Estado modal PIN de empleado ──────────────────────────────────────
  const [modalPin, setModalPin]           = useState(false);
  const [pinInput, setPinInput]           = useState('');
  const [pinError, setPinError]           = useState(false);
  const [puestoElegido, setPuestoElegido] = useState(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  // ── Estado modal contraseña admin ─────────────────────────────────────
  const [modalAdmin, setModalAdmin]         = useState(false);
  const [adminPassword, setAdminPassword]   = useState('');
  const [adminError, setAdminError]         = useState('');
  const [verificandoAdmin, setVerificandoAdmin] = useState(false);
  const [pedirPasswordActivo, setPedirPasswordActivo] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('pedir_password_inicio').then(v => {
      setPedirPasswordActivo(v !== 'false');
    });
  }, []);

  // ── Seleccionar empleado ───────────────────────────────────────────────
  async function elegirPuesto(p) {
    if (p.pinSet && p.pin) {
      setPuestoElegido(p);
      setPinInput('');
      setPinError(false);
      setModalPin(true);
    } else {
      seleccionarPerfil(p.rol, p.nombre);
    }
  }

  async function confirmarPin() {
    if (!pinInput || !puestoElegido) return;
    setVerificandoPin(true);
    try {
      const result = await api.verifyProfilePin(puestoElegido.rol, pinInput);
      if (result.valid) {
        setModalPin(false);
        seleccionarPerfil(puestoElegido.rol, puestoElegido.nombre);
      } else {
        setPinError(true);
        setPinInput('');
      }
    } catch {
      Alert.alert('Error', 'No se pudo verificar el PIN. Verifica tu conexión a internet.');
    } finally {
      setVerificandoPin(false);
    }
  }

  // ── Seleccionar admin ──────────────────────────────────────────────────
  function elegirAdmin() {
    if (pedirPasswordActivo) {
      setAdminPassword('');
      setAdminError('');
      setModalAdmin(true);
    } else {
      seleccionarPerfil('dueno', '');
    }
  }

  async function confirmarPasswordAdmin() {
    if (!adminPassword) return;
    setVerificandoAdmin(true);
    setAdminError('');
    try {
      await verificarPasswordAdmin(adminPassword);
      setModalAdmin(false);
      seleccionarPerfil('dueno', '');
    } catch (e) {
      setAdminError(e.message?.includes('401') || e.message?.toLowerCase().includes('invalid')
        ? 'Contraseña incorrecta.'
        : (e.message || 'Error al verificar la contraseña.'));
      setAdminPassword('');
    } finally {
      setVerificandoAdmin(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="person-circle-outline" size={52} color={colors.primary} />
          <Text style={styles.title}>¿Quién está usando la app?</Text>
          <Text style={styles.subtitle}>Selecciona tu perfil para continuar</Text>
        </View>

        <View style={styles.list}>
          {puestosActivos.map(p => (
            <TouchableOpacity key={p.rol} style={styles.card} onPress={() => elegirPuesto(p)}>
              <View style={styles.cardLeft}>
                <Ionicons name="person-outline" size={26} color={colors.primary} />
                <View>
                  <Text style={styles.cardLabel}>{p.label}</Text>
                  {p.nombre
                    ? <Text style={styles.cardNombre}>{p.nombre}</Text>
                    : <Text style={styles.cardNombreMuted}>Sin nombre asignado</Text>
                  }
                </View>
              </View>
              <View style={styles.cardRight}>
                {p.pinSet && <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={{ marginRight: spacing.xs }} />}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[styles.card, styles.cardAdmin]} onPress={elegirAdmin}>
            <View style={styles.cardLeft}>
              <Ionicons name="shield-checkmark-outline" size={26} color={colors.textSecondary} />
              <View>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Administrador</Text>
                <Text style={styles.cardNombreMuted}>Acceso completo</Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              {pedirPasswordActivo && <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} style={{ marginRight: spacing.xs }} />}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={logout} style={styles.btnCerrarSesion}>
            <Text style={styles.btnCerrarSesionText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal PIN de empleado */}
      <Modal visible={modalPin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalPin(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ingresar PIN</Text>
              <TouchableOpacity onPress={() => setModalPin(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.xl }}>
              {puestoElegido && (
                <Text style={styles.pinSubtitle}>
                  PIN de <Text style={{ fontWeight: '800', color: colors.textPrimary }}>
                    {puestoElegido.nombre || puestoElegido.label}
                  </Text>
                </Text>
              )}
              <TextInput
                style={[styles.pinInput, pinError && styles.pinInputError]}
                value={pinInput}
                onChangeText={v => { setPinInput(v); setPinError(false); }}
                placeholder="••••"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                autoFocus
              />
              {pinError && <Text style={styles.errorText}>PIN incorrecto. Inténtalo de nuevo.</Text>}
              <TouchableOpacity
                style={[styles.btnConfirmar, { opacity: verificandoPin || !pinInput ? 0.6 : 1 }]}
                onPress={confirmarPin}
                disabled={verificandoPin || !pinInput}
              >
                {verificandoPin ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnConfirmarText}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal contraseña admin */}
      <Modal visible={modalAdmin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalAdmin(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contraseña del administrador</Text>
              <TouchableOpacity onPress={() => setModalAdmin(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.xl }}>
              {sessionEmail ? (
                <Text style={styles.pinSubtitle}>
                  Cuenta: <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{sessionEmail}</Text>
                </Text>
              ) : null}
              <TextInput
                style={[styles.pinInput, { letterSpacing: 2, fontSize: font.xl }, adminError && styles.pinInputError]}
                value={adminPassword}
                onChangeText={v => { setAdminPassword(v); setAdminError(''); }}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={confirmarPasswordAdmin}
              />
              {adminError ? <Text style={styles.errorText}>{adminError}</Text> : null}
              <TouchableOpacity
                style={[styles.btnConfirmar, { opacity: verificandoAdmin || !adminPassword ? 0.6 : 1 }]}
                onPress={confirmarPasswordAdmin}
                disabled={verificandoAdmin || !adminPassword}
              >
                {verificandoAdmin ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnConfirmarText}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: colors.background },
  content:            { padding: spacing.lg, paddingTop: spacing.xxl },
  header:             { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  title:              { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  subtitle:           { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
  list:               { gap: spacing.sm },
  card:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardAdmin:          { opacity: 0.75 },
  cardLeft:           { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  cardRight:          { flexDirection: 'row', alignItems: 'center' },
  cardLabel:          { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  cardNombre:         { fontSize: font.sm, color: colors.primary, fontWeight: '600', marginTop: 2 },
  cardNombreMuted:    { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  btnCerrarSesion:    { alignItems: 'center', padding: spacing.md, marginTop: spacing.sm },
  btnCerrarSesionText:{ color: colors.textMuted, fontSize: font.sm },
  dragHandleWrap:     { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:         { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  pinSubtitle:        { fontSize: font.md, color: colors.textSecondary, marginBottom: spacing.lg },
  pinInput:           { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 32, fontWeight: '800', color: colors.textPrimary, backgroundColor: colors.surface, textAlign: 'center', letterSpacing: 8 },
  pinInputError:      { borderColor: colors.danger },
  errorText:          { color: colors.danger, fontSize: font.sm, marginTop: spacing.xs, textAlign: 'center' },
  btnConfirmar:       { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnConfirmarText:   { color: '#fff', fontSize: font.lg, fontWeight: '700' },
});
