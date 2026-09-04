import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import {
  verificarPinPuesto, pinBloqueado, minutosBloqueoPin,
  registrarFalloPin, resetFallosPin,
} from '../../offline/credenciales';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { ventasParaMostrar } from '../../offline/ventasOffline';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import OfflineIndicator from '../../components/OfflineIndicator';
import SelectorSucursal from '../../components/SelectorSucursal';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { resumenModificadores, leerModificadores } from '../../utils/modificadores';
import { imprimirTicketPedido } from '../../utils/imprimirTicket';

const ESTADOS = [
  { key: null,         label: 'Todos' },
  { key: 'registrado', label: 'Registrados' },
  { key: 'completado', label: 'Completados' },
  { key: 'entregado',  label: 'Entregados' },
  { key: 'cancelado',  label: 'Cancelados' },
];

const ESTADO_COLOR = {
  registrado: colors.warning,
  completado: colors.primary,
  entregado:  colors.success,
  cancelado:  colors.danger,
  'por subir': '#f59e0b',   // venta offline aún no sincronizada
  error:       colors.danger,
};

const PAGO_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const PAGO_ICON  = { efectivo: 'cash-outline', tarjeta: 'card-outline', transferencia: 'phone-portrait-outline' };

function PedidoCard({ pedido, onCambiarEstado, onReimprimir, currency }) {
  const fecha = new Date(pedido.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const color = ESTADO_COLOR[pedido.status] || colors.textMuted;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          {pedido._offline ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="cloud-upload-outline" size={13} color="#f59e0b" />
              <Text style={[styles.pedidoId, { color: '#b45309' }]}>Sin subir</Text>
            </View>
          ) : (
            <Text style={styles.pedidoId}>#{pedido.id}</Text>
          )}
          <View style={styles.pedidoFechaRow}>
            <Text style={styles.pedidoFecha}>{fecha} · </Text>
            <Ionicons name={PAGO_ICON[pedido.payment_method] || 'cash-outline'} size={12} color={colors.textMuted} />
            <Text style={styles.pedidoFecha}> {PAGO_LABEL[pedido.payment_method] || pedido.payment_method}</Text>
          </View>
        </View>
        <View>
          <View style={[styles.badge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.badgeText, { color }]}>{pedido.status}</Text>
          </View>
          <Text style={styles.pedidoTotal}>{formatMoney(parseFloat(pedido.total), currency)}</Text>
        </View>
      </View>

      {pedido.table && (
        <View style={styles.clienteRow}>
          <Ionicons name="grid-outline" size={13} color={colors.primary} />
          <Text style={[styles.cliente, { color: colors.primary }]}> {pedido.table.name}</Text>
        </View>
      )}
      {pedido.customer && (
        <View style={styles.clienteRow}>
          <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.cliente}> {pedido.customer.name}</Text>
        </View>
      )}

      {pedido.items?.length > 0 && (
        <View style={styles.items}>
          {pedido.items.map(item => (
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

      {pedido.status === 'registrado' && (
        <View style={styles.acciones}>
          <TouchableOpacity
            style={[styles.accionBtn, { backgroundColor: colors.primary }]}
            onPress={() => onCambiarEstado(pedido.id, 'completado')}
          >
            <Text style={styles.accionBtnText}>Completar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accionBtn, { backgroundColor: colors.danger }]}
            onPress={() => onCambiarEstado(pedido.id, 'cancelado')}
          >
            <Text style={styles.accionBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      {pedido.status === 'completado' && (
        <TouchableOpacity
          style={[styles.accionBtn, { backgroundColor: colors.success, alignSelf: 'flex-start', marginTop: spacing.sm }]}
          onPress={() => onCambiarEstado(pedido.id, 'entregado')}
        >
          <Text style={styles.accionBtnText}>Marcar entregado</Text>
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
          <Ionicons name="print-outline" size={14} color={colors.textSecondary} />
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
    let completo = pedido;
    try {
      if (!pedido.items || pedido.items.length === 0) {
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
    <SafeAreaView style={styles.safe}>
      <View style={[styles.header, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <LogoTitle title="Pedidos" titleStyle={styles.title} />
        <OfflineIndicator />
      </View>

      {/* Ver los pedidos de otra sucursal (solo lectura) */}
      <SelectorSucursal value={sucursalVista} onChange={setSucursalVista} />

      {/* Filtros — ScrollView (no FlatList) con flexGrow:0 para que la fila no se
          estire verticalmente. minHeight + alignItems:center dan aire arriba/abajo
          para que el borde redondeado del chip no se recorte. */}
      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center', minHeight: 48 }}
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
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pedidoId: { fontSize: font.md, fontWeight: '800', color: colors.textPrimary },
  pedidoFechaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pedidoFecha: { fontSize: font.sm - 1, color: colors.textMuted },
  pedidoTotal: { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary, textAlign: 'right', marginTop: 4 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-end' },
  badgeText: { fontSize: font.sm - 2, fontWeight: '700', textTransform: 'uppercase' },
  clienteRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  cliente: { fontSize: font.sm, color: colors.textSecondary },
  items: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  itemText: { fontSize: font.sm - 1, color: colors.textSecondary },
  // Los extras van en ámbar: cambian el precio y lo que prepara la cocina.
  itemMods: { fontSize: font.sm - 2, color: '#b45309', fontWeight: '600' },
  btnReimprimir: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: spacing.sm, paddingVertical: 4,
  },
  btnReimprimirText: { fontSize: font.sm - 1, color: colors.textSecondary },
  acciones: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  accionBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  accionBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, fontSize: font.md },
  // Modal de PIN
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  modalTitle: { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  modalMsg: { fontSize: font.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 20 },
  pinInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.xl, textAlign: 'center', letterSpacing: 8, color: colors.textPrimary, backgroundColor: colors.background, marginBottom: spacing.sm },
  pinInputError: { borderColor: colors.danger },
  pinErrorText: { color: colors.danger, fontSize: font.sm - 1, textAlign: 'center', marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: font.sm },
  modalBtnConfirm: { backgroundColor: colors.danger },
  modalBtnConfirmText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
});
