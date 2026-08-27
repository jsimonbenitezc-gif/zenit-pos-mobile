import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { generarUuid } from '../../utils/uuid';
import { configImpuesto } from '../../utils/impuestos';
import { efectivoEsperado as calcularEfectivoEsperado } from '../../utils/propinas';

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

// Movimientos de caja (BLOQUE 7): dinero que entra o sale del cajón por fuera de
// las ventas. Sin esto el cierre nunca cuadraba — cada gasto del turno aparecía
// como un faltante.
const MOV_TIPOS = [
  { tipo: 'retiro',   label: 'Retiro',   sub: 'Sale dinero de la caja', icon: 'arrow-up-outline' },
  { tipo: 'gasto',    label: 'Gasto',    sub: 'Pago de algo',           icon: 'receipt-outline' },
  { tipo: 'deposito', label: 'Depósito', sub: 'Entra dinero',           icon: 'arrow-down-outline' },
];
const MOV_LABEL = { retiro: 'Retiro', gasto: 'Gasto', deposito: 'Depósito' };

export default function TurnoScreen() {
  const { settings, user, sucursalId, puedeRegistrarEnSucursal, nombreActivo, rolActivo } = useAuth();
  const currency = settings?.currency_symbol || '$';
  const [turno, setTurno]           = useState(null);
  const [totales, setTotales]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [modalApertura, setModal]   = useState(false);
  const [modalCierre, setModalCierre] = useState(false);

  // Apertura
  const [fondoInicial, setFondo]    = useState('');

  // Cierre
  const [efectivoCierre, setEfectivo] = useState('');
  const [notasCierre, setNotas]       = useState('');

  // Movimientos de caja
  const [movimientos, setMovimientos] = useState([]);
  const [movTotales, setMovTotales]   = useState({});
  const [modalMov, setModalMov]       = useState(false);
  const [movTipo, setMovTipo]         = useState('retiro');
  const [movMonto, setMovMonto]       = useState('');
  const [movMotivo, setMovMotivo]     = useState('');
  const [movPin, setMovPin]           = useState('');
  const [movError, setMovError]       = useState('');
  const [modalAnular, setModalAnular] = useState(null); // id del movimiento
  const [anularPin, setAnularPin]     = useState('');
  const [anularMotivo, setAnularMotivo] = useState('');

  // El PIN para sacar dinero lo decide el dueño (ajuste del negocio). Los
  // depósitos nunca lo piden: meter dinero a la caja no es un riesgo.
  const pinMovimientos = settings?.movimientos_caja_pin !== false;
  const pinRequerido = (tipo) => tipo !== 'deposito' && pinMovimientos;

  const cargarTurno = useCallback(async () => {
    try {
      const t = await api.getTurnoActivo(sucursalId);
      setTurno(t || null);
      if (t) {
        const tots = await api.getTurnoTotales(t.id).catch(() => null);
        setTotales(tots);
        const movs = await api.getMovimientosCaja(t.id).catch(() => null);
        setMovimientos(movs?.movimientos || []);
        setMovTotales(movs?.totales || {});
      } else {
        setTotales(null);
        setMovimientos([]);
        setMovTotales({});
      }
    } catch {
      setTurno(null);
      setTotales(null);
      setMovimientos([]);
      setMovTotales({});
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    cargarTurno();
  }, [cargarTurno]);

  async function abrirTurno() {
    // Un turno sin sucursal descuadra el cierre de caja. Ver CLAUDE.md §24.
    if (!puedeRegistrarEnSucursal()) {
      Alert.alert(
        'Falta elegir la sucursal',
        'Este equipo todavía no tiene una sucursal asignada. Ve a Ajustes → Sucursal y elige en cuál registra este equipo.'
      );
      return;
    }
    const fondo = parseFloat(fondoInicial) || 0;
    setSaving(true);
    try {
      const cajeroNombre = nombreActivo || user?.name || 'Cajero';
      const nuevo = await api.abrirTurno(cajeroNombre, rolActivo || null, fondo, sucursalId);
      setTurno(nuevo);
      setTotales({ total_pedidos: 0, total_ventas: 0, total_efectivo: 0, total_tarjeta: 0, total_transferencia: 0 });
      setModal(false);
      setFondo('');
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo abrir el turno');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Efectivo que debe haber en el cajón:
   *   fondo_inicial + ventas_efectivo + depósitos − retiros − gastos
   * Misma fórmula que utils/cashMovements.js en el backend (ver CLAUDE.md §28).
   */
  function efectivoEsperado() {
    // ⚠️ La propina en EFECTIVO cuenta porque está en el cajón (BLOQUE 9): sin
    // ella cada propina saldría como un SOBRANTE al contar el dinero. La de
    // tarjeta no entra: llega en la liquidación del banco. La fórmula vive en
    // utils/propinas.js, espejo de utils/cashMovements.js del backend.
    return calcularEfectivoEsperado({
      fondoInicial:     turno?.fondo_inicial,
      ventasEfectivo:   totales?.total_efectivo,
      propinasEfectivo: totales?.total_propinas_efectivo,
      depositos:        movTotales?.total_depositos,
      retiros:          movTotales?.total_retiros,
      gastos:           movTotales?.total_gastos,
    });
  }

  function abrirModalMovimiento() {
    if (!puedeRegistrarEnSucursal()) {
      Alert.alert(
        'Falta elegir la sucursal',
        'Este equipo todavía no tiene una sucursal asignada. Ve a Ajustes → Sucursal y elige en cuál registra este equipo.'
      );
      return;
    }
    setMovTipo('retiro');
    setMovMonto('');
    setMovMotivo('');
    setMovPin('');
    setMovError('');
    setModalMov(true);
  }

  async function registrarMovimiento() {
    const monto = parseFloat(movMonto);
    if (isNaN(monto) || monto <= 0) {
      setMovError('Ingresa un monto mayor a cero');
      return;
    }
    if (pinRequerido(movTipo) && !movPin) {
      setMovError('Ingresa el PIN de tu puesto');
      return;
    }
    setSaving(true);
    setMovError('');
    try {
      await api.registrarMovimientoCaja(turno.id, {
        tipo: movTipo,
        monto,
        motivo: movMotivo.trim() || null,
        role: rolActivo || null,
        pin: pinRequerido(movTipo) ? movPin : undefined,
        employee_name: nombreActivo || user?.name || '',
        // Idempotencia: un reintento por timeout no saca el dinero dos veces.
        client_uuid: generarUuid(),
      });
      setModalMov(false);
      await cargarTurno();
    } catch (e) {
      setMovError(friendlyError(e) || 'No se pudo registrar el movimiento');
    } finally {
      setSaving(false);
    }
  }

  async function anularMovimiento() {
    if (pinRequerido('retiro') && !anularPin) {
      setMovError('Ingresa el PIN de tu puesto');
      return;
    }
    setSaving(true);
    setMovError('');
    try {
      await api.anularMovimientoCaja(turno.id, modalAnular, {
        role: rolActivo || null,
        pin: pinRequerido('retiro') ? anularPin : undefined,
        employee_name: nombreActivo || user?.name || '',
        motivo: anularMotivo.trim() || null,
      });
      setModalAnular(null);
      setAnularPin('');
      setAnularMotivo('');
      await cargarTurno();
    } catch (e) {
      setMovError(friendlyError(e) || 'No se pudo anular el movimiento');
    } finally {
      setSaving(false);
    }
  }

  async function cerrarTurno() {
    const efectivo = parseFloat(efectivoCierre) || 0;
    const diferencia = efectivo - efectivoEsperado();

    Alert.alert(
      'Confirmar cierre de turno',
      `Efectivo contado: ${formatMoney(efectivo, currency)}\nEfectivo esperado: ${formatMoney(efectivoEsperado(), currency)}\nDiferencia: ${diferencia >= 0 ? '+' : ''}${formatMoney(Math.abs(diferencia), currency)}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar turno',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.cerrarTurno(turno.id, efectivo, notasCierre || null);
              setTurno(null);
              setTotales(null);
              setModalCierre(false);
              setEfectivo('');
              setNotas('');
            } catch (e) {
              Alert.alert('Error', friendlyError(e) || 'No se pudo cerrar el turno');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function duracion(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <LogoTitle title="Turno" titleStyle={styles.title} />

        {turno ? (
          <>
            {/* Turno activo */}
            <View style={styles.turnoCard}>
              <View style={styles.turnoHeader}>
                <View style={styles.activeDot} />
                <Text style={styles.turnoTitle}>Turno activo</Text>
              </View>
              <InfoRow label="Cajero"        value={turno.cajero_nombre} />
              <InfoRow label="Inicio"        value={formatDate(turno.apertura)} />
              <InfoRow label="Duración"      value={duracion(turno.apertura)} />
              <InfoRow label="Fondo inicial" value={formatMoney(parseFloat(turno.fondo_inicial || 0), currency)} />
            </View>

            {totales && (
              <View style={styles.totalesCard}>
                <Text style={styles.totalesTitle}>Ventas del turno</Text>
                <InfoRow label="Pedidos"      value={totales.total_pedidos || 0} />
                <InfoRow label="Total"        value={formatMoney(totales.total_ventas || 0, currency)} />
                <InfoRow label="Efectivo"     value={formatMoney(totales.total_efectivo || 0, currency)} />
                {(totales.total_tarjeta || 0) > 0 && (
                  <InfoRow label="Tarjeta"    value={formatMoney(totales.total_tarjeta, currency)} />
                )}
                {(totales.total_transferencia || 0) > 0 && (
                  <InfoRow label="Transferencia" value={formatMoney(totales.total_transferencia, currency)} />
                )}
                {/* Impuesto recaudado (BLOQUE 8). Va DENTRO del total cobrado, así
                    que no cambia el efectivo esperado: es informativo para el
                    administrador, que es a quien le sirve saberlo. */}
                {(totales.total_impuesto || 0) > 0 && (
                  <>
                    <InfoRow
                      label={`${configImpuesto(settings).nombre} recaudado`}
                      value={formatMoney(totales.total_impuesto, currency)}
                    />
                    <InfoRow
                      label="Ventas netas"
                      value={formatMoney(
                        (parseFloat(totales.total_ventas) || 0) - (parseFloat(totales.total_impuesto) || 0),
                        currency
                      )}
                    />
                  </>
                )}
                {/* Propinas (BLOQUE 9). NO están dentro de "Total vendido": no son
                    ingreso del negocio, son del empleado. Se separa la de efectivo
                    porque es la única que está en el cajón. */}
                {(totales.total_propinas || 0) > 0 && (
                  <>
                    <InfoRow
                      label="Propinas (no son ventas)"
                      value={formatMoney(totales.total_propinas, currency)}
                      valueColor={colors.success}
                    />
                    {(totales.total_propinas_efectivo || 0) > 0 && (
                      <InfoRow
                        label="…en efectivo (está en el cajón)"
                        value={formatMoney(totales.total_propinas_efectivo, currency)}
                      />
                    )}
                  </>
                )}
              </View>
            )}

            {/* Movimientos de caja: dinero que entra o sale por fuera de las ventas */}
            <View style={styles.totalesCard}>
              <View style={styles.movHeader}>
                <Text style={styles.totalesTitle}>Movimientos de caja</Text>
                <TouchableOpacity style={styles.btnMovAgregar} onPress={abrirModalMovimiento}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.btnMovAgregarText}>Registrar</Text>
                </TouchableOpacity>
              </View>

              {(movTotales.total_depositos > 0 || movTotales.total_retiros > 0 || movTotales.total_gastos > 0) && (
                <>
                  {movTotales.total_depositos > 0 && (
                    <InfoRow label="Depósitos" value={`+${formatMoney(movTotales.total_depositos, currency)}`} valueColor={colors.success} />
                  )}
                  {movTotales.total_retiros > 0 && (
                    <InfoRow label="Retiros" value={`−${formatMoney(movTotales.total_retiros, currency)}`} valueColor={colors.danger} />
                  )}
                  {movTotales.total_gastos > 0 && (
                    <InfoRow label="Gastos" value={`−${formatMoney(movTotales.total_gastos, currency)}`} valueColor={colors.danger} />
                  )}
                </>
              )}

              {movimientos.length === 0 ? (
                <Text style={styles.movVacio}>Sin movimientos en este turno.</Text>
              ) : (
                movimientos.map(m => (
                  <View key={m.id} style={[styles.movItem, m.anulado && styles.movItemAnulado]}>
                    <View style={styles.movBadge}>
                      <Text style={styles.movBadgeText}>{MOV_LABEL[m.tipo] || m.tipo}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.movMotivo} numberOfLines={1}>{m.motivo || 'Sin motivo'}</Text>
                      <Text style={styles.movMeta} numberOfLines={1}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {m.employee_name ? ` · ${m.employee_name}` : ''}
                        {m.anulado ? ` · Anulado${m.anulado_por_nombre ? ' por ' + m.anulado_por_nombre : ''}` : ''}
                      </Text>
                    </View>
                    <Text style={[
                      styles.movMonto,
                      { color: m.tipo === 'deposito' ? colors.success : colors.danger },
                      m.anulado && styles.movMontoAnulado,
                    ]}>
                      {m.tipo === 'deposito' ? '+' : '−'}{formatMoney(m.monto, currency)}
                    </Text>
                    {!m.anulado && (
                      <TouchableOpacity onPress={() => { setMovError(''); setModalAnular(m.id); }} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.btnRefrescar} onPress={cargarTurno}>
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.btnRefrescarText}>Actualizar totales</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCerrar} onPress={() => setModalCierre(true)}>
              <Ionicons name="lock-closed-outline" size={20} color="#fff" />
              <Text style={styles.btnCerrarText}>Cerrar turno</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Sin turno activo */}
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={52} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No hay turno activo</Text>
              <Text style={styles.emptySubtitle}>Abre un turno para comenzar a registrar ventas</Text>
            </View>

            <TouchableOpacity style={styles.btnAbrir} onPress={() => setModal(true)}>
              <Ionicons name="lock-open-outline" size={20} color="#fff" />
              <Text style={styles.btnAbrirText}>Abrir turno</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal apertura */}
      <Modal visible={modalApertura} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Abrir turno</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Fondo inicial en caja</Text>
              <TextInput
                style={styles.input}
                value={fondoInicial}
                onChangeText={setFondo}
                placeholder={`${currency}0.00`}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={styles.hint}>El monto de efectivo con el que inicias el turno</Text>
              <TouchableOpacity
                style={[styles.btnAbrir, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={abrirTurno}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="lock-open-outline" size={20} color="#fff" />}
                <Text style={styles.btnAbrirText}>Confirmar apertura</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal cierre */}
      <Modal visible={modalCierre} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCierre(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cerrar turno</Text>
              <TouchableOpacity onPress={() => setModalCierre(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <InfoRow label="Fondo inicial"    value={formatMoney(parseFloat(turno?.fondo_inicial || 0), currency)} />
              <InfoRow label="Ventas efectivo"  value={formatMoney(totales?.total_efectivo || 0, currency)} />
              {/* La propina en efectivo entró al cajón, así que forma parte de lo
                  que el cajero debe encontrar al contar (BLOQUE 9). */}
              {(totales?.total_propinas_efectivo || 0) > 0 && (
                <InfoRow label="+ Propinas en efectivo" value={formatMoney(totales.total_propinas_efectivo, currency)} valueColor={colors.success} />
              )}
              {/* Las filas de movimientos solo aparecen si hubo: un turno sin
                  retiros ni gastos ve el mismo cierre de siempre. */}
              {(movTotales?.total_depositos || 0) > 0 && (
                <InfoRow label="+ Depósitos" value={formatMoney(movTotales.total_depositos, currency)} valueColor={colors.success} />
              )}
              {(movTotales?.total_retiros || 0) > 0 && (
                <InfoRow label="− Retiros" value={formatMoney(movTotales.total_retiros, currency)} valueColor={colors.danger} />
              )}
              {(movTotales?.total_gastos || 0) > 0 && (
                <InfoRow label="− Gastos" value={formatMoney(movTotales.total_gastos, currency)} valueColor={colors.danger} />
              )}
              <InfoRow label="Efectivo esperado" value={formatMoney(efectivoEsperado(), currency)} />
              <InfoRow label="Duración"         value={duracion(turno?.apertura)} />

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Efectivo contado en caja</Text>
              <TextInput
                style={styles.input}
                value={efectivoCierre}
                onChangeText={setEfectivo}
                placeholder={`${currency}0.00`}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              {efectivoCierre !== '' && (
                <View style={styles.diferenciaCard}>
                  <Text style={styles.diferenciaLabel}>Diferencia</Text>
                  <Text style={[
                    styles.diferenciaValue,
                    {
                      color: ((parseFloat(efectivoCierre) || 0) - efectivoEsperado()) >= 0
                        ? colors.success
                        : colors.danger
                    }
                  ]}>
                    {(() => {
                      const dif = (parseFloat(efectivoCierre) || 0) - efectivoEsperado();
                      return `${dif >= 0 ? '+' : ''}${formatMoney(Math.abs(dif), currency)}`;
                    })()}
                  </Text>
                </View>
              )}

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Notas (opcional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={notasCierre}
                onChangeText={setNotas}
                placeholder="Observaciones del turno..."
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.btnCerrar, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={cerrarTurno}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="lock-closed-outline" size={20} color="#fff" />}
                <Text style={styles.btnCerrarText}>Confirmar cierre</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      {/* Modal registrar movimiento */}
      <Modal visible={modalMov} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalMov(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{MOV_LABEL[movTipo]}</Text>
              <TouchableOpacity onPress={() => setModalMov(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <View style={styles.movTipoRow}>
                {MOV_TIPOS.map(t => (
                  <TouchableOpacity
                    key={t.tipo}
                    style={[styles.movTipoBtn, movTipo === t.tipo && styles.movTipoBtnActivo]}
                    onPress={() => { setMovTipo(t.tipo); setMovError(''); }}
                  >
                    <Ionicons name={t.icon} size={20} color={movTipo === t.tipo ? colors.primary : colors.textMuted} />
                    <Text style={[styles.movTipoLbl, movTipo === t.tipo && { color: colors.primary }]}>{t.label}</Text>
                    <Text style={styles.movTipoSub}>{t.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: spacing.lg }]}>Monto</Text>
              <TextInput
                style={styles.input}
                value={movMonto}
                onChangeText={setMovMonto}
                placeholder={`${currency}0.00`}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Motivo</Text>
              <TextInput
                style={[styles.input, { fontSize: font.md, fontWeight: '500' }]}
                value={movMotivo}
                onChangeText={setMovMotivo}
                placeholder="Ej: Compra de cilantro"
                placeholderTextColor={colors.textMuted}
                maxLength={120}
              />

              {pinRequerido(movTipo) && (
                <>
                  <Text style={[styles.label, { marginTop: spacing.md }]}>PIN de tu puesto</Text>
                  <TextInput
                    style={styles.input}
                    value={movPin}
                    onChangeText={setMovPin}
                    placeholder="••••"
                    keyboardType="number-pad"
                    maxLength={8}
                    secureTextEntry
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.hint}>Sacar dinero de la caja queda registrado a tu nombre.</Text>
                </>
              )}

              {movError ? <Text style={styles.movError}>{movError}</Text> : null}

              <TouchableOpacity
                style={[styles.btnAbrir, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={registrarMovimiento}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark" size={20} color="#fff" />}
                <Text style={styles.btnAbrirText}>Registrar {MOV_LABEL[movTipo].toLowerCase()}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal anular movimiento — nunca se borra, se marca */}
      <Modal visible={!!modalAnular} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalAnular(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Anular movimiento</Text>
              <TouchableOpacity onPress={() => setModalAnular(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.hint}>
                El movimiento quedará marcado como anulado y dejará de contar en el cierre.
                No se borra: seguirá visible con el motivo.
              </Text>

              {pinRequerido('retiro') && (
                <>
                  <Text style={[styles.label, { marginTop: spacing.lg }]}>PIN de tu puesto</Text>
                  <TextInput
                    style={styles.input}
                    value={anularPin}
                    onChangeText={setAnularPin}
                    placeholder="••••"
                    keyboardType="number-pad"
                    maxLength={8}
                    secureTextEntry
                    placeholderTextColor={colors.textMuted}
                  />
                </>
              )}

              <Text style={[styles.label, { marginTop: spacing.md }]}>Motivo (opcional)</Text>
              <TextInput
                style={[styles.input, { fontSize: font.md, fontWeight: '500' }]}
                value={anularMotivo}
                onChangeText={setAnularMotivo}
                placeholder="Ej: Monto equivocado"
                placeholderTextColor={colors.textMuted}
                maxLength={120}
              />

              {movError ? <Text style={styles.movError}>{movError}</Text> : null}

              <TouchableOpacity
                style={[styles.btnCerrar, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={anularMovimiento}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="close-circle-outline" size={20} color="#fff" />}
                <Text style={styles.btnCerrarText}>Anular movimiento</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.background },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:            { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  turnoCard:        { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  turnoHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  activeDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  turnoTitle:       { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  totalesCard:      { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  totalesTitle:     { fontSize: font.md, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel:        { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  infoValue:        { fontSize: font.sm, color: colors.textPrimary, fontWeight: '700' },
  emptyCard:        { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl, borderWidth: 1, borderColor: colors.border, gap: spacing.sm, marginBottom: spacing.lg },
  emptyTitle:       { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  emptySubtitle:    { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
  btnAbrir:         { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnAbrirText:     { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnCerrar:        { backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnCerrarText:    { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnRefrescar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  btnRefrescarText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  dragHandleWrap:   { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  label:            { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input:            { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.xl, fontWeight: '700', color: colors.textPrimary, backgroundColor: colors.surface },
  hint:             { fontSize: font.sm - 1, color: colors.textMuted, marginTop: spacing.xs },
  diferenciaCard:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  diferenciaLabel:  { fontSize: font.md, fontWeight: '600', color: colors.textSecondary },
  diferenciaValue:  { fontSize: font.xl, fontWeight: '800' },

  // Movimientos de caja
  movHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  btnMovAgregar:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  btnMovAgregarText:{ color: colors.primary, fontSize: font.sm, fontWeight: '700' },
  movVacio:         { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.md },
  movItem:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  movItemAnulado:   { opacity: 0.55 },
  movBadge:         { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  movBadgeText:     { fontSize: font.sm - 2, fontWeight: '700', color: colors.textSecondary },
  movMotivo:        { fontSize: font.sm, color: colors.textPrimary, fontWeight: '600' },
  movMeta:          { fontSize: font.sm - 2, color: colors.textMuted },
  movMonto:         { fontSize: font.sm, fontWeight: '700' },
  movMontoAnulado:  { textDecorationLine: 'line-through' },
  movError:         { color: colors.danger, fontSize: font.sm, marginTop: spacing.md },
  movTipoRow:       { flexDirection: 'row', gap: spacing.sm },
  movTipoBtn:       { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md },
  movTipoBtnActivo: { borderColor: colors.primary },
  movTipoLbl:       { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary },
  movTipoSub:       { fontSize: font.sm - 3, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 2 },
});
