import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';
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
        <StatusBar style="light" />
        <View style={styles.banda} />

        <View style={styles.header}>
          <View style={styles.logoCaja}>
            <Image source={require('../../../assets/icon.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
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

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: zc.fondo, padding: spacing.xl, paddingTop: 84 },
  // La franja azul noche de arriba (diseño A); la tarjeta del formulario se monta encima
  banda:            { position: 'absolute', top: 0, left: 0, right: 0, height: 330, backgroundColor: zc.noche, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  separadorLocal:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  linea:            { flex: 1, height: 1, backgroundColor: '#dde2ea' },
  separadorTexto:   { color: zc.grisSuave, fontSize: 13.5 },
  btnLocal:         { marginTop: spacing.lg, backgroundColor: zc.tarjeta, borderRadius: radios.boton, padding: 15, alignItems: 'center', ...sombra },
  btnLocalText:     { color: zc.azul, fontSize: 16, fontWeight: '500' },
  btnLocalNota:     { color: zc.grisSuave, fontSize: 13, textAlign: 'center', marginTop: spacing.sm, lineHeight: 19 },
  header:           { alignItems: 'center', marginBottom: 30 },
  logoCaja:         { width: 84, height: 84, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoImg:          { width: 64, height: 64 },
  appName:          { fontSize: 26, fontWeight: '700', color: zc.enNoche, letterSpacing: -0.3 },
  subtitle:         { fontSize: 14.5, color: zc.enNocheGris, marginTop: 4 },
  form:             { backgroundColor: zc.tarjeta, borderRadius: 20, padding: 22, ...sombra, elevation: 6 },
  label:            { fontSize: 13, color: zc.gris, marginBottom: 6 },
  input:            { ...campo, backgroundColor: zc.fondo, borderColor: zc.fondo, padding: 13, fontSize: 15, color: zc.tinta },
  btnLogin:         { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 15, alignItems: 'center', marginTop: 22 },
  btnLoginText:     { color: '#fff', fontSize: 16, fontWeight: '500' },
  forgotLink:       { alignItems: 'center', marginTop: spacing.md, minHeight: 20, justifyContent: 'center' },
  forgotText:       { color: zc.azul, fontSize: 13.5, fontWeight: '500' },
  registerLink:     { alignItems: 'center', marginTop: spacing.lg },
  registerText:     { color: zc.gris, fontSize: 14.5 },
  registerStrong:   { color: zc.azul, fontWeight: '500' },
  footer:           { textAlign: 'center', color: zc.grisSuave, fontSize: 12, marginTop: spacing.xxl },
});
