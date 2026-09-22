import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { listarClientes, crearCliente, actualizarCliente } from '../../offline/clientes';
import {
  verificarPinPuesto, pinBloqueado, minutosBloqueoPin,
  registrarFalloPin, resetFallosPin,
} from '../../offline/credenciales';
import { useAuth } from '../../context/AuthContext';
import { zc, tonos, radios, espacios, sombra } from '../../theme';
import { Cabecera, Icono, tonoPorColor } from '../../components/ui';
import { friendlyError } from '../../utils/errors';

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

function avatarColor(name) {
  const code = (name || '?').charCodeAt(0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function ClientesScreen() {
  const { settings, user, isPremium, nombreActivo, rolActivo, permisosRolesEfectivos, modoLocal } = useAuth();

  const [clientes, setClientes]     = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [tab, setTab]               = useState('todos');       // 'todos' | 'fidelidad'
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling]     = useState(new Set());    // IDs siendo modificados

  // Modal nuevo cliente
  const [modalNuevo, setModalNuevo]     = useState(false);
  const [nombre, setNombre]             = useState('');
  const [telefono, setTelefono]         = useState('');
  const [direccion, setDireccion]       = useState('');
  const [guardando, setGuardando]       = useState(false);

  // Modal editar cliente
  const [modalEditar, setModalEditar]   = useState(false);
  const [editando, setEditando]         = useState(null);
  const [editNombre, setEditNombre]     = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  // Modal PIN para editar cliente
  const [pinEditModal, setPinEditModal] = useState(false);
  const [pinEditValue, setPinEditValue] = useState('');
  const [pinEditError, setPinEditError] = useState('');
  const [pinEditLoading, setPinEditLoading] = useState(false);
  const pinEditRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await listarClientes();
      setClientes(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la lista de clientes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function guardar() {
    if (!nombre.trim() || !telefono.trim()) {
      Alert.alert('Campos requeridos', 'Nombre y teléfono son obligatorios.');
      return;
    }
    setGuardando(true);
    try {
      const payload = { name: nombre.trim(), phone: telefono.trim() };
      if (direccion.trim()) payload.address = direccion.trim();
      const c = await crearCliente(payload);
      setClientes(prev => [c, ...prev]);
      setModalNuevo(false);
      setNombre(''); setTelefono(''); setDireccion('');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  function abrirEditar(cliente) {
    setEditando(cliente);
    setEditNombre(cliente.name || '');
    setEditTelefono(cliente.phone || '');
    setEditDireccion(cliente.address || '');
    setModalEditar(true);
  }

  function guardarEdicion() {
    if (!editNombre.trim() || !editTelefono.trim()) {
      Alert.alert('Campos requeridos', 'Nombre y teléfono son obligatorios.');
      return;
    }
    // Mostrar modal de PIN antes de guardar
    setPinEditValue('');
    setPinEditError('');
    setPinEditModal(true);
  }

  async function confirmarEdicionConPin() {
    if (!pinEditValue) { setPinEditError('Ingresa tu PIN'); return; }
    if (pinBloqueado()) {
      setPinEditError(`Demasiados intentos. Espera ${minutosBloqueoPin()} min.`);
      return;
    }
    setPinEditLoading(true);
    setPinEditError('');
    try {
      const perfilActual = modoLocal ? null : permisosRolesEfectivos?.[rolActivo];
      if (perfilActual?.pin_set) {
        const result = await verificarPinPuesto(rolActivo, pinEditValue, permisosRolesEfectivos);
        if (!result.valido) {
          registrarFalloPin();
          setPinEditError(pinBloqueado() ? 'Demasiados intentos. Espera 5 min.' : 'PIN incorrecto');
          setPinEditLoading(false);
          return;
        }
        resetFallosPin();
      }

      // PIN válido: guardar con auditoría
      setGuardandoEditar(true);
      const payload = { name: editNombre.trim(), phone: editTelefono.trim(), address: editDireccion.trim() || null };
      const updated = await actualizarCliente(editando.id, {
        ...payload,
        payload,
        auth: { employee_id: rolActivo, pin: pinEditValue, employee_name: nombreActivo || '' },
      });
      setClientes(prev => prev.map(c => c.id === editando.id ? { ...c, ...updated } : c));
      setPinEditModal(false);
      setModalEditar(false);
    } catch (e) {
      setPinEditError(e.message || 'Error al guardar');
    } finally {
      setPinEditLoading(false);
      setGuardandoEditar(false);
    }
  }

  async function toggleFidelidad(cliente) {
    if (!isPremium) {
      Alert.alert('Función Premium', 'El programa de fidelidad está disponible en el plan Premium.');
      return;
    }
    const nuevo = !cliente.in_loyalty;
    setToggling(prev => new Set([...prev, cliente.id]));
    try {
      await api.updateCustomerLoyalty(cliente.id, { in_loyalty: nuevo });
      setClientes(prev =>
        prev.map(c => c.id === cliente.id ? { ...c, in_loyalty: nuevo } : c)
      );
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(cliente.id); return s; });
    }
  }

  const filtrados = clientes.filter(c => {
    const matchBusqueda = !busqueda ||
      c.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.phone?.includes(busqueda);
    const matchTab = tab === 'todos' || c.in_loyalty === true;
    return matchBusqueda && matchTab;
  });

  const enFidelidad = clientes.filter(c => c.in_loyalty).length;

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={zc.azul} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {/* Cabecera azul noche con el buscador dentro (carcasa A) */}
      <Cabecera
        titulo="Clientes"
        subtitulo={`${clientes.length} registrado${clientes.length === 1 ? '' : 's'}${!modoLocal && enFidelidad ? ` · ${enFidelidad} en puntos` : ''}`}
        derecha={(
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalNuevo(true)} activeOpacity={0.85}>
            <Icono nombre="usuarioMas" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Nuevo</Text>
          </TouchableOpacity>
        )}
      >
        <View style={styles.searchWrap}>
          <Icono nombre="buscar" size={17} color={zc.grisSuave} />
          <TextInput
            style={styles.search}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder={tab === 'fidelidad' ? 'Buscar en programa...' : 'Buscar por nombre o teléfono'}
            placeholderTextColor={zc.grisSuave}
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda('')}>
              <Icono nombre="circuloX" size={17} color={zc.grisSuave} />
            </TouchableOpacity>
          )}
        </View>
      </Cabecera>

      {/* Pestañas de subrayado. Sin cuenta NO hay programa de fidelidad (§13):
          los puntos los calcula y descuenta el servidor dentro de la misma
          transacción de la venta, así que aquí no se pueden ofrecer sin
          inventar un saldo. */}
      {!modoLocal && (
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'todos' && styles.tabActive]}
          onPress={() => setTab('todos')}
        >
          <Text style={[styles.tabText, tab === 'todos' && styles.tabTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'fidelidad' && styles.tabActive]}
          onPress={() => setTab('fidelidad')}
        >
          <Text style={[styles.tabText, tab === 'fidelidad' && styles.tabTextActive]}>
            Fidelidad
          </Text>
          {enFidelidad > 0 && (
            <View style={[styles.badge, tab === 'fidelidad' && styles.badgeActive]}>
              <Text style={[styles.badgeText, tab === 'fidelidad' && styles.badgeTextActive]}>
                {enFidelidad}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      )}

      {/* Info fidelidad cuando está en ese tab */}
      {tab === 'fidelidad' && (
        <View style={styles.fidelidadInfo}>
          <Icono nombre="estrella" size={14} color={tonos.lila.icono} relleno />
          <Text style={styles.fidelidadInfoText}>
            {enFidelidad === 0
              ? 'Ningún cliente en el programa aún. Activa la estrella en cada cliente.'
              : `${enFidelidad} ${enFidelidad === 1 ? 'cliente inscrito' : 'clientes inscritos'} en el programa`
            }
          </Text>
        </View>
      )}

      <FlatList
        data={filtrados}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        renderItem={({ item, index }) => <ClienteCard item={item} primera={index === 0} onEdit={abrirEditar} onToggleFidelidad={toggleFidelidad} toggling={toggling} isPremium={isPremium && !modoLocal} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icono nombre={tab === 'fidelidad' ? 'estrella' : 'usuarios'} size={44} color={zc.flecha} />
            <Text style={styles.emptyText}>
              {tab === 'fidelidad'
                ? 'Ningún cliente en el programa de fidelidad'
                : busqueda ? 'No se encontraron clientes' : 'No hay clientes registrados'
              }
            </Text>
          </View>
        }
      />

      {/* Modal editar cliente */}
      <Modal visible={modalEditar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalEditar(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar cliente</Text>
              <TouchableOpacity onPress={() => setModalEditar(false)}>
                <Icono nombre="cerrar" size={24} color={zc.gris} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={editNombre} onChangeText={setEditNombre} placeholder="Nombre completo" placeholderTextColor={zc.grisSuave} autoFocus />
              <Text style={[styles.label, { marginTop: 16 }]}>Teléfono *</Text>
              <TextInput style={styles.input} value={editTelefono} onChangeText={setEditTelefono} placeholder="10 dígitos" keyboardType="phone-pad" placeholderTextColor={zc.grisSuave} />
              <Text style={[styles.label, { marginTop: 16 }]}>
                Dirección <Text style={{ color: zc.grisSuave }}>(opcional)</Text>
              </Text>
              <TextInput style={styles.input} value={editDireccion} onChangeText={setEditDireccion} placeholder="Calle, número, colonia..." placeholderTextColor={zc.grisSuave} />
              <TouchableOpacity
                style={[styles.btnGuardar, guardandoEditar && { opacity: 0.7 }]}
                onPress={guardarEdicion}
                disabled={guardandoEditar}
              >
                {guardandoEditar ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnGuardarText}>Guardar cambios</Text>}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal nuevo cliente */}
      <Modal visible={modalNuevo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalNuevo(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo cliente</Text>
              <TouchableOpacity onPress={() => { setModalNuevo(false); setNombre(''); setTelefono(''); setDireccion(''); }}>
                <Icono nombre="cerrar" size={24} color={zc.gris} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
                placeholderTextColor={zc.grisSuave}
                autoFocus
              />
              <Text style={[styles.label, { marginTop: 16 }]}>Teléfono *</Text>
              <TextInput
                style={styles.input}
                value={telefono}
                onChangeText={setTelefono}
                placeholder="10 dígitos"
                keyboardType="phone-pad"
                placeholderTextColor={zc.grisSuave}
              />
              <Text style={[styles.label, { marginTop: 16 }]}>
                Dirección <Text style={{ color: zc.grisSuave }}>(opcional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={direccion}
                onChangeText={setDireccion}
                placeholder="Calle, número, colonia..."
                placeholderTextColor={zc.grisSuave}
              />
              <TouchableOpacity
                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>Crear cliente</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal PIN para editar cliente */}
      <Modal
        visible={pinEditModal}
        transparent
        animationType="fade"
        onShow={() => setTimeout(() => pinEditRef.current?.focus(), 100)}
        onRequestClose={() => setPinEditModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.pinOverlay}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Autorización requerida</Text>
            <Text style={styles.pinMsg}>Editar cliente quedará registrado.{'\n'}Ingresa tu PIN para confirmar.</Text>
            <TextInput
              ref={pinEditRef}
              style={[styles.pinInput, pinEditError ? { borderColor: zc.rojo } : null]}
              placeholder="PIN"
              placeholderTextColor={zc.grisSuave}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={20}
              value={pinEditValue}
              onChangeText={v => { setPinEditValue(v); setPinEditError(''); }}
              onSubmitEditing={confirmarEdicionConPin}
            />
            {pinEditError ? <Text style={styles.pinErrorText}>{pinEditError}</Text> : null}
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnCancel]}
                onPress={() => setPinEditModal(false)}
                disabled={pinEditLoading}
              >
                <Text style={styles.pinBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pinBtn, styles.pinBtnConfirm, pinEditLoading && { opacity: 0.6 }]}
                onPress={confirmarEdicionConPin}
                disabled={pinEditLoading}
              >
                {pinEditLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.pinBtnConfirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ClienteCard({ item, primera, onEdit, onToggleFidelidad, toggling, isPremium }) {
  const tono = tonos[tonoPorColor(avatarColor(item.name))] || tonos.gris;
  const isToggling = toggling.has(item.id);
  const detalle = [item.phone, item.address].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, !primera && styles.cardLinea]}>
      {/* Inicial en un círculo de color suave */}
      <View style={[styles.avatar, { backgroundColor: tono.fondo }]}>
        <Text style={[styles.avatarText, { color: tono.icono }]}>
          {item.name?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {detalle ? <Text style={styles.cardDetail} numberOfLines={1}>{detalle}</Text> : null}
      </View>

      {/* Puntos, en una pastilla lila */}
      {item.in_loyalty ? (
        <Text style={styles.puntos}>{item.loyalty_points > 0 ? `${item.loyalty_points} pts` : '0 pts'}</Text>
      ) : null}

      {/* Botón editar */}
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(item)}>
        <Icono nombre="lapiz" size={16} color={zc.grisSuave} />
      </TouchableOpacity>

      {/* Botón fidelidad */}
      <TouchableOpacity
        style={[styles.starBtn, item.in_loyalty && styles.starBtnActive]}
        onPress={() => onToggleFidelidad(item)}
        disabled={isToggling}
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={item.in_loyalty ? tonos.lila.icono : zc.grisSuave} />
        ) : (
          <Icono
            nombre="estrella"
            size={19}
            color={item.in_loyalty ? tonos.lila.icono : zc.flecha}
            relleno={!!item.in_loyalty}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: zc.fondo },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: zc.fondo },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: zc.azul, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radios.boton },
  addBtnText:  { color: '#fff', fontWeight: '500', fontSize: 13.5 },

  // Pestañas de subrayado
  tabs:           { flexDirection: 'row', gap: 20, paddingHorizontal: 18, paddingTop: 12 },
  tab:            { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 7 },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: zc.azul },
  tabText:        { fontSize: 14, color: zc.gris },
  tabTextActive:  { color: zc.tinta, fontWeight: '500' },
  badge:          { backgroundColor: zc.fondo, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeActive:    { backgroundColor: zc.azulSuave },
  badgeText:      { fontSize: 11, fontWeight: '500', color: zc.gris },
  badgeTextActive:{ color: zc.azul },

  // Buscador (dentro de la cabecera)
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: radios.boton, paddingHorizontal: 12, marginTop: 14 },
  search:      { flex: 1, paddingVertical: 10, fontSize: 14, color: zc.tinta },

  // Info fidelidad
  fidelidadInfo:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: espacios.borde, marginTop: 10, backgroundColor: tonos.lila.fondo, borderRadius: radios.boton, padding: 10 },
  fidelidadInfoText: { fontSize: 12.5, color: '#6d28d9', flex: 1 },

  // La lista, en UNA sola tarjeta blanca
  // La lista va en UNA tarjeta blanca que CRECE con su contenido: con flex:1
  // quedaba un panel blanco enorme cuando hay pocos clientes.
  list:        { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginHorizontal: espacios.borde, marginTop: 10, marginBottom: 14, paddingHorizontal: espacios.dentro, paddingVertical: 2, ...sombra },
  emptyWrap:   { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText:   { color: zc.grisSuave, fontSize: 14, textAlign: 'center' },

  // Renglón de cliente
  card:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  cardLinea:   { borderTopWidth: 1, borderTopColor: zc.linea },
  avatar:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '500' },
  cardName:    { fontSize: 14, color: zc.tinta },
  cardDetail:  { fontSize: 12.5, color: zc.grisSuave, marginTop: 1 },
  puntos:      { fontSize: 12, fontWeight: '500', color: '#6d28d9', backgroundColor: tonos.lila.fondo, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  editBtn:     { padding: 6 },
  starBtn:     { padding: 6, borderRadius: radios.cuadrito },
  starBtnActive:{ backgroundColor: tonos.lila.fondo },

  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: zc.linea, backgroundColor: zc.tarjeta },
  modalTitle:  { fontSize: 19, fontWeight: '500', color: zc.tinta },
  label:       { fontSize: 12.5, color: zc.gris, marginBottom: 6 },
  input:       { borderWidth: 1, borderColor: zc.linea, borderRadius: radios.boton, padding: 12, fontSize: 15, color: zc.tinta, backgroundColor: zc.tarjeta },
  btnGuardar:  { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 14, alignItems: 'center', marginTop: 22, minHeight: 46, justifyContent: 'center' },
  btnGuardarText: { color: '#fff', fontSize: 15, fontWeight: '500' },

  // Modal PIN
  pinOverlay:  { flex: 1, backgroundColor: 'rgba(17,24,39,0.5)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  pinBox:      { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: 20, width: '100%', maxWidth: 340 },
  pinTitle:    { fontSize: 17, fontWeight: '500', color: zc.tinta, marginBottom: 4 },
  pinMsg:      { fontSize: 13.5, color: zc.gris, marginBottom: 16, lineHeight: 19 },
  pinInput:    { borderWidth: 1.5, borderColor: zc.linea, borderRadius: radios.boton, padding: 12, fontSize: 15, color: zc.tinta, backgroundColor: zc.fondo, textAlign: 'center', letterSpacing: 6, marginBottom: 4 },
  pinErrorText:{ fontSize: 13, color: zc.rojo, marginBottom: 8 },
  pinActions:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  pinBtn:      { flex: 1, borderRadius: radios.boton, padding: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  pinBtnCancel:{ backgroundColor: zc.fondo },
  pinBtnCancelText: { color: zc.gris, fontWeight: '500' },
  pinBtnConfirm:{ backgroundColor: zc.azul },
  pinBtnConfirmText: { color: '#fff', fontWeight: '500' },
});
