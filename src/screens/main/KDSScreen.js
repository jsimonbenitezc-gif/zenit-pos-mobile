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
  ActivityIndicator, RefreshControl, StatusBar, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../api/client';

const KDS_WEB_BASE = 'https://zenit-pos-backend.onrender.com/kds';

// ─── Colores del KDS (tema oscuro) ───────────────────────────────────────────

const KDS = {
  bg:        '#111827',
  card:      '#1f2937',
  border:    '#374151',
  text:      '#f9fafb',
  textSub:   '#9ca3af',
  indigo:    '#818cf8',
  amber:     '#f59e0b',
  red:       '#ef4444',
  green:     '#10b981',
  greenDark: '#065f46',
};

const TIPO_LABEL = {
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
  const tableName = order.Table?.name;
  const tipo    = order.order_type ? (TIPO_LABEL[order.order_type] || order.order_type) : null;
  const badge   = tableName ? tableName : (tipo || 'Mostrador');
  const badgeIcon = tableName ? 'grid-outline' : 'storefront-outline';

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      {/* Header de la tarjeta */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardOrderId}>#{order.id}</Text>
        <View style={styles.cardHeaderRight}>
          <Text style={[styles.cardTime, { color }]}>{formatMinutos(min)}</Text>
        </View>
      </View>

      {/* Badge de mesa / tipo */}
      <View style={[styles.badge, { borderColor: color }]}>
        <Ionicons name={badgeIcon} size={11} color={color} />
        <Text style={[styles.badgeText, { color }]}> {badge}</Text>
      </View>

      {/* Cajero */}
      {order.cashier ? (
        <View style={styles.cashierRow}>
          <Ionicons name="person-outline" size={12} color={KDS.textSub} />
          <Text style={styles.cardCashier}> {order.cashier}</Text>
        </View>
      ) : null}

      {/* Productos */}
      <View style={styles.itemsList}>
        {(order.OrderItems || []).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.quantity}×</Text>
            <Text style={styles.itemName}>{item.Product?.name || `Producto ${item.product_id}`}</Text>
          </View>
        ))}
      </View>

      {/* Notas */}
      {order.notes ? (
        <View style={styles.notesBox}>
          <Ionicons name="create-outline" size={13} color={KDS.amber} />
          <Text style={styles.notesText}> {order.notes}</Text>
        </View>
      ) : null}

      {/* Botón completar */}
      <TouchableOpacity
        style={styles.btnComplete}
        onPress={() => onComplete(order.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.btnCompleteText}>✓  Completado</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function KDSScreen({ navigation }) {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [showQR, setShowQR]       = useState(false);
  const [qrUrl, setQrUrl]         = useState(null);
  const intervalRef = useRef(null);

  async function abrirQR() {
    const token = await SecureStore.getItemAsync('zenit_token');
    if (!token) return;
    const kdsUrl = `${KDS_WEB_BASE}?token=${encodeURIComponent(token)}`;
    const qrSrc  = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(kdsUrl)}`;
    setQrUrl(qrSrc);
    setShowQR(true);
  }

  // ── Carga de pedidos ────────────────────────────────────────────────────

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getOrders({ status: 'registrado', limit: 100 });
      const list = Array.isArray(data) ? data : (data?.orders || data?.rows || []);
      setOrders(list);
      setLastUpdate(new Date());
    } catch {
      // Mantener los pedidos anteriores si falla la red
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    // Auto-refresh cada 30 segundos
    intervalRef.current = setInterval(() => loadOrders(), 30000);
    return () => clearInterval(intervalRef.current);
  }, [loadOrders]);

  // ── Marcar como completado ──────────────────────────────────────────────

  async function completarPedido(id) {
    // Quitar de la lista inmediatamente (optimista)
    setOrders(prev => prev.filter(o => o.id !== id));
    try {
      await api.updateOrderStatus(id, 'completado');
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={KDS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="restaurant-outline" size={18} color={KDS.text} />
            <Text style={styles.headerTitle}>Pantalla de Cocina</Text>
          </View>
          <Text style={styles.headerSub}>
            {orders.length > 0
              ? `${orders.length} pedido${orders.length !== 1 ? 's' : ''} pendiente${orders.length !== 1 ? 's' : ''}`
              : 'Sin pedidos pendientes'
            }
            {' · '}{hora}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.btnQR} onPress={abrirQR}>
            <Text style={styles.btnQRText}>⊞ QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnClose} onPress={() => navigation.goBack()}>
            <Text style={styles.btnCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal QR */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrBox}>
            <Text style={styles.qrTitle}>Abrir KDS en otro dispositivo</Text>
            <Text style={styles.qrSub}>Escanea con la cámara. La página se actualiza sola cada 15 segundos.</Text>
            {qrUrl ? (
              <Image source={{ uri: qrUrl }} style={styles.qrImage} />
            ) : (
              <ActivityIndicator color={KDS.indigo} style={{ marginVertical: 40 }} />
            )}
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
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={56} color={KDS.green} />
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
          {orders.map(order => (
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

// ─── Estilos (tema oscuro) ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: KDS.bg },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: KDS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: KDS.text },
  headerSub:   { fontSize: 12, color: KDS.textSub, marginTop: 2 },
  btnClose:    { padding: 8 },
  btnCloseText:{ fontSize: 18, color: KDS.textSub, fontWeight: '700' },
  btnQR:       { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: KDS.indigo, borderRadius: 8 },
  btnQRText:   { fontSize: 13, color: KDS.indigo, fontWeight: '700' },

  // Modal QR
  qrOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  qrBox:       { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, alignItems: 'center', width: 300, borderWidth: 1, borderColor: KDS.border },
  qrTitle:     { fontSize: 16, fontWeight: '800', color: KDS.text, textAlign: 'center', marginBottom: 6 },
  qrSub:       { fontSize: 12, color: KDS.textSub, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  qrImage:     { width: 220, height: 220, borderRadius: 10, backgroundColor: '#fff' },
  qrCloseBtn:  { marginTop: 20, borderWidth: 1, borderColor: KDS.border, borderRadius: 8, paddingHorizontal: 32, paddingVertical: 10 },
  qrCloseBtnText: { color: KDS.textSub, fontWeight: '700' },

  // Leyenda
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: KDS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: KDS.textSub },

  // Grid de tarjetas
  grid: { padding: 12, gap: 12 },

  // Tarjeta
  card: {
    backgroundColor: KDS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: KDS.border,
    borderLeftWidth: 4,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardOrderId:   { fontSize: 22, fontWeight: '800', color: KDS.text },
  cardHeaderRight:{ alignItems: 'flex-end' },
  cardTime:      { fontSize: 13, fontWeight: '700' },
  cashierRow:    { flexDirection: 'row', alignItems: 'center' },
  cardCashier:   { fontSize: 12, color: KDS.textSub },

  // Badge mesa/tipo
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // Productos
  itemsList: { gap: 4 },
  itemRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  itemQty:   { fontSize: 14, fontWeight: '800', color: KDS.indigo, minWidth: 24 },
  itemName:  { fontSize: 14, color: KDS.text, flex: 1 },

  // Notas
  notesBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#2d2009', borderRadius: 6, padding: 8 },
  notesText: { fontSize: 12, color: KDS.amber, flex: 1 },

  // Botón completar
  btnComplete: {
    backgroundColor: KDS.greenDark,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: KDS.green,
  },
  btnCompleteText: { color: KDS.green, fontSize: 14, fontWeight: '800' },

  // Estados vacío / carga
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle:    { fontSize: 20, fontWeight: '800', color: KDS.text },
  emptySubtitle: { fontSize: 14, color: KDS.textSub },
  btnRefresh: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: KDS.indigo,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  btnRefreshText: { color: KDS.indigo, fontWeight: '700' },
});
