import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

function IngredientRow({ item }) {
  const stockBajo = item.stock !== null && item.min_stock !== null && item.stock <= item.min_stock;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowUnit}>{item.unit || '—'}</Text>
      </View>
      <View style={styles.stockWrap}>
        <Text style={[styles.stock, stockBajo && { color: colors.danger }]}>
          {item.stock ?? '—'}
        </Text>
        {stockBajo && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning-outline" size={12} color={colors.danger} />
            <Text style={styles.alertText}>Stock bajo</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PremiumGate() {
  return (
    <View style={styles.premiumWrap}>
      <Ionicons name="layers-outline" size={52} color={colors.textMuted} />
      <Text style={styles.premiumTitle}>Función Premium</Text>
      <Text style={styles.premiumSubtitle}>
        El control de inventario está disponible en el plan Premium.
        Actívalo desde la app de escritorio Zenit POS.
      </Text>
    </View>
  );
}

export default function InventarioScreen() {
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trialing';

  const [ingredients, setIngredients] = useState([]);
  const [busqueda, setBusqueda]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefresh]      = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const data = await api.getIngredients();
      setIngredients(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Inventario</Text>
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const stockBajo  = ingredients.filter(i => i.stock !== null && i.min_stock !== null && i.stock <= i.min_stock);
  const filtrados  = ingredients.filter(i => !busqueda || i.name.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={12} color="#f59e0b" />
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
      </View>

      {stockBajo.length > 0 && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning-outline" size={18} color={colors.danger} />
          <Text style={styles.alertBannerText}>
            {stockBajo.length} {stockBajo.length === 1 ? 'insumo' : 'insumos'} con stock bajo
          </Text>
        </View>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar insumo..."
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <IngredientRow item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="layers-outline" size={48} color={colors.textMuted} />
            <Text style={styles.empty}>No hay insumos registrados</Text>
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
  alertBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.danger + '15', borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm + 2, gap: spacing.sm },
  alertBannerText:   { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, gap: spacing.xs },
  searchInput:       { flex: 1, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },
  row:               { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rowName:           { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  rowUnit:           { fontSize: font.sm - 2, color: colors.textMuted },
  stockWrap:         { alignItems: 'flex-end' },
  stock:             { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  alertBadge:        { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  alertText:         { fontSize: font.sm - 2, color: colors.danger, fontWeight: '600' },
  premiumWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:      { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:   { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyWrap:         { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty:             { color: colors.textMuted, fontSize: font.md },
});
