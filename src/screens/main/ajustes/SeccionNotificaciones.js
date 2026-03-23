import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert } from 'react-native';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { SectionTitle, SectionCard, SwitchRow } from './shared';
import { friendlyError } from '../../../utils/errors';

export function SeccionNotificaciones({ initialSettings, styles }) {
  // ── Estado: notificaciones push ───────────────────────────────────────
  const [notifTurnoAbierto, setNotifTurnoAbierto]     = useState(true);
  const [notifTurnoCerrado, setNotifTurnoCerrado]     = useState(true);
  const [notifDiferenciaCaja, setNotifDiferenciaCaja] = useState(true);
  const [notifDifUmbral, setNotifDifUmbral]           = useState('50');
  const [notifTurnoLargo, setNotifTurnoLargo]         = useState(true);
  const [notifTurnoHoras, setNotifTurnoHoras]         = useState('8');
  const [notifStockCero, setNotifStockCero]           = useState(true);
  const [notifAjusteInv, setNotifAjusteInv]           = useState(true);
  const [notifVentaGrande, setNotifVentaGrande]       = useState(true);
  const [notifVentaUmbral, setNotifVentaUmbral]       = useState('500');
  const [notifDescuentoPin, setNotifDescuentoPin]     = useState(true);
  const [notifPedidoCancelado, setNotifPedidoCancelado] = useState(true);
  const [notifVentaAnulada, setNotifVentaAnulada]     = useState(true);
  const [notifNuevoAcceso, setNotifNuevoAcceso]       = useState(true);
  const [notifResumenDiario, setNotifResumenDiario]   = useState(true);
  const [notifResumenHora, setNotifResumenHora]       = useState('22');
  const [notifResumenSemanal, setNotifResumenSemanal] = useState(true);
  const [notifClienteNuevo, setNotifClienteNuevo]     = useState(false);
  const [notifPuntosCanjeados, setNotifPuntosCanjeados] = useState(true);
  const [savingNotif, setSavingNotif]                 = useState(false);

  // Initialize state from parent's loaded settings
  useEffect(() => {
    if (!initialSettings) return;
    const s = initialSettings;
    if (s.notif_turno_abierto !== undefined)        setNotifTurnoAbierto(s.notif_turno_abierto);
    if (s.notif_turno_cerrado !== undefined)        setNotifTurnoCerrado(s.notif_turno_cerrado);
    if (s.notif_diferencia_caja !== undefined)      setNotifDiferenciaCaja(s.notif_diferencia_caja);
    if (s.notif_diferencia_caja_umbral !== undefined) setNotifDifUmbral(String(s.notif_diferencia_caja_umbral));
    if (s.notif_turno_largo !== undefined)          setNotifTurnoLargo(s.notif_turno_largo);
    if (s.notif_turno_largo_horas !== undefined)    setNotifTurnoHoras(String(s.notif_turno_largo_horas));
    if (s.notif_stock_cero !== undefined)           setNotifStockCero(s.notif_stock_cero);
    if (s.notif_ajuste_inventario !== undefined)    setNotifAjusteInv(s.notif_ajuste_inventario);
    if (s.notif_venta_grande !== undefined)         setNotifVentaGrande(s.notif_venta_grande);
    if (s.notif_venta_grande_umbral !== undefined)  setNotifVentaUmbral(String(s.notif_venta_grande_umbral));
    if (s.notif_descuento_pin !== undefined)        setNotifDescuentoPin(s.notif_descuento_pin);
    if (s.notif_pedido_cancelado !== undefined)     setNotifPedidoCancelado(s.notif_pedido_cancelado);
    if (s.notif_venta_anulada !== undefined)        setNotifVentaAnulada(s.notif_venta_anulada);
    if (s.notif_nuevo_acceso !== undefined)         setNotifNuevoAcceso(s.notif_nuevo_acceso);
    if (s.notif_resumen_diario !== undefined)       setNotifResumenDiario(s.notif_resumen_diario);
    if (s.notif_resumen_diario_hora !== undefined)  setNotifResumenHora(String(s.notif_resumen_diario_hora));
    if (s.notif_resumen_semanal !== undefined)      setNotifResumenSemanal(s.notif_resumen_semanal);
    if (s.notif_cliente_nuevo !== undefined)        setNotifClienteNuevo(s.notif_cliente_nuevo);
    if (s.notif_puntos_canjeados !== undefined)     setNotifPuntosCanjeados(s.notif_puntos_canjeados);
  }, [initialSettings]);

  async function toggleNotif(key, val, setter) {
    setter(val);
    try { await api.updateSettings({ [key]: val }); } catch { setter(!val); Alert.alert('Error', 'No se pudo guardar'); }
  }

  async function guardarUmbralesNotif() {
    setSavingNotif(true);
    try {
      await api.updateSettings({
        notif_diferencia_caja_umbral: parseFloat(notifDifUmbral) || 50,
        notif_turno_largo_horas:      parseFloat(notifTurnoHoras) || 8,
        notif_venta_grande_umbral:    parseFloat(notifVentaUmbral) || 500,
        notif_resumen_diario_hora:    parseInt(notifResumenHora) || 22,
      });
      Alert.alert('Guardado', 'Umbrales de notificación actualizados.');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setSavingNotif(false);
    }
  }

  return (
    <>
      <SectionTitle label="Notificaciones" />
      <Text style={styles.sectionSub}>
        Recibe alertas en tu teléfono sobre lo que pasa en tu negocio, incluso cuando no tienes la app abierta.
      </Text>

      {/* Turnos y Caja */}
      <Text style={[styles.sectionTitle, { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm }]}>Turnos y Caja</Text>
      <SectionCard>
        <SwitchRow label="Turno abierto" sub="Cuando un empleado abre caja" value={notifTurnoAbierto} onChange={v => toggleNotif('notif_turno_abierto', v, setNotifTurnoAbierto)} />
        <SwitchRow label="Turno cerrado" sub="Resumen al cerrar caja (pedidos y ventas)" value={notifTurnoCerrado} onChange={v => toggleNotif('notif_turno_cerrado', v, setNotifTurnoCerrado)} />
        <SwitchRow label="Diferencia de caja" sub={`Cuando la diferencia supera $${notifDifUmbral}`} value={notifDiferenciaCaja} onChange={v => toggleNotif('notif_diferencia_caja', v, setNotifDiferenciaCaja)} />
        {notifDiferenciaCaja && (
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Umbral diferencia ($)</Text>
            <TextInput style={styles.fieldInput} value={notifDifUmbral} onChangeText={setNotifDifUmbral} keyboardType="decimal-pad" />
          </View>
        )}
        <SwitchRow label="Turno abierto demasiado tiempo" sub={`Si llevan más de ${notifTurnoHoras}h sin cerrar`} value={notifTurnoLargo} onChange={v => toggleNotif('notif_turno_largo', v, setNotifTurnoLargo)} />
        {notifTurnoLargo && (
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Horas límite</Text>
            <TextInput style={styles.fieldInput} value={notifTurnoHoras} onChangeText={setNotifTurnoHoras} keyboardType="decimal-pad" />
          </View>
        )}
      </SectionCard>

      {/* Ventas */}
      <Text style={[styles.sectionTitle, { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm }]}>Ventas</Text>
      <SectionCard>
        <SwitchRow label="Venta grande" sub={`Cuando una venta supera $${notifVentaUmbral}`} value={notifVentaGrande} onChange={v => toggleNotif('notif_venta_grande', v, setNotifVentaGrande)} />
        {notifVentaGrande && (
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Umbral venta ($)</Text>
            <TextInput style={styles.fieldInput} value={notifVentaUmbral} onChangeText={setNotifVentaUmbral} keyboardType="decimal-pad" />
          </View>
        )}
        <SwitchRow label="Descuento con PIN aplicado" sub="Cuando se autoriza un descuento especial" value={notifDescuentoPin} onChange={v => toggleNotif('notif_descuento_pin', v, setNotifDescuentoPin)} />
        <SwitchRow label="Pedido cancelado" sub="Cuando se cancela un pedido" value={notifPedidoCancelado} onChange={v => toggleNotif('notif_pedido_cancelado', v, setNotifPedidoCancelado)} />
        <SwitchRow label="Venta eliminada" sub="Cuando se elimina un pedido del sistema" value={notifVentaAnulada} onChange={v => toggleNotif('notif_venta_anulada', v, setNotifVentaAnulada)} last />
      </SectionCard>

      {/* Inventario */}
      <Text style={[styles.sectionTitle, { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm }]}>Inventario</Text>
      <SectionCard>
        <SwitchRow label="Producto sin stock" sub="Cuando un producto llega a 0 unidades" value={notifStockCero} onChange={v => toggleNotif('notif_stock_cero', v, setNotifStockCero)} />
        <SwitchRow label="Ajuste de inventario" sub="Cuando un empleado registra una merma o entrada" value={notifAjusteInv} onChange={v => toggleNotif('notif_ajuste_inventario', v, setNotifAjusteInv)} last />
      </SectionCard>

      {/* Empleados y Clientes */}
      <Text style={[styles.sectionTitle, { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm }]}>Empleados y Clientes</Text>
      <SectionCard>
        <SwitchRow label="Nuevo acceso al sistema" sub="Cuando alguien inicia sesión en la app" value={notifNuevoAcceso} onChange={v => toggleNotif('notif_nuevo_acceso', v, setNotifNuevoAcceso)} />
        <SwitchRow label="Nuevo cliente registrado" sub="Al agregar un cliente a la base de datos" value={notifClienteNuevo} onChange={v => toggleNotif('notif_cliente_nuevo', v, setNotifClienteNuevo)} />
        <SwitchRow label="Puntos canjeados" sub="Cuando un cliente usa puntos de fidelidad" value={notifPuntosCanjeados} onChange={v => toggleNotif('notif_puntos_canjeados', v, setNotifPuntosCanjeados)} last />
      </SectionCard>

      {/* Reportes programados */}
      <Text style={[styles.sectionTitle, { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm }]}>Reportes programados</Text>
      <SectionCard>
        <SwitchRow label="Resumen diario" sub={`Se envía a las ${notifResumenHora}:00 hrs`} value={notifResumenDiario} onChange={v => toggleNotif('notif_resumen_diario', v, setNotifResumenDiario)} />
        {notifResumenDiario && (
          <View style={[styles.fieldRow, styles.menuItemBorder]}>
            <Text style={styles.fieldLabel}>Hora de envío (0–23)</Text>
            <TextInput style={styles.fieldInput} value={notifResumenHora} onChangeText={setNotifResumenHora} keyboardType="number-pad" />
          </View>
        )}
        <SwitchRow label="Resumen semanal" sub="Cada lunes a las 8 AM con el total de la semana" value={notifResumenSemanal} onChange={v => toggleNotif('notif_resumen_semanal', v, setNotifResumenSemanal)} last />
      </SectionCard>

      {/* Botón guardar umbrales */}
      <TouchableOpacity
        style={[styles.btnSave, savingNotif && { opacity: 0.6 }]}
        onPress={guardarUmbralesNotif}
        disabled={savingNotif}
      >
        <Text style={styles.btnSaveText}>{savingNotif ? 'Guardando...' : 'Guardar umbrales y horarios'}</Text>
      </TouchableOpacity>
    </>
  );
}
