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
import { IconoEnCuadro } from '../../components/ui';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';

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
        <View style={styles.tarjeta}>
        <IconoEnCuadro nombre="cloud-offline-outline" tono="ambar" size={72} />
        <Text style={styles.title}>Sin conexión</Text>
        <Text style={styles.body}>
          Este equipo aún no tiene guardados los datos de tu negocio, así que necesita
          internet para abrir por primera vez.
        </Text>
        <Text style={styles.bodyMuted}>
          Conéctate a una red y toca «Reintentar». A partir de ese momento la caja
          funcionará también sin internet.
        </Text>
        </View>

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
  safe:              { flex: 1, backgroundColor: zc.fondo },
  content:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  tarjeta:           { alignSelf: 'stretch', alignItems: 'center', gap: 12, backgroundColor: zc.tarjeta, borderRadius: 20, padding: 26, ...sombra },
  title:             { fontSize: 20, fontWeight: '500', color: zc.tinta, marginTop: 4 },
  body:              { fontSize: 15, color: zc.gris, textAlign: 'center', lineHeight: 22 },
  bodyMuted:         { fontSize: 13.5, color: zc.grisSuave, textAlign: 'center', lineHeight: 20 },
  btn:               { backgroundColor: zc.azul, borderRadius: radios.boton, paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', marginTop: spacing.lg, alignSelf: 'stretch' },
  btnText:           { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnSecundario:     { padding: spacing.md },
  btnSecundarioText: { color: zc.gris, fontSize: 14 },
});
