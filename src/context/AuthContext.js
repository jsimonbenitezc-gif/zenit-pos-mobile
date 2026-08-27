import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { api } from '../api/client';
import { zonaDelDispositivo } from '../utils/tz';
import { normalizarSugerencias } from '../utils/propinas';

// Configurar cómo se muestran las notificaciones cuando la app está en primer plano
// (solo funciona en APK/build, no en Expo Go SDK 53+)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [settings, setSettings] = useState({});
  const [rolActivo, setRolActivo]       = useState(null);
  const [nombreActivo, setNombreActivo] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState('');
  // Sucursal de ESTE dispositivo (BLOQUE 4). Antes vivía en los ajustes del negocio
  // (`settings.sucursal_id`), así que era compartida por todos los equipos: dos tablets
  // en sucursales distintas eran imposibles. Ahora es local, como en el desktop.
  const [sucursalId, setSucursalIdState] = useState(null);
  // Cuántas sucursales tiene el negocio (cacheado para poder validar sin internet)
  const [sucursalesCount, setSucursalesCount] = useState(1);
  const pushTokenRef = useRef(null);

  useEffect(() => {
    api.ping(); // despertar el servidor en background mientras carga la app
    restoreSession();
  }, []);

  // Registrar callback para logout automático cuando el token expire (401)
  useEffect(() => {
    api.onUnauthorized = () => {
      SecureStore.deleteItemAsync('zenit_token').catch(() => {});
      SecureStore.deleteItemAsync('zenit_refresh_token').catch(() => {});
      SecureStore.deleteItemAsync('zenit_push_token').catch(() => {});
      api.clearToken();
      api.clearRefreshToken();
      setUser(null);
      setSettings({});
      setRolActivo(null);
      setNombreActivo('');
      setProfileReady(false);
      setSessionEmail('');
      Alert.alert('Sesión expirada', 'Tu sesión expiró. Inicia sesión de nuevo.');
    };
    // Persistir nuevos tokens cuando el cliente API rota el access token
    api.onTokenRefreshed = async (token, refreshToken) => {
      try {
        await SecureStore.setItemAsync('zenit_token', token);
        if (refreshToken) await SecureStore.setItemAsync('zenit_refresh_token', refreshToken);
      } catch {}
    };
    return () => {
      api.onUnauthorized = null;
      api.onTokenRefreshed = null;
    };
  }, []);

  async function refreshUser() {
    try { const me = await api.getMe(); if (me) setUser(me); return me; } catch { return null; }
  }

  async function refreshSettings() {
    try {
      const s = await api.getSettings();
      setSettings(s || {});
      _guardarImpuestoLocal(s);
      _guardarPropinasLocal(s);
      return s;
    } catch {
      // Sin red no hay settings frescos: se recupera al menos la config de
      // impuesto guardada, o la venta offline cobraría sin impuesto y el ticket
      // no coincidiría con lo que registra el backend (BLOQUE 8).
      const cache = await _leerConfigCobroLocal();
      if (cache) setSettings(prev => ({ ...cache, ...prev }));
      return null;
    }
  }

  // ── Config de impuesto para vender SIN internet (BLOQUE 8) ────────────────
  // Solo se cachean estas tres claves: `settings` completo incluye `logo_base64`
  // y no cabe en SecureStore (advierte arriba de ~2KB).
  async function _guardarImpuestoLocal(s) {
    if (!s) return;
    try {
      await SecureStore.setItemAsync('zenit_impuesto', JSON.stringify({
        tax_enabled: s.tax_enabled === true || s.tax_enabled === 'true',
        tax_rate: s.tax_rate ?? 0,
        // Se guarda tal cual (puede venir ausente): el default lo resuelve
        // `configImpuesto`, que es el único lugar que conoce el modo por defecto.
        tax_included: s.tax_included,
        tax_name: s.tax_name || 'IVA',
      }));
    } catch {}
  }

  async function _leerImpuestoLocal() {
    try {
      const raw = await SecureStore.getItemAsync('zenit_impuesto');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ── Config de propinas para cobrar SIN internet (BLOQUE 9) ────────────────
  // Va en su PROPIA clave y no dentro de `zenit_impuesto`: así un equipo que se
  // actualiza estando offline conserva su config de impuesto intacta en vez de
  // perderla por un cambio de formato (y con ella, cobrar sin IVA todo el día).
  // Mismo motivo que el impuesto para cachearla: sin esto, la caja sin señal
  // dejaría de pedir propina y el efectivo del cajón no cuadraría con el corte.
  async function _guardarPropinasLocal(s) {
    if (!s) return;
    try {
      await SecureStore.setItemAsync('zenit_propinas', JSON.stringify({
        propinas_activas: s.propinas_activas === true || s.propinas_activas === 'true',
        propina_sugerencias: normalizarSugerencias(s.propina_sugerencias),
      }));
    } catch {}
  }

  async function _leerPropinasLocal() {
    try {
      const raw = await SecureStore.getItemAsync('zenit_propinas');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Lee de golpe lo que hace falta para cobrar sin red: impuesto + propinas. */
  async function _leerConfigCobroLocal() {
    const [imp, prop] = await Promise.all([_leerImpuestoLocal(), _leerPropinasLocal()]);
    if (!imp && !prop) return null;
    return { ...(imp || {}), ...(prop || {}) };
  }

  // ── Sucursal del dispositivo ────────────────────────────────────────────
  // Lee la sucursal local. La PRIMERA vez hereda la que estuviera en los ajustes del
  // negocio, para no dejar a los equipos ya instalados sin sucursal tras actualizar.
  async function _cargarSucursalDispositivo(s) {
    let guardada = null;
    try { guardada = await SecureStore.getItemAsync('zenit_sucursal_id'); } catch {}
    if (guardada == null && s?.sucursal_id) {
      guardada = String(s.sucursal_id);
      try { await SecureStore.setItemAsync('zenit_sucursal_id', guardada); } catch {}
    }
    const id = parseInt(guardada) || null;
    setSucursalIdState(id);

    try {
      const cache = await SecureStore.getItemAsync('zenit_sucursales_count');
      if (cache) setSucursalesCount(parseInt(cache) || 1);
    } catch {}

    _sincronizarSucursales(id); // sin await: refresca el caché en segundo plano
    return id;
  }

  // Refresca el conteo de sucursales y auto-asigna la única que haya.
  async function _sincronizarSucursales(idActual) {
    try {
      const branches = await api.getBranches();
      if (!Array.isArray(branches) || branches.length === 0) return;

      setSucursalesCount(branches.length);
      try { await SecureStore.setItemAsync('zenit_sucursales_count', String(branches.length)); } catch {}

      // Negocio de un solo local: la sucursal se asigna sola y es invisible.
      if (branches.length === 1 && !idActual) {
        setSucursalIdState(branches[0].id);
        try { await SecureStore.setItemAsync('zenit_sucursal_id', String(branches[0].id)); } catch {}
        return;
      }
      // La sucursal guardada ya no existe (la borraron): dejar el equipo sin asignar
      // para que el usuario elija una en vez de registrar contra una sucursal muerta.
      if (idActual && !branches.some(b => b.id === idActual)) {
        setSucursalIdState(null);
        try { await SecureStore.deleteItemAsync('zenit_sucursal_id'); } catch {}
      }
    } catch {}
  }

  // Cambia la sucursal de este equipo. La pantalla de Ajustes exige la contraseña de
  // administrador ANTES de llamar aquí (es configuración, no una acción de operación).
  async function cambiarSucursalDispositivo(id) {
    const valor = id ? parseInt(id) : null;
    if (valor) await SecureStore.setItemAsync('zenit_sucursal_id', String(valor));
    else await SecureStore.deleteItemAsync('zenit_sucursal_id');
    setSucursalIdState(valor);
  }

  // Portero de registros: sin sucursal elegida y con varias sucursales, este equipo
  // no puede vender ni abrir turno (el backend lo rechazaría y una venta offline se
  // quedaría atorada en la cola).
  function puedeRegistrarEnSucursal() {
    return !!sucursalId || sucursalesCount <= 1;
  }

  // Extrae los permisos efectivos para la sucursal activa.
  // Si hay config específica de la sucursal (__b_ID), la usa.
  // Si hay sucursal pero sin config propia, devuelve solo los defaults de los puestos base (sin heredar custom roles de otras sucursales).
  // Si no hay sucursal, usa la config global.
  function _permisosEfectivos(s, sucursalDispositivo) {
    const sucId = sucursalDispositivo || null;
    const all = s?.permisos_roles || {};
    if (sucId) {
      if (all[`__b_${sucId}`]) return all[`__b_${sucId}`];
      // Sucursal asignada pero sin config propia: solo puestos base con sus defaults globales (sin custom roles)
      const { cajero = {}, encargado = {} } = all;
      return { cajero, encargado };
    }
    return Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('__b_')));
  }

  // Si hay puestos activos → mostrar pantalla de perfiles.
  // Si no hay puestos pero "pedir contraseña" está activo → también mostrar pantalla
  // de perfiles para que el admin ingrese su contraseña ahí.
  // Si no hay puestos y no se pide contraseña → auto-seleccionar admin.
  async function _resolverPerfil(s, sucursalDispositivo) {
    const permisos = _permisosEfectivos(s, sucursalDispositivo);
    const hayPuestosActivos = Object.values(permisos).some(p => p?.enabled === true);
    if (hayPuestosActivos) {
      setProfileReady(false); // PerfilScreen se encarga
      return;
    }
    // Sin puestos: revisar si se pide contraseña al iniciar
    const pedirPwd = await SecureStore.getItemAsync('pedir_password_inicio');
    if (pedirPwd !== 'false') {
      // Mostrar PerfilScreen para que el admin ingrese su contraseña
      setProfileReady(false);
    } else {
      setRolActivo('dueno');
      setNombreActivo('');
      setProfileReady(true);
    }
  }

  // restoreSession: SIEMPRE restaura la sesión del token sin bloquear.
  // La validación de contraseña ocurre más adelante en PerfilScreen.
  async function restoreSession() {
    try {
      const token = await SecureStore.getItemAsync('zenit_token');
      const refreshToken = await SecureStore.getItemAsync('zenit_refresh_token');
      if (token) {
        api.setToken(token);
        if (refreshToken) api.setRefreshToken(refreshToken);
        const me = await api.getMe();
        setUser(me);
        const email = await SecureStore.getItemAsync('zenit_session_email') || '';
        setSessionEmail(email);
        const s = await refreshSettings();
        const sucId = await _cargarSucursalDispositivo(s);
        await _resolverPerfil(s, sucId);
        registrarPushToken(); // sin await
      }
    } catch (e) {
      // Un fallo de RED al validar la sesión NO cierra la sesión: la app tiene que
      // arrancar sin internet para poder vender offline (Fase 1). Antes cualquier
      // error borraba el token, así que abrir la app sin señal deslogueaba al
      // cajero y lo dejaba sin caja. Mismo criterio que el desktop (CLAUDE.md §7).
      const esFalloDeRed = /Sin conexión|tardó mucho|Network request failed/i.test(e?.message || '');
      if (esFalloDeRed) {
        const cache = await _leerConfigCobroLocal();
        if (cache) setSettings(prev => ({ ...cache, ...prev }));
      } else {
        await SecureStore.deleteItemAsync('zenit_token');
        await SecureStore.deleteItemAsync('zenit_refresh_token');
        api.clearToken();
        api.clearRefreshToken();
      }
    } finally {
      setLoading(false);
    }
  }

  // Solicita permisos y registra el push token en el backend
  // Solo funciona en APK/build — en Expo Go (SDK 53+) las push remotas no están disponibles
  async function registrarPushToken() {
    try {
      if (!Device.isDevice) return; // No funciona en simulador

      // Verificar si estamos en Expo Go (no soporta push remotas desde SDK 53)
      const { status: existingStatus } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'denied' }));
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' }));
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        }).catch(() => {});
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '4ff73752-2212-4dc3-9a0a-7e17b603129c',
      });
      const token = tokenData.data;
      pushTokenRef.current = token;
      await SecureStore.setItemAsync('zenit_push_token', token);
      await api.registerPushToken(token);
    } catch (err) {
      // Silencioso en Expo Go — las notificaciones remotas funcionarán en el APK final
      console.log('[Push] No disponible en este entorno:', err.message);
    }
  }

  async function loginOwner(username, password) {
    const data = await api.login(username, password);
    await SecureStore.setItemAsync('zenit_token', data.token);
    if (data.refreshToken) await SecureStore.setItemAsync('zenit_refresh_token', data.refreshToken);
    await SecureStore.setItemAsync('zenit_session_email', username);
    await SecureStore.setItemAsync('zenit_login_type', 'owner');
    api.setToken(data.token);
    if (data.refreshToken) api.setRefreshToken(data.refreshToken);
    setUser(data.user);
    setSessionEmail(username);
    const s = await refreshSettings();
    const sucId = await _cargarSucursalDispositivo(s);
    await _resolverPerfil(s, sucId);
    registrarPushToken(); // sin await — no bloquea el login
    return data.user;
  }

  // Crea una cuenta nueva de dueño y deja la sesión iniciada (el backend devuelve
  // token + refreshToken, igual que login).
  async function registerOwner(name, email, password) {
    // La zona del dispositivo viaja en el registro para que el dashboard corte el
    // día en hora local desde el primer día (se puede cambiar luego en Ajustes).
    const data = await api.register(name, email, password, zonaDelDispositivo());
    await SecureStore.setItemAsync('zenit_token', data.token);
    if (data.refreshToken) await SecureStore.setItemAsync('zenit_refresh_token', data.refreshToken);
    await SecureStore.setItemAsync('zenit_session_email', email);
    await SecureStore.setItemAsync('zenit_login_type', 'owner');
    api.setToken(data.token);
    if (data.refreshToken) api.setRefreshToken(data.refreshToken);
    setUser(data.user);
    setSessionEmail(email);
    const s = await refreshSettings();
    const sucId = await _cargarSucursalDispositivo(s);
    await _resolverPerfil(s, sucId);
    registrarPushToken(); // sin await
    return data.user;
  }

  // Valida la contraseña del admin contra el backend SIN cambiar el estado de perfil.
  // Lo llama PerfilScreen después de seleccionar el perfil admin.
  async function verificarPasswordAdmin(password) {
    const email = sessionEmail;
    if (!email) throw new Error('No hay sesión activa. Cierra sesión e inicia de nuevo.');
    const data = await api.login(email, password);
    // Actualizar token sin tocar el estado de perfil
    await SecureStore.setItemAsync('zenit_token', data.token);
    if (data.refreshToken) await SecureStore.setItemAsync('zenit_refresh_token', data.refreshToken);
    api.setToken(data.token);
    if (data.refreshToken) api.setRefreshToken(data.refreshToken);
    setUser(data.user);
  }

  function seleccionarPerfil(rol, nombre) {
    setRolActivo(rol);
    setNombreActivo(nombre || '');
    setProfileReady(true);
  }

  function cambiarPerfil() {
    setRolActivo(null);
    setNombreActivo('');
    setProfileReady(false);
  }

  async function logout() {
    // Eliminar push token del backend antes de cerrar sesión
    try {
      const token = pushTokenRef.current || await SecureStore.getItemAsync('zenit_push_token');
      if (token) await api.unregisterPushToken(token);
    } catch {}
    await SecureStore.deleteItemAsync('zenit_token');
    await SecureStore.deleteItemAsync('zenit_refresh_token');
    await SecureStore.deleteItemAsync('zenit_push_token');
    // La sucursal es del dispositivo, pero está atada a ESTE negocio: si se inicia
    // sesión con otra cuenta el id no significaría nada. Se vuelve a resolver al entrar
    // (se auto-asigna sola si el negocio tiene una única sucursal).
    await SecureStore.deleteItemAsync('zenit_sucursal_id').catch(() => {});
    await SecureStore.deleteItemAsync('zenit_sucursales_count').catch(() => {});
    setSucursalIdState(null);
    setSucursalesCount(1);
    // La config de impuesto es del negocio que se acaba de cerrar: no significa
    // nada en otra cuenta (mismo criterio que la sucursal del equipo, §24).
    SecureStore.deleteItemAsync('zenit_impuesto').catch(() => {});
    SecureStore.deleteItemAsync('zenit_propinas').catch(() => {});
    pushTokenRef.current = null;
    api.clearToken();
    api.clearRefreshToken();
    setUser(null);
    setSettings({});
    setRolActivo(null);
    setNombreActivo('');
    setProfileReady(false);
    setSessionEmail('');
  }

  const isOwner = user?.role === 'owner';
  // sucursalId viene del estado local del dispositivo (no de settings del negocio)
  const permisosRolesEfectivos = _permisosEfectivos(settings, sucursalId);

  // Premium activo: misma regla que el backend (middleware/checkPlan.js) —
  // el plan debe ser premium o trial Y la fecha de vencimiento debe estar en el futuro.
  // Sin esto, un premium vencido vería pantallas vacías en vez del bloqueo.
  const isPremium = (() => {
    if (user?.plan !== 'premium' && user?.plan !== 'trial') return false;
    if (!user?.plan_expires_at) return false;
    return new Date(user.plan_expires_at) > new Date();
  })();

  return (
    <AuthContext.Provider value={{
      user, settings, loading, isOwner, isPremium, sucursalId, permisosRolesEfectivos,
      sucursalesCount, cambiarSucursalDispositivo, puedeRegistrarEnSucursal,
      rolActivo, nombreActivo, profileReady, sessionEmail,
      loginOwner, registerOwner, logout,
      verificarPasswordAdmin,
      refreshUser, refreshSettings,
      seleccionarPerfil, cambiarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
