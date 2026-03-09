import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

const STATUS_COLOR = {
  pending:     '#f59e0b',
  in_progress: colors.primary,
  ready:       colors.success,
  delivered:   colors.textMuted,
};

const STATUS_LABEL = {
  pending:     'Pendiente',
  in_progress: 'En proceso',
  ready:       'Listo',
  delivered:   'Entregado',
};

const TIPO_LABEL = {
  comer:     '🍽️ Comer aquí',
  llevar:    '🛍️ Llevar',
  domicilio: '🛵 Domicilio',
};

function OrderCard({ order, onChangeStatus }) {
  const color = STATUS_COLOR[order.status] || colors.textMuted;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={styles.cardRef}>{order.reference || order.order_type || 'Orden'}</Text>
        <Text style={styles.cardId}>#{order.id}</Text>
      </View>
      <Text style={styles.cardTipo}>{TIPO_LABEL[order.order_type] || order.order_type}</Text>
      <Text style={styles.cardTotal}>${parseFloat(order.total || 0).toFixed(2)}</Text>
      <View style={[styles.statusBadge, { backgroundColor: color + '22', borderColor: color }]}>
        <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[order.status] || order.status}</Text>
      </View>
      {order.customer && (
        <Text style={styles.cardCliente}><Ionicons name="person-outline" size={13} /> {order.customer.name}</Text>
      )}
      {order.notes && (
        <Text style={styles.cardNota} numberOfLines={1}>📝 {order.notes}</Text>
      )}
      {/* Acciones rápidas */}
      <View style={styles.cardActions}>
        {order.status === 'pending' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => onChangeStatus(order.id, 'in_progress')}>
            <Text style={styles.actionBtnText}>Iniciar</Text>
          </TouchableOpacity>
        )}
        {order.status === 'in_progress' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={() => onChangeStatus(order.id, 'ready')}>
            <Text style={styles.actionBtnText}>Listo</Text>
          </TouchableOpacity>
        )}
        {order.status === 'ready' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.textMuted }]} onPress={() => onChangeStatus(order.id, 'delivered')}>
            <Text style={styles.actionBtnText}>Entregar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function MesasScreen() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [filtro, setFiltro]       = useState('todos'); // 'activos' | 'todos'

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const res = await api.getOrders({ limit: 100 });
      setOrders(res.data || []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las órdenes.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id, status) {
    try {
      await api.updateOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  const filtrados = orders.filter(o =>
    filtro === 'todos' || ['pending', 'in_progress', 'ready'].includes(o.status)
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Mesas</Text>
        <Text style={styles.count}>{filtrados.length} {filtro === 'activos' ? 'activas' : 'pedidos'}</Text>
      </View>

      {/* Filtro */}
      <View style={styles.tabRow}>
        {[{ key: 'activos', label: 'Activos' }, { key: 'todos', label: 'Todos' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, filtro === t.key && styles.tabActive]}
            onPress={() => setFiltro(t.key)}
          >
            <Text style={[styles.tabText, filtro === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={o => String(o.id)}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <OrderCard order={item} onChangeStatus={changeStatus} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="grid-outline" size={48} color={colors.textMuted} />
            <Text style={styles.empty}>No hay órdenes activas</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.background },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title:          { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  count:          { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  tabRow:         { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tab:            { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  tabActive:      { backgroundColor: colors.primary },
  tabText:        { fontSize: font.sm, fontWeight: '700', color: colors.textMuted },
  tabTextActive:  { color: '#fff' },
  grid:           { padding: spacing.lg, paddingTop: spacing.sm },
  card:           { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.xs },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  cardRef:        { flex: 1, fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  cardId:         { fontSize: font.sm - 2, color: colors.textMuted },
  cardTipo:       { fontSize: font.sm - 2, color: colors.textMuted, marginBottom: spacing.xs },
  cardTotal:      { fontSize: font.lg, fontWeight: '800', color: colors.primary, marginBottom: spacing.sm },
  statusBadge:    { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: spacing.xs },
  statusText:     { fontSize: font.sm - 2, fontWeight: '700' },
  cardCliente:    { fontSize: font.sm - 2, color: colors.textMuted, marginTop: spacing.xs },
  cardNota:       { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  cardActions:    { marginTop: spacing.sm },
  actionBtn:      { backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.xs + 2, alignItems: 'center' },
  actionBtnText:  { color: '#fff', fontSize: font.sm - 1, fontWeight: '700' },
  emptyWrap:      { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty:          { color: colors.textMuted, fontSize: font.md },
});
