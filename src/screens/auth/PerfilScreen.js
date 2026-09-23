import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cabecera, Icono, IconoEnCuadro } from '../../components/ui';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  verificarPinPuesto, pinBloqueado, minutosBloqueoPin,
  registrarFalloPin, resetFallosPin,
} from '../../offline/credenciales';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';

export default function PerfilScreen() {
  const { permisosRolesEfectivos, seleccionarPerfil, verificarPasswordAdmin, sessionEmail, logout } = useAuth();
  const { online } = useNetwork();
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

  // El PIN se verifica contra el servidor y, si no hay red, contra los hashes
  // cacheados (offline/credenciales.js). Sin ese fallback el cajero llegaba hasta
  // aquí sin conexión y no podía pasar: la app se quedaba sin caja.
  async function confirmarPin() {
    if (!pinInput || !puestoElegido) return;
    if (pinBloqueado()) {
      Alert.alert('Bloqueado', `Demasiados intentos. Espera ${minutosBloqueoPin()} minutos.`);
      return;
    }
    setVerificandoPin(true);
    try {
      const { valido } = await verificarPinPuesto(puestoElegido.rol, pinInput, permisos);
      if (valido) {
        resetFallosPin();
        setModalPin(false);
        seleccionarPerfil(puestoElegido.rol, puestoElegido.nombre);
      } else {
        registrarFalloPin();
        setPinError(true);
        setPinInput('');
        if (pinBloqueado()) {
          Alert.alert('Bloqueado', 'Demasiados intentos. Espera 5 minutos.');
        }
      }
    } catch {
      Alert.alert('Error', 'No se pudo verificar el PIN. Inténtalo de nuevo.');
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
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Cabecera azul noche (diseño A) */}
      <Cabecera titulo="¿Quién está usando la app?" subtitulo="Selecciona tu perfil para continuar" />
      <ScrollView contentContainerStyle={styles.content}>

        {!online && (
          <View style={styles.avisoOffline}>
            <Icono nombre="cloud-offline-outline" size={18} color={zc.ambar} />
            <Text style={styles.avisoOfflineText}>
              Sin conexión. Se usan los puestos y el PIN guardados en este equipo; la
              comprobación puede tardar un momento.
            </Text>
          </View>
        )}

        <View style={styles.list}>
          {puestosActivos.map(p => (
            <TouchableOpacity key={p.rol} style={styles.card} onPress={() => elegirPuesto(p)}>
              <View style={styles.cardLeft}>
                <IconoEnCuadro nombre="person-outline" tono="azul" size={42} />
                <View>
                  <Text style={styles.cardLabel}>{p.label}</Text>
                  {p.nombre
                    ? <Text style={styles.cardNombre}>{p.nombre}</Text>
                    : <Text style={styles.cardNombreMuted}>Sin nombre asignado</Text>
                  }
                </View>
              </View>
              <View style={styles.cardRight}>
                {p.pinSet && <Icono nombre="lock-closed-outline" size={16} color={zc.grisSuave} style={{ marginRight: spacing.xs }} />}
                <Icono nombre="chevron-forward" size={18} color={zc.flecha} />
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[styles.card, styles.cardAdmin]} onPress={elegirAdmin}>
            <View style={styles.cardLeft}>
              <IconoEnCuadro nombre="shield-checkmark-outline" tono="gris" size={42} />
              <View>
                <Text style={styles.cardLabel}>Administrador</Text>
                <Text style={styles.cardNombreMuted}>Acceso completo</Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              {pedirPasswordActivo && <Icono nombre="lock-closed-outline" size={16} color={zc.grisSuave} style={{ marginRight: spacing.xs }} />}
              <Icono nombre="chevron-forward" size={18} color={zc.flecha} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={logout} style={styles.btnCerrarSesion}>
            <Text style={styles.btnCerrarSesionText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal PIN de empleado */}
      <Modal visible={modalPin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalPin(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ingresar PIN</Text>
              <TouchableOpacity onPress={() => setModalPin(false)}>
                <Icono nombre="close" size={24} color={zc.gris} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.xl }}>
              {puestoElegido && (
                <Text style={styles.pinSubtitle}>
                  PIN de <Text style={{ fontWeight: '500', color: zc.tinta }}>
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
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contraseña del administrador</Text>
              <TouchableOpacity onPress={() => setModalAdmin(false)}>
                <Icono nombre="close" size={24} color={zc.gris} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.xl }}>
              {sessionEmail ? (
                <Text style={styles.pinSubtitle}>
                  Cuenta: <Text style={{ fontWeight: '500', color: zc.tinta }}>{sessionEmail}</Text>
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

const caja = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: zc.fondo },
  content:            { padding: 14, paddingTop: 16 },
  list:               { gap: 10 },
  avisoOffline:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: zc.ambarSuave, borderRadius: radios.tarjeta, padding: 14, marginBottom: 12 },
  avisoOfflineText:   { flex: 1, fontSize: 13.5, color: zc.ambarTexto, lineHeight: 19 },
  card:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...caja, padding: 14 },
  cardAdmin:          {},
  cardLeft:           { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardRight:          { flexDirection: 'row', alignItems: 'center' },
  cardLabel:          { fontSize: 15.5, fontWeight: '500', color: zc.tinta },
  cardNombre:         { fontSize: 13.5, color: zc.azul, marginTop: 2 },
  cardNombreMuted:    { fontSize: 13.5, color: zc.grisSuave, marginTop: 2 },
  btnCerrarSesion:    { alignItems: 'center', padding: spacing.md, marginTop: spacing.sm },
  btnCerrarSesionText:{ color: zc.gris, fontSize: 14 },
  dragHandleWrap:     { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d5dae2' },
  modalSafe:          { flex: 1, backgroundColor: zc.fondo },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  modalTitle:         { fontSize: 19, fontWeight: '500', color: zc.tinta },
  pinSubtitle:        { fontSize: 15, color: zc.gris, marginBottom: spacing.lg },
  pinInput:           { borderWidth: 1.5, borderColor: zc.linea, borderRadius: radios.boton, padding: 14, fontSize: 30, fontWeight: '700', color: zc.tinta, backgroundColor: zc.tarjeta, textAlign: 'center', letterSpacing: 8 },
  pinInputError:      { borderColor: zc.rojo },
  errorText:          { color: zc.rojo, fontSize: 13.5, marginTop: 6, textAlign: 'center' },
  btnConfirmar:       { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 15, alignItems: 'center', marginTop: spacing.xl },
  btnConfirmarText:   { color: '#fff', fontSize: 16, fontWeight: '500' },
});
