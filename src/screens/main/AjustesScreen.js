import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Modal, TextInput, ActivityIndicator, Switch, Platform,
  RefreshControl, KeyboardAvoidingView, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import { createSSE } from '../../utils/sse';
import {
  isPrinterAvailable,
  getPairedDevices,
  connectPrinter,
  disconnectPrinter,
  printTest,
} from '../../utils/printer';
import {
  ROL_LABEL, PLAN_LABEL, PLAN_COLOR, MONEDAS, PERMISOS_DEFAULT,
  SectionTitle, SectionCard, MenuItem, SwitchRow, FieldRow,
} from './ajustes/shared';
import { SeccionPuestos } from './ajustes/SeccionPuestos';
import { SeccionPlan } from './ajustes/SeccionPlan';
import { SeccionNotificaciones } from './ajustes/SeccionNotificaciones';
import { SeccionSucursales } from './ajustes/SeccionSucursales';


// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function AjustesScreen({ navigation }) {
  const { user, settings, isOwner, logout, refreshUser, refreshSettings, rolActivo, nombreActivo, cambiarPerfil } = useAuth();
  const plan      = user?.plan || 'free';
  const isPremium = plan === 'premium' || plan === 'trial';

  // ── Estado: carga ──────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const cloudSettingsRef = useRef(null); // Settings crudos del API para pasar a sub-componentes

  // ── Estado: ajustes del negocio (backend) ──────────────────────────────
  const [nombre, setNombre]           = useState('');
  const [telefono, setTelefono]       = useState('');
  const [email, setEmail]             = useState('');
  const [website, setWebsite]         = useState('');
  const [rfc, setRfc]                 = useState('');
  const [instagram, setInstagram]     = useState('');
  const [ciudad, setCiudad]           = useState('');
  const [estado, setEstado]           = useState('');
  const [direccion, setDireccion]     = useState('');
  const [tipo, setTipo]               = useState('');
  const [savingNegocio, setSavingNegocio] = useState(false);

  // ── Estado: ticket ─────────────────────────────────────────────────────
  const [moneda, setMoneda]               = useState('$');
  const [showPhone, setShowPhone]         = useState(true);
  const [showAddress, setShowAddress]     = useState(true);
  const [showEmail, setShowEmail]         = useState(false);
  const [showWebsite, setShowWebsite]     = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);
  const [showRfc, setShowRfc]             = useState(false);
  const [ticketFooter, setTicketFooter]   = useState('');
  const [showLogo, setShowLogo]           = useState(true);
  const [logoBase64, setLogoBase64]       = useState('');
  const [savingLogo, setSavingLogo]       = useState(false);

  // ── SSE: ajustes en tiempo real ────────────────────────────────────────
  const fullPermisosRef     = useRef({});  // Estructura completa de permisos_roles (incluye __b_* keys)

  // ── Estado: preferencias locales ──────────────────────────────────────
  const [mostrarStock, setMostrarStock]                   = useState(false);
  const [ventaSinTurno, setVentaSinTurno]                 = useState(true);
  const [requierePinDesc, setRequierePinDesc]             = useState(false);
  const [pinDescuentos, setPinDescuentos]                 = useState('');
  const [pedirPasswordInicio, setPedirPasswordInicio]     = useState(true); // default activo

  // ── Estado: puntos de lealtad (backend) ───────────────────────────────
  const [puntosActivos, setPuntosActivos]   = useState(false);
  const [puntosPorPeso, setPuntosPorPeso]   = useState('0.1');
  const [puntosBono, setPuntosBono]         = useState('0');
  const [puntosValor, setPuntosValor]       = useState('0.10');
  const [savingPuntos, setSavingPuntos]     = useState(false);

  // ── Estado: sucursal (backend) ────────────────────────────────────────
  const [branches, setBranches]   = useState([]);
  const [sucursalId, setSucursalId] = useState(null);

  // ── Estado: impresora Bluetooth ───────────────────────────────────────
  const [printerAddress, setPrinterAddress] = useState('');
  const [printerName, setPrinterName]       = useState('');
  const [modalPrinter, setModalPrinter]     = useState(false);
  const [scannedDevices, setScannedDevices] = useState([]);
  const [scanning, setScanning]             = useState(false);
  const [connecting, setConnecting]         = useState('');
  const [testingPrint, setTestingPrint]     = useState(false);

  // ── Estado: administrar puestos ───────────────────────────────────────
  const [permisosRoles, setPermisosRoles] = useState(null);   // null = aún cargando

  // ── Estado: cambiar contraseña ────────────────────────────────────────
  const [modalPassword, setModalPassword] = useState(false);
  const [passActual, setPassActual]       = useState('');
  const [passNueva, setPassNueva]         = useState('');
  const [passConfirm, setPassConfirm]     = useState('');
  const [savingPass, setSavingPass]       = useState(false);


  // ─────────────────────────────────────────────────────────────────────
  // Carga inicial
  // ─────────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    // Ajustes del backend
    let _cloudVentaSinTurno = undefined; // undefined = no disponible en nube
    try {
      const s = await api.getSettings();
      if (s) {
        cloudSettingsRef.current = s;
        setNombre(s.business_name || '');
        setTelefono(s.business_phone || '');
        setEmail(s.business_email || '');
        setWebsite(s.business_website || '');
        setRfc(s.business_rfc || '');
        setInstagram(s.business_instagram || '');
        setCiudad(s.business_city || '');
        setEstado(s.business_state || '');
        setDireccion(s.business_address || '');
        setTipo(s.business_tipo || '');
        setMoneda(s.currency_symbol || '$');
        setShowPhone(!!(s.show_phone === true || s.show_phone === 'true' || s.show_phone === undefined));
        setShowAddress(!!(s.show_direccion === true || s.show_direccion === 'true' || (s.show_direccion === undefined && s.show_address === undefined) || s.show_address === true || s.show_address === 'true'));
        setShowEmail(!!(s.show_email === true || s.show_email === 'true'));
        setShowWebsite(!!(s.show_website === true || s.show_website === 'true'));
        setShowInstagram(!!(s.show_instagram === true || s.show_instagram === 'true'));
        setShowRfc(!!(s.show_rfc === true || s.show_rfc === 'true'));
        setTicketFooter(s.ticket_footer || '');
        setShowLogo(!!(s.show_logo === true || s.show_logo === 'true' || s.show_logo === undefined));
        setLogoBase64(s.logo_base64 || '');
        setPuntosActivos(!!s.puntos_activos);
        setPuntosPorPeso(String(s.puntos_por_peso ?? '0.1'));
        setPuntosBono(String(s.puntos_bono_pedido ?? '0'));
        setPuntosValor(String(s.puntos_valor ?? '0.10'));
        const sucId = s.sucursal_id || null;
        setSucursalId(sucId);
        // venta_sin_turno desde nube (fuente de verdad compartida)
        if (s.venta_sin_turno !== undefined) {
          _cloudVentaSinTurno = !(s.venta_sin_turno === false || s.venta_sin_turno === 'false');
          setVentaSinTurno(_cloudVentaSinTurno);
        }
        // Permisos de puestos — preservar cajero, encargado y todos los roles custom
        const guardados = s.permisos_roles || {};
        fullPermisosRef.current = guardados;  // guardar estructura completa para preservar __b_* keys
        // Determinar la base de permisos según la sucursal:
        // - Si hay config específica de la sucursal → usarla (incluye sus custom roles)
        // - Si hay sucursal pero sin config propia → solo puestos base sin custom de otras sucursales
        // - Sin sucursal → config global completa
        let base;
        if (sucId) {
          base = guardados[`__b_${sucId}`] || { cajero: guardados.cajero, encargado: guardados.encargado };
        } else {
          base = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
        }
        const allRoles = {
          cajero:    { ...PERMISOS_DEFAULT.cajero,    ...(base.cajero    || {}) },
          encargado: { ...PERMISOS_DEFAULT.encargado, ...(base.encargado || {}) },
        };
        Object.keys(base).forEach(k => {
          if (base[k]?._custom === true) allRoles[k] = { ...base[k] };
        });
        setPermisosRoles(allRoles);
      }
    } catch { /* sin conexión: continuar con valores por defecto */ }

    // Sucursales (todos los dueños — para poder seleccionar sucursal aunque sea plan free)
    if (isOwner) {
      try {
        const bs = await api.getBranches();
        setBranches(bs || []);
        // Sobrescribir teléfono y dirección con los de la sucursal activa
        if (sucId) {
          const currentBranch = (bs || []).find(b => b.id === sucId);
          if (currentBranch) {
            if (currentBranch.phone   != null) setTelefono(currentBranch.phone);
            if (currentBranch.address != null) setDireccion(currentBranch.address);
          }
        }
      } catch {}
    }

    // Ajustes locales (SecureStore)
    const [pAddr, pName, stock, sinTurno, pinReq, pin, pedirPwd] = await Promise.all([
      SecureStore.getItemAsync('printer_address'),
      SecureStore.getItemAsync('printer_name'),
      SecureStore.getItemAsync('mostrar_stock'),
      SecureStore.getItemAsync('venta_sin_turno'),
      SecureStore.getItemAsync('requiere_pin_descuentos'),
      SecureStore.getItemAsync('pin_descuentos'),
      SecureStore.getItemAsync('pedir_password_inicio'),
    ]);
    setPrinterAddress(pAddr || '');
    setPrinterName(pName || '');
    setMostrarStock(stock === 'true');
    // venta_sin_turno: usar nube si disponible, SecureStore como fallback offline
    if (_cloudVentaSinTurno === undefined) {
      setVentaSinTurno(sinTurno !== 'false');
    }
    setRequierePinDesc(pinReq === 'true');
    setPinDescuentos(pin || '');
    // pedir_password_inicio: default activo (true) igual que desktop
    setPedirPasswordInicio(pedirPwd !== 'false');

    setLoading(false);
    setRefreshing(false);
  }, [isOwner, plan]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Recargar desde la nube cada vez que el usuario regresa a esta pantalla
  // (para reflejar cambios hechos desde desktop u otro dispositivo)
  const _focusMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!_focusMounted.current) { _focusMounted.current = true; return; }
      loadAll(true);
    }, [loadAll])
  );

  // SSE: escuchar cambios de ajustes en tiempo real (ej: desktop edita Mi Negocio)
  useFocusEffect(
    useCallback(() => {
      const sse = createSSE(api.getSettingsEventsConfig(), () => loadAll(true));
      return () => { sse.close(); };
    }, [loadAll])
  );

  // ─────────────────────────────────────────────────────────────────────
  // Guardar ajustes del negocio
  // ─────────────────────────────────────────────────────────────────────

  async function guardarNegocio() {
    setSavingNegocio(true);
    try {
      if (sucursalId) {
        // Teléfono y dirección son de la sucursal; el resto son globales del negocio
        await Promise.all([
          api.updateBranch(sucursalId, {
            phone:   telefono.trim() || null,
            address: direccion.trim() || null,
          }),
          api.updateSettings({
            business_name:      nombre.trim(),
            business_email:     email.trim(),
            business_website:   website.trim(),
            business_rfc:       rfc.trim(),
            business_instagram: instagram.trim(),
            business_city:      ciudad.trim(),
            business_state:     estado.trim(),
            business_tipo:      tipo,
          }),
        ]);
      } else {
        await api.updateSettings({
          business_name:      nombre.trim(),
          business_phone:     telefono.trim(),
          business_email:     email.trim(),
          business_website:   website.trim(),
          business_rfc:       rfc.trim(),
          business_instagram: instagram.trim(),
          business_city:      ciudad.trim(),
          business_state:     estado.trim(),
          business_address:   direccion.trim(),
          business_tipo:      tipo,
        });
      }
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
    try { await api.updateSettings({ currency_symbol: m }); await refreshSettings(); } catch {}
  }

  async function toggleShowPhone(val) {
    setShowPhone(val);
    try { await api.updateSettings({ show_phone: val }); } catch {}
  }

  async function toggleShowAddress(val) {
    setShowAddress(val);
    try { await api.updateSettings({ show_direccion: val }); } catch {}
  }

  async function toggleShowEmail(val) {
    setShowEmail(val);
    try { await api.updateSettings({ show_email: val }); } catch {}
  }

  async function toggleShowWebsite(val) {
    setShowWebsite(val);
    try { await api.updateSettings({ show_website: val }); } catch {}
  }

  async function toggleShowInstagram(val) {
    setShowInstagram(val);
    try { await api.updateSettings({ show_instagram: val }); } catch {}
  }

  async function toggleShowRfc(val) {
    setShowRfc(val);
    try { await api.updateSettings({ show_rfc: val }); } catch {}
  }

  async function guardarTicketFooter(val) {
    setTicketFooter(val);
    try { await api.updateSettings({ ticket_footer: val }); } catch {}
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

  async function togglePedirPasswordInicio(val) {
    setPedirPasswordInicio(val);
    await SecureStore.setItemAsync('pedir_password_inicio', val ? 'true' : 'false');
  }

  async function toggleVentaSinTurno(val) {
    setVentaSinTurno(val);
    await SecureStore.setItemAsync('venta_sin_turno', val ? 'true' : 'false');
    api.updateSettings({ venta_sin_turno: val }).catch(() => {});
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
      await refreshSettings();
      Alert.alert('Guardado', 'Configuración de puntos actualizada.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPuntos(false);
    }
  }

  async function togglePuntosActivos(val) {
    setPuntosActivos(val);
    try { await api.updateSettings({ puntos_activos: val }); await refreshSettings(); } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────
  // Notificaciones
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

  // ── Vista simplificada para empleados ─────────────────────────────────
  if (rolActivo && rolActivo !== 'dueno') {
    const permsActivo = permisosRoles?.[rolActivo] || {};
    const labelActivo = permsActivo._label || (rolActivo === 'cajero' ? 'Cajero' : rolActivo === 'encargado' ? 'Encargado' : rolActivo);
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Ajustes</Text>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(permsActivo.nombre || labelActivo)?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{permsActivo.nombre || labelActivo}</Text>
              <Text style={styles.profileRole}>{labelActivo}</Text>
            </View>
          </View>

          <SectionTitle label="Impresora" />
          <SectionCard>
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

          <SectionTitle label="Pantalla de Cocina" />
          <SectionCard>
            <MenuItem
              label="Abrir KDS"
              sub={isPremium ? 'Vista en tiempo real para el personal de cocina' : 'Función exclusiva del plan Premium'}
              onPress={isPremium
                ? () => navigation.navigate('KDS')
                : () => Alert.alert('Función Premium', 'Solicita al administrador que actualice el plan.')
              }
              last
            />
          </SectionCard>

          <SectionTitle label="Cuenta" />
          <SectionCard>
            <MenuItem
              label="Cambiar perfil"
              sub="Volver a la pantalla de selección de perfil"
              onPress={cambiarPerfil}
              last
            />
          </SectionCard>

          <Text style={styles.footer}>Zenit POS · Versión 1.0.0</Text>
        </ScrollView>

        {/* Modal impresora Bluetooth */}
        <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Impresora Bluetooth</Text>
              <TouchableOpacity onPress={() => setModalPrinter(false)}>
                <Text style={styles.linkText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
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
              <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Dispositivos emparejados</Text>
              {scanning && (
                <View style={{ alignItems: 'center', padding: spacing.xl }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.menuSub, { marginTop: spacing.sm }]}>Buscando dispositivos...</Text>
                </View>
              )}
              {!scanning && scannedDevices.length === 0 && (
                <View style={styles.section}>
                  <Text style={[styles.emptySmall, { textAlign: 'center' }]}>
                    No se encontraron dispositivos.{'\n'}Asegúrate de que la impresora esté encendida y emparejada en los ajustes de Bluetooth.
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
            </ScrollView>
          </SafeAreaView>
        </Modal>
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
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            placeholder="contacto@minegocio.com"
            keyboardType="email-address"
          />
          <FieldRow
            label="Sitio web"
            value={website}
            onChangeText={setWebsite}
            placeholder="www.minegocio.com"
          />
          <FieldRow
            label="RFC / ID Fiscal"
            value={rfc}
            onChangeText={setRfc}
            placeholder="XAXX010101000"
          />
          <FieldRow
            label="Instagram"
            value={instagram}
            onChangeText={setInstagram}
            placeholder="@minegocio"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <FieldRow
                label="Ciudad"
                value={ciudad}
                onChangeText={setCiudad}
                placeholder="Guadalajara"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldRow
                label="Estado"
                value={estado}
                onChangeText={setEstado}
                placeholder="Jalisco"
              />
            </View>
          </View>
          <FieldRow
            label="Dirección"
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Ej: Calle 5, Col. Centro"
          />
          {/* Tipo de negocio */}
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Tipo de negocio</Text>
            <View style={styles.tipoWrap}>
              {[
                ['restaurante','Restaurante'],['tienda','Tienda'],
                ['ropa','Ropa'],['salon','Salón'],['farmacia','Farmacia'],
                ['panaderia','Panadería'],['otro','Otro'],
              ].map(([val, lbl]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.tipoChip, tipo === val && styles.tipoChipActive]}
                  onPress={() => setTipo(tipo === val ? '' : val)}
                >
                  <Text style={[styles.tipoChipText, tipo === val && styles.tipoChipTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
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
          <SwitchRow
            label="Mostrar correo en ticket"
            value={showEmail}
            onChange={toggleShowEmail}
          />
          <SwitchRow
            label="Mostrar sitio web en ticket"
            value={showWebsite}
            onChange={toggleShowWebsite}
          />
          <SwitchRow
            label="Mostrar Instagram en ticket"
            value={showInstagram}
            onChange={toggleShowInstagram}
          />
          <SwitchRow
            label="Mostrar RFC en ticket"
            value={showRfc}
            onChange={toggleShowRfc}
          />
          {/* Mensaje de cierre del ticket */}
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Mensaje de cierre</Text>
            <TextInput
              style={[styles.fieldInput, { height: 54, textAlignVertical: 'top' }]}
              value={ticketFooter}
              onChangeText={setTicketFooter}
              onEndEditing={() => guardarTicketFooter(ticketFooter)}
              placeholder="¡Gracias por tu compra!"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
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
            label="Pedir contraseña al iniciar"
            sub="Solicita tu contraseña cada vez que abres la app"
            value={pedirPasswordInicio}
            onChange={togglePedirPasswordInicio}
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
                      label={`Puntos por cada ${moneda}1`}
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

        {/* ── Sucursales ─── */}
        {isOwner && (
          <SeccionSucursales
            isOwner={isOwner}
            isPremium={isPremium}
            branches={branches}
            setBranches={setBranches}
            sucursalId={sucursalId}
            setSucursalId={setSucursalId}
            onRefresh={() => loadAll(true)}
            styles={styles}
          />
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

        {/* ── Administrar Puestos ─── */}
        {isOwner && permisosRoles && (
          <SeccionPuestos
            permisosRoles={permisosRoles}
            setPermisosRoles={setPermisosRoles}
            sucursalId={sucursalId}
            branches={branches}
            fullPermisosRef={fullPermisosRef}
            refreshSettings={refreshSettings}
            styles={styles}
          />
        )}


        {/* ── Mi Plan ─── */}
        {isOwner && <SeccionPlan plan={plan} user={user} refreshUser={refreshUser} styles={styles} />}

        {/* ── Notificaciones ─── */}
        {isOwner && <SeccionNotificaciones initialSettings={cloudSettingsRef.current} styles={styles} />}

        {/* ── Cuenta ────────────────────────────────────────────────── */}
        <SectionTitle label="Cuenta" />
        <SectionCard>
          <MenuItem
            label="Cambiar contraseña"
            sub="Actualiza tu contraseña de acceso"
            onPress={abrirCambioPassword}
          />
          {Object.values(permisosRoles || {}).some(p => p?.enabled === true) && (
            <MenuItem
              label="Cambiar perfil"
              sub={nombreActivo ? `Activo: ${nombreActivo}` : rolActivo === 'dueno' ? 'Activo: Administrador' : `Activo: ${rolActivo}`}
              onPress={cambiarPerfil}
            />
          )}
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
  sectionSub:   { fontSize: font.sm - 1, color: colors.textMuted, marginBottom: spacing.md, marginTop: -spacing.xs },
  section:      { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm },
  // Puestos
  puestoCard:     { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, overflow: 'hidden' },
  puestoHeader:   { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  puestoLabel:    { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  puestoSub:      { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  permisosWrap:   { padding: spacing.md },
  permisosTitle:  { fontSize: font.sm - 1, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  nombreInput:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background, marginTop: spacing.xs },
  puestoLabelInput:  { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 2, marginBottom: 2 },
  formNuevoPuesto:   { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  formNuevoTitle:    { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  btnNuevoPuesto:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  btnNuevoPuestoText:{ fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pinSection:        { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  pinStatus:         { fontSize: font.sm, color: '#16a34a', fontWeight: '600', marginBottom: spacing.xs },
  btnPinGuardar:     { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
  btnPinGuardarText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  btnQuitarPin:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  btnQuitarPinText:  { color: colors.danger, fontSize: font.sm, fontWeight: '600' },
  permisoRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  permisoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  permisoNombre:  { fontSize: font.sm, color: colors.textPrimary, fontWeight: '500' },
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
  btnPlan:         { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btnPlanText:     { fontSize: font.md, fontWeight: '700' },
  btnIconSmall:    { padding: spacing.xs },
  // Tipo de negocio chips
  tipoWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tipoChip:        { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tipoChipActive:  { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  tipoChipText:    { fontSize: font.sm, color: colors.textSecondary },
  tipoChipTextActive: { color: colors.primary, fontWeight: '700' },
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
