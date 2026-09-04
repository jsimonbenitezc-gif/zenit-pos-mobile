// ============================================================================
// src/context/NetworkContext.js
// Estado global de conectividad (vía NetInfo) + conteo de ventas por subir.
// Alimenta el indicador visual y dispara el sync al reconectar.
// ============================================================================
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { contarPendientes } from '../offline/db';

const NetworkContext = createContext({
  online: true,
  pendientes: 0,
  refrescarPendientes: () => {},
  // Devuelve una función de baja, igual que la real: quien la llame desde un
  // useEffect hace `return registrarOnReconnect(...)` y no puede quedarse con un
  // `undefined` que React intentaría ejecutar al desmontar.
  registrarOnReconnect: () => () => {},
});

export function NetworkProvider({ children }) {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  // Qué hacer al volver la conexión. Es un CONJUNTO y no un solo callback: hay
  // más de un interesado (subir las ventas encoladas y, si la sesión se restauró
  // sin red, refrescar perfil y ajustes). Con una sola referencia, el segundo que
  // se registrara borraba al primero en silencio.
  const onReconnectRef = useRef(new Set());
  const prevOnline = useRef(true);

  const refrescarPendientes = useCallback(async () => {
    try { setPendientes(await contarPendientes()); } catch { /* BD aún no lista */ }
  }, []);

  // Registra "qué hacer cuando volvamos a estar online". Devuelve la función para
  // darse de baja (útil desde un useEffect).
  const registrarOnReconnect = useCallback((fn) => {
    if (typeof fn !== 'function') return () => {};
    onReconnectRef.current.add(fn);
    return () => { onReconnectRef.current.delete(fn); };
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // Consideramos "online" solo si hay conexión y la accesibilidad no es explícitamente falsa.
      const ahora = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(ahora);
      // Transición offline → online: avisar a todos los interesados. Cada uno se
      // aísla en su propio catch: que uno falle no puede dejar a los demás sin
      // ejecutarse (subir las ventas pendientes es lo último que se puede perder).
      if (ahora && !prevOnline.current) {
        for (const fn of onReconnectRef.current) {
          Promise.resolve().then(fn).catch(() => {});
        }
      }
      prevOnline.current = ahora;
    });
    refrescarPendientes();
    return () => { try { unsub(); } catch {} };
  }, [refrescarPendientes]);

  return (
    <NetworkContext.Provider value={{ online, pendientes, refrescarPendientes, registrarOnReconnect }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
