// ============================================================================
// src/screens/auth/SinConexionInicialScreen.js
// El ÚNICO caso en el que la app se detiene por falta de internet: hay una sesión
// guardada, pero el servidor no contesta y este equipo todavía no tiene datos
// cacheados con qué reconstruirla (nunca llegó a arrancar del todo con red).
//
// Se muestra esto en vez de las dos salidas fáciles y equivocadas:
//   - mandar al login, que también necesita internet (sería un callejón sin
//     salida disfrazado de pantalla normal), y
//   - dar por hecho que el negocio no tiene puestos configurados, que es el
//     camino que acababa entrando como DUEÑO sin pedir nada.
// ============================================================================
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

export default function SinConexionInicialScreen() {
  const { reintentarArranque, logout } = useAuth();
  const [reintentando, setReintentando] = useState(false);

  async function reintentar() {
    setReintentando(true);
    try { await reintentarArranque(); } finally { setReintentando(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.textMuted} />
        <Text style={styles.title}>Sin conexión</Text>
        <Text style={styles.body}>
          Este equipo aún no tiene guardados los datos de tu negocio, así que necesita
          internet para abrir por primera vez.
        </Text>
        <Text style={styles.bodyMuted}>
          Conéctate a una red y toca «Reintentar». A partir de ese momento la caja
          funcionará también sin internet.
        </Text>

        <TouchableOpacity style={styles.btn} onPress={reintentar} disabled={reintentando}>
          {reintentando
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Reintentar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={logout} style={styles.btnSecundario}>
          <Text style={styles.btnSecundarioText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },
  content:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  title:             { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
  body:              { fontSize: font.md, color: colors.textSecondary, textAlign: 'center' },
  bodyMuted:         { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
  btn:               { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xxl, alignItems: 'center', marginTop: spacing.lg, minWidth: 200 },
  btnText:           { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnSecundario:     { padding: spacing.md },
  btnSecundarioText: { color: colors.textMuted, fontSize: font.sm },
});
