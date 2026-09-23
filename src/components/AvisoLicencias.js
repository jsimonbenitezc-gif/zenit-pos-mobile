import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icono, IconoEnCuadro } from './ui';
import { LICENCIA_FLUENT } from '../iconos/licencia';
import { zc, radios, espacios, letra } from '../theme';

// Los iconos de color son Fluent Emoji de Microsoft, con licencia MIT: la licencia
// pide que su aviso viaje DENTRO de la app (PLAN_REDISENO_V1, trampa 10). Una fila
// que abre el texto completo. Se pinta en Ajustes, con cuenta y sin ella.
export default function AvisoLicencias() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <TouchableOpacity style={s.fila} onPress={() => setAbierto(true)} activeOpacity={0.7}>
        <IconoEnCuadro nombre="documento" tono="gris" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.txt}>Licencias</Text>
          <Text style={s.det} numberOfLines={2}>Iconos de color: Fluent Emoji de Microsoft (licencia MIT)</Text>
        </View>
        <Icono nombre="derecha" size={16} color={zc.flecha} />
      </TouchableOpacity>

      <Modal visible={abierto} animationType="slide" onRequestClose={() => setAbierto(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.cab}>
            <Text style={s.titulo}>Licencias</Text>
            <TouchableOpacity onPress={() => setAbierto(false)} style={s.cerrar} accessibilityLabel="Cerrar">
              <Icono nombre="cerrar" size={20} color={zc.tinta} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.cuerpo}>
            <Text style={s.sub}>Fluent Emoji — github.com/microsoft/fluentui-emoji</Text>
            <Text style={s.licencia}>{LICENCIA_FLUENT}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: espacios.dentro },
  txt: { ...letra.texto, color: zc.tinta, fontWeight: '500' },
  det: { ...letra.chica, color: zc.gris, marginTop: 2 },
  safe: { flex: 1, backgroundColor: zc.fondo },
  cab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: espacios.borde + 2, paddingVertical: 12 },
  titulo: { ...letra.titulo, color: zc.tinta, flex: 1 },
  cerrar: { width: 36, height: 36, borderRadius: 18, backgroundColor: zc.tarjeta, alignItems: 'center', justifyContent: 'center' },
  cuerpo: { padding: espacios.borde, paddingBottom: 40 },
  sub: { ...letra.etiqueta, color: zc.gris, marginBottom: 10 },
  licencia: { ...letra.chica, color: zc.tinta, backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: espacios.dentro, lineHeight: 18 },
});
