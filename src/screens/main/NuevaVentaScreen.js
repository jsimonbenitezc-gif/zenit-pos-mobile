import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

// ─── Quick tags para notas ────────────────────────────────────────────────────

const QUICK_TAGS = ['Sin', 'Con', 'Extra', 'Poco', 'Mucho', 'Aparte'];

const TIPO_PEDIDO = [
  { key: 'comer',    label: 'Comer aquí', icon: 'restaurant-outline' },
  { key: 'llevar',   label: 'Llevar',     icon: 'bag-handle-outline'  },
  { key: 'domicilio',label: 'Domicilio',  icon: 'bicycle-outline'     },
];

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

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function NuevaVentaScreen() {
  const [categories, setCategories] = useState([]);
  const [catActiva, setCatActiva]   = useState(null);
  const [productos, setProductos]   = useState([]);
  const [clientes, setClientes]     = useState([]);
  const [carrito, setCarrito]       = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [loading, setLoading]       = useState(true);

  // Búsqueda de cliente en pantalla principal
  const [busqNombre, setBusqNombre]       = useState('');
  const [busqTelefono, setBusqTelefono]   = useState('');
  const [showSugerencias, setShowSug]     = useState(false);

  // Modales
  const [showCarrito, setShowCarrito]           = useState(false);
  const [cobrandoModal, setCobrandoModal]       = useState(false);
  const [notaModal, setNotaModal]               = useState(null);

  // Datos del pedido
  const [tipoPedido, setTipoPedido]       = useState('comer');
  const [metodoPago, setMetodoPago]       = useState('efectivo');
  const [clienteSeleccionado, setCliente] = useState(null);
  const [textoNota, setTextoNota]         = useState('');
  const [enviando, setEnviando]           = useState(false);

  // Swipe para cerrar carrito — PanResponder SOLO en el drag handle
  const cartPan = useRef(new Animated.Value(0)).current;
  const cartHandlePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => { if (g.dy > 0) cartPan.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.8) {
        cartPan.setValue(0);
        setShowCarrito(false);
      } else {
        Animated.spring(cartPan, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

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
    } catch {
      Alert.alert('Error', 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Búsqueda de cliente inline ────────────────────────────────────────────

  const sugerencias = clientes.filter(c => {
    if (!busqNombre && !busqTelefono) return false;
    const matchNombre = busqNombre ? c.name?.toLowerCase().includes(busqNombre.toLowerCase()) : true;
    const matchTel    = busqTelefono ? c.phone?.includes(busqTelefono) : true;
    return matchNombre && matchTel;
  }).slice(0, 5);

  function seleccionarCliente(c) {
    setCliente(c);
    setBusqNombre(c.name || '');
    setBusqTelefono(c.phone || '');
    setShowSug(false);
  }

  function limpiarCliente() {
    setCliente(null);
    setBusqNombre('');
    setBusqTelefono('');
    setShowSug(false);
  }

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
      { text: 'Vaciar', style: 'destructive', onPress: () => setCarrito([]) },
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
        order_type: tipoPedido,
        customer_id: clienteSeleccionado?.id || null,
      });
      setCarrito([]);
      limpiarCliente();
      setShowCarrito(false);
      setCobrandoModal(false);
      Alert.alert('Venta registrada', `Total: $${total.toFixed(2)}`);
    } catch (e) {
      Alert.alert('Error al registrar', e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const tipoActivo = TIPO_PEDIDO.find(t => t.key === tipoPedido);

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

      {/* Búsqueda de producto */}
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
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Búsqueda de cliente inline */}
      {clienteSeleccionado ? (
        <View style={styles.clienteChip}>
          <Ionicons name="person" size={16} color={colors.primary} />
          <Text style={styles.clienteChipText}>{clienteSeleccionado.name}</Text>
          {clienteSeleccionado.phone && (
            <Text style={styles.clienteChipSub}>{clienteSeleccionado.phone}</Text>
          )}
          <TouchableOpacity onPress={limpiarCliente} style={{ marginLeft: spacing.xs }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.clienteInputRow}>
          <View style={[styles.searchWrap, { flex: 1, marginHorizontal: 0, marginRight: spacing.xs }]}>
            <Ionicons name="person-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={busqNombre}
              onChangeText={v => { setBusqNombre(v); setShowSug(true); setCliente(null); }}
              onFocus={() => setShowSug(true)}
              placeholder="Nombre cliente"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={[styles.searchWrap, { flex: 1, marginHorizontal: 0 }]}>
            <Ionicons name="call-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={busqTelefono}
              onChangeText={v => { setBusqTelefono(v); setShowSug(true); setCliente(null); }}
              onFocus={() => setShowSug(true)}
              placeholder="Teléfono"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      )}

      {/* Sugerencias de cliente */}
      {showSugerencias && sugerencias.length > 0 && (
        <View style={styles.sugerencias}>
          {sugerencias.map(c => (
            <TouchableOpacity key={c.id} style={styles.sugerenciaItem} onPress={() => seleccionarCliente(c)}>
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <Text style={styles.sugerenciaNombre}>{c.name}</Text>
              {c.phone && <Text style={styles.sugerenciaTel}>{c.phone}</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.sugerenciaClose} onPress={() => setShowSug(false)}>
            <Text style={{ color: colors.textMuted, fontSize: font.sm - 1 }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {categories.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.catChip, catActiva === c.id && styles.catChipActive]}
            onPress={() => { setCatActiva(c.id); setShowSug(false); }}
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
        onScrollBeginDrag={() => setShowSug(false)}
      />

      {/* ── Modal carrito (con swipe para cerrar) ── */}
      <Modal
        visible={showCarrito}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCarrito(false)}
      >
        <Animated.View
          style={[{ flex: 1, backgroundColor: colors.background }, { transform: [{ translateY: cartPan }] }]}
        >
          {/* Drag handle — swipe aquí para cerrar */}
          <View style={styles.dragHandleWrap} {...cartHandlePan.panHandlers}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
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
            {/* Tipo de pedido */}
            <Text style={styles.sectionLabel}>Tipo de pedido</Text>
            <View style={styles.tipoPedidoRow}>
              {TIPO_PEDIDO.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tipoBtn, tipoPedido === t.key && styles.tipoBtnActive]}
                  onPress={() => setTipoPedido(t.key)}
                >
                  <Ionicons name={t.icon} size={18} color={tipoPedido === t.key ? '#fff' : colors.textSecondary} />
                  <Text style={[styles.tipoBtnText, tipoPedido === t.key && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cliente */}
            {clienteSeleccionado && (
              <View style={[styles.sectionLabel, { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }]}>
                <Ionicons name="person" size={14} color={colors.textSecondary} />
                <Text style={[styles.sectionLabel, { marginBottom: 0, marginLeft: spacing.xs }]}>{clienteSeleccionado.name}</Text>
              </View>
            )}

            {/* Items */}
            <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
              Productos ({totalItems})
            </Text>
            {carrito.map(item => (
              <CartItem key={item.uid} item={item} onDelete={eliminarDelCarrito} onEditNota={abrirNota} />
            ))}

            {carrito.length === 0 && (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyCartText}>El ticket está vacío</Text>
              </View>
            )}
          </ScrollView>

          {carrito.length > 0 && (
            <View style={styles.carritoFooter}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={styles.totalLabel}>{tipoActivo?.label}  ·  {totalItems} {totalItems === 1 ? 'producto' : 'productos'}</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.btnCobrar} onPress={() => { setShowCarrito(false); setCobrandoModal(true); }}>
                <Text style={styles.btnCobrarText}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </Modal>

      {/* ── Modal notas por producto ── */}
      <Modal
        visible={notaModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNotaModal(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Nota del producto</Text>
                {notaModal && <Text style={styles.modalSub}>{notaModal.nombre}</Text>}
              </View>
              <TouchableOpacity onPress={() => setNotaModal(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.sectionLabel}>Tags rápidos</Text>
              <View style={styles.tagsWrap}>
                {QUICK_TAGS.map(tag => (
                  <TouchableOpacity key={tag} style={styles.tag} onPress={() => agregarTagRapido(tag)}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                  <TouchableOpacity style={[styles.btnSecundario, { flex: 1 }]} onPress={() => setTextoNota('')}>
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

      {/* ── Modal de cobro ── */}
      <Modal
        visible={cobrandoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setCobrandoModal(false); setShowCarrito(true); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
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
            <View style={[styles.resumenCliente, { marginBottom: spacing.xl }]}>
              <Ionicons name={tipoActivo?.icon} size={14} color={colors.textSecondary} />
              <Text style={[styles.resumenClienteText, { marginLeft: spacing.xs }]}>
                {tipoActivo?.label}  ·  {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Método de pago</Text>
            {[
              { key: 'efectivo',       label: 'Efectivo',       icon: 'cash-outline'           },
              { key: 'tarjeta',        label: 'Tarjeta',        icon: 'card-outline'           },
              { key: 'transferencia',  label: 'Transferencia',  icon: 'phone-portrait-outline' },
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
  safe:           { flex: 1, backgroundColor: colors.background },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title:          { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  carritoBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl },
  carritoBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  searchWrap:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  searchIcon:     { marginRight: spacing.xs },
  searchInput:    { flex: 1, paddingVertical: spacing.md, paddingLeft: 0, fontSize: font.md, color: colors.textPrimary },
  clienteInputRow:{ flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  clienteChip:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '44', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  clienteChipText:{ fontSize: font.sm, fontWeight: '700', color: colors.primary, flex: 1 },
  clienteChipSub: { fontSize: font.sm - 2, color: colors.primary + 'aa' },
  sugerencias:    { marginHorizontal: spacing.lg, marginTop: -spacing.xs, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', zIndex: 100 },
  sugerenciaItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  sugerenciaNombre:{ fontSize: font.sm, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  sugerenciaTel:  { fontSize: font.sm - 1, color: colors.textMuted },
  sugerenciaClose:{ padding: spacing.sm, alignItems: 'center' },
  catScroll:      { flexGrow: 0, marginBottom: spacing.sm },
  catChip:        { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  catChipActive:  { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText:    { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  catChipTextActive:{ color: '#fff' },
  grid:           { padding: spacing.lg, paddingTop: spacing.sm },
  productCard:    { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  productEmoji:   { fontSize: 32, marginBottom: spacing.xs },
  productName:    { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
  productPrice:   { fontSize: font.md, fontWeight: '800', color: colors.primary },
  empty:          { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, fontSize: font.md },
  dragHandleWrap: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:     { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  modalSub:       { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  sectionLabel:   { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  tipoPedidoRow:  { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tipoBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  tipoBtnActive:  { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoBtnText:    { fontSize: font.sm - 1, fontWeight: '700', color: colors.textSecondary },
  cartItem:       { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cartEmoji:      { fontSize: 24, marginRight: spacing.sm },
  cartName:       { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  cartNota:       { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 1, marginBottom: 1 },
  cartPrice:      { fontSize: font.md, fontWeight: '800', color: colors.primary },
  iconBtn:        { padding: spacing.sm, marginLeft: spacing.xs },
  emptyCart:      { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyCartText:  { color: colors.textMuted, fontSize: font.md },
  tagsWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag:            { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tagText:        { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  notaInput:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, textAlignVertical: 'top', minHeight: 80 },
  carritoFooter:  { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  totalLabel:     { fontSize: font.sm, color: colors.textSecondary, fontWeight: '600' },
  totalValue:     { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },
  btnCobrar:      { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center' },
  btnCobrarText:  { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnSecundario:  { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', backgroundColor: colors.surface },
  btnSecundarioText:{ color: colors.textSecondary, fontSize: font.md, fontWeight: '600' },
  resumenCliente: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm + 2, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  resumenClienteText:{ fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  metodoPagoBtn:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  metodoPagoBtnActive:{ backgroundColor: colors.primary, borderColor: colors.primary },
  metodoPagoText: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
});
