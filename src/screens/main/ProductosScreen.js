import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import { useAuth } from '../../context/AuthContext';

// ─── Fila de producto ─────────────────────────────────────────────────────────

function ProductRow({ product, onEdit }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{product.emoji || '🛍️'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{product.name}</Text>
        <Text style={styles.rowCat}>{product.category?.name || 'Sin categoría'}</Text>
      </View>
      <Text style={styles.rowPrice}>${parseFloat(product.price).toFixed(2)}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(product)}>
        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Fila de categoría ────────────────────────────────────────────────────────

function CatRow({ cat, onEdit, onDelete }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{cat.emoji || '📁'}</Text>
      <Text style={[styles.rowName, { flex: 1 }]}>{cat.name}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(cat)}>
        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.editBtn, { marginLeft: 4 }]} onPress={() => onDelete(cat)}>
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ProductosScreen() {
  const { isOwner } = useAuth();

  // Vista activa: 'productos' | 'categorias'
  const [vista, setVista] = useState('productos');

  // Productos
  const [productos, setProductos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal producto
  const [modalProd, setModalProd]   = useState(false);
  const [editandoProd, setEditProd] = useState(null);
  const [nombre, setNombre]         = useState('');
  const [precio, setPrecio]         = useState('');
  const [emoji, setEmoji]           = useState('');
  const [catId, setCatId]           = useState('');
  const [guardando, setGuardando]   = useState(false);

  // Modal categoría
  const [modalCat, setModalCat]     = useState(false);
  const [editandoCat, setEditCat]   = useState(null);
  const [catNombre, setCatNombre]   = useState('');
  const [catEmoji, setCatEmoji]     = useState('');
  const [guardandoCat, setGuardCat] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [prods, cats] = await Promise.all([api.getProducts(), api.getCategories()]);
      setProductos(prods);
      setCategorias(cats);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la información.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Producto CRUD ──────────────────────────────────────────────────────────

  function abrirNuevoProd() {
    setEditProd(null);
    setNombre(''); setPrecio(''); setEmoji(''); setCatId(categorias[0]?.id || '');
    setModalProd(true);
  }

  function abrirEditarProd(p) {
    setEditProd(p);
    setNombre(p.name);
    setPrecio(String(p.price));
    setEmoji(p.emoji || '');
    setCatId(p.category_id || '');
    setModalProd(true);
  }

  async function guardarProd() {
    if (!nombre.trim() || !precio) {
      Alert.alert('Campos requeridos', 'Nombre y precio son obligatorios.');
      return;
    }
    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum <= 0) {
      Alert.alert('Precio inválido', 'Ingresa un precio válido mayor a 0.');
      return;
    }
    setGuardando(true);
    try {
      const body = { name: nombre.trim(), price: precioNum, emoji: emoji.trim(), category_id: catId || null };
      if (editandoProd) {
        const updated = await api.updateProduct(editandoProd.id, body);
        setProductos(prev => prev.map(p => p.id === editandoProd.id ? { ...p, ...updated } : p));
      } else {
        const created = await api.createProduct(body);
        setProductos(prev => [created, ...prev]);
      }
      setModalProd(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarProd(p) {
    Alert.alert('Eliminar producto', `¿Eliminar "${p.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteProduct(p.id);
          setProductos(prev => prev.filter(x => x.id !== p.id));
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  }

  // ── Categoría CRUD ─────────────────────────────────────────────────────────

  function abrirNuevaCat() {
    setEditCat(null);
    setCatNombre(''); setCatEmoji('');
    setModalCat(true);
  }

  function abrirEditarCat(c) {
    setEditCat(c);
    setCatNombre(c.name);
    setCatEmoji(c.emoji || '');
    setModalCat(true);
  }

  async function guardarCat() {
    if (!catNombre.trim()) {
      Alert.alert('Campo requerido', 'El nombre es obligatorio.');
      return;
    }
    setGuardCat(true);
    try {
      const body = { name: catNombre.trim(), emoji: catEmoji.trim() };
      if (editandoCat) {
        const updated = await api.updateCategory(editandoCat.id, body);
        setCategorias(prev => prev.map(c => c.id === editandoCat.id ? { ...c, ...updated } : c));
      } else {
        const created = await api.createCategory(body);
        setCategorias(prev => [...prev, created]);
      }
      setModalCat(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardCat(false);
    }
  }

  async function eliminarCat(c) {
    Alert.alert('Eliminar categoría', `¿Eliminar "${c.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteCategory(c.id);
          setCategorias(prev => prev.filter(x => x.id !== c.id));
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  }

  const filtradosProd = productos.filter(p => !busqueda || p.name.toLowerCase().includes(busqueda.toLowerCase()));

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Productos</Text>
        {isOwner && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={vista === 'productos' ? abrirNuevoProd : abrirNuevaCat}
          >
            <Text style={styles.addBtnText}>+ Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Toggle Productos / Categorías */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, vista === 'productos' && styles.tabActive]}
          onPress={() => setVista('productos')}
        >
          <Text style={[styles.tabText, vista === 'productos' && styles.tabTextActive]}>Productos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, vista === 'categorias' && styles.tabActive]}
          onPress={() => setVista('categorias')}
        >
          <Text style={[styles.tabText, vista === 'categorias' && styles.tabTextActive]}>Categorías</Text>
        </TouchableOpacity>
      </View>

      {/* Vista Productos */}
      {vista === 'productos' && (
        <>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar..."
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <FlatList
            data={filtradosProd}
            keyExtractor={p => String(p.id)}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
            renderItem={({ item }) => <ProductRow product={item} onEdit={abrirEditarProd} />}
            ListEmptyComponent={<Text style={styles.empty}>No hay productos</Text>}
          />
        </>
      )}

      {/* Vista Categorías */}
      {vista === 'categorias' && (
        <FlatList
          data={categorias}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <CatRow cat={item} onEdit={abrirEditarCat} onDelete={eliminarCat} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No hay categorías{'\n'}Toca "+ Nuevo" para crear una</Text>}
        />
      )}

      {/* Modal crear/editar producto */}
      <Modal visible={modalProd} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editandoProd ? 'Editar producto' : 'Nuevo producto'}</Text>
              <TouchableOpacity onPress={() => setModalProd(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Hamburguesa clásica" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Precio *</Text>
              <TextInput style={styles.input} value={precio} onChangeText={setPrecio} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Emoji</Text>
              <TextInput style={styles.input} value={emoji} onChangeText={setEmoji} placeholder="🍔" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Categoría</Text>
              <TouchableOpacity
                style={[styles.catOpcion, !catId && styles.catOpcionActive]}
                onPress={() => setCatId('')}
              >
                <Text style={[styles.catOpcionText, !catId && { color: '#fff' }]}>Sin categoría</Text>
              </TouchableOpacity>
              {categorias.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catOpcion, catId === c.id && styles.catOpcionActive]}
                  onPress={() => setCatId(c.id)}
                >
                  <Text style={[styles.catOpcionText, catId === c.id && { color: '#fff' }]}>{c.emoji} {c.name}</Text>
                </TouchableOpacity>
              ))}

              {editandoProd && (
                <TouchableOpacity style={styles.btnEliminar} onPress={() => { setModalProd(false); eliminarProd(editandoProd); }}>
                  <Text style={styles.btnEliminarText}>Eliminar producto</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.btnGuardar, guardando && { opacity: 0.7 }]}
                onPress={guardarProd}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>{editandoProd ? 'Guardar cambios' : 'Crear producto'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal crear/editar categoría */}
      <Modal visible={modalCat} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editandoCat ? 'Editar categoría' : 'Nueva categoría'}</Text>
              <TouchableOpacity onPress={() => setModalCat(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput style={styles.input} value={catNombre} onChangeText={setCatNombre} placeholder="Ej: Bebidas" placeholderTextColor={colors.textMuted} />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Emoji</Text>
              <TextInput style={styles.input} value={catEmoji} onChangeText={setCatEmoji} placeholder="🥤" placeholderTextColor={colors.textMuted} />

              <TouchableOpacity
                style={[styles.btnGuardar, { marginTop: spacing.xl }, guardandoCat && { opacity: 0.7 }]}
                onPress={guardarCat}
                disabled={guardandoCat}
              >
                {guardandoCat
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>{editandoCat ? 'Guardar cambios' : 'Crear categoría'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
  tabRow: { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rowEmoji: { fontSize: 24, marginRight: spacing.sm },
  rowName: { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  rowCat: { fontSize: font.sm - 2, color: colors.textMuted },
  rowPrice: { fontSize: font.md, fontWeight: '800', color: colors.primary, marginRight: spacing.sm },
  editBtn: { padding: spacing.xs },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxl, fontSize: font.md, lineHeight: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: font.md },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface },
  catOpcion: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs, backgroundColor: colors.surface },
  catOpcionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catOpcionText: { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  btnGuardar: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl },
  btnGuardarText: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  btnEliminar: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  btnEliminarText: { color: colors.danger, fontSize: font.md, fontWeight: '700' },
});
