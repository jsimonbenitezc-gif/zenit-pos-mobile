import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  // Con alias A PROPÓSITO: los handlers de esta pantalla se llaman igual
  // (abrirTurno, cerrarTurno…). Sin renombrar, cada handler se taparía a sí
  // mismo y se llamaría en bucle en vez de llamar al adaptador.
  turnoActivo as cajaTurnoActivo,
  abrirTurno as cajaAbrirTurno,
  totalesTurno as cajaTotales,
  cerrarTurno as cajaCerrarTurno,
  movimientosCaja as cajaMovimientos,
  registrarMovimiento as cajaRegistrarMovimiento,
  anularMovimiento as cajaAnularMovimiento,
} from '../../offline/caja';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';
import { Cabecera, Icono, IconoEnCuadro, NumeroGrande } from '../../components/ui';
// El componente Y su `tocaAvisar` viven en el mismo archivo: los dos se usaban
// aqui sin importar, y la pantalla reventaba al abrirse (ReferenceError).
import AvisoSinCuenta, { tocaAvisar } from '../../components/AvisoSinCuenta';
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
  const { settings, user, sucursalId, puedeRegistrarEnSucursal, nombreActivo, rolActivo, modoLocal, salirModoLocal } = useAuth();
  const currency = settings?.currency_symbol || '$';
  const [turno, setTurno]           = useState(null);
  const [totales, setTotales]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [modalApertura, setModal]   = useState(false);
  const [modalCierre, setModalCierre] = useState(false);
  // Aviso de respaldo del negocio sin cuenta (41.4c). Se usaba sin declarar.
  const [aviso, setAviso]           = useState(null);

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
  const pinMovimientos = !modoLocal && settings?.movimientos_caja_pin !== false;
  const pinRequerido = (tipo) => tipo !== 'deposito' && pinMovimientos;

  const cargarTurno = useCallback(async () => {
    try {
      const t = await cajaTurnoActivo(sucursalId);
      setTurno(t || null);
      if (t) {
        const tots = await cajaTotales(t.id).catch(() => null);
        setTotales(tots);
        const movs = await cajaMovimientos(t.id).catch(() => null);
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
      const nuevo = await cajaAbrirTurno(cajeroNombre, rolActivo || null, fondo, sucursalId);
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
      await cajaRegistrarMovimiento(turno.id, {
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
      await cajaAnularMovimiento(turno.id, modalAnular, {
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
              const resumenDelDia = {
                ventas: totales?.total_pedidos ?? 0,
                total: totales?.total_ventas ?? 0,
                moneda: currency,
              };
              await cajaCerrarTurno(turno.id, efectivo, notasCierre || null, efectivoEsperado());
              setTurno(null);
              setTotales(null);
              setModalCierre(false);
              setEfectivo('');
              setNotas('');
              // Sin cuenta, el corte que acaba de cerrar existe SOLO aquí. Es el
              // mejor momento para decirlo: final del día, nadie con prisa y
              // mirando el dinero que hizo. Como mucho una vez al día.
              if (modoLocal && await tocaAvisar()) setAviso(resumenDelDia);
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
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Cabecera azul noche (diseño A): con turno abierto, lo vendido en grande */}
      <Cabecera titulo="Turno">
        {turno && totales ? (
          <View style={{ marginTop: 14 }}>
            <NumeroGrande etiqueta="Vendido en este turno" valor={formatMoney(totales.total_ventas || 0, currency)} />
            <View style={styles.cabLinea}>
              <View style={styles.cabDot} />
              <Text style={styles.cabLineaTxt}>
                {totales.total_pedidos || 0} {(totales.total_pedidos || 0) === 1 ? 'pedido' : 'pedidos'} · abierto hace {duracion(turno.apertura)}
              </Text>
            </View>
          </View>
        ) : null}
      </Cabecera>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>

        {turno ? (
          <>
            {/* Turno activo */}
            <View style={styles.turnoCard}>
              <View style={styles.turnoHeader}>
                <IconoEnCuadro nombre="time-outline" tono="verde" />
                <Text style={styles.turnoTitle}>Turno activo</Text>
                <View style={styles.activeDot} />
              </View>
              <InfoRow label="Cajero"        value={turno.cajero_nombre} />
              <InfoRow label="Inicio"        value={formatDate(turno.apertura)} />
              <InfoRow label="Duración"      value={duracion(turno.apertura)} />
              <InfoRow label="Fondo inicial" value={formatMoney(parseFloat(turno.fondo_inicial || 0), currency)} />
            </View>

            {totales && (
              <View style={styles.totalesCard}>
                <View style={styles.tituloFila}>
                  <IconoEnCuadro nombre="recibo" tono="azul" />
                  <Text style={styles.totalesTitle}>Ventas del turno</Text>
                </View>
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
                      valueColor={zc.verde}
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
                <IconoEnCuadro nombre="cash-outline" tono="ambar" />
                <Text style={styles.totalesTitle}>Movimientos de caja</Text>
                <TouchableOpacity style={styles.btnMovAgregar} onPress={abrirModalMovimiento}>
                  <Icono nombre="add" size={15} color={zc.azul} />
                  <Text style={styles.btnMovAgregarText}>Registrar</Text>
                </TouchableOpacity>
              </View>

              {(movTotales.total_depositos > 0 || movTotales.total_retiros > 0 || movTotales.total_gastos > 0) && (
                <>
                  {movTotales.total_depositos > 0 && (
                    <InfoRow label="Depósitos" value={`+${formatMoney(movTotales.total_depositos, currency)}`} valueColor={zc.verde} />
                  )}
                  {movTotales.total_retiros > 0 && (
                    <InfoRow label="Retiros" value={`−${formatMoney(movTotales.total_retiros, currency)}`} valueColor={zc.rojo} />
                  )}
                  {movTotales.total_gastos > 0 && (
                    <InfoRow label="Gastos" value={`−${formatMoney(movTotales.total_gastos, currency)}`} valueColor={zc.rojo} />
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
                      { color: m.tipo === 'deposito' ? zc.verde : zc.rojo },
                      m.anulado && styles.movMontoAnulado,
                    ]}>
                      {m.tipo === 'deposito' ? '+' : '−'}{formatMoney(m.monto, currency)}
                    </Text>
                    {!m.anulado && (
                      <TouchableOpacity onPress={() => { setMovError(''); setModalAnular(m.id); }} hitSlop={8}>
                        <Icono nombre="close-circle-outline" size={20} color={zc.grisSuave} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.btnRefrescar} onPress={cargarTurno}>
              <Icono nombre="refresh-outline" size={17} color={zc.azul} />
              <Text style={styles.btnRefrescarText}>Actualizar totales</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCerrar} onPress={() => setModalCierre(true)}>
              <Icono nombre="lock-closed-outline" size={20} color="#fff" />
              <Text style={styles.btnCerrarText}>Cerrar turno</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Sin turno activo */}
            <View style={styles.emptyCard}>
              <IconoEnCuadro nombre="time-outline" tono="azul" size={64} />
              <Text style={styles.emptyTitle}>No hay turno activo</Text>
              <Text style={styles.emptySubtitle}>Abre un turno para comenzar a registrar ventas</Text>
            </View>

            <TouchableOpacity style={styles.btnAbrir} onPress={() => setModal(true)}>
              <Icono nombre="lock-open-outline" size={20} color="#fff" />
              <Text style={styles.btnAbrirText}>Abrir turno</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal apertura */}
      <Modal visible={modalApertura} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Abrir turno</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Icono nombre="close" size={24} color={zc.gris} />
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
                  : <Icono nombre="lock-open-outline" size={20} color="#fff" />}
                <Text style={styles.btnAbrirText}>Confirmar apertura</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal cierre */}
      <Modal visible={modalCierre} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCierre(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cerrar turno</Text>
              <TouchableOpacity onPress={() => setModalCierre(false)}>
                <Icono nombre="close" size={24} color={zc.gris} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <View style={styles.resumenCaja}>
              <InfoRow label="Fondo inicial"    value={formatMoney(parseFloat(turno?.fondo_inicial || 0), currency)} />
              <InfoRow label="Ventas efectivo"  value={formatMoney(totales?.total_efectivo || 0, currency)} />
              {/* La propina en efectivo entró al cajón, así que forma parte de lo
                  que el cajero debe encontrar al contar (BLOQUE 9). */}
              {(totales?.total_propinas_efectivo || 0) > 0 && (
                <InfoRow label="+ Propinas en efectivo" value={formatMoney(totales.total_propinas_efectivo, currency)} valueColor={zc.verde} />
              )}
              {/* Las filas de movimientos solo aparecen si hubo: un turno sin
                  retiros ni gastos ve el mismo cierre de siempre. */}
              {(movTotales?.total_depositos || 0) > 0 && (
                <InfoRow label="+ Depósitos" value={formatMoney(movTotales.total_depositos, currency)} valueColor={zc.verde} />
              )}
              {(movTotales?.total_retiros || 0) > 0 && (
                <InfoRow label="− Retiros" value={formatMoney(movTotales.total_retiros, currency)} valueColor={zc.rojo} />
              )}
              {(movTotales?.total_gastos || 0) > 0 && (
                <InfoRow label="− Gastos" value={formatMoney(movTotales.total_gastos, currency)} valueColor={zc.rojo} />
              )}
              <InfoRow label="Efectivo esperado" value={formatMoney(efectivoEsperado(), currency)} />
              <InfoRow label="Duración"         value={duracion(turno?.apertura)} />
              </View>

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
                        ? zc.verde
                        : zc.rojo
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
                  : <Icono nombre="lock-closed-outline" size={20} color="#fff" />}
                <Text style={styles.btnCerrarText}>Confirmar cierre</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      {/* Modal registrar movimiento */}
      <Modal visible={modalMov} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalMov(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{MOV_LABEL[movTipo]}</Text>
              <TouchableOpacity onPress={() => setModalMov(false)}>
                <Icono nombre="close" size={24} color={zc.gris} />
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
                    <Icono nombre={t.icon} size={20} color={movTipo === t.tipo ? zc.azul : zc.grisSuave} />
                    <Text style={[styles.movTipoLbl, movTipo === t.tipo && { color: zc.azul }]}>{t.label}</Text>
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
                style={[styles.input, { fontSize: 15, fontWeight: '400' }]}
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
                  : <Icono nombre="checkmark" size={20} color="#fff" />}
                <Text style={styles.btnAbrirText}>Registrar {MOV_LABEL[movTipo].toLowerCase()}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal anular movimiento — nunca se borra, se marca */}
      <Modal visible={!!modalAnular} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalAnular(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.dragHandleWrap}><View style={styles.dragHandle} /></View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Anular movimiento</Text>
              <TouchableOpacity onPress={() => setModalAnular(null)}>
                <Icono nombre="close" size={24} color={zc.gris} />
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
                style={[styles.input, { fontSize: 15, fontWeight: '400' }]}
                value={anularMotivo}
                onChangeText={setAnularMotivo}
                placeholder="Ej: Monto equivocado"
                placeholderTextColor={colors.textMuted}
                maxLength={120}
              />

              {movError ? <Text style={styles.movError}>{movError}</Text> : null}

              <TouchableOpacity
                style={[styles.btnCerrar, styles.btnAnular, { marginTop: spacing.xl, opacity: saving ? 0.6 : 1 }]}
                onPress={anularMovimiento}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icono nombre="close-circle-outline" size={20} color="#fff" />}
                <Text style={styles.btnCerrarText}>Anular movimiento</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Aviso del negocio sin cuenta, tras cerrar el corte (BLOQUE 18, Etapa 2) */}
      <AvisoSinCuenta
        visible={!!aviso}
        resumen={aviso}
        onClose={() => setAviso(null)}
        onCrearCuenta={() => { setAviso(null); salirModoLocal(false); }}
      />
    </SafeAreaView>
  );
}

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };
const caja  = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: zc.fondo },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cabLinea:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cabDot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' },
  cabLineaTxt:      { fontSize: 13, color: zc.enNocheSuave },
  turnoCard:        { ...caja, padding: 16, marginBottom: 12 },
  turnoHeader:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  activeDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: zc.verde },
  turnoTitle:       { fontSize: 15, fontWeight: '500', color: zc.tinta, flex: 1 },
  totalesCard:      { ...caja, padding: 16, marginBottom: 12 },
  totalesTitle:     { fontSize: 15, fontWeight: '500', color: zc.tinta, flex: 1 },
  tituloFila:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: zc.linea },
  infoLabel:        { fontSize: 13.5, color: zc.gris },
  infoValue:        { fontSize: 14, color: zc.tinta, fontWeight: '500', fontVariant: ['tabular-nums'] },
  emptyCard:        { alignItems: 'center', ...caja, padding: 28, gap: spacing.sm, marginBottom: 14 },
  emptyTitle:       { fontSize: 17, fontWeight: '500', color: zc.tinta, marginTop: 6 },
  emptySubtitle:    { fontSize: 13.5, color: zc.grisSuave, textAlign: 'center' },
  btnAbrir:         { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnAbrirText:     { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnCerrar:        { backgroundColor: zc.noche, borderRadius: radios.boton, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  btnCerrarText:    { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnAnular:        { backgroundColor: zc.rojo },
  btnRefrescar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 6 },
  btnRefrescarText: { color: zc.azul, fontSize: 14, fontWeight: '500' },
  dragHandleWrap:   { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  dragHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: '#d5dae2' },
  modalSafe:        { flex: 1, backgroundColor: zc.fondo },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  modalTitle:       { fontSize: 19, fontWeight: '500', color: zc.tinta },
  resumenCaja:      { ...caja, paddingHorizontal: 16, paddingVertical: 4 },
  label:            { fontSize: 13, color: zc.gris, marginBottom: 6 },
  input:            { ...campo, padding: 12, fontSize: 20, fontWeight: '700', color: zc.tinta },
  hint:             { fontSize: 12.5, color: zc.grisSuave, marginTop: 6, lineHeight: 18 },
  diferenciaCard:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...caja, padding: 14, marginTop: 12 },
  diferenciaLabel:  { fontSize: 14, color: zc.gris },
  diferenciaValue:  { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Movimientos de caja
  movHeader:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  btnMovAgregar:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: zc.azulSuave, borderRadius: radios.chip, paddingHorizontal: 11, paddingVertical: 6 },
  btnMovAgregarText:{ color: zc.azul, fontSize: 13, fontWeight: '500' },
  movVacio:         { color: zc.grisSuave, fontSize: 13.5, textAlign: 'center', paddingVertical: 12 },
  movItem:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: zc.linea },
  movItemAnulado:   { opacity: 0.55 },
  movBadge:         { backgroundColor: zc.fondo, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  movBadgeText:     { fontSize: 12, color: zc.gris },
  movMotivo:        { fontSize: 14, color: zc.tinta },
  movMeta:          { fontSize: 12, color: zc.grisSuave, marginTop: 1 },
  movMonto:         { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  movMontoAnulado:  { textDecorationLine: 'line-through' },
  movError:         { color: zc.rojo, fontSize: 13.5, marginTop: spacing.md },
  movTipoRow:       { flexDirection: 'row', gap: spacing.sm },
  movTipoBtn:       { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 14, ...caja, borderRadius: radios.boton, borderWidth: 1.5, borderColor: 'transparent' },
  movTipoBtnActivo: { borderColor: zc.azul, backgroundColor: zc.azulSuave },
  movTipoLbl:       { fontSize: 14, fontWeight: '500', color: zc.tinta },
  movTipoSub:       { fontSize: 11, color: zc.grisSuave, textAlign: 'center', paddingHorizontal: 2 },
});
