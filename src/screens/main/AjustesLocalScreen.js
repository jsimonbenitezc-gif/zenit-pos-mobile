// ============================================================================
// src/screens/main/AjustesLocalScreen.js — Ajustes del negocio SIN CUENTA.
//
// Es una pantalla propia y no una versión recortada de `AjustesScreen` a base de
// condiciones: aquélla tiene 1.580 líneas dedicadas a cosas que aquí no existen
// (sucursales, puestos, plan, notificaciones, KDS, cambiar contraseña). Meter el
// modo local ahí sería sembrarla de `if (!modoLocal)` y arriesgar el camino que
// hoy funciona — la trampa 4 del BLOQUE 18: **todo es aditivo**.
//
// Solo está lo que el negocio local puede cambiar de verdad.
// ============================================================================
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Switch, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '../../context/AuthContext';
import LogoTitle from '../../components/LogoTitle';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';
import { normalizarSugerencias } from '../../utils/propinas';
import {
  isPrinterAvailable, getPairedDevices, connectPrinter, disconnectPrinter, printTest,
} from '../../utils/printer';

export default function AjustesLocalScreen() {
  const { settings, guardarAjustesLocal, salirModoLocal } = useAuth();

  const [nombre, setNombre]   = useState('');
  const [moneda, setMoneda]   = useState('$');
  const [pie, setPie]         = useState('');
  const [guardando, setGuardando] = useState(false);

  // Impuesto (§29) y propinas (§30): las mismas claves que con cuenta, para que
  // las fórmulas de src/utils/ funcionen igual sin enterarse del modo.
  const [taxOn, setTaxOn]         = useState(false);
  const [taxRate, setTaxRate]     = useState('16');
  const [taxIncl, setTaxIncl]     = useState(true);
  const [taxName, setTaxName]     = useState('IVA');
  const [propOn, setPropOn]       = useState(false);
  const [propSug, setPropSug]     = useState('10, 15, 20');

  // Impresora
  const [printerAddress, setPrinterAddress] = useState('');
  const [printerName, setPrinterName]       = useState('');
  const [modalPrinter, setModalPrinter]     = useState(false);
  const [scanning, setScanning]             = useState(false);
  const [devices, setDevices]               = useState([]);
  const [connecting, setConnecting]         = useState('');

  useEffect(() => {
    setNombre(settings.business_name || '');
    setMoneda(settings.currency_symbol || '$');
    setPie(settings.ticket_footer || '');
    setTaxOn(settings.tax_enabled === true);
    setTaxRate(String(settings.tax_rate ?? 16));
    setTaxIncl(settings.tax_included !== false);
    setTaxName(settings.tax_name || 'IVA');
    setPropOn(settings.propinas_activas === true);
    setPropSug(normalizarSugerencias(settings.propina_sugerencias).join(', '));
  }, [settings]);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync('printer_address'),
      SecureStore.getItemAsync('printer_name'),
    ]).then(([a, n]) => { setPrinterAddress(a || ''); setPrinterName(n || ''); }).catch(() => {});
  }, []);

  async function guardar() {
    const tasa = parseFloat(String(taxRate).replace(',', '.'));
    if (taxOn && (!isFinite(tasa) || tasa < 0 || tasa > 100)) {
      Alert.alert('Tasa inválida', 'El impuesto debe estar entre 0 y 100.');
      return;
    }
    setGuardando(true);
    try {
      await guardarAjustesLocal({
        business_name: nombre.trim(),
        currency_symbol: moneda.trim() || '$',
        ticket_footer: pie,
        tax_enabled: taxOn,
        // Apagar el impuesto NO borra la tasa (§29): el negocio que lo apaga un
        // mes no tiene que volver a teclear su 16% para reactivarlo.
        tax_rate: isFinite(tasa) ? tasa : 0,
        tax_included: taxIncl,
        tax_name: taxName.trim() || 'IVA',
        propinas_activas: propOn,
        propina_sugerencias: normalizarSugerencias(
          String(propSug).split(',').map(v => parseFloat(v.trim())).filter(v => isFinite(v))
        ),
      });
      Alert.alert('Guardado', 'Los ajustes se aplicaron.');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  // ── Impresora (mismo flujo que con cuenta) ────────────────────────────────
  async function buscarImpresoras() {
    if (!isPrinterAvailable()) {
      Alert.alert('No disponible', 'La impresión Bluetooth requiere el APK compilado (no funciona en Expo Go).');
      return;
    }
    setDevices([]); setModalPrinter(true); setScanning(true);
    try { setDevices(await getPairedDevices()); }
    catch (e) { Alert.alert('Error al buscar', friendlyError(e)); }
    finally { setScanning(false); }
  }

  async function elegirImpresora(device) {
    setConnecting(device.address);
    try {
      await connectPrinter(device.address);
      await disconnectPrinter(device.address);
      await SecureStore.setItemAsync('printer_address', device.address);
      await SecureStore.setItemAsync('printer_name', device.name);
      setPrinterAddress(device.address); setPrinterName(device.name);
      setModalPrinter(false);
      Alert.alert('Conectado', `Impresora "${device.name}" configurada.`);
    } catch (e) {
      Alert.alert('Error al conectar', friendlyError(e));
    } finally { setConnecting(''); }
  }

  async function probarImpresora() {
    if (!printerAddress) { Alert.alert('Sin impresora', 'Primero selecciona una impresora.'); return; }
    try { await printTest(printerAddress, nombre || 'Mi Negocio', moneda); }
    catch (e) { Alert.alert('Error al imprimir', friendlyError(e)); }
  }

  // ── Salidas del modo local ────────────────────────────────────────────────
  function irACuenta() {
    Alert.alert(
      'Crear cuenta o iniciar sesión',
      'Volverás a la pantalla de inicio. Lo que ya vendiste y capturaste NO se borra: sigue en este teléfono si vuelves al modo sin cuenta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => salirModoLocal(false) },
      ]
    );
  }

  function borrarTodo() {
    Alert.alert(
      'Borrar el negocio de este teléfono',
      'Se borran TODOS tus productos y TODAS tus ventas. No hay copia en internet: esto no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo', style: 'destructive',
          onPress: () => Alert.alert(
            '¿Seguro?', 'Última confirmación. Se perderá todo el historial.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sí, borrar', style: 'destructive', onPress: () => salirModoLocal(true) },
            ]
          ),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><LogoTitle title="Ajustes" titleStyle={styles.title} /></View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avisoLocal}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.avisoTexto}>
            Estás usando Zenit sin cuenta. Todo se guarda en este teléfono.
          </Text>
        </View>

        <Text style={styles.seccion}>Tu negocio</Text>
        <Campo label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Mi negocio" />
        <Campo label="Símbolo de moneda" value={moneda} onChangeText={setMoneda} placeholder="$" />
        <Campo label="Pie del ticket" value={pie} onChangeText={setPie} placeholder="¡Gracias por su compra!" multiline />

        <Text style={styles.seccion}>Impuesto</Text>
        <Fila label="Cobrar impuesto" value={taxOn} onValueChange={setTaxOn} />
        {taxOn && (
          <>
            <Campo label="Nombre" value={taxName} onChangeText={setTaxName} placeholder="IVA" />
            <Campo label="Tasa (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" />
            <Fila
              label="El precio ya incluye el impuesto"
              sub={taxIncl
                ? 'Un producto de 100 se cobra en 100 y el ticket desglosa el impuesto.'
                : 'Un producto de 100 se cobra en 116: el impuesto se suma aparte.'}
              value={taxIncl}
              onValueChange={setTaxIncl}
            />
          </>
        )}

        <Text style={styles.seccion}>Propinas</Text>
        <Fila label="Pedir propina al cobrar" value={propOn} onValueChange={setPropOn} />
        {propOn && (
          <Campo label="Porcentajes sugeridos" value={propSug} onChangeText={setPropSug} placeholder="10, 15, 20" />
        )}

        <TouchableOpacity style={styles.btnGuardar} onPress={guardar} disabled={guardando}>
          {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnGuardarText}>Guardar cambios</Text>}
        </TouchableOpacity>

        <Text style={styles.seccion}>Impresora</Text>
        <TouchableOpacity style={styles.opcion} onPress={buscarImpresoras}>
          <View style={{ flex: 1 }}>
            <Text style={styles.opcionLabel}>Impresora Bluetooth</Text>
            <Text style={styles.opcionSub}>{printerName || 'Sin impresora seleccionada'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {!!printerAddress && (
          <TouchableOpacity style={styles.opcion} onPress={probarImpresora}>
            <Text style={styles.opcionLabel}>Imprimir una prueba</Text>
            <Ionicons name="print-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        <Text style={styles.seccion}>Cuenta</Text>
        <TouchableOpacity style={[styles.opcion, styles.opcionDestacada]} onPress={irACuenta}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.opcionLabel, { color: colors.primary }]}>Crear una cuenta gratis</Text>
            <Text style={styles.opcionSub}>
              Respaldo automático, mesas, inventario, empleados y ver tus ventas desde otro aparato.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnPeligro} onPress={borrarTodo}>
          <Text style={styles.btnPeligroText}>Borrar el negocio de este teléfono</Text>
        </TouchableOpacity>
        <Text style={styles.notaPeligro}>
          Sin cuenta no hay copia en internet. Si borras esto o pierdes el teléfono, no se puede recuperar.
        </Text>
      </ScrollView>

      <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalPrinter(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Impresoras emparejadas</Text>
            <TouchableOpacity onPress={() => setModalPrinter(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {scanning && <ActivityIndicator color={colors.primary} />}
            {!scanning && devices.length === 0 && (
              <Text style={styles.opcionSub}>
                No hay impresoras emparejadas. Empareja la impresora desde los ajustes de Bluetooth de Android y vuelve aquí.
              </Text>
            )}
            {devices.map(d => (
              <TouchableOpacity key={d.address} style={styles.opcion} onPress={() => elegirImpresora(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionLabel}>{d.name || 'Sin nombre'}</Text>
                  <Text style={styles.opcionSub}>{d.address}</Text>
                </View>
                {connecting === d.address
                  ? <ActivityIndicator color={colors.primary} />
                  : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Campo({ label, ...props }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textMuted} {...props} />
    </View>
  );
}

function Fila({ label, sub, value, onValueChange }) {
  return (
    <View style={styles.fila}>
      <View style={{ flex: 1 }}>
        <Text style={styles.opcionLabel}>{label}</Text>
        {!!sub && <Text style={styles.opcionSub}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: colors.background },
  header:          { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title:           { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  content:         { padding: spacing.lg, paddingBottom: spacing.xxl },
  avisoLocal:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  avisoTexto:      { flex: 1, fontSize: font.sm, color: colors.textSecondary },
  seccion:         { fontSize: font.sm, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  campo:           { marginBottom: spacing.md },
  label:           { fontSize: font.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  input:           { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  fila:            { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  opcion:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  opcionDestacada: { borderColor: colors.primary },
  opcionLabel:     { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  opcionSub:       { fontSize: font.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  btnGuardar:      { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  btnGuardarText:  { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnPeligro:      { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  btnPeligroText:  { color: colors.danger, fontSize: font.md, fontWeight: '700' },
  notaPeligro:     { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:      { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
});
