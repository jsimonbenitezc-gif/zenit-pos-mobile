import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

function StatCard({ label, value, sub, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color || colors.primary }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getDashboard();
      setStats(data);
    } catch (e) {
      console.error('Dashboard error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.title}>Resumen</Text>
        <Text style={styles.date}>{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

        <Text style={styles.sectionTitle}>Ventas de hoy</Text>
        <View style={styles.row}>
          <StatCard label="Total hoy" value={fmt(stats?.today?.total)} color={colors.success} />
          <StatCard label="Pedidos" value={stats?.today?.orders ?? 0} color={colors.primary} />
        </View>
        <View style={styles.row}>
          <StatCard label="Ticket promedio" value={fmt(stats?.today?.avg_ticket)} color={colors.warning} />
          <StatCard label="Clientes únicos" value={stats?.today?.unique_customers ?? 0} color="#8b5cf6" />
        </View>

        <Text style={styles.sectionTitle}>Ayer</Text>
        <View style={styles.row}>
          <StatCard label="Total ayer" value={fmt(stats?.yesterday?.total)} color={colors.textMuted} />
          <StatCard label="Pedidos" value={stats?.yesterday?.orders ?? 0} color={colors.textMuted} />
        </View>

        {stats?.top_products?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top productos hoy</Text>
            <View style={styles.card}>
              {stats.top_products.slice(0, 5).map((p, i) => (
                <View key={p.product_id} style={[styles.topRow, i > 0 && styles.topRowBorder]}>
                  <Text style={styles.topRank}>#{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>{p.emoji ? p.emoji + ' ' : ''}{p.name}</Text>
                  <Text style={styles.topQty}>{p.total_quantity} uds</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {stats?.low_stock?.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.warning }]}>⚠️ Stock bajo</Text>
            <View style={styles.card}>
              {stats.low_stock.map((p, i) => (
                <View key={p.id} style={[styles.topRow, i > 0 && styles.topRowBorder]}>
                  <Text style={styles.topName}>{p.emoji ? p.emoji + ' ' : ''}{p.name}</Text>
                  <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.sm }}>
                    {p.stock} uds
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1, padding: spacing.lg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },
  date: { fontSize: font.sm, color: colors.textSecondary, marginBottom: spacing.lg, textTransform: 'capitalize' },
  sectionTitle: { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statValue: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: font.sm - 1, color: colors.textSecondary, marginTop: 2 },
  statSub: { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  topRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  topRank: { width: 24, fontSize: font.sm, color: colors.textMuted, fontWeight: '700' },
  topName: { flex: 1, fontSize: font.sm, color: colors.textPrimary },
  topQty: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '600' },
});
