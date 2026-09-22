import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import IconoProducto from '../../components/IconoProducto';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { zc, letra, espacios } from '../../theme';
import VerificacionBanner from '../../components/VerificacionBanner';
import SelectorSucursal from '../../components/SelectorSucursal';
import {
  Cabecera, FranjaSuperior, Tarjeta, Fila, IconoEnCuadro, Icono, NumeroGrande, Variacion,
  tonoPorColor,
} from '../../components/ui';
import { formatMoney, formatMoneyCompact } from '../../utils/money';
import { createSSE } from '../../utils/sse';
import { configImpuesto } from '../../utils/impuestos';

// Resumen con el diseño A de PLAN_REDISENO_V1 (Bloque 0). Mismos datos y mismos
// botones que antes: solo cambió cómo se ven. El guardián `npm run revisar:estilo`
// vigila que siga así.

const logo = require('../../../assets/logo.png');

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const fmtYAxis = (val, currency) => formatMoneyCompact(val, currency);

const fmt = (n, currency) => formatMoney(n, currency);

const fmtNum = (n) => (parseInt(n) || 0).toLocaleString('es-MX');

// ─── Gráfica de línea — últimos 7 días ───────────────────────────────────────
function LineChart7Days({ data, currency }) {
  const [w, setW] = useState(0);

  const CHART_H = 140;
  const PAD_TOP  = 12;
  const PAD_BOT  = 26;
  const PAD_LEFT = 44; // espacio para etiquetas del eje Y
  const PAD_RIGHT = 14; // que la etiqueta de "hoy" no se corte

  const chartH = CHART_H - PAD_TOP - PAD_BOT;
  const chartW = Math.max(w - PAD_LEFT - PAD_RIGHT, 0);

  // Construir array de 7 días completo (rellenar huecos con 0)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const found = (data || []).find((item) => item.fecha === dateStr);
    return {
      day: DAYS[d.getDay()],
      isToday: i === 6,
      monto: found ? parseFloat(found.monto) : 0,
    };
  });

  const maxVal = Math.max(...days.map((d) => d.monto), 1);

  const pts = days.map((d, i) => ({
    ...d,
    x: PAD_LEFT + (i / 6) * chartW,
    y: PAD_TOP + chartH - (d.monto / maxVal) * chartH,
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const fillPath =
    `${linePath}` +
    ` L${pts[6].x.toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}` +
    ` L${pts[0].x.toFixed(1)},${(PAD_TOP + chartH).toFixed(1)} Z`;

  // Posiciones Y de las guías
  const yMax = PAD_TOP;
  const yMid = PAD_TOP + chartH / 2;
  const yMin = PAD_TOP + chartH;
  const hoy = pts[6];
  // Sin ventas en la semana, el tope es un 1 de relleno: no se rotula.
  const sinVentas = days.every((d) => d.monto === 0);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={CHART_H}>
          <Defs>
            <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={zc.azul} stopOpacity="0.28" />
              <Stop offset="1" stopColor={zc.azul} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Líneas guía horizontales */}
          {[yMax, yMid, yMin].map((y, i) => (
            <Path key={i} d={`M${PAD_LEFT},${y} L${w - PAD_RIGHT},${y}`} stroke={zc.rejilla} strokeWidth="1" />
          ))}

          {/* Etiquetas eje Y */}
          {!sinVentas && <SvgText x={PAD_LEFT - 6} y={yMax + 4} textAnchor="end" fontSize="10" fill={zc.grisSuave}>{fmtYAxis(maxVal, currency)}</SvgText>}
          {!sinVentas && <SvgText x={PAD_LEFT - 6} y={yMid + 4} textAnchor="end" fontSize="10" fill={zc.grisSuave}>{fmtYAxis(maxVal / 2, currency)}</SvgText>}
          <SvgText x={PAD_LEFT - 6} y={yMin + 4} textAnchor="end" fontSize="10" fill={zc.grisSuave}>{fmtYAxis(0, currency)}</SvgText>

          {/* Área rellena y línea */}
          <Path d={fillPath} fill="url(#lineGrad)" />
          <Path d={linePath} fill="none" stroke={zc.azul} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

          {/* Solo el punto de hoy: es el que importa */}
          <Circle cx={hoy.x} cy={hoy.y} r={4.5} fill={zc.azul} stroke="#fff" strokeWidth="2" />

          {/* Etiquetas de día (eje X) */}
          {pts.map((p, i) => (
            <SvgText
              key={i}
              x={p.x}
              y={CHART_H - 6}
              textAnchor="middle"
              fontSize="10"
              fill={p.isToday ? zc.azul : zc.grisSuave}
              fontWeight={p.isToday ? '700' : '400'}
            >
              {p.isToday ? 'Hoy' : p.day}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

// ─── Gráfica de barras — actividad por hora ───────────────────────────────────
function HourlyChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.vacio}>
        <Icono nombre="reloj" size={18} color={zc.grisSuave} />
        <Text style={styles.vacioTxt}>Sin actividad registrada hoy</Text>
      </View>
    );
  }

  const sorted = [...data].sort((a, b) => parseInt(a.hora) - parseInt(b.hora));
  const minH = parseInt(sorted[0].hora);
  const maxH = parseInt(sorted[sorted.length - 1].hora);

  // Rellenar todas las horas del rango
  const fullRange = Array.from({ length: maxH - minH + 1 }, (_, i) => {
    const h = minH + i;
    const found = sorted.find((d) => parseInt(d.hora) === h);
    return {
      hora: h,
      pedidos: found ? parseInt(found.pedidos) : 0,
      monto: found ? parseFloat(found.monto) : 0,
    };
  });

  const maxPedidos = Math.max(...fullRange.map((d) => d.pedidos), 1);
  const BAR_MAX_H = 60;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.hourlyRow}>
        {fullRange.map((d, i) => {
          const barH = Math.max((d.pedidos / maxPedidos) * BAR_MAX_H, d.pedidos > 0 ? 4 : 2);
          return (
            <View key={i} style={styles.hourlyBarCol}>
              {d.pedidos > 0 ? (
                <Text style={styles.hourlyBarValue}>{d.pedidos}</Text>
              ) : null}
              <View
                style={[
                  styles.hourlyBar,
                  {
                    height: barH,
                    backgroundColor: d.pedidos > 0 ? zc.azul : zc.pistaSuave,
                  },
                ]}
              />
              <Text style={styles.hourlyBarLabel}>{`${d.hora}h`}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
const AUDIT_TIPOS = {
  cancel_order:         { icon: 'close-circle-outline', label: 'Pedido cancelado',       color: '#ef4444' },
  edit_customer:        { icon: 'person-outline',       label: 'Cliente editado',         color: '#f59e0b' },
  inventory_adjustment: { icon: 'cube-outline',         label: 'Ajuste de inventario',    color: '#3b82f6' },
  apply_discount:       { icon: 'pricetag-outline',     label: 'Descuento aplicado',      color: '#8b5cf6' },
  return_order:         { icon: 'return-down-back-outline', label: 'Devolución',            color: '#ef4444' },
  // PLAN_OFERTAS_V1, Bloque 0. Lo que no esté aquí sale con su nombre técnico:
  // cada action_type nuevo del backend se agrega aquí y en el desktop.
  discount_mismatch:    { icon: 'alert-circle-outline', label: 'Descuento mayor al configurado', color: '#ef4444' },
  remove_item:          { icon: 'remove-circle-outline', label: 'Producto quitado de una cuenta', color: '#f59e0b' },
  offline_price:        { icon: 'alert-circle-outline', label: 'Precio distinto al del catálogo', color: '#f59e0b' },
  cash_movement:        { icon: 'cash-outline',         label: 'Movimiento de caja',      color: '#10b981' },
  cash_movement_void:   { icon: 'cash-outline',         label: 'Movimiento de caja anulado', color: '#ef4444' },
  approve_kds_device:   { icon: 'tv-outline',           label: 'Pantalla de cocina autorizada', color: '#3b82f6' },
  revoke_kds_device:    { icon: 'tv-outline',           label: 'Pantalla de cocina revocada',   color: '#ef4444' },
};

export default function DashboardScreen() {
  const { settings, isOwner, sucursalId } = useAuth();
  const currency = settings?.currency_symbol || '$';
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sucursal que se está MIRANDO (solo lectura; los registros van a la del equipo)
  const [selectedBranch, setSelectedBranch] = useState(sucursalId || null);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditDetalle, setAuditDetalle] = useState(null); // log abierto en modal

  const load = useCallback(async (isRefresh = false, branchId = selectedBranch) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getDashboard(branchId);
      setStats(data);
    } catch (e) {
      console.error('Dashboard error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranch]);

  const loadAudit = useCallback(async () => {
    if (!isOwner) return;
    try {
      const data = await api.getAuditLogs({ limit: 10 });
      setAuditLogs(data.data || []);
    } catch { /* silencioso */ }
  }, [isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  // SSE para actualizaciones en tiempo real del audit log
  useFocusEffect(
    useCallback(() => {
      if (!isOwner) return;
      const sse = createSSE(() => api.getAuditEventsConfig(), () => loadAudit());
      return () => { try { sse?.close(); } catch {} };
    }, [isOwner, loadAudit])
  );

  // Si cambia la sucursal del equipo (Ajustes), la vista la sigue: no dejar al
  // usuario mirando una sucursal ajena justo después de mudar el equipo.
  useEffect(() => {
    setSelectedBranch(sucursalId || null);
    load(false, sucursalId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);


  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={zc.azul} />
      </View>
    );
  }

  // Mapear campos del backend (en español) a variables locales
  const hoy = stats?.ventasHoy || {};
  const ayer = stats?.ventasAyer || {};
  const topProductos = stats?.topProductos || [];
  const ultimasVentas = stats?.ultimasVentas || [];
  const vipHoy = stats?.clientesVIPHoy || [];
  const stockBajoLista = stats?.productosStockBajoLista || [];
  const stockBajoCount = stats?.productosStockBajo || 0;
  const ultimos7Dias = stats?.ultimos7Dias || [];
  const ventasPorHora = stats?.ventasPorHora || [];
  const clientesHoy = stats?.clientesHoy || 0;
  const itemsVendidos = stats?.itemsVendidosHoy || 0;

  // Comparativa vs ayer
  const montoHoy = parseFloat(hoy.monto_total) || 0;
  const montoAyer = parseFloat(ayer.monto_total) || 0;
  const diffPct = montoAyer > 0 ? ((montoHoy - montoAyer) / montoAyer) * 100 : null;
  const diffUp = diffPct !== null && diffPct >= 0;

  const dateStr = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Lo que el negocio cobró y NO es suyo (impuesto) o no es venta (propina).
  const impuestoHoy = parseFloat(hoy.impuesto_total) || 0;
  const propinasHoy = parseFloat(hoy.propinas_total) || 0;
  const maxTop = Math.max(...topProductos.map((p) => parseFloat(p.total_vendido) || 0), 1);
  const sinAlertas = stockBajoCount === 0 && auditLogs.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FranjaSuperior />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
      >
        {/* ── Cabecera: el número del día primero ── */}
        <Cabecera
          titulo="Resumen"
          subtitulo={dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
          izquierda={<Image source={logo} style={styles.logo} resizeMode="contain" />}
          solapa={48}
        >
          {/* Ver otra sucursal (solo lectura) */}
          <View style={styles.sucursales}>
            <SelectorSucursal
              value={selectedBranch}
              enNoche
              onChange={(id) => { setSelectedBranch(id); load(false, id); }}
            />
          </View>
          <NumeroGrande etiqueta="Ventas de hoy" valor={fmt(hoy.monto_total, currency)}>
            <View style={styles.linea2}>
              {diffPct !== null ? (
                <>
                  <Variacion sube={diffUp}>{`${diffUp ? '▲' : '▼'} ${Math.abs(diffPct).toFixed(0)}%`}</Variacion>
                  <Text style={styles.linea2Txt}>vs ayer ({fmt(ayer.monto_total, currency)})</Text>
                </>
              ) : (
                <Text style={styles.linea2Txt}>Ayer: {fmt(ayer.monto_total, currency)}</Text>
              )}
            </View>
          </NumeroGrande>
        </Cabecera>

        {/* ── Dos tarjetas montadas sobre la cabecera ── */}
        <View style={styles.encima}>
          <Tarjeta style={styles.mini}>
            <IconoEnCuadro nombre="recibo" tono="azul" />
            <Text style={styles.miniEtq}>Pedidos</Text>
            <Text style={styles.miniValor}>{fmtNum(hoy.total_pedidos)}</Text>
            <Text style={styles.miniSub} numberOfLines={1}>Ticket prom. {fmt(hoy.ticket_promedio, currency)}</Text>
          </Tarjeta>
          <Tarjeta style={styles.mini}>
            <IconoEnCuadro nombre="usuarios" tono="lila" />
            <Text style={styles.miniEtq}>Clientes</Text>
            <Text style={styles.miniValor}>{fmtNum(clientesHoy)}</Text>
            <Text style={styles.miniSub} numberOfLines={1}>{fmtNum(itemsVendidos)} productos vendidos</Text>
          </Tarjeta>
        </View>

        {/* ── Aviso suave: confirmar correo (solo dueño no verificado) ── */}
        <View style={{ paddingHorizontal: espacios.borde }}>
          <VerificacionBanner />
        </View>

        {/* Impuesto (BLOQUE 8) y propinas (BLOQUE 9): solo si hubo. "Ventas de
            hoy" sigue siendo lo COBRADO; aquí se ve cuánto de eso es del fisco,
            y la propina ni siquiera es del negocio, así que jamás está dentro. */}
        {(impuestoHoy > 0 || propinasHoy > 0) && (
          <Tarjeta titulo="Del total de hoy" icono="billete" tono="verde">
            {impuestoHoy > 0 && (
              <>
                <Fila primera texto={`${configImpuesto(settings).nombre} recaudado`} valor={fmt(hoy.impuesto_total, currency)} />
                <Fila
                  texto="Ventas netas"
                  valor={fmt(hoy.monto_neto ?? (montoHoy - (parseFloat(hoy.impuesto_total) || 0)), currency)}
                  valorColor={zc.tinta}
                />
              </>
            )}
            {propinasHoy > 0 && (
              <Fila
                primera={impuestoHoy <= 0}
                texto="Propinas"
                detalle="No son ventas"
                valor={fmt(hoy.propinas_total, currency)}
              />
            )}
          </Tarjeta>
        )}

        {/* ── Últimos 7 días (línea) ── */}
        <Tarjeta titulo="Últimos 7 días" icono="tendencia">
          <LineChart7Days data={ultimos7Dias} currency={currency} />
          <Text style={styles.pie}>
            Ayer: {fmt(ayer.monto_total, currency)} · {fmtNum(ayer.total_pedidos)} pedidos
          </Text>
        </Tarjeta>

        {/* ── Necesita tu atención (stock bajo + acciones con PIN) ── */}
        <Tarjeta titulo="Necesita tu atención" icono="aviso" tono={sinAlertas ? 'verde' : 'ambar'}>
          {sinAlertas && (
            <Fila primera icono="circuloOk" tono="verde" texto="Sin alertas por el momento" />
          )}
          {stockBajoCount > 0 && (
            <Fila
              primera
              texto={`${stockBajoCount} insumo${stockBajoCount !== 1 ? 's' : ''} con stock bajo`}
              detalle="Revisa el inventario para reponer"
              flecha
            />
          )}
          {isOwner && auditLogs.map((log, i) => {
            const tipo = AUDIT_TIPOS[log.action_type] || { icon: 'key-outline', label: log.action_type, color: '#9ca3af' };
            const fecha = new Date(log.createdAt);
            const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const diaStr  = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            // BLOQUE 14 — lo ocurrido fuera del horario del negocio se distingue de
            // un vistazo. Es la razón de ser de la marca: el dueño no debería tener
            // que abrir 200 acciones normales para encontrar las tres de la madrugada.
            // Sin horario configurado esto nunca se enciende.
            const fueraHorario = log.fuera_horario === true || log.fuera_horario === 1;
            return (
              <TouchableOpacity
                key={log.id}
                style={[styles.auditFila, (stockBajoCount > 0 || i > 0) && styles.conLinea, fueraHorario && styles.auditFuera]}
                onPress={() => setAuditDetalle(log)}
                activeOpacity={0.7}
              >
                <IconoEnCuadro nombre={tipo.icon} tono={tonoPorColor(tipo.color)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.auditTitulo} numberOfLines={1}>{tipo.label}</Text>
                  <Text style={styles.auditSub} numberOfLines={1}>
                    {fueraHorario ? <Text style={styles.auditFueraEtiqueta}>Fuera de horario · </Text> : null}
                    {log.employee_name}{log.target_description ? ` · ${log.target_description}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.auditHora}>{horaStr}</Text>
                  <Text style={styles.auditDia}>{diaStr}</Text>
                </View>
                <Icono nombre="derecha" size={16} color={zc.flecha} />
              </TouchableOpacity>
            );
          })}
        </Tarjeta>

        {/* ── Actividad por hora (barras) ── */}
        <Tarjeta titulo="Actividad por hora · hoy" icono="barras">
          <HourlyChart data={ventasPorHora} />
        </Tarjeta>

        {/* ── Lo más vendido ── */}
        {topProductos.length > 0 && (
          <Tarjeta titulo="Lo más vendido · 7 días" icono="medalla">
            {topProductos.map((p, i) => (
              <View key={i} style={[styles.topFila, i > 0 && styles.conLinea]}>
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.topNombre}>
                    {p.emoji ? <IconoProducto valor={p.emoji} size={16} color={zc.tinta} /> : null}
                    <Text style={styles.topTxt} numberOfLines={1}>{p.nombre}</Text>
                  </View>
                  <View style={styles.pista}>
                    <View style={[styles.barra, { width: `${((parseFloat(p.total_vendido) || 0) / maxTop) * 100}%` }]} />
                  </View>
                </View>
                <Text style={styles.topValor}>{p.total_vendido}</Text>
              </View>
            ))}
          </Tarjeta>
        )}

        {/* ── Últimas ventas ── */}
        {ultimasVentas.length > 0 && (
          <Tarjeta titulo="Últimas ventas" icono="recibo">
            {ultimasVentas.map((v, i) => (
              <Fila
                key={v.id}
                primera={i === 0}
                texto={`#${v.id} · ${v.cliente}`}
                detalle={new Date(v.fecha_pedido).toLocaleTimeString('es-MX', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                valor={fmt(v.total, currency)}
                valorColor={zc.tinta}
              />
            ))}
          </Tarjeta>
        )}

        {/* ── Clientes frecuentes hoy ── */}
        {vipHoy.length > 0 && (
          <Tarjeta titulo="Clientes frecuentes hoy" icono="estrella">
            {vipHoy.map((c, i) => (
              <Fila
                key={c.id}
                primera={i === 0}
                izquierda={
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                }
                texto={c.name}
                detalle={c.phone || null}
              />
            ))}
          </Tarjeta>
        )}

        {/* ── Stock bajo (lista detallada) ── */}
        {stockBajoLista.length > 0 && (
          <Tarjeta titulo="Insumos con stock bajo" icono="aviso" tono="ambar">
            {stockBajoLista.map((p, i) => (
              <Fila
                key={p.id}
                primera={i === 0}
                izquierda={p.emoji ? <IconoProducto valor={p.emoji} size={16} color={zc.tinta} /> : null}
                texto={p.name}
                valor={`${p.stock} uds`}
                valorColor={p.stock <= 3 ? zc.rojo : zc.ambar}
              />
            ))}
          </Tarjeta>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Modal detalle de alerta */}
      <Modal
        visible={!!auditDetalle}
        transparent
        animationType="slide"
        onRequestClose={() => setAuditDetalle(null)}
      >
        {auditDetalle && (() => {
          const log = auditDetalle;
          const tipo = AUDIT_TIPOS[log.action_type] || { icon: 'key-outline', label: log.action_type, color: '#9ca3af' };
          const fecha = new Date(log.createdAt);
          const fechaStr = fecha.toLocaleString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit',
          });
          const fmtData = (raw) => {
            if (!raw) return null;
            try {
              const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
              return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');
            } catch {
              return String(raw);
            }
          };
          const before = fmtData(log.before_data);
          const after  = fmtData(log.after_data);
          return (
            <View style={styles.detalleOverlay}>
              <View style={styles.detalleBox}>
                <View style={styles.detalleHeader}>
                  <IconoEnCuadro nombre={tipo.icon} tono={tonoPorColor(tipo.color)} />
                  <Text style={styles.detalleTitulo}>{tipo.label}</Text>
                  <TouchableOpacity onPress={() => setAuditDetalle(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icono nombre="cerrar" size={22} color={zc.grisSuave} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.detalleScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.detalleRow}>
                    <Text style={styles.detalleKey}>Fecha</Text>
                    <Text style={styles.detalleVal} selectable>
                      {fechaStr}
                      {(log.fuera_horario === true || log.fuera_horario === 1)
                        ? <Text style={styles.auditFueraEtiqueta}>{'\n⚠️ Ocurrió fuera del horario del negocio'}</Text>
                        : null}
                    </Text>
                  </View>
                  <View style={styles.detalleRow}>
                    <Text style={styles.detalleKey}>Empleado</Text>
                    <Text style={styles.detalleVal} selectable>{log.employee_name || '—'}</Text>
                  </View>
                  {log.employee_role ? (
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleKey}>Puesto</Text>
                      <Text style={styles.detalleVal} selectable>{log.employee_role}</Text>
                    </View>
                  ) : null}
                  {log.target_description ? (
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleKey}>Descripción</Text>
                      <Text style={styles.detalleVal} selectable>{log.target_description}</Text>
                    </View>
                  ) : null}
                  {log.branch_name ? (
                    <View style={styles.detalleRow}>
                      <Text style={styles.detalleKey}>Sucursal</Text>
                      <Text style={styles.detalleVal} selectable>{log.branch_name}</Text>
                    </View>
                  ) : null}
                  {before ? (
                    <View style={[styles.detalleRow, { alignItems: 'flex-start' }]}>
                      <Text style={styles.detalleKey}>Antes</Text>
                      <Text style={[styles.detalleVal, styles.detalleCode]} selectable>{before}</Text>
                    </View>
                  ) : null}
                  {after ? (
                    <View style={[styles.detalleRow, { alignItems: 'flex-start' }]}>
                      <Text style={styles.detalleKey}>Después</Text>
                      <Text style={[styles.detalleVal, styles.detalleCode]} selectable>{after}</Text>
                    </View>
                  ) : null}
                  <View style={{ height: 24 }} />
                </ScrollView>
              </View>
            </View>
          );
        })()}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: zc.fondo },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: zc.fondo },

  logo: { width: 26, height: 26 },
  // El selector trae su propio margen de 16; la cabecera ya tiene 18.
  sucursales: { marginHorizontal: -16, marginTop: 12, marginBottom: -6 },
  linea2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  linea2Txt: { fontSize: 12.5, color: zc.enNocheGris },

  encima: { flexDirection: 'row', gap: 10, marginTop: -48, marginHorizontal: espacios.borde, marginBottom: 12 },
  mini: { flex: 1, marginHorizontal: 0, marginBottom: 0, padding: 14 },
  miniEtq: { ...letra.etiqueta, color: zc.gris, marginTop: 10 },
  miniValor: { ...letra.valor, color: zc.tinta, marginTop: 1, fontVariant: ['tabular-nums'] },
  miniSub: { fontSize: 11.5, color: zc.grisSuave, marginTop: 1 },

  pie: { fontSize: 12.5, color: zc.grisSuave, marginTop: 4 },
  conLinea: { borderTopWidth: 1, borderTopColor: zc.linea },

  vacio: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  vacioTxt: { ...letra.etiqueta, color: zc.grisSuave },

  // Alertas y auditoría
  auditFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  auditFuera: { backgroundColor: zc.ambarSuave, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  auditTitulo: { ...letra.texto, color: zc.tinta },
  auditSub: { fontSize: 12.5, color: zc.grisSuave, marginTop: 1 },
  auditFueraEtiqueta: { fontSize: 12.5, fontWeight: '500', color: zc.ambarTexto },
  auditHora: { fontSize: 12.5, color: zc.gris, fontVariant: ['tabular-nums'] },
  auditDia: { fontSize: 11.5, color: zc.grisSuave, marginTop: 1 },

  // Lo más vendido
  topFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rank: { width: 18, fontSize: 13, color: zc.grisSuave, fontVariant: ['tabular-nums'] },
  topNombre: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topTxt: { ...letra.texto, color: zc.tinta, flexShrink: 1 },
  pista: { height: 4, backgroundColor: zc.pistaSuave, borderRadius: 4, marginTop: 5, overflow: 'hidden' },
  barra: { height: 4, backgroundColor: zc.barraSuave, borderRadius: 4 },
  topValor: { ...letra.texto, color: zc.gris, fontVariant: ['tabular-nums'] },

  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: zc.azulSuave,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '500', color: zc.azul },

  // Barras por hora
  hourlyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 6,
    paddingHorizontal: 2,
  },
  hourlyBarCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  hourlyBar: { width: 20, borderRadius: 5 },
  hourlyBarValue: { fontSize: 11, color: zc.gris },
  hourlyBarLabel: { fontSize: 11, color: zc.grisSuave, marginTop: 3 },

  // Modal detalle de alerta
  detalleOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  detalleBox: {
    backgroundColor: zc.tarjeta,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  detalleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: zc.linea,
  },
  detalleTitulo: { flex: 1, fontSize: 17, fontWeight: '500', color: zc.tinta },
  detalleScroll: { paddingHorizontal: 18, paddingTop: 6 },
  detalleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: zc.linea,
    gap: 10,
  },
  detalleKey: { width: 84, fontSize: 13, color: zc.gris },
  detalleVal: { flex: 1, fontSize: 14, color: zc.tinta },
  detalleCode: { fontFamily: 'monospace', fontSize: 12, color: zc.gris, lineHeight: 18 },
});
