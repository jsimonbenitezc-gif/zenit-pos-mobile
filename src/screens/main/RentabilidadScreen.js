/**
 * RENTABILIDAD POR PRODUCTO (BLOQUE 12)
 *
 * Responde la pregunta que el POS nunca supo contestar: de todo lo que vendo,
 * ¿qué me deja dinero de verdad? Cruza las ventas del periodo con el costo de
 * la receta de cada platillo.
 *
 * ── LAS TRES REGLAS QUE HACEN QUE ESTA PANTALLA SE PUEDA CREER ─────────────
 * 1. Un producto SIN receta no cuesta cero: cuesta *desconocido*. Se muestra
 *    aparte, nunca con un margen del 100% que invitaría a decidir al revés.
 * 2. Un insumo sin precio ensucia todo lo que lo toca: el platillo se marca y
 *    se dice qué insumo falta.
 * 3. El ingreso es NETO. De un platillo de $116 con IVA incluido, $16 son del
 *    fisco: el margen se calcula sobre los $100 que sí son del negocio.
 *
 * Es una pantalla de SOLO LECTURA y SOLO ONLINE, a propósito: el costo lo
 * calcula el backend (utils/costos.js) y el mobile no cachea recetas. El costo
 * de cada insumo se captura en Inventario, que sí funciona igual que siempre.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import SelectorSucursal from '../../components/SelectorSucursal';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';

const PERIODOS = [
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
];

const ORDENES = [
  { key: 'margen', label: 'Ganancia' },
  { key: 'margen_pct', label: 'Margen %' },
  { key: 'ingreso', label: 'Ventas' },
  { key: 'unidades', label: 'Unidades' },
];

/** Fecha 'YYYY-MM-DD' local, N días hacia atrás. */
function fechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function PremiumGate() {
  const navigation = useNavigation();
  return (
    <View style={styles.gateWrap}>
      <Ionicons name="trending-up-outline" size={52} color={colors.textMuted} />
      <Text style={styles.gateTitle}>Función Premium</Text>
      <Text style={styles.gateSubtitle}>
        La rentabilidad se calcula con las recetas y los costos del inventario,
        que forman parte del plan Premium.
      </Text>
      <TouchableOpacity style={styles.gateBtn} onPress={() => navigation.navigate('Ajustes')}>
        <Text style={styles.gateBtnText}>Ver mi plan</Text>
      </TouchableOpacity>
    </View>
  );
}

function Tarjeta({ label, valor, color }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValor, color ? { color } : null]}>{valor}</Text>
    </View>
  );
}

function FilaProducto({ item, currency }) {
  if (item.sin_receta) {
    return (
      <View style={[styles.fila, styles.filaSinReceta]}>
        <View style={styles.filaTop}>
          <Text style={styles.filaNombre} numberOfLines={1}>{item.nombre}</Text>
          <Text style={styles.filaUnidades}>{item.unidades} u.</Text>
        </View>
        <Text style={styles.filaSinRecetaTexto}>
          Sin receta — captura sus insumos para saber cuánto deja.
          Vendió {formatMoney(item.ingreso, currency)}.
        </Text>
      </View>
    );
  }

  // Un margen negativo es la información más valiosa de la pantalla: ese
  // platillo se está vendiendo con pérdida.
  const color = item.margen < 0
    ? colors.danger
    : (item.margen_pct !== null && item.margen_pct < 25 ? colors.warning : colors.success);

  return (
    <View style={styles.fila}>
      <View style={styles.filaTop}>
        <Text style={styles.filaNombre} numberOfLines={1}>{item.nombre}</Text>
        <Text style={[styles.filaMargen, { color }]}>
          {formatMoney(item.margen, currency)}
          {item.margen_pct !== null ? `  ·  ${item.margen_pct}%` : ''}
        </Text>
      </View>
      <View style={styles.filaMeta}>
        <Text style={styles.filaMetaTexto}>{item.unidades} u.</Text>
        <Text style={styles.filaMetaTexto}>Ingreso {formatMoney(item.ingreso, currency)}</Text>
        <Text style={styles.filaMetaTexto}>Costo {formatMoney(item.costo, currency)}</Text>
      </View>
      {!item.costo_confiable && (
        <Text style={styles.filaAviso}>
          <Ionicons name="warning-outline" size={11} color={colors.warning} />
          {'  '}Falta el costo de: {(item.insumos_sin_costo || []).join(', ')}
        </Text>
      )}
    </View>
  );
}

export default function RentabilidadScreen() {
  const { settings, isPremium, sucursalId } = useAuth();
  const { online } = useNetwork();
  const currency = settings?.currency_symbol || '$';

  const [sucursalVista, setSucursalVista] = useState(sucursalId);
  const [periodo, setPeriodo] = useState(30);
  const [orden, setOrden] = useState('margen');
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setSucursalVista(sucursalId); }, [sucursalId]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    setError(null);
    try {
      const data = await api.getProfitability({
        desde: fechaHaceDias(periodo - 1),
        hasta: fechaHaceDias(0),
        orden,
        branchId: sucursalVista,
      });
      setDatos(data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium, periodo, orden, sucursalVista]);

  useEffect(() => { load(); }, [load]);

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <LogoTitle title="Rentabilidad" />
        <PremiumGate />
      </SafeAreaView>
    );
  }

  const resumen = datos?.resumen;
  const avisos = [];
  if (resumen?.insumos_sin_costo?.length) {
    avisos.push(
      `Estos insumos no tienen costo capturado, así que el margen sale más alto de lo real: ` +
      `${resumen.insumos_sin_costo.slice(0, 6).join(', ')}` +
      `${resumen.insumos_sin_costo.length > 6 ? ` y ${resumen.insumos_sin_costo.length - 6} más` : ''}. ` +
      `Ponles precio en Inventario.`
    );
  }
  if (resumen?.productos_sin_receta > 0) {
    avisos.push(
      `${resumen.productos_sin_receta} producto${resumen.productos_sin_receta === 1 ? '' : 's'} que vendiste ` +
      `no tiene${resumen.productos_sin_receta === 1 ? '' : 'n'} receta, así que no se puede saber cuánto ` +
      `deja${resumen.productos_sin_receta === 1 ? '' : 'n'}. Aparecen al final.`
    );
  }

  const encabezado = (
    <View>
      <SelectorSucursal value={sucursalVista} onChange={setSucursalVista} />

      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsFila}>
        {PERIODOS.map(p => (
          <TouchableOpacity
            key={p.dias}
            style={[styles.chip, periodo === p.dias && styles.chipActivo]}
            onPress={() => setPeriodo(p.dias)}
          >
            <Text style={[styles.chipTexto, periodo === p.dias && styles.chipTextoActivo]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.kpis}>
        <Tarjeta label="Ingreso neto" valor={formatMoney(resumen?.ingreso || 0, currency)} />
        <Tarjeta label="Costo insumos" valor={formatMoney(resumen?.costo || 0, currency)} />
        <Tarjeta label="Ganancia" valor={formatMoney(resumen?.margen || 0, currency)} color={colors.success} />
        <Tarjeta
          label="Margen"
          valor={resumen?.margen_pct === null || resumen?.margen_pct === undefined ? '—' : `${resumen.margen_pct}%`}
          color={colors.success}
        />
      </View>

      <Text style={styles.nota}>
        El ingreso es neto: sin impuesto y sin descuentos. La ganancia no descuenta
        renta, sueldos ni servicios.
      </Text>

      {avisos.map((a, i) => (
        <View key={i} style={styles.aviso}>
          <Text style={styles.avisoTexto}>{a}</Text>
        </View>
      ))}

      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsFila}>
        {ORDENES.map(o => (
          <TouchableOpacity
            key={o.key}
            style={[styles.chip, orden === o.key && styles.chipActivo]}
            onPress={() => setOrden(o.key)}
          >
            <Text style={[styles.chipTexto, orden === o.key && styles.chipTextoActivo]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LogoTitle title="Rentabilidad" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      ) : (
        <FlatList
          data={datos?.productos || []}
          keyExtractor={p => String(p.product_id)}
          ListHeaderComponent={encabezado}
          renderItem={({ item }) => <FilaProducto item={item} currency={currency} />}
          contentContainerStyle={styles.lista}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <Text style={styles.vacio}>
              {error
                ? error
                : (!online
                  ? 'La rentabilidad se calcula en el servidor: necesitas conexión para verla.'
                  : 'No hay ventas en este periodo.')}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  lista: { padding: spacing.lg, paddingBottom: spacing.xxl },

  chipsFila: { gap: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexto: { fontSize: font.sm, color: colors.textSecondary },
  chipTextoActivo: { color: '#fff', fontWeight: '600' },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  kpi: {
    flexGrow: 1, minWidth: '46%', backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  kpiLabel: { fontSize: font.sm - 1, color: colors.textSecondary },
  kpiValor: { fontSize: font.xl, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },

  nota: { fontSize: font.sm - 2, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },

  aviso: {
    marginTop: spacing.sm, padding: spacing.md,
    backgroundColor: '#fffbeb', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#fcd34d',
  },
  avisoTexto: { fontSize: font.sm - 1, color: '#92400e', lineHeight: 18 },

  fila: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  filaSinReceta: { backgroundColor: '#fafafa' },
  filaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  filaNombre: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  filaMargen: { fontSize: font.md, fontWeight: '700' },
  filaUnidades: { fontSize: font.sm, color: colors.textSecondary },
  filaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  filaMetaTexto: { fontSize: font.sm - 1, color: colors.textSecondary },
  filaSinRecetaTexto: { fontSize: font.sm - 1, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  filaAviso: { fontSize: font.sm - 2, color: '#92400e', marginTop: spacing.xs },

  vacio: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl, paddingHorizontal: spacing.lg, lineHeight: 20 },

  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  gateTitle: { fontSize: font.xl, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  gateSubtitle: { fontSize: font.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  gateBtn: {
    marginTop: spacing.lg, backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md,
  },
  gateBtnText: { color: '#fff', fontWeight: '600', fontSize: font.md },
});
