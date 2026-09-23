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
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { zc, radios, espacios, sombra } from '../../theme';
import { Cabecera, FranjaSuperior, Icono, PantallaDeTemas, TarjetaQuien } from '../../components/ui';
import { friendlyError } from '../../utils/errors';
import { createSSE } from '../../utils/sse';
import { zonaDelDispositivo, etiquetaZona, opcionesZona } from '../../utils/tz';
// Solo para PINTAR la línea de estado de cada tarjeta: se lee, no se guarda.
import { configImpuesto } from '../../utils/impuestos';
import { configPropina } from '../../utils/propinas';
import { configHorario, resumenHorario } from '../../utils/horarios';
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
import { SeccionImpuestos } from './ajustes/SeccionImpuestos';
import { SeccionPropinas } from './ajustes/SeccionPropinas';
import { SeccionHorario } from './ajustes/SeccionHorario';
import { SeccionPantallasKDS } from './ajustes/SeccionPantallasKDS';
import AvisoLicencias from '../../components/AvisoLicencias';


const TIPOS_NEGOCIO = [
  ['restaurante', 'Restaurante'], ['tienda', 'Tienda'],
  ['ropa', 'Ropa'], ['salon', 'Salón'], ['farmacia', 'Farmacia'],
  ['panaderia', 'Panadería'], ['otro', 'Otro'],
];

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function AjustesScreen({ navigation }) {
  const {
    user, settings, isOwner, isPremium, logout, refreshUser, refreshSettings,
    rolActivo, nombreActivo, cambiarPerfil,
    // La sucursal es de ESTE dispositivo y vive en el contexto (SecureStore), no en
    // los ajustes del negocio: dos equipos pueden estar en sucursales distintas.
    sucursalId, cambiarSucursalDispositivo, verificarPasswordAdmin,
  } = useAuth();
  const plan      = user?.plan || 'free';

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

  // ── Estado: zona horaria del negocio ───────────────────────────────────
  const [zonaHoraria, setZonaHoraria]     = useState(zonaDelDispositivo());
  const [modalZona, setModalZona]         = useState(false);

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
  // PIN en movimientos de caja (BLOQUE 7) — default encendido
  const [movCajaPin, setMovCajaPin]                       = useState(true);
  const [pinDescuentos, setPinDescuentos]                 = useState('');
  const [pedirPasswordInicio, setPedirPasswordInicio]     = useState(true); // default activo

  // ── Estado: puntos de lealtad (backend) ───────────────────────────────
  const [puntosActivos, setPuntosActivos]   = useState(false);
  const [puntosPorPeso, setPuntosPorPeso]   = useState('0.1');
  const [puntosBono, setPuntosBono]         = useState('0');
  const [puntosValor, setPuntosValor]       = useState('0.10');
  const [savingPuntos, setSavingPuntos]     = useState(false);

  // ── Estado: sucursal ──────────────────────────────────────────────────
  // La lista de sucursales viene del backend; cuál usa ESTE equipo lo decide el
  // contexto (almacenamiento local del dispositivo).
  const [branches, setBranches]   = useState([]);

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

    // Sucursal de este dispositivo (permisos por sucursal, teléfono y dirección)
    const sucId = sucursalId;

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
        setZonaHoraria(s.tz || zonaDelDispositivo());
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
        // PIN en movimientos de caja (ajuste del NEGOCIO: lo decide el dueño y
        // aplica a todos los equipos). Default: encendido.
        setMovCajaPin(!(s.movimientos_caja_pin === false || s.movimientos_caja_pin === 'false'));
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
  }, [isOwner, plan, sucursalId]);

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
      const sse = createSSE(() => api.getSettingsEventsConfig(), () => loadAll(true));
      return () => { try { sse?.close(); } catch {} };
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
      Alert.alert('Error', friendlyError(e));
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

  // Zona horaria: define a qué hora corta el día el backend (dashboard, reportes,
  // resúmenes automáticos). Si falla el guardado, revertimos para no mentirle al usuario.
  async function cambiarZonaHoraria(tz) {
    const anterior = zonaHoraria;
    setZonaHoraria(tz);
    setModalZona(false);
    try {
      await api.updateSettings({ tz });
      await refreshSettings();
    } catch (e) {
      setZonaHoraria(anterior);
      Alert.alert('No se pudo guardar', friendlyError(e));
    }
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
      Alert.alert('Error', 'No se pudo guardar el logo: ' + friendlyError(e));
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
          Alert.alert('Error', friendlyError(e));
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

  // Solo el dueño puede cambiarlo; el backend además responde 403 si lo intenta
  // otro puesto (ver routes/settings.js).
  async function toggleMovCajaPin(val) {
    setMovCajaPin(val);
    try {
      await api.updateSettings({ movimientos_caja_pin: val });
    } catch (e) {
      setMovCajaPin(!val); // revertir: el ajuste no quedó guardado
      Alert.alert('No se pudo guardar', friendlyError(e) || 'Intenta de nuevo');
    }
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
      Alert.alert('Error', friendlyError(e));
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
      Alert.alert('Error al buscar', friendlyError(e));
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
      Alert.alert('Error al conectar', friendlyError(e));
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
      Alert.alert('Error al imprimir', friendlyError(e));
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
      Alert.alert('Error', friendlyError(e));
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
        <ActivityIndicator size="large" color={zc.azul} />
      </SafeAreaView>
    );
  }

  // ── Vista simplificada para empleados ─────────────────────────────────
  if (rolActivo && rolActivo !== 'dueno') {
    const permsActivo = permisosRoles?.[rolActivo] || {};
    const labelActivo = permsActivo._label || (rolActivo === 'cajero' ? 'Cajero' : rolActivo === 'encargado' ? 'Encargado' : rolActivo);
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <FranjaSuperior />
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <Cabecera titulo="Ajustes">
            <TarjetaQuien
              inicial={(permsActivo.nombre || labelActivo)?.[0]?.toUpperCase() || '?'}
              nombre={permsActivo.nombre || labelActivo}
              detalle={labelActivo}
            />
          </Cabecera>

          <View style={styles.cuerpo}>
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

          <SectionTitle label="Pantalla de cocina" />
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
          </View>
        </ScrollView>

        {/* Modal impresora Bluetooth */}
        <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Impresora Bluetooth</Text>
              <TouchableOpacity onPress={() => setModalPrinter(false)}>
                <Text style={styles.linkText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              {printerName ? (
                <View style={styles.printerCurrentCard}>
                  <Text style={styles.printerCurrentLabel}>Impresora actual</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icono nombre="impresora" size={16} color={zc.tinta} />
                    <Text style={styles.printerCurrentName}>{printerName}</Text>
                  </View>
                  <Text style={styles.menuSub}>{printerAddress}</Text>
                </View>
              ) : (
                <View style={styles.printerCurrentCard}>
                  <Text style={styles.menuSub}>Sin impresora configurada</Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Dispositivos emparejados</Text>
              {scanning && (
                <View style={{ alignItems: 'center', padding: 18 }}>
                  <ActivityIndicator color={zc.azul} />
                  <Text style={[styles.menuSub, { marginTop: 8 }]}>Buscando dispositivos...</Text>
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
                    ? <ActivityIndicator color={zc.azul} />
                    : <Text style={{ color: zc.azul, fontWeight: '500' }}>Conectar</Text>
                  }
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Lo que dice cada tarjeta ("IVA 16% incluido", "Sin impresora"…) ──
  // Solo se LEE lo que ya está cargado: ninguna de estas líneas guarda nada.
  const _imp = configImpuesto(settings);
  const _estadoCobros = [
    _imp.activo ? `${_imp.nombre} ${_imp.tasaConfigurada}%${_imp.incluido ? ' incluido' : ''}` : 'Sin impuesto',
    configPropina(settings).activo ? 'propinas' : null,
    puntosActivos && isPremium ? 'puntos' : null,
  ].filter(Boolean).join(' · ');
  const _puestos = Object.values(permisosRoles || {}).filter(p => p?.enabled === true).length;
  const _horario = configHorario(settings);
  const _tipoLabel = (TIPOS_NEGOCIO.find(([v]) => v === tipo) || [])[1];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <PantallaDeTemas
        titulo="Ajustes"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} />}
        arriba={(
          <TarjetaQuien
            inicial={(nombre || user?.name)?.[0]?.toUpperCase() || '?'}
            imagen={logoBase64 ? <Image source={{ uri: `data:image/jpeg;base64,${logoBase64}` }} style={{ width: 44, height: 44 }} /> : null}
            nombre={nombre || user?.name}
            detalle={[
              ROL_LABEL[user?.role] || user?.role,
              isOwner ? `Plan ${PLAN_LABEL[plan] || plan}` : null,
            ].filter(Boolean).join(' · ')}
          />
        )}
        temas={[
          {
            id: 'negocio', titulo: 'Mi negocio', icono: 'tienda', tono: 'azul',
            estado: _tipoLabel ? `${_tipoLabel} · ${logoBase64 ? 'con logo' : 'sin logo'}` : 'Nombre, logo y tipo',
            contenido: (
              <>
                <SectionTitle label="Datos del negocio" />
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
                  <View style={{ flexDirection: 'row' }}>
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
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Tipo de negocio</Text>
                    <View style={styles.tipoWrap}>
                      {TIPOS_NEGOCIO.map(([val, lbl]) => (
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

                <SectionTitle label="Logo" />
                <SectionCard>
                  <View style={styles.menuItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuLabel}>Logo del negocio</Text>
                      <Text style={styles.menuSub}>
                        {logoBase64 ? 'Logo cargado' : 'Sin logo — se usará el nombre del negocio'}
                      </Text>
                    </View>
                    {logoBase64 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Image
                          source={{ uri: `data:image/jpeg;base64,${logoBase64}` }}
                          style={styles.logoThumb}
                        />
                        <TouchableOpacity onPress={seleccionarLogo} disabled={savingLogo}>
                          <Text style={{ color: zc.azul, fontWeight: '500', fontSize: 14 }}>
                            Cambiar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={quitarLogo} disabled={savingLogo}>
                          <Text style={{ color: zc.rojo, fontWeight: '500', fontSize: 14 }}>
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
                          ? <ActivityIndicator color={zc.azul} size="small" />
                          : <Text style={styles.btnLogoAddText}>+ Agregar</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                </SectionCard>

                <SectionTitle label="Zona horaria" />
                <SectionCard>
                  <MenuItem
                    label="Zona horaria del negocio"
                    sub={etiquetaZona(zonaHoraria)}
                    onPress={() => setModalZona(true)}
                    last
                  />
                </SectionCard>
              </>
            ),
          },
          isOwner && {
            id: 'menu', titulo: 'Mi menú', icono: 'libro', tono: 'ambar',
            estado: 'Productos y categorías',
            ir: () => navigation.navigate('Productos'),
          },
          {
            id: 'cobros', titulo: 'Cobros', icono: 'billete', tono: 'verde',
            estado: _estadoCobros,
            contenido: (
              <>
                <SectionTitle label="Moneda" />
                <SectionCard>
                  <View style={styles.menuItem}>
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
                </SectionCard>

                {/* ── Impuestos (BLOQUE 8) ─── */}
                {/* Solo el dueño: cambia lo que se le COBRA al cliente, y el backend
                    responde 403 si lo manda cualquier otro puesto. */}
                {isOwner && (
                  <SeccionImpuestos
                    settings={settings}
                    currency={moneda}
                    onSaved={refreshSettings}
                    styles={styles}
                  />
                )}

                {/* ── Propinas (BLOQUE 9) ─── */}
                {/* Solo el dueño, igual que el impuesto: cambia lo que se le PIDE al
                    cliente y lo que el corte le exige al cajero en el cajón. */}
                {isOwner && (
                  <SeccionPropinas
                    settings={settings}
                    currency={moneda}
                    onSaved={refreshSettings}
                    styles={styles}
                  />
                )}

                {/* ── Sistema de Puntos (solo dueño) ────────────────────────── */}
                {isOwner && (
                  <>
                    <View style={styles.tituloConInsignia}>
                      <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Puntos de lealtad</Text>
                      {!isPremium && (
                        <View style={styles.premiumBadge}>
                          <Icono nombre="candado" size={10} color={zc.ambarTexto} />
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

                <SectionTitle label="Caja y venta" />
                <SectionCard>
                  <SwitchRow
                    label="Permitir venta sin turno"
                    sub="Registrar ventas sin abrir la caja"
                    value={ventaSinTurno}
                    onChange={toggleVentaSinTurno}
                  />
                  <SwitchRow
                    label="Mostrar stock disponible"
                    sub="Ver cuántas unidades hay al vender"
                    value={mostrarStock}
                    onChange={toggleMostrarStock}
                  />
                  {isOwner && (
                    <SwitchRow
                      label="PIN en movimientos de caja"
                      sub="Pide el PIN del puesto para registrar retiros y gastos"
                      value={movCajaPin}
                      onChange={toggleMovCajaPin}
                    />
                  )}
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
                        placeholderTextColor={zc.grisSuave}
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
              </>
            ),
          },
          {
            id: 'ticket', titulo: 'Ticket', icono: 'impresora', tono: 'rosa',
            estado: printerName || 'Sin impresora',
            aviso: !printerName,
            contenido: (
              <>
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

                <SectionTitle label="Qué sale en el ticket" />
                <SectionCard>
                  <SwitchRow
                    label="Mostrar logo en ticket"
                    sub={logoBase64 ? undefined : 'Agrega un logo primero (en Mi negocio)'}
                    value={showLogo && !!logoBase64}
                    onChange={logoBase64 ? toggleShowLogo : undefined}
                  />
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
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Mensaje de cierre</Text>
                    <TextInput
                      style={[styles.fieldInput, { minHeight: 44, textAlignVertical: 'top' }]}
                      value={ticketFooter}
                      onChangeText={setTicketFooter}
                      onEndEditing={() => guardarTicketFooter(ticketFooter)}
                      placeholder="¡Gracias por tu compra!"
                      placeholderTextColor={zc.grisSuave}
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </SectionCard>
              </>
            ),
          },
          isOwner && {
            id: 'equipo', titulo: 'Mi equipo', icono: 'usuarios', tono: 'lila',
            estado: `${_puestos} ${_puestos === 1 ? 'puesto activo' : 'puestos activos'} · ${branches.length} ${branches.length === 1 ? 'sucursal' : 'sucursales'}`,
            contenido: (
              <>
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

                {/* ── Sucursales ─── */}
                {isOwner && (
                  <SeccionSucursales
                    isOwner={isOwner}
                    isPremium={isPremium}
                    branches={branches}
                    setBranches={setBranches}
                    sucursalId={sucursalId}
                    cambiarSucursalDispositivo={cambiarSucursalDispositivo}
                    verificarPasswordAdmin={verificarPasswordAdmin}
                    onRefresh={() => loadAll(true)}
                    styles={styles}
                  />
                )}
              </>
            ),
          },
          isOwner && {
            id: 'horario', titulo: 'Horario', icono: 'reloj', tono: 'azul',
            estado: _horario ? resumenHorario(_horario) : 'Sin definir',
            contenido: (
              <>
                {/* ── Horario del negocio (BLOQUE 14) ─── */}
                {/* Solo el dueño: es una SEÑAL DE SEGURIDAD, y que la cambiara un
                    empleado sería dejarle apagar la alarma que vigila sus propias
                    acciones. ⚠️ No bloquea nada de la operación: ver SeccionHorario. */}
                {isOwner && (
                  <SeccionHorario
                    settings={settings}
                    onSaved={refreshSettings}
                    styles={styles}
                  />
                )}
              </>
            ),
          },
        ].filter(Boolean)}
        lista={[
          {
            id: 'cocina', titulo: 'Pantalla de cocina', icono: 'monitor',
            estado: isPremium ? null : 'Premium',
            contenido: (
              <>
                <SectionTitle label="Abrir en este teléfono" />
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

                {/* ── Pantallas de cocina (BLOQUE 13) ─── */}
                {/* Solo el dueño ve la lista: aprobar una pantalla es dar acceso
                    permanente a la cola de pedidos, y revocarla se lo quita. El PIN que
                    se teclea al aprobar es el del PUESTO, no la contraseña de la cuenta
                    (§19.19). */}
                {isOwner && (
                  <SeccionPantallasKDS
                    sucursalId={sucursalId}
                    rolActivo={rolActivo}
                    nombreActivo={nombreActivo}
                    styles={styles}
                  />
                )}
              </>
            ),
          },
          isOwner && {
            id: 'notificaciones', titulo: 'Notificaciones', icono: 'campana',
            contenido: <SeccionNotificaciones initialSettings={cloudSettingsRef.current} styles={styles} />,
          },
          isOwner && {
            id: 'plan', titulo: 'Mi plan', icono: 'medalla', estado: PLAN_LABEL[plan] || plan,
            contenido: <SeccionPlan plan={plan} user={user} refreshUser={refreshUser} styles={styles} />,
          },
          {
            id: 'seguridad', titulo: 'Seguridad y versión', icono: 'escudo',
            contenido: (
              <>
                <SectionTitle label="Al abrir la app" />
                <SectionCard>
                  <SwitchRow
                    label="Pedir contraseña al iniciar"
                    sub="Solicita tu contraseña cada vez que abres la app"
                    value={pedirPasswordInicio}
                    onChange={togglePedirPasswordInicio}
                    last
                  />
                </SectionCard>

                <SectionTitle label="Respaldo y versión" />
                <SectionCard>
                  <View style={[styles.menuItem, styles.menuItemBorder]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icono nombre="nube" size={16} color={zc.tinta} />
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

                <SectionCard>
                  <AvisoLicencias />
                </SectionCard>
              </>
            ),
          },
          {
            id: 'cuenta', titulo: 'Mi cuenta', icono: 'usuario', estado: user?.username,
            contenido: (
              <>
                <SectionTitle label={user?.name || 'Cuenta'} />
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
                      last
                    />
                  )}
                </SectionCard>
              </>
            ),
          },
        ].filter(Boolean)}
        abajo={(
          <View style={styles.cerrarSesion}>
            <SectionCard>
              <MenuItem
                label="Cerrar sesión"
                danger
                onPress={confirmarCerrarSesion}
                last
              />
            </SectionCard>
          </View>
        )}
        pie={<Text style={styles.footer}>Zenit POS · Versión 1.0.0</Text>}
      />

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Impresora Bluetooth
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Impresora Bluetooth</Text>
            <TouchableOpacity onPress={() => setModalPrinter(false)}>
              <Text style={styles.linkText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18 }}>
            {/* Dispositivo actual */}
            {printerName ? (
              <View style={styles.printerCurrentCard}>
                <Text style={styles.printerCurrentLabel}>Impresora actual</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icono nombre="impresora" size={16} color={zc.tinta} />
                  <Text style={styles.printerCurrentName}>{printerName}</Text>
                </View>
                <Text style={styles.menuSub}>{printerAddress}</Text>
              </View>
            ) : (
              <View style={styles.printerCurrentCard}>
                <Text style={styles.menuSub}>Sin impresora configurada</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              Dispositivos emparejados
            </Text>

            {scanning && (
              <View style={{ alignItems: 'center', padding: 18 }}>
                <ActivityIndicator color={zc.azul} />
                <Text style={[styles.menuSub, { marginTop: 8 }]}>Buscando dispositivos...</Text>
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
                  ? <ActivityIndicator color={zc.azul} />
                  : <Text style={{ color: zc.azul, fontWeight: '500' }}>Conectar</Text>
                }
              </TouchableOpacity>
            ))}

            <Text style={[styles.menuSub, { textAlign: 'center', marginTop: 18 }]}>
              Solo muestra dispositivos ya emparejados.{'\n'}
              Empareja tu impresora primero desde Bluetooth en Ajustes del sistema.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Zona horaria del negocio
          Define a qué hora corta el día el backend (que corre en UTC).
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalZona} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Zona horaria</Text>
            <TouchableOpacity onPress={() => setModalZona(false)}>
              <Text style={styles.linkText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={[styles.menuSub, { marginBottom: 16 }]}>
              Define a qué hora empieza y termina el día para el dashboard, los reportes
              y los resúmenes automáticos. Elige la zona donde está tu negocio.
            </Text>

            <SectionCard>
              {opcionesZona(zonaHoraria).map(([id, etiqueta], i, lista) => (
                <MenuItem
                  key={id}
                  label={etiqueta}
                  sub={id}
                  rightText={id === zonaHoraria ? '✓' : ' '}
                  onPress={() => cambiarZonaHoraria(id)}
                  last={i === lista.length - 1}
                />
              ))}
            </SectionCard>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Cambiar contraseña
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalPassword} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cambiar contraseña</Text>
              <TouchableOpacity onPress={() => setModalPassword(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              <Text style={styles.label}>Contraseña actual *</Text>
              <TextInput
                style={styles.input}
                value={passActual}
                onChangeText={setPassActual}
                placeholder="Tu contraseña actual"
                placeholderTextColor={zc.grisSuave}
                secureTextEntry
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Nueva contraseña *</Text>
              <TextInput
                style={styles.input}
                value={passNueva}
                onChangeText={setPassNueva}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={zc.grisSuave}
                secureTextEntry
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Confirmar nueva contraseña *</Text>
              <TextInput
                style={styles.input}
                value={passConfirm}
                onChangeText={setPassConfirm}
                placeholder="Repite la nueva contraseña"
                placeholderTextColor={zc.grisSuave}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.btnSave, { marginTop: 18 }, savingPass && { opacity: 0.7 }]}
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
// Diseño A (PLAN_REDISENO_V1). Estos estilos los usan TAMBIÉN las secciones de
// ajustes/Seccion*.js, que los reciben por la prop `styles`: cambiarlos aquí las
// cambia a todas.

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: zc.fondo },
  cuerpo:      { paddingHorizontal: espacios.borde, paddingTop: 4 },

  // Secciones
  sectionTitle: { fontSize: 13, fontWeight: '500', color: zc.gris, marginBottom: 8, marginTop: 14, marginLeft: 4 },
  sectionSub:   { fontSize: 12.5, color: zc.grisSuave, marginBottom: 10, marginTop: -4, marginLeft: 4 },
  section:      { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginBottom: 8, ...sombra },
  tituloConInsignia: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 14, marginLeft: 4 },
  cerrarSesion: { paddingHorizontal: espacios.borde, marginTop: 14 },

  // Puestos
  puestoCard:     { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginBottom: 8, overflow: 'hidden', ...sombra },
  puestoHeader:   { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  puestoLabel:    { fontSize: 15, fontWeight: '500', color: zc.tinta },
  puestoSub:      { fontSize: 12.5, color: zc.grisSuave, marginTop: 2 },
  permisosWrap:   { padding: 14 },
  permisosTitle:  { fontSize: 12.5, fontWeight: '500', color: zc.gris, marginBottom: 8 },
  nombreInput:       { borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, padding: 10, fontSize: 15, color: zc.tinta, backgroundColor: zc.fondo, marginTop: 4 },
  puestoLabelInput:  { fontSize: 15, fontWeight: '500', color: zc.tinta, borderBottomWidth: 1, borderBottomColor: zc.linea, paddingBottom: 2, marginBottom: 2 },
  formNuevoPuesto:   { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: 14, marginBottom: 8, ...sombra },
  formNuevoTitle:    { fontSize: 13, fontWeight: '500', color: zc.gris, marginBottom: 8 },
  btnNuevoPuesto:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d5dbe4', borderRadius: radios.tarjeta, padding: 14, marginBottom: 8 },
  btnNuevoPuestoText:{ fontSize: 14, fontWeight: '500', color: zc.azul },
  pinSection:        { padding: 14, borderTopWidth: 1, borderTopColor: zc.linea },
  pinStatus:         { fontSize: 13, color: zc.verde, fontWeight: '500', marginBottom: 4 },
  btnPinGuardar:     { backgroundColor: zc.azul, borderRadius: radios.boton, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  btnPinGuardarText: { color: '#fff', fontWeight: '500', fontSize: 14 },
  btnQuitarPin:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  btnQuitarPinText:  { color: zc.rojo, fontSize: 13, fontWeight: '500' },
  permisoRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  permisoRowBorder: { borderBottomWidth: 1, borderBottomColor: zc.linea },
  permisoNombre:  { fontSize: 14, color: zc.tinta },
  divider:      { height: 1, backgroundColor: zc.linea },

  // Filas de menú
  menuItem:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: zc.linea },
  menuLabel:      { fontSize: 15, color: zc.tinta },
  menuSub:        { fontSize: 12.5, color: zc.grisSuave, marginTop: 2, lineHeight: 17 },
  menuRight:      { fontSize: 14, color: zc.gris },
  menuChevron:    { color: zc.flecha, fontSize: 18 },

  // Filas de campo
  fieldRow:    { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  fieldLabel:  { fontSize: 12.5, color: zc.gris },
  fieldInput:  { fontSize: 15, color: zc.tinta, paddingVertical: Platform.OS === 'ios' ? 4 : 2, paddingHorizontal: 0 },

  // Moneda
  monedaRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monedaBtn:       { borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: zc.fondo, minWidth: 46, alignItems: 'center' },
  monedaBtnActive: { backgroundColor: zc.azul, borderColor: zc.azul },
  monedaBtnText:   { fontSize: 15, fontWeight: '500', color: zc.tinta },

  // PIN
  pinRow:        { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: zc.linea },
  pinInput:      { flex: 1, borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, padding: 10, fontSize: 15, color: zc.tinta, backgroundColor: zc.fondo },
  btnPinSave:    { backgroundColor: zc.azul, borderRadius: radios.boton, paddingHorizontal: 14, paddingVertical: 10 },
  btnPinSaveText:{ color: '#fff', fontSize: 14, fontWeight: '500' },

  // Botón guardar
  btnSave:         { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 13, alignItems: 'center', marginBottom: 6, marginTop: 4, minHeight: 46, justifyContent: 'center' },
  btnSaveText:     { color: '#fff', fontSize: 15, fontWeight: '500' },
  btnRecargar:     { borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: zc.tarjeta },
  btnRecargarText: { fontSize: 13, color: zc.gris, fontWeight: '500' },
  btnPlan:         { borderRadius: radios.boton, padding: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  btnPlanText:     { fontSize: 15, fontWeight: '500' },
  btnIconSmall:    { padding: 6 },

  // Tipo de negocio
  tipoWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tipoChip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.fondo },
  tipoChipActive:  { backgroundColor: zc.azulSuave },
  tipoChipText:    { fontSize: 13.5, color: zc.gris },
  tipoChipTextActive: { color: zc.azul, fontWeight: '500' },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  checkbox:        { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#d5dbe4', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:      { backgroundColor: zc.azul, borderColor: zc.azul },
  checkboxCheck:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkLabel:      { fontSize: 14, color: zc.tinta, flex: 1 },

  emptySmall:      { color: zc.grisSuave, fontSize: 13.5, padding: 16 },

  // Impresora
  printerCurrentCard: { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: 16, marginBottom: 12, ...sombra },
  printerCurrentLabel:{ fontSize: 12.5, color: zc.gris, marginBottom: 4 },
  printerCurrentName: { fontSize: 16, fontWeight: '500', color: zc.tinta },
  deviceRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: 16, marginBottom: 8, ...sombra },

  // Modales
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: zc.linea, backgroundColor: zc.tarjeta },
  modalTitle:  { fontSize: 19, fontWeight: '500', color: zc.tinta },
  linkText:    { color: zc.azul, fontWeight: '500', fontSize: 15 },
  label:       { fontSize: 12.5, color: zc.gris, marginBottom: 6 },
  input:       { borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, padding: 12, fontSize: 15, color: zc.tinta, backgroundColor: zc.tarjeta },
  footer: { textAlign: 'center', color: zc.grisSuave, fontSize: 12.5, marginTop: 20 },

  // Premium
  premiumBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: zc.ambarSuave, borderRadius: radios.chip, paddingHorizontal: 8, paddingVertical: 3 },
  premiumBadgeText: { fontSize: 11.5, fontWeight: '500', color: zc.ambarTexto },

  // Logo
  logoThumb:    { width: 40, height: 40, borderRadius: radios.cuadrito, backgroundColor: zc.fondo },
  btnLogoAdd:   { backgroundColor: zc.azulSuave, borderRadius: radios.boton, paddingHorizontal: 12, paddingVertical: 8 },
  btnLogoAddText: { color: zc.azul, fontWeight: '500', fontSize: 14 },
});
