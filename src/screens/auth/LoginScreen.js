import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

export default function LoginScreen() {
  const { loginOwner, loginStaff } = useAuth();

  const [modo, setModo]         = useState('owner'); // 'owner' | 'staff'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) {
      Alert.alert('Campos requeridos', 'Ingresa tu usuario y contraseña.');
      return;
    }
    setLoading(true);
    try {
      if (modo === 'owner') {
        await loginOwner(username.trim(), password);
      } else {
        await loginStaff(username.trim(), password);
      }
    } catch (e) {
      Alert.alert('Error al iniciar sesión', e.message || 'Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo / Nombre */}
        <View style={styles.header}>
          <Text style={styles.logo}>⚡</Text>
          <Text style={styles.appName}>Zenit POS</Text>
          <Text style={styles.subtitle}>Sistema de punto de venta</Text>
        </View>

        {/* Selector de tipo de usuario */}
        <View style={styles.modoSelector}>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'owner' && styles.modoBtnActive]}
            onPress={() => setModo('owner')}
          >
            <Text style={[styles.modoBtnText, modo === 'owner' && styles.modoBtnTextActive]}>
              Dueño
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modoBtn, modo === 'staff' && styles.modoBtnActive]}
            onPress={() => setModo('staff')}
          >
            <Text style={[styles.modoBtnText, modo === 'staff' && styles.modoBtnTextActive]}>
              Empleado
            </Text>
          </TouchableOpacity>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <Text style={styles.label}>
            {modo === 'owner' ? 'Correo electrónico' : 'Usuario'}
          </Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder={modo === 'owner' ? 'correo@ejemplo.com' : 'mi.usuario'}
            keyboardType={modo === 'owner' ? 'email-address' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.btnLogin, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnLoginText}>Entrar</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Zenit POS · Todos los derechos reservados</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    fontSize: 52,
    marginBottom: spacing.sm,
  },
  appName: {
    fontSize: font.xxl + 4,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: font.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  modoSelector: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.lg,
    padding: 3,
    marginBottom: spacing.xl,
  },
  modoBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modoBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modoBtnText: {
    fontSize: font.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modoBtnTextActive: {
    color: colors.textPrimary,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: font.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  btnLogin: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnLoginText: {
    color: '#fff',
    fontSize: font.lg,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: font.sm - 1,
    marginTop: spacing.xxl,
  },
});
