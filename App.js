import React from 'react';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </ErrorBoundary>
  );
}
