import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Pressable,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import IconoProducto from '../../components/IconoProducto';
import SvgIcon from '../../components/SvgIcon';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../api/client';
import {
  verificarPinPuesto, pinBloqueado, minutosBloqueoPin,
  registrarFalloPin, resetFallosPin,
} from '../../offline/credenciales';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { obtenerCatalogo, obtenerClientes, obtenerCatalogoModificadores, obtenerPromos, registrarVenta, sincronizarVentasPendientes } from '../../offline/ventasOffline';
import ModalModificadores from '../../components/ModalModificadores';
import HojaPromo from '../../components/HojaPromo';
import { generarUuid } from '../../utils/uuid';
import { esAvisoStock, textoAvisoStock } from '../../utils/avisoStock';
import {
  promoDeCatalogo, promosActivasAhora, armarRenglonPromo, renglonParaVenta, nombresAplanados,
  baseDescuentoDe, ofertasAcumulablesDe, montoDescuento, descuentoVigenteLocal,
  sugerirPromo, convertirEnPromo, textoHuecos, textoCobro,
} from '../../utils/promos';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';
import { precioConModificadores, resumenModificadores, productoTieneModificadores } from '../../utils/modificadores';
import { colors, spacing, radius, font, zc, tonos, radios, sombra } from '../../theme';
import { Cabecera, Icono, BarraDeCobrar } from '../../components/ui';
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
      stockEl = <Text style={styles.stockAgotado}>Sin stock</Text>;
    } else if (stock <= 3) {
      stockEl = <View style={styles.stockPocoFila}><SvgIcon name="triangle-alert" size={11} color={zc.ambar} /><Text style={styles.stockPoco}>{stock} disponibles</Text></View>;
    } else {
      stockEl = <Text style={styles.stockHay}>{stock} disponibles</Text>;
    }
  }
  return (
    <TouchableOpacity style={[styles.productCard, mostrarStock && stock === 0 && { opacity: 0.5 }]} onPress={() => onPress(product)}>
      <View style={[styles.productFoto, product.image && styles.productFotoBlanca]}>
        <IconoProducto valor={product.emoji || 'svg:shopping-bag'} imagen={product.image} size={48} color={zc.gris} />
      </View>
      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.productPrice}>{formatMoney(parseFloat(product.price), currency)}</Text>
      {stockEl}
    </TouchableOpacity>
  );
}

// ─── Fila del carrito ─────────────────────────────────────────────────────────

function CartItem({ item, imagen, onDelete, onEditNota, onEditMods, currency }) {
  return (
    <View style={styles.cartItem}>
      <IconoProducto valor={item.emoji || 'svg:shopping-bag'} imagen={imagen} size={36} color={zc.gris} />
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
            <Icono nombre="document-text-outline" size={12} color={colors.textMuted} />
            <Text style={[styles.cartNota, { marginLeft: 2 }]} numberOfLines={1}>{item.nota}</Text>
          </View>
        ) : null}
        <Text style={styles.cartPrice}>{formatMoney(item.precio, currency)}</Text>
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={() => onEditNota(item)}>
        <Icono
          nombre={item.nota ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
          size={20}
          color={item.nota ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(item.uid)}>
        <Icono nombre="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Renglón de PROMO en el carrito (PLAN_OFERTAS_V1) ─────────────────────────
// UN renglón con sus productos debajo. Borrarlo quita la promo entera: nunca
// queda "medio 2x1" cobrado a precio de promo.
function PromoCartItem({ item, onDelete, currency }) {
  return (
    <View style={[styles.cartItem, styles.cartPromo]}>
      <Icono nombre="gift-outline" size={20} color={tonos.lila.icono} />
      <View style={{ flex: 1, marginLeft: spacing.xs }}>
        <Text style={styles.cartName} numberOfLines={1}>{item.nombre}</Text>
        {item.productos.map((p, i) => (
          <Text key={i} style={styles.cartPromoProd} numberOfLines={1}>
            · {p.nombre}{resumenModificadores(p.modificadores) ? ` (${resumenModificadores(p.modificadores)})` : ''}
          </Text>
        ))}
        {item.ahorro > 0 ? (
          <Text style={styles.cartPromoAhorro}>Ahorra {formatMoney(item.ahorro, currency)}</Text>
        ) : null}
        <Text style={styles.cartPrice}>{formatMoney(item.precio, currency)}</Text>
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(item.uid)}>
        <Icono nombre="trash-outline" size={20} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function NuevaVentaScreen() {
  const { settings, user, isPremium, refreshSettings, sucursalId, puedeRegistrarEnSucursal, nombreActivo, rolActivo, permisosRolesEfectivos, modoLocal } = useAuth();
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
  // PROMOS (PLAN_OFERTAS_V1, Bloque 3). Se cachean como los extras: la caja las
  // vende sin internet y su calendario se evalúa con el reloj del teléfono.
  const [promos, setPromos]       = useState([]);
  const [hojaPromo, setHojaPromo] = useState(null); // la promo que se está eligiendo
  // Un tic por minuto: a la hora en que la promo termina, su botón se va solo.
  const [, setRelojPromos]        = useState(0);
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
  // Se guarda el DESCUENTO elegido, no su monto: el monto se recalcula en vivo
  // sobre la base de la cuenta (ver `baseDesc` abajo). Guardar un número fijo
  // dejaba el 10% de un carrito que después cambió, y con las promos la base
  // tiene que ser la MISMA del servidor o el cobro se rechaza.
  const [descuentoDef, setDescuentoDef]   = useState(null);
  const descuentoId = descuentoDef ? descuentoDef.id : null;
  const descuentoNombre = descuentoDef ? descuentoDef.name : '';
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
  const insets        = useSafeAreaInsets();
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
      const [grouped, clts, mods, combos] = await Promise.all([
        obtenerCatalogo(),   // online: backend + cachea; offline: caché local
        obtenerClientes(),   // online: backend + cachea; offline: caché local
        obtenerCatalogoModificadores(), // idem; nunca lanza (ver ventasOffline)
        obtenerPromos(),     // idem; nunca lanza, y en modo local no hay ninguna
      ]);
      setCatalogoMods(mods);
      setPromos((combos || []).map(promoDeCatalogo).filter(Boolean));
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

  // Las promos se vuelven a leer cada vez que se ENTRA a la venta: una promo que
  // el dueño acaba de crear en Ofertas tiene que salir sin reiniciar la app
  // (encontrado en el emulador: solo se leían al abrir la app). Sin red salen de
  // la caché, y obtenerPromos nunca lanza.
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      obtenerPromos()
        .then((combos) => { if (vivo) setPromos((combos || []).map(promoDeCatalogo).filter(Boolean)); })
        .catch(() => {});
      return () => { vivo = false; };
    }, [])
  );

  // Un tic por minuto: la promo que termina a las 20:00 deja de ofrecerse a las
  // 20:00, no en la próxima vez que alguien recargue la pantalla.
  useEffect(() => {
    const t = setInterval(() => setRelojPromos((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let sse = null;
    // Sin cuenta no hay inventario (es de la versión con cuenta), así que no hay
    // stock que mostrar ni servidor al que abrirle una conexión en vivo. Sin este
    // guard, un equipo que tuviera activado "mostrar stock" con su cuenta anterior
    // intentaría conectarse a un servidor con el que ya no tiene sesión.
    if (modoLocal) { setMostrarStock(false); return; }
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
  }, [sucursalId, modoLocal]);

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

  /** La hoja de la promo terminó: entra al carrito como UN renglón. */
  function agregarPromoAlCarrito(elegidos) {
    const promo = hojaPromo;
    setHojaPromo(null);
    if (!promo) return;
    setCarrito(prev => [...prev, armarRenglonPromo(promo, elegidos, { grupo: generarUuid() })]);
  }

  /** "¿Convertir a 2x1?" — solo se convierte cuando la cajera lo toca. */
  function aplicarSugerencia() {
    const s = sugerirPromo(carrito, promosActivas, productos);
    if (!s) return;
    setCarrito(prev => convertirEnPromo(prev, s, { grupo: generarUuid() }));
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

  // JUNTAR OFERTAS (PLAN_OFERTAS_V1 §3.4). Con el interruptor APAGADO —el de
  // fábrica— el descuento de la cuenta no toca lo que ya está en promo. Es la
  // MISMA base del servidor: con otra, cada venta con descuento se rechazaría.
  const ofertasAcumulables = ofertasAcumulablesDe(settings);
  const baseDesc  = baseDescuentoDe(carrito, ofertasAcumulables);
  const descuento = descuentoDef ? montoDescuento(descuentoDef, baseDesc) : 0;
  const hayPromoEnCarrito = carrito.some((i) => i.tipo === 'promo');

  // Las promos que se pueden vender AHORA (activas, en su calendario, con algo
  // que elegir). Sin Premium o sin cuenta, ninguna.
  const promosActivas = promosActivasAhora(promos, productos, { premium: isPremium && !modoLocal });
  const sugerencia = sugerirPromo(carrito, promosActivas, productos);

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
      // Solo los que valen AHORA: activos, en sus fechas y en su calendario
      // ("10% los lunes"), que el servidor evalúa en la zona del negocio. El
      // filtro local repite el del calendario por si la lista llega de caché.
      const data = await api.getActiveDiscounts();
      setDescuentos((data || []).filter(d => d.active && descuentoVigenteLocal(d)));
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
    // El monto NO se congela aquí: se recalcula en vivo sobre la base de la
    // cuenta (`descuento`, arriba), que sin "juntar ofertas" deja fuera las promos.
    setDescuentoDef(d);
    setShowDescuentoModal(false);
  }

  async function confirmarDescuentoConPin() {
    if (!pinDescValue) { setPinDescError('Ingresa tu PIN'); return; }
    if (pinBloqueado()) {
      setPinDescError(`Demasiados intentos. Espera ${minutosBloqueoPin()} min.`);
      return;
    }
    setPinDescLoading(true);
    setPinDescError('');
    try {
      const perfilActual = permisosRolesEfectivos?.[rolActivo];
      if (perfilActual?.pin_set) {
        const result = await verificarPinPuesto(rolActivo, pinDescValue, permisosRolesEfectivos);
        if (!result.valido) {
          registrarFalloPin();
          setPinDescError(pinBloqueado() ? `Demasiados intentos. Espera 5 min.` : 'PIN incorrecto');
          setPinDescLoading(false);
          return;
        }
        resetFallosPin();
      }
      // PIN válido: aplicar descuento y registrar en auditoría
      const d = descPendiente;
      _aplicarDescuentoFinal(d);
      setPinDescModal(false);
      setDescPendiente(null);
      const monto = montoDescuento(d, baseDesc);
      api.request('/audit', {
        method: 'POST',
        body: {
          employee_name: nombreActivo || '',
          action_type: 'apply_discount',
          target_description: `Descuento: "${d.name}"`,
          after_data: { discount_name: d.name, amount: monto },
        }
      }).catch(() => {});
    } catch (e) {
      setPinDescError(e.message || 'Error al verificar PIN');
    } finally {
      setPinDescLoading(false);
    }
  }

  function quitarDescuento() {
    setDescuentoDef(null);
  }

  // ── Puntos de fidelidad ───────────────────────────────────────────────────

  function togglePuntos() {
    setPuntosUsados(prev => !prev);
  }

  // ── Cobrar ────────────────────────────────────────────────────────────────

  // `opts.sinRevisarStock`: el cajero ya vio el aviso de "faltan existencias" y
  // eligió cobrar igual. (onPress pasa el evento como primer argumento, por eso
  // se compara con true.)
  async function cobrar(opts) {
    const sinRevisarStock = opts?.sinRevisarStock === true;
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
    if (tipoPedido === 'domicilio' && !domDireccion.trim() && !sinRevisarStock) {
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
        // PROMOS (PLAN_OFERTAS_V1): una promo viaja como UN renglón con sus
        // productos dentro, más `promo_price` y el `list_price` de cada uno. Online
        // el servidor los ignora y aplica su regla; si la venta cae a la cola
        // offline, sube como DIFERIDA y con eso reparte igual que aquí.
        items: carrito.map(renglonParaVenta),
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
        ...(sinRevisarStock ? { skip_stock_check: true } : {}),
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
          // En el MISMO orden en que se aplanan los renglones (una promo = un
          // renglón por producto): así el ticket offline pone cada nombre en su lugar.
          items: nombresAplanados(carrito).map(i => ({
            name: i.name,
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
      setDescuentoDef(null);
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
      // Faltan existencias: la venta NO se guardó. Avisa y deja cobrar igual —
      // el número del inventario puede estar mal y el producto estar ahí (§56.3).
      if (esAvisoStock(e)) {
        Alert.alert(
          'Faltan existencias',
          textoAvisoStock(e.warnings) + '\n\nLa venta todavía NO se ha registrado. ¿Cobrar de todas formas?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Cobrar igual', onPress: () => cobrar({ sinRevisarStock: true }) },
          ],
        );
        return;
      }
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
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Cabecera azul noche con el buscador dentro (carcasa A) */}
      <Cabecera titulo="Nueva venta" derecha={<OfflineIndicator />}>
      <View style={[styles.searchWrap, styles.searchEnCabecera]}>
        <Icono nombre="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.textMuted}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Icono nombre="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      </Cabecera>

      {/* Búsqueda de cliente inline */}
      {clienteSeleccionado ? (
        <View style={styles.clienteChip}>
          <Icono nombre="person" size={16} color={zc.azul} />
          <Text style={styles.clienteChipText}>{clienteSeleccionado.name}</Text>
          {clienteSeleccionado.phone && (
            <Text style={styles.clienteChipSub}>{clienteSeleccionado.phone}</Text>
          )}
          <TouchableOpacity onPress={limpiarCliente} style={{ marginLeft: spacing.xs }}>
            <Icono nombre="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.clienteInputRow}>
          <View style={[styles.searchWrap, { flex: 1, marginHorizontal: 0, marginRight: spacing.xs }]}>
            <Icono nombre="person-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
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
            <Icono nombre="call-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
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
              <Icono nombre="person-outline" size={16} color={colors.textMuted} />
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
              <IconoProducto valor={c.emoji} size={16} color={catActiva === c.id ? '#fff' : zc.gris} />
              <Text style={[styles.catChipText, catActiva === c.id && styles.catChipTextActive]}>
                {c.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* PROMOS (PLAN_OFERTAS_V1). Arriba de los productos, marcadas, y SOLO
          mientras están activas: fuera de su día y su hora no existen aquí, así
          nadie cobra el 2x1 del martes un miércoles. */}
      {promosActivas.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promosRow} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {promosActivas.map(p => (
            <TouchableOpacity key={p.id} style={styles.promoChip} onPress={() => { setShowSug(false); setHojaPromo(p); }}>
              <View style={styles.promoChipFila}>
                <Icono nombre="regalo" size={15} color={tonos.lila.icono} />
                <Text style={styles.promoChipNombre} numberOfLines={1}>{p.name}</Text>
              </View>
              <Text style={styles.promoChipSub} numberOfLines={1}>
                {textoHuecos(p, productos, categories)} · {textoCobro(p, currency)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Grid de productos */}
      <FlatList
        data={productosFiltrados}
        keyExtractor={p => String(p.id)}
        numColumns={2}
        contentContainerStyle={[styles.grid, carrito.length > 0 && { paddingBottom: 96 }]}
        columnWrapperStyle={{ gap: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => <ProductCard product={item} onPress={agregarAlCarrito} currency={currency} mostrarStock={mostrarStock} stockMap={stockMap} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay productos en esta categoría</Text>}
        onScrollBeginDrag={() => setShowSug(false)}
      />

      {/* La barra oscura que flota (carcasa A). Es el botón del carrito de
          siempre, movido abajo: al tocarla se abre el ticket, igual que antes. */}
      {carrito.length > 0 && (
        <BarraDeCobrar
          style={styles.barraCobrar}
          etiqueta={`Ticket · ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}`}
          total={formatMoney(totalFinal, currency)}
          textoBoton="Ver ticket"
          onPress={openCartPanel}
        />
      )}

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
            <View style={[styles.ticketCab, { paddingTop: insets.top }]}>
              <View style={styles.dragHandleWrap}>
                <View style={[styles.dragHandle, styles.dragHandleNoche]} />
              </View>
              <View style={[styles.modalHeader, styles.ticketCabFila]}>
                <Text style={[styles.modalTitle, styles.ticketCabTitulo]}>Ticket actual</Text>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  {carrito.length > 0 && (
                    <TouchableOpacity onPress={vaciarCarrito}>
                      <Text style={styles.vaciarTxt}>Vaciar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => closeCartPanel()}>
                    <Icono nombre="close" size={24} color={zc.enNocheSuave} />
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
                    <Icono nombre={t.icon} size={18} color={tipoPedido === t.key ? '#fff' : zc.gris} />
                    <Text style={[styles.tipoBtnText, tipoPedido === t.key && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cliente */}
              {clienteSeleccionado && (
                <View style={[styles.sectionLabel, { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }]}>
                  <Icono nombre="person" size={14} color={colors.textSecondary} />
                  <Text style={[styles.sectionLabel, { marginBottom: 0, marginLeft: spacing.xs }]}>{clienteSeleccionado.name}</Text>
                </View>
              )}

              {/* Items */}
              <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
                Productos ({totalItems})
              </Text>
              {/* "¿Convertir a 2x1?" — sugiere, NUNCA convierte sola (§1 del plan). */}
              {sugerencia && (
                <View style={styles.sugerenciaPromo}>
                  <Text style={styles.sugerenciaPromoTexto}>
                    ¿Convertir a <Text style={{ fontWeight: '700' }}>{sugerencia.promo.name}</Text>? Ahorra {formatMoney(sugerencia.ahorro, currency)}
                  </Text>
                  <TouchableOpacity style={styles.sugerenciaPromoBtn} onPress={aplicarSugerencia}>
                    <Text style={styles.sugerenciaPromoBtnText}>Convertir</Text>
                  </TouchableOpacity>
                </View>
              )}
              {carrito.map(item => item.tipo === 'promo' ? (
                <PromoCartItem key={item.uid} item={item} onDelete={eliminarDelCarrito} currency={currency} />
              ) : (
                <CartItem key={item.uid} item={item} imagen={(productos.find(p => p.id === item.product_id) || {}).image} onDelete={eliminarDelCarrito} onEditNota={abrirNota} onEditMods={editarModificadores} currency={currency} />
              ))}

              {carrito.length === 0 && (
                <View style={styles.emptyCart}>
                  <Icono nombre="cart-outline" size={48} color={colors.textMuted} />
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

      {/* ── Hoja de la promo: "Elige 2 de Tacos" ── */}
      <HojaPromo
        visible={hojaPromo !== null}
        promo={hojaPromo}
        productos={productos}
        categorias={categories}
        catalogoMods={catalogoMods}
        currency={currency}
        onCancel={() => setHojaPromo(null)}
        onConfirm={agregarPromoAlCarrito}
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
                <Icono nombre="close" size={24} color={colors.textSecondary} />
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>

              {/* Cliente */}
              {clienteSeleccionado && (
                <View style={styles.resumenCliente}>
                  <Icono nombre="person" size={16} color={colors.textSecondary} />
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
                      <Text style={[styles.totalDesgloseLabel, { color: tonos.lila.icono }]}>
                        Puntos canjeados
                      </Text>
                      <Text style={[styles.totalDesgloseValor, { color: tonos.lila.icono }]}>
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
              <Text style={[styles.totalValue, styles.totalGrande]}>
                {formatMoney(totalFinal, currency)}
              </Text>
              <View style={[styles.resumenCliente, { marginBottom: spacing.xl }]}>
                <Icono nombre={tipoActivo?.icon} size={14} color={colors.textSecondary} />
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
                  <Icono nombre={m.icon} size={20} color={metodoPago === m.key ? '#fff' : zc.gris} />
                  <Text style={[styles.metodoPagoText, metodoPago === m.key && { color: '#fff' }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}

              {/* PAGO DIVIDIDO (BLOQUE 10). Va justo debajo de los métodos porque
                  es una alternativa a elegir UNO: o se paga con un método, o se
                  reparte. Arranca cerrado: la venta normal no cambia. */}
              <TouchableOpacity style={styles.dividirBtn} onPress={alternarPagoDividido}>
                <Icono
                  nombre={pagoDividido ? 'close-circle-outline' : 'git-branch-outline'}
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
                          <Icono nombre="close" size={16} color={colors.danger} />
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
                        <Icono nombre="close-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.btnAplicarDesc} onPress={abrirDescuentos}>
                      <Icono nombre="pricetag-outline" size={16} color={colors.primary} />
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
                      <Icono
                        nombre={puntosUsados ? 'checkmark-circle' : 'star-outline'}
                        size={16}
                        color={puntosUsados ? '#fff' : tonos.lila.icono}
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {/* Sin "juntar ofertas" el descuento no toca las promos (§3.4): se
                dice aquí, antes de elegir, para que el número no sorprenda. */}
            {hayPromoEnCarrito && !ofertasAcumulables && (
              <Text style={styles.avisoPromoDesc}>
                Los productos en promoción no llevan descuento: se calcula sobre {formatMoney(baseDesc, currency)}.
              </Text>
            )}
            {cargandoDesc ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : descuentos.length === 0 ? (
              <View style={styles.emptyCart}>
                <Icono nombre="pricetag-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyCartText}>No hay descuentos activos</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: spacing.xs }}>
                  Crea descuentos desde la sección Ofertas
                </Text>
              </View>
            ) : (
              descuentos.map(d => {
                const monto = montoDescuento(d, baseDesc);
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

// Diseño A (PLAN_REDISENO_V1): tarjetas blancas que flotan, negrita solo en
// números y títulos, el azul noche para lo activo y el azul para la acción.
const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };
const caja  = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: zc.fondo },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: spacing.sm, ...campo, paddingHorizontal: 12 },
  searchEnCabecera:{ marginHorizontal: 0, marginBottom: 0, marginTop: 14, borderWidth: 0 },
  searchIcon:     { marginRight: spacing.sm },
  searchInput:    { flex: 1, paddingVertical: 10, paddingLeft: 0, fontSize: 14.5, color: zc.tinta },
  clienteInputRow:{ flexDirection: 'row', marginHorizontal: 14, marginTop: 12, marginBottom: spacing.sm, gap: spacing.sm },
  clienteChip:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 12, marginBottom: spacing.sm, backgroundColor: zc.azulSuave, borderRadius: radios.boton, paddingHorizontal: 12, paddingVertical: 10, gap: spacing.xs },
  clienteChipText:{ fontSize: 14, fontWeight: '500', color: zc.azul, flex: 1 },
  clienteChipSub: { fontSize: 12.5, color: zc.azul },
  sugerencias:    { marginHorizontal: 14, marginTop: -spacing.xs, marginBottom: spacing.sm, ...caja, overflow: 'hidden', zIndex: 100 },
  sugerenciaItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: zc.linea },
  sugerenciaNombre:{ fontSize: 14, fontWeight: '500', color: zc.tinta, flex: 1 },
  sugerenciaTel:  { fontSize: 12.5, color: zc.grisSuave },
  sugerenciaClose:{ padding: spacing.sm, alignItems: 'center' },
  catScroll:      { flexGrow: 0, marginBottom: 10, paddingVertical: 2 },
  catChip:        { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.tarjeta, elevation: 1, shadowColor: zc.noche, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  catChipActive:  { backgroundColor: zc.noche },
  catChipText:    { fontSize: 13.5, color: zc.gris },
  catChipTextActive:{ color: '#fff' },
  grid:           { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 16 },
  productCard:    { flex: 1, ...caja, padding: 12 },
  productFotoBlanca:{ backgroundColor: zc.tarjeta },
  productFoto:    { height: 62, borderRadius: 12, backgroundColor: '#f3f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  productEmoji:   { fontSize: 32, marginBottom: spacing.xs },
  productName:    { fontSize: 13.5, fontWeight: '500', color: zc.tinta, lineHeight: 17, marginBottom: 2 },
  productPrice:   { fontSize: 15, fontWeight: '700', color: zc.azul },
  stockAgotado:   { alignSelf: 'flex-start', fontSize: 11.5, color: zc.ambarTexto, backgroundColor: zc.ambarSuave, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 3, overflow: 'hidden' },
  stockPocoFila:  { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 3 },
  stockPoco:      { fontSize: 11.5, color: zc.ambarTexto },
  stockHay:       { fontSize: 11.5, color: zc.grisSuave, marginTop: 3 },
  empty:          { textAlign: 'center', color: zc.grisSuave, marginTop: spacing.xxl, fontSize: 14.5 },
  barraCobrar:    { position: 'absolute', left: 0, right: 0, bottom: 10, zIndex: 20, borderRadius: 18, elevation: 8, shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  cartLayer:      { ...StyleSheet.absoluteFillObject, zIndex: 30 },
  cartOverlayPressable: { ...StyleSheet.absoluteFillObject },
  cartOverlay:    { flex: 1, backgroundColor: '#000' },
  cartPanel:      { ...StyleSheet.absoluteFillObject, backgroundColor: zc.fondo },
  ticketCab:      { backgroundColor: zc.noche },
  ticketCabFila:  { borderBottomWidth: 0 },
  ticketCabTitulo:{ color: zc.enNoche },
  dragHandleNoche:{ backgroundColor: 'rgba(255,255,255,0.25)' },
  vaciarTxt:      { color: zc.bajaTexto, fontWeight: '500', fontSize: 14 },
  dragHandleWrap: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d5dae2' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  modalTitle:     { fontSize: 19, fontWeight: '500', color: zc.tinta },
  modalSub:       { fontSize: 13, color: zc.grisSuave, marginTop: 2 },
  sectionLabel:   { fontSize: 13, color: zc.gris, marginBottom: spacing.sm },
  tipoPedidoRow:  { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  tipoBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radios.boton, paddingVertical: 11, ...caja },
  tipoBtnActive:  { backgroundColor: zc.noche },
  tipoBtnText:    { fontSize: 13.5, fontWeight: '500', color: zc.gris },
  cartItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, ...caja, padding: 12, marginBottom: 10 },
  cartEmoji:      { fontSize: 24, marginRight: spacing.sm },
  cartName:       { fontSize: 14.5, fontWeight: '500', color: zc.tinta },
  cartNota:       { fontSize: 12.5, color: zc.grisSuave, marginTop: 1, marginBottom: 1 },
  // Los extras van en ámbar: cambian el precio y lo que se prepara (BLOQUE 11).
  cartMods:       { fontSize: 12.5, color: zc.ambarTexto, marginTop: 1 },
  cartPrice:      { fontSize: 15, fontWeight: '700', color: zc.tinta, marginTop: 2 },
  iconBtn:        { padding: spacing.sm },
  emptyCart:      { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyCartText:  { color: zc.grisSuave, fontSize: 14.5 },
  tagsWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radios.chip, backgroundColor: zc.tarjeta, elevation: 1, shadowColor: zc.noche, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  tagText:        { fontSize: 13.5, color: zc.gris },
  notaInput:      { ...campo, padding: 12, fontSize: 14.5, color: zc.tinta, textAlignVertical: 'top', minHeight: 80 },
  carritoFooter:  { padding: 16, paddingBottom: 18, backgroundColor: zc.tarjeta, borderTopLeftRadius: 18, borderTopRightRadius: 18, ...sombra, elevation: 10 },
  totalLabel:     { fontSize: 13, color: zc.gris },
  totalValue:     { fontSize: 24, fontWeight: '700', color: zc.tinta, fontVariant: ['tabular-nums'] },
  totalGrande:    { fontSize: 36, letterSpacing: -0.5, marginBottom: spacing.sm },
  btnCobrar:      { backgroundColor: zc.azul, borderRadius: radios.boton, paddingVertical: 14, alignItems: 'center' },
  btnCobrarText:  { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnSecundario:  { borderRadius: radios.boton, paddingVertical: 14, alignItems: 'center', backgroundColor: zc.azulSuave },
  btnSecundarioText:{ color: zc.azul, fontSize: 15, fontWeight: '500' },
  resumenCliente: { flexDirection: 'row', alignItems: 'center', ...caja, borderRadius: radios.boton, padding: 11, marginBottom: spacing.md },
  resumenClienteText:{ fontSize: 13.5, color: zc.gris },
  metodoPagoBtn:  { flexDirection: 'row', alignItems: 'center', gap: 10, ...caja, borderRadius: radios.boton, padding: 13, marginBottom: 8 },
  metodoPagoBtnActive:{ backgroundColor: zc.noche },
  metodoPagoText: { fontSize: 15, fontWeight: '500', color: zc.tinta },

  // Desglose de total con descuentos
  totalDesglose:      { ...caja, borderRadius: radios.boton, padding: 12, marginVertical: spacing.sm },
  totalDesgloseRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  totalDesgloseLabel: { fontSize: 13.5, color: zc.gris },
  totalDesgloseValor: { fontSize: 13.5, color: zc.gris, fontWeight: '500', fontVariant: ['tabular-nums'] },

  // Efectivo
  efectivoBox:    { ...caja, padding: 14, marginTop: 14, marginBottom: spacing.sm },
  efectivoInput:  { ...campo, backgroundColor: zc.fondo, borderWidth: 0, padding: 12, fontSize: 22, fontWeight: '700', color: zc.tinta, textAlign: 'center', marginBottom: spacing.sm },
  cambioRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: zc.linea },
  cambioLabel:    { fontSize: 13.5, color: zc.gris },
  cambioValor:    { fontSize: 18, fontWeight: '700' },

  // ── Pago dividido (BLOQUE 10) ─────────────────────────────────────────────
  dividirBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, marginTop: 4, borderRadius: radios.boton, backgroundColor: zc.azulSuave },
  dividirBtnText:    { fontSize: 14, fontWeight: '500', color: zc.azul },
  pagosBox:          { ...caja, padding: 14, marginTop: 10 },
  pagosHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  pagosTitulo:       { fontSize: 15, fontWeight: '500', color: zc.tinta },
  pagosFaltante:     { fontSize: 13.5, fontWeight: '500', color: zc.azul },
  pagosPartesRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  pagosPartesLabel:  { fontSize: 13, color: zc.gris },
  pagosParteBtn:     { paddingHorizontal: 14, paddingVertical: 5, borderRadius: radios.chip, backgroundColor: zc.azulSuave },
  pagosParteBtnText: { fontSize: 13.5, fontWeight: '500', color: zc.azul },
  pagoRow:           { marginBottom: 10, gap: 6 },
  pagoMetodos:       { flexDirection: 'row', gap: 6 },
  pagoMetodoChip:    { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.fondo },
  pagoMetodoChipActive: { backgroundColor: zc.noche },
  pagoMetodoChipText:{ fontSize: 13, color: zc.gris },
  pagoInputs:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pagoInput:         { flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radios.boton, backgroundColor: zc.fondo, color: zc.tinta, fontSize: 14, textAlign: 'right' },
  pagoInputPropina:  { backgroundColor: zc.verdeSuave },
  pagoQuitar:        { padding: 9, borderRadius: radios.boton, backgroundColor: zc.rojoSuave },
  pagoAgregar:       { paddingVertical: 10, alignItems: 'center', borderRadius: radios.boton, borderWidth: 1, borderStyle: 'dashed', borderColor: '#bcd0f7' },
  pagoAgregarText:   { fontSize: 14, fontWeight: '500', color: zc.azul },
  pagosTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: zc.linea },
  pagosTotalLabel:   { fontSize: 13.5, color: zc.gris },
  pagosTotalValor:   { fontSize: 13.5, fontWeight: '700', color: zc.tinta },

  // Propina (BLOQUE 9) — el verde la distingue del dinero de la venta: no es
  // ingreso del negocio, es del empleado.
  propinaBox:        { ...caja, padding: 14, marginTop: 14, marginBottom: spacing.sm },
  propinaHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  propinaMonto:      { fontSize: 18, fontWeight: '700', color: zc.verde },
  propinaBotones:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  propinaBtn:        { flex: 1, minWidth: 64, alignItems: 'center', paddingVertical: 8, borderRadius: radios.boton, backgroundColor: zc.fondo },
  propinaBtnActive:  { backgroundColor: zc.verde },
  propinaBtnNinguna: { backgroundColor: zc.noche },
  propinaBtnPct:     { fontSize: 14, fontWeight: '500', color: zc.tinta },
  propinaBtnMonto:   { fontSize: 11, color: zc.gris },
  propinaInput:      { borderRadius: radios.boton, padding: 11, fontSize: 14.5, color: zc.tinta, backgroundColor: zc.fondo },
  propinaMetodoRow:  { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  propinaMetodoBtn:  { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.fondo },
  propinaMetodoBtnActive: { backgroundColor: zc.verde },
  propinaMetodoText: { fontSize: 12, color: zc.gris },
  propinaEntregaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: zc.linea },
  propinaEntregaLabel: { fontSize: 13.5, color: zc.gris },
  propinaEntregaValor: { fontSize: 18, fontWeight: '700', color: zc.tinta },

  // Domicilio
  domicilioBox:   { ...caja, padding: 14, marginTop: 14, marginBottom: spacing.sm },
  domicilioInput: { borderRadius: radios.boton, padding: 11, fontSize: 14.5, color: zc.tinta, backgroundColor: zc.fondo },

  // Descuento
  descuentoSection:   { marginTop: 18, marginBottom: spacing.sm },
  btnAplicarDesc:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radios.boton, padding: 13, backgroundColor: zc.azulSuave },
  btnAplicarDescText: { fontSize: 15, fontWeight: '500', color: zc.azul },
  descuentoAplicado:  { flexDirection: 'row', alignItems: 'center', ...caja, borderRadius: radios.boton, padding: 13 },
  descuentoAplicadoNombre: { fontSize: 14, color: zc.tinta },
  descuentoAplicadoMonto:  { fontSize: 15, fontWeight: '700', color: zc.verde },
  btnQuitarDesc:      { padding: spacing.xs },

  // Puntos de fidelidad — el lila de la pastilla de puntos de Clientes
  puntosBox:      { ...caja, padding: 14, marginTop: 14, marginBottom: spacing.sm },
  puntosHeader:   { marginBottom: spacing.sm },
  puntosBalance:  { fontSize: 15, fontWeight: '500', color: zc.tinta },
  puntosValor:    { fontSize: 13, color: tonos.lila.icono, marginTop: 2 },
  puntosGanar:    { fontSize: 12.5, color: zc.grisSuave, marginTop: 2 },
  btnPuntos:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radios.boton, padding: 11, backgroundColor: tonos.lila.fondo, justifyContent: 'center' },
  btnPuntosActivo:{ backgroundColor: tonos.lila.icono },
  btnPuntosText:  { fontSize: 14, fontWeight: '500', color: tonos.lila.icono },

  // Lista de descuentos en modal
  descuentoItem:      { flexDirection: 'row', alignItems: 'center', ...caja, padding: 14, marginBottom: 10 },
  descuentoItemNombre:{ fontSize: 15, fontWeight: '500', color: zc.tinta },
  descuentoItemEtiqueta: { fontSize: 13, color: zc.grisSuave, marginTop: 2 },
  descuentoItemMonto: { fontSize: 17, fontWeight: '700', color: zc.verde },

  // Promos (PLAN_OFERTAS_V1): el lila las distingue de los productos
  avisoPromoDesc:     { fontSize: 13, color: tonos.lila.icono, marginBottom: spacing.md },
  promosRow:          { flexGrow: 0, marginBottom: 10, paddingVertical: 2 },
  promoChip:          { maxWidth: 230, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: zc.tarjeta, ...sombra, elevation: 2 },
  promoChipFila:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  promoChipNombre:    { fontSize: 14, fontWeight: '500', color: zc.tinta, flexShrink: 1 },
  promoChipSub:       { fontSize: 12, color: tonos.lila.icono, marginTop: 2 },
  cartPromo:          { backgroundColor: tonos.lila.fondo },
  cartPromoProd:      { fontSize: 12.5, color: zc.gris, marginTop: 1 },
  cartPromoAhorro:    { fontSize: 12.5, color: zc.verde, fontWeight: '500', marginTop: 2 },
  sugerenciaPromo:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: tonos.lila.fondo, borderRadius: radios.boton, padding: 12, marginBottom: spacing.md },
  sugerenciaPromoTexto: { flex: 1, fontSize: 13.5, color: zc.tinta },
  sugerenciaPromoBtn: { backgroundColor: tonos.lila.icono, borderRadius: radios.boton, paddingHorizontal: 12, paddingVertical: 7 },
  sugerenciaPromoBtnText: { color: '#fff', fontWeight: '500', fontSize: 13.5 },

  // Advertencia efectivo
  advertenciaEfectivo: { textAlign: 'center', color: zc.grisSuave, fontSize: 13, marginTop: spacing.sm },

  // Modal PIN
  pinOverlay:  { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  pinBox:      { ...caja, padding: 22, width: '100%', maxWidth: 340 },
  pinTitle:    { fontSize: 18, fontWeight: '500', color: zc.tinta, marginBottom: spacing.xs },
  pinMsg:      { fontSize: 13.5, color: zc.gris, marginBottom: spacing.lg, lineHeight: 20 },
  pinInput:    { borderWidth: 1.5, borderColor: zc.linea, borderRadius: radios.boton, padding: 12, fontSize: 18, color: zc.tinta, backgroundColor: zc.fondo, textAlign: 'center', letterSpacing: 6, marginBottom: spacing.xs },
  pinErrorText:{ fontSize: 13, color: zc.rojo, marginBottom: spacing.sm },
  pinActions:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pinBtn:      { flex: 1, borderRadius: radios.boton, padding: 13, alignItems: 'center' },
  pinBtnCancel:{ backgroundColor: zc.fondo },
  pinBtnCancelText: { color: zc.gris, fontWeight: '500' },
  pinBtnConfirm:{ backgroundColor: zc.azul },
  pinBtnConfirmText: { color: '#fff', fontWeight: '500' },
});
