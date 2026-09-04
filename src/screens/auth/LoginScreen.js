import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';

export default function LoginScreen({ navigation }) {
  const { loginOwner, entrarModoLocal } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [entrandoLocal, setEntrandoLocal] = useState(false);

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

  async function handleLocal() {
    setEntrandoLocal(true);
    try { await entrarModoLocal(); }
    catch (e) { Alert.alert('Error', 'No se pudo iniciar el modo sin cuenta.'); setEntrandoLocal(false); }
  }

  async function handleForgot() {
    const email = username.trim();
    if (!email) {
      Alert.alert('Escribe tu correo', 'Ingresa tu correo electrónico arriba y vuelve a pulsar "¿Olvidaste tu contraseña?".');
      return;
    }
    setEnviandoReset(true);
    try {
      const r = await api.forgotPassword(email);
      Alert.alert(
        'Revisa tu correo',
        (r && r.message) || 'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.'
      );
    } catch (e) {
      Alert.alert('No se pudo enviar', friendlyError(e) || 'Intenta de nuevo en unos minutos.');
    } finally {
      setEnviandoReset(false);
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

          <TouchableOpacity style={styles.forgotLink} onPress={handleForgot} disabled={loading || enviandoReset}>
            {enviandoReset
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.registerLink} onPress={() => navigation.navigate('Register')} disabled={loading}>
            <Text style={styles.registerText}>¿No tienes cuenta? <Text style={styles.registerStrong}>Crear cuenta</Text></Text>
          </TouchableOpacity>
        </View>

        {/* Empezar sin cuenta (BLOQUE 18). Es la razón de ser del modo local: el
            muro de registro se lleva por delante a la mayoría de las descargas,
            y no por falta de internet sino por el trámite. Aquí se vende y se
            cobra en un minuto; la cuenta llega cuando el negocio la necesite. */}
        <View style={styles.separadorLocal}>
          <View style={styles.linea} />
          <Text style={styles.separadorTexto}>o</Text>
          <View style={styles.linea} />
        </View>

        <TouchableOpacity style={styles.btnLocal} onPress={handleLocal} disabled={loading || entrandoLocal}>
          {entrandoLocal
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={styles.btnLocalText}>Empezar sin cuenta</Text>}
        </TouchableOpacity>
        <Text style={styles.btnLocalNota}>
          Vende y cobra desde ya, sin internet. Tus datos se guardan en este teléfono.
        </Text>

        <Text style={styles.footer}>Zenit POS · Todos los derechos reservados</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center' },
  separadorLocal:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  linea:            { flex: 1, height: 1, backgroundColor: colors.border },
  separadorTexto:   { color: colors.textMuted, fontSize: font.sm },
  btnLocal:         { marginTop: spacing.lg, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center' },
  btnLocalText:     { color: colors.primary, fontSize: font.lg, fontWeight: '700' },
  btnLocalNota:     { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  header:           { alignItems: 'center', marginBottom: spacing.xxl },
  logoImg:          { width: 90, height: 90, marginBottom: spacing.md },
  appName:          { fontSize: font.xxl + 4, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle:         { fontSize: font.md, color: colors.textSecondary, marginTop: spacing.xs },
  form:             { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  label:            { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background },
  btnLogin:         { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnLoginText:     { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  forgotLink:       { alignItems: 'center', marginTop: spacing.md, minHeight: 20, justifyContent: 'center' },
  forgotText:       { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  registerLink:     { alignItems: 'center', marginTop: spacing.lg },
  registerText:     { color: colors.textSecondary, fontSize: font.md },
  registerStrong:   { color: colors.primary, fontWeight: '700' },
  footer:           { textAlign: 'center', color: colors.textMuted, fontSize: font.sm - 1, marginTop: spacing.xxl },
});
