import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';
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
        <StatusBar style="light" />
        <View style={styles.banda} />

        <View style={styles.header}>
          <View style={styles.logoCaja}>
            <Image source={require('../../../assets/icon.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
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

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };

const styles = StyleSheet.create({
  container:        { flexGrow: 1, backgroundColor: zc.fondo, padding: spacing.xl, paddingTop: 70 },
  // La franja azul noche de arriba (diseño A), igual que en el login
  banda:            { position: 'absolute', top: 0, left: 0, right: 0, height: 290, backgroundColor: zc.noche, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  header:           { alignItems: 'center', marginBottom: 26 },
  logoCaja:         { width: 72, height: 72, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoImg:          { width: 54, height: 54 },
  appName:          { fontSize: 24, fontWeight: '700', color: zc.enNoche, letterSpacing: -0.3 },
  subtitle:         { fontSize: 14.5, color: zc.enNocheGris, marginTop: 4 },
  form:             { backgroundColor: zc.tarjeta, borderRadius: 20, padding: 22, ...sombra, elevation: 6 },
  label:            { fontSize: 13, color: zc.gris, marginBottom: 6 },
  input:            { ...campo, backgroundColor: zc.fondo, borderColor: zc.fondo, padding: 13, fontSize: 15, color: zc.tinta },
  btnPrimary:       { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 15, alignItems: 'center', marginTop: 22 },
  btnPrimaryText:   { color: '#fff', fontSize: 16, fontWeight: '500' },
  linkWrap:         { alignItems: 'center', marginTop: spacing.xl },
  linkText:         { color: zc.gris, fontSize: 14.5 },
  linkStrong:       { color: zc.azul, fontWeight: '500' },
});
