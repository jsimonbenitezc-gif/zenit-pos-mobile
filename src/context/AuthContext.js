import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '../api/client';

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
  const pushTokenRef = useRef(null);

  useEffect(() => { restoreSession(); }, []);

  async function refreshUser() {
    try { const me = await api.getMe(); if (me) setUser(me); return me; } catch { return null; }
  }

  async function refreshSettings() {
    try { const s = await api.getSettings(); setSettings(s || {}); return s; } catch { return null; }
  }

  // Extrae los permisos efectivos para la sucursal activa.
  // Si hay config específica de la sucursal (__b_ID), la usa.
  // Si hay sucursal pero sin config propia, devuelve solo los defaults de los puestos base (sin heredar custom roles de otras sucursales).
  // Si no hay sucursal, usa la config global.
  function _permisosEfectivos(s) {
    const sucId = s?.sucursal_id || null;
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
  async function _resolverPerfil(s) {
    const permisos = _permisosEfectivos(s);
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
      if (token) {
        api.setToken(token);
        const me = await api.getMe();
        setUser(me);
        const email = await SecureStore.getItemAsync('zenit_session_email') || '';
        setSessionEmail(email);
        const s = await refreshSettings();
        await _resolverPerfil(s);
        registrarPushToken(); // sin await
      }
    } catch {
      await SecureStore.deleteItemAsync('zenit_token');
      api.clearToken();
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
    await SecureStore.setItemAsync('zenit_session_email', username);
    await SecureStore.setItemAsync('zenit_login_type', 'owner');
    api.setToken(data.token);
    setUser(data.user);
    setSessionEmail(username);
    const s = await refreshSettings();
    await _resolverPerfil(s);
    registrarPushToken(); // sin await — no bloquea el login
    return data.user;
  }

  async function loginStaff(username, password) {
    const data = await api.staffLogin(username, password);
    await SecureStore.setItemAsync('zenit_token', data.token);
    await SecureStore.setItemAsync('zenit_session_email', username);
    await SecureStore.setItemAsync('zenit_login_type', 'staff');
    api.setToken(data.token);
    setUser(data.user);
    setSessionEmail(username);
    const s = await refreshSettings();
    await _resolverPerfil(s);
    registrarPushToken(); // sin await — no bloquea el login
    return data.user;
  }

  // Valida la contraseña del admin contra el backend SIN cambiar el estado de perfil.
  // Lo llama PerfilScreen después de seleccionar el perfil admin.
  async function verificarPasswordAdmin(password) {
    const email = sessionEmail;
    if (!email) throw new Error('No hay sesión activa. Cierra sesión e inicia de nuevo.');
    const loginType = await SecureStore.getItemAsync('zenit_login_type') || 'owner';
    let data;
    if (loginType === 'staff') {
      data = await api.staffLogin(email, password);
    } else {
      data = await api.login(email, password);
    }
    // Actualizar token sin tocar el estado de perfil
    await SecureStore.setItemAsync('zenit_token', data.token);
    api.setToken(data.token);
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
    await SecureStore.deleteItemAsync('zenit_push_token');
    pushTokenRef.current = null;
    api.clearToken();
    setUser(null);
    setSettings({});
    setRolActivo(null);
    setNombreActivo('');
    setProfileReady(false);
    setSessionEmail('');
  }

  const isOwner = user?.role === 'owner';
  const sucursalId = settings?.sucursal_id || null;
  const permisosRolesEfectivos = _permisosEfectivos(settings);

  return (
    <AuthContext.Provider value={{
      user, settings, loading, isOwner, sucursalId, permisosRolesEfectivos,
      rolActivo, nombreActivo, profileReady, sessionEmail,
      loginOwner, loginStaff, logout,
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
