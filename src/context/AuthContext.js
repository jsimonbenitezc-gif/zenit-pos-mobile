import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Al arrancar la app: intenta restaurar la sesión guardada
  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const token = await SecureStore.getItemAsync('zenit_token');
      if (token) {
        api.setToken(token);
        const me = await api.getMe();
        setUser(me);
      }
    } catch {
      await SecureStore.deleteItemAsync('zenit_token');
      api.clearToken();
    } finally {
      setLoading(false);
    }
  }

  async function loginOwner(username, password) {
    const data = await api.login(username, password);
    await SecureStore.setItemAsync('zenit_token', data.token);
    api.setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function loginStaff(username, password) {
    const data = await api.staffLogin(username, password);
    await SecureStore.setItemAsync('zenit_token', data.token);
    api.setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await SecureStore.deleteItemAsync('zenit_token');
    api.clearToken();
    setUser(null);
  }

  const isOwner = user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, loading, isOwner, loginOwner, loginStaff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
