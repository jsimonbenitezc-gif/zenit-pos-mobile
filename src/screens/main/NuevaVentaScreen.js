import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Pressable,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import { createSSE } from '../../utils/sse';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';

// ─── Quick tags para notas ────────────────────────────────────────────────────

const QUICK_TAGS = ['Sin', 'Con', 'Extra', 'Poco', 'Mucho', 'Aparte'];

const TIPO_PEDIDO = [
  { key: 'comer',    label: 'Comer aquí', icon: 'restaurant-outline' },
  { key: 'llevar',   label: 'Llevar',     icon: 'bag-handle-outline'  },
  { key: 'domicilio',label: 'Domicilio',  icon: 'bicycle-outline'     },
];

// ─── Tarjeta de producto ──────────────────────────────────────────────────────

function ProductCard({ product, onPress, currency, mostrarStock, stockMap }) {
  // Usar stock basado en ingredientes si está disponible, si no usar product.stock
  const recipeStock = stockMap ? stockMap[product.id] : undefined;
  const rawStock = recipeStock !== undefined ? recipeStock : (product.stock ?? null);
  const stock = rawStock !== null ? Math.max(0, rawStock) : null;
  let stockEl = null;
  if (mostrarStock && stock !== null) {
    if (stock === 0) {
      stockEl = <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600', marginTop: 2 }}>Sin stock</Text>;
    } else if (stock <= 3) {
      stockEl = <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600', marginTop: 2 }}>⚠ {stock} disponibles</Text>;
    } else {
      stockEl = <Text style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>{stock} disponibles</Text>;
    }
  }
  return (
    <TouchableOpacity style={[styles.productCard, mostrarStock && stock === 0 && { opacity: 0.5 }]} onPress={() => onPress(product)}>
      <Text style={styles.productEmoji}>{product.emoji || '🛍️'}</Text>
      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.productPrice}>{formatMoney(parseFloat(product.price), currency)}</Text>
      {stockEl}
    </TouchableOpacity>
  );
}

// ─── Fila del carrito ─────────────────────────────────────────────────────────

function CartItem({ item, onDelete, onEditNota, currency }) {
  return (
    <View style={styles.cartItem}>
      <Text style={styles.cartEmoji}>{item.emoji || '🛍️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.nombre}</Text>
        {item.nota ? (
          <Text style={styles.cartNota} numberOfLines={1}>📝 {item.nota}</Text>
        ) : null}
        <Text style={styles.cartPrice}>{formatMoney(item.precio, currency)}</Text>
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
  const { settings, user, refreshSettings, sucursalId, nombreActivo, rolActivo, permisosRolesEfectivos } = useAuth();
  const currency = settings?.currency_symbol || '$';
  const isPremium = user?.plan === 'premium' || user?.plan === 'trial';

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
  const [showDescuentoModal, setShowDescuentoModal] = useState(false);

  // Datos del pedido
  const [tipoPedido, setTipoPedido]       = useState('comer');
  const [metodoPago, setMetodoPago]       = useState('efectivo');
  const [clienteSeleccionado, setCliente] = useState(null);
  const [textoNota, setTextoNota]         = useState('');
  const [enviando, setEnviando]           = useState(false);

  // Efectivo
  const [efectivoRecibido, setEfectivoRecibido] = useState('');

  // Domicilio
  const [domNombre, setDomNombre]         = useState('');
  const [domDireccion, setDomDireccion]   = useState('');

  // Descuentos
  const [descuento, setDescuento]         = useState(0);
  const [descuentoNombre, setDescuentoNombre] = useState('');
  const [descuentos, setDescuentos]       = useState([]);
  const [cargandoDesc, setCargandoDesc]   = useState(false);

  // Modal PIN para descuentos con requires_pin
  const [pinDescModal, setPinDescModal]   = useState(false);
  const [pinDescValue, setPinDescValue]   = useState('');
  const [pinDescError, setPinDescError]   = useState('');
  const [pinDescLoading, setPinDescLoading] = useState(false);
  const [descPendiente, setDescPendiente] = useState(null); // el descuento esperando PIN
  const pinDescRef = useRef(null);

  // Puntos de fidelidad
  const [puntosUsados, setPuntosUsados]   = useState(false);

  // Ajuste visual: mostrar stock disponible
  const [mostrarStock, setMostrarStock]   = useState(false);
  const [stockMap, setStockMap]           = useState(null); // { productId: qty | null }

  // ── Swipe para cerrar carrito ─────────────────────────────────────────────
  const cartPan       = useRef(new Animated.Value(0)).current;
  const cartPanRef    = useRef(0);
  const cartScrollYRef = useRef(0);
  const cartClosedRef  = useRef(520);

  const cartOverlayOpacity = cartPan.interpolate({
    inputRange: [0, 520],
    outputRange: [0.45, 0],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const id = cartPan.addListener(({ value }) => { cartPanRef.current = value; });
    return () => cartPan.removeListener(id);
  }, [cartPan]);

  function openCartPanel() {
    cartScrollYRef.current = 0;
    setShowCarrito(true);
    cartPan.setValue(cartClosedRef.current);
    requestAnimationFrame(() => {
      Animated.spring(cartPan, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    });
  }

  function closeCartPanel(onClosed) {
    Animated.timing(cartPan, {
      toValue: cartClosedRef.current,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowCarrito(false);
      onClosed?.();
    });
  }

  const cartHeaderPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => {
      const atTop = cartScrollYRef.current <= 4;
      return atTop && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx);
    },
    onMoveShouldSetPanResponder: (_, g) =>
      cartScrollYRef.current <= 4 && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      cartPan.stopAnimation((value) => {
        cartPan.setValue(Math.max(0, Math.min(cartClosedRef.current, value)));
      });
    },
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) {
        cartPan.setValue(Math.min(cartClosedRef.current, g.dy));
      } else {
        cartPan.setValue(g.dy * 0.12);
      }
    },
    onPanResponderRelease: (_, g) => {
      const shouldClose = g.dy > 36 || g.vy > 0.35 || cartPanRef.current > 90;
      if (shouldClose) {
        closeCartPanel();
      } else {
        Animated.spring(cartPan, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(cartPan, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
    },
  })).current;

  // ── Carga inicial ─────────────────────────────────────────────────────────

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

  useEffect(() => {
    let sse = null;
    SecureStore.getItemAsync('mostrar_stock').then(val => {
      const show = val === 'true';
      setMostrarStock(show);
      if (show) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
        sse = createSSE(api.getInventoryEventsConfig(), () => {
          api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
        });
      }
    });
    return () => { sse?.close(); };
  }, [sucursalId]);

  // Refrescar stock cada vez que la pantalla gana foco (ej. volver de otra tab)
  useFocusEffect(
    useCallback(() => {
      if (mostrarStock) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      }
    }, [mostrarStock, sucursalId])
  );

  // Auto-rellenar campos de domicilio cuando cambia el tipo o el cliente
  useEffect(() => {
    if (tipoPedido === 'domicilio' && clienteSeleccionado) {
      setDomNombre(prev => prev || clienteSeleccionado.name || '');
      setDomDireccion(prev => prev || clienteSeleccionado.address || '');
    }
  }, [tipoPedido, clienteSeleccionado]);

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
    setPuntosUsados(false);
  }

  function limpiarCliente() {
    setCliente(null);
    setBusqNombre('');
    setBusqTelefono('');
    setShowSug(false);
    setPuntosUsados(false);
  }

  // ── Carrito ───────────────────────────────────────────────────────────────

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

  // ── Totales y cálculos ────────────────────────────────────────────────────

  const subtotal    = carrito.reduce((s, i) => s + i.precio, 0);
  const totalItems  = carrito.length;

  // Fidelidad
  const loyaltyEnabled     = settings?.puntos_activos === true || settings?.puntos_activos === 'true';
  const clienteEnFidelidad = !!clienteSeleccionado?.in_loyalty;
  const puntosDisponibles  = clienteSeleccionado?.loyalty_points || 0;
  const valorPunto         = parseFloat(settings?.puntos_valor || '0.10');
  const ratePorPeso        = parseFloat(settings?.puntos_por_peso || '0.1');
  const bonoPorPedido      = parseInt(settings?.puntos_bono_pedido || '0', 10);
  const valorPuntosDisp    = parseFloat((puntosDisponibles * valorPunto).toFixed(2));

  // El descuento en pesos que generan los puntos (capped al total después del descuento regular)
  const descuentoPuntos = puntosUsados
    ? Math.min(valorPuntosDisp, Math.max(0, subtotal - descuento))
    : 0;

  const totalFinal = Math.max(0, subtotal - descuento - descuentoPuntos);

  // Puntos que ganaría con esta compra (solo si no está usando puntos)
  const puntosAGanar = (!puntosUsados && loyaltyEnabled && clienteEnFidelidad)
    ? Math.floor(totalFinal * ratePorPeso) + bonoPorPedido
    : 0;

  // Efectivo
  const recibido = parseFloat(efectivoRecibido.replace(/[^\d.]/g, '')) || 0;
  const cambio   = recibido - totalFinal;

  const puedeConfirmar = metodoPago !== 'efectivo' || recibido >= totalFinal;

  // ── Descuentos ────────────────────────────────────────────────────────────

  async function abrirDescuentos() {
    setShowDescuentoModal(true);
    setCargandoDesc(true);
    try {
      const data = await api.getDiscounts();
      setDescuentos((data || []).filter(d => d.active));
    } catch {
      setDescuentos([]);
    } finally {
      setCargandoDesc(false);
    }
  }

  function aplicarDescuento(d) {
    if (d.requires_pin) {
      // Este descuento requiere PIN — guardar pendiente y mostrar modal
      setDescPendiente(d);
      setPinDescValue('');
      setPinDescError('');
      setShowDescuentoModal(false);
      setPinDescModal(true);
      return;
    }
    _aplicarDescuentoFinal(d);
  }

  function _aplicarDescuentoFinal(d) {
    const monto = d.type === 'percentage'
      ? parseFloat((subtotal * parseFloat(d.value) / 100).toFixed(2))
      : parseFloat(d.value);
    setDescuento(Math.min(monto, subtotal));
    setDescuentoNombre(d.name);
    setShowDescuentoModal(false);
  }

  async function confirmarDescuentoConPin() {
    if (!pinDescValue) { setPinDescError('Ingresa tu PIN'); return; }
    if (api.isPinLocked()) {
      setPinDescError(`Demasiados intentos. Espera ${api.getPinLockRemainingMin()} min.`);
      return;
    }
    setPinDescLoading(true);
    setPinDescError('');
    try {
      const perfilActual = permisosRolesEfectivos?.[rolActivo];
      if (perfilActual?.pin_set) {
        const result = await api.verifyProfilePin(rolActivo, pinDescValue);
        if (!result.valid) {
          api.registerPinFailure();
          setPinDescError(api.isPinLocked() ? `Demasiados intentos. Espera 5 min.` : 'PIN incorrecto');
          setPinDescLoading(false);
          return;
        }
        api.resetPinAttempts();
      }
      // PIN válido: aplicar descuento y registrar en auditoría
      const d = descPendiente;
      _aplicarDescuentoFinal(d);
      setPinDescModal(false);
      setDescPendiente(null);
      const monto = d.type === 'percentage'
        ? parseFloat((subtotal * parseFloat(d.value) / 100).toFixed(2))
        : parseFloat(d.value);
      api.request('/audit', {
        method: 'POST',
        body: {
          employee_name: nombreActivo || '',
          action_type: 'apply_discount',
          target_description: `Descuento: "${d.name}"`,
          after_data: { discount_name: d.name, amount: Math.min(monto, subtotal) },
        }
      }).catch(() => {});
    } catch (e) {
      setPinDescError(e.message || 'Error al verificar PIN');
    } finally {
      setPinDescLoading(false);
    }
  }

  function quitarDescuento() {
    setDescuento(0);
    setDescuentoNombre('');
  }

  // ── Puntos de fidelidad ───────────────────────────────────────────────────

  function togglePuntos() {
    setPuntosUsados(prev => !prev);
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  async function cobrar() {
    if (carrito.length === 0) return;
    if (metodoPago === 'efectivo' && recibido < totalFinal) {
      Alert.alert('Efectivo insuficiente', 'El monto recibido es menor al total a cobrar.');
      return;
    }
    if (tipoPedido === 'domicilio' && !domDireccion.trim()) {
      const continuar = await new Promise(resolve =>
        Alert.alert(
          'Sin dirección',
          'No se registró una dirección para este pedido. ¿Continuar de todas formas?',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sí, continuar', onPress: () => resolve(true) },
          ],
          { cancelable: false }
        )
      );
      if (!continuar) return;
    }
    setEnviando(true);
    try {
      const orderBody = {
        items: carrito.map(i => ({ product_id: i.product_id, quantity: 1, notes: i.nota || undefined })),
        payment_method: metodoPago,
        order_type: tipoPedido,
        customer_id: clienteSeleccionado?.id || null,
        delivery_address: tipoPedido === 'domicilio' ? (domDireccion || null) : null,
        customer_temp_info: tipoPedido === 'domicilio' && domNombre
          ? JSON.stringify({ name: domNombre })
          : null,
        branch_id: sucursalId || null,
        discount_amount: (descuento + descuentoPuntos) || 0,
      };

      // Puntos de fidelidad: se envían al backend para que se procesen en la misma transacción
      if (clienteSeleccionado?.id && clienteEnFidelidad && loyaltyEnabled) {
        if (puntosUsados && puntosDisponibles > 0) {
          orderBody.loyalty_points_used = puntosDisponibles;
        } else if (puntosAGanar > 0) {
          orderBody.loyalty_points_earned = puntosAGanar;
        }
      }

      await api.createOrder(orderBody);

      // Limpiar todo
      setCarrito([]);
      limpiarCliente();
      setShowCarrito(false);
      setCobrandoModal(false);
      setDescuento(0);
      setDescuentoNombre('');
      setPuntosUsados(false);
      setEfectivoRecibido('');
      setDomNombre('');
      setDomDireccion('');

      // Refrescar stock inmediatamente (sin esperar SSE)
      if (mostrarStock) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      }

      Alert.alert('Venta registrada', `Total: ${formatMoney(totalFinal, currency)}`);
    } catch (e) {
      Alert.alert('Error al registrar', friendlyError(e));
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
          <TouchableOpacity style={styles.carritoBtn} onPress={openCartPanel}>
            <Ionicons name="cart" size={16} color="#fff" />
            <Text style={styles.carritoBtnText}> {totalItems}  ·  {formatMoney(subtotal, currency)}</Text>
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
        renderItem={({ item }) => <ProductCard product={item} onPress={agregarAlCarrito} currency={currency} mostrarStock={mostrarStock} stockMap={stockMap} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay productos en esta categoría</Text>}
        onScrollBeginDrag={() => setShowSug(false)}
      />

      {/* Panel carrito */}
      {showCarrito && (
        <View style={styles.cartLayer} pointerEvents="box-none">
          <Pressable style={styles.cartOverlayPressable} onPress={() => closeCartPanel()}>
            <Animated.View style={[styles.cartOverlay, { opacity: cartOverlayOpacity }]} />
          </Pressable>
          <Animated.View
            style={[styles.cartPanel, { transform: [{ translateY: cartPan }] }]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0) cartClosedRef.current = Math.max(240, Math.round(h + 24));
            }}
            {...cartHeaderPan.panHandlers}
          >
            <View>
              <View style={styles.dragHandleWrap}>
                <View style={styles.dragHandle} />
              </View>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ticket actual</Text>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  {carrito.length > 0 && (
                    <TouchableOpacity onPress={vaciarCarrito}>
                      <Text style={{ color: colors.danger, fontWeight: '700', fontSize: font.sm }}>Vaciar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => closeCartPanel()}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: spacing.lg }}
              onScroll={(e) => { cartScrollYRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
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
                <CartItem key={item.uid} item={item} onDelete={eliminarDelCarrito} onEditNota={abrirNota} currency={currency} />
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
                  <Text style={styles.totalValue}>{formatMoney(subtotal, currency)}</Text>
                </View>
                <TouchableOpacity style={styles.btnCobrar} onPress={() => closeCartPanel(() => { setCobrandoModal(true); refreshSettings(); })}>
                  <Text style={styles.btnCobrarText}>Cobrar</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      )}

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
        onRequestClose={() => { setCobrandoModal(false); openCartPanel(); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cobrar</Text>
            <TouchableOpacity onPress={() => { setCobrandoModal(false); openCartPanel(); }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>

              {/* Cliente */}
              {clienteSeleccionado && (
                <View style={styles.resumenCliente}>
                  <Ionicons name="person" size={16} color={colors.textSecondary} />
                  <Text style={[styles.resumenClienteText, { marginLeft: spacing.xs }]}>{clienteSeleccionado.name}</Text>
                </View>
              )}

              {/* Resumen de total */}
              <Text style={styles.totalLabel}>Total a cobrar</Text>
              {descuento > 0 || descuentoPuntos > 0 ? (
                <View style={styles.totalDesglose}>
                  <View style={styles.totalDesgloseRow}>
                    <Text style={styles.totalDesgloseLabel}>Subtotal</Text>
                    <Text style={styles.totalDesgloseValor}>{formatMoney(subtotal, currency)}</Text>
                  </View>
                  {descuento > 0 && (
                    <View style={styles.totalDesgloseRow}>
                      <Text style={[styles.totalDesgloseLabel, { color: colors.success }]}>
                        Desc. {descuentoNombre}
                      </Text>
                      <Text style={[styles.totalDesgloseValor, { color: colors.success }]}>
                        -{formatMoney(descuento, currency)}
                      </Text>
                    </View>
                  )}
                  {descuentoPuntos > 0 && (
                    <View style={styles.totalDesgloseRow}>
                      <Text style={[styles.totalDesgloseLabel, { color: '#7c3aed' }]}>
                        ⭐ Puntos canjeados
                      </Text>
                      <Text style={[styles.totalDesgloseValor, { color: '#7c3aed' }]}>
                        -{formatMoney(descuentoPuntos, currency)}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}
              <Text style={[styles.totalValue, { fontSize: 40, marginBottom: spacing.xs }]}>
                {formatMoney(totalFinal, currency)}
              </Text>
              <View style={[styles.resumenCliente, { marginBottom: spacing.xl }]}>
                <Ionicons name={tipoActivo?.icon} size={14} color={colors.textSecondary} />
                <Text style={[styles.resumenClienteText, { marginLeft: spacing.xs }]}>
                  {tipoActivo?.label}  ·  {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
                </Text>
              </View>

              {/* Método de pago */}
              <Text style={styles.sectionLabel}>Método de pago</Text>
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

              {/* Calculadora de cambio (solo efectivo) */}
              {metodoPago === 'efectivo' && (
                <View style={styles.efectivoBox}>
                  <Text style={styles.sectionLabel}>Efectivo recibido</Text>
                  <TextInput
                    style={styles.efectivoInput}
                    value={efectivoRecibido}
                    onChangeText={setEfectivoRecibido}
                    placeholder={`0.00`}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  {recibido > 0 && (
                    <View style={styles.cambioRow}>
                      <Text style={styles.cambioLabel}>Cambio a entregar</Text>
                      <Text style={[styles.cambioValor, { color: cambio >= 0 ? colors.success : colors.danger }]}>
                        {formatMoney(Math.max(0, cambio), currency)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Datos de entrega (solo domicilio) */}
              {tipoPedido === 'domicilio' && (
                <View style={styles.domicilioBox}>
                  <Text style={styles.sectionLabel}>Datos de entrega</Text>
                  <TextInput
                    style={[styles.domicilioInput, { marginBottom: spacing.sm }]}
                    value={domNombre}
                    onChangeText={setDomNombre}
                    placeholder="Nombre del destinatario"
                    placeholderTextColor={colors.textMuted}
                  />
                  <TextInput
                    style={styles.domicilioInput}
                    value={domDireccion}
                    onChangeText={setDomDireccion}
                    placeholder="Dirección de entrega"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>
              )}

              {/* Descuento (solo premium) */}
              {isPremium && (
                <View style={styles.descuentoSection}>
                  <Text style={styles.sectionLabel}>Descuento</Text>
                  {descuento > 0 ? (
                    <View style={styles.descuentoAplicado}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.descuentoAplicadoNombre}>{descuentoNombre}</Text>
                        <Text style={styles.descuentoAplicadoMonto}>-{formatMoney(descuento, currency)}</Text>
                      </View>
                      <TouchableOpacity onPress={quitarDescuento} style={styles.btnQuitarDesc}>
                        <Ionicons name="close-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.btnAplicarDesc} onPress={abrirDescuentos}>
                      <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                      <Text style={styles.btnAplicarDescText}>Aplicar descuento</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Puntos de fidelidad */}
              {loyaltyEnabled && clienteEnFidelidad && (
                <View style={styles.puntosBox}>
                  <View style={styles.puntosHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.puntosBalance}>
                        ⭐ {puntosDisponibles} puntos disponibles
                      </Text>
                      {puntosDisponibles > 0 && (
                        <Text style={styles.puntosValor}>
                          Vale {formatMoney(valorPuntosDisp, currency)}
                        </Text>
                      )}
                      {!puntosUsados && puntosAGanar > 0 && (
                        <Text style={styles.puntosGanar}>
                          +{puntosAGanar} puntos con esta compra
                        </Text>
                      )}
                      {puntosUsados && (
                        <Text style={styles.puntosGanar}>
                          No acumulas puntos al canjearlos
                        </Text>
                      )}
                    </View>
                  </View>
                  {puntosDisponibles > 0 && (
                    <TouchableOpacity
                      style={[styles.btnPuntos, puntosUsados && styles.btnPuntosActivo]}
                      onPress={togglePuntos}
                    >
                      <Ionicons
                        name={puntosUsados ? 'checkmark-circle' : 'star-outline'}
                        size={16}
                        color={puntosUsados ? '#fff' : '#7c3aed'}
                      />
                      <Text style={[styles.btnPuntosText, puntosUsados && { color: '#fff' }]}>
                        {puntosUsados ? `Puntos aplicados (-${formatMoney(descuentoPuntos, currency)})` : 'Usar puntos como descuento'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Botón confirmar */}
              <TouchableOpacity
                style={[
                  styles.btnCobrar,
                  { marginTop: spacing.xl },
                  (enviando || !puedeConfirmar) && { opacity: 0.5 },
                ]}
                onPress={cobrar}
                disabled={enviando || !puedeConfirmar}
              >
                {enviando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnCobrarText}>Confirmar venta</Text>
                }
              </TouchableOpacity>

              {metodoPago === 'efectivo' && !puedeConfirmar && (
                <Text style={styles.advertenciaEfectivo}>
                  Ingresa el efectivo recibido para continuar
                </Text>
              )}

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal de selección de descuentos ── */}
      <Modal
        visible={showDescuentoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDescuentoModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Aplicar descuento</Text>
            <TouchableOpacity onPress={() => setShowDescuentoModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {cargandoDesc ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : descuentos.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="pricetag-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyCartText}>No hay descuentos activos</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: spacing.xs }}>
                  Crea descuentos desde la sección Ofertas
                </Text>
              </View>
            ) : (
              descuentos.map(d => {
                const monto = d.type === 'percentage'
                  ? parseFloat((subtotal * parseFloat(d.value) / 100).toFixed(2))
                  : parseFloat(d.value);
                const etiqueta = d.type === 'percentage'
                  ? `${parseFloat(d.value)}%`
                  : formatMoney(parseFloat(d.value), currency);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.descuentoItem}
                    onPress={() => aplicarDescuento(d)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.descuentoItemNombre}>{d.name}</Text>
                      <Text style={styles.descuentoItemEtiqueta}>{etiqueta} de descuento</Text>
                    </View>
                    <Text style={styles.descuentoItemMonto}>-{formatMoney(monto, currency)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Modal PIN para descuento con requires_pin */}
      <Modal
        visible={pinDescModal}
        transparent
        animationType="fade"
        onShow={() => setTimeout(() => pinDescRef.current?.focus(), 100)}
        onRequestClose={() => { setPinDescModal(false); setDescPendiente(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.pinOverlay}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Autorización requerida</Text>
            <Text style={styles.pinMsg}>
              {`Aplicar descuento "${descPendiente?.name}" requiere autorización.\nIngresa tu PIN para confirmar.`}
            </Text>
            <TextInput
              ref={pinDescRef}
              style={[styles.pinInput, pinDescError ? { borderColor: colors.danger } : null]}
              placeholder="PIN"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={20}
              value={pinDescValue}
              onChangeText={v => { setPinDescValue(v); setPinDescError(''); }}
              onSubmitEditing={confirmarDescuentoConPin}
            />
            {pinDescError ? <Text style={styles.pinErrorText}>{pinDescError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnCancel]}
                onPress={() => { setPinDescModal(false); setDescPendiente(null); }}
                disabled={pinDescLoading}
              >
                <Text style={styles.pinBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnConfirm, pinDescLoading && { opacity: 0.6 }]}
                onPress={confirmarDescuentoConPin}
                disabled={pinDescLoading}
              >
                {pinDescLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.pinBtnConfirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  cartLayer:      { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  cartOverlayPressable: { ...StyleSheet.absoluteFillObject },
  cartOverlay:    { flex: 1, backgroundColor: '#000' },
  cartPanel:      { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background },
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

  // Desglose de total con descuentos
  totalDesglose:      { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  totalDesgloseRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  totalDesgloseLabel: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '600' },
  totalDesgloseValor: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '700' },

  // Efectivo
  efectivoBox:    { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
  efectivoInput:  { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.xl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm, backgroundColor: colors.background },
  cambioRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  cambioLabel:    { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  cambioValor:    { fontSize: font.lg, fontWeight: '800' },

  // Domicilio
  domicilioBox:   { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
  domicilioInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background },

  // Descuento
  descuentoSection:   { marginTop: spacing.lg, marginBottom: spacing.sm },
  btnAplicarDesc:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.primary + '66', borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.primary + '0d' },
  btnAplicarDescText: { fontSize: font.md, fontWeight: '600', color: colors.primary },
  descuentoAplicado:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success + '15', borderRadius: radius.md, borderWidth: 1, borderColor: colors.success + '44', padding: spacing.md },
  descuentoAplicadoNombre: { fontSize: font.sm, fontWeight: '700', color: colors.success },
  descuentoAplicadoMonto:  { fontSize: font.md, fontWeight: '800', color: colors.success },
  btnQuitarDesc:      { padding: spacing.xs },

  // Puntos de fidelidad
  puntosBox:      { backgroundColor: '#f5f3ff', borderRadius: radius.md, borderWidth: 1, borderColor: '#ddd6fe', padding: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
  puntosHeader:   { marginBottom: spacing.sm },
  puntosBalance:  { fontSize: font.md, fontWeight: '700', color: '#6d28d9' },
  puntosValor:    { fontSize: font.sm, color: '#7c3aed', marginTop: 2 },
  puntosGanar:    { fontSize: font.sm - 1, color: '#8b5cf6', marginTop: 2 },
  btnPuntos:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 2, borderColor: '#7c3aed', borderRadius: radius.md, padding: spacing.sm + 2, backgroundColor: '#fff', justifyContent: 'center' },
  btnPuntosActivo:{ backgroundColor: '#7c3aed', borderColor: '#6d28d9' },
  btnPuntosText:  { fontSize: font.sm, fontWeight: '700', color: '#7c3aed' },

  // Lista de descuentos en modal
  descuentoItem:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  descuentoItemNombre:{ fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  descuentoItemEtiqueta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  descuentoItemMonto: { fontSize: font.lg, fontWeight: '800', color: colors.success },

  // Advertencia efectivo
  advertenciaEfectivo: { textAlign: 'center', color: colors.textMuted, fontSize: font.sm, marginTop: spacing.sm },

  // Modal PIN
  pinOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  pinBox:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 340 },
  pinTitle:    { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  pinMsg:      { fontSize: font.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  pinInput:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background, textAlign: 'center', letterSpacing: 6, marginBottom: spacing.xs },
  pinErrorText:{ fontSize: font.sm, color: colors.danger, marginBottom: spacing.sm },
  pinActions:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pinBtn:      { flex: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  pinBtnCancel:{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pinBtnCancelText: { color: colors.textSecondary, fontWeight: '600' },
  pinBtnConfirm:{ backgroundColor: colors.primary },
  pinBtnConfirmText: { color: '#fff', fontWeight: '700' },
});
