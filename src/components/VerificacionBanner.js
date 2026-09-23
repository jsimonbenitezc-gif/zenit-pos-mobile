import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { IconoEnCuadro } from './ui';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font, zc, radios, sombra } from '../theme';

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
      <IconoEnCuadro nombre="mail-unread-outline" tono="ambar" />
      <View style={{ flex: 1 }}>
        <Text style={styles.titulo}>Confirma tu correo</Text>
        <Text style={styles.texto}>
          Revisa {user?.email ? user.email : 'tu bandeja'} y confirma tu correo para habilitar la
          recuperación de contraseña.
        </Text>
        <View style={styles.acciones}>
          <TouchableOpacity onPress={reenviar} disabled={enviando} style={styles.btn}>
            {enviando
              ? <ActivityIndicator size="small" color="#fff" />
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
    gap: 12,
    backgroundColor: zc.tarjeta,
    borderRadius: radios.tarjeta,
    padding: 14,
    marginBottom: spacing.md,
    ...sombra,
  },
  titulo: { fontSize: 15, fontWeight: '500', color: zc.tinta, marginBottom: 2 },
  texto: { fontSize: 13.5, color: zc.gris, lineHeight: 19 },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: 10 },
  btn: {
    backgroundColor: zc.azul,
    borderRadius: radios.chip,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  btnTexto: { color: '#fff', fontWeight: '500', fontSize: 13.5 },
  btnGhost: { paddingVertical: 7, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: zc.fondo, borderRadius: radios.chip },
  btnGhostTexto: { color: zc.gris, fontSize: 13.5 },
});
