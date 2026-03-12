import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MEDALS = ['🥇', '🥈', '🥉', '4°', '5°'];

function fmtYAxis(val) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 10_000)    return `$${(val / 1_000).toFixed(0)}k`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}k`;
  return `$${Math.round(val)}`;
}

const fmt = (n) =>
  `$${(parseFloat(n) || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtNum = (n) => (parseInt(n) || 0).toLocaleString('es-MX');

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color || colors.primary }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── SectionTitle ────────────────────────────────────────────────────────────
function SectionTitle({ children, icon, color }) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon ? <Ionicons name={icon} size={15} color={color || colors.textPrimary} /> : null}
      <Text style={[styles.sectionTitle, color ? { color } : null]}>{children}</Text>
    </View>
  );
}

// ─── Gráfica de línea — últimos 7 días ───────────────────────────────────────
function LineChart7Days({ data }) {
  const [w, setW] = useState(0);

  const CHART_H = 140;
  const PAD_TOP  = 12;
  const PAD_BOT  = 28;
  const PAD_LEFT = 40; // espacio para etiquetas del eje Y
  const PAD_RIGHT = 4;

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

  return (
    <View style={styles.chartCard}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={CHART_H}>
            <Defs>
              <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.18" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Líneas guía horizontales */}
            <Path d={`M${PAD_LEFT},${yMax} L${w - PAD_RIGHT},${yMax}`} stroke={colors.border} strokeWidth="0.8" strokeDasharray="3,4" />
            <Path d={`M${PAD_LEFT},${yMid} L${w - PAD_RIGHT},${yMid}`} stroke={colors.border} strokeWidth="0.8" strokeDasharray="3,4" />
            <Path d={`M${PAD_LEFT},${yMin} L${w - PAD_RIGHT},${yMin}`} stroke={colors.border} strokeWidth="0.8" />

            {/* Etiquetas eje Y */}
            <SvgText x={PAD_LEFT - 4} y={yMax + 4}  textAnchor="end" fontSize="9" fill={colors.textMuted}>{fmtYAxis(maxVal)}</SvgText>
            <SvgText x={PAD_LEFT - 4} y={yMid + 4}  textAnchor="end" fontSize="9" fill={colors.textMuted}>{fmtYAxis(maxVal / 2)}</SvgText>
            <SvgText x={PAD_LEFT - 4} y={yMin}       textAnchor="end" fontSize="9" fill={colors.textMuted}>$0</SvgText>

            {/* Área rellena */}
            <Path d={fillPath} fill="url(#lineGrad)" />

            {/* Línea */}
            <Path
              d={linePath}
              fill="none"
              stroke={colors.primary}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Puntos */}
            {pts.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={p.isToday ? 5 : 3.5}
                fill={p.monto > 0 ? colors.primary : colors.border}
                stroke={colors.surface}
                strokeWidth="2"
              />
            ))}

            {/* Etiquetas de día (eje X) */}
            {pts.map((p, i) => (
              <SvgText
                key={i}
                x={p.x}
                y={CHART_H - 5}
                textAnchor="middle"
                fontSize="10"
                fill={p.isToday ? colors.primary : colors.textSecondary}
                fontWeight={p.isToday ? '700' : '400'}
              >
                {p.day}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

// ─── Gráfica de barras — actividad por hora ───────────────────────────────────
function HourlyChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.chartCard, styles.emptyChartInner]}>
        <Ionicons name="time-outline" size={22} color={colors.textMuted} />
        <Text style={styles.emptyChartText}>Sin actividad registrada hoy</Text>
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
    <View style={styles.chartCard}>
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
                      backgroundColor: d.pedidos > 0 ? colors.primary : colors.border,
                    },
                  ]}
                />
                <Text style={styles.hourlyBarLabel}>{`${d.hora}h`}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getDashboard();
      setStats(data);
    } catch (e) {
      console.error('Dashboard error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
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

  // Badge comparativa vs ayer
  const montoHoy = parseFloat(hoy.monto_total) || 0;
  const montoAyer = parseFloat(ayer.monto_total) || 0;
  const diffPct = montoAyer > 0 ? ((montoHoy - montoAyer) / montoAyer) * 100 : null;
  const diffUp = diffPct !== null && diffPct >= 0;
  const diffLabel =
    diffPct !== null
      ? `${diffUp ? '▲' : '▼'} ${Math.abs(diffPct).toFixed(0)}% vs ayer`
      : undefined;

  const dateStr = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Resumen</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>

        {/* ── Ventas de hoy ── */}
        <SectionTitle icon="today-outline">Ventas de hoy</SectionTitle>
        <View style={styles.row}>
          <StatCard
            label="Total"
            value={fmt(hoy.monto_total)}
            color={colors.success}
            sub={diffLabel}
          />
          <StatCard label="Pedidos" value={fmtNum(hoy.total_pedidos)} color={colors.primary} />
        </View>
        <View style={styles.row}>
          <StatCard label="Ticket promedio" value={fmt(hoy.ticket_promedio)} color={colors.warning} />
          <StatCard label="Clientes únicos" value={fmtNum(clientesHoy)} color="#8b5cf6" />
        </View>
        <View style={styles.row}>
          <StatCard label="Items vendidos" value={fmtNum(itemsVendidos)} color="#06b6d4" />
          <StatCard
            label="Stock bajo"
            value={stockBajoCount}
            color={stockBajoCount > 0 ? colors.danger : colors.success}
            sub={stockBajoCount > 0 ? 'productos' : 'Todo en orden'}
          />
        </View>

        {/* ── Alertas ── */}
        <SectionTitle icon="alert-circle-outline" color={colors.danger}>
          Alertas
        </SectionTitle>
        <View style={styles.card}>
          {stockBajoCount > 0 ? (
            <View style={styles.alertRow}>
              <View style={[styles.alertIconWrap, { backgroundColor: colors.warning + '22' }]}>
                <Ionicons name="warning-outline" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>
                  {stockBajoCount} producto{stockBajoCount !== 1 ? 's' : ''} con stock bajo
                </Text>
                <Text style={styles.alertSub}>Revisa el inventario para reponer</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          ) : (
            <View style={styles.alertOkRow}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={styles.alertOkText}>Sin alertas por el momento</Text>
            </View>
          )}
        </View>

        {/* ── Ayer ── */}
        <SectionTitle icon="time-outline">Ayer</SectionTitle>
        <View style={styles.row}>
          <StatCard label="Total" value={fmt(ayer.monto_total)} color={colors.textMuted} />
          <StatCard label="Pedidos" value={fmtNum(ayer.total_pedidos)} color={colors.textMuted} />
        </View>

        {/* ── Últimos 7 días (línea) ── */}
        <SectionTitle icon="trending-up-outline">Últimos 7 días</SectionTitle>
        <LineChart7Days data={ultimos7Dias} />

        {/* ── Actividad por hora (barras) ── */}
        <SectionTitle icon="bar-chart-outline">Actividad por hora (hoy)</SectionTitle>
        <HourlyChart data={ventasPorHora} />

        {/* ── Top productos ── */}
        {topProductos.length > 0 && (
          <>
            <SectionTitle icon="trophy-outline">Top productos (7 días)</SectionTitle>
            <View style={styles.card}>
              {topProductos.map((p, i) => (
                <View key={i} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                  <Text style={styles.medal}>{MEDALS[i]}</Text>
                  <Text style={styles.listName} numberOfLines={1}>
                    {p.emoji ? p.emoji + ' ' : ''}
                    {p.nombre}
                  </Text>
                  <Text style={styles.listValue}>{p.total_vendido} uds</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Últimas ventas ── */}
        {ultimasVentas.length > 0 && (
          <>
            <SectionTitle icon="receipt-outline">Últimas ventas</SectionTitle>
            <View style={styles.card}>
              {ultimasVentas.map((v, i) => (
                <View key={v.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName} numberOfLines={1}>
                      #{v.id} · {v.cliente}
                    </Text>
                    <Text style={styles.listSub}>
                      {new Date(v.fecha_pedido).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.listValue, { color: colors.success }]}>
                    {fmt(v.total)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Clientes frecuentes hoy ── */}
        {vipHoy.length > 0 && (
          <>
            <SectionTitle icon="star-outline" color="#f59e0b">
              Clientes frecuentes hoy
            </SectionTitle>
            <View style={styles.card}>
              {vipHoy.map((c, i) => (
                <View key={c.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName} numberOfLines={1}>{c.name}</Text>
                    {c.phone ? <Text style={styles.listSub}>{c.phone}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Stock bajo (lista detallada) ── */}
        {stockBajoLista.length > 0 && (
          <>
            <SectionTitle icon="warning-outline" color={colors.warning}>
              Productos con stock bajo
            </SectionTitle>
            <View style={styles.card}>
              {stockBajoLista.map((p, i) => (
                <View key={p.id} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                  <Text style={styles.listName} numberOfLines={1}>
                    {p.emoji ? p.emoji + ' ' : ''}
                    {p.name}
                  </Text>
                  <Text
                    style={[
                      styles.listValue,
                      { color: p.stock <= 3 ? colors.danger : colors.warning },
                    ]}
                  >
                    {p.stock} uds
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.textPrimary },
  date: {
    fontSize: font.sm,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 2,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },

  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: font.sm - 1, color: colors.textSecondary, marginTop: 2 },
  statSub: { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },

  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  listRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  medal: { width: 28, fontSize: font.md, textAlign: 'center' },
  listName: { flex: 1, fontSize: font.sm, color: colors.textPrimary },
  listSub: { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  listValue: { fontSize: font.sm, color: colors.textSecondary, fontWeight: '700' },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: font.md, fontWeight: '700', color: colors.primary },

  // Alertas
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertTitle: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  alertSub: { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  alertOkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertOkText: { fontSize: font.sm, color: colors.textSecondary },

  // Gráficas
  chartCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  emptyChartInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyChartText: { fontSize: font.sm, color: colors.textMuted },

  // Barras por hora
  hourlyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 90,
    gap: 6,
    paddingHorizontal: 2,
  },
  hourlyBarCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  hourlyBar: { width: 22, borderRadius: 4 },
  hourlyBarValue: { fontSize: 9, color: colors.textMuted, fontWeight: '600' },
  hourlyBarLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 3 },
});
