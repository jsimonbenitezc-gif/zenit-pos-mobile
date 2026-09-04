import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { api } from '../api/client';
import { zonaDelDispositivo } from '../utils/tz';
import { normalizarSugerencias } from '../utils/propinas';
import { useNetwork } from './NetworkContext';
import { guardarSesionLocal, leerSesionLocal, limpiarSesionLocal } from '../offline/db';
import { leerAjustesLocales, guardarAjustesLocales, borrarNegocioLocal, fijarModoLocal } from '../offline/local';
import {
  esErrorDeRed, guardarVerificadorAdmin, verificarPasswordAdminLocal,
  hayVerificadorAdmin, borrarVerificadorAdmin, cargarBloqueoPin, resetFallosPin,
} from '../offline/credenciales';

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
  // Hay sesión guardada pero NO se pudo reconstruir: ni el servidor respondió ni
  // hay caché local (equipo que se quedó sin internet antes de su primer arranque
  // completo). Es el único caso en el que la app se detiene, y lo dice con todas
  // sus letras en vez de mandar al login —que también necesita red— o, peor, de
  // adivinar los permisos.
  const [arranqueSinCache, setArranqueSinCache] = useState(false);
  // La sesión actual se restauró del caché: no se ha hablado con el servidor.
  const [sesionRestauradaOffline, setSesionRestauradaOffline] = useState(false);
  // MODO LOCAL (BLOQUE 18): el negocio SIN CUENTA. El aparato es la única fuente
  // de verdad y no se habla con el servidor en ningún momento. No es lo mismo que
  // "estar sin internet con una cuenta": aquí no hay cuenta que sincronizar.
  const [modoLocal, setModoLocal] = useState(false);
  const pushTokenRef = useRef(null);
  // AuthProvider vive DENTRO de NetworkProvider (App.js), así que puede
  // engancharse a la vuelta de la conexión.
  const { registrarOnReconnect } = useNetwork();

  useEffect(() => {
    cargarBloqueoPin();  // el bloqueo por PINes fallidos sobrevive a cerrar la app
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
    try {
      const me = await api.getMe();
      if (me) { setUser(me); guardarSesionLocal('perfil', me); }
      return me;
    } catch { return null; }
  }

  // Si la sesión se restauró SIN red, el perfil y los ajustes que se están usando
  // son los que había guardados: un plan vencido, un puesto nuevo o una tasa de
  // impuesto cambiada no se verían hasta reiniciar la app. Al volver la conexión
  // se refrescan solos.
  useEffect(() => {
    if (!sesionRestauradaOffline) return;
    return registrarOnReconnect(async () => {
      if (!api.token) return;
      const me = await refreshUser();
      const s  = await refreshSettings();
      if (me && s) setSesionRestauradaOffline(false);
    });
  }, [sesionRestauradaOffline, registrarOnReconnect]);

  /**
   * Trae los ajustes del negocio y los cachea. Sin red los recupera del caché.
   *
   * ⚠️ CONTRATO IMPORTANTE: devuelve los ajustes COMPLETOS (los del servidor o los
   * cacheados) o **`undefined` cuando no pudo leerlos**. Esa distinción es de
   * SEGURIDAD: `_resolverPerfil` lee `permisos_roles` de aquí, y unos ajustes
   * incompletos se interpretarían como "este negocio no tiene puestos" — que es
   * justo el camino que auto-selecciona al dueño. Nunca devuelvas `{}` desde aquí.
   */
  async function refreshSettings() {
    // En modo local no hay servidor al que preguntar: los ajustes SON los del
    // aparato. Se devuelven igual (nunca `undefined`), porque sí se pudieron leer.
    if (modoLocal) {
      const ajustes = await leerAjustesLocales();
      setSettings(ajustes);
      return ajustes;
    }
    try {
      const s = await api.getSettings();
      setSettings(s || {});
      // Caché COMPLETO (incluye permisos_roles y el logo): es lo que permite
      // reconstruir el arranque sin internet. Va en SQLite, no en SecureStore,
      // porque no cabe. Sin await: cachear no puede retrasar la pantalla.
      guardarSesionLocal('settings', s || {});
      _guardarImpuestoLocal(s);
      _guardarPropinasLocal(s);
      return s || {};
    } catch {
      const cache = await leerSesionLocal('settings');
      if (cache) {
        setSettings(cache);
        return cache;
      }
      // No hay caché completo (equipo que se actualizó estando offline y todavía
      // no ha arrancado con red). Se recupera al menos la config de cobro, o la
      // venta offline cobraría sin impuesto y el ticket no coincidiría con lo que
      // registra el backend (BLOQUE 8). Pero esto NO son los ajustes completos:
      // se devuelve `undefined` para que nadie los confunda con ellos.
      const parcial = await _leerConfigCobroLocal();
      if (parcial) setSettings(prev => ({ ...parcial, ...prev }));
      return undefined;
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
  //
  // 🔴 REGLA DE SEGURIDAD: solo se llama con ajustes que se pudieron LEER de
  // verdad (del servidor o del caché completo). Con unos ajustes vacíos esta
  // función concluye "no hay puestos activos" y, si el equipo tiene apagado
  // `pedir_password_inicio`, entra sola como DUEÑO: cualquiera que abriera la app
  // sin señal tendría acceso de administrador. "No pude leer los puestos" y "este
  // negocio no tiene puestos" NO son lo mismo, y quien llama es responsable de
  // distinguirlos (ver `restoreSession`).
  async function _resolverPerfil(s, sucursalDispositivo) {
    // Cerrojo en el único punto que decide esto: sin ajustes legibles no se
    // resuelve nada solo — se pide el perfil de forma explícita. Es la diferencia
    // entre "no hay puestos" y "no pude leerlos", y ponerla aquí evita depender de
    // que los cuatro sitios que llaman se acuerden.
    if (!s) { setProfileReady(false); return; }
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
  //
  // ⚠️ ESTE ES EL CAMINO QUE TIENE QUE FUNCIONAR SIN INTERNET. Antes llamaba a
  // `api.getMe()` ANTES de `setUser(me)`, así que sin señal la excepción saltaba
  // primero, `user` quedaba en null y la app mostraba el login — que también
  // necesita red. El cajero se quedaba sin caja, justo lo contrario de lo que
  // promete el soporte offline (CLAUDE.md §13). Ahora el usuario y los ajustes se
  // recuperan del caché local cuando el servidor no contesta.
  async function restoreSession() {
    try {
      // MODO LOCAL primero: si el aparato trabaja sin cuenta, no hay nada que
      // preguntarle a nadie. Va ANTES del token a propósito — despertar el
      // servidor o mirar una sesión vieja no tendría ningún sentido aquí.
      if ((await SecureStore.getItemAsync('zenit_modo_local')) === 'true') {
        await _activarModoLocal();
        return;
      }

      const token = await SecureStore.getItemAsync('zenit_token');
      const refreshToken = await SecureStore.getItemAsync('zenit_refresh_token');
      if (!token) return;                       // sin sesión → pantalla de login, como siempre

      api.ping(); // despertar el servidor de Render en segundo plano (arranca dormido)
      api.setToken(token);
      if (refreshToken) api.setRefreshToken(refreshToken);
      const email = await SecureStore.getItemAsync('zenit_session_email') || '';
      setSessionEmail(email);

      // 1) El usuario. Un fallo de RED cae al caché; un rechazo REAL del servidor
      //    (sesión expirada) se propaga al catch y sí cierra la sesión.
      let me = null;
      let conRed = true;
      try {
        me = await api.getMe();
        guardarSesionLocal('perfil', me); // sin await
      } catch (e) {
        if (!esErrorDeRed(e)) throw e;
        conRed = false;
        me = (await leerSesionLocal('perfil')) || null;
      }

      // 2) Los ajustes (incluidos los puestos). `undefined` = no se pudieron leer.
      const s = await refreshSettings();
      const sucId = await _cargarSucursalDispositivo(s || {});

      // 3) Sin usuario o sin ajustes no hay con qué reconstruir la sesión. Se
      //    DETIENE con un mensaje honesto: adivinar los permisos aquí es lo que
      //    regalaba acceso de dueño, y mandar al login sería mentir (el login
      //    también necesita internet).
      if (!me || !s) {
        setArranqueSinCache(true);
        return;
      }

      setSesionRestauradaOffline(!conRed);
      setUser(me);
      await _resolverPerfil(s, sucId);
      if (conRed) registrarPushToken(); // sin await
    } catch (e) {
      await SecureStore.deleteItemAsync('zenit_token');
      await SecureStore.deleteItemAsync('zenit_refresh_token');
      api.clearToken();
      api.clearRefreshToken();
    } finally {
      setLoading(false);
    }
  }

  // ── MODO LOCAL (BLOQUE 18, Etapa 1) ───────────────────────────────────────
  // Un negocio sin cuenta: una sola persona, sin puestos ni PINes (esos vienen
  // con la cuenta). Se construye un usuario sintético para que el resto de la app
  // —que ya sabe trabajar con `user`, `settings` y `rolActivo`— funcione igual
  // sin tener que enterarse de en qué modo está.
  async function _activarModoLocal() {
    fijarModoLocal(true);   // avisa a la capa de venta/catálogo, que no ve el contexto
    const ajustes = await leerAjustesLocales();
    setModoLocal(true);
    setUser({ id: null, name: ajustes.business_name || 'Mi negocio', email: '', role: 'owner', plan: 'free', _local: true });
    setSettings(ajustes);
    setSessionEmail('');
    setRolActivo('dueno');
    setNombreActivo('');
    setProfileReady(true);   // sin puestos que elegir: se entra directo a vender
    setArranqueSinCache(false);
    setSesionRestauradaOffline(false);
  }

  /** Empieza a usar la app sin cuenta (enlace de la pantalla de login). */
  async function entrarModoLocal() {
    await SecureStore.setItemAsync('zenit_modo_local', 'true');
    await _activarModoLocal();
  }

  /**
   * Sale del modo local para poder iniciar sesión o registrarse.
   * @param {boolean} borrarTodo  true = además borra el negocio local.
   *
   * ⚠️ Salir NO borra nada por defecto: los datos siguen ahí si vuelve. Borrar es
   * una decisión aparte y la pantalla tiene que advertirla con todas sus letras —
   * aquí no hay respaldo en la nube que lo recupere.
   */
  async function salirModoLocal(borrarTodo = false) {
    if (borrarTodo) await borrarNegocioLocal();
    await SecureStore.deleteItemAsync('zenit_modo_local');
    fijarModoLocal(false);
    setModoLocal(false);
    setUser(null);
    setSettings({});
    setRolActivo(null);
    setNombreActivo('');
    setProfileReady(false);
  }

  /** Guarda ajustes del negocio local (nombre, moneda, impuesto, propinas…). */
  async function guardarAjustesLocal(parciales) {
    const nuevos = await guardarAjustesLocales(parciales);
    setSettings(nuevos);
    if (parciales?.business_name) {
      setUser((prev) => (prev ? { ...prev, name: parciales.business_name } : prev));
    }
    return nuevos;
  }

  // Reintenta el arranque cuando se quedó sin caché (botón de la pantalla de
  // bloqueo, para cuando vuelve la señal).
  async function reintentarArranque() {
    setArranqueSinCache(false);
    setLoading(true);
    await restoreSession();
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
    setArranqueSinCache(false);
    setSesionRestauradaOffline(false);
    guardarSesionLocal('perfil', data.user); // sin await
    // El servidor acaba de confirmar esta contraseña: se guarda un verificador
    // para poder repetir la comprobación sin internet (ver offline/credenciales).
    guardarVerificadorAdmin(username, password);
    const s = await refreshSettings();
    const sucId = await _cargarSucursalDispositivo(s || {});
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
    setArranqueSinCache(false);
    setSesionRestauradaOffline(false);
    guardarSesionLocal('perfil', data.user);   // sin await
    guardarVerificadorAdmin(email, password);  // para entrar como admin sin red
    const s = await refreshSettings();
    const sucId = await _cargarSucursalDispositivo(s || {});
    await _resolverPerfil(s, sucId);
    registrarPushToken(); // sin await
    return data.user;
  }

  // Valida la contraseña del admin SIN cambiar el estado de perfil.
  // Lo llama PerfilScreen después de seleccionar el perfil admin.
  //
  // Online la valida el backend (fuente de verdad, y de paso renueva el token).
  // Si falla la RED se compara contra el verificador que se guardó la última vez
  // que el servidor SÍ confirmó esta contraseña: sin esto, el dueño de un negocio
  // de una sola persona —sin puestos configurados, que es el caso por defecto— no
  // podía entrar a su propia caja sin internet.
  async function verificarPasswordAdmin(password) {
    const email = sessionEmail;
    if (!email) throw new Error('No hay sesión activa. Cierra sesión e inicia de nuevo.');
    try {
      const data = await api.login(email, password);
      // Actualizar token sin tocar el estado de perfil
      await SecureStore.setItemAsync('zenit_token', data.token);
      if (data.refreshToken) await SecureStore.setItemAsync('zenit_refresh_token', data.refreshToken);
      api.setToken(data.token);
      if (data.refreshToken) api.setRefreshToken(data.refreshToken);
      setUser(data.user);
      guardarSesionLocal('perfil', data.user);      // sin await
      guardarVerificadorAdmin(email, password);     // refresca el verificador local
      setSesionRestauradaOffline(false);
    } catch (e) {
      // Una contraseña incorrecta la rechaza el servidor y se propaga tal cual:
      // el fallback es SOLO para cuando no hubo forma de preguntar.
      if (!esErrorDeRed(e)) throw e;
      if (!(await hayVerificadorAdmin())) {
        throw new Error('Sin conexión. Este equipo todavía no puede validar tu contraseña sin internet: conéctate una vez e inténtalo de nuevo.');
      }
      const ok = await verificarPasswordAdminLocal(password, email);
      if (!ok) {
        throw new Error('Contraseña incorrecta. Sin conexión se comprueba contra la última contraseña que usaste en este equipo.');
      }
    }
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
    // Perfil, ajustes (con los PINes de los puestos) y catálogo cacheados: todo
    // es del negocio que se acaba de cerrar. Mismo criterio que el desktop, que
    // borra sus datos locales al cerrar sesión (CLAUDE.md §13).
    // ⚠️ Las ventas pendientes de subir NO se borran: es dinero ya cobrado.
    await limpiarSesionLocal();
    await borrarVerificadorAdmin();
    resetFallosPin();
    pushTokenRef.current = null;
    api.clearToken();
    api.clearRefreshToken();
    setUser(null);
    setSettings({});
    setRolActivo(null);
    setNombreActivo('');
    setProfileReady(false);
    setSessionEmail('');
    setArranqueSinCache(false);
    setSesionRestauradaOffline(false);
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
      arranqueSinCache, sesionRestauradaOffline, reintentarArranque,
      modoLocal, entrarModoLocal, salirModoLocal, guardarAjustesLocal,
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
