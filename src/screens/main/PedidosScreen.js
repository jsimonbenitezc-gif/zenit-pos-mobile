import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import {
  verificarPinPuesto, pinBloqueado, minutosBloqueoPin,
  registrarFalloPin, resetFallosPin,
} from '../../offline/credenciales';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { ventasParaMostrar } from '../../offline/ventasOffline';
import { colors, spacing, radius, font, zc, tonos, radios, sombra } from '../../theme';
import { Cabecera, Icono } from '../../components/ui';
import OfflineIndicator from '../../components/OfflineIndicator';
import SelectorSucursal from '../../components/SelectorSucursal';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { resumenModificadores, leerModificadores } from '../../utils/modificadores';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';
import { agruparRenglones } from '../../utils/promos';

const ESTADOS = [
  { key: null,         label: 'Todos' },
  { key: 'registrado', label: 'Registrados' },
  { key: 'completado', label: 'Completados' },
  { key: 'entregado',  label: 'Entregados' },
  { key: 'cancelado',  label: 'Cancelados' },
];

// El estado se pinta con los tonos del diseño A (pastel con el texto fuerte).
const ESTADO_TONO = {
  registrado: 'ambar',
  completado: 'azul',
  entregado:  'verde',
  cancelado:  'rojo',
  'por subir': 'ambar',   // venta offline aún no sincronizada
  error:       'rojo',
};

// 'multiple' = la cuenta se dividió entre varios métodos (§31). Salía tal cual.
const PAGO_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', multiple: 'Pago dividido' };
const PAGO_ICON  = { efectivo: 'cash-outline', tarjeta: 'card-outline', transferencia: 'phone-portrait-outline', multiple: 'git-branch-outline' };

function PedidoCard({ pedido, onCambiarEstado, onReimprimir, currency }) {
  const fecha = new Date(pedido.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const tono = tonos[ESTADO_TONO[pedido.status]] || tonos.gris;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          {pedido._offline ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icono nombre="cloud-upload-outline" size={14} color={zc.ambar} />
              <Text style={styles.sinSubir}>Sin subir</Text>
            </View>
          ) : (
            <Text style={styles.pedidoId}>#{pedido.id}</Text>
          )}
          <View style={styles.pedidoFechaRow}>
            <Text style={styles.pedidoFecha}>{fecha} · </Text>
            <Icono nombre={PAGO_ICON[pedido.payment_method] || 'cash-outline'} size={13} color={zc.grisSuave} />
            <Text style={styles.pedidoFecha}> {PAGO_LABEL[pedido.payment_method] || pedido.payment_method}</Text>
          </View>
        </View>
        <View>
          <View style={[styles.badge, { backgroundColor: tono.fondo }]}>
            <Text style={[styles.badgeText, { color: tono.icono }]}>{pedido.status}</Text>
          </View>
          <Text style={styles.pedidoTotal}>{formatMoney(parseFloat(pedido.total), currency)}</Text>
        </View>
      </View>

      {pedido.table && (
        <View style={styles.clienteRow}>
          <Icono nombre="grid-outline" size={14} color={zc.azul} />
          <Text style={[styles.cliente, { color: zc.azul }]}> {pedido.table.name}</Text>
        </View>
      )}
      {pedido.customer && (
        <View style={styles.clienteRow}>
          <Icono nombre="person-outline" size={14} color={zc.gris} />
          <Text style={styles.cliente}> {pedido.customer.name}</Text>
        </View>
      )}

      {pedido.items?.length > 0 && (
        <View style={styles.items}>
          {/* Una PROMO se enseña junta, como se vendió (PLAN_OFERTAS_V1). */}
          {agruparRenglones(pedido.items).filter(g => g.promo).map(g => (
            <View key={g.promo.grupo} style={styles.itemPromoFila}>
              <Icono nombre="regalo" size={14} color={tonos.lila.icono} style={{ marginTop: 2 }} />
              <Text style={[styles.itemText, { flex: 1 }]}>
                1× {g.promo.nombre}: {g.items.map(it => it.product?.name || 'Producto').join(', ')}
              </Text>
            </View>
          ))}
          {pedido.items.filter(item => !item.promo_group).map(item => (
            <View key={item.id}>
              <Text style={styles.itemText}>
                {item.quantity}× {item.product?.name || 'Producto'}
              </Text>
              {/* Extras del renglón (BLOQUE 11). El precio del renglón ya los
                  incluye, así que van como detalle y no como cargo aparte. */}
              {resumenModificadores(leerModificadores(item.modifiers)) ? (
                <Text style={styles.itemMods}>   {resumenModificadores(leerModificadores(item.modifiers))}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* 🔴 UNA VENTA LOCAL NO CAMBIA DE ESTADO.
          Estos tres botones llaman al backend, y una venta del MODO LOCAL
          (`_local`) pertenece a un negocio SIN cuenta: la llamada vuelve con 401
          y hasta el arreglo de hoy expulsaba al usuario con "Sesión expirada".
          Un pedido local nace ya `completado` —se cobró y se cerró en el
          momento—, así que era "Marcar entregado" el que salía en pantalla y el
          que rompía. Aquí el historial es historial, igual que en el modo local
          del desktop: se puede consultar y reimprimir, no cambiar de estado. */}
      {!pedido._local && pedido.status === 'registrado' && (
        <View style={styles.acciones}>
          <TouchableOpacity
            style={[styles.accionBtn, styles.accionCompletar]}
            onPress={() => onCambiarEstado(pedido.id, 'completado')}
          >
            <Text style={styles.accionBtnText}>Completar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accionBtn, styles.accionCancelar]}
            onPress={() => onCambiarEstado(pedido.id, 'cancelado')}
          >
            <Text style={[styles.accionBtnText, styles.accionCancelarText]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      {!pedido._local && pedido.status === 'completado' && (
        <TouchableOpacity
          style={[styles.accionBtn, styles.accionEntregar]}
          onPress={() => onCambiarEstado(pedido.id, 'entregado')}
        >
          <Text style={[styles.accionBtnText, styles.accionEntregarText]}>Marcar entregado</Text>
        </TouchableOpacity>
      )}

      {/* Reimprimir (BLOQUE 11, deuda §12.7). Un ticket se pierde, se moja o el
          cliente lo pide después: hasta ahora el celular no tenía cómo volver a
          sacarlo. No aparece en las ventas que aún no han subido: sin folio ni
          desglose del servidor, ese papel no sería el mismo. */}
      {!pedido._offline && (
        <TouchableOpacity
          style={styles.btnReimprimir}
          onPress={() => onReimprimir(pedido)}
        >
          <Icono nombre="print-outline" size={15} color={zc.gris} />
          <Text style={styles.btnReimprimirText}>Reimprimir ticket</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const PAGE_SIZE = 30;

export default function PedidosScreen() {
  const { settings, sucursalId, nombreActivo, rolActivo, permisosRolesEfectivos, modoLocal } = useAuth();
  const { online } = useNetwork();
  const currency = settings?.currency_symbol || '$';
  const prevOnline = useRef(true);
  const [pedidos, setPedidos]       = useState([]);
  const [filtro, setFiltro]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const pageRef = useRef(1);
  // Sucursal que se está MIRANDO (por defecto la del equipo). Solo lectura.
  const [sucursalVista, setSucursalVista] = useState(sucursalId || null);
  useEffect(() => { setSucursalVista(sucursalId || null); }, [sucursalId]);

  // Estado del modal de PIN para cancelación
  const [pinModal, setPinModal]         = useState({ visible: false, pedidoId: null });
  const [pinValue, setPinValue]         = useState('');
  const [pinError, setPinError]         = useState('');
  const [pinLoading, setPinLoading]     = useState(false);
  const pinInputRef = useRef(null);

  /**
   * Reimprime el ticket de un pedido (BLOQUE 11, deuda §12.7).
   *
   * A diferencia del ticket que sale al cobrar —donde el silencio es lo
   * correcto—, aquí el usuario PIDIÓ el papel explícitamente: si no sale, hay
   * que decirle por qué. Un fallo sigue sin romper nada: la función no lanza.
   */
  async function reimprimirTicket(pedido) {
    // El listado no trae los items completos de todos los pedidos; se pide el
    // detalle para que el papel salga igual que el original.
    // Una venta LOCAL ya trae sus items (`listarPedidosLocales` los incluye) y no
    // existe en ningún servidor: pedirla al backend daría 401. Se imprime con lo
    // que hay, que es todo.
    let completo = pedido;
    try {
      if (!pedido._local && (!pedido.items || pedido.items.length === 0)) {
        completo = await api.getOrder(pedido.id);
      }
    } catch { /* se imprime con lo que hay */ }

    const r = await imprimirTicketPedido(completo, settings, { cashier: nombreActivo });
    if (r.ok) return;
    const MOTIVOS = {
      no_disponible: 'Esta versión de la app no puede imprimir. Instala el APK con soporte de impresora.',
      sin_impresora: 'No hay una impresora configurada. Ve a Ajustes → Impresora.',
      error_impresora: 'No se pudo conectar con la impresora. Revisa que esté encendida y en alcance.',
    };
    Alert.alert('No se imprimió', MOTIVOS[r.motivo] || 'No se pudo imprimir el ticket.');
  }

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    pageRef.current = 1;
    // Ventas que no vienen del backend. Con cuenta son las encoladas ("por
    // subir"); en MODO LOCAL son TODAS las del negocio. Solo se muestran en
    // "Todos": no tienen el estado que usa el filtro del backend.
    const offline = filtro ? [] : await ventasParaMostrar().catch(() => []);
    // MODO LOCAL (BLOQUE 18): no hay servidor al que pedirle el historial —
    // las ventas locales SON el historial completo. Se pinta y se termina.
    if (modoLocal) {
      setPedidos(offline);
      setHasMore(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const params = { limit: PAGE_SIZE, page: 1 };
      if (filtro) params.status = filtro;
      if (sucursalVista) params.branch_id = sucursalVista;
      const data = await api.getOrders(params);
      const rows = data.data || [];
      setPedidos([...offline, ...rows]);   // ventas offline (recientes) arriba
      setHasMore(rows.length >= PAGE_SIZE);
    } catch (e) {
      // Sin conexión: mostrar al menos las ventas offline pendientes, sin alertar.
      setPedidos(offline);
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filtro, sucursalVista, modoLocal]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const params = { limit: PAGE_SIZE, page: nextPage };
      if (filtro) params.status = filtro;
      if (sucursalVista) params.branch_id = sucursalVista;
      const data = await api.getOrders(params);
      const rows = data.data || [];
      setPedidos(prev => [...prev, ...rows]);
      pageRef.current = nextPage;
      setHasMore(rows.length >= PAGE_SIZE);
    } catch { /* silencioso — el usuario puede reintentar scrolleando */ }
    finally { setLoadingMore(false); }
  }, [filtro, sucursalId, loadingMore, hasMore]);

  useEffect(() => { load(); }, [load]);

  // Al reconectar, las ventas offline se suben (App onReconnect); refrescar para que
  // pasen de "Sin subir" a pedidos reales del backend. Pequeño retraso para dar tiempo al sync.
  useEffect(() => {
    if (online && !prevOnline.current) {
      const t = setTimeout(() => load(true), 2500);
      prevOnline.current = online;
      return () => clearTimeout(t);
    }
    prevOnline.current = online;
  }, [online, load]);

  async function cambiarEstado(id, status) {
    if (status === 'cancelado') {
      // Mostrar modal de PIN antes de cancelar
      setPinModal({ visible: true, pedidoId: id });
      setPinValue('');
      setPinError('');
      return;
    }
    try {
      await api.updateOrderStatus(id, status);
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    }
  }

  async function confirmarCancelacion() {
    if (!pinValue) { setPinError('Ingresa tu PIN'); return; }
    if (pinBloqueado()) {
      setPinError(`Demasiados intentos. Espera ${minutosBloqueoPin()} min.`);
      return;
    }
    setPinLoading(true);
    setPinError('');
    try {
      const perfilActual = permisosRolesEfectivos?.[rolActivo];
      if (perfilActual?.pin_set) {
        const result = await verificarPinPuesto(rolActivo, pinValue, permisosRolesEfectivos);
        if (!result.valido) {
          registrarFalloPin();
          setPinError(pinBloqueado() ? 'Demasiados intentos. Espera 5 min.' : 'PIN incorrecto');
          setPinLoading(false);
          return;
        }
        resetFallosPin();
      }

      // PIN válido: cancelar con auditoría.
      // El puesto va en `role` (no en `employee_id`, que espera el id numérico
      // de una cuenta). La verificación de arriba es local y da respuesta
      // inmediata; el backend la repite por su cuenta con el mismo PIN.
      await api.cancelOrderWithPin(pinModal.pedidoId, {
        role: rolActivo,
        pin: pinValue,
        employee_name: nombreActivo || '',
      });
      setPedidos(prev => prev.map(p => p.id === pinModal.pedidoId ? { ...p, status: 'cancelado' } : p));
      setPinModal({ visible: false, pedidoId: null });
    } catch (e) {
      setPinError(e.message || 'Error al verificar PIN');
    } finally {
      setPinLoading(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Cabecera azul noche (diseño A), con el selector de sucursal dentro */}
      <Cabecera titulo="Pedidos" derecha={<OfflineIndicator />}>
        {/* Ver los pedidos de otra sucursal (solo lectura) */}
        <View style={styles.sucursalEnCabecera}>
          <SelectorSucursal value={sucursalVista} onChange={setSucursalVista} enNoche />
        </View>
      </Cabecera>

      {/* Filtros — ScrollView (no FlatList) con flexGrow:0 para que la fila no se
          estire verticalmente. minHeight + alignItems:center dan aire arriba/abajo
          para que el borde redondeado del chip no se recorte. */}
      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: spacing.sm, alignItems: 'center', minHeight: 56 }}
      >
        {ESTADOS.map(item => (
          <TouchableOpacity
            key={String(item.key)}
            style={[styles.chip, filtro === item.key && styles.chipActive]}
            onPress={() => setFiltro(item.key)}
          >
            <Text style={[styles.chipText, filtro === item.key && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={pedidos}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={{ padding: 14, paddingTop: 10 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item }) => <PedidoCard pedido={item} onCambiarEstado={cambiarEstado} onReimprimir={reimprimirTicket} currency={currency} />}
        ListEmptyComponent={<Text style={styles.empty}>No hay pedidos con este filtro</Text>}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.md }} size="small" color={colors.primary} /> : null}
      />

      {/* Modal de PIN para cancelación */}
      <Modal
        visible={pinModal.visible}
        transparent
        animationType="fade"
        onShow={() => setTimeout(() => pinInputRef.current?.focus(), 100)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Autorización requerida</Text>
            <Text style={styles.modalMsg}>
              Cancelar pedido #{pinModal.pedidoId}.{'\n'}Esta acción quedará registrada.{'\n'}Ingresa tu PIN para confirmar.
            </Text>
            <TextInput
              ref={pinInputRef}
              style={[styles.pinInput, pinError ? styles.pinInputError : null]}
              placeholder="PIN"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={20}
              value={pinValue}
              onChangeText={v => { setPinValue(v); setPinError(''); }}
              onSubmitEditing={confirmarCancelacion}
            />
            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setPinModal({ visible: false, pedidoId: null })}
                disabled={pinLoading}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, pinLoading && { opacity: 0.6 }]}
                onPress={confirmarCancelacion}
                disabled={pinLoading}
              >
                {pinLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalBtnConfirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const caja = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: zc.fondo },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sucursalEnCabecera: { marginTop: 12, marginHorizontal: -18 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.tarjeta, elevation: 1, shadowColor: zc.noche, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  chipActive: { backgroundColor: zc.noche },
  chipText: { fontSize: 13.5, color: zc.gris },
  chipTextActive: { color: '#fff' },
  card: { ...caja, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pedidoId: { fontSize: 16, fontWeight: '700', color: zc.tinta },
  sinSubir: { fontSize: 14, fontWeight: '500', color: zc.ambarTexto },
  pedidoFechaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  pedidoFecha: { fontSize: 12.5, color: zc.grisSuave },
  pedidoTotal: { fontSize: 18, fontWeight: '700', color: zc.tinta, textAlign: 'right', marginTop: 6, fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-end' },
  badgeText: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  clienteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  cliente: { fontSize: 13.5, color: zc.gris },
  items: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: zc.linea, gap: 2 },
  itemText: { fontSize: 13.5, color: zc.tinta },
  itemPromoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  // Los extras van en ámbar: cambian el precio y lo que prepara la cocina.
  itemMods: { fontSize: 12.5, color: zc.ambarTexto },
  btnReimprimir: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 10, paddingVertical: 4,
  },
  btnReimprimirText: { fontSize: 13, color: zc.gris },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: 12 },
  accionBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radios.boton, alignItems: 'center' },
  accionBtnText: { color: '#fff', fontWeight: '500', fontSize: 14 },
  accionCompletar: { backgroundColor: zc.azul },
  accionCancelar: { backgroundColor: zc.rojoSuave },
  accionCancelarText: { color: zc.rojo },
  accionEntregar: { backgroundColor: zc.verdeSuave, alignSelf: 'flex-start', marginTop: 12 },
  accionEntregarText: { color: zc.verde },
  empty: { textAlign: 'center', color: zc.grisSuave, marginTop: spacing.xxl, fontSize: 14.5 },
  // Modal de PIN
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalBox: { ...caja, padding: 22, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 18, fontWeight: '500', color: zc.tinta, marginBottom: spacing.sm, textAlign: 'center' },
  modalMsg: { fontSize: 13.5, color: zc.gris, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
  pinInput: { borderWidth: 1.5, borderColor: zc.linea, borderRadius: radios.boton, padding: 12, fontSize: 18, textAlign: 'center', letterSpacing: 6, color: zc.tinta, backgroundColor: zc.fondo, marginBottom: spacing.sm },
  pinInputError: { borderColor: zc.rojo },
  pinErrorText: { color: zc.rojo, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalBtn: { flex: 1, padding: 13, borderRadius: radios.boton, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: zc.fondo },
  modalBtnCancelText: { color: zc.gris, fontWeight: '500', fontSize: 14 },
  modalBtnConfirm: { backgroundColor: zc.rojo },
  modalBtnConfirmText: { color: '#fff', fontWeight: '500', fontSize: 14 },
});
