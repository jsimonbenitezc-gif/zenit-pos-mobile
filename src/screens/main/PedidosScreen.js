import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

const ESTADOS = [
  { key: null,         label: 'Todos' },
  { key: 'registrado', label: 'Registrados' },
  { key: 'completado', label: 'Completados' },
  { key: 'entregado',  label: 'Entregados' },
  { key: 'cancelado',  label: 'Cancelados' },
];

const ESTADO_COLOR = {
  registrado: colors.warning,
  completado: colors.primary,
  entregado:  colors.success,
  cancelado:  colors.danger,
};

const PAGO_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const PAGO_ICON  = { efectivo: 'cash-outline', tarjeta: 'card-outline', transferencia: 'phone-portrait-outline' };

function PedidoCard({ pedido, onCambiarEstado }) {
  const fecha = new Date(pedido.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const color = ESTADO_COLOR[pedido.status] || colors.textMuted;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.pedidoId}>#{pedido.id}</Text>
          <View style={styles.pedidoFechaRow}>
            <Text style={styles.pedidoFecha}>{fecha} · </Text>
            <Ionicons name={PAGO_ICON[pedido.payment_method] || 'cash-outline'} size={12} color={colors.textMuted} />
            <Text style={styles.pedidoFecha}> {PAGO_LABEL[pedido.payment_method] || pedido.payment_method}</Text>
          </View>
        </View>
        <View>
          <View style={[styles.badge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.badgeText, { color }]}>{pedido.status}</Text>
          </View>
          <Text style={styles.pedidoTotal}>${parseFloat(pedido.total).toFixed(2)}</Text>
        </View>
      </View>

      {pedido.table && (
        <View style={styles.clienteRow}>
          <Ionicons name="grid-outline" size={13} color={colors.primary} />
          <Text style={[styles.cliente, { color: colors.primary }]}> {pedido.table.name}</Text>
        </View>
      )}
      {pedido.customer && (
        <View style={styles.clienteRow}>
          <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.cliente}> {pedido.customer.name}</Text>
        </View>
      )}

      {pedido.items?.length > 0 && (
        <View style={styles.items}>
          {pedido.items.map(item => (
            <Text key={item.id} style={styles.itemText}>
              {item.quantity}× {item.product?.name || 'Producto'}
            </Text>
          ))}
        </View>
      )}

      {pedido.status === 'registrado' && (
        <View style={styles.acciones}>
          <TouchableOpacity
            style={[styles.accionBtn, { backgroundColor: colors.primary }]}
            onPress={() => onCambiarEstado(pedido.id, 'completado')}
          >
            <Text style={styles.accionBtnText}>Completar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accionBtn, { backgroundColor: colors.danger }]}
            onPress={() => onCambiarEstado(pedido.id, 'cancelado')}
          >
            <Text style={styles.accionBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      {pedido.status === 'completado' && (
        <TouchableOpacity
          style={[styles.accionBtn, { backgroundColor: colors.success, alignSelf: 'flex-start', marginTop: spacing.sm }]}
          onPress={() => onCambiarEstado(pedido.id, 'entregado')}
        >
          <Text style={styles.accionBtnText}>Marcar entregado</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PedidosScreen() {
  const [pedidos, setPedidos]       = useState([]);
  const [filtro, setFiltro]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const params = { limit: 100, page: 1 };
      if (filtro) params.status = filtro;
      const data = await api.getOrders(params);
      setPedidos(data.data || []);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  async function cambiarEstado(id, status) {
    try {
      await api.updateOrderStatus(id, status);
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Pedidos</Text>
      </View>

      {/* Filtros */}
      <FlatList
        horizontal
        data={ESTADOS}
        keyExtractor={e => String(e.key)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, filtro === item.key && styles.chipActive]}
            onPress={() => setFiltro(item.key)}
          >
            <Text style={[styles.chipText, filtro === item.key && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={pedidos}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <PedidoCard pedido={item} onCambiarEstado={cambiarEstado} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay pedidos con este filtro</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pedidoId: { fontSize: font.md, fontWeight: '800', color: colors.textPrimary },
  pedidoFechaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pedidoFecha: { fontSize: font.sm - 1, color: colors.textMuted },
  pedidoTotal: { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary, textAlign: 'right', marginTop: 4 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-end' },
  badgeText: { fontSize: font.sm - 2, fontWeight: '700', textTransform: 'uppercase' },
  clienteRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  cliente: { fontSize: font.sm, color: colors.textSecondary },
  items: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  itemText: { fontSize: font.sm - 1, color: colors.textSecondary },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  accionBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  accionBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, fontSize: font.md },
});
