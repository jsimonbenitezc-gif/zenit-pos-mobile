import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import IconoProducto from '../../components/IconoProducto';
import IconPicker from '../../components/IconPicker';
import { api } from '../../api/client';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';

// ─── Fila de producto ─────────────────────────────────────────────────────────

function ProductRow({ product, onEdit, currency }) {
  return (
    <View style={styles.row}>
      <IconoProducto valor={product.emoji || 'svg:shopping-bag'} imagen={product.image} size={24} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{product.name}</Text>
        <Text style={styles.rowCat}>{product.category?.name || 'Sin categoría'}</Text>
      </View>
      <Text style={styles.rowPrice}>{formatMoney(parseFloat(product.price), currency)}</Text>
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
      <IconoProducto valor={cat.emoji || 'svg:folder'} size={24} color={colors.textSecondary} />
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
  const { settings, isOwner } = useAuth();
  const currency = settings?.currency_symbol || '$';

  // Vista activa: 'productos' | 'categorias'
  const [vista, setVista] = useState('productos');

  // Productos
  const [productos, setProductos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda]     = useState('');
  const [catFiltro, setCatFiltro]   = useState(null);   // null = todas
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal producto
  const [modalProd, setModalProd]   = useState(false);
  const [editandoProd, setEditProd] = useState(null);
  const [nombre, setNombre]         = useState('');
  const [precio, setPrecio]         = useState('');
  const [emoji, setEmoji]           = useState('');
  const [imagenProd, setImagenProd] = useState(null); // data URI de la foto (o null)
  const [catId, setCatId]           = useState('');
  const [guardando, setGuardando]   = useState(false);

  // Icon picker
  const [pickerProd, setPickerProd] = useState(false);
  const [pickerCat, setPickerCat]   = useState(false);

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
    setNombre(''); setPrecio(''); setEmoji('svg:package'); setImagenProd(null); setCatId(categorias[0]?.id || '');
    setModalProd(true);
  }

  function abrirEditarProd(p) {
    setEditProd(p);
    setNombre(p.name);
    setPrecio(String(p.price));
    setEmoji(p.emoji || 'svg:package');
    setImagenProd(p.image || null);
    setCatId(p.category_id || '');
    setModalProd(true);
  }

  // Elige una foto de la galería, la reduce a ~300px y la deja como data URI.
  // Se guarda en la nube (image) para verse en todos los dispositivos.
  async function elegirImagenProd() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso necesario', 'Autoriza el acceso a tus fotos para elegir una imagen.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      setImagenProd(`data:${mime};base64,${asset.base64}`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo cargar la imagen.');
    }
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
      // Si hay foto, se guarda la imagen (y se limpia el emoji); si no, al revés.
      const body = {
        name: nombre.trim(),
        price: precioNum,
        emoji: imagenProd ? '' : emoji.trim(),
        image: imagenProd || null,
        category_id: catId || null,
      };
      if (editandoProd) {
        const updated = await api.updateProduct(editandoProd.id, body);
        setProductos(prev => prev.map(p => p.id === editandoProd.id ? { ...p, ...updated } : p));
      } else {
        const created = await api.createProduct(body);
        setProductos(prev => [created, ...prev]);
      }
      setModalProd(false);
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
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
        } catch (e) { Alert.alert('Error', friendlyError(e)); }
      }},
    ]);
  }

  // ── Categoría CRUD ─────────────────────────────────────────────────────────

  function abrirNuevaCat() {
    setEditCat(null);
    setCatNombre(''); setCatEmoji('svg:package');
    setModalCat(true);
  }

  function abrirEditarCat(c) {
    setEditCat(c);
    setCatNombre(c.name);
    setCatEmoji(c.emoji || 'svg:package');
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
      Alert.alert('Error', friendlyError(e));
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
        } catch (e) { Alert.alert('Error', friendlyError(e)); }
      }},
    ]);
  }

  const filtradosProd = productos.filter(p => {
    const enBusqueda = !busqueda || p.name.toLowerCase().includes(busqueda.toLowerCase());
    const enCat = catFiltro === null || p.category_id === catFiltro;
    return enBusqueda && enCat;
  });

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <LogoTitle title="Productos" titleStyle={styles.title} />
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
          {/* Filtro por categoría */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catScroll}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}
          >
            <TouchableOpacity
              style={[styles.catChip, catFiltro === null && styles.catChipActive]}
              onPress={() => setCatFiltro(null)}
            >
              <Text style={[styles.catChipText, catFiltro === null && styles.catChipTextActive]}>
                Todas
              </Text>
            </TouchableOpacity>
            {categorias.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catChip, catFiltro === c.id && styles.catChipActive]}
                onPress={() => setCatFiltro(catFiltro === c.id ? null : c.id)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {c.emoji ? <IconoProducto valor={c.emoji} size={14} color={catFiltro === c.id ? '#fff' : colors.textSecondary} /> : null}
                  <Text style={[styles.catChipText, catFiltro === c.id && styles.catChipTextActive]}>{c.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={filtradosProd}
            keyExtractor={p => String(p.id)}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
            renderItem={({ item }) => <ProductRow product={item} onEdit={abrirEditarProd} currency={currency} />}
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

              <Text style={[styles.label, { marginTop: spacing.md }]}>Imagen o icono</Text>
              {imagenProd ? (
                <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
                  <Image source={{ uri: imagenProd }} style={{ width: 100, height: 100, borderRadius: radius.md }} />
                  <TouchableOpacity onPress={() => setImagenProd(null)} style={{ marginTop: spacing.xs }}>
                    <Text style={[styles.linkText, { color: colors.danger }]}>Quitar foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.iconPickerBtn} onPress={() => setPickerProd(true)}>
                  <IconoProducto valor={emoji || 'svg:package'} size={28} color={colors.textPrimary} />
                  <Text style={styles.iconPickerLabel}>Cambiar icono</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.iconPickerBtn, { marginTop: spacing.xs }]} onPress={elegirImagenProd}>
                <Ionicons name="image-outline" size={22} color={colors.primary} />
                <Text style={[styles.iconPickerLabel, { color: colors.primary }]}>
                  {imagenProd ? 'Cambiar foto' : 'Subir una foto'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {c.emoji ? <IconoProducto valor={c.emoji} size={18} color={catId === c.id ? '#fff' : colors.textPrimary} /> : null}
                    <Text style={[styles.catOpcionText, catId === c.id && { color: '#fff' }]}>{c.name}</Text>
                  </View>
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

              <Text style={[styles.label, { marginTop: spacing.md }]}>Icono</Text>
              <TouchableOpacity style={styles.iconPickerBtn} onPress={() => setPickerCat(true)}>
                <IconoProducto valor={catEmoji || 'svg:package'} size={28} color={colors.textPrimary} />
                <Text style={styles.iconPickerLabel}>Cambiar icono</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

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

      {/* Icon pickers */}
      <IconPicker value={emoji} onSelect={setEmoji} visible={pickerProd} onClose={() => setPickerProd(false)} />
      <IconPicker value={catEmoji} onSelect={setCatEmoji} visible={pickerCat} onClose={() => setPickerCat(false)} />
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
  searchWrap:      { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  search:          { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: font.md, color: colors.textPrimary },
  catScroll:       { flexGrow: 0, marginBottom: spacing.sm },
  catChip:         { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  catChipActive:   { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText:     { fontSize: font.sm - 1, fontWeight: '600', color: colors.textSecondary },
  catChipTextActive: { color: '#fff' },
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
  iconPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, backgroundColor: colors.surface,
  },
  iconPickerLabel: { flex: 1, fontSize: font.md, color: colors.textSecondary },
});
