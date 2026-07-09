import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Alert,
  TextInput, TouchableOpacity, Modal, Linking, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import { friendlyError } from '../../utils/errors';

// Formatea stock a máximo 2 decimales, sin ceros de sobra.
function fmt(val) {
  if (val === null || val === undefined) return '';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  return String(Math.round(n * 100) / 100);
}

export default function ListaComprasSection({ branchId, nombreActivo }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [enviando, setEnviando]   = useState(false);
  const [branchName, setBranchName] = useState(null);

  // Modal manual
  const [modalManual, setModalManual] = useState(false);
  const [manualNombre, setManualNombre] = useState('');
  const [manualCantidad, setManualCantidad] = useState('');

  // Modal inventario
  const [modalInv, setModalInv]   = useState(false);
  const [opciones, setOpciones]   = useState([]);
  const [busquedaInv, setBusquedaInv] = useState('');
  const [cargandoOpciones, setCargandoOpciones] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const lista = await api.getShoppingList(branchId);
      setItems(lista?.items || []);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar la lista de compras.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Resolver nombre de sucursal para el texto de WhatsApp
  useEffect(() => {
    let vivo = true;
    if (branchId) {
      api.getBranches().then(bs => {
        if (!vivo) return;
        const b = (bs || []).find(x => x.id === branchId);
        if (b) setBranchName(b.name);
      }).catch(() => {});
    }
    return () => { vivo = false; };
  }, [branchId]);

  async function toggleItem(item) {
    const nuevo = !item.checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: nuevo } : i));
    try {
      await api.updateShoppingItem(item.id, { checked: nuevo });
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: item.checked } : i));
    }
  }

  async function eliminarItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
    try { await api.deleteShoppingItem(id); } catch { cargar(); }
  }

  async function generarAuto() {
    try {
      const res = await api.generateShoppingList(branchId);
      setItems(res?.items || []);
      const n = res?.agregados || 0;
      Alert.alert(
        n > 0 ? 'Lista generada' : 'Todo en orden',
        n > 0 ? `Se agregaron ${n} insumo(s) bajo(s) de stock.` : 'No hay insumos por debajo de su mínimo.'
      );
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar la lista automática.');
    }
  }

  async function guardarManual() {
    const nombre = manualNombre.trim();
    if (!nombre) return;
    try {
      const item = await api.addShoppingItem({
        branch_id: branchId || null,
        name: nombre,
        quantity_text: manualCantidad.trim() || null,
        source: 'manual',
      });
      setItems(prev => [...prev, item]);
      setManualNombre(''); setManualCantidad(''); setModalManual(false);
    } catch (e) {
      Alert.alert('Error', 'No se pudo agregar el artículo.');
    }
  }

  async function abrirInventario() {
    setModalInv(true);
    setCargandoOpciones(true);
    try {
      const ops = await api.getShoppingInventoryOptions(branchId);
      const yaEnLista = new Set(items.filter(i => i.ingredient_id).map(i => i.ingredient_id));
      setOpciones((ops || []).filter(o => !yaEnLista.has(o.ingredient_id)));
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los insumos.');
      setModalInv(false);
    } finally {
      setCargandoOpciones(false);
    }
  }

  async function agregarDesdeInventario(op) {
    setOpciones(prev => prev.filter(o => o.ingredient_id !== op.ingredient_id));
    try {
      const item = await api.addShoppingItem({
        branch_id: branchId || null,
        name: op.name,
        ingredient_id: op.ingredient_id,
        source: 'inventory',
      });
      setItems(prev => [...prev, item]);
    } catch (e) {
      Alert.alert('Error', 'No se pudo agregar el insumo.');
    }
  }

  function construirTexto() {
    let titulo = '🛒 *Lista de compras*';
    if (branchName) titulo += ` — ${branchName}`;
    const lineas = items.map(it => {
      const marca = it.checked ? '✅' : '◻️';
      let linea = `${marca} ${it.name}`;
      if (it.quantity_text) linea += ` (${it.quantity_text})`;
      else if (it.current_stock !== null && it.current_stock !== undefined) {
        linea += ` — hay ${fmt(it.current_stock)} ${it.unit || ''}`;
        if (it.min_stock) linea += `, mín ${fmt(it.min_stock)}`;
      }
      return linea;
    });
    return `${titulo}\n\n${lineas.join('\n')}`;
  }

  async function enviarWhatsapp() {
    if (items.length === 0) { Alert.alert('Lista vacía', 'Agrega artículos antes de enviar.'); return; }
    const url = `https://wa.me/?text=${encodeURIComponent(construirTexto())}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.');
    } catch {
      Alert.alert('Error', 'No se pudo abrir WhatsApp.');
    }
  }

  async function enviarAlAdmin() {
    if (items.length === 0) { Alert.alert('Lista vacía', 'Agrega artículos antes de enviar.'); return; }
    Alert.alert(
      '¿Enviar al administrador?',
      'Se enviará la lista con una notificación a su teléfono, y se archivará para empezar una nueva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: async () => {
          setEnviando(true);
          try {
            await api.sendShoppingList(branchId, nombreActivo || '');
            setItems([]);
            Alert.alert('Lista enviada', 'El administrador recibió la lista.');
          } catch (e) {
            Alert.alert('Error', friendlyError(e) || 'No se pudo enviar la lista.');
          } finally {
            setEnviando(false);
          }
        }},
      ]
    );
  }

  function vaciar() {
    if (items.length === 0) return;
    Alert.alert('¿Vaciar la lista?', 'Se quitarán todos los artículos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar', style: 'destructive', onPress: async () => {
        setItems([]);
        try { await api.clearShoppingList(branchId); } catch { cargar(); }
      }},
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const opcionesFiltradas = opciones.filter(o =>
    o.name.toLowerCase().includes(busquedaInv.trim().toLowerCase())
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Botones de acción superior */}
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.actionChip} onPress={generarAuto}>
          <Ionicons name="refresh-outline" size={15} color={colors.primary} />
          <Text style={styles.actionChipText}>Automática</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={abrirInventario}>
          <Ionicons name="cube-outline" size={15} color={colors.primary} />
          <Text style={styles.actionChipText}>Del inventario</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionChip, styles.actionChipPrimary]} onPress={() => setModalManual(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={[styles.actionChipText, { color: '#fff' }]}>Manual</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <TouchableOpacity onPress={() => toggleItem(item)} style={styles.checkbox}>
              <Ionicons
                name={item.checked ? 'checkbox' : 'square-outline'}
                size={22}
                color={item.checked ? colors.success : colors.textMuted}
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                {item.name}{item.quantity_text ? `  (${item.quantity_text})` : ''}
              </Text>
              {item.current_stock !== null && item.current_stock !== undefined && (
                <Text style={styles.itemCtx}>
                  hay {fmt(item.current_stock)} {item.unit || ''}{item.min_stock ? `, mín ${fmt(item.min_stock)}` : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => eliminarItem(item.id)} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="cart-outline" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Tu lista está vacía</Text>
            <Text style={styles.emptySub}>Usa "Automática" para traer los insumos bajos de stock, o agrega artículos manualmente.</Text>
          </View>
        }
      />

      {/* Barra de envío */}
      {items.length > 0 && (
        <View style={styles.sendBar}>
          <View style={styles.sendButtons}>
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: '#16a34a' }]} onPress={enviarWhatsapp}>
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={enviarAlAdmin} disabled={enviando}>
              {enviando ? <ActivityIndicator size="small" color="#fff" /> : <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>Al admin</Text>
              </>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={vaciar} style={{ paddingVertical: 6 }}>
            <Text style={styles.vaciarText}>Vaciar lista</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            WhatsApp abre la app con la lista escrita; eliges el contacto y envías.
          </Text>
        </View>
      )}

      {/* Modal manual */}
      <Modal visible={modalManual} animationType="slide" transparent onRequestClose={() => setModalManual(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Agregar artículo manual</Text>
            <Text style={styles.label}>ARTÍCULO</Text>
            <TextInput style={styles.input} value={manualNombre} onChangeText={setManualNombre}
              placeholder="Ej: Servilletas, bolsas..." placeholderTextColor={colors.textMuted} autoFocus />
            <Text style={styles.label}>CANTIDAD (opcional)</Text>
            <TextInput style={styles.input} value={manualCantidad} onChangeText={setManualCantidad}
              placeholder="Ej: 2 paquetes, media caja..." placeholderTextColor={colors.textMuted} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setModalManual(false); setManualNombre(''); setManualCantidad(''); }}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnOk} onPress={guardarManual}>
                <Text style={styles.btnOkText}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal inventario */}
      <Modal visible={modalInv} animationType="slide" transparent onRequestClose={() => setModalInv(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Agregar del inventario</Text>
              <TouchableOpacity onPress={() => { setModalInv(false); setBusquedaInv(''); }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput style={styles.searchInput} value={busquedaInv} onChangeText={setBusquedaInv}
                placeholder="Buscar insumo..." placeholderTextColor={colors.textMuted} />
            </View>
            {cargandoOpciones ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {opcionesFiltradas.length === 0 ? (
                  <Text style={styles.empty}>No hay insumos para agregar.</Text>
                ) : opcionesFiltradas.map(op => (
                  <View key={op.ingredient_id} style={styles.optRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optName}>{op.name}</Text>
                      <Text style={styles.optCtx}>hay {fmt(op.current_stock)} {op.unit || ''}{op.min_stock ? `, mín ${fmt(op.min_stock)}` : ''}</Text>
                    </View>
                    <TouchableOpacity style={styles.optBtn} onPress={() => agregarDesdeInventario(op)}>
                      <Text style={styles.optBtnText}>Agregar</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topActions:    { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexWrap: 'wrap' },
  actionChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionChipPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionChipText: { fontSize: font.sm, fontWeight: '600', color: colors.primary },

  itemRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  checkbox:      { padding: 2 },
  itemName:      { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  itemNameChecked: { textDecorationLine: 'line-through', color: colors.textMuted },
  itemCtx:       { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },

  emptyWrap:     { alignItems: 'center', paddingVertical: 50, gap: spacing.sm },
  emptyTitle:    { fontSize: font.lg, fontWeight: '700', color: colors.textSecondary },
  emptySub:      { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 20 },
  empty:         { textAlign: 'center', color: colors.textMuted, padding: spacing.xl },

  sendBar:       { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  sendButtons:   { flexDirection: 'row', gap: spacing.sm },
  sendBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md },
  sendBtnText:   { color: '#fff', fontSize: font.md, fontWeight: '700' },
  vaciarText:    { color: colors.danger, fontSize: font.sm, fontWeight: '600', textAlign: 'center' },
  hint:          { fontSize: font.sm - 2, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },

  overlay:       { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'flex-end' },
  modalBox:      { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.xs },
  modalHeaderRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  modalTitle:    { fontSize: font.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  label:         { fontSize: font.sm - 2, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4 },
  input:         { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },
  modalActions:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btnCancel:     { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  btnCancelText: { fontSize: font.md, fontWeight: '600', color: colors.textSecondary },
  btnOk:         { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  btnOkText:     { fontSize: font.md, fontWeight: '700', color: '#fff' },

  searchWrap:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInput:   { flex: 1, paddingVertical: spacing.sm, fontSize: font.md, color: colors.textPrimary },
  optRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  optName:       { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  optCtx:        { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  optBtn:        { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optBtnText:    { color: colors.primary, fontWeight: '600', fontSize: font.sm },
});
