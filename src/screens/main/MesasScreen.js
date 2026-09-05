import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import IconoProducto from '../../components/IconoProducto';
import SvgIcon from '../../components/SvgIcon';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import SelectorSucursal from '../../components/SelectorSucursal';
import { formatMoney } from '../../utils/money';
import { createSSE } from '../../utils/sse';
import { friendlyError } from '../../utils/errors';
import { generarUuid } from '../../utils/uuid';
import { desgloseDePedido, etiquetaImpuesto } from '../../utils/impuestos';
import { configPropina, hayPropinas, normalizarPropina, normalizarMetodo as normalizarMetodoPropina, propinaPorPorcentaje, totalConPropina } from '../../utils/propinas';
import { dividirEnPartes, montoDeItems, cuadrarUltimoPago, faltantePago, pagosCuadran, validarPagos, metodoResumen as metodoResumenPagos, metodoDePago, PAGO_MAX } from '../../utils/pagos';
import ModalModificadores from '../../components/ModalModificadores';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';
import { claveCarrito, precioConModificadores, productoTieneModificadores, resumenModificadores, leerModificadores } from '../../utils/modificadores';

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
  const { isOwner, settings, sucursalId, puedeRegistrarEnSucursal, nombreActivo } = useAuth();
  const currency = settings?.currency_symbol || '$';
  // Config de propinas (BLOQUE 9). Se declara arriba porque la usan tanto el
  // cobro como el render del modal.
  const propCfg = configPropina(settings);

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
  // MODIFICADORES (BLOQUE 11). El catálogo se baja con las mesas; el modal se
  // abre al agregar un producto que ofrece extras.
  const [catalogoMods, setCatalogoMods]          = useState({ groups: [], product_groups: [] });
  const [modsModal, setModsModal]                = useState(null); // { producto }
  const [loadingProductos, setLoadingProductos]  = useState(false);
  const [agregando, setAgregando]                = useState(false);
  // Idempotencia del envío en curso (abrir mesa / agregar productos). Es un ref y
  // no estado: cambiarlo no debe re-renderizar, y debe sobrevivir a los reintentos.
  const uuidEnvioRef                             = useRef(null);
  const [busquedaP, setBusquedaP]                = useState('');

  // Modal: cobrar
  const [modalCobrarVisible, setModalCobrar] = useState(false);
  const [metodoPago, setMetodoPago]          = useState('efectivo');
  // Propina de la mesa (BLOQUE 9). Se decide AL COBRAR, no al abrir la mesa.
  // NO entra en la cuenta: es lo que el cliente deja de más.
  const [propina, setPropina]                = useState(0);
  const [propinaTexto, setPropinaTexto]      = useState('');
  const [propinaMetodo, setPropinaMetodo]    = useState(null);
  // DIVIDIR LA CUENTA (BLOQUE 10). Dos formas: POR ITEMS (cada comensal paga lo
  // que consumió — lo que más se pide) y PARTES IGUALES. En ambas los pagos
  // REPARTEN el total: si no suman la cuenta, el backend rechaza el cobro.
  const [dividirCuenta, setDividirCuenta]    = useState(false);
  const [modoDivision, setModoDivision]      = useState('items');   // 'items' | 'partes'
  const [pagosMesa, setPagosMesa]            = useState([]);
  const [asignacion, setAsignacion]          = useState({});        // { itemId: indiceDePago }
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
    // La división no se hereda de la mesa anterior: un reparto viejo cobraría
    // mal la cuenta nueva.
    setDividirCuenta(false);
    setModoDivision('items');
    setPagosMesa([]);
    setAsignacion({});
    setModalCobrar(true);
  }

  // ── Dividir la cuenta (BLOQUE 10) ────────────────────────────────────────
  const itemsCuenta = (ordenActiva && ordenActiva.items) || [];
  const totalCuenta = parseFloat((ordenActiva && ordenActiva.total) || 0);

  /**
   * La cuenta partida en UNIDADES asignables, no en renglones.
   *
   * ⚠️ Cuatro refrescos iguales son UN renglón con cantidad 4, y dos parejas
   * que pagan por separado necesitan 2 y 2. Repartiendo renglones enteros los
   * cuatro caen forzosamente en el mismo ticket. Cada unidad lleva un id propio
   * ("12#0", "12#1"…) y su parte del subtotal, así que montoDeItems() —la
   * fórmula compartida con el backend y el desktop (§31)— sigue funcionando SIN
   * TOCARLA: la suma de las unidades es la suma de los renglones.
   */
  const unidadesCuenta = useMemo(() => {
    const out = [];
    for (const it of itemsCuenta) {
      const sub = parseFloat(it.subtotal);
      const monto = Number.isFinite(sub) && sub > 0
        ? sub
        : (parseFloat(it.unit_price) || 0) * (parseFloat(it.quantity) || 0);
      const cant = parseInt(it.quantity, 10);
      // Una cantidad fraccionaria o rara se trata como un solo bloque: partir
      // "0.75 kg de queso" en unidades no significaría nada.
      const piezas = Number.isFinite(cant) && cant > 1 ? cant : 1;
      for (let k = 0; k < piezas; k++) {
        out.push({
          id: `${it.id}#${k}`,
          item_id: it.id,
          nombre: it.product ? it.product.name : 'Producto',
          subtotal: monto / piezas,
          pieza: k + 1,
          de: piezas,
        });
      }
    }
    return out;
  }, [itemsCuenta]);
  const faltaCuenta = faltantePago(pagosMesa, totalCuenta);
  const divisionCuadra = pagosMesa.length > 0 && pagosCuadran(pagosMesa, totalCuenta);

  function alternarDivision() {
    if (dividirCuenta) {
      setDividirCuenta(false);
      setPagosMesa([]);
      setAsignacion({});
      return;
    }
    // Se arranca con dos pagos y todos los items en el primero: el cajero solo
    // mueve los que cambian de dueño.
    const inicial = {};
    for (const u of unidadesCuenta) inicial[u.id] = 0;
    setAsignacion(inicial);
    setPagosMesa(_repartirPorItems(inicial, 2));
    setDividirCuenta(true);
  }

  /** Reparte el total entre N pagos según qué items le tocó pagar a cada uno. */
  function _repartirPorItems(asig, cuantosPagos, previos) {
    const base = Array.from({ length: cuantosPagos }, (_, i) => ({
      method: (previos && previos[i] && previos[i].method) || 'efectivo',
      amount: 0,
      tip_amount: (previos && previos[i] && previos[i].tip_amount) || 0,
      tipTexto: (previos && previos[i] && previos[i].tipTexto) || '',
      item_ids: [],
    }));
    for (let i = 0; i < base.length; i++) {
      const suyas = unidadesCuenta.filter(u => (asig[u.id] || 0) === i);
      // El monto se calcula por UNIDADES; los item_ids que se guardan son los
      // ids REALES (sin repetir), que es lo que el backend sabe validar. Un
      // renglón partido entre dos pagos aparece en los dos: es la verdad. El
      // cuadre lo hace el amount, nunca esta lista (§31).
      base[i].item_ids = [...new Set(suyas.map(u => u.item_id))];
      base[i].amount = montoDeItems(unidadesCuenta, suyas.map(u => u.id), totalCuenta);
    }
    // Las proporciones dejan centavos sueltos: se le cargan al último pago para
    // que la suma dé exactamente la cuenta (el backend exige que cuadre).
    cuadrarUltimoPago(base, totalCuenta);
    return base;
  }

  function cambiarModoDivision(modo) {
    setModoDivision(modo);
    if (modo === 'items') setPagosMesa(_repartirPorItems(asignacion, Math.max(2, pagosMesa.length), pagosMesa));
  }

  function dividirMesaEnPartes(n) {
    const montos = dividirEnPartes(totalCuenta, n);
    setPagosMesa(montos.map(monto => ({
      method: 'efectivo', amount: monto, texto: monto.toFixed(2), tip_amount: 0, tipTexto: '', item_ids: [],
    })));
    setAsignacion({});
  }

  function asignarItem(itemId, indice) {
    const nueva = { ...asignacion, [itemId]: indice };
    setAsignacion(nueva);
    setPagosMesa(_repartirPorItems(nueva, pagosMesa.length, pagosMesa));
  }

  function agregarPagoMesa() {
    if (pagosMesa.length >= PAGO_MAX) {
      Alert.alert('Demasiados pagos', `Una cuenta admite como máximo ${PAGO_MAX} pagos.`);
      return;
    }
    if (modoDivision === 'items') {
      setPagosMesa(_repartirPorItems(asignacion, pagosMesa.length + 1, pagosMesa));
      return;
    }
    const falta = faltantePago(pagosMesa, totalCuenta);
    const monto = falta > 0 ? falta : 0;
    setPagosMesa([...pagosMesa, {
      method: 'efectivo', amount: monto, texto: monto ? monto.toFixed(2) : '', tip_amount: 0, tipTexto: '', item_ids: [],
    }]);
  }

  function quitarPagoMesa(indice) {
    if (pagosMesa.length <= 1) { alternarDivision(); return; }
    // Los items que pagaba ese comensal pasan al primero, y los índices de los
    // que estaban después se corren: si no, apuntarían al pago equivocado.
    const nueva = {};
    for (const id of Object.keys(asignacion)) {
      const v = asignacion[id];
      nueva[id] = v === indice ? 0 : (v > indice ? v - 1 : v);
    }
    setAsignacion(nueva);
    const restantes = pagosMesa.filter((_, i) => i !== indice);
    setPagosMesa(modoDivision === 'items'
      ? _repartirPorItems(nueva, restantes.length, restantes)
      : restantes);
  }

  function cambiarPagoMesa(indice, campo, valor) {
    setPagosMesa(pagosMesa.map((pago, i) => {
      if (i !== indice) return pago;
      if (campo === 'method') return { ...pago, method: metodoDePago(valor) };
      const limpio = String(valor || '').replace(/[^\d.]/g, '');
      const num = parseFloat(limpio) || 0;
      return campo === 'amount'
        ? { ...pago, amount: num, texto: limpio }
        : { ...pago, tip_amount: num, tipTexto: limpio };
    }));
  }

  // Modal: crear mesa
  const [modalCrearVisible, setModalCrear]   = useState(false);
  const [nuevaNombre, setNuevaNombre]        = useState('');
  const [nuevaZona, setNuevaZona]            = useState('');
  const [nuevaCapacidad, setNuevaCapacidad]  = useState('4');
  const [creando, setCreando]                = useState(false);

  // Toast de confirmación
  const [toast, setToast]                    = useState('');
  // Sucursal que se está MIRANDO. Abrir mesas sigue registrando en la del equipo,
  // así que mirar otra es solo lectura (ver `bloqueada` más abajo).
  const [sucursalVista, setSucursalVista]    = useState(sucursalId || null);
  useEffect(() => { setSucursalVista(sucursalId || null); }, [sucursalId]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ── Cargar ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true);
    try {
      const data = await api.getTables(sucursalVista);
      setMesas(data);
    } catch (err) {
      Alert.alert('Error', err?.message || 'No se pudieron cargar las mesas.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [sucursalVista]);

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
      const sseOrders = createSSE(() => api.getOrdersEventsConfig(), () => load());

      // SSE: actualización en tiempo real cuando cambian los insumos (stock)
      const sseInv = createSSE(() => api.getInventoryEventsConfig(), () => {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      });

      // Intervalo de respaldo por si el SSE falla o no está disponible
      const interval = setInterval(() => load(), 30000);

      return () => {
        try { sseOrders?.close(); } catch {}
        try { sseInv?.close(); } catch {}
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
    uuidEnvioRef.current = null; // carrito nuevo = envío nuevo
    setBusquedaP('');
    try {
      const [grouped, mods] = await Promise.all([
        api.getProductsGrouped(),
        // Los extras se bajan junto al catálogo: sin ellos el mesero no podría
        // mandar 'sin cebolla' a la cocina (BLOQUE 11). No es crítico.
        api.getModifiers().catch(() => ({ groups: [], product_groups: [] })),
      ]);
      const all = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, categoryName: g.name })));
      setProductos(all.filter(p => p.active !== false));
      setCatalogoMods(mods);
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
    // Si el producto ofrece extras se preguntan primero (BLOQUE 11). Si no,
    // se agrega directo y todo queda como antes del bloque.
    if (productoTieneModificadores(catalogoMods, producto.id)) {
      setModsModal({ producto });
      return;
    }
    _sumarAlCarritoMesa(producto, []);
  }

  /**
   * La clave del carrito es "producto + extras": dos tacos, uno con extra queso
   * y otro sin él, son renglones DISTINTOS y se cobran distinto. Agrupar solo
   * por producto haría que el segundo heredara los extras (y el precio) del
   * primero.
   */
  function _sumarAlCarritoMesa(producto, modificadores) {
    uuidEnvioRef.current = null; // el envío cambió: ya no es el mismo lote
    const clave = claveCarrito(producto.id, modificadores);
    setCarritoAgregar(prev => ({
      ...prev,
      [clave]: {
        producto,
        modificadores,
        // Lo que se cobra por unidad de ESTE renglón (base + extras).
        precio: precioConModificadores(producto.price, modificadores),
        qty: (prev[clave]?.qty || 0) + 1,
        // Para saber de qué variante quitar cuando el cajero toca el "−" del
        // catálogo, que solo conoce el producto: se quita de la última tocada.
        tocado: Date.now(),
      },
    }));
  }

  function decrementar(productoId) {
    uuidEnvioRef.current = null;
    setCarritoAgregar(prev => {
      // El "−" del catálogo solo conoce el producto, no la variante: se quita de
      // la ÚLTIMA que el cajero tocó, que es la que acaba de agregar.
      const claves = Object.keys(prev).filter(k => prev[k].producto.id === productoId);
      if (claves.length === 0) return prev;
      const clave = claves.sort((a, b) => (prev[b].tocado || 0) - (prev[a].tocado || 0))[0];
      const qty = (prev[clave]?.qty || 0) - 1;
      const next = { ...prev };
      if (qty <= 0) delete next[clave];
      else next[clave] = { ...prev[clave], qty };
      return next;
    });
  }

  async function confirmarAgregar() {
    const items = Object.values(carritoAgregar).map(({ producto, qty, modificadores }) => ({
      product_id: producto.id,
      quantity: qty,
      // Solo viaja QUÉ se eligió: el delta lo pone el backend desde su base
      // (BLOQUE 11), nunca el cliente.
      ...(modificadores && modificadores.length ? { modifiers: modificadores } : {}),
    }));
    if (items.length === 0) return;
    // Mirando otra sucursal la vista es SOLO LECTURA: abrir una mesa de Norte con
    // una venta que se guarda en Centro cruzaría los datos de las dos.
    if (sucursalVista !== sucursalId) {
      Alert.alert(
        'Solo lectura',
        'Estás viendo las mesas de otra sucursal. Para registrar aquí, vuelve a la sucursal de este equipo en las pestañas de arriba.'
      );
      return;
    }
    // Abrir mesa crea un pedido: aplica la misma regla de sucursal que una venta
    if (!ordenActiva && !puedeRegistrarEnSucursal()) {
      Alert.alert(
        'Falta elegir la sucursal',
        'Este equipo todavía no tiene una sucursal asignada. Ve a Ajustes → Sucursal y elige en cuál registra este equipo.'
      );
      return;
    }

    if (agregando) return; // doble tap: la primera comanda ya va en camino

    // Un uuid por LOTE, estable mientras el carrito no cambie. Si la respuesta se
    // pierde con red débil pero el backend SÍ guardó el envío, el reintento
    // devuelve la mesa tal cual está en vez de duplicar los productos y volver a
    // descontar los insumos.
    if (!uuidEnvioRef.current) uuidEnvioRef.current = generarUuid();
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
          client_uuid: uuidEnvioRef.current,
        });
        setOrdenActiva(order);
        setModalAgregar(false);
        setModalDetalle(true);
      } else {
        // Mesa ocupada: agregar a pedido existente
        const updated = await api.addItemsToOrder(ordenActiva.id, items, uuidEnvioRef.current);
        setOrdenActiva(updated);
        setModalAgregar(false);
      }
      uuidEnvioRef.current = null; // lote cerrado: el próximo envío es otro
      load();
      // Refrescar stock inmediatamente (sin esperar SSE)
      if (mostrarStock) {
        api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
      }
      showToast('✓ Comanda enviada a cocina');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setAgregando(false);
    }
  }

  // ── Cobrar ───────────────────────────────────────────────────────────────────

  async function confirmarCobrar() {
    if (!ordenActiva) return;

    // Con la cuenta dividida se valida ANTES de cobrar, para que el cajero vea
    // el problema en la pantalla y no como un 400 del backend.
    let pagosPayload = null;
    if (dividirCuenta) {
      const v = validarPagos(pagosMesa, totalCuenta);
      if (!v.ok) { Alert.alert('La división no cuadra', v.error); return; }
      pagosPayload = pagosMesa.map(pago => ({
        method: pago.method,
        amount: pago.amount,
        tip_amount: pago.tip_amount || 0,
        item_ids: pago.item_ids || [],
      }));
    }

    setCobrando(true);
    try {
      // El método de pago y la propina se mandan AQUÍ, al cobrar (BLOQUE 9).
      // ⚠️ `payment_method` no se mandaba: la mesa cobrada con tarjeta quedaba
      // guardada como efectivo y descuadraba el corte de caja.
      // Con la cuenta dividida la propina es la SUMA de las de cada pago y el
      // método sale del reparto ('multiple' si hay varios).
      const propinaFinal = hayPropinas(propCfg)
        ? (dividirCuenta
            ? parseFloat(pagosMesa.reduce((a, x) => a + (parseFloat(x.tip_amount) || 0), 0).toFixed(2))
            : propina)
        : 0;
      const metodoFinal = dividirCuenta ? metodoResumenPagos(pagosMesa) : metodoPago;
      const cobrado = await api.updateOrderStatus(ordenActiva.id, 'completado', {
        payment_method: metodoFinal,
        tip_amount: propinaFinal,
        tip_method: propinaFinal > 0 ? normalizarMetodoPropina(propinaMetodo, metodoFinal) : null,
        // BLOQUE 10 — desglose de la cuenta dividida. Va solo si se dividió; en
        // un cobro normal el backend hace lo de siempre (un método, sin filas).
        ...(pagosPayload ? { payments: pagosPayload } : {}),
      });

      // TICKET DE LA MESA (BLOQUE 11, deuda §12.7). La respuesta de cobrar trae
      // los items, el impuesto congelado y el reparto de pagos ya guardados: es
      // exactamente lo que debe salir en el papel.
      // ⚠️ Sin await y sin try/catch: la mesa ya está cobrada y un fallo de
      // impresora NUNCA debe tumbar el cobro (§26). La función no lanza.
      imprimirTicketPedido(cobrado || ordenActiva, settings, {
        cashier: nombreActivo,
        tableName: mesaSel?.name,
      });

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
              showToast(`+${pts} puntos para ${clienteSelec.name}`);
            }
          }
        } catch { /* los puntos no son críticos */ }
      }

      // La propina no se hereda a la siguiente mesa que se cobre.
      setPropina(0);
      setPropinaTexto('');
      setPropinaMetodo(null);
      setModalCobrar(false);
      setModalDetalle(false);
      setOrdenActiva(null);
      setMesaSel(null);
      load();
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
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
        // La mesa nace en la sucursal de ESTE equipo, no en la que se esté mirando
        branch_id: sucursalId || undefined,
      });
      setModalCrear(false);
      setNuevaNombre(''); setNuevaZona(''); setNuevaCapacidad('4');
      load();
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
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
    // El precio del renglón ya trae los extras; los renglones sin modificadores
    // no lo llevan y caen al del catálogo, igual que antes del BLOQUE 11.
    .reduce((s, { producto, qty, precio }) => s + parseFloat(precio != null ? precio : producto.price) * qty, 0);

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <LogoTitle title="Mesas" titleStyle={styles.title} />
        {isOwner && (
          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalCrear(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Ver las mesas de otra sucursal (solo lectura) */}
      <SelectorSucursal value={sucursalVista} onChange={setSucursalVista} />

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
                <IconoProducto valor={item.product?.emoji || 'svg:shopping-bag'} size={22} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product?.name || 'Producto'}</Text>
                  {/* Extras del renglón (BLOQUE 11). El precio del renglón ya
                      los incluye, así que van como detalle, no como cargo aparte. */}
                  {resumenModificadores(leerModificadores(item.modifiers)) ? (
                    <Text style={styles.itemMods}>{resumenModificadores(leerModificadores(item.modifiers))}</Text>
                  ) : null}
                  {item.notes ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="document-text-outline" size={12} color={colors.textMuted} /><Text style={[styles.itemNota, { marginLeft: 2 }]}>{item.notes}</Text></View> : null}
                </View>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatMoney(parseFloat(item.subtotal || 0), currency)}</Text>
              </View>
            ))}
            {(!ordenActiva?.items || ordenActiva.items.length === 0) && (
              <Text style={styles.emptyItems}>Sin productos aún</Text>
            )}
            {/* Desglose del impuesto de la mesa (BLOQUE 8). Sale del pedido, que
                lo trae congelado con la tasa que tenía al abrirse: si el dueño la
                cambia a media comida, la cuenta que el cliente ya vio no se mueve. */}
            {(parseFloat(ordenActiva?.tax_amount) || 0) > 0 && (
              <View style={[styles.totalRow, { paddingVertical: spacing.xs, marginTop: 0 }]}>
                <Text style={styles.itemNota}>
                  {etiquetaImpuesto(desgloseDePedido(ordenActiva, settings))}
                </Text>
                <Text style={styles.itemNota}>
                  {formatMoney(parseFloat(ordenActiva.tax_amount), currency)}
                </Text>
              </View>
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
                // Suma de TODAS las variantes de este producto en el carrito.
                const qty = Object.values(carritoAgregar)
                  .filter(e => e.producto.id === item.id)
                  .reduce((s, e) => s + e.qty, 0);
                const recipeStock = stockMap ? stockMap[item.id] : undefined;
                const rawStock = recipeStock !== undefined ? recipeStock : (item.stock ?? null);
                const stock = rawStock !== null ? Math.max(0, rawStock) : null;
                let stockEl = null;
                if (mostrarStock && stock !== null) {
                  if (stock === 0) {
                    stockEl = <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600', marginTop: 2 }}>Sin stock</Text>;
                  } else if (stock <= 3) {
                    stockEl = <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}><SvgIcon name="triangle-alert" size={10} color="#f59e0b" /><Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600', marginLeft: 2 }}>{stock} disp.</Text></View>;
                  } else {
                    stockEl = <Text style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>{stock} disp.</Text>;
                  }
                }
                return (
                  <View style={[styles.pCard, mostrarStock && stock === 0 && { opacity: 0.5 }]}>
                    <IconoProducto valor={item.emoji || 'svg:shopping-bag'} size={28} color={colors.textSecondary} />
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
          {/* Selector de extras (BLOQUE 11). Va dentro del modal del catálogo
              para que se dibuje encima de él y no detrás. */}
          <ModalModificadores
            visible={modsModal !== null}
            producto={modsModal?.producto}
            catalogo={catalogoMods}
            currency={currency}
            onCancel={() => setModsModal(null)}
            onConfirm={(seleccion) => {
              _sumarAlCarritoMesa(modsModal.producto, seleccion);
              setModsModal(null);
            }}
          />
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
            {/* DIVIDIR LA CUENTA (BLOQUE 10). Es lo que más se pide en una mesa:
                varios comensales que pagan cada quien lo suyo. Arranca cerrado
                para no estorbarle a la mesa que paga de una sola forma. */}
            <TouchableOpacity style={styles.dividirBtn} onPress={alternarDivision}>
              <Ionicons
                name={dividirCuenta ? 'close-circle-outline' : 'git-branch-outline'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.dividirBtnText}>
                {dividirCuenta ? 'Cancelar la división' : 'Dividir la cuenta'}
              </Text>
            </TouchableOpacity>

            {dividirCuenta && (
              <View style={styles.pagosBox}>
                <View style={styles.pagosHeader}>
                  <Text style={styles.pagosTitulo}>División de la cuenta</Text>
                  <Text style={[
                    styles.pagosFaltante,
                    divisionCuadra ? { color: colors.success } : (faltaCuenta < 0 ? { color: colors.danger } : null),
                  ]}>
                    {divisionCuadra
                      ? 'Cuadra ✓'
                      : (faltaCuenta > 0
                          ? `Falta ${formatMoney(faltaCuenta, currency)}`
                          : `Sobra ${formatMoney(Math.abs(faltaCuenta), currency)}`)}
                  </Text>
                </View>

                {/* Dos formas de dividir. Por items es la principal. */}
                <View style={styles.divisionTabs}>
                  {[
                    { key: 'items',  label: 'Por items' },
                    { key: 'partes', label: 'Partes iguales' },
                  ].map(t => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.divisionTab, modoDivision === t.key && styles.divisionTabActive]}
                      onPress={() => cambiarModoDivision(t.key)}
                    >
                      <Text style={[styles.divisionTabText, modoDivision === t.key && { color: '#fff' }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {modoDivision === 'partes' && (
                  <View style={styles.pagosPartesRow}>
                    <Text style={styles.pagosPartesLabel}>Entre:</Text>
                    {[2, 3, 4, 5].map(n => (
                      <TouchableOpacity key={n} style={styles.pagosParteBtn} onPress={() => dividirMesaEnPartes(n)}>
                        <Text style={styles.pagosParteBtnText}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {modoDivision === 'items' && (
                  <View style={{ marginBottom: spacing.sm }}>
                    <Text style={styles.divisionAyuda}>
                      Toca el número para asignar cada producto a quien lo paga.
                      Los montos se calculan solos.
                    </Text>
                    {unidadesCuenta.map(u => (
                      <View key={u.id} style={styles.divisionItemRow}>
                        <Text style={styles.divisionItemNombre} numberOfLines={1}>
                          {u.nombre}{u.de > 1 ? ` · ${u.pieza} de ${u.de}` : ''}
                        </Text>
                        <View style={styles.divisionItemPagos}>
                          {pagosMesa.map((_, i) => (
                            <TouchableOpacity
                              key={i}
                              style={[
                                styles.divisionItemChip,
                                (asignacion[u.id] || 0) === i && styles.divisionItemChipActive,
                              ]}
                              onPress={() => asignarItem(u.id, i)}
                            >
                              <Text style={[
                                styles.divisionItemChipText,
                                (asignacion[u.id] || 0) === i && { color: '#fff' },
                              ]}>{i + 1}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {pagosMesa.map((pago, i) => (
                  <View key={i} style={styles.pagoRow}>
                    <View style={styles.pagoMetodos}>
                      {['efectivo', 'tarjeta', 'transferencia'].map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.pagoMetodoChip, pago.method === m && styles.pagoMetodoChipActive]}
                          onPress={() => cambiarPagoMesa(i, 'method', m)}
                        >
                          <Text style={[styles.pagoMetodoChipText, pago.method === m && { color: '#fff' }]}>
                            {m === 'transferencia' ? 'Transf.' : (m === 'efectivo' ? 'Efectivo' : 'Tarjeta')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.pagoInputs}>
                      <Text style={styles.pagoIndice}>Pago {i + 1}</Text>
                      {/* En modo POR ITEMS el monto lo calcula la asignación: se
                          muestra en solo lectura porque editarlo a mano
                          descuadraría la división sin explicar por qué. */}
                      {modoDivision === 'items' ? (
                        <Text style={styles.pagoMontoFijo}>{formatMoney(pago.amount || 0, currency)}</Text>
                      ) : (
                        <TextInput
                          style={styles.pagoInput}
                          value={pago.texto}
                          onChangeText={t => cambiarPagoMesa(i, 'amount', t)}
                          placeholder="Monto"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                        />
                      )}
                      {hayPropinas(propCfg) && (
                        <TextInput
                          style={[styles.pagoInput, styles.pagoInputPropina]}
                          value={pago.tipTexto}
                          onChangeText={t => cambiarPagoMesa(i, 'tip_amount', t)}
                          placeholder="Propina"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                        />
                      )}
                      <TouchableOpacity style={styles.pagoQuitar} onPress={() => quitarPagoMesa(i)}>
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity style={styles.pagoAgregar} onPress={agregarPagoMesa}>
                  <Text style={styles.pagoAgregarText}>+ Agregar otro pago</Text>
                </TouchableOpacity>

                <View style={styles.pagosTotalRow}>
                  <Text style={styles.pagosTotalLabel}>Cuenta</Text>
                  <Text style={styles.pagosTotalValor}>{formatMoney(totalCuenta, currency)}</Text>
                </View>
              </View>
            )}

            {/* PROPINA (BLOQUE 9). Va después del método de pago: el porcentaje
                se calcula sobre la cuenta y la propina puede cobrarse por otro
                método. No entra en el total: la mesa consumió lo que consumió. */}
            {hayPropinas(propCfg) && (
              <View style={styles.propinaBox}>
                <View style={styles.propinaHeader}>
                  <Text style={styles.fieldLabel}>Propina</Text>
                  <Text style={styles.propinaMonto}>
                    {formatMoney(hayPropinas(propCfg) ? propina : 0, currency)}
                  </Text>
                </View>
                <View style={styles.propinaBotones}>
                  {(propCfg.sugerencias || []).map(pct => {
                    const monto  = propinaPorPorcentaje(totalOrden, pct);
                    const activo = propina > 0 && Math.abs(propina - monto) < 0.005;
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
                    style={[styles.propinaBtn, propina <= 0 && styles.propinaBtnNinguna]}
                    onPress={() => { setPropina(0); setPropinaTexto(''); setPropinaMetodo(null); }}
                  >
                    <Text style={[styles.propinaBtnPct, propina <= 0 && { color: '#fff' }]}>Sin</Text>
                    <Text style={[styles.propinaBtnMonto, propina <= 0 && { color: '#fff' }]}>propina</Text>
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
                {propina > 0 && (
                  <>
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
                    {/* Lo que el cliente entrega. La cuenta de la mesa sigue
                        siendo el total de arriba. */}
                    <View style={styles.propinaEntregaRow}>
                      <Text style={styles.propinaEntregaLabel}>El cliente entrega</Text>
                      <Text style={styles.propinaEntregaValor}>
                        {formatMoney(totalConPropina(totalOrden, propina), currency)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}

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
  // Los extras van en ámbar: cambian el precio y lo que prepara la cocina.
  itemMods:         { fontSize: font.sm - 2, color: '#b45309', fontWeight: '600' },
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
  // Propina (BLOQUE 9) — en verde para distinguirla del dinero de la venta:
  // no es ingreso del negocio, es del empleado.
  // ── Dividir la cuenta (BLOQUE 10) ─────────────────────────────────────────
  dividirBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  dividirBtnText:    { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosBox:          { backgroundColor: colors.primary + '10', borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + '55', padding: spacing.md, marginTop: spacing.sm },
  pagosHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  pagosTitulo:       { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosFaltante:     { fontSize: font.sm, fontWeight: '800', color: colors.primary },
  divisionTabs:      { flexDirection: 'row', gap: 4, marginBottom: spacing.sm },
  divisionTab:       { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary + '55', backgroundColor: colors.surface },
  divisionTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  divisionTabText:   { fontSize: font.xs, fontWeight: '700', color: colors.primary },
  divisionAyuda:     { fontSize: font.xs, color: colors.textSecondary, marginBottom: spacing.sm },
  divisionItemRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: spacing.sm },
  divisionItemNombre:{ flex: 1, fontSize: font.xs, color: colors.text },
  divisionItemPagos: { flexDirection: 'row', gap: 4 },
  divisionItemChip:  { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  divisionItemChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  divisionItemChipText: { fontSize: font.xs, fontWeight: '700', color: colors.textSecondary },
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
  pagoIndice:        { fontSize: font.xs, color: colors.textSecondary, minWidth: 46 },
  pagoMontoFijo:     { flex: 1, fontSize: font.sm, fontWeight: '700', color: colors.primary, textAlign: 'right' },
  pagoInput:         { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: font.sm, textAlign: 'right' },
  pagoInputPropina:  { borderColor: colors.success + '77', backgroundColor: colors.success + '10' },
  pagoQuitar:        { padding: 8, borderRadius: radius.sm, backgroundColor: colors.danger + '20' },
  pagoAgregar:       { paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary + '77', backgroundColor: colors.surface },
  pagoAgregarText:   { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  pagosTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.primary + '33' },
  pagosTotalLabel:   { fontSize: font.xs, color: colors.primary },
  pagosTotalValor:   { fontSize: font.xs, fontWeight: '700', color: colors.primary },

  propinaBox:        { backgroundColor: colors.success + '10', borderRadius: radius.md, borderWidth: 1, borderColor: colors.success + '55', padding: spacing.md, marginTop: spacing.lg },
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
