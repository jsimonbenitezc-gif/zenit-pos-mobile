/**
 * Zenit POS — Pantalla de Cocina (KDS)
 *
 * Muestra los pedidos pendientes en tiempo real para el personal de cocina.
 * Se auto-actualiza cada 30 segundos. Tema oscuro para uso en cocinas.
 *
 * Codificación de colores:
 *  - Índigo (#818cf8)  — pedido reciente (< 10 min)
 *  - Ámbar  (#f59e0b)  — pedido con espera (10-20 min)
 *  - Rojo   (#ef4444)  — pedido urgente (> 20 min)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { zc, radios, sombra } from '../../theme';
import { Cabecera, Icono, IconoEnCuadro } from '../../components/ui';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import { accionAlCompletar, comandasVisibles, agregarOculta, leerOcultas } from '../../utils/cocina';

const CLAVE_OCULTAS = 'kds_ocultas';

const KDS_WEB_BASE = 'https://zenit-pos-backend.onrender.com/kds';

// ─── Colores del KDS (diseño A: la misma piel que el resto de la app) ────────

const KDS = {
  bg:        zc.fondo,
  card:      zc.tarjeta,
  border:    zc.linea,
  text:      zc.tinta,
  textSub:   zc.gris,
  indigo:    zc.azul,
  amber:     zc.ambar,
  red:       zc.rojo,
  green:     zc.verde,
  greenDark: zc.verdeSuave,
};

// El fondo suave de la pastilla del tiempo, según su color.
const FONDO_TIEMPO = { [zc.azul]: zc.azulSuave, [zc.ambar]: zc.ambarSuave, [zc.rojo]: zc.rojoSuave };

const TIPO_LABEL = {
  comer:     'Comer aquí',
  local:     'Comer aquí',
  llevar:    'Para llevar',
  domicilio: 'Domicilio',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutosDesde(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

function colorPorTiempo(minutos) {
  if (minutos >= 20) return KDS.red;
  if (minutos >= 10) return KDS.amber;
  return KDS.indigo;
}

function formatMinutos(min) {
  if (min < 1)  return 'Ahora';
  if (min === 1) return '1 min';
  return `${min} min`;
}

// ─── Componente: Tarjeta de pedido ───────────────────────────────────────────

function OrderCard({ order, onComplete }) {
  const min     = minutosDesde(order.createdAt);
  const color   = colorPorTiempo(min);
  const tableName = order.table?.name;
  const tipo    = order.order_type ? (TIPO_LABEL[order.order_type] || order.order_type) : null;
  const badge   = tableName ? tableName : (tipo || 'Mostrador');
  const badgeIcon = tableName ? 'grid-outline' : 'storefront-outline';

  return (
    <View style={styles.card}>
      {/* Header de la tarjeta */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardOrderId}>#{order.id}</Text>
        <View style={styles.cardHeaderRight}>
          <Text style={[styles.cardTime, { color, backgroundColor: FONDO_TIEMPO[color] }]}>{formatMinutos(min)}</Text>
        </View>
      </View>

      {/* Badge de mesa / tipo */}
      <View style={styles.badge}>
        <Icono nombre={badgeIcon} size={13} color={zc.gris} />
        <Text style={styles.badgeText}> {badge}</Text>
      </View>

      {/* Cajero */}
      {order.cashier ? (
        <View style={styles.cashierRow}>
          <Icono nombre="person-outline" size={12} color={KDS.textSub} />
          <Text style={styles.cardCashier}> {order.cashier}</Text>
        </View>
      ) : null}

      {/* Productos */}
      <View style={styles.itemsList}>
        {(order.items || []).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.quantity}×</Text>
            <Text style={styles.itemName}>{item.product?.name || `Producto ${item.product_id}`}</Text>
          </View>
        ))}
      </View>

      {/* Notas */}
      {order.notes ? (
        <View style={styles.notesBox}>
          <Icono nombre="create-outline" size={13} color={KDS.amber} />
          <Text style={styles.notesText}> {order.notes}</Text>
        </View>
      ) : null}

      {/* Botón completar */}
      <TouchableOpacity
        style={styles.btnComplete}
        onPress={() => onComplete(order)}
        activeOpacity={0.7}
      >
        <Text style={styles.btnCompleteText}>Completado</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function KDSScreen({ navigation }) {
  const { sucursalId } = useAuth();
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [showQR, setShowQR]       = useState(false);
  const [qrUrl, setQrUrl]         = useState(null);
  const [qrError, setQrError]     = useState(null);
  const [codigoPair, setCodigoPair] = useState(null);
  const intervalRef = useRef(null);
  // Comandas de MESA que la cocina ya terminó. Solo se esconden aquí: la mesa
  // sigue abierta hasta que se cobra (utils/cocina.js). Se guardan en el equipo
  // para que no vuelvan a salir al reabrir la pantalla.
  const [ocultas, setOcultas] = useState([]);
  useEffect(() => {
    SecureStore.getItemAsync(CLAVE_OCULTAS).then((t) => setOcultas(leerOcultas(t))).catch(() => {});
  }, []);
  const visibles = comandasVisibles(orders, ocultas);

  // EL QR YA NO ES UNA CREDENCIAL (BLOQUE 13).
  //
  // Llevaba un token acotado de 12 h, y antes de eso el token de SESIÓN entero.
  // Aun acotado, el código ERA la llave: quien lo fotografiara veía la cocina
  // medio día y no había forma de cortarlo — solo esperar a que venciera.
  //
  // Ahora lleva un CÓDIGO DE EMPAREJAMIENTO de un solo uso que caduca en 10
  // minutos y cuyo único efecto es dejar la pantalla en "pendiente". Para que
  // vea un solo pedido hay que aprobarla con PIN desde
  // Ajustes → Pantallas de cocina, y revocarla corta el acceso al instante.
  //
  // El QR se dibuja aquí mismo, nunca con un servicio externo: pedírselo a
  // api.qrserver.com metía el código en los registros de un tercero.
  async function abrirQR() {
    setQrUrl(null);
    setQrError(null);
    setCodigoPair(null);
    setShowQR(true);
    try {
      const r = await api.crearCodigoKds(sucursalId ?? null);
      if (!r?.codigo) throw new Error('respuesta sin código de emparejamiento');
      setCodigoPair(r.codigo);
      // El backend arma la URL con su APP_URL; si no la tiene configurada
      // devuelve una ruta relativa, que dentro de un QR no lleva a ninguna parte.
      const absoluta = typeof r.url === 'string' && r.url.startsWith('http');
      setQrUrl(absoluta ? r.url : `${KDS_WEB_BASE}?pair=${encodeURIComponent(r.codigo)}`);
    } catch {
      setQrError('No se pudo generar el código. Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  // ── Carga de pedidos ────────────────────────────────────────────────────

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const params = { status: 'registrado', limit: 100 };
      if (sucursalId) params.branch_id = sucursalId;
      const data = await api.getOrders(params);
      const list = Array.isArray(data) ? data : (data?.data || data?.orders || data?.rows || []);
      setOrders(list);
      setLastUpdate(new Date());
    } catch {
      // Mantener los pedidos anteriores si falla la red
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    loadOrders();
    // Auto-refresh cada 30 segundos
    intervalRef.current = setInterval(() => loadOrders(), 30000);
    return () => clearInterval(intervalRef.current);
  }, [loadOrders]);

  // ── Marcar como completado ──────────────────────────────────────────────

  async function completarPedido(order) {
    // 🔴 Una comanda de MESA solo se esconde: mandar 'completado' cerraba la
    // mesa y la dejaba en el corte como efectivo que nadie cobró (§60.4). La de
    // mostrador sí se marca: esa venta ya está cobrada.
    if (accionAlCompletar(order) === 'ocultar') {
      setOcultas((prev) => {
        const nuevas = agregarOculta(prev, order.id);
        SecureStore.setItemAsync(CLAVE_OCULTAS, JSON.stringify(nuevas)).catch(() => {});
        return nuevas;
      });
      return;
    }
    // Quitar de la lista inmediatamente (optimista)
    setOrders(prev => prev.filter(o => o.id !== order.id));
    try {
      await api.updateOrderStatus(order.id, 'completado');
    } catch {
      // Si falla, recargar para recuperar estado real
      loadOrders();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hora = lastUpdate
    ? lastUpdate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Cabecera azul noche (diseño A) */}
      <Cabecera
        titulo="Pantalla de cocina"
        subtitulo={`${visibles.length > 0
          ? `${visibles.length} pedido${visibles.length !== 1 ? 's' : ''} pendiente${visibles.length !== 1 ? 's' : ''}`
          : 'Sin pedidos pendientes'} · ${hora}`}
        derecha={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.btnQR} onPress={abrirQR}>
              <Icono nombre="qr-code-outline" size={16} color={zc.enNoche} />
              <Text style={styles.btnQRText}>QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnClose} onPress={() => navigation.goBack()}>
              <Icono nombre="close" size={18} color={zc.enNoche} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Modal QR */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrBox}>
            <Text style={styles.qrTitle}>Agregar una pantalla de cocina</Text>
            <Text style={styles.qrSub}>
              Escanea con el dispositivo que va a mostrar la cocina. Después apruébalo
              en Ajustes → Pantallas de cocina; te va a pedir tu PIN.
            </Text>
            {qrUrl ? (
              <View style={styles.qrImage}>
                <QRCode value={qrUrl} size={200} backgroundColor="#fff" />
              </View>
            ) : qrError ? (
              <Text style={styles.qrError}>{qrError}</Text>
            ) : (
              <ActivityIndicator color={KDS.indigo} style={{ marginVertical: 40 }} />
            )}
            {codigoPair ? (
              <>
                <Text style={styles.qrCodigo}>{codigoPair}</Text>
                <Text style={styles.qrCaduca}>Dura 10 minutos y sirve una sola vez</Text>
              </>
            ) : null}
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setShowQR(false)}>
              <Text style={styles.qrCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Leyenda */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KDS.indigo }]} />
          <Text style={styles.legendText}>Nuevo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KDS.amber }]} />
          <Text style={styles.legendText}>+10 min</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KDS.red }]} />
          <Text style={styles.legendText}>+20 min</Text>
        </View>
      </View>

      {/* Contenido */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={KDS.indigo} size="large" />
          <Text style={[styles.headerSub, { marginTop: 12 }]}>Cargando pedidos...</Text>
        </View>
      ) : visibles.length === 0 ? (
        <View style={styles.center}>
          <IconoEnCuadro nombre="checkmark-circle-outline" tono="verde" size={64} />
          <Text style={styles.emptyTitle}>Todo listo</Text>
          <Text style={styles.emptySubtitle}>No hay pedidos pendientes</Text>
          <TouchableOpacity style={styles.btnRefresh} onPress={() => loadOrders(true)}>
            <Text style={styles.btnRefreshText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadOrders(true)}
              tintColor={KDS.indigo}
              colors={[KDS.indigo]}
            />
          }
        >
          {visibles.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onComplete={completarPedido}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}


const caja = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: zc.fondo },

  // Botones sobre la cabecera oscura
  btnClose:    { width: 36, height: 36, borderRadius: 18, backgroundColor: zc.vidrio, alignItems: 'center', justifyContent: 'center' },
  btnQR:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: zc.vidrio },
  btnQRText:   { fontSize: 13.5, color: zc.enNoche },
  headerSub:   { fontSize: 13, color: zc.grisSuave },

  // Modal QR
  qrOverlay:   { flex: 1, backgroundColor: 'rgba(17,24,39,0.6)', justifyContent: 'center', alignItems: 'center' },
  qrBox:       { ...caja, padding: 24, alignItems: 'center', width: 310 },
  qrTitle:     { fontSize: 17, fontWeight: '500', color: zc.tinta, textAlign: 'center', marginBottom: 6 },
  qrSub:       { fontSize: 13, color: zc.gris, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  qrImage:     { width: 220, height: 220, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: zc.linea },
  qrError:     { color: zc.rojo, textAlign: 'center', marginVertical: 40, paddingHorizontal: 12, lineHeight: 20 },
  qrCodigo:    { color: zc.tinta, fontSize: 24, fontWeight: '700', letterSpacing: 4, marginTop: 14 },
  qrCaduca:    { color: zc.grisSuave, fontSize: 12, marginTop: 4 },
  qrCloseBtn:  { marginTop: 20, backgroundColor: zc.fondo, borderRadius: radios.boton, paddingHorizontal: 32, paddingVertical: 11 },
  qrCloseBtnText: { color: zc.gris, fontWeight: '500' },

  // Leyenda
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12.5, color: zc.gris },

  // Grid de tarjetas
  grid: { padding: 14, gap: 12 },

  // Tarjeta: blanca que flota; el tiempo lo dice su pastilla de color
  card: { ...caja, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardOrderId:   { fontSize: 22, fontWeight: '700', color: zc.tinta },
  cardHeaderRight:{ alignItems: 'flex-end' },
  cardTime:      { fontSize: 13, fontWeight: '500', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radios.chip, overflow: 'hidden' },
  cashierRow:    { flexDirection: 'row', alignItems: 'center' },
  cardCashier:   { fontSize: 12.5, color: zc.gris },

  // Badge mesa/tipo
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: zc.fondo, borderRadius: radios.chip, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 12.5, color: zc.tinta },

  // Productos
  itemsList: { gap: 5, paddingTop: 4, borderTopWidth: 1, borderTopColor: zc.linea },
  itemRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 4 },
  itemQty:   { fontSize: 15, fontWeight: '700', color: zc.azul, minWidth: 26 },
  itemName:  { fontSize: 15, color: zc.tinta, flex: 1 },

  // Notas
  notesBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: zc.ambarSuave, borderRadius: radios.boton, padding: 10 },
  notesText: { fontSize: 13, color: zc.ambarTexto, flex: 1 },

  // Botón completar
  btnComplete: { backgroundColor: zc.verdeSuave, borderRadius: radios.boton, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnCompleteText: { color: zc.verde, fontSize: 15, fontWeight: '500' },

  // Estados vacío / carga
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle:    { fontSize: 19, fontWeight: '500', color: zc.tinta, marginTop: 6 },
  emptySubtitle: { fontSize: 14, color: zc.grisSuave },
  btnRefresh: { marginTop: 16, backgroundColor: zc.azulSuave, borderRadius: radios.boton, paddingHorizontal: 24, paddingVertical: 11 },
  btnRefreshText: { color: zc.azul, fontWeight: '500' },
});
