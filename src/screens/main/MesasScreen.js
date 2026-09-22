import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconoProducto from '../../components/IconoProducto';
import SvgIcon from '../../components/SvgIcon';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font, zc, tonos, radios, sombra } from '../../theme';
import { Cabecera, Icono } from '../../components/ui';
import SelectorSucursal from '../../components/SelectorSucursal';
import { formatMoney } from '../../utils/money';
import { createSSE } from '../../utils/sse';
import { friendlyError } from '../../utils/errors';
import { esAvisoStock, textoAvisoStock } from '../../utils/avisoStock';
import { generarUuid } from '../../utils/uuid';
import { desgloseDePedido, etiquetaImpuesto } from '../../utils/impuestos';
import { configPropina, hayPropinas, normalizarPropina, normalizarMetodo as normalizarMetodoPropina, propinaPorPorcentaje, totalConPropina } from '../../utils/propinas';
import { dividirEnPartes, montoDeItems, cuadrarUltimoPago, faltantePago, pagosCuadran, validarPagos, metodoResumen as metodoResumenPagos, metodoDePago, PAGO_MAX } from '../../utils/pagos';
import ModalModificadores from '../../components/ModalModificadores';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';
import { precioConModificadores, productoTieneModificadores, resumenModificadores, leerModificadores } from '../../utils/modificadores';
import HojaPromo from '../../components/HojaPromo';
import { obtenerPromos } from '../../offline/ventasOffline';
import {
  promoDeCatalogo, promosActivasAhora, armarRenglonPromo, claveCarritoMesa, renglonParaMesa,
  totalCarritoMesa, unidadesDeCuenta, agruparRenglones, textoHuecos, textoCobro,
} from '../../utils/promos';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tiempoTranscurrido(isoDate) {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  // La hora la pone el SERVIDOR: con el reloj del teléfono un poco atrasado
  // salía "-1min". Una mesa recién abierta lleva 0 minutos, nunca menos.
  const min = Math.max(0, Math.floor(diff / 60000));
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
      <View style={[styles.statusDot, { backgroundColor: ocupada ? zc.ambar : zc.verde }]} />

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
        <Icono nombre="people-outline" size={14} color={zc.grisSuave} />
        <Text style={styles.capacidadText}>{mesa.capacity}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function MesasScreen() {
  const { isOwner, isPremium, modoLocal, settings, sucursalId, puedeRegistrarEnSucursal, nombreActivo } = useAuth();
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
  // PROMOS (PLAN_OFERTAS_V1). Se bajan con el catálogo; la hoja se abre al
  // tocar una promo activa y la promo entra al carrito como UN renglón.
  const [promosMesa, setPromosMesa]              = useState([]);
  const [categoriasMesa, setCategoriasMesa]      = useState([]);
  const [hojaPromo, setHojaPromo]                = useState(null);
  const [quitando, setQuitando]                  = useState(false);
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
  // ⚠️ Y una PROMO es UNA unidad que va entera a un pago (trampa 5 de
  // PLAN_OFERTAS_V1): cada taco lleva su parte y dividirlo cuadraría, pero dos
  // amigos acabarían peleándose por un taco de $14.58. La regla vive en
  // utils/promos.js → unidadesDeCuenta.
  const unidadesCuenta = useMemo(() => unidadesDeCuenta(itemsCuenta), [itemsCuenta]);
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
      base[i].item_ids = [...new Set(suyas.flatMap(u => u.item_ids))];
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

      // SSE: pedidos e insumos en tiempo real, por UNA sola conexión (§56.6).
      // Ésta era la única pantalla del celular que abría dos: ahora pide los dos
      // canales de golpe y los distingue por el NOMBRE del evento.
      //
      // ⚠️ `canales` no es decorativo: sin él, createSSE escucha 'message' y los
      // eventos NOMBRADOS del endpoint unificado no llegan ahí. La pantalla
      // dejaría de refrescarse sola sin un solo error.
      const sse = createSSE(() => api.getEventsConfig(['orders', 'inventory']), (_evento, canal) => {
        if (canal === 'inventory') {
          api.getProductsStock(sucursalId).then(map => setStockMap(map)).catch(() => {});
        } else {
          load();
        }
      }, { canales: ['orders', 'inventory'] });

      // Intervalo de respaldo por si el SSE falla o no está disponible
      const interval = setInterval(() => load(), 30000);

      return () => {
        try { sse?.close(); } catch {}
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
      const [grouped, mods, combos] = await Promise.all([
        api.getProductsGrouped(),
        // Los extras se bajan junto al catálogo: sin ellos el mesero no podría
        // mandar 'sin cebolla' a la cocina (BLOQUE 11). No es crítico.
        api.getModifiers().catch(() => ({ groups: [], product_groups: [] })),
        // Las promos tampoco: sin ellas la mesa se sigue pudiendo servir.
        obtenerPromos().catch(() => []),
      ]);
      // `category_id` hace falta para saber qué entra en "2 de [Tacos]".
      const all = grouped.flatMap(g => (g.products || []).map(p => ({ ...p, categoryName: g.name, category_id: g.id })));
      setProductos(all.filter(p => p.active !== false));
      setCatalogoMods(mods);
      setCategoriasMesa(grouped.map(g => ({ id: g.id, name: g.name })));
      setPromosMesa((combos || []).map(promoDeCatalogo).filter(Boolean));
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
    const clave = claveCarritoMesa({ producto, modificadores });
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
      const claves = Object.keys(prev).filter(k => prev[k].producto && prev[k].producto.id === productoId);
      if (claves.length === 0) return prev;
      const clave = claves.sort((a, b) => (prev[b].tocado || 0) - (prev[a].tocado || 0))[0];
      const qty = (prev[clave]?.qty || 0) - 1;
      const next = { ...prev };
      if (qty <= 0) delete next[clave];
      else next[clave] = { ...prev[clave], qty };
      return next;
    });
  }

  /** La hoja de la promo terminó: entra al carrito de la mesa como UN renglón. */
  function agregarPromoMesa(elegidos) {
    const promo = hojaPromo;
    setHojaPromo(null);
    if (!promo) return;
    uuidEnvioRef.current = null; // el envío cambió: ya no es el mismo lote
    const renglon = armarRenglonPromo(promo, elegidos, { grupo: generarUuid() });
    const entrada = { tipo: 'promo', renglon, qty: 1 };
    // La clave lleva el GRUPO (trampa 2): dos 2x1 iguales son dos renglones, y
    // el taco de la promo nunca se funde con un taco suelto.
    setCarritoAgregar(prev => ({ ...prev, [claveCarritoMesa(entrada)]: entrada }));
  }

  function quitarPromoDelCarrito(clave) {
    uuidEnvioRef.current = null;
    setCarritoAgregar(prev => { const next = { ...prev }; delete next[clave]; return next; });
  }

  // `opts.sinRevisarStock`: el mesero ya vio el aviso de existencias y eligió
  // mandar la comanda igual. (onPress pasa el evento, por eso se compara con true.)
  async function confirmarAgregar(opts) {
    const sinRevisarStock = opts?.sinRevisarStock === true;
    // Solo viaja QUÉ se eligió: el delta lo pone el backend desde su base
    // (BLOQUE 11), y el precio de la promo también (online, siempre).
    const items = Object.values(carritoAgregar).map(renglonParaMesa);
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
          ...(sinRevisarStock ? { skip_stock_check: true } : {}),
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
      // Faltan existencias: la mesa NO se abrió. Antes esto se tragaba y la
      // comanda desaparecía sin decir nada. Avisa y deja mandarla igual (§56.3).
      if (esAvisoStock(e)) {
        Alert.alert(
          'Faltan existencias',
          textoAvisoStock(e.warnings) + '\n\nLa comanda todavía NO se ha enviado. ¿Enviarla de todas formas?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Enviar igual', onPress: () => confirmarAgregar({ sinRevisarStock: true }) },
          ],
        );
        return;
      }
      Alert.alert('Error', friendlyError(e));
    } finally {
      setAgregando(false);
    }
  }

  // ── Quitar un renglón de la mesa ─────────────────────────────────────────────

  /**
   * Quita un producto de la cuenta abierta. Si es de una PROMO, el servidor
   * quita la promo ENTERA con sus insumos de vuelta (trampa 4): quitar un solo
   * taco dejaría "medio 2x1" cobrado a precio de promo. Queda en la auditoría a
   * nombre del puesto (Bloque 0).
   */
  function quitarRenglonMesa(item, nombrePromo) {
    if (!ordenActiva || !item) return;
    if (sucursalVista !== sucursalId) {
      Alert.alert('Solo lectura', 'Estás viendo las mesas de otra sucursal.');
      return;
    }
    const titulo = nombrePromo ? '¿Quitar la promo?' : '¿Quitar el producto?';
    const mensaje = nombrePromo
      ? `Se quita "${nombrePromo}" completa, con todos sus productos.`
      : `Se quita ${item.product?.name || 'el producto'} de la cuenta.`;
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive', onPress: async () => {
          setQuitando(true);
          try {
            const actualizado = await api.removeOrderItem(ordenActiva.id, item.id, nombreActivo || '');
            if (actualizado) setOrdenActiva(actualizado);
            load();
          } catch (e) {
            Alert.alert('Error', friendlyError(e));
          } finally {
            setQuitando(false);
          }
        },
      },
    ]);
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

  // El precio del renglón ya trae los extras; una promo cuenta una vez.
  const totalCarrito = totalCarritoMesa(carritoAgregar);
  const promosActivasMesa = promosActivasAhora(promosMesa, productos, { premium: isPremium && !modoLocal });
  const promosEnCarrito = Object.entries(carritoAgregar).filter(([, e]) => e.tipo === 'promo');

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>

      {/* Cabecera azul noche (diseño A), con el selector de sucursal dentro */}
      <Cabecera
        titulo="Mesas"
        derecha={isOwner && (
          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalCrear(true)}>
            <Icono nombre="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      >
        {/* Ver las mesas de otra sucursal (solo lectura) */}
        <View style={styles.sucursalEnCabecera}>
          <SelectorSucursal value={sucursalVista} onChange={setSucursalVista} enNoche />
        </View>
      </Cabecera>

      {/* Leyenda */}
      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}><View style={[styles.leyendaDot, { backgroundColor: zc.verde }]} /><Text style={styles.leyendaTxt}>Libre</Text></View>
        <View style={styles.leyendaItem}><View style={[styles.leyendaDot, { backgroundColor: zc.ambar }]} /><Text style={styles.leyendaTxt}>Ocupada</Text></View>
        <Text style={styles.leyendaCount}>{mesas.filter(m => m.open_order).length}/{mesas.length} ocupadas</Text>
      </View>

      {mesas.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Icono nombre="grid-outline" size={52} color={colors.textMuted} />
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
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
                <Icono nombre="restaurant-outline" size={20} color="#fff" />
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <View style={styles.cuentaCaja}>
            {agruparRenglones(ordenActiva?.items || []).map((g, i) => g.promo ? (
              // PROMO (PLAN_OFERTAS_V1): la cuenta la enseña JUNTA, como se pidió.
              // Quitarla quita la promo entera (trampa 4): nunca "medio 2x1".
              <View key={`p${i}`} style={[styles.itemRow, styles.itemPromo]}>
                <Icono nombre="gift-outline" size={20} color={tonos.lila.icono} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{g.promo.nombre}</Text>
                  {g.items.map((it, j) => (
                    <Text key={j} style={styles.itemPromoProd}>
                      · {it.product?.name || 'Producto'}
                      {resumenModificadores(leerModificadores(it.modifiers)) ? ` (${resumenModificadores(leerModificadores(it.modifiers))})` : ''}
                    </Text>
                  ))}
                  {g.promo.ahorro > 0 ? <Text style={styles.itemPromoAhorro}>Ahorra {formatMoney(g.promo.ahorro, currency)}</Text> : null}
                </View>
                <Text style={styles.itemPrice}>{formatMoney(g.promo.total, currency)}</Text>
                <TouchableOpacity style={styles.itemQuitar} disabled={quitando} onPress={() => quitarRenglonMesa(g.items[0], g.promo.nombre)}>
                  <Icono nombre="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ) : (
              <View key={i} style={styles.itemRow}>
                <IconoProducto valor={g.item.product?.emoji || 'svg:shopping-bag'} size={30} color={zc.gris} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{g.item.product?.name || 'Producto'}</Text>
                  {/* Extras del renglón (BLOQUE 11). El precio del renglón ya
                      los incluye, así que van como detalle, no como cargo aparte. */}
                  {resumenModificadores(leerModificadores(g.item.modifiers)) ? (
                    <Text style={styles.itemMods}>{resumenModificadores(leerModificadores(g.item.modifiers))}</Text>
                  ) : null}
                  {g.item.notes ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><Icono nombre="document-text-outline" size={12} color={colors.textMuted} /><Text style={[styles.itemNota, { marginLeft: 2 }]}>{g.item.notes}</Text></View> : null}
                </View>
                <Text style={styles.itemQty}>×{g.item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatMoney(parseFloat(g.item.subtotal || 0), currency)}</Text>
                <TouchableOpacity style={styles.itemQuitar} disabled={quitando} onPress={() => quitarRenglonMesa(g.item, null)}>
                  <Icono nombre="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            {(!ordenActiva?.items || ordenActiva.items.length === 0) && (
              <Text style={styles.emptyItems}>Sin productos aún</Text>
            )}
            </View>
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
              <Icono nombre="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.btnSecText}>Agregar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCobrar} onPress={abrirCobrar}>
              <Icono nombre="cash-outline" size={18} color="#fff" />
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <Icono nombre="search-outline" size={16} color={colors.textMuted} />
            <TextInput style={styles.searchInput} value={busquedaP} onChangeText={setBusquedaP} placeholder="Buscar producto..." placeholderTextColor={colors.textMuted} />
          </View>
          {/* PROMOS (PLAN_OFERTAS_V1): solo las activas AHORA, arriba. */}
          {!loadingProductos && promosActivasMesa.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm }}>
              {promosActivasMesa.map(p => (
                <TouchableOpacity key={p.id} style={styles.promoChip} onPress={() => setHojaPromo(p)}>
                  <View style={styles.promoChipFila}>
                    <Icono nombre="regalo" size={15} color={tonos.lila.icono} />
                    <Text style={styles.promoChipNombre} numberOfLines={1}>{p.name}</Text>
                  </View>
                  <Text style={styles.promoChipSub} numberOfLines={1}>{textoHuecos(p, productos, categoriasMesa)} · {textoCobro(p, currency)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {promosEnCarrito.map(([clave, e]) => (
            <View key={clave} style={styles.promoEnCarrito}>
              <Icono nombre="regalo" size={16} color={tonos.lila.icono} />
              <Text style={styles.promoEnCarritoTexto} numberOfLines={2}>
                {e.renglon.nombre}: {e.renglon.productos.map(p => p.nombre).join(', ')} · {formatMoney(e.renglon.precio, currency)}
              </Text>
              <TouchableOpacity onPress={() => quitarPromoDelCarrito(clave)}>
                <Icono nombre="close-circle" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
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
                  .filter(e => e.producto && e.producto.id === item.id)
                  .reduce((s, e) => s + e.qty, 0);
                const recipeStock = stockMap ? stockMap[item.id] : undefined;
                const rawStock = recipeStock !== undefined ? recipeStock : (item.stock ?? null);
                const stock = rawStock !== null ? Math.max(0, rawStock) : null;
                let stockEl = null;
                if (mostrarStock && stock !== null) {
                  if (stock === 0) {
                    stockEl = <Text style={styles.stockAgotado}>Sin stock</Text>;
                  } else if (stock <= 3) {
                    stockEl = <View style={styles.stockPocoFila}><SvgIcon name="triangle-alert" size={11} color={zc.ambar} /><Text style={styles.stockPoco}>{stock} disp.</Text></View>;
                  } else {
                    stockEl = <Text style={styles.stockHay}>{stock} disp.</Text>;
                  }
                }
                return (
                  <View style={[styles.pCard, mostrarStock && stock === 0 && { opacity: 0.5 }]}>
                    <IconoProducto valor={item.emoji || 'svg:shopping-bag'} imagen={item.image} size={40} color={zc.gris} />
                    <Text style={styles.pName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.pPrice}>{formatMoney(parseFloat(item.price), currency)}</Text>
                    {stockEl}
                    {qty === 0 ? (
                      <TouchableOpacity style={styles.btnPlusSm} onPress={() => incrementar(item)}>
                        <Icono nombre="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => decrementar(item.id)}>
                          <Icono nombre="remove" size={14} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.qtyTxt}>{qty}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => incrementar(item)}>
                          <Icono nombre="add" size={14} color={colors.primary} />
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
          {/* La hoja de la promo va DENTRO del modal del catálogo, para que se
              dibuje encima de él y no detrás (igual que los extras). */}
          <HojaPromo
            visible={hojaPromo !== null}
            promo={hojaPromo}
            productos={productos}
            categorias={categoriasMesa}
            catalogoMods={catalogoMods}
            currency={currency}
            onCancel={() => setHojaPromo(null)}
            onConfirm={agregarPromoMesa}
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
              <Icono nombre="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
            <Text style={styles.cobrarMesa}>{mesaSel?.name}</Text>
            <Text style={styles.cobrarTotal}>{formatMoney(totalOrden, currency)}</Text>

            {/* Asignar cliente para puntos (opcional) */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Cliente para puntos <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(opcional)</Text></Text>
            {clienteSelec ? (
              <View style={styles.clienteSelecRow}>
                <Icono nombre="person-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.clienteSelecNombre} numberOfLines={1}>{clienteSelec.name}</Text>
                <TouchableOpacity onPress={() => { setClienteSelec(null); setBusqCliente(''); }}>
                  <Icono nombre="close-circle" size={20} color={colors.textMuted} />
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
                <Icono nombre={m.icon} size={20} color={metodoPago === m.key ? '#fff' : colors.textSecondary} />
                <Text style={[styles.metodoPagoText, metodoPago === m.key && { color: '#fff' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
            {/* DIVIDIR LA CUENTA (BLOQUE 10). Es lo que más se pide en una mesa:
                varios comensales que pagan cada quien lo suyo. Arranca cerrado
                para no estorbarle a la mesa que paga de una sola forma. */}
            <TouchableOpacity style={styles.dividirBtn} onPress={alternarDivision}>
              <Icono
                nombre={dividirCuenta ? 'close-circle-outline' : 'git-branch-outline'}
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
                          {u.promo ? '🎁 ' : ''}{u.nombre}{u.de > 1 ? ` · ${u.pieza} de ${u.de}` : ''}
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
                        <Icono nombre="close" size={16} color={colors.danger} />
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
                  <Icono nombre="close" size={24} color={colors.textSecondary} />
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

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };
const caja  = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  // Promos (PLAN_OFERTAS_V1) — el lila las distingue de los productos.
  itemPromo:           { backgroundColor: tonos.lila.fondo, borderRadius: radios.boton, paddingHorizontal: 10, borderBottomWidth: 0, marginVertical: 3 },
  itemPromoProd:       { fontSize: 12.5, color: zc.gris, marginTop: 1 },
  itemPromoAhorro:     { fontSize: 12.5, color: zc.verde, fontWeight: '500', marginTop: 2 },
  itemQuitar:          { padding: spacing.xs, marginLeft: spacing.xs },
  promoChip:           { maxWidth: 230, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: zc.tarjeta, ...sombra, elevation: 2 },
  promoChipFila:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  promoChipNombre:     { fontSize: 14, fontWeight: '500', color: zc.tinta, flexShrink: 1 },
  promoChipSub:        { fontSize: 12, color: tonos.lila.icono, marginTop: 2 },
  promoEnCarrito:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 14, marginBottom: 6, padding: 10, borderRadius: radios.boton, backgroundColor: tonos.lila.fondo },
  promoEnCarritoTexto: { flex: 1, fontSize: 13, color: zc.tinta },
  safe:             { flex: 1, backgroundColor: zc.fondo },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnAdd:           { backgroundColor: zc.azul, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sucursalEnCabecera: { marginTop: 12, marginHorizontal: -18 },

  leyenda:          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, marginTop: 14, marginBottom: 4 },
  leyendaItem:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaDot:       { width: 8, height: 8, borderRadius: 4 },
  leyendaTxt:       { fontSize: 13, color: zc.gris },
  leyendaCount:     { marginLeft: 'auto', fontSize: 13, color: zc.grisSuave },

  grid:             { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16 },

  // La mesa: tarjeta blanca que flota. El estado lo dice el puntito y la
  // pastilla, no el fondo entero (regla del diseño A).
  card:             { flex: 1, ...caja, padding: 14, minHeight: 130, position: 'relative' },
  cardLibre:        {},
  cardOcupada:      {},
  statusDot:        { width: 9, height: 9, borderRadius: 5, position: 'absolute', top: 14, right: 14 },
  cardName:         { fontSize: 15.5, fontWeight: '500', color: zc.tinta, marginBottom: 1, paddingRight: 14 },
  cardZone:         { fontSize: 12.5, color: zc.grisSuave, marginBottom: 4 },
  cardTotal:        { fontSize: 20, fontWeight: '700', color: zc.tinta, marginTop: 4, fontVariant: ['tabular-nums'] },
  cardMeta:         { fontSize: 12.5, color: zc.grisSuave },
  cardTiempo:       { alignSelf: 'flex-start', fontSize: 12, color: zc.ambarTexto, backgroundColor: zc.ambarSuave, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 6, overflow: 'hidden' },
  cardLibreTag:     { marginTop: 8, alignSelf: 'flex-start', backgroundColor: zc.verdeSuave, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cardLibreText:    { fontSize: 12, fontWeight: '500', color: zc.verde },
  capacidadRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 8 },
  capacidadText:    { fontSize: 12.5, color: zc.grisSuave },

  emptyWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyTitle:       { fontSize: 16, fontWeight: '500', color: zc.gris },
  btnCrearVacio:    { marginTop: spacing.sm, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: zc.azul, borderRadius: radios.boton },
  btnCrearVacioText:{ color: '#fff', fontWeight: '500', fontSize: 15 },

  modalSafe:        { flex: 1, backgroundColor: zc.fondo },
  dragHandleWrap:   { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d5dae2' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  modalTitle:       { fontSize: 19, fontWeight: '500', color: zc.tinta },
  modalSub:         { fontSize: 13, color: zc.grisSuave, marginTop: 2 },

  fieldLabel:       { fontSize: 13, color: zc.gris, marginBottom: 6 },
  input:            { ...campo, padding: 12, fontSize: 16, color: zc.tinta, marginBottom: spacing.md },
  hint:             { fontSize: 12.5, color: zc.grisSuave, marginTop: -spacing.xs, marginBottom: spacing.md },

  // La cuenta: renglones dentro de una tarjeta blanca, con divisores casi invisibles.
  cuentaCaja:       { ...caja, paddingHorizontal: 14, paddingVertical: 4 },
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: zc.linea, gap: 10 },
  itemEmoji:        { fontSize: 22 },
  itemName:         { fontSize: 14, fontWeight: '500', color: zc.tinta },
  itemNota:         { fontSize: 12.5, color: zc.grisSuave },
  // Los extras van en ámbar: cambian el precio y lo que prepara la cocina.
  itemMods:         { fontSize: 12.5, color: zc.ambarTexto },
  itemQty:          { fontSize: 13.5, color: zc.gris },
  itemPrice:        { fontSize: 14, fontWeight: '700', color: zc.tinta, minWidth: 60, textAlign: 'right', fontVariant: ['tabular-nums'] },
  emptyItems:       { textAlign: 'center', color: zc.grisSuave, paddingVertical: spacing.xl },

  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, marginTop: spacing.sm },
  totalLabel:       { fontSize: 14, color: zc.gris },
  totalValue:       { fontSize: 24, fontWeight: '700', color: zc.tinta, fontVariant: ['tabular-nums'] },

  detalleFooter:    { flexDirection: 'row', padding: 16, gap: spacing.sm, backgroundColor: zc.tarjeta, borderTopLeftRadius: 18, borderTopRightRadius: 18, ...sombra, elevation: 10 },
  btnSec:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radios.boton, padding: 13, backgroundColor: zc.azulSuave },
  btnSecText:       { color: zc.azul, fontWeight: '500', fontSize: 14.5 },
  btnCobrar:        { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: zc.azul, borderRadius: radios.boton, padding: 13 },
  btnCobrarText:    { color: '#fff', fontWeight: '500', fontSize: 15 },

  searchWrap:       { flexDirection: 'row', alignItems: 'center', margin: 14, marginBottom: 8, ...campo, paddingHorizontal: 12, gap: 6 },
  searchInput:      { flex: 1, paddingVertical: 10, fontSize: 14.5, color: zc.tinta },

  pCard:            { flex: 1, ...caja, padding: 12, alignItems: 'center' },
  pEmoji:           { fontSize: 28, marginBottom: spacing.xs },
  pName:            { fontSize: 13.5, fontWeight: '500', color: zc.tinta, textAlign: 'center', marginTop: 6, marginBottom: 2 },
  pPrice:           { fontSize: 14.5, fontWeight: '700', color: zc.azul, marginBottom: 6 },
  stockAgotado:     { fontSize: 11.5, color: zc.ambarTexto, backgroundColor: zc.ambarSuave, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 4, overflow: 'hidden' },
  stockPocoFila:    { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  stockPoco:        { fontSize: 11.5, color: zc.ambarTexto },
  stockHay:         { fontSize: 11.5, color: zc.grisSuave, marginBottom: 4 },
  btnPlusSm:        { backgroundColor: zc.azul, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:           { width: 28, height: 28, borderRadius: 14, backgroundColor: zc.azulSuave, alignItems: 'center', justifyContent: 'center' },
  qtyTxt:           { fontSize: 15, fontWeight: '700', color: zc.tinta, minWidth: 18, textAlign: 'center' },
  agregarFooter:    { padding: 16, backgroundColor: zc.tarjeta, borderTopLeftRadius: 18, borderTopRightRadius: 18, ...sombra, elevation: 10 },

  clienteSelecRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: zc.azulSuave, borderRadius: radios.boton, padding: 12, marginBottom: spacing.md },
  clienteSelecNombre: { flex: 1, fontSize: 14.5, fontWeight: '500', color: zc.azul },
  sugerenciasBox:   { ...caja, borderRadius: radios.boton, marginTop: -spacing.xs, marginBottom: spacing.md, overflow: 'hidden' },
  sugerenciaItem:   { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: zc.linea },
  sugerenciaNombre: { fontSize: 14, fontWeight: '500', color: zc.tinta },
  sugerenciaTel:    { fontSize: 12.5, color: zc.grisSuave, marginTop: 2 },

  cobrarMesa:       { fontSize: 14, color: zc.gris, textAlign: 'center', marginBottom: 2 },
  cobrarTotal:      { fontSize: 40, fontWeight: '700', letterSpacing: -0.5, color: zc.tinta, textAlign: 'center', marginBottom: spacing.md, fontVariant: ['tabular-nums'] },
  // ── Dividir la cuenta (BLOQUE 10) ─────────────────────────────────────────
  dividirBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, marginTop: 4, borderRadius: radios.boton, backgroundColor: zc.azulSuave },
  dividirBtnText:    { fontSize: 14, fontWeight: '500', color: zc.azul },
  pagosBox:          { ...caja, padding: 14, marginTop: 10 },
  pagosHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  pagosTitulo:       { fontSize: 15, fontWeight: '500', color: zc.tinta },
  pagosFaltante:     { fontSize: 13.5, fontWeight: '500', color: zc.azul },
  divisionTabs:      { flexDirection: 'row', gap: 6, marginBottom: 10 },
  divisionTab:       { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radios.chip, backgroundColor: zc.fondo },
  divisionTabActive: { backgroundColor: zc.noche },
  divisionTabText:   { fontSize: 13, color: zc.gris },
  divisionAyuda:     { fontSize: 12.5, color: zc.grisSuave, marginBottom: 10 },
  divisionItemRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: spacing.sm },
  divisionItemNombre:{ flex: 1, fontSize: 13, color: zc.tinta },
  divisionItemPagos: { flexDirection: 'row', gap: 4 },
  divisionItemChip:  { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: zc.fondo },
  divisionItemChipActive: { backgroundColor: zc.noche },
  divisionItemChipText: { fontSize: 12.5, color: zc.gris },
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
  pagoIndice:        { fontSize: 12.5, color: zc.gris, minWidth: 46 },
  pagoMontoFijo:     { flex: 1, fontSize: 14, fontWeight: '700', color: zc.tinta, textAlign: 'right', fontVariant: ['tabular-nums'] },
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
  propinaBox:        { ...caja, padding: 14, marginTop: 14 },
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

  metodoPagoBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, ...caja, borderRadius: radios.boton, padding: 13, marginBottom: 8 },
  metodoPagoBtnActive: { backgroundColor: zc.noche },
  metodoPagoText:   { fontSize: 15, fontWeight: '500', color: zc.tinta },

  btnPrimary:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: zc.azul, borderRadius: radios.boton, padding: 14 },
  btnPrimaryText:   { color: '#fff', fontWeight: '500', fontSize: 16 },
  btnDisabled:      { opacity: 0.6 },

  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: zc.noche,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radios.chip,
    ...sombra,
    elevation: 6,
  },
  toastText: { color: '#fff', fontWeight: '500', fontSize: 14.5 },
});
