import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';

export default function LoginScreen() {
  const { loginOwner } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) {
      Alert.alert('Campos requeridos', 'Ingresa tu correo y contraseña.');
      return;
    }
    setLoading(true);
    try {
      await loginOwner(username.trim(), password);
    } catch (e) {
      Alert.alert('Error al iniciar sesión', friendlyError(e) || 'Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Image source={require('../../../assets/icon.png')} style={styles.logoImg} resizeMode="contain" />
          <Text style={styles.appName}>Zenit POS</Text>
          <Text style={styles.subtitle}>Sistema de punto de venta</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnLoginText}>Entrar</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Zenit POS · Todos los derechos reservados</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center' },
  header:           { alignItems: 'center', marginBottom: spacing.xxl },
  logoImg:          { width: 90, height: 90, marginBottom: spacing.md },
  appName:          { fontSize: font.xxl + 4, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle:         { fontSize: font.md, color: colors.textSecondary, marginTop: spacing.xs },
  form:             { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  label:            { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background },
  btnLogin:         { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnLoginText:     { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  footer:           { textAlign: 'center', color: colors.textMuted, fontSize: font.sm - 1, marginTop: spacing.xxl },
});
