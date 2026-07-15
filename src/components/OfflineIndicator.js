// Píldora de estado offline: aparece cuando NO hay conexión o cuando quedan
// ventas por subir. Silenciosa cuando todo está en línea y sincronizado.
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';
import { radius, font, spacing } from '../theme';

export default function OfflineIndicator() {
  const { online, pendientes } = useNetwork();
  if (online && pendientes === 0) return null;

  const offline = !online;
  const color = offline ? '#b45309' : '#2563eb';
  const bg = offline ? '#fffbeb' : '#eff6ff';
  const borde = offline ? '#fde68a' : '#bfdbfe';

  const partes = [];
  if (offline) partes.push('Sin conexión');
  if (pendientes > 0) partes.push(`${pendientes} por subir`);

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: borde }]}>
      <Ionicons name={offline ? 'cloud-offline-outline' : 'cloud-upload-outline'} size={13} color={color} />
      <Text style={[styles.txt, { color }]}>{partes.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  txt: { fontSize: font.sm - 2, fontWeight: '700' },
});
