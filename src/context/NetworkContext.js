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
});

export function NetworkProvider({ children }) {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  // Callback opcional que el motor de sync registra para dispararse al reconectar.
  const onReconnectRef = useRef(null);
  const prevOnline = useRef(true);

  const refrescarPendientes = useCallback(async () => {
    try { setPendientes(await contarPendientes()); } catch { /* BD aún no lista */ }
  }, []);

  // Permite al motor de sync registrar "qué hacer cuando volvamos a estar online".
  const registrarOnReconnect = useCallback((fn) => {
    onReconnectRef.current = fn;
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // Consideramos "online" solo si hay conexión y la accesibilidad no es explícitamente falsa.
      const ahora = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(ahora);
      // Transición offline → online: disparar sync.
      if (ahora && !prevOnline.current && onReconnectRef.current) {
        Promise.resolve(onReconnectRef.current()).catch(() => {});
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
