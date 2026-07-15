import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';

/**
 * Aviso NO bloqueante de "confirma tu correo".
 * Solo aparece para el dueño cuando su correo aún no está verificado.
 * Política suave: no impide usar la app, solo invita a confirmar.
 */
export default function VerificacionBanner() {
  const { user, isOwner, refreshUser } = useAuth();
  const [enviando, setEnviando] = useState(false);

  // Solo el dueño y solo si NO está verificado (email_verified === false explícito).
  if (!isOwner || user?.email_verified !== false) return null;

  async function reenviar() {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await api.resendVerification();
      // Si el backend dice que ya estaba verificado, refrescamos para ocultar el banner.
      if (r?.email_verified === true) {
        await refreshUser();
        return;
      }
      Alert.alert('Correo enviado', r?.message || 'Te enviamos el correo de confirmación. Revisa tu bandeja (y spam).');
    } catch (err) {
      Alert.alert('No se pudo enviar', err?.message || 'Intenta de nuevo en unos minutos.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.banner}>
      <Ionicons name="mail-unread-outline" size={20} color={colors.warning} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.titulo}>Confirma tu correo</Text>
        <Text style={styles.texto}>
          Revisa {user?.email ? user.email : 'tu bandeja'} y confirma tu correo para habilitar la
          recuperación de contraseña.
        </Text>
        <View style={styles.acciones}>
          <TouchableOpacity onPress={reenviar} disabled={enviando} style={styles.btn}>
            {enviando
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.btnTexto}>Reenviar correo</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => refreshUser()} style={styles.btnGhost}>
            <Text style={styles.btnGhostTexto}>Ya confirmé</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  titulo: { fontSize: font.md, fontWeight: '700', color: '#92400e', marginBottom: 2 },
  texto: { fontSize: font.sm, color: '#92400e', lineHeight: 18 },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  btnTexto: { color: colors.primary, fontWeight: '600', fontSize: font.sm },
  btnGhost: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  btnGhostTexto: { color: '#92400e', fontSize: font.sm, textDecorationLine: 'underline' },
});
