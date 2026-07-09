import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation';

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
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </ErrorBoundary>
  );
}
