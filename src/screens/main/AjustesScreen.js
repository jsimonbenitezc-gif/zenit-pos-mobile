import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Modal, TextInput, ActivityIndicator, Switch, Platform,
  RefreshControl, KeyboardAvoidingView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import {
  isPrinterAvailable,
  getPairedDevices,
  connectPrinter,
  disconnectPrinter,
  printTest,
} from '../../utils/printer';

// ─── Constantes ──────────────────────────────────────────────────────────────

const ROL_LABEL = { owner: 'Dueño', cashier: 'Cajero', waiter: 'Mesero', delivery: 'Repartidor' };
const PLAN_LABEL = { free: 'Gratuito', premium: 'Premium', trial: 'Prueba' };
const PLAN_COLOR = { free: colors.textMuted, premium: '#f59e0b', trial: colors.primary };
const MONEDAS = ['$', '€', 'Q', 'S/', '₡'];

// ─── Componentes pequeños ─────────────────────────────────────────────────────

function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function SectionCard({ children }) {
  return <View style={styles.section}>{children}</View>;
}


function MenuItem({ label, sub, onPress, danger, rightText, last }) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, !last && styles.menuItemBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {rightText
        ? <Text style={styles.menuRight}>{rightText}</Text>
        : <Text style={styles.menuChevron}>›</Text>
      }
    </TouchableOpacity>
  );
}

function SwitchRow({ label, sub, value, onChange, last }) {
  return (
    <View style={[styles.menuItem, !last && styles.menuItemBorder]}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? '#fff' : '#f4f3f4') : undefined}
      />
    </View>
  );
}

function FieldRow({ label, value, onChangeText, placeholder, keyboardType, last }) {
  return (
    <View style={[styles.fieldRow, !last && styles.menuItemBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ''}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function AjustesScreen({ navigation }) {
  const { user, isOwner, logout, refreshUser } = useAuth();
  const plan      = user?.plan || 'free';
  const isPremium = plan === 'premium' || plan === 'trial';

  // ── Estado: carga ──────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [recargandoPlan, setRecargandoPlan] = useState(false);

  // ── Estado: ajustes del negocio (backend) ──────────────────────────────
  const [nombre, setNombre]       = useState('');
  const [telefono, setTelefono]   = useState('');
  const [direccion, setDireccion] = useState('');
  const [savingNegocio, setSavingNegocio] = useState(false);

  // ── Estado: ticket ─────────────────────────────────────────────────────
  const [moneda, setMoneda]           = useState('$');
  const [showPhone, setShowPhone]     = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showLogo, setShowLogo]       = useState(true);
  const [logoBase64, setLogoBase64]   = useState('');
  const [savingLogo, setSavingLogo]   = useState(false);

  // ── Estado: preferencias locales ──────────────────────────────────────
  const [mostrarStock, setMostrarStock]                   = useState(false);
  const [ventaSinTurno, setVentaSinTurno]                 = useState(true);
  const [requierePinDesc, setRequierePinDesc]             = useState(false);
  const [pinDescuentos, setPinDescuentos]                 = useState('');

  // ── Estado: puntos de lealtad (backend) ───────────────────────────────
  const [puntosActivos, setPuntosActivos]   = useState(false);
  const [puntosPorPeso, setPuntosPorPeso]   = useState('0.1');
  const [puntosBono, setPuntosBono]         = useState('0');
  const [puntosValor, setPuntosValor]       = useState('0.10');
  const [savingPuntos, setSavingPuntos]     = useState(false);

  // ── Estado: sucursal (backend) ────────────────────────────────────────
  const [branches, setBranches]   = useState([]);
  const [sucursalId, setSucursalId] = useState(null);
  const [savingSucursal, setSavingSucursal] = useState(false);

  // ── Estado: impresora Bluetooth ───────────────────────────────────────
  const [printerAddress, setPrinterAddress] = useState('');
  const [printerName, setPrinterName]       = useState('');
  const [modalPrinter, setModalPrinter]     = useState(false);
  const [scannedDevices, setScannedDevices] = useState([]);
  const [scanning, setScanning]             = useState(false);
  const [connecting, setConnecting]         = useState('');
  const [testingPrint, setTestingPrint]     = useState(false);

  // ── Estado: cambiar contraseña ────────────────────────────────────────
  const [modalPassword, setModalPassword] = useState(false);
  const [passActual, setPassActual]       = useState('');
  const [passNueva, setPassNueva]         = useState('');
  const [passConfirm, setPassConfirm]     = useState('');
  const [savingPass, setSavingPass]       = useState(false);

  // ── Estado: sucursal picker ───────────────────────────────────────────
  const [modalSucursal, setModalSucursal]           = useState(false);
  const [modalNuevaSucursal, setModalNuevaSucursal] = useState(false);
  const [nuevaSucursalNombre, setNuevaSucursalNombre] = useState('');
  const [nuevaSucursalDir, setNuevaSucursalDir]     = useState('');
  const [nuevaSucursalTel, setNuevaSucursalTel]     = useState('');
  const [cloneOfertas, setCloneOfertas]             = useState(true);
  const [cloneIngredientes, setCloneIngredientes]   = useState(false);
  const [guardandoSucursal, setGuardandoSucursal]   = useState(false);
  // ── Estado: editar sucursal ──────────────────────────────────────────
  const [modalEditarSucursal, setModalEditarSucursal] = useState(false);
  const [editBranch, setEditBranch]                 = useState(null); // { id, name, address, phone }
  const [editNombre, setEditNombre]                 = useState('');
  const [editDir, setEditDir]                       = useState('');
  const [editTel, setEditTel]                       = useState('');
  const [guardandoEditar, setGuardandoEditar]       = useState(false);

  // ─────────────────────────────────────────────────────────────────────
  // Carga inicial
  // ─────────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    // Ajustes del backend
    try {
      const s = await api.getSettings();
      if (s) {
        setNombre(s.business_name || '');
        setTelefono(s.business_phone || '');
        setDireccion(s.business_address || '');
        setMoneda(s.currency_symbol || '$');
        setShowPhone(s.show_phone !== false);
        setShowAddress(s.show_address !== false);
        setShowLogo(s.show_logo !== false);
        setLogoBase64(s.logo_base64 || '');
        setPuntosActivos(!!s.puntos_activos);
        setPuntosPorPeso(String(s.puntos_por_peso ?? '0.1'));
        setPuntosBono(String(s.puntos_bono_pedido ?? '0'));
        setPuntosValor(String(s.puntos_valor ?? '0.10'));
        setSucursalId(s.sucursal_id || null);
      }
    } catch { /* sin conexión: continuar con valores por defecto */ }

    // Sucursales (todos los dueños — para poder seleccionar sucursal aunque sea plan free)
    if (isOwner) {
      try {
        const bs = await api.getBranches();
        setBranches(bs || []);
      } catch {}
    }

    // Ajustes locales (SecureStore)
    const [pAddr, pName, stock, sinTurno, pinReq, pin] = await Promise.all([
      SecureStore.getItemAsync('printer_address'),
      SecureStore.getItemAsync('printer_name'),
      SecureStore.getItemAsync('mostrar_stock'),
      SecureStore.getItemAsync('venta_sin_turno'),
      SecureStore.getItemAsync('requiere_pin_descuentos'),
      SecureStore.getItemAsync('pin_descuentos'),
    ]);
    setPrinterAddress(pAddr || '');
    setPrinterName(pName || '');
    setMostrarStock(stock === 'true');
    setVentaSinTurno(sinTurno !== 'false');
    setRequierePinDesc(pinReq === 'true');
    setPinDescuentos(pin || '');

    setLoading(false);
    setRefreshing(false);
  }, [isOwner, plan]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─────────────────────────────────────────────────────────────────────
  // Guardar ajustes del negocio
  // ─────────────────────────────────────────────────────────────────────

  async function guardarNegocio() {
    setSavingNegocio(true);
    try {
      await api.updateSettings({
        business_name: nombre.trim(),
        business_phone: telefono.trim(),
        business_address: direccion.trim(),
      });
      Alert.alert('Guardado', 'Información del negocio actualizada.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingNegocio(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Guardar ajustes de ticket (toggle inmediato)
  // ─────────────────────────────────────────────────────────────────────

  async function cambiarMoneda(m) {
    setMoneda(m);
    try { await api.updateSettings({ currency_symbol: m }); } catch {}
  }

  async function toggleShowPhone(val) {
    setShowPhone(val);
    try { await api.updateSettings({ show_phone: val }); } catch {}
  }

  async function toggleShowAddress(val) {
    setShowAddress(val);
    try { await api.updateSettings({ show_address: val }); } catch {}
  }

  async function toggleShowLogo(val) {
    setShowLogo(val);
    try { await api.updateSettings({ show_logo: val }); } catch {}
  }

  async function seleccionarLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar el logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const b64 = result.assets[0].base64;
    setSavingLogo(true);
    try {
      await api.updateSettings({ logo_base64: b64 });
      setLogoBase64(b64);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el logo: ' + e.message);
    } finally {
      setSavingLogo(false);
    }
  }

  async function checkForUpdates() {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert('Actualización disponible', '¿Descargar e instalar ahora?', [
          { text: 'Después', style: 'cancel' },
          { text: 'Instalar', onPress: async () => {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }},
        ]);
      } else {
        Alert.alert('Todo al día', 'Tienes la versión más reciente de Zenit POS.');
      }
    } catch {
      Alert.alert('Sin actualizaciones', 'No se pudo verificar (normal en modo desarrollo).');
    }
  }

  async function quitarLogo() {
    Alert.alert('Quitar logo', '¿Eliminar el logo del ticket?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        setSavingLogo(true);
        try {
          await api.updateSettings({ logo_base64: '' });
          setLogoBase64('');
        } catch (e) {
          Alert.alert('Error', e.message);
        } finally {
          setSavingLogo(false);
        }
      }},
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Guardar preferencias locales (SecureStore)
  // ─────────────────────────────────────────────────────────────────────

  async function toggleMostrarStock(val) {
    setMostrarStock(val);
    await SecureStore.setItemAsync('mostrar_stock', val ? 'true' : 'false');
  }

  async function toggleVentaSinTurno(val) {
    setVentaSinTurno(val);
    await SecureStore.setItemAsync('venta_sin_turno', val ? 'true' : 'false');
  }

  async function toggleRequierePinDesc(val) {
    setRequierePinDesc(val);
    await SecureStore.setItemAsync('requiere_pin_descuentos', val ? 'true' : 'false');
    if (!val) {
      setPinDescuentos('');
      await SecureStore.deleteItemAsync('pin_descuentos');
    }
  }

  async function guardarPinDescuentos() {
    if (pinDescuentos.length < 4) {
      Alert.alert('PIN muy corto', 'El PIN debe tener al menos 4 dígitos.');
      return;
    }
    await SecureStore.setItemAsync('pin_descuentos', pinDescuentos);
    Alert.alert('Guardado', 'PIN de descuentos guardado.');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Sistema de puntos
  // ─────────────────────────────────────────────────────────────────────

  async function guardarPuntos() {
    const pp = parseFloat(puntosPorPeso);
    const pb = parseInt(puntosBono, 10);
    const pv = parseFloat(puntosValor);
    if (isNaN(pp) || isNaN(pb) || isNaN(pv)) {
      Alert.alert('Valores inválidos', 'Verifica que los campos sean números válidos.');
      return;
    }
    setSavingPuntos(true);
    try {
      await api.updateSettings({
        puntos_activos: puntosActivos,
        puntos_por_peso: pp,
        puntos_bono_pedido: pb,
        puntos_valor: pv,
      });
      Alert.alert('Guardado', 'Configuración de puntos actualizada.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPuntos(false);
    }
  }

  async function togglePuntosActivos(val) {
    setPuntosActivos(val);
    try { await api.updateSettings({ puntos_activos: val }); } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────
  // Sucursal
  // ─────────────────────────────────────────────────────────────────────

  async function seleccionarSucursal(id) {
    setSucursalId(id);
    setModalSucursal(false);
    setSavingSucursal(true);
    try {
      await api.updateSettings({ sucursal_id: id });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingSucursal(false);
    }
  }

  const sucursalActual = branches.find(b => b.id === sucursalId);

  function abrirNuevaSucursal() {
    setNuevaSucursalNombre('');
    setNuevaSucursalDir('');
    setNuevaSucursalTel('');
    setCloneOfertas(true);
    setCloneIngredientes(false);
    setModalNuevaSucursal(true);
  }

  async function guardarNuevaSucursal() {
    if (!nuevaSucursalNombre.trim()) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para la sucursal.');
      return;
    }
    setGuardandoSucursal(true);
    try {
      const clone_options = [
        cloneOfertas      && 'offers',
        cloneIngredientes && 'ingredients',
      ].filter(Boolean);
      const created = await api.createBranch({
        name:         nuevaSucursalNombre.trim(),
        address:      nuevaSucursalDir.trim() || undefined,
        phone:        nuevaSucursalTel.trim() || undefined,
        clone_options,
      });
      setBranches(prev => [...prev, created]);
      setModalNuevaSucursal(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardandoSucursal(false);
    }
  }

  function abrirEditarSucursal(b) {
    setEditBranch(b);
    setEditNombre(b.name || '');
    setEditDir(b.address || '');
    setEditTel(b.phone || '');
    setModalEditarSucursal(true);
  }

  async function guardarEditarSucursal() {
    if (!editNombre.trim()) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para la sucursal.');
      return;
    }
    setGuardandoEditar(true);
    try {
      const updated = await api.updateBranch(editBranch.id, {
        name:    editNombre.trim(),
        address: editDir.trim() || undefined,
        phone:   editTel.trim() || undefined,
      });
      setBranches(prev => prev.map(b => b.id === editBranch.id ? { ...b, ...updated } : b));
      setModalEditarSucursal(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardandoEditar(false);
    }
  }

  async function eliminarSucursal(branch) {
    Alert.alert('Eliminar sucursal', `¿Eliminar "${branch.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteBranch(branch.id);
          setBranches(prev => prev.filter(b => b.id !== branch.id));
          if (sucursalId === branch.id) {
            setSucursalId(null);
            try { await api.updateSettings({ sucursal_id: null }); } catch {}
          }
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Impresora Bluetooth
  // ─────────────────────────────────────────────────────────────────────

  async function abrirBusquedaImpresoras() {
    if (!isPrinterAvailable()) {
      Alert.alert(
        'No disponible',
        'La impresión Bluetooth requiere una compilación personalizada con EAS Build. No funciona en Expo Go.',
      );
      return;
    }
    setScannedDevices([]);
    setModalPrinter(true);
    setScanning(true);
    try {
      const devices = await getPairedDevices();
      setScannedDevices(devices);
    } catch (e) {
      Alert.alert('Error al buscar', e.message);
    } finally {
      setScanning(false);
    }
  }

  async function seleccionarImpresora(device) {
    setConnecting(device.address);
    try {
      // Verificar que la impresora responde antes de guardarla
      await connectPrinter(device.address);
      await disconnectPrinter(device.address);
      await SecureStore.setItemAsync('printer_address', device.address);
      await SecureStore.setItemAsync('printer_name', device.name);
      setPrinterAddress(device.address);
      setPrinterName(device.name);
      setModalPrinter(false);
      Alert.alert('Conectado', `Impresora "${device.name}" configurada.`);
    } catch (e) {
      Alert.alert('Error al conectar', e.message);
    } finally {
      setConnecting('');
    }
  }

  async function imprimirPrueba() {
    if (!isPrinterAvailable()) {
      Alert.alert('No disponible', 'La impresión Bluetooth requiere EAS Build.');
      return;
    }
    if (!printerAddress) {
      Alert.alert('Sin impresora', 'Primero selecciona una impresora Bluetooth.');
      return;
    }
    setTestingPrint(true);
    try {
      await printTest(printerAddress, nombre || 'Mi Negocio', moneda);
    } catch (e) {
      Alert.alert('Error al imprimir', e.message);
    } finally {
      setTestingPrint(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Cambiar contraseña
  // ─────────────────────────────────────────────────────────────────────

  function abrirCambioPassword() {
    setPassActual(''); setPassNueva(''); setPassConfirm('');
    setModalPassword(true);
  }

  async function guardarPassword() {
    if (!passActual.trim() || !passNueva.trim()) {
      Alert.alert('Campos requeridos', 'Completa todos los campos.');
      return;
    }
    if (passNueva !== passConfirm) {
      Alert.alert('No coinciden', 'La nueva contraseña y su confirmación no son iguales.');
      return;
    }
    if (passNueva.length < 6) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 6 caracteres.');
      return;
    }
    setSavingPass(true);
    try {
      await api.changePassword(passActual, passNueva);
      setModalPassword(false);
      Alert.alert('Listo', 'Contraseña actualizada correctamente.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPass(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Cerrar sesión
  // ─────────────────────────────────────────────────────────────────────

  function confirmarCerrarSesion() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
      >
        <Text style={styles.title}>Ajustes</Text>

        {/* ── Tarjeta de perfil ─────────────────────────────────────── */}
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
              <Text style={[styles.planBadgeText, { color: PLAN_COLOR[plan] }]}>
                {PLAN_LABEL[plan] || plan}
              </Text>
            </View>
          )}
        </View>

        {/* ── Mi Negocio ────────────────────────────────────────────── */}
        <SectionTitle label="Mi Negocio" />
        <SectionCard>
          <FieldRow
            label="Nombre"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Nombre de tu negocio"
          />
          <FieldRow
            label="Teléfono"
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Ej: 555-123-4567"
            keyboardType="phone-pad"
          />
          <FieldRow
            label="Dirección"
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Ej: Calle 5, Col. Centro"
            last
          />
        </SectionCard>
        <TouchableOpacity
          style={[styles.btnSave, savingNegocio && { opacity: 0.7 }]}
          onPress={guardarNegocio}
          disabled={savingNegocio}
        >
          {savingNegocio
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnSaveText}>Guardar información</Text>
          }
        </TouchableOpacity>

        {/* ── Apariencia y Ticket ───────────────────────────────────── */}
        <SectionTitle label="Apariencia y Ticket" />
        <SectionCard>
          {/* Logo del negocio */}
          <View style={[styles.menuItem, styles.menuItemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Logo del negocio</Text>
              <Text style={styles.menuSub}>
                {logoBase64 ? 'Logo cargado' : 'Sin logo — se usará el nombre del negocio'}
              </Text>
            </View>
            {logoBase64 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${logoBase64}` }}
                  style={styles.logoThumb}
                />
                <TouchableOpacity onPress={seleccionarLogo} disabled={savingLogo}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>
                    Cambiar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={quitarLogo} disabled={savingLogo}>
                  <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.sm }}>
                    Quitar
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={seleccionarLogo}
                disabled={savingLogo}
                style={styles.btnLogoAdd}
              >
                {savingLogo
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={styles.btnLogoAddText}>+ Agregar</Text>
                }
              </TouchableOpacity>
            )}
          </View>
          <SwitchRow
            label="Mostrar logo en ticket"
            sub={logoBase64 ? undefined : 'Agrega un logo primero'}
            value={showLogo && !!logoBase64}
            onChange={logoBase64 ? toggleShowLogo : undefined}
          />
          {/* Símbolo de moneda */}
          <View style={[styles.menuItem, styles.menuItemBorder]}>
            <Text style={styles.menuLabel}>Moneda</Text>
            <View style={styles.monedaRow}>
              {MONEDAS.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monedaBtn, moneda === m && styles.monedaBtnActive]}
                  onPress={() => cambiarMoneda(m)}
                >
                  <Text style={[styles.monedaBtnText, moneda === m && { color: '#fff' }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <SwitchRow
            label="Mostrar teléfono en ticket"
            value={showPhone}
            onChange={toggleShowPhone}
          />
          <SwitchRow
            label="Mostrar dirección en ticket"
            value={showAddress}
            onChange={toggleShowAddress}
          />
          <MenuItem
            label="Impresora Bluetooth"
            sub={printerName || 'Sin impresora seleccionada'}
            onPress={abrirBusquedaImpresoras}
          />
          <MenuItem
            label="Imprimir ticket de prueba"
            sub={printerAddress ? `Conectar a ${printerName}` : 'Selecciona una impresora primero'}
            onPress={imprimirPrueba}
            rightText={testingPrint ? '...' : undefined}
            last
          />
        </SectionCard>

        {/* ── Ajustes Generales ─────────────────────────────────────── */}
        <SectionTitle label="Ajustes Generales" />
        <SectionCard>
          <MenuItem
            label="Impresora predeterminada"
            sub={printerName || 'Sin impresora configurada'}
            onPress={abrirBusquedaImpresoras}
          />
          <SwitchRow
            label="Mostrar stock disponible"
            sub="Ver cuántas unidades hay al vender"
            value={mostrarStock}
            onChange={toggleMostrarStock}
          />
          <SwitchRow
            label="Permitir venta sin turno"
            sub="Registrar ventas sin abrir la caja"
            value={ventaSinTurno}
            onChange={toggleVentaSinTurno}
          />
          <SwitchRow
            label="PIN para aplicar descuentos"
            sub="Evita que cajeros apliquen descuentos solos"
            value={requierePinDesc}
            onChange={toggleRequierePinDesc}
            last={!requierePinDesc}
          />
          {requierePinDesc && (
            <View style={styles.pinRow}>
              <TextInput
                style={styles.pinInput}
                value={pinDescuentos}
                onChangeText={setPinDescuentos}
                placeholder="PIN (4–6 dígitos)"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
              />
              <TouchableOpacity style={styles.btnPinSave} onPress={guardarPinDescuentos}>
                <Text style={styles.btnPinSaveText}>Guardar PIN</Text>
              </TouchableOpacity>
            </View>
          )}
        </SectionCard>

        {/* ── Seguridad ─────────────────────────────────────────────── */}
        <SectionTitle label="Seguridad" />
        <SectionCard>
          <View style={[styles.menuItem, styles.menuItemBorder]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="cloud-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.menuLabel}>Respaldo automático</Text>
              </View>
              <Text style={styles.menuSub}>
                Tus datos están respaldados en la nube de forma automática. No se requiere acción manual.
              </Text>
            </View>
          </View>
          <MenuItem
            label="Verificar actualizaciones"
            sub={`Versión actual: 1.0.0`}
            onPress={checkForUpdates}
            last
          />
        </SectionCard>

        {/* ── Sistema de Puntos (solo dueño) ────────────────────────── */}
        {isOwner && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Sistema de Puntos</Text>
              {!isPremium && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="lock-closed" size={10} color="#b45309" />
                  <Text style={styles.premiumBadgeText}> Premium</Text>
                </View>
              )}
            </View>
            <SectionCard>
              <SwitchRow
                label="Activar programa de fidelidad"
                sub={isPremium ? 'Los clientes acumulan puntos por compras' : 'Función exclusiva del plan Premium'}
                value={isPremium ? puntosActivos : false}
                onChange={isPremium
                  ? togglePuntosActivos
                  : () => Alert.alert('Función Premium', 'Actualiza tu plan para activar el programa de puntos.')
                }
                last={!puntosActivos || !isPremium}
              />
              {isPremium && puntosActivos && (
                <>
                  <FieldRow
                    label="Puntos por cada $1"
                    value={puntosPorPeso}
                    onChangeText={setPuntosPorPeso}
                    placeholder="0.1"
                    keyboardType="decimal-pad"
                  />
                  <FieldRow
                    label="Puntos extra por pedido"
                    value={puntosBono}
                    onChangeText={setPuntosBono}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  <FieldRow
                    label="Valor de 1 punto (en pesos)"
                    value={puntosValor}
                    onChangeText={setPuntosValor}
                    placeholder="0.10"
                    keyboardType="decimal-pad"
                    last
                  />
                </>
              )}
            </SectionCard>
            {isPremium && puntosActivos && (
              <TouchableOpacity
                style={[styles.btnSave, savingPuntos && { opacity: 0.7 }]}
                onPress={guardarPuntos}
                disabled={savingPuntos}
              >
                {savingPuntos
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Guardar puntos</Text>
                }
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Sucursal (todos los dueños) ───────────────────────────── */}
        {isOwner && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Sucursal</Text>
              {!isPremium && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="lock-closed" size={10} color="#b45309" />
                  <Text style={styles.premiumBadgeText}> Premium</Text>
                </View>
              )}
            </View>
            <SectionCard>
              {isPremium ? (
                <>
                  <MenuItem
                    label="Sucursal de este dispositivo"
                    sub={savingSucursal ? 'Guardando...' : (sucursalActual?.name || 'Sin sucursal asignada')}
                    onPress={() => setModalSucursal(true)}
                  />
                  {branches.length === 0 ? (
                    <Text style={styles.emptySmall}>Aún no hay sucursales creadas</Text>
                  ) : (
                    branches.map(b => (
                      <View key={b.id} style={[styles.menuItem, styles.menuItemBorder]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.menuLabel}>{b.name}</Text>
                          {b.address ? <Text style={styles.menuSub}>{b.address}</Text> : null}
                          {b.phone   ? <Text style={styles.menuSub}>{b.phone}</Text>   : null}
                        </View>
                        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                          <TouchableOpacity onPress={() => abrirEditarSucursal(b)} style={styles.btnIconSmall}>
                            <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => eliminarSucursal(b)} style={styles.btnIconSmall}>
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                  <TouchableOpacity
                    style={[styles.menuItem, branches.length > 0 && styles.menuItemBorder]}
                    onPress={abrirNuevaSucursal}
                  >
                    <Text style={[styles.menuLabel, { color: colors.primary }]}>+ Nueva sucursal</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.menuItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>Gestión de sucursales</Text>
                    <Text style={styles.menuSub}>Disponible en el plan Premium</Text>
                  </View>
                </View>
              )}
            </SectionCard>
          </>
        )}

        {/* ── Pantalla de Cocina (KDS) ───────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs }}>
          <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Pantalla de Cocina</Text>
          {!isPremium && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>🔒 Premium</Text>
            </View>
          )}
        </View>
        <SectionCard>
          <MenuItem
            label="Abrir KDS"
            sub={isPremium ? 'Vista en tiempo real para el personal de cocina' : 'Función exclusiva del plan Premium'}
            onPress={isPremium
              ? () => navigation.navigate('KDS')
              : () => Alert.alert('Función Premium', 'Actualiza tu plan para usar la pantalla de cocina.')
            }
            last
          />
        </SectionCard>

        {/* ── Mi Plan (solo dueño) ──────────────────────────────────── */}
        {isOwner && (
          <>
            <SectionTitle label="Mi Plan" />
            <SectionCard>
              <View style={[styles.menuItem, styles.menuItemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>Plan actual</Text>
                  <Text style={styles.menuSub}>
                    {plan === 'premium'
                      ? `Premium${user?.plan_expires_at ? ' · expira ' + new Date(user.plan_expires_at).toLocaleDateString('es-MX') : ''}`
                      : plan === 'trial'
                        ? `Prueba gratuita${user?.plan_expires_at ? ' · expira ' + new Date(user.plan_expires_at).toLocaleDateString('es-MX') : ''}`
                        : 'Gratuito — funciones básicas'
                    }
                  </Text>
                </View>
                <View style={[styles.planBadge, { backgroundColor: PLAN_COLOR[plan] + '22', borderColor: PLAN_COLOR[plan] }]}>
                  <Text style={[styles.planBadgeText, { color: PLAN_COLOR[plan] }]}>
                    {PLAN_LABEL[plan] || plan}
                  </Text>
                </View>
              </View>
              <View style={[styles.menuItem, { justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={[styles.btnRecargar, recargandoPlan && { opacity: 0.6 }]}
                  disabled={recargandoPlan}
                  onPress={async () => {
                    setRecargandoPlan(true);
                    await refreshUser();
                    setRecargandoPlan(false);
                  }}
                >
                  <Text style={styles.btnRecargarText}>
                    {recargandoPlan ? 'Verificando...' : '↻ Recargar plan'}
                  </Text>
                </TouchableOpacity>
              </View>
              {plan === 'free' && (
                <View style={[styles.menuItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <Text style={[styles.menuSub, { marginBottom: spacing.sm }]}>
                    Premium incluye: Inventario · Ofertas · Sucursales · Puntos de fidelidad · KDS
                  </Text>
                  <TouchableOpacity
                    style={[styles.btnSave, { alignSelf: 'stretch' }]}
                    onPress={() => Alert.alert('Premium', 'Visita zenitpos.app para actualizar tu plan.')}
                  >
                    <Text style={styles.btnSaveText}>Ver planes Premium →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </SectionCard>
          </>
        )}

        {/* ── Cuenta ────────────────────────────────────────────────── */}
        <SectionTitle label="Cuenta" />
        <SectionCard>
          <MenuItem
            label="Cambiar contraseña"
            sub="Actualiza tu contraseña de acceso"
            onPress={abrirCambioPassword}
          />
          <MenuItem
            label="Cerrar sesión"
            danger
            onPress={confirmarCerrarSesion}
            last
          />
        </SectionCard>

        <Text style={styles.footer}>Zenit POS · Versión 1.0.0</Text>
      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Impresora Bluetooth
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Impresora Bluetooth</Text>
            <TouchableOpacity onPress={() => setModalPrinter(false)}>
              <Text style={styles.linkText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            {/* Dispositivo actual */}
            {printerName ? (
              <View style={styles.printerCurrentCard}>
                <Text style={styles.printerCurrentLabel}>Impresora actual</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons name="print-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.printerCurrentName}>{printerName}</Text>
                </View>
                <Text style={styles.menuSub}>{printerAddress}</Text>
              </View>
            ) : (
              <View style={styles.printerCurrentCard}>
                <Text style={styles.menuSub}>Sin impresora configurada</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>
              Dispositivos emparejados
            </Text>

            {scanning && (
              <View style={{ alignItems: 'center', padding: spacing.xl }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.menuSub, { marginTop: spacing.sm }]}>Buscando dispositivos...</Text>
              </View>
            )}

            {!scanning && scannedDevices.length === 0 && (
              <View style={styles.section}>
                <Text style={[styles.emptySmall, { textAlign: 'center' }]}>
                  No se encontraron dispositivos.{'\n'}Asegúrate de que la impresora esté encendida y emparejada en los ajustes de Bluetooth de tu teléfono.
                </Text>
              </View>
            )}

            {!scanning && scannedDevices.map(device => (
              <TouchableOpacity
                key={device.address}
                style={styles.deviceRow}
                onPress={() => seleccionarImpresora(device)}
                disabled={connecting === device.address}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>{device.name}</Text>
                  <Text style={styles.menuSub}>{device.address}</Text>
                </View>
                {connecting === device.address
                  ? <ActivityIndicator color={colors.primary} />
                  : <Text style={{ color: colors.primary, fontWeight: '700' }}>Conectar</Text>
                }
              </TouchableOpacity>
            ))}

            <Text style={[styles.menuSub, { textAlign: 'center', marginTop: spacing.xl }]}>
              ⚠️ Solo muestra dispositivos ya emparejados.{'\n'}
              Empareja tu impresora primero desde Bluetooth en Ajustes del sistema.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Cambiar contraseña
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalPassword} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cambiar contraseña</Text>
              <TouchableOpacity onPress={() => setModalPassword(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Contraseña actual *</Text>
              <TextInput
                style={styles.input}
                value={passActual}
                onChangeText={setPassActual}
                placeholder="Tu contraseña actual"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Nueva contraseña *</Text>
              <TextInput
                style={styles.input}
                value={passNueva}
                onChangeText={setPassNueva}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Confirmar nueva contraseña *</Text>
              <TextInput
                style={styles.input}
                value={passConfirm}
                onChangeText={setPassConfirm}
                placeholder="Repite la nueva contraseña"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.btnSave, { marginTop: spacing.xl }, savingPass && { opacity: 0.7 }]}
                onPress={guardarPassword}
                disabled={savingPass}
              >
                {savingPass
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Actualizar contraseña</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Nueva sucursal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalNuevaSucursal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva sucursal</Text>
              <TouchableOpacity onPress={() => setModalNuevaSucursal(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalNombre}
                onChangeText={setNuevaSucursalNombre}
                placeholder="Ej: Sucursal Centro"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Dirección (opcional)</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalDir}
                onChangeText={setNuevaSucursalDir}
                placeholder="Ej: Av. Principal 123"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Teléfono (opcional)</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalTel}
                onChangeText={setNuevaSucursalTel}
                placeholder="Ej: 55 1234 5678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>¿Qué datos copiar a esta sucursal?</Text>
              <Text style={[styles.menuSub, { marginBottom: spacing.sm }]}>
                Productos, categorías y clientes se comparten automáticamente entre todas las sucursales.
              </Text>
              <TouchableOpacity style={styles.checkRow} onPress={() => setCloneOfertas(v => !v)}>
                <View style={[styles.checkbox, cloneOfertas && styles.checkboxOn]}>
                  {cloneOfertas && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>Ofertas (descuentos y combos)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.checkRow} onPress={() => setCloneIngredientes(v => !v)}>
                <View style={[styles.checkbox, cloneIngredientes && styles.checkboxOn]}>
                  {cloneIngredientes && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>Ingredientes (sin stock)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSave, { marginTop: spacing.xl }, guardandoSucursal && { opacity: 0.7 }]}
                onPress={guardarNuevaSucursal}
                disabled={guardandoSucursal}
              >
                {guardandoSucursal
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Crear sucursal</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Editar sucursal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalEditarSucursal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar sucursal</Text>
              <TouchableOpacity onPress={() => setModalEditarSucursal(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={editNombre}
                onChangeText={setEditNombre}
                placeholder="Nombre de la sucursal"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Dirección (opcional)</Text>
              <TextInput
                style={styles.input}
                value={editDir}
                onChangeText={setEditDir}
                placeholder="Ej: Av. Principal 123"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Teléfono (opcional)</Text>
              <TextInput
                style={styles.input}
                value={editTel}
                onChangeText={setEditTel}
                placeholder="Ej: 55 1234 5678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={[styles.btnSave, { marginTop: spacing.xl }, guardandoEditar && { opacity: 0.7 }]}
                onPress={guardarEditarSucursal}
                disabled={guardandoEditar}
              >
                {guardandoEditar
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Guardar cambios</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Selector de sucursal
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalSucursal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar sucursal</Text>
            <TouchableOpacity onPress={() => setModalSucursal(false)}>
              <Text style={styles.linkText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            <Text style={[styles.menuSub, { marginBottom: spacing.lg }]}>
              Elige la sucursal que corresponde a este dispositivo.
            </Text>
            {/* Opción: sin sucursal */}
            <TouchableOpacity
              style={[styles.deviceRow, !sucursalId && { borderColor: colors.primary }]}
              onPress={() => seleccionarSucursal(null)}
            >
              <Text style={[styles.menuLabel, !sucursalId && { color: colors.primary }]}>
                Sin sucursal asignada
              </Text>
              {!sucursalId && <Text style={{ color: colors.primary }}>✓</Text>}
            </TouchableOpacity>
            {branches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.deviceRow, sucursalId === b.id && { borderColor: colors.primary }]}
                onPress={() => seleccionarSucursal(b.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, sucursalId === b.id && { color: colors.primary }]}>
                    {b.name}
                  </Text>
                  {b.address ? <Text style={styles.menuSub}>{b.address}</Text> : null}
                </View>
                {sucursalId === b.id && <Text style={{ color: colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.background },
  scroll:      { padding: spacing.lg, paddingBottom: spacing.xxl },
  title:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },

  // Perfil
  profileCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl, gap: spacing.md },
  avatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: '#fff', fontSize: font.xxl, fontWeight: '800' },
  profileName:   { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  profileRole:   { fontSize: font.sm, color: colors.primary, fontWeight: '600' },
  profileEmail:  { fontSize: font.sm - 1, color: colors.textMuted },
  planBadge:     { borderWidth: 1, borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  planBadgeText: { fontSize: font.sm - 1, fontWeight: '700' },

  // Secciones
  sectionTitle: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.xs },
  section:      { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm },
  divider:      { height: 1, backgroundColor: colors.border },

  // Filas de menú
  menuItem:       { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLabel:      { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  menuSub:        { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  menuRight:      { fontSize: font.sm, color: colors.textMuted },
  menuChevron:    { color: colors.textMuted, fontSize: 18 },

  // Filas de campo
  fieldRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  fieldLabel:  { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, width: 90 },
  fieldInput:  { flex: 1, fontSize: font.md, color: colors.textPrimary, paddingVertical: Platform.OS === 'ios' ? 4 : 0 },

  // Moneda
  monedaRow:       { flexDirection: 'row', gap: spacing.xs },
  monedaBtn:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.background },
  monedaBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  monedaBtnText:   { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },

  // PIN
  pinRow:        { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  pinInput:      { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  btnPinSave:    { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnPinSaveText:{ color: '#fff', fontSize: font.sm, fontWeight: '700' },

  // Botón guardar
  btnSave:         { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginBottom: spacing.lg },
  btnSaveText:     { color: '#fff', fontSize: font.md, fontWeight: '700' },
  btnRecargar:     { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnRecargarText: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '600' },
  btnIconSmall:    { padding: spacing.xs },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  checkbox:        { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn:      { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxCheck:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  checkLabel:      { fontSize: font.sm, color: colors.textPrimary, flex: 1 },

  emptySmall:      { color: colors.textMuted, fontSize: font.sm, padding: spacing.lg },

  // Impresora
  printerCurrentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  printerCurrentLabel:{ fontSize: font.sm, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.xs },
  printerCurrentName: { fontSize: font.lg, fontWeight: '700', color: colors.textPrimary },
  deviceRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm },

  // Modales
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:  { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  linkText:    { color: colors.primary, fontWeight: '700', fontSize: font.md },
  label:       { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  footer: { textAlign: 'center', color: colors.textMuted, fontSize: font.sm - 1, marginTop: spacing.xl },

  // Premium
  premiumBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  premiumBadgeText: { fontSize: font.sm - 2, fontWeight: '700', color: '#b45309' },

  // Logo
  logoThumb:    { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  btnLogoAdd:   { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  btnLogoAddText: { color: colors.primary, fontWeight: '700', fontSize: font.sm },
});
