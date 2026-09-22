import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import IconoProducto from '../../components/IconoProducto';
import IconPicker from '../../components/IconPicker';
import {
  cargarCatalogoEditable, crearProducto, actualizarProducto, borrarProducto,
  crearCategoria, actualizarCategoria, borrarCategoria, fijarModificadoresDeProducto,
} from '../../offline/catalogoEditable';
import { colors, spacing, radius, font, zc, radios, sombra } from '../../theme';
import { Cabecera, Icono } from '../../components/ui';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';
import { SelectorGruposProducto, ModalBibliotecaModificadores } from '../../components/GestionModificadores';

// ─── Fila de producto ─────────────────────────────────────────────────────────

function ProductRow({ product, onEdit, currency }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowFoto, product.image && styles.rowFotoBlanca]}>
        <IconoProducto valor={product.emoji || 'svg:shopping-bag'} imagen={product.image} size={34} color={zc.gris} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{product.name}</Text>
        <Text style={styles.rowCat}>{product.category?.name || 'Sin categoría'}</Text>
      </View>
      <Text style={styles.rowPrice}>{formatMoney(parseFloat(product.price), currency)}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(product)}>
        <Icono nombre="pencil-outline" size={16} color={zc.gris} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Fila de categoría ────────────────────────────────────────────────────────

function CatRow({ cat, onEdit, onDelete }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowFoto}>
        <IconoProducto valor={cat.emoji || 'svg:folder'} size={26} color={zc.gris} />
      </View>
      <Text style={[styles.rowName, { flex: 1 }]}>{cat.name}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(cat)}>
        <Icono nombre="pencil-outline" size={16} color={zc.gris} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.editBtn, { marginLeft: 4 }]} onPress={() => onDelete(cat)}>
        <Icono nombre="trash-outline" size={16} color={zc.rojo} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ProductosScreen() {
  const { settings, isOwner, modoLocal } = useAuth();
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
  // MODIFICADORES (BLOQUE 11). `gruposProd` guarda los grupos marcados en el
  // formulario para guardarlos JUNTO con el producto: el dueño toca "Guardar"
  // una sola vez.
  const [modalBiblioteca, setModalBiblioteca] = useState(false);
  const [gruposProd, setGruposProd] = useState(null);
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
      const { productos: prods, categorias: cats } = await cargarCatalogoEditable();
      setProductos(prods);
      setCategorias(cats);
    } catch (e) {
      console.warn('[ProductosScreen] load error:', e);
      Alert.alert('Error', 'No se pudo cargar la información.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Producto CRUD ──────────────────────────────────────────────────────────

  function abrirNuevoProd() {
    setGruposProd(null);
    setEditProd(null);
    setNombre(''); setPrecio(''); setEmoji('svg:package'); setImagenProd(null); setCatId(categorias[0]?.id || '');
    setModalProd(true);
  }

  function abrirEditarProd(p) {
    setGruposProd(null);
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
      let productoId;
      if (editandoProd) {
        const updated = await actualizarProducto(editandoProd.id, body);
        setProductos(prev => prev.map(p => p.id === editandoProd.id ? { ...p, ...updated } : p));
        productoId = editandoProd.id;
      } else {
        const created = await crearProducto(body);
        setProductos(prev => [created, ...prev]);
        productoId = created.id;
      }
      // Modificadores del producto (BLOQUE 11). Solo si el dueño los tocó:
      // `null` significa "no abrió esa sección" y no debe borrar lo que ya
      // estaba enganchado.
      if (gruposProd !== null && productoId) {
        await fijarModificadoresDeProducto(productoId, gruposProd).catch(() => {});
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
          await borrarProducto(p.id);
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
        const updated = await actualizarCategoria(editandoCat.id, body);
        setCategorias(prev => prev.map(c => c.id === editandoCat.id ? { ...c, ...updated } : c));
      } else {
        const created = await crearCategoria(body);
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
          await borrarCategoria(c.id);
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
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* Cabecera azul noche (diseño A): acciones, pestañas y buscador dentro */}
      <Cabecera titulo="Productos" derecha={isOwner && (
          <View style={styles.accionesCab}>
            {/* Biblioteca de modificadores (BLOQUE 11). Vive aquí y no en
                Ajustes porque es parte del MENÚ: se configura junto a los
                productos que la usan. */}
            {/* Sin cuenta no hay biblioteca de modificadores que configurar
                (§32): un botón que no lleva a ningún lado es peor que no tenerlo. */}
            {vista === 'productos' && !modoLocal && (
              <TouchableOpacity style={styles.btnOpciones} onPress={() => setModalBiblioteca(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icono nombre="options-outline" size={19} color={zc.enNoche} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={vista === 'productos' ? abrirNuevoProd : abrirNuevaCat}
            >
              <Icono nombre="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Nuevo</Text>
            </TouchableOpacity>
          </View>
        )}
      >
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
      {vista === 'productos' && (
          <View style={styles.searchWrap}>
            <Icono nombre="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.search}
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar..."
              placeholderTextColor={colors.textMuted}
            />
          </View>
      )}
      </Cabecera>

      <ModalBibliotecaModificadores
        visible={modalBiblioteca}
        onClose={() => setModalBiblioteca(false)}
      />

      {/* Vista Productos */}
      {vista === 'productos' && (
        <>
          {/* Filtro por categoría */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catScroll}
            contentContainerStyle={{ paddingHorizontal: 14, gap: spacing.sm }}
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
                  {c.emoji ? <IconoProducto valor={c.emoji} size={16} color={catFiltro === c.id ? '#fff' : zc.gris} /> : null}
                  <Text style={[styles.catChipText, catFiltro === c.id && styles.catChipTextActive]}>{c.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={filtradosProd}
            keyExtractor={p => String(p.id)}
            contentContainerStyle={{ padding: 14, paddingTop: 2 }}
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
          contentContainerStyle={{ padding: 14, paddingTop: 16 }}
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
          <SafeAreaView style={styles.modalSafe}>
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
                  <Image source={{ uri: imagenProd }} style={{ width: 100, height: 100, borderRadius: radios.tarjeta }} />
                  <TouchableOpacity onPress={() => setImagenProd(null)} style={{ marginTop: spacing.xs }}>
                    <Text style={[styles.linkText, { color: zc.rojo }]}>Quitar foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.iconPickerBtn} onPress={() => setPickerProd(true)}>
                  <IconoProducto valor={emoji || 'svg:package'} size={28} color={zc.tinta} />
                  <Text style={styles.iconPickerLabel}>Cambiar icono</Text>
                  <Icono nombre="chevron-forward" size={18} color={zc.flecha} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.iconPickerBtn, { marginTop: spacing.xs }]} onPress={elegirImagenProd}>
                <Icono nombre="image-outline" size={22} color={zc.azul} />
                <Text style={[styles.iconPickerLabel, { color: zc.azul }]}>
                  {imagenProd ? 'Cambiar foto' : 'Subir una foto'}
                </Text>
                <Icono nombre="chevron-forward" size={18} color={zc.flecha} />
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
                    {c.emoji ? <IconoProducto valor={c.emoji} size={18} color={catId === c.id ? '#fff' : zc.tinta} /> : null}
                    <Text style={[styles.catOpcionText, catId === c.id && { color: '#fff' }]}>{c.name}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Modificadores del producto (BLOQUE 11). Solo al EDITAR: un
                  producto que todavía no existe no tiene a qué engancharlos, y
                  guardarlos requiere su id. */}
              {editandoProd && !modoLocal && (
                <>
                  <Text style={styles.label}>Modificadores</Text>
                  <SelectorGruposProducto
                    productId={editandoProd.id}
                    onCambio={setGruposProd}
                  />
                </>
              )}

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
          <SafeAreaView style={styles.modalSafe}>
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
                <IconoProducto valor={catEmoji || 'svg:package'} size={28} color={zc.tinta} />
                <Text style={styles.iconPickerLabel}>Cambiar icono</Text>
                <Icono nombre="chevron-forward" size={18} color={zc.flecha} />
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

const campo = { backgroundColor: zc.tarjeta, borderRadius: radios.boton, borderWidth: 1, borderColor: zc.linea };
const caja  = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: zc.fondo },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accionesCab: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnOpciones: { width: 38, height: 38, borderRadius: 19, backgroundColor: zc.vidrio, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: zc.azul, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radios.chip },
  addBtnText: { color: '#fff', fontWeight: '500', fontSize: 14 },
  // Productos / Categorías: el mismo segmentado oscuro de la carcasa A
  tabRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radios.boton, backgroundColor: 'rgba(255,255,255,0.07)' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13.5, color: zc.enNocheSuave },
  tabTextActive: { color: zc.tinta, fontWeight: '500' },
  searchWrap:      { flexDirection: 'row', alignItems: 'center', marginTop: 10, ...campo, borderWidth: 0, paddingHorizontal: 12, gap: 8 },
  search:          { flex: 1, paddingVertical: 10, fontSize: 14.5, color: zc.tinta },
  catScroll:       { flexGrow: 0, marginTop: 12, marginBottom: 10, paddingVertical: 2 },
  catChip:         { paddingHorizontal: 13, paddingVertical: 7, borderRadius: radios.chip, backgroundColor: zc.tarjeta, elevation: 1, shadowColor: zc.noche, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  catChipActive:   { backgroundColor: zc.noche },
  catChipText:     { fontSize: 13.5, color: zc.gris },
  catChipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, ...caja, padding: 12, marginBottom: 10 },
  rowFoto: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#f3f5f9', alignItems: 'center', justifyContent: 'center' },
  rowFotoBlanca: { backgroundColor: zc.tarjeta },
  rowEmoji: { fontSize: 24, marginRight: spacing.sm },
  rowName: { fontSize: 14.5, fontWeight: '500', color: zc.tinta },
  rowCat: { fontSize: 12.5, color: zc.grisSuave, marginTop: 1 },
  rowPrice: { fontSize: 15, fontWeight: '700', color: zc.azul, fontVariant: ['tabular-nums'] },
  editBtn: { padding: 8, borderRadius: 10, backgroundColor: zc.fondo },
  empty: { textAlign: 'center', color: zc.grisSuave, marginTop: spacing.xxl, fontSize: 14.5, lineHeight: 24 },
  modalSafe: { flex: 1, backgroundColor: zc.fondo },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  modalTitle: { fontSize: 19, fontWeight: '500', color: zc.tinta },
  linkText: { color: zc.azul, fontWeight: '500', fontSize: 15 },
  label: { fontSize: 13, color: zc.gris, marginBottom: 6 },
  input: { ...campo, padding: 12, fontSize: 15, color: zc.tinta },
  catOpcion: { ...campo, padding: 11, marginBottom: 6 },
  catOpcionActive: { backgroundColor: zc.noche, borderColor: zc.noche },
  catOpcionText: { fontSize: 14, color: zc.tinta },
  btnGuardar: { backgroundColor: zc.azul, borderRadius: radios.boton, padding: 14, alignItems: 'center', marginTop: spacing.xl },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  btnEliminar: { backgroundColor: zc.rojoSuave, borderRadius: radios.boton, padding: 13, alignItems: 'center', marginTop: spacing.lg },
  btnEliminarText: { color: zc.rojo, fontSize: 15, fontWeight: '500' },
  iconPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    ...campo, padding: 12,
  },
  iconPickerLabel: { flex: 1, fontSize: 14.5, color: zc.tinta },
});
