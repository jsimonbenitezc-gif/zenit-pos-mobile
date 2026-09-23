// ============================================================================
// src/components/AvisoSinCuenta.js — el aviso del negocio sin cuenta.
//
// Hace dos trabajos a la vez: recordar que **no hay respaldo** y enseñar lo que
// se está perdiendo por no tener cuenta.
//
// 🔴 DOS REGLAS QUE NO SE PUEDEN ROMPER (BLOQUE 18, Etapa 2):
//
// 1. **Nunca después de cada venta.** Hay un cliente enfrente y tres esperando:
//    eso es fricción pura (§1) y a las diez veces se cierra por reflejo — y
//    entonces deja de funcionar para siempre Y además molesta. Los momentos que
//    sí funcionan son el CIERRE DE TURNO (final del día, nadie con prisa, y
//    está mirando el dinero que hizo) y la primera venta.
//
// 2. **Siempre con un botón que HAGA algo.** Un aviso que dice "puedes perderlo
//    todo" y no ofrece nada es solo angustia. Por eso lleva "Respaldar ahora".
//
// Y con SUS números, no con publicidad: "Hoy vendiste $4,320" convence;
// "¡Descubre todas las funciones!" se cierra sin leer.
// ============================================================================
import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Icono, IconoEnCuadro } from './ui';
import * as SecureStore from 'expo-secure-store';
import { colors, spacing, radius, font, zc, radios, sombra } from '../theme';
import { formatMoney } from '../utils/money';
import { exportarRespaldo } from '../offline/respaldo';

const CLAVE_ULTIMO = 'zenit_aviso_local_ultimo';

/**
 * ¿Toca mostrar el aviso? Como mucho UNA vez al día.
 * @param {boolean} forzar  true para saltarse la cadencia (primera venta).
 */
export async function tocaAvisar(forzar = false) {
  try {
    const hoy = new Date().toDateString();
    const ultimo = await SecureStore.getItemAsync(CLAVE_ULTIMO);
    if (!forzar && ultimo === hoy) return false;
    await SecureStore.setItemAsync(CLAVE_ULTIMO, hoy);
    return true;
  } catch {
    return false;   // ante la duda, no molestar
  }
}

export default function AvisoSinCuenta({ visible, onClose, onCrearCuenta, resumen }) {
  const [respaldando, setRespaldando] = useState(false);

  async function respaldar() {
    setRespaldando(true);
    const r = await exportarRespaldo();
    setRespaldando(false);
    if (!r.ok && r.motivo !== 'sin_compartir') {
      Alert.alert('No se pudo respaldar', 'Intenta de nuevo en un momento.');
    } else if (r.motivo === 'sin_compartir') {
      Alert.alert('No disponible', 'Este teléfono no puede compartir archivos.');
    }
  }

  const ventas = resumen?.ventas ?? 0;
  const total  = resumen?.total ?? 0;
  const moneda = resumen?.moneda || '$';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fondo}>
        <View style={styles.caja}>
          <IconoEnCuadro nombre="shield-outline" tono="azul" size={64} />

          {ventas > 0 ? (
            <Text style={styles.titulo}>
              Vendiste {formatMoney(total, moneda)} en {ventas} {ventas === 1 ? 'venta' : 'ventas'}
            </Text>
          ) : (
            <Text style={styles.titulo}>Tu negocio vive solo en este teléfono</Text>
          )}

          <Text style={styles.cuerpo}>
            Ese registro existe <Text style={styles.fuerte}>únicamente en este teléfono</Text>.
            Si lo pierdes o se daña, no hay forma de recuperarlo.
          </Text>

          <View style={styles.lista}>
            <Punto texto="Respaldo automático de todo" />
            <Punto texto="Ver tus ventas desde tu casa" />
            <Punto texto="Mesas, inventario y empleados" />
            <Punto texto="Un resumen cada noche" />
          </View>

          <TouchableOpacity style={styles.btnPrincipal} onPress={onCrearCuenta}>
            <Text style={styles.btnPrincipalText}>Crear una cuenta gratis</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecundario} onPress={respaldar} disabled={respaldando}>
            {respaldando
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.btnSecundarioText}>Respaldar ahora en mi teléfono</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.btnCerrar}>
            <Text style={styles.btnCerrarText}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Punto({ texto }) {
  return (
    <View style={styles.punto}>
      <Icono nombre="checkmark-circle" size={17} color={zc.verde} />
      <Text style={styles.puntoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo:             { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', padding: spacing.lg },
  caja:              { backgroundColor: zc.tarjeta, borderRadius: 22, padding: 24, alignItems: 'center', gap: 10, ...sombra, elevation: 8 },
  titulo:            { fontSize: 19, fontWeight: '500', color: zc.tinta, textAlign: 'center', marginTop: 6 },
  cuerpo:            { fontSize: 14.5, color: zc.gris, textAlign: 'center', lineHeight: 21 },
  fuerte:            { fontWeight: '500', color: zc.tinta },
  lista:             { alignSelf: 'stretch', gap: 8, marginTop: 10, backgroundColor: zc.fondo, borderRadius: radios.tarjeta, padding: 14 },
  punto:             { flexDirection: 'row', alignItems: 'center', gap: 10 },
  puntoTexto:        { fontSize: 14, color: zc.tinta },
  btnPrincipal:      { alignSelf: 'stretch', backgroundColor: zc.azul, borderRadius: radios.boton, padding: 15, alignItems: 'center', marginTop: 14 },
  btnPrincipalText:  { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnSecundario:     { alignSelf: 'stretch', backgroundColor: zc.azulSuave, borderRadius: radios.boton, padding: 14, alignItems: 'center' },
  btnSecundarioText: { color: zc.azul, fontSize: 15, fontWeight: '500' },
  btnCerrar:         { padding: spacing.sm },
  btnCerrarText:     { color: zc.gris, fontSize: 14 },
});
