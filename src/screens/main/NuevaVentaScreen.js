import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Pressable,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import IconoProducto from '../../components/IconoProducto';
import SvgIcon from '../../components/SvgIcon';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { obtenerCatalogo, obtenerClientes, obtenerCatalogoModificadores, registrarVenta, sincronizarVentasPendientes } from '../../offline/ventasOffline';
import ModalModificadores from '../../components/ModalModificadores';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';
import { precioConModificadores, resumenModificadores, productoTieneModificadores } from '../../utils/modificadores';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import OfflineIndicator from '../../components/OfflineIndicator';
import { createSSE } from '../../utils/sse';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { configImpuesto, desglosarImpuesto, hayImpuesto, etiquetaImpuesto } from '../../utils/impuestos';
import { configPropina, hayPropinas, normalizarPropina, normalizarMetodo as normalizarMetodoPropina, propinaPorPorcentaje, totalConPropina } from '../../utils/propinas';
import { dividirEnPartes, faltantePago, pagosCuadran, validarPagos, metodoResumen as metodoResumenPagos, metodoDePago, PAGO_MAX, PAGO_TOLERANCIA } from '../../utils/pagos';

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
      stockEl = <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}><SvgIcon name="triangle-alert" size={10} color="#f59e0b" /><Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600', marginLeft: 2 }}>{stock} disponibles</Text></View>;
    } else {
      stockEl = <Text style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>{stock} disponibles</Text>;
    }
  }
  return (
    <TouchableOpacity style={[styles.productCard, mostrarStock && stock === 0 && { opacity: 0.5 }]} onPress={() => onPress(product)}>
      <IconoProducto valor={product.emoji || 'svg:shopping-bag'} imagen={product.image} size={32} color={colors.textSecondary} />
      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.productPrice}>{formatMoney(parseFloat(product.price), currency)}</Text>
      {stockEl}
    </TouchableOpacity>
  );
}

// ─── Fila del carrito ─────────────────────────────────────────────────────────

function CartItem({ item, onDelete, onEditNota, onEditMods, currency }) {
  return (
    <View style={styles.cartItem}>
      <IconoProducto valor={item.emoji || 'svg:shopping-bag'} size={24} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.nombre}</Text>
        {/* Modificadores (BLOQUE 11): van resaltados y no como nota gris — cambian
            lo que se cobra y lo que la cocina prepara. Tocarlos los edita. */}
        {resumenModificadores(item.modificadores) ? (
          <Text style={styles.cartMods} numberOfLines={2} onPress={() => onEditMods && onEditMods(item)}>
            {resumenModificadores(item.modificadores)}
          </Text>
        ) : null}
        {item.nota ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.cartNota, { marginLeft: 2 }]} numberOfLines={1}>{item.nota}</Text>
          </View>
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
  const { settings, user, isPremium, refreshSettings, sucursalId, puedeRegistrarEnSucursal, nombreActivo, rolActivo, permisosRolesEfectivos } = useAuth();
  const { online, refrescarPendientes } = useNetwork();
  const currency = settings?.currency_symbol || '$';

  const [categories, setCategories] = useState([]);
  const [catActiva, setCatActiva]   = useState(null);
  const [productos, setProductos]   = useState([]);
  const [clientes, setClientes]     = useState([]);
  const [carrito, setCarrito]       = useState([]);
  // MODIFICADORES (BLOQUE 11). El catálogo se cachea offline: la caja tiene que
  // poder ofrecer y cobrar los extras sin internet, igual que el impuesto (§29).
  const [catalogoMods, setCatalogoMods] = useState({ groups: [], product_groups: [] });
  const [modsModal, setModsModal] = useState(null); // { producto, previa, uid }
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
  // PROPINA (BLOQUE 9). Vive aparte del total: `totalFinal` es lo que vendió el
  // negocio y la propina es dinero del cliente para el empleado.
  const [propina, setPropina]             = useState(0);
  const [propinaTexto, setPropinaTexto]   = useState('');
  const [propinaMetodo, setPropinaMetodo] = useState(null);
  // PAGO DIVIDIDO (BLOQUE 10). Los pagos REPARTEN el total, no lo aumentan:
  // mientras la suma no cuadre con la cuenta, el botón de cobrar queda bloqueado.
  // La propina de cada pago va aparte de su monto, así que NO cuenta al cuadrar.
  const [pagoDividido, setPagoDividido] = useState(false);
  const [pagos, setPagos]               = useState([]);   // [{ method, amount, tip_amount }]
  const [clienteSeleccionado, setCliente] = useState(null);
  const [textoNota, setTextoNota]         = useState('');
  const [enviando, setEnviando]           = useState(false);

  // Efectivo
  const [efectivoRecibido, setEfectivoRecibido] = useState('');

  // Domicilio
  const [domNombre, setDomNombre]         = useState('');
  const [domDireccion, setDomDireccion]   = useState('');

  // Descuentos. El id viaja con la venta: es la autorización que el backend exige
  // para aceptar el monto (el canje de puntos va aparte y no requiere autorización).
  const [descuento, setDescuento]         = useState(0);
  const [descuentoId, setDescuentoId]     = useState(null);
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
      const [grouped, clts, mods] = await Promise.all([
        obtenerCatalogo(),   // online: backend + cachea; offline: caché local
        obtenerClientes(),   // online: backend + cachea; offline: caché local
        obtenerCatalogoModificadores(), // idem; nunca lanza (ver ventasOffline)
      ]);
      setCatalogoMods(mods);
      const cats = grouped.map(g => ({ id: g.id, name: g.name, emoji: g.emoji }));
      const all  = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, category_id: g.id })));
      setCategories([{ id: null, name: 'Todos', emoji: 'svg:search' }, ...cats]);
      setProductos(all);
      setClientes(clts);
      // Aprovechar que estamos autenticados para subir ventas pendientes de sesiones previas.
      sincronizarVentasPendientes().then(() => refrescarPendientes?.()).catch(() => {});
    } catch (e) {
      console.warn('[NuevaVenta] load error:', e);
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
        sse = createSSE(() => api.getInventoryEventsConfig(), () => {
          api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
        });
      }
    });
    return () => { try { sse?.close(); } catch {} };
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
    // MODIFICADORES (BLOQUE 11). Si el producto ofrece extras se preguntan
    // primero; si no, se agrega directo y el flujo queda EXACTAMENTE como antes
    // del bloque — un negocio sin extras no ve un paso de más.
    if (productoTieneModificadores(catalogoMods, producto.id)) {
      setModsModal({ producto, previa: [], uid: null });
      return;
    }
    _empujarAlCarrito(producto, []);
  }

  function _empujarAlCarrito(producto, modificadores) {
    const uid = `${producto.id}_${Date.now()}_${Math.random()}`;
    setCarrito(prev => [...prev, {
      uid,
      product_id: producto.id,
      nombre: producto.name,
      emoji: producto.emoji || 'svg:shopping-bag',
      // `precio` es lo que se cobra por este renglón (base + extras): todo lo
      // que ya leía este campo —impuesto, descuentos, pagos, total— sigue
      // funcionando sin enterarse de que hay modificadores.
      precio: precioConModificadores(producto.price, modificadores),
      precio_base: parseFloat(producto.price),
      modificadores,
      nota: '',
    }]);
  }

  /** Reabre el selector para cambiar los extras de un renglón ya en el carrito. */
  function editarModificadores(item) {
    const producto = productos.find(p => p.id === item.product_id);
    if (!producto) return;
    setModsModal({ producto, previa: item.modificadores || [], uid: item.uid });
  }

  function confirmarModificadores(seleccion) {
    const { producto, uid } = modsModal;
    if (uid) {
      // Edición de un renglón existente.
      setCarrito(prev => prev.map(i => i.uid === uid ? {
        ...i,
        modificadores: seleccion,
        precio_base: parseFloat(producto.price),
        precio: precioConModificadores(producto.price, seleccion),
      } : i));
    } else {
      _empujarAlCarrito(producto, seleccion);
    }
    setModsModal(null);
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

  // El descuento en pesos que generan los puntos (capped al total después del descuento regular).
  // Requiere `online`: si se cae la red con los puntos ya activados, el canje deja de
  // aplicarse al total — así nunca se cobra de menos algo que el backend no registrará.
  const descuentoPuntos = (puntosUsados && online)
    ? Math.min(valorPuntosDisp, Math.max(0, subtotal - descuento))
    : 0;

  // Impuesto (BLOQUE 8). El descuento y el canje de puntos bajan la BASE
  // GRAVABLE: se descuentan primero y el impuesto se calcula sobre lo que
  // realmente se cobra. Con tasa 0 (el default) el total es el de siempre.
  const impCfg = configImpuesto(settings);
  const baseGravable = Math.max(0, subtotal - descuento - descuentoPuntos);
  const desglose = desglosarImpuesto(baseGravable, impCfg);
  const totalFinal = desglose.total;

  // PROPINA (BLOQUE 9). Queda FUERA de la base gravable y de `totalFinal`: no es
  // una venta y no paga impuesto. Lo que el cliente entrega es `totalAEntregar`,
  // que solo se usa para pedir el dinero y calcular el cambio.
  const propCfg = configPropina(settings);
  // Con la cuenta dividida, la propina de la venta es la SUMA de las de cada
  // pago (cada comensal deja la suya). Sin dividir, la del BLOQUE 9 tal cual.
  const propinaDePagos = pagos.reduce((a, x) => a + (parseFloat(x.tip_amount) || 0), 0);
  const propinaEfectiva = hayPropinas(propCfg)
    ? (pagoDividido ? parseFloat(propinaDePagos.toFixed(2)) : propina)
    : 0;
  const totalAEntregar = totalConPropina(totalFinal, propinaEfectiva);

  // PAGO DIVIDIDO (BLOQUE 10): lo que falta por cubrir y si ya cuadra.
  const faltaPorCubrir = faltantePago(pagos, totalFinal);
  const divisionCuadra = pagos.length > 0 && pagosCuadran(pagos, totalFinal);

  // Puntos que ganaría con esta compra (solo si no está usando puntos)
  const puntosAGanar = (!puntosUsados && loyaltyEnabled && clienteEnFidelidad)
    ? Math.floor(totalFinal * ratePorPeso) + bonoPorPedido
    : 0;

  // Efectivo
  const recibido = parseFloat(efectivoRecibido.replace(/[^\d.]/g, '')) || 0;
  // El cambio y la validación del efectivo van sobre lo que el cliente ENTREGA
  // (venta + propina), no sobre la venta sola: la propina también la paga él.
  const cambio   = recibido - totalAEntregar;

  // Con pago dividido manda el cuadre (el backend rechaza un reparto que no
  // sume el total); sin él, la regla de siempre.
  const puedeConfirmar = pagoDividido
    ? divisionCuadra
    : (metodoPago !== 'efectivo' || recibido >= totalAEntregar);

  // ── Acciones del pago dividido ────────────────────────────────────────────
  function alternarPagoDividido() {
    if (pagoDividido) {
      setPagoDividido(false);
      setPagos([]);
      return;
    }
    // Se arranca en dos partes porque dividir en una sola no es dividir.
    dividirCuentaEnPartes(2);
    setPagoDividido(true);
  }

  function dividirCuentaEnPartes(n) {
    const montos = dividirEnPartes(totalFinal, n);
    // La primera parte hereda el método ya elegido; el resto arranca en efectivo
    // para que el cajero solo cambie lo que de verdad cambió.
    setPagos(montos.map((monto, i) => ({
      method: i === 0 ? metodoPago : 'efectivo',
      amount: monto,
      texto: monto.toFixed(2),
      tip_amount: 0,
      tipTexto: '',
    })));
  }

  function agregarPago() {
    if (pagos.length >= PAGO_MAX) {
      Alert.alert('Demasiados pagos', `Una venta admite como máximo ${PAGO_MAX} pagos.`);
      return;
    }
    // El pago nuevo arranca con lo que falte: es lo que el cajero va a teclear.
    const falta = faltantePago(pagos, totalFinal);
    const monto = falta > 0 ? falta : 0;
    setPagos([...pagos, {
      method: 'efectivo', amount: monto, texto: monto ? monto.toFixed(2) : '', tip_amount: 0, tipTexto: '',
    }]);
  }

  function quitarPago(indice) {
    const restantes = pagos.filter((_, i) => i !== indice);
    if (restantes.length === 0) { setPagoDividido(false); setPagos([]); return; }
    setPagos(restantes);
  }

  function cambiarPago(indice, campo, valor) {
    setPagos(pagos.map((pago, i) => {
      if (i !== indice) return pago;
      if (campo === 'method') return { ...pago, method: metodoDePago(valor) };
      const limpio = String(valor || '').replace(/[^\d.]/g, '');
      const num = parseFloat(limpio) || 0;
      return campo === 'amount'
        ? { ...pago, amount: num, texto: limpio }
        : { ...pago, tip_amount: num, tipTexto: limpio };
    }));
  }

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
    setDescuentoId(d.id);
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
    setDescuentoId(null);
    setDescuentoNombre('');
  }

  // ── Puntos de fidelidad ───────────────────────────────────────────────────

  function togglePuntos() {
    setPuntosUsados(prev => !prev);
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  async function cobrar() {
    if (carrito.length === 0) return;
    // Sin sucursal la venta quedaría huérfana: el backend la rechaza y, si se
    // registró sin internet, se quedaría atorada en la cola. Ver CLAUDE.md §24.
    if (!puedeRegistrarEnSucursal()) {
      Alert.alert(
        'Falta elegir la sucursal',
        'Este equipo todavía no tiene una sucursal asignada, y tu negocio tiene varias. ' +
        'Ve a Ajustes → Sucursal y elige en cuál registra este equipo.'
      );
      return;
    }
    if (pagoDividido) {
      // Se valida aquí para que el cajero vea el problema en la pantalla y no
      // como un 400 del backend (que además nunca llegaría estando offline).
      const v = validarPagos(pagos, totalFinal);
      if (!v.ok) { Alert.alert('La división no cuadra', v.error); return; }
    }
    if (!pagoDividido && metodoPago === 'efectivo' && recibido < totalAEntregar) {
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
        // unit_price = precio que el cliente REALMENTE pagó. El backend solo lo
        // respeta en ventas diferidas (las que suben con sold_at desde la cola
        // offline); en una venta online sigue mandando el precio del catálogo.
        // Sin esto, una venta guardada sin internet se recalculaba con el precio
        // vigente al momento de subirla.
        // ⚠️ `unit_price` es el precio BASE, sin extras: el backend suma los
        // modificadores por su cuenta a partir del option_id (BLOQUE 11), y
        // compara ESE precio contra el catálogo al auditar ventas diferidas.
        items: carrito.map(i => ({
          product_id: i.product_id,
          quantity: 1,
          unit_price: i.precio_base != null ? i.precio_base : i.precio,
          base_unit_price: i.precio_base != null ? i.precio_base : i.precio,
          modifiers: i.modificadores && i.modificadores.length ? i.modificadores : undefined,
          notes: i.nota || undefined,
        })),
        // PAGOS DIVIDIDOS (BLOQUE 10). Con varios métodos el pedido se guarda
        // como 'multiple' y el reparto real viaja en `payments`; con uno solo se
        // guarda ese método y no se crea ninguna fila (venta de siempre).
        // La cola offline guarda este mismo cuerpo, así que el reparto viaja
        // solo cuando la venta se sube más tarde.
        payment_method: pagoDividido ? metodoResumenPagos(pagos) : metodoPago,
        ...(pagoDividido ? {
          payments: pagos.map(pago => ({
            method: pago.method,
            amount: pago.amount,
            tip_amount: pago.tip_amount || 0,
          })),
        } : {}),
        order_type: tipoPedido,
        customer_id: clienteSeleccionado?.id || null,
        delivery_address: tipoPedido === 'domicilio' ? (domDireccion || null) : null,
        customer_temp_info: tipoPedido === 'domicilio' && domNombre
          ? JSON.stringify({ name: domNombre })
          : null,
        branch_id: sucursalId || null,
        // Descuento de promoción + su autorización (discount_id). Va SEPARADO del
        // canje de puntos: el backend exige autorización para el primero, no para
        // el segundo (el cliente gasta puntos que ya ganó).
        discount_amount: descuento || 0,
        discount_id: descuentoId || null,
        // Impuesto CONGELADO de la venta (BLOQUE 8): la tasa con la que se cobró
        // este ticket. El backend solo la respeta si la venta llega diferida
        // (desde la cola offline) y SIEMPRE recalcula el monto — nunca se le cree
        // el importe al cliente.
        tax_rate: impCfg.tasa || 0,
        tax_included: !!impCfg.incluido,
        // Propina (BLOQUE 9). Va APARTE del total: `total` es lo que vendió el
        // negocio. El backend la descarta si las propinas están apagadas, y una
        // propina inválida nunca tumba la venta (cae a 0 y se registra igual).
        tip_amount: propinaEfectiva,
        tip_method: propinaEfectiva > 0 ? normalizarMetodoPropina(propinaMetodo, metodoPago) : null,
      };

      // Puntos de fidelidad: se procesan en la transacción del backend, así que
      // SOLO se aplican estando online. Offline la venta se registra sin puntos
      // (evita saldos inconsistentes; ver PLAN_OFFLINE_MOBILE §7).
      if (online && clienteSeleccionado?.id && clienteEnFidelidad && loyaltyEnabled) {
        if (puntosUsados && puntosDisponibles > 0) {
          orderBody.loyalty_points_used = puntosDisponibles;
          // Monto en pesos del canje. El backend lo topa a puntos × puntos_valor,
          // así que no puede usarse para regalar dinero sin gastar puntos.
          orderBody.loyalty_discount_amount = descuentoPuntos || 0;
        } else if (puntosAGanar > 0) {
          orderBody.loyalty_points_earned = puntosAGanar;
        }
      }

      // Online: intento directo (feedback inmediato). Offline o si se cae la red:
      // se encola localmente y se sube al reconectar (nunca se pierde la venta).
      // meta = datos para mostrar la venta en Pedidos sin depender del backend.
      const res = await registrarVenta(orderBody, online, {
        total: totalFinal,
        // Para poder imprimir el ticket también sin conexión (BLOQUE 11).
        impuesto: desglose.impuesto,
        resumen: {
          payment_method: metodoPago,
          items: carrito.map(i => ({
            name: i.nombre,
            quantity: 1,
            modificadores: resumenModificadores(i.modificadores),
          })),
        },
      });
      refrescarPendientes?.();

      // TICKET (BLOQUE 11, deuda §12.7). Hasta ahora el celular podía emparejar
      // una impresora y hacer una prueba, pero al cobrar NO salía ticket.
      // ⚠️ Sin await y sin try/catch a propósito: la venta ya está registrada y
      // un fallo de impresora NUNCA debe tumbarla (mismo criterio del §26).
      // `imprimirTicketPedido` no lanza; si no hay impresora, no hace nada.
      if (res.pedido) {
        imprimirTicketPedido(res.pedido, settings, { cashier: nombreActivo });
      }

      // Limpiar todo
      setCarrito([]);
      limpiarCliente();
      setShowCarrito(false);
      setCobrandoModal(false);
      setDescuento(0);
      setDescuentoNombre('');
      setPuntosUsados(false);
      // Ni la propina ni la división se heredan a la siguiente venta: un reparto
      // viejo cobraría mal la venta nueva.
      setPropina(0);
      setPropinaTexto('');
      setPropinaMetodo(null);
      setPagoDividido(false);
      setPagos([]);
      setEfectivoRecibido('');
      setDomNombre('');
      setDomDireccion('');

      // Refrescar stock inmediatamente (sin esperar SSE) — solo aplica online
      if (mostrarStock) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      }

      Alert.alert(
        'Venta registrada',
        `Total: ${formatMoney(totalFinal, currency)}` +
          (res.modo === 'offline' ? '\n\nSin conexión: se subirá automáticamente al reconectar.' : '')
      );
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
        <LogoTitle title="Nueva Venta" titleStyle={styles.title} />
        <OfflineIndicator />
        {carrito.length > 0 && (
          <TouchableOpacity style={styles.carritoBtn} onPress={openCartPanel}>
            <Ionicons name="cart" size={16} color="#fff" />
            <Text style={styles.carritoBtnText}> {totalItems}  ·  {formatMoney(totalFinal, currency)}</Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconoProducto valor={c.emoji} size={16} color={catActiva === c.id ? '#fff' : colors.textSecondary} />
              <Text style={[styles.catChipText, catActiva === c.id && styles.catChipTextActive]}>
                {c.name}
              </Text>
            </View>
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
                <CartItem key={item.uid} item={item} onDelete={eliminarDelCarrito} onEditNota={abrirNota} onEditMods={editarModificadores} currency={currency} />
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
                {/* Con impuesto AGREGADO el total a cobrar no es la suma de los
                    productos: se muestra el desglose para que el cajero cobre lo
                    mismo que dirá el ticket. */}
                {desglose.impuesto > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                    <Text style={styles.totalDesgloseLabel}>{etiquetaImpuesto(impCfg)}</Text>
                    <Text style={styles.totalDesgloseValor}>{formatMoney(desglose.impuesto, currency)}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                  <Text style={styles.totalLabel}>{tipoActivo?.label}  ·  {totalItems} {totalItems === 1 ? 'producto' : 'productos'}</Text>
                  <Text style={styles.totalValue}>{formatMoney(totalFinal, currency)}</Text>
                </View>
                <TouchableOpacity style={styles.btnCobrar} onPress={() => closeCartPanel(() => { setCobrandoModal(true); refreshSettings(); })}>
                  <Text style={styles.btnCobrarText}>Cobrar</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      )}

      {/* ── Modal de modificadores (BLOQUE 11) ── */}
      <ModalModificadores
        visible={modsModal !== null}
        producto={modsModal?.producto}
        catalogo={catalogoMods}
        seleccionPrevia={modsModal?.previa}
        currency={currency}
        onCancel={() => setModsModal(null)}
        onConfirm={confirmarModificadores}
      />

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
              {descuento > 0 || descuentoPuntos > 0 || desglose.impuesto > 0 ? (
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
                        Puntos canjeados
                      </Text>
                      <Text style={[styles.totalDesgloseValor, { color: '#7c3aed' }]}>
                        -{formatMoney(descuentoPuntos, currency)}
                      </Text>
                    </View>
                  )}
                  {/* El impuesto va DESPUÉS del descuento: se descuenta primero y
                      el impuesto se calcula sobre lo que realmente se cobra. */}
                  {desglose.impuesto > 0 && (
                    <View style={styles.totalDesgloseRow}>
                      <Text style={styles.totalDesgloseLabel}>{etiquetaImpuesto(impCfg)}</Text>
                      <Text style={styles.totalDesgloseValor}>
                        {formatMoney(desglose.impuesto, currency)}
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

              {/* PAGO DIVIDIDO (BLOQUE 10). Va justo debajo de los métodos porque
                  es una alternativa a elegir UNO: o se paga con un método, o se
                  reparte. Arranca cerrado: la venta normal no cambia. */}
              <TouchableOpacity style={styles.dividirBtn} onPress={alternarPagoDividido}>
                <Ionicons
                  name={pagoDividido ? 'close-circle-outline' : 'git-branch-outline'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.dividirBtnText}>
                  {pagoDividido ? 'Cancelar el pago dividido' : 'Dividir el pago entre varios métodos'}
                </Text>
              </TouchableOpacity>

              {pagoDividido && (
                <View style={styles.pagosBox}>
                  <View style={styles.pagosHeader}>
                    <Text style={styles.pagosTitulo}>Pago dividido</Text>
                    <Text style={[
                      styles.pagosFaltante,
                      divisionCuadra
                        ? { color: colors.success }
                        : (faltaPorCubrir < 0 ? { color: colors.danger } : null),
                    ]}>
                      {divisionCuadra
                        ? 'Cuadra ✓'
                        : (faltaPorCubrir > 0
                            ? `Falta ${formatMoney(faltaPorCubrir, currency)}`
                            : `Sobra ${formatMoney(Math.abs(faltaPorCubrir), currency)}`)}
                    </Text>
                  </View>

                  {/* Atajo: partes iguales. Es lo que más se pide. */}
                  <View style={styles.pagosPartesRow}>
                    <Text style={styles.pagosPartesLabel}>Partes iguales:</Text>
                    {[2, 3, 4].map(n => (
                      <TouchableOpacity key={n} style={styles.pagosParteBtn} onPress={() => dividirCuentaEnPartes(n)}>
                        <Text style={styles.pagosParteBtnText}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {pagos.map((pago, i) => (
                    <View key={i} style={styles.pagoRow}>
                      <View style={styles.pagoMetodos}>
                        {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.pagoMetodoChip, pago.method === m && styles.pagoMetodoChipActive]}
                            onPress={() => cambiarPago(i, 'method', m)}
                          >
                            <Text style={[styles.pagoMetodoChipText, pago.method === m && { color: '#fff' }]}>
                              {m === 'transferencia' ? 'Transf.' : (m === 'efectivo' ? 'Efectivo' : 'Tarjeta')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.pagoInputs}>
                        <TextInput
                          style={styles.pagoInput}
                          value={pago.texto}
                          onChangeText={t => cambiarPago(i, 'amount', t)}
                          placeholder="Monto"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                        />
                        {hayPropinas(propCfg) && (
                          <TextInput
                            style={[styles.pagoInput, styles.pagoInputPropina]}
                            value={pago.tipTexto}
                            onChangeText={t => cambiarPago(i, 'tip_amount', t)}
                            placeholder="Propina"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                          />
                        )}
                        <TouchableOpacity style={styles.pagoQuitar} onPress={() => quitarPago(i)}>
                          <Ionicons name="close" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.pagoAgregar} onPress={agregarPago}>
                    <Text style={styles.pagoAgregarText}>+ Agregar otro pago</Text>
                  </TouchableOpacity>

                  <View style={styles.pagosTotalRow}>
                    <Text style={styles.pagosTotalLabel}>Cuenta</Text>
                    <Text style={styles.pagosTotalValor}>{formatMoney(totalFinal, currency)}</Text>
                  </View>
                </View>
              )}

              {/* PROPINA (BLOQUE 9). Va DESPUÉS del método de pago porque el
                  porcentaje se calcula sobre el total y porque la propina puede
                  cobrarse por otro método (cuenta con tarjeta, propina en
                  efectivo). Toda la sección desaparece si están apagadas. */}
              {hayPropinas(propCfg) && (
                <View style={styles.propinaBox}>
                  <View style={styles.propinaHeader}>
                    <Text style={styles.sectionLabel}>Propina</Text>
                    <Text style={styles.propinaMonto}>{formatMoney(propinaEfectiva, currency)}</Text>
                  </View>
                  <View style={styles.propinaBotones}>
                    {(propCfg.sugerencias || []).map(pct => {
                      const monto  = propinaPorPorcentaje(totalFinal, pct);
                      const activo = propinaEfectiva > 0 && Math.abs(propinaEfectiva - monto) < 0.005;
                      return (
                        <TouchableOpacity
                          key={pct}
                          style={[styles.propinaBtn, activo && styles.propinaBtnActive]}
                          onPress={() => { setPropina(monto); setPropinaTexto(monto > 0 ? monto.toFixed(2) : ''); }}
                        >
                          <Text style={[styles.propinaBtnPct, activo && { color: '#fff' }]}>{pct}%</Text>
                          <Text style={[styles.propinaBtnMonto, activo && { color: '#fff' }]}>
                            {formatMoney(monto, currency)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.propinaBtn, propinaEfectiva <= 0 && styles.propinaBtnNinguna]}
                      onPress={() => { setPropina(0); setPropinaTexto(''); setPropinaMetodo(null); }}
                    >
                      <Text style={[styles.propinaBtnPct, propinaEfectiva <= 0 && { color: '#fff' }]}>Sin</Text>
                      <Text style={[styles.propinaBtnMonto, propinaEfectiva <= 0 && { color: '#fff' }]}>propina</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.propinaInput}
                    value={propinaTexto}
                    onChangeText={(t) => {
                      const limpio = t.replace(/[^\d.]/g, '');
                      setPropinaTexto(limpio);
                      setPropina(normalizarPropina(limpio));
                    }}
                    placeholder="Otro monto"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  {/* El método de la propina solo importa si hay propina, y solo
                      se ofrece cambiar cuando difiere del pago (el caso típico:
                      cuenta con tarjeta, propina en efectivo). */}
                  {propinaEfectiva > 0 && (
                    <View style={styles.propinaMetodoRow}>
                      {['efectivo', 'tarjeta', 'transferencia'].map(m => {
                        const activo = normalizarMetodoPropina(propinaMetodo, metodoPago) === m;
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.propinaMetodoBtn, activo && styles.propinaMetodoBtnActive]}
                            onPress={() => setPropinaMetodo(m)}
                          >
                            <Text style={[styles.propinaMetodoText, activo && { color: '#fff' }]}>
                              en {m === 'transferencia' ? 'transf.' : m}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {/* Lo que el cliente ENTREGA. La venta del negocio sigue siendo
                      el total de arriba: este número no se guarda como venta. */}
                  {propinaEfectiva > 0 && (
                    <View style={styles.propinaEntregaRow}>
                      <Text style={styles.propinaEntregaLabel}>El cliente entrega</Text>
                      <Text style={styles.propinaEntregaValor}>{formatMoney(totalAEntregar, currency)}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Calculadora de cambio (solo efectivo, y solo sin dividir: con
                  la cuenta repartida el efectivo es apenas una parte). */}
              {metodoPago === 'efectivo' && !pagoDividido && (
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

              {/* Puntos de fidelidad — solo online: el canje se procesa en la
                  transacción del backend (ver PLAN_OFFLINE_MOBILE §7). Sin este
                  gate, offline se podía descontar del total un canje que nunca
                  llegaba al backend y la venta quedaba descuadrada. */}
              {online && loyaltyEnabled && clienteEnFidelidad && (
                <View style={styles.puntosBox}>
                  <View style={styles.puntosHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.puntosBalance}>
                        {puntosDisponibles} puntos disponibles
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
  // Los extras van en ámbar: cambian el precio y lo que se prepara (BLOQUE 11).
  cartMods:       { fontSize: font.sm - 1, color: '#b45309', fontWeight: '600', marginTop: 1 },
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

  // Propina (BLOQUE 9) — en verde para distinguirla del dinero de la venta:
  // no es ingreso del negocio, es del empleado.
  // ── Pago dividido (BLOQUE 10) ─────────────────────────────────────────────
  dividirBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  dividirBtnText:    { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosBox:          { backgroundColor: colors.primary + '10', borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + '55', padding: spacing.md, marginTop: spacing.sm },
  pagosHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  pagosTitulo:       { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosFaltante:     { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  pagosPartesRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  pagosPartesLabel:  { fontSize: font.xs, color: colors.textSecondary },
  pagosParteBtn:     { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary + '55', backgroundColor: colors.surface },
  pagosParteBtnText: { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagoRow:           { marginBottom: spacing.sm, gap: 4 },
  pagoMetodos:       { flexDirection: 'row', gap: 4 },
  pagoMetodoChip:    { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pagoMetodoChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pagoMetodoChipText:{ fontSize: font.xs, fontWeight: '600', color: colors.textSecondary },
  pagoInputs:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pagoInput:         { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: font.sm, textAlign: 'right' },
  pagoInputPropina:  { borderColor: colors.success + '77', backgroundColor: colors.success + '10' },
  pagoQuitar:        { padding: 8, borderRadius: radius.sm, backgroundColor: colors.danger + '20' },
  pagoAgregar:       { paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary + '77', backgroundColor: colors.surface },
  pagoAgregarText:   { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.primary + '33' },
  pagosTotalLabel:   { fontSize: font.xs, color: colors.primary },
  pagosTotalValor:   { fontSize: font.xs, fontWeight: '700', color: colors.primary },

  propinaBox:        { backgroundColor: colors.success + '10', borderRadius: radius.md, borderWidth: 1, borderColor: colors.success + '55', padding: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm },
  propinaHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  propinaMonto:      { fontSize: font.lg, fontWeight: '800', color: colors.success },
  propinaBotones:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  propinaBtn:        { flex: 1, minWidth: 64, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  propinaBtnActive:  { borderColor: colors.success, backgroundColor: colors.success },
  propinaBtnNinguna: { borderColor: colors.textSecondary, backgroundColor: colors.textSecondary },
  propinaBtnPct:     { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  propinaBtnMonto:   { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  propinaInput:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.background },
  propinaMetodoRow:  { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  propinaMetodoBtn:  { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  propinaMetodoBtnActive: { borderColor: colors.success, backgroundColor: colors.success },
  propinaMetodoText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  propinaEntregaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.success + '55' },
  propinaEntregaLabel: { fontSize: font.sm, fontWeight: '700', color: colors.success },
  propinaEntregaValor: { fontSize: font.lg, fontWeight: '800', color: colors.success },

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
