import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { formatMoney } from '../../utils/money';
import { createSSE } from '../../utils/sse';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tiempoTranscurrido(isoDate) {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

// ─── Tarjeta de Mesa ──────────────────────────────────────────────────────────

function MesaCard({ mesa, onPress, currency }) {
  const ocupada = !!mesa.open_order;
  const order   = mesa.open_order;
  const total   = order ? parseFloat(order.total || 0) : 0;
  const items   = order?.items?.length || 0;

  return (
    <TouchableOpacity
      style={[styles.card, ocupada ? styles.cardOcupada : styles.cardLibre]}
      onPress={() => onPress(mesa)}
      activeOpacity={0.75}
    >
      <View style={[styles.statusDot, { backgroundColor: ocupada ? '#f59e0b' : '#22c55e' }]} />

      <Text style={styles.cardName}>{mesa.name}</Text>
      {mesa.zone ? <Text style={styles.cardZone}>{mesa.zone}</Text> : null}

      {ocupada ? (
        <>
          <Text style={styles.cardTotal}>{formatMoney(total, currency)}</Text>
          <Text style={styles.cardMeta}>{items} {items === 1 ? 'producto' : 'productos'}</Text>
          <Text style={styles.cardTiempo}>{tiempoTranscurrido(order.createdAt)}</Text>
        </>
      ) : (
        <View style={styles.cardLibreTag}>
          <Text style={styles.cardLibreText}>Libre</Text>
        </View>
      )}

      <View style={styles.capacidadRow}>
        <Ionicons name="people-outline" size={12} color={colors.textMuted} />
        <Text style={styles.capacidadText}>{mesa.capacity}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function MesasScreen() {
  const { isOwner, settings, sucursalId } = useAuth();
  const currency = settings?.currency_symbol || '$';

  const [mesas, setMesas]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [mostrarStock, setMostrarStock] = useState(false);
  const [stockMap, setStockMap]         = useState(null);

  // Selección activa
  const [mesaSel, setMesaSel]         = useState(null);
  const [ordenActiva, setOrdenActiva] = useState(null);

  // Modal: abrir mesa (elegir comensales antes de agregar productos)
  const [modalAbrirVisible, setModalAbrir]   = useState(false);
  const [comensales, setComensales]          = useState('');

  // Modal: detalle de mesa ocupada
  const [modalDetalleVisible, setModalDetalle] = useState(false);

  // Modal: agregar productos
  const [modalAgregarVisible, setModalAgregar]   = useState(false);
  const [productos, setProductos]                = useState([]);
  const [carritoAgregar, setCarritoAgregar]      = useState({});
  const [loadingProductos, setLoadingProductos]  = useState(false);
  const [agregando, setAgregando]                = useState(false);
  const [busquedaP, setBusquedaP]                = useState('');

  // Modal: cobrar
  const [modalCobrarVisible, setModalCobrar] = useState(false);
  const [metodoPago, setMetodoPago]          = useState('efectivo');
  const [cobrando, setCobrando]              = useState(false);

  // Fidelidad en cobro de mesa
  const [busqCliente, setBusqCliente]        = useState('');
  const [sugerencias, setSugerencias]        = useState([]);
  const [clienteSelec, setClienteSelec]      = useState(null);

  async function buscarClientes(texto) {
    if (texto.length < 2) { setSugerencias([]); return; }
    try {
      const todos = await api.getCustomers();
      const q = texto.toLowerCase();
      setSugerencias(
        (todos || []).filter(c =>
          c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
        ).slice(0, 5)
      );
    } catch { setSugerencias([]); }
  }

  function abrirCobrar() {
    setBusqCliente('');
    setSugerencias([]);
    setClienteSelec(null);
    setModalCobrar(true);
  }

  // Modal: crear mesa
  const [modalCrearVisible, setModalCrear]   = useState(false);
  const [nuevaNombre, setNuevaNombre]        = useState('');
  const [nuevaZona, setNuevaZona]            = useState('');
  const [nuevaCapacidad, setNuevaCapacidad]  = useState('4');
  const [creando, setCreando]                = useState(false);

  // Toast de confirmación
  const [toast, setToast]                    = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ── Cargar ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const data = await api.getTables();
      setMesas(data);
    } catch (err) {
      Alert.alert('Error', err?.message || 'No se pudieron cargar las mesas.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  // Cargar al entrar a la pantalla, SSE en tiempo real + intervalo de respaldo
  useFocusEffect(
    useCallback(() => {
      load();
      SecureStore.getItemAsync('mostrar_stock').then(val => {
        const show = val === 'true';
        setMostrarStock(show);
        if (show) {
          api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
        }
      });

      // SSE: actualización en tiempo real cuando cambia un pedido
      const sseOrders = createSSE(api.getOrdersEventsConfig(), () => load());

      // SSE: actualización en tiempo real cuando cambian los insumos (stock)
      const sseInv = createSSE(api.getInventoryEventsConfig(), () => {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      });

      // Intervalo de respaldo por si el SSE falla o no está disponible
      const interval = setInterval(() => load(), 30000);

      return () => {
        sseOrders.close();
        sseInv.close();
        clearInterval(interval);
      };
    }, [load])
  );

  // ── Tocar una mesa ──────────────────────────────────────────────────────────

  function tocarMesa(mesa) {
    setMesaSel(mesa);
    if (mesa.open_order) {
      setOrdenActiva(mesa.open_order);
      setModalDetalle(true);
    } else {
      setComensales(String(mesa.capacity));
      setModalAbrir(true);
    }
  }

  // ── Cargar catálogo de productos ─────────────────────────────────────────────

  async function cargarProductos() {
    setLoadingProductos(true);
    setCarritoAgregar({});
    setBusquedaP('');
    try {
      const grouped = await api.getProductsGrouped();
      const all = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, categoryName: g.name })));
      setProductos(all.filter(p => p.active !== false));
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los productos.');
    } finally {
      setLoadingProductos(false);
    }
  }

  // Al abrir mesa libre: pasar directo al catálogo de productos
  function irAgregarDesdeLibre() {
    setModalAbrir(false);
    setModalAgregar(true);
    cargarProductos();
  }

  // Desde mesa ocupada: abrir catálogo
  function abrirAgregarProductos() {
    setModalAgregar(true);
    cargarProductos();
  }

  // ── Carrito de agregar ───────────────────────────────────────────────────────

  function incrementar(producto) {
    setCarritoAgregar(prev => ({
      ...prev,
      [producto.id]: { producto, qty: (prev[producto.id]?.qty || 0) + 1 },
    }));
  }

  function decrementar(productoId) {
    setCarritoAgregar(prev => {
      const qty = (prev[productoId]?.qty || 0) - 1;
      if (qty <= 0) {
        const next = { ...prev };
        delete next[productoId];
        return next;
      }
      return { ...prev, [productoId]: { ...prev[productoId], qty } };
    });
  }

  async function confirmarAgregar() {
    const items = Object.values(carritoAgregar).map(({ producto, qty }) => ({
      product_id: producto.id,
      quantity: qty,
    }));
    if (items.length === 0) return;

    setAgregando(true);
    try {
      if (!ordenActiva) {
        // Mesa libre: crear pedido nuevo vinculado a la mesa
        const order = await api.createOrder({
          items,
          order_type: 'comer',
          table_id: mesaSel?.id,
          guests: parseInt(comensales) || mesaSel?.capacity || 1,
          branch_id: sucursalId || null,
        });
        setOrdenActiva(order);
        setModalAgregar(false);
        setModalDetalle(true);
      } else {
        // Mesa ocupada: agregar a pedido existente
        const updated = await api.addItemsToOrder(ordenActiva.id, items);
        setOrdenActiva(updated);
        setModalAgregar(false);
      }
      load();
      // Refrescar stock inmediatamente (sin esperar SSE)
      if (mostrarStock) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      }
      showToast('✓ Comanda enviada a cocina');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setAgregando(false);
    }
  }

  // ── Cobrar ───────────────────────────────────────────────────────────────────

  async function confirmarCobrar() {
    if (!ordenActiva) return;
    setCobrando(true);
    try {
      await api.updateOrderStatus(ordenActiva.id, 'completado');

      // Otorgar puntos si hay cliente seleccionado con fidelidad activa
      if (clienteSelec) {
        try {
          const settings = await api.getSettings();
          const activo = settings?.puntos_activos === true || settings?.puntos_activos === 'true';
          if (activo) {
            const rate  = parseFloat(settings?.puntos_por_peso ?? 0.1);
            const bonus = parseInt(settings?.puntos_bono_pedido ?? 0);
            const pts   = Math.floor(parseFloat(ordenActiva.total || 0) * rate) + bonus;
            if (pts > 0) {
              await api.updateCustomerLoyalty(clienteSelec.id, { points_delta: pts });
              showToast(`⭐ +${pts} puntos para ${clienteSelec.name}`);
            }
          }
        } catch { /* los puntos no son críticos */ }
      }

      setModalCobrar(false);
      setModalDetalle(false);
      setOrdenActiva(null);
      setMesaSel(null);
      load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setCobrando(false);
    }
  }

  // ── Crear mesa ───────────────────────────────────────────────────────────────

  async function crearMesa() {
    if (!nuevaNombre.trim()) return Alert.alert('Error', 'El nombre es requerido.');
    setCreando(true);
    try {
      await api.createTable({
        name: nuevaNombre.trim(),
        zone: nuevaZona.trim() || 'General',
        capacity: parseInt(nuevaCapacidad) || 4,
      });
      setModalCrear(false);
      setNuevaNombre(''); setNuevaZona(''); setNuevaCapacidad('4');
      load();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setCreando(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const totalOrden = parseFloat(ordenActiva?.total || 0);

  const productosFiltrados = productos.filter(p =>
    !busquedaP || p.name.toLowerCase().includes(busquedaP.toLowerCase())
  );

  const totalCarrito = Object.values(carritoAgregar)
    .reduce((s, { producto, qty }) => s + parseFloat(producto.price) * qty, 0);

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mesas</Text>
        {isOwner && (
          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalCrear(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Leyenda */}
      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}><View style={[styles.leyendaDot, { backgroundColor: '#22c55e' }]} /><Text style={styles.leyendaTxt}>Libre</Text></View>
        <View style={styles.leyendaItem}><View style={[styles.leyendaDot, { backgroundColor: '#f59e0b' }]} /><Text style={styles.leyendaTxt}>Ocupada</Text></View>
        <Text style={styles.leyendaCount}>{mesas.filter(m => m.open_order).length}/{mesas.length} ocupadas</Text>
      </View>

      {mesas.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="grid-outline" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No hay mesas configuradas</Text>
          {isOwner && (
            <TouchableOpacity style={styles.btnCrearVacio} onPress={() => setModalCrear(true)}>
              <Text style={styles.btnCrearVacioText}>+ Crear primera mesa</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={mesas}
          keyExtractor={m => String(m.id)}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <MesaCard mesa={item} onPress={tocarMesa} currency={currency} />}
        />
      )}

      {/* ── Modal: Mesa libre → elegir comensales ── */}
      <Modal visible={modalAbrirVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalAbrir(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Abrir {mesaSel?.name}</Text>
            <TouchableOpacity onPress={() => setModalAbrir(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.fieldLabel}>Número de comensales</Text>
              <TextInput
                style={styles.input}
                value={comensales}
                onChangeText={setComensales}
                keyboardType="number-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={styles.hint}>Capacidad de la mesa: {mesaSel?.capacity} personas</Text>
              <TouchableOpacity style={[styles.btnPrimary, { marginTop: spacing.xl }]} onPress={irAgregarDesdeLibre}>
                <Ionicons name="restaurant-outline" size={20} color="#fff" />
                <Text style={styles.btnPrimaryText}>Agregar productos</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal: Detalle de mesa ocupada ── */}
      <Modal visible={modalDetalleVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setModalDetalle(false); setOrdenActiva(null); }}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{mesaSel?.name}</Text>
              <Text style={styles.modalSub}>
                {tiempoTranscurrido(ordenActiva?.createdAt)}
                {ordenActiva?.guests ? ` · ${ordenActiva.guests} personas` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setModalDetalle(false); setOrdenActiva(null); }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {ordenActiva?.items?.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.itemEmoji}>{item.product?.emoji || '🛍️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product?.name || 'Producto'}</Text>
                  {item.notes ? <Text style={styles.itemNota}>📝 {item.notes}</Text> : null}
                </View>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatMoney(parseFloat(item.subtotal || 0), currency)}</Text>
              </View>
            ))}
            {(!ordenActiva?.items || ordenActiva.items.length === 0) && (
              <Text style={styles.emptyItems}>Sin productos aún</Text>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatMoney(totalOrden, currency)}</Text>
            </View>
          </ScrollView>

          <View style={styles.detalleFooter}>
            <TouchableOpacity style={styles.btnSec} onPress={abrirAgregarProductos}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.btnSecText}>Agregar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCobrar} onPress={abrirCobrar}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.btnCobrarText}>Cobrar {formatMoney(totalOrden, currency)}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Modal: Agregar productos ── */}
      <Modal visible={modalAgregarVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalAgregar(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Agregar a {mesaSel?.name}</Text>
            <TouchableOpacity onPress={() => setModalAgregar(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput style={styles.searchInput} value={busquedaP} onChangeText={setBusquedaP} placeholder="Buscar producto..." placeholderTextColor={colors.textMuted} />
          </View>
          {loadingProductos ? (
            <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
          ) : (
            <FlatList
              data={productosFiltrados}
              keyExtractor={p => String(p.id)}
              numColumns={2}
              contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
              columnWrapperStyle={{ gap: spacing.sm }}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              renderItem={({ item }) => {
                const qty = carritoAgregar[item.id]?.qty || 0;
                const recipeStock = stockMap ? stockMap[item.id] : undefined;
                const rawStock = recipeStock !== undefined ? recipeStock : (item.stock ?? null);
                const stock = rawStock !== null ? Math.max(0, rawStock) : null;
                let stockEl = null;
                if (mostrarStock && stock !== null) {
                  if (stock === 0) {
                    stockEl = <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600', marginTop: 2 }}>Sin stock</Text>;
                  } else if (stock <= 3) {
                    stockEl = <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600', marginTop: 2 }}>⚠ {stock} disp.</Text>;
                  } else {
                    stockEl = <Text style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>{stock} disp.</Text>;
                  }
                }
                return (
                  <View style={[styles.pCard, mostrarStock && stock === 0 && { opacity: 0.5 }]}>
                    <Text style={styles.pEmoji}>{item.emoji || '🛍️'}</Text>
                    <Text style={styles.pName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.pPrice}>{formatMoney(parseFloat(item.price), currency)}</Text>
                    {stockEl}
                    {qty === 0 ? (
                      <TouchableOpacity style={styles.btnPlusSm} onPress={() => incrementar(item)}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementar(item.id)}>
                          <Ionicons name="remove" size={14} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.qtyTxt}>{qty}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => incrementar(item)}>
                          <Ionicons name="add" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
          {Object.keys(carritoAgregar).length > 0 && (
            <View style={styles.agregarFooter}>
              <TouchableOpacity
                style={[styles.btnCobrar, { flex: 0 }, agregando && styles.btnDisabled]}
                onPress={confirmarAgregar}
                disabled={agregando}
              >
                {agregando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnCobrarText}>Enviar comanda · {formatMoney(totalCarrito, currency)}</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Modal: Cobrar ── */}
      <Modal visible={modalCobrarVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCobrar(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cobrar</Text>
            <TouchableOpacity onPress={() => setModalCobrar(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
            <Text style={styles.cobrarMesa}>{mesaSel?.name}</Text>
            <Text style={styles.cobrarTotal}>{formatMoney(totalOrden, currency)}</Text>

            {/* Asignar cliente para puntos (opcional) */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Cliente para puntos <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(opcional)</Text></Text>
            {clienteSelec ? (
              <View style={styles.clienteSelecRow}>
                <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.clienteSelecNombre} numberOfLines={1}>{clienteSelec.name}</Text>
                <TouchableOpacity onPress={() => { setClienteSelec(null); setBusqCliente(''); }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={busqCliente}
                  onChangeText={t => { setBusqCliente(t); buscarClientes(t); }}
                  placeholder="Buscar por nombre o teléfono..."
                  placeholderTextColor={colors.textMuted}
                />
                {sugerencias.length > 0 && (
                  <View style={styles.sugerenciasBox}>
                    {sugerencias.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.sugerenciaItem}
                        onPress={() => { setClienteSelec(c); setBusqCliente(''); setSugerencias([]); }}
                      >
                        <Text style={styles.sugerenciaNombre}>{c.name}</Text>
                        {c.phone ? <Text style={styles.sugerenciaTel}>{c.phone}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Método de pago</Text>
            {[
              { key: 'efectivo',      label: 'Efectivo',      icon: 'cash-outline'           },
              { key: 'tarjeta',       label: 'Tarjeta',       icon: 'card-outline'           },
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
              style={[styles.btnPrimary, { marginTop: spacing.xl }, cobrando && styles.btnDisabled]}
              onPress={confirmarCobrar}
              disabled={cobrando}
            >
              {cobrando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Confirmar cobro</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Toast de confirmación */}
      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ── Modal: Crear mesa (solo dueño) ── */}
      {isOwner && (
        <Modal visible={modalCrearVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCrear(false)}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nueva mesa</Text>
                <TouchableOpacity onPress={() => setModalCrear(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
                <Text style={styles.fieldLabel}>Nombre *</Text>
                <TextInput style={styles.input} value={nuevaNombre} onChangeText={setNuevaNombre} placeholder="Ej: Mesa 1, Barra, Terraza A" placeholderTextColor={colors.textMuted} autoFocus />
                <Text style={styles.fieldLabel}>Zona</Text>
                <TextInput style={styles.input} value={nuevaZona} onChangeText={setNuevaZona} placeholder="Ej: Interior, Terraza, Barra" placeholderTextColor={colors.textMuted} />
                <Text style={styles.fieldLabel}>Capacidad (personas)</Text>
                <TextInput style={styles.input} value={nuevaCapacidad} onChangeText={setNuevaCapacidad} keyboardType="number-pad" placeholderTextColor={colors.textMuted} />
                <TouchableOpacity
                  style={[styles.btnPrimary, { marginTop: spacing.xl }, creando && styles.btnDisabled]}
                  onPress={crearMesa}
                  disabled={creando}
                >
                  {creando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Crear mesa</Text>}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.background },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title:            { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  btnAdd:           { backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  leyenda:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  leyendaItem:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  leyendaDot:       { width: 10, height: 10, borderRadius: 5 },
  leyendaTxt:       { fontSize: font.sm - 1, color: colors.textMuted, fontWeight: '600' },
  leyendaCount:     { marginLeft: 'auto', fontSize: font.sm - 1, color: colors.textMuted },

  grid:             { padding: spacing.lg, paddingTop: spacing.sm },

  card:             { flex: 1, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, minHeight: 130, position: 'relative' },
  cardLibre:        { backgroundColor: '#f0fdf4', borderColor: '#22c55e' },
  cardOcupada:      { backgroundColor: '#fff7ed', borderColor: '#f59e0b' },
  statusDot:        { width: 10, height: 10, borderRadius: 5, position: 'absolute', top: spacing.sm, right: spacing.sm },
  cardName:         { fontSize: font.md, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  cardZone:         { fontSize: font.sm - 2, color: colors.textMuted, marginBottom: spacing.xs },
  cardTotal:        { fontSize: font.xl, fontWeight: '800', color: '#d97706', marginTop: spacing.xs },
  cardMeta:         { fontSize: font.sm - 2, color: colors.textMuted },
  cardTiempo:       { fontSize: font.sm - 2, color: '#d97706', fontWeight: '700', marginTop: 2 },
  cardLibreTag:     { marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  cardLibreText:    { fontSize: font.sm - 2, fontWeight: '700', color: '#16a34a' },
  capacidadRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 'auto', paddingTop: spacing.xs },
  capacidadText:    { fontSize: font.sm - 2, color: colors.textMuted },

  emptyWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyTitle:       { fontSize: font.lg, fontWeight: '700', color: colors.textMuted },
  btnCrearVacio:    { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md },
  btnCrearVacioText:{ color: '#fff', fontWeight: '700', fontSize: font.md },

  modalSafe:        { flex: 1, backgroundColor: colors.background },
  dragHandleWrap:   { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  modalSub:         { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },

  fieldLabel:       { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.lg, color: colors.textPrimary, backgroundColor: colors.surface, marginBottom: spacing.md },
  hint:             { fontSize: font.sm - 1, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.md },

  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  itemEmoji:        { fontSize: 22 },
  itemName:         { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  itemNota:         { fontSize: font.sm - 2, color: colors.textMuted },
  itemQty:          { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary },
  itemPrice:        { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary, minWidth: 60, textAlign: 'right' },
  emptyItems:       { textAlign: 'center', color: colors.textMuted, paddingVertical: spacing.xl },

  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  totalLabel:       { fontSize: font.md, fontWeight: '700', color: colors.textSecondary },
  totalValue:       { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },

  detalleFooter:    { flexDirection: 'row', padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  btnSec:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  btnSecText:       { color: colors.primary, fontWeight: '700', fontSize: font.sm },
  btnCobrar:        { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md },
  btnCobrarText:    { color: '#fff', fontWeight: '700', fontSize: font.md },

  searchWrap:       { flexDirection: 'row', alignItems: 'center', margin: spacing.md, marginBottom: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, gap: spacing.xs },
  searchInput:      { flex: 1, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },

  pCard:            { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  pEmoji:           { fontSize: 28, marginBottom: spacing.xs },
  pName:            { fontSize: font.sm - 1, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
  pPrice:           { fontSize: font.sm, fontWeight: '800', color: colors.primary, marginBottom: spacing.xs },
  btnPlusSm:        { backgroundColor: colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qtyBtn:           { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyTxt:           { fontSize: font.md, fontWeight: '800', color: colors.textPrimary, minWidth: 18, textAlign: 'center' },
  agregarFooter:    { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },

  clienteSelecRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  clienteSelecNombre: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.primary },
  sugerenciasBox:   { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: -spacing.xs, marginBottom: spacing.md, overflow: 'hidden' },
  sugerenciaItem:   { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  sugerenciaNombre: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  sugerenciaTel:    { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },

  cobrarMesa:       { fontSize: font.lg, fontWeight: '700', color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  cobrarTotal:      { fontSize: 48, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md },
  metodoPagoBtn:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  metodoPagoBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  metodoPagoText:   { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },

  btnPrimary:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2 },
  btnPrimaryText:   { color: '#fff', fontWeight: '700', fontSize: font.lg },
  btnDisabled:      { opacity: 0.6 },

  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { color: '#fff', fontWeight: '700', fontSize: font.md },
});
