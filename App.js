import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider, useNetwork } from './src/context/NetworkContext';
import { initDB } from './src/offline/db';
import { sincronizarVentasPendientes } from './src/offline/ventasOffline';
import Navigation from './src/navigation';

// Inicializa la BD local y registra el sync automático al reconectar.
// No renderiza nada.
function OfflineBootstrap() {
  const { registrarOnReconnect, refrescarPendientes } = useNetwork();
  useEffect(() => {
    initDB().catch(() => {});
    // Intento inicial (si ya hay sesión). sincronizarVentasPendientes ignora si no hay token.
    sincronizarVentasPendientes().then(() => refrescarPendientes?.()).catch(() => {});
    // Al volver la conexión: subir pendientes y refrescar el conteo.
    // `registrarOnReconnect` devuelve la baja: no es el único interesado en la
    // reconexión (AuthContext también se engancha para refrescar una sesión que
    // se restauró sin red).
    return registrarOnReconnect(async () => {
      await sincronizarVentasPendientes();
      refrescarPendientes?.();
    });
  }, []);
  return null;
}

export default function App() {
  // Orientación: los teléfonos se quedan en vertical; las tablets pueden rotar
  // (los POS en tablet se usan casi siempre en horizontal sobre un soporte).
  useEffect(() => {
    (async () => {
      try {
        const tipo = await Device.getDeviceTypeAsync();
        if (tipo === Device.DeviceType.TABLET) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch {
        // Si el módulo no está disponible (ej. web), se usa la orientación por defecto
      }
    })();
  }, []);

  return (
    <ErrorBoundary>
      <NetworkProvider>
        <AuthProvider>
          <OfflineBootstrap />
          <StatusBar style="dark" />
          <Navigation />
        </AuthProvider>
      </NetworkProvider>
    </ErrorBoundary>
  );
}
