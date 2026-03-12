import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, SectionList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, TextInput, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

const MOTIVOS = [
  { key: 'merma',     label: 'Merma' },
  { key: 'caducidad', label: 'Caducidad' },
  { key: 'accidente', label: 'Accidente' },
  { key: 'robo',      label: 'Pérdida/Robo' },
  { key: 'ajuste',    label: 'Ajuste' },
  { key: 'otro',      label: 'Otro' },
];

// ─── Insumo row ───────────────────────────────────────────────────────────────
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

// ─── Preparación row (expandible) ────────────────────────────────────────────
function PrepRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center' }}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowUnit}>
            Unidad: {item.unit || '—'}
            {item.yield_quantity ? `  ·  Rinde: ${item.yield_quantity}` : ''}
          </Text>
        </View>
        <View style={styles.stockWrap}>
          <Text style={styles.stock}>{item.stock ?? '0'}</Text>
          <Text style={styles.rowUnit}>en stock</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16} color={colors.textMuted}
          style={{ marginLeft: spacing.sm }}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.expandedBox}>
          {item.items?.length > 0 ? (
            item.items.map(ri => (
              <View key={ri.id} style={styles.recipeItem}>
                <Ionicons name="flask-outline" size={13} color={colors.textMuted} />
                <Text style={styles.recipeItemText}>
                  {ri.ingredient?.name ?? `ID ${ri.ingredient_id}`}
                </Text>
                <Text style={styles.recipeItemQty}>
                  {ri.quantity} {ri.ingredient?.unit ?? ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.sinDatos}>Sin ingredientes asignados</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Receta de producto row (expandible) ──────────────────────────────────────
function RecetaRow({ product, items, ingredients, preparations }) {
  const [expanded, setExpanded] = useState(false);
  if (!product) return null;

  const nombre = (id, tipo) => {
    if (tipo === 'ingredient') return ingredients.find(i => i.id === id)?.name ?? `Ingrediente #${id}`;
    return preparations.find(p => p.id === id)?.name ?? `Preparación #${id}`;
  };
  const unit = (id, tipo) => {
    if (tipo === 'ingredient') return ingredients.find(i => i.id === id)?.unit ?? '';
    return preparations.find(p => p.id === id)?.unit ?? '';
  };

  return (
    <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center' }}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 24, marginRight: spacing.sm }}>{product.emoji || '📦'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{product.name}</Text>
          <Text style={styles.rowUnit}>{items.length} {items.length === 1 ? 'ingrediente' : 'ingredientes'}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16} color={colors.textMuted}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.expandedBox}>
          {items.map(r => (
            <View key={r.id} style={styles.recipeItem}>
              <Ionicons
                name={r.item_type === 'ingredient' ? 'flask-outline' : 'beaker-outline'}
                size={13} color={colors.textMuted}
              />
              <Text style={styles.recipeItemText}>{nombre(r.item_id, r.item_type)}</Text>
              <Text style={styles.recipeItemQty}>
                {r.quantity} {unit(r.item_id, r.item_type)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Premium gate ─────────────────────────────────────────────────────────────
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

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function InventarioScreen() {
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trial';

  const [tab, setTab]                   = useState('insumos');
  const [ingredients, setIngredients]   = useState([]);
  const [preparations, setPreparations] = useState([]);
  const [allRecipes, setAllRecipes]     = useState([]);
  const [products, setProducts]         = useState([]);
  const [busqueda, setBusqueda]         = useState('');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefresh]        = useState(false);

  // Modal de movimiento
  const [modalVisible, setModalVisible] = useState(false);
  const [tipoMov, setTipoMov]           = useState('entrada');
  const [busqIng, setBusqIng]           = useState('');
  const [ingSelec, setIngSelec]         = useState(null);
  const [cantidad, setCantidad]         = useState('');
  const [motivo, setMotivo]             = useState('merma');
  const [notasMov, setNotasMov]         = useState('');
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const [ings, preps, recipes, prods] = await Promise.all([
        api.getIngredients(),
        api.getPreparations(),
        api.getAllRecipes(),
        api.getProducts(),
      ]);
      setIngredients(ings);
      setPreparations(preps);
      setAllRecipes(recipes);
      setProducts(prods);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
      const interval = setInterval(() => load(true), 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  const abrirModal = (tipo) => {
    setTipoMov(tipo);
    setBusqIng('');
    setIngSelec(null);
    setCantidad('');
    setMotivo('merma');
    setNotasMov('');
    setModalVisible(true);
  };

  const guardarMovimiento = async () => {
    if (!ingSelec) { Alert.alert('Error', 'Selecciona un insumo'); return; }
    const qty = parseFloat(cantidad);
    if (!qty || qty <= 0) { Alert.alert('Error', 'Escribe una cantidad válida'); return; }
    setSaving(true);
    try {
      await api.createMovement({
        ingredient_id: ingSelec.id,
        type: tipoMov,
        quantity: qty,
        reason: tipoMov === 'salida' ? motivo : undefined,
        notes: notasMov.trim() || undefined,
      });
      const data = await api.getIngredients();
      setIngredients(data);
      setModalVisible(false);
      Alert.alert(
        tipoMov === 'entrada' ? '✓ Entrada registrada' : '✓ Salida registrada',
        `${tipoMov === 'entrada' ? '+' : '−'}${qty} ${ingSelec.unit ?? ''} de ${ingSelec.name}`
      );
    } catch {
      Alert.alert('Error', 'No se pudo registrar el movimiento. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.pageTitle}>Inventario</Text>
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const q = busqueda.toLowerCase();
  const stockBajo = ingredients.filter(i => i.stock !== null && i.min_stock !== null && i.stock <= i.min_stock);

  // Datos filtrados por tab
  const filtInsumos = ingredients.filter(i => !q || i.name.toLowerCase().includes(q));
  const filtPreps   = preparations.filter(p => !q || p.name.toLowerCase().includes(q));

  // Agrupar recetas por producto
  const recetasPorProd = {};
  for (const r of allRecipes) {
    if (!recetasPorProd[r.product_id]) recetasPorProd[r.product_id] = [];
    recetasPorProd[r.product_id].push(r);
  }
  const recetasData = Object.entries(recetasPorProd)
    .map(([pid, items]) => ({ product: products.find(p => p.id === parseInt(pid)), items }))
    .filter(r => r.product && (!q || r.product.name.toLowerCase().includes(q)));

  const sugerencias = ingredients.filter(i =>
    busqIng.length > 0 && i.name.toLowerCase().includes(busqIng.toLowerCase())
  ).slice(0, 8);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Inventario</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.btnEntrada} onPress={() => abrirModal('entrada')}>
            <Ionicons name="add-circle-outline" size={15} color="#16a34a" />
            <Text style={styles.btnEntradaText}>Entrada</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSalida} onPress={() => abrirModal('salida')}>
            <Ionicons name="remove-circle-outline" size={15} color="#dc2626" />
            <Text style={styles.btnSalidaText}>Salida</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stock bajo banner */}
      {stockBajo.length > 0 && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning-outline" size={18} color={colors.danger} />
          <Text style={styles.alertBannerText}>
            {stockBajo.length} {stockBajo.length === 1 ? 'insumo' : 'insumos'} con stock bajo
          </Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { key: 'insumos',       label: 'Insumos',       icon: 'layers-outline' },
          { key: 'preparaciones', label: 'Preparaciones', icon: 'beaker-outline' },
          { key: 'recetas',       label: 'Recetas',        icon: 'book-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => { setTab(t.key); setBusqueda(''); }}
          >
            <Ionicons name={t.icon} size={15} color={tab === t.key ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={tab === 'insumos' ? 'Buscar insumo...' : tab === 'preparaciones' ? 'Buscar preparación...' : 'Buscar producto...'}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Contenido del tab */}
      {tab === 'insumos' && (
        <FlatList
          data={filtInsumos}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <IngredientRow item={item} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay insumos registrados</Text>}
        />
      )}

      {tab === 'preparaciones' && (
        <FlatList
          data={filtPreps}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <PrepRow item={item} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay preparaciones registradas</Text>}
        />
      )}

      {tab === 'recetas' && (
        <FlatList
          data={recetasData}
          keyExtractor={r => String(r.product?.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <RecetaRow
              product={item.product}
              items={item.items}
              ingredients={ingredients}
              preparations={preparations}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No hay recetas asignadas</Text>}
        />
      )}

      {/* ── Modal de movimiento ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>

              {/* Tabs + close */}
              <View style={styles.modalHeader}>
                <View style={styles.modalTabs}>
                  <TouchableOpacity
                    style={[styles.modalTab, tipoMov === 'entrada' && styles.modalTabEntrada]}
                    onPress={() => setTipoMov('entrada')}
                  >
                    <Text style={[styles.modalTabText, tipoMov === 'entrada' && styles.modalTabTextEntrada]}>+ Entrada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalTab, tipoMov === 'salida' && styles.modalTabSalida]}
                    onPress={() => setTipoMov('salida')}
                  >
                    <Text style={[styles.modalTabText, tipoMov === 'salida' && styles.modalTabTextSalida]}>− Salida</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Selector de insumo */}
                <Text style={styles.label}>Insumo</Text>
                {ingSelec ? (
                  <View style={styles.ingSelecRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ingSelecNombre}>{ingSelec.name}</Text>
                      <Text style={styles.ingSelecStock}>Stock actual: {ingSelec.stock ?? '—'} {ingSelec.unit}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setIngSelec(null); setBusqIng(''); }}>
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={styles.input}
                      value={busqIng}
                      onChangeText={setBusqIng}
                      placeholder="Buscar insumo..."
                      placeholderTextColor={colors.textMuted}
                    />
                    {sugerencias.length > 0 && (
                      <View style={styles.sugerenciasBox}>
                        {sugerencias.map(i => (
                          <TouchableOpacity
                            key={i.id}
                            style={styles.sugerenciaItem}
                            onPress={() => { setIngSelec(i); setBusqIng(''); }}
                          >
                            <Text style={styles.sugNombre}>{i.name}</Text>
                            <Text style={styles.sugStock}>Stock: {i.stock ?? '—'} {i.unit}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Cantidad */}
                <Text style={[styles.label, { marginTop: spacing.md }]}>
                  Cantidad{ingSelec?.unit ? ` (${ingSelec.unit})` : ''}
                </Text>
                <TextInput
                  style={styles.input}
                  value={cantidad}
                  onChangeText={setCantidad}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />

                {/* Motivo (solo salida) */}
                {tipoMov === 'salida' && (
                  <>
                    <Text style={[styles.label, { marginTop: spacing.md }]}>Motivo</Text>
                    <View style={styles.motivosRow}>
                      {MOTIVOS.map(m => (
                        <TouchableOpacity
                          key={m.key}
                          style={[styles.motivoChip, motivo === m.key && styles.motivoChipActivo]}
                          onPress={() => setMotivo(m.key)}
                        >
                          <Text style={[styles.motivoText, motivo === m.key && styles.motivoTextActivo]}>
                            {m.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Notas */}
                <Text style={[styles.label, { marginTop: spacing.md }]}>Notas (opcional)</Text>
                <TextInput
                  style={[styles.input, { height: 68, textAlignVertical: 'top', paddingTop: spacing.sm }]}
                  value={notasMov}
                  onChangeText={setNotasMov}
                  placeholder="Observaciones..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />

                <TouchableOpacity
                  style={[
                    styles.btnGuardar,
                    tipoMov === 'salida' && styles.btnGuardarSalida,
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={guardarMovimiento}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.btnGuardarText}>
                        {tipoMov === 'entrada' ? 'Registrar Entrada' : 'Registrar Salida'}
                      </Text>
                  }
                </TouchableOpacity>
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:                { flex: 1, backgroundColor: colors.background },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  pageTitle:           { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  headerActions:       { flexDirection: 'row', gap: spacing.sm },
  btnEntrada:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnEntradaText:      { fontSize: font.sm - 1, fontWeight: '700', color: '#16a34a' },
  btnSalida:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnSalidaText:       { fontSize: font.sm - 1, fontWeight: '700', color: '#dc2626' },
  alertBanner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.danger + '15', borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm + 2, gap: spacing.sm },
  alertBannerText:     { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
  // Tab bar
  tabBar:              { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 3, gap: 2 },
  tabItem:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.sm - 1, borderRadius: radius.md },
  tabItemActive:       { backgroundColor: colors.primary },
  tabText:             { fontSize: font.sm - 2, fontWeight: '600', color: colors.textMuted },
  tabTextActive:       { color: '#fff' },
  searchWrap:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, gap: spacing.xs },
  searchInput:         { flex: 1, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },
  listContent:         { padding: spacing.lg, paddingTop: 0 },
  row:                 { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  rowName:             { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  rowUnit:             { fontSize: font.sm - 2, color: colors.textMuted },
  stockWrap:           { alignItems: 'flex-end' },
  stock:               { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  alertBadge:          { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  alertText:           { fontSize: font.sm - 2, color: colors.danger, fontWeight: '600' },
  expandedBox:         { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.border },
  recipeItem:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  recipeItemText:      { flex: 1, fontSize: font.sm - 1, color: colors.textSecondary },
  recipeItemQty:       { fontSize: font.sm - 1, fontWeight: '700', color: colors.textPrimary },
  sinDatos:            { fontSize: font.sm - 1, color: colors.textMuted, fontStyle: 'italic' },
  empty:               { color: colors.textMuted, fontSize: font.md, textAlign: 'center', marginTop: spacing.xxl },
  premiumWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:        { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:     { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  // Modal
  overlay:             { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalBox:            { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader:         { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
  modalTabs:           { flex: 1, flexDirection: 'row', gap: spacing.sm },
  modalTab:            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  modalTabEntrada:     { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  modalTabSalida:      { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  modalTabText:        { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  modalTabTextEntrada: { color: '#16a34a' },
  modalTabTextSalida:  { color: '#dc2626' },
  closeBtn:            { padding: spacing.xs },
  modalBody:           { padding: spacing.lg },
  label:               { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input:               { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.md, color: colors.textPrimary },
  ingSelecRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  ingSelecNombre:      { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  ingSelecStock:       { fontSize: font.sm - 1, color: colors.textSecondary, marginTop: 2 },
  sugerenciasBox:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.xs, overflow: 'hidden' },
  sugerenciaItem:      { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  sugNombre:           { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  sugStock:            { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  motivosRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  motivoChip:          { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  motivoChipActivo:    { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  motivoText:          { fontSize: font.sm - 1, color: colors.textSecondary, fontWeight: '600' },
  motivoTextActivo:    { color: '#dc2626' },
  btnGuardar:          { marginTop: spacing.lg, backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnGuardarSalida:    { backgroundColor: colors.danger },
  btnGuardarText:      { color: '#fff', fontWeight: '800', fontSize: font.md },
});
