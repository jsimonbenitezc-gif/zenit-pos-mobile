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
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '../../context/AuthContext';
import { zc, radios, espacios, sombra } from '../../theme';
import { Cabecera, FranjaSuperior, Icono, IconoEnCuadro, TarjetaQuien } from '../../components/ui';
import { friendlyError } from '../../utils/errors';
import { normalizarSugerencias } from '../../utils/propinas';
import {
  isPrinterAvailable, getPairedDevices, connectPrinter, disconnectPrinter, printTest,
} from '../../utils/printer';
import { resumenParaMigrar } from '../../offline/migrar';
import ModalMigrar from './ajustes/ModalMigrar';
import AvisoLicencias from '../../components/AvisoLicencias';

export default function AjustesLocalScreen() {
  const { settings, guardarAjustesLocal, salirModoLocal, crearCuentaYMigrar } = useAuth();

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

  // ── Migrar a una cuenta (Etapa 3) ─────────────────────────────────────────
  const [modalMigrar, setModalMigrar] = useState(false);
  const [resumen, setResumen] = useState(null);

  // El resumen se lee al entrar para que el botón diga CUÁNTO se va a subir. Un
  // botón que solo dice "llevarme todo" no da la confianza que hace falta para
  // tocarlo: ver "38 ventas" sí.
  useEffect(() => {
    resumenParaMigrar().then(setResumen).catch(() => setResumen(null));
  }, []);

  function abrirMigrar() {
    setModalMigrar(true);
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
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <FranjaSuperior />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Sin cuenta hay POCO que ajustar (no hay sucursales, ni puestos, ni
            plan), así que va todo en una sola página: repartirlo en tarjetas por
            tema, como en la versión con cuenta, obligaría a cavar para cambiar
            dos cosas. */}
        <Cabecera titulo="Ajustes" subtitulo="Sin cuenta · todo se guarda en este teléfono">
          <TarjetaQuien
            inicial={(nombre || 'Z')[0]?.toUpperCase()}
            nombre={nombre || 'Mi negocio'}
            detalle={resumen
              ? `${resumen.productos} producto${resumen.productos === 1 ? '' : 's'} · ${resumen.ventas} venta${resumen.ventas === 1 ? '' : 's'}`
              : 'Zenit sin cuenta'}
          />
        </Cabecera>

        <View style={styles.cuerpo}>
          <Text style={styles.seccion}>Tu negocio</Text>
          <View style={styles.tarjeta}>
            <Campo label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Mi negocio" />
            <Campo label="Símbolo de moneda" value={moneda} onChangeText={setMoneda} placeholder="$" />
            <Campo label="Pie del ticket" value={pie} onChangeText={setPie} placeholder="¡Gracias por su compra!" multiline ultimo />
          </View>

          <Text style={styles.seccion}>Impuesto</Text>
          <View style={styles.tarjeta}>
            <Fila label="Cobrar impuesto" value={taxOn} onValueChange={setTaxOn} ultimo={!taxOn} />
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
                  ultimo
                />
              </>
            )}
          </View>

          <Text style={styles.seccion}>Propinas</Text>
          <View style={styles.tarjeta}>
            <Fila label="Pedir propina al cobrar" value={propOn} onValueChange={setPropOn} ultimo={!propOn} />
            {propOn && (
              <Campo label="Porcentajes sugeridos" value={propSug} onChangeText={setPropSug} placeholder="10, 15, 20" ultimo />
            )}
          </View>

          <TouchableOpacity style={styles.btnGuardar} onPress={guardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnGuardarText}>Guardar cambios</Text>}
          </TouchableOpacity>

          <Text style={styles.seccion}>Impresora</Text>
          <View style={styles.tarjeta}>
            <TouchableOpacity style={styles.opcion} onPress={buscarImpresoras}>
              <IconoEnCuadro nombre="impresora" tono="rosa" size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.opcionLabel}>Impresora Bluetooth</Text>
                <Text style={styles.opcionSub}>{printerName || 'Sin impresora seleccionada'}</Text>
              </View>
              <Icono nombre="derecha" size={16} color={zc.flecha} />
            </TouchableOpacity>
            {!!printerAddress && (
              <TouchableOpacity style={[styles.opcion, styles.opcionLinea]} onPress={probarImpresora}>
                <IconoEnCuadro nombre="recibo" tono="gris" size={32} />
                <Text style={[styles.opcionLabel, { flex: 1 }]}>Imprimir una prueba</Text>
                <Icono nombre="derecha" size={16} color={zc.flecha} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.seccion}>Cuenta</Text>

          {/* La salida BUENA: crear cuenta SIN perder nada. Va primero y destacada
              porque es lo que el negocio quiere hacer — "irACuenta", que deja el
              historial atrás, se queda debajo para quien ya tiene una cuenta. */}
          <TouchableOpacity style={[styles.tarjeta, styles.opcion, styles.opcionDestacada]} onPress={abrirMigrar}>
            <IconoEnCuadro nombre="nubeSubir" tono="azul" size={34} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.opcionLabel, { color: zc.azul }]}>Crear cuenta y llevarme todo</Text>
              <Text style={styles.opcionSub}>
                {resumen
                  ? `Se suben tus ${resumen.productos} producto${resumen.productos === 1 ? '' : 's'}, ` +
                    `${resumen.clientes} cliente${resumen.clientes === 1 ? '' : 's'} y ${resumen.ventas} venta${resumen.ventas === 1 ? '' : 's'}. ` +
                    'Nada se borra de este teléfono.'
                  : 'Tu menú, tus clientes y tu historial de ventas se suben a tu cuenta nueva.'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tarjeta, styles.opcion]} onPress={irACuenta}>
            <IconoEnCuadro nombre="usuario" tono="gris" size={34} />
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionLabel}>Ya tengo cuenta: iniciar sesión</Text>
              <Text style={styles.opcionSub}>
                Entras a tu cuenta y este negocio se queda guardado en el teléfono, por si vuelves.
              </Text>
            </View>
            <Icono nombre="derecha" size={16} color={zc.flecha} />
          </TouchableOpacity>

          <View style={styles.tarjeta}>
            <AvisoLicencias />
          </View>

          <TouchableOpacity style={styles.btnPeligro} onPress={borrarTodo}>
            <Text style={styles.btnPeligroText}>Borrar el negocio de este teléfono</Text>
          </TouchableOpacity>
          <Text style={styles.notaPeligro}>
            Sin cuenta no hay copia en internet. Si borras esto o pierdes el teléfono, no se puede recuperar.
          </Text>
        </View>
      </ScrollView>

      <ModalMigrar
        visible={modalMigrar}
        resumen={resumen}
        onCerrar={() => setModalMigrar(false)}
        crearCuentaYMigrar={crearCuentaYMigrar}
      />

      <Modal visible={modalPrinter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalPrinter(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Impresoras emparejadas</Text>
            <TouchableOpacity onPress={() => setModalPrinter(false)}>
              <Icono nombre="cerrar" size={24} color={zc.gris} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {scanning && <ActivityIndicator color={zc.azul} />}
            {!scanning && devices.length === 0 && (
              <Text style={styles.opcionSub}>
                No hay impresoras emparejadas. Empareja la impresora desde los ajustes de Bluetooth de Android y vuelve aquí.
              </Text>
            )}
            {devices.map(d => (
              <TouchableOpacity key={d.address} style={[styles.tarjeta, styles.opcion]} onPress={() => elegirImpresora(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionLabel}>{d.name || 'Sin nombre'}</Text>
                  <Text style={styles.opcionSub}>{d.address}</Text>
                </View>
                {connecting === d.address
                  ? <ActivityIndicator color={zc.azul} />
                  : <Icono nombre="derecha" size={16} color={zc.flecha} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Campo({ label, ultimo, ...props }) {
  return (
    <View style={[styles.campo, !ultimo && styles.campoLinea]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={zc.grisSuave} {...props} />
    </View>
  );
}

function Fila({ label, sub, value, onValueChange, ultimo }) {
  return (
    <View style={[styles.fila, !ultimo && styles.campoLinea]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.opcionLabel}>{label}</Text>
        {!!sub && <Text style={styles.opcionSub}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#d9dee6', true: zc.azul }} thumbColor="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: zc.fondo },
  content:         { paddingBottom: 36 },
  cuerpo:          { paddingHorizontal: espacios.borde, paddingTop: 4 },
  seccion:         { fontSize: 13, fontWeight: '500', color: zc.gris, marginTop: 16, marginBottom: 8, marginLeft: 4 },
  tarjeta:         { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginBottom: 8, ...sombra },
  campo:           { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  campoLinea:      { borderBottomWidth: 1, borderBottomColor: zc.linea },
  label:           { fontSize: 12.5, color: zc.gris },
  input:           { fontSize: 15, color: zc.tinta, paddingVertical: 2, paddingHorizontal: 0 },
  fila:            { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  opcion:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  opcionLinea:     { borderTopWidth: 1, borderTopColor: zc.linea },
  opcionDestacada: { borderWidth: 1.5, borderColor: zc.azul },
  opcionLabel:     { fontSize: 15, color: zc.tinta },
  opcionSub:       { fontSize: 12.5, color: zc.grisSuave, marginTop: 2, lineHeight: 17 },
  btnGuardar:      { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 13, alignItems: 'center', marginTop: 12, minHeight: 46, justifyContent: 'center' },
  btnGuardarText:  { color: '#fff', fontSize: 15, fontWeight: '500' },
  btnPeligro:      { backgroundColor: zc.rojoSuave, borderRadius: radios.boton, padding: 13, alignItems: 'center', marginTop: 14 },
  btnPeligroText:  { color: zc.rojo, fontSize: 15, fontWeight: '500' },
  notaPeligro:     { fontSize: 12.5, color: zc.grisSuave, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: zc.linea, backgroundColor: zc.tarjeta },
  modalTitle:      { fontSize: 17, fontWeight: '500', color: zc.tinta },
});
