import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';

export default function RegisterScreen({ navigation }) {
  const { registerOwner } = useAuth();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleRegister() {
    const nombre = name.trim();
    const correo = email.trim();
    if (!nombre || !correo || !password) {
      Alert.alert('Campos requeridos', 'Completa nombre, correo y contraseña.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      Alert.alert('Correo inválido', 'Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contraseña muy corta', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Las contraseñas no coinciden', 'Verifica que ambas contraseñas sean iguales.');
      return;
    }
    setLoading(true);
    try {
      await registerOwner(nombre, correo, password);
      // Al registrarse queda con sesión iniciada; la navegación cambia sola al detectar user.
    } catch (e) {
      Alert.alert('No se pudo crear la cuenta', friendlyError(e) || 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Image source={require('../../../assets/icon.png')} style={styles.logoImg} resizeMode="contain" />
          <Text style={styles.appName}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Empieza a usar Zenit en minutos</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Nombre del negocio o dueño</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej. Pizzería Xul-ha"
            autoCapitalize="words"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
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
            placeholder="Mínimo 8 caracteres"
            secureTextEntry
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Confirmar contraseña</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repite tu contraseña"
            secureTextEntry
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleRegister}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Crear cuenta</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.linkWrap} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.linkText}>¿Ya tienes cuenta? <Text style={styles.linkStrong}>Inicia sesión</Text></Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center' },
  header:           { alignItems: 'center', marginBottom: spacing.xl },
  logoImg:          { width: 72, height: 72, marginBottom: spacing.md },
  appName:          { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle:         { fontSize: font.md, color: colors.textSecondary, marginTop: spacing.xs },
  form:             { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  label:            { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background },
  btnPrimary:       { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnPrimaryText:   { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  linkWrap:         { alignItems: 'center', marginTop: spacing.xl },
  linkText:         { color: colors.textSecondary, fontSize: font.md },
  linkStrong:       { color: colors.primary, fontWeight: '700' },
});
