import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

// ─── Chip de arrastre (drag handle) ──────────────────────────────────────────

function DragHandle() {
  return (
    <View style={styles.dragHandleWrap}>
      <View style={styles.dragHandle} />
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

// ─── Fila del carrito ─────────────────────────────────────────────────────────

function CartItem({ item, onDelete, onEditNota }) {
  return (
    <View style={styles.cartItem}>
      <Text style={styles.cartEmoji}>{item.emoji || '🛍️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.nombre}</Text>
        {item.nota ? (
          <Text style={styles.cartNota} numberOfLines={1}>📝 {item.nota}</Text>
        ) : null}
        <Text style={styles.cartPrice}>${item.precio.toFixed(2)}</Text>
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={() => onEditNota(item)}>
        <Ionicons
          name={item.nota ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
          size={20}
          color={item.nota ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(item.uid)}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Quick tags para notas ────────────────────────────────────────────────────

const QUICK_TAGS = ['Sin', 'Con', 'Extra', 'Poco', 'Mucho', 'Aparte'];

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function NuevaVentaScreen() {
  const [categories, setCategories]   = useState([]);
  const [catActiva, setCatActiva]     = useState(null);
  const [productos, setProductos]     = useState([]);
  const [clientes, setClientes]       = useState([]);
  const [carrito, setCarrito]         = useState([]);
  const [busqueda, setBusqueda]       = useState('');
  const [loading, setLoading]         = useState(true);

  // Modales
  const [showCarrito, setShowCarrito]           = useState(false);
  const [cobrandoModal, setCobrandoModal]       = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [notaModal, setNotaModal]               = useState(null); // item siendo editado

  // Datos del pedido
  const [metodoPago, setMetodoPago]       = useState('efectivo');
  const [clienteSeleccionado, setCliente] = useState(null);
  const [busquedaCliente, setBusqCliente] = useState('');
  const [textoNota, setTextoNota]         = useState('');
  const [enviando, setEnviando]           = useState(false);

  const load = useCallback(async () => {
    try {
      const [grouped, clts] = await Promise.all([
        api.getProductsGrouped(),
        api.getCustomers(),
      ]);
      const cats = grouped.map(g => ({ id: g.id, name: g.name, emoji: g.emoji }));
      const all  = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, category_id: g.id })));
      setCategories([{ id: null, name: 'Todos', emoji: '🔍' }, ...cats]);
      setProductos(all);
      setClientes(clts);
      setCatActiva(null);
    } catch {
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Carrito ────────────────────────────────────────────────────────────────

  const productosFiltrados = productos.filter(p => {
    const enCat = catActiva === null || p.category_id === catActiva;
    const enBusqueda = !busqueda || p.name.toLowerCase().includes(busqueda.toLowerCase());
    return enCat && enBusqueda && p.active !== false;
  });

  function agregarAlCarrito(producto) {
    const uid = `${producto.id}_${Date.now()}_${Math.random()}`;
    setCarrito(prev => [...prev, {
      uid,
      product_id: producto.id,
      nombre: producto.name,
      emoji: producto.emoji || '🛍️',
      precio: parseFloat(producto.price),
      nota: '',
    }]);
  }

  function eliminarDelCarrito(uid) {
    setCarrito(prev => prev.filter(i => i.uid !== uid));
  }

  function vaciarCarrito() {
    Alert.alert('Vaciar ticket', '¿Eliminar todos los productos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar', style: 'destructive', onPress: () => {
        setCarrito([]);
        setCliente(null);
      }},
    ]);
  }

  // ── Notas individuales ────────────────────────────────────────────────────

  function abrirNota(item) {
    setTextoNota(item.nota || '');
    setNotaModal(item);
  }

  function agregarTagRapido(tag) {
    setTextoNota(prev => prev ? `${prev}, ${tag}` : tag);
  }

  function guardarNota() {
    if (!notaModal) return;
    setCarrito(prev => prev.map(i => i.uid === notaModal.uid ? { ...i, nota: textoNota.trim() } : i));
    setNotaModal(null);
  }

  // ── Totales ────────────────────────────────────────────────────────────────

  const total = carrito.reduce((s, i) => s + i.precio, 0);
  const totalItems = carrito.length;

  // ── Cobrar ─────────────────────────────────────────────────────────────────

  async function cobrar() {
    if (carrito.length === 0) return;
    setEnviando(true);
    try {
      await api.createOrder({
        items: carrito.map(i => ({ product_id: i.product_id, quantity: 1, notes: i.nota || undefined })),
        payment_method: metodoPago,
        order_type: 'comer',
        customer_id: clienteSeleccionado?.id || null,
      });
      setCarrito([]);
      setCliente(null);
      setShowCarrito(false);
      setCobrandoModal(false);
      Alert.alert('Venta registrada', `Total: $${total.toFixed(2)}`);
    } catch (e) {
      Alert.alert('Error al registrar', e.message);
    } finally {
      setEnviando(false);
    }
  }

  // ── Clientes filtrados ─────────────────────────────────────────────────────

  const clientesFiltrados = clientes.filter(c =>
    !busquedaCliente ||
    c.name?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
    c.phone?.includes(busquedaCliente)
  );

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
            <Ionicons name="cart" size={16} color="#fff" />
            <Text style={styles.carritoBtnText}> {totalItems}  ·  ${total.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.textMuted}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')} style={{ padding: spacing.xs }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
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

      {/* ── Modal carrito ── */}
      <Modal
        visible={showCarrito}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCarrito(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <DragHandle />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ticket actual</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              {carrito.length > 0 && (
                <TouchableOpacity onPress={vaciarCarrito}>
                  <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.sm }}>Vaciar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowCarrito(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {/* Items */}
            {carrito.map(item => (
              <CartItem
                key={item.uid}
                item={item}
                onDelete={eliminarDelCarrito}
                onEditNota={abrirNota}
              />
            ))}

            {carrito.length === 0 && (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyCartText}>El ticket está vacío</Text>
              </View>
            )}

            {/* Selector de cliente */}
            {carrito.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Cliente</Text>
                <TouchableOpacity
                  style={styles.clienteRow}
                  onPress={() => { setBusqCliente(''); setShowClienteModal(true); }}
                >
                  <Ionicons name="person-outline" size={20} color={colors.textMuted} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.clienteRowNombre}>
                      {clienteSeleccionado ? clienteSeleccionado.name : 'Sin cliente'}
                    </Text>
                    {clienteSeleccionado?.phone && (
                      <Text style={styles.clienteRowSub}>{clienteSeleccionado.phone}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          {carrito.length > 0 && (
            <View style={styles.carritoFooter}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={styles.totalLabel}>Total  ·  {totalItems} {totalItems === 1 ? 'producto' : 'productos'}</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.btnCobrar} onPress={() => { setShowCarrito(false); setCobrandoModal(true); }}>
                <Text style={styles.btnCobrarText}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Modal notas por producto ── */}
      <Modal
        visible={notaModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNotaModal(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <DragHandle />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Nota</Text>
                {notaModal && <Text style={styles.modalSub}>{notaModal.nombre}</Text>}
              </View>
              <TouchableOpacity onPress={() => setNotaModal(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              {/* Quick tags */}
              <Text style={styles.sectionLabel}>Tags rápidos</Text>
              <View style={styles.tagsWrap}>
                {QUICK_TAGS.map(tag => (
                  <TouchableOpacity key={tag} style={styles.tag} onPress={() => agregarTagRapido(tag)}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Texto libre */}
              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Detalle</Text>
              <TextInput
                style={styles.notaInput}
                value={textoNota}
                onChangeText={setTextoNota}
                placeholder="Ej: Sin cebolla, extra salsa..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                autoFocus
              />

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                {textoNota.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.btnSecundario, { flex: 1 }]}
                    onPress={() => setTextoNota('')}
                  >
                    <Text style={styles.btnSecundarioText}>Limpiar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.btnCobrar, { flex: 2 }]} onPress={guardarNota}>
                  <Text style={styles.btnCobrarText}>Guardar nota</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal selector de cliente ── */}
      <Modal
        visible={showClienteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowClienteModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <DragHandle />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar cliente</Text>
            <TouchableOpacity onPress={() => setShowClienteModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={busquedaCliente}
                onChangeText={setBusqCliente}
                placeholder="Buscar por nombre o teléfono..."
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
          </View>

          <FlatList
            data={[{ id: null, name: 'Sin cliente', phone: null }, ...clientesFiltrados]}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            renderItem={({ item }) => {
              const activo = clienteSeleccionado?.id === item.id || (item.id === null && !clienteSeleccionado);
              return (
                <TouchableOpacity
                  style={[styles.clienteOpcion, activo && styles.clienteOpcionActive]}
                  onPress={() => {
                    setCliente(item.id === null ? null : item);
                    setShowClienteModal(false);
                  }}
                >
                  <Ionicons
                    name={item.id ? 'person' : 'person-remove-outline'}
                    size={20}
                    color={activo ? '#fff' : colors.textMuted}
                  />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.clienteOpcionNombre, activo && { color: '#fff' }]}>{item.name}</Text>
                    {item.phone && <Text style={[styles.clienteOpcionSub, activo && { color: '#ffffffaa' }]}>{item.phone}</Text>}
                  </View>
                  {activo && <Ionicons name="checkmark" size={20} color="#fff" />}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Modal de cobro ── */}
      <Modal
        visible={cobrandoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setCobrandoModal(false); setShowCarrito(true); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <DragHandle />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cobrar</Text>
            <TouchableOpacity onPress={() => { setCobrandoModal(false); setShowCarrito(true); }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            {clienteSeleccionado && (
              <View style={styles.resumenCliente}>
                <Ionicons name="person" size={16} color={colors.textSecondary} />
                <Text style={[styles.resumenClienteText, { marginLeft: spacing.xs }]}>{clienteSeleccionado.name}</Text>
              </View>
            )}

            <Text style={styles.totalLabel}>Total a cobrar</Text>
            <Text style={[styles.totalValue, { fontSize: 40, marginBottom: spacing.xs }]}>${total.toFixed(2)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.sm, marginBottom: spacing.xl }}>
              {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
            </Text>

            <Text style={styles.sectionLabel}>Método de pago</Text>
            {[
              { key: 'efectivo', label: 'Efectivo', icon: 'cash-outline' },
              { key: 'tarjeta', label: 'Tarjeta', icon: 'card-outline' },
              { key: 'transferencia', label: 'Transferencia', icon: 'phone-portrait-outline' },
            ].map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.metodoPagoBtn, metodoPago === m.key && styles.metodoPagoBtnActive]}
                onPress={() => setMetodoPago(m.key)}
              >
                <Ionicons name={m.icon} size={20} color={metodoPago === m.key ? '#fff' : colors.textSecondary} />
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
  dragHandleWrap: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  carritoBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl },
  carritoBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  searchIcon: { marginRight: spacing.xs },
  searchInput: { flex: 1, padding: spacing.md, paddingLeft: 0, fontSize: font.md, color: colors.textPrimary },
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  modalSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cartEmoji: { fontSize: 24, marginRight: spacing.sm },
  cartName: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  cartNota: { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 1, marginBottom: 1 },
  cartPrice: { fontSize: font.md, fontWeight: '800', color: colors.primary },
  iconBtn: { padding: spacing.sm, marginLeft: spacing.xs },
  emptyCart: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyCartText: { color: colors.textMuted, fontSize: font.md },
  sectionLabel: { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  clienteRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  clienteRowNombre: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  clienteRowSub: { fontSize: font.sm - 1, color: colors.textMuted },
  clienteOpcion: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  clienteOpcionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  clienteOpcionNombre: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  clienteOpcionSub: { fontSize: font.sm - 1, color: colors.textMuted },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  notaInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, textAlignVertical: 'top', minHeight: 80 },
  carritoFooter: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  totalLabel: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },
  btnCobrar: { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center' },
  btnCobrarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnSecundario: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', backgroundColor: colors.surface },
  btnSecundarioText: { color: colors.textSecondary, fontSize: font.md, fontWeight: '600' },
  resumenCliente: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm + 2, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  resumenClienteText: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  metodoPagoBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  metodoPagoBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  metodoPagoText: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
});
