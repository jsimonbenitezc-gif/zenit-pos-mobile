import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

// ─── Carrito ─────────────────────────────────────────────────────────────────

function CartItem({ item, onAdd, onRemove }) {
  return (
    <View style={styles.cartItem}>
      <Text style={styles.cartEmoji}>{item.emoji || '🛍️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.nombre}</Text>
        <Text style={styles.cartPrice}>${(item.precio * item.cantidad).toFixed(2)}</Text>
      </View>
      <View style={styles.qtyControls}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onRemove(item.product_id)}>
          <Text style={styles.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyNum}>{item.cantidad}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => onAdd(item)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────

function ProductCard({ product, onPress }) {
  return (
    <TouchableOpacity style={styles.productCard} onPress={() => onPress(product)}>
      <Text style={styles.productEmoji}>{product.emoji || '🛍️'}</Text>
      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.productPrice}>${parseFloat(product.price).toFixed(2)}</Text>
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function NuevaVentaScreen() {
  const [categories, setCategories]       = useState([]);
  const [catActiva, setCatActiva]         = useState(null);
  const [productos, setProductos]         = useState([]);
  const [carrito, setCarrito]             = useState([]);
  const [busqueda, setBusqueda]           = useState('');
  const [loading, setLoading]             = useState(true);
  const [showCarrito, setShowCarrito]     = useState(false);
  const [cobrandoModal, setCobrandoModal] = useState(false);
  const [metodoPago, setMetodoPago]       = useState('efectivo');
  const [enviando, setEnviando]           = useState(false);

  const load = useCallback(async () => {
    try {
      const grouped = await api.getProductsGrouped();
      const cats = grouped.map(g => ({ id: g.id, name: g.name, emoji: g.emoji }));
      const all  = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, category_id: g.id })));
      setCategories([{ id: null, name: 'Todos', emoji: '🔍' }, ...cats]);
      setProductos(all);
      setCatActiva(null);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtrar productos
  const productosFiltrados = productos.filter(p => {
    const enCat = catActiva === null || p.category_id === catActiva;
    const enBusqueda = !busqueda || p.name.toLowerCase().includes(busqueda.toLowerCase());
    return enCat && enBusqueda && p.active !== false;
  });

  function agregarAlCarrito(producto) {
    setCarrito(prev => {
      const existe = prev.find(i => i.product_id === producto.id);
      if (existe) {
        return prev.map(i => i.product_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { product_id: producto.id, nombre: producto.name, emoji: producto.emoji, precio: parseFloat(producto.price), cantidad: 1 }];
    });
  }

  function quitarDelCarrito(productId) {
    setCarrito(prev => {
      const item = prev.find(i => i.product_id === productId);
      if (item?.cantidad === 1) return prev.filter(i => i.product_id !== productId);
      return prev.map(i => i.product_id === productId ? { ...i, cantidad: i.cantidad - 1 } : i);
    });
  }

  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);

  async function cobrar() {
    if (carrito.length === 0) return;
    setEnviando(true);
    try {
      await api.createOrder({
        items: carrito.map(i => ({ product_id: i.product_id, quantity: i.cantidad })),
        payment_method: metodoPago,
        order_type: 'comer',
      });
      setCarrito([]);
      setShowCarrito(false);
      setCobrandoModal(false);
      Alert.alert('✅ Venta registrada', `Total: $${total.toFixed(2)}`);
    } catch (e) {
      Alert.alert('Error al registrar', e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Nueva Venta</Text>
        {carrito.length > 0 && (
          <TouchableOpacity style={styles.carritoBtn} onPress={() => setShowCarrito(true)}>
            <Text style={styles.carritoBtnText}>🛒 {totalItems}  ·  ${total.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {categories.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.catChip, catActiva === c.id && styles.catChipActive]}
            onPress={() => setCatActiva(c.id)}
          >
            <Text style={[styles.catChipText, catActiva === c.id && styles.catChipTextActive]}>
              {c.emoji} {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Grid de productos */}
      <FlatList
        data={productosFiltrados}
        keyExtractor={p => String(p.id)}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => <ProductCard product={item} onPress={agregarAlCarrito} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay productos en esta categoría</Text>}
      />

      {/* Modal carrito */}
      <Modal visible={showCarrito} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Carrito</Text>
            <TouchableOpacity onPress={() => setShowCarrito(false)}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.md }}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={carrito}
            keyExtractor={i => String(i.product_id)}
            contentContainerStyle={{ padding: spacing.lg }}
            renderItem={({ item }) => (
              <CartItem item={item} onAdd={agregarAlCarrito.bind(null, { id: item.product_id, name: item.nombre, emoji: item.emoji, price: item.precio })} onRemove={quitarDelCarrito} />
            )}
            ListEmptyComponent={<Text style={styles.empty}>El carrito está vacío</Text>}
          />

          {carrito.length > 0 && (
            <View style={styles.carritoFooter}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.btnCobrar} onPress={() => { setShowCarrito(false); setCobrandoModal(true); }}>
                <Text style={styles.btnCobrarText}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal de cobro */}
      <Modal visible={cobrandoModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cobrar</Text>
            <TouchableOpacity onPress={() => setCobrandoModal(false)}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.md }}>Atrás</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            <Text style={styles.totalLabel}>Total a cobrar</Text>
            <Text style={[styles.totalValue, { fontSize: 36, marginBottom: spacing.xl }]}>${total.toFixed(2)}</Text>

            <Text style={styles.sectionLabel}>Método de pago</Text>
            {[
              { key: 'efectivo', label: '💵 Efectivo' },
              { key: 'tarjeta', label: '💳 Tarjeta' },
              { key: 'transferencia', label: '📱 Transferencia' },
            ].map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.metodoPagoBtn, metodoPago === m.key && styles.metodoPagoBtnActive]}
                onPress={() => setMetodoPago(m.key)}
              >
                <Text style={[styles.metodoPagoText, metodoPago === m.key && { color: '#fff' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.btnCobrar, { marginTop: spacing.xl }, enviando && { opacity: 0.7 }]}
              onPress={cobrar}
              disabled={enviando}
            >
              {enviando
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnCobrarText}>Confirmar venta</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  carritoBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl },
  carritoBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, fontSize: font.md, color: colors.textPrimary },
  catScroll: { flexGrow: 0, marginBottom: spacing.sm },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  catChipTextActive: { color: '#fff' },
  grid: { padding: spacing.lg, paddingTop: spacing.sm },
  productCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  productEmoji: { fontSize: 32, marginBottom: spacing.xs },
  productName: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
  productPrice: { fontSize: font.md, fontWeight: '800', color: colors.primary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, fontSize: font.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cartEmoji: { fontSize: 24, marginRight: spacing.sm },
  cartName: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  cartPrice: { fontSize: font.md, fontWeight: '800', color: colors.primary, marginTop: 2 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: font.lg, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  qtyNum: { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  carritoFooter: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  totalLabel: { fontSize: font.md, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },
  btnCobrar: { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center' },
  btnCobrarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  sectionLabel: { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  metodoPagoBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  metodoPagoBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  metodoPagoText: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
});
