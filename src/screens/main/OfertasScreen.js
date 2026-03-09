import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

const TIPO_LABEL = { percentage: 'Porcentaje', fixed: 'Monto fijo' };

function DiscountCard({ discount }) {
  const isPercent = discount.type === 'percentage';
  return (
    <View style={[styles.card, !discount.active && styles.cardInactive]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{discount.name}</Text>
        <View style={styles.valueBadge}>
          <Text style={styles.valueText}>
            {isPercent ? `${discount.value}%` : `$${parseFloat(discount.value).toFixed(2)}`}
          </Text>
        </View>
      </View>
      <Text style={styles.cardTipo}>{TIPO_LABEL[discount.type] || discount.type}</Text>
      {!discount.active && (
        <View style={styles.inactiveBadge}>
          <Text style={styles.inactiveText}>Inactivo</Text>
        </View>
      )}
    </View>
  );
}

function PremiumGate() {
  return (
    <View style={styles.premiumWrap}>
      <Ionicons name="pricetag-outline" size={52} color={colors.textMuted} />
      <Text style={styles.premiumTitle}>Función Premium</Text>
      <Text style={styles.premiumSubtitle}>
        Las ofertas y descuentos están disponibles en el plan Premium.
        Actívalo desde la app de escritorio Zenit POS.
      </Text>
    </View>
  );
}

export default function OfertasScreen() {
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trialing';

  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const data = await api.getDiscounts();
      setDiscounts(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las ofertas.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Ofertas</Text>
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Ofertas</Text>
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={12} color="#f59e0b" />
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
      </View>

      <FlatList
        data={discounts}
        keyExtractor={d => String(d.id)}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <DiscountCard discount={item} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
            <Text style={styles.empty}>No hay descuentos creados</Text>
            <Text style={styles.emptyHint}>Crea descuentos desde la app de escritorio</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },
  centered:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  title:             { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, padding: spacing.lg, paddingBottom: spacing.sm },
  premiumBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2, gap: 3 },
  premiumBadgeText:  { fontSize: font.sm - 2, fontWeight: '700', color: '#f59e0b' },
  card:              { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardInactive:      { opacity: 0.5 },
  cardTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardName:          { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  valueBadge:        { backgroundColor: colors.primary + '20', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  valueText:         { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  cardTipo:          { fontSize: font.sm - 1, color: colors.textMuted },
  inactiveBadge:     { marginTop: spacing.xs, alignSelf: 'flex-start', backgroundColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  inactiveText:      { fontSize: font.sm - 2, color: colors.textMuted, fontWeight: '600' },
  premiumWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:      { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:   { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyWrap:         { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty:             { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  emptyHint:         { color: colors.textMuted, fontSize: font.sm },
});
