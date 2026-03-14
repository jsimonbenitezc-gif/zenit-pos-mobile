import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, TextInput, TouchableOpacity,
  Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EventSource from 'react-native-sse';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, font } from '../../theme';

const MOTIVOS = [
  { key: 'merma',     label: 'Merma' },
  { key: 'caducidad', label: 'Caducidad' },
  { key: 'accidente', label: 'Accidente' },
  { key: 'robo',      label: 'Pérdida/Robo' },
  { key: 'ajuste',    label: 'Ajuste' },
  { key: 'otro',      label: 'Otro' },
];

const UNIT_EQUIV = {
  kg: ['g'],
  g: ['kg'],
  l: ['ml'],
  ml: ['l'],
};

function unidadesInsumo(ing) {
  if (!ing?.unit) return [];
  const base = ing.unit;
  const extras = UNIT_EQUIV[base] || [];
  return Array.from(new Set([base, ...extras]));
}

// ─── Insumo row ───────────────────────────────────────────────────────────────
function IngredientRow({ item, onEdit }) {
  const stockBajo = item.stock !== null && item.min_stock > 0 && item.stock < item.min_stock;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowUnit}>{item.unit || '—'}</Text>
      </View>
      <View style={styles.stockWrap}>
        <Text style={[styles.stock, stockBajo && { color: colors.danger }]}>
          {item.stock ?? '—'}
        </Text>
        {stockBajo && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning-outline" size={12} color={colors.danger} />
            <Text style={styles.alertText}>Stock bajo</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={() => onEdit(item)} style={{ padding: 4, marginLeft: spacing.sm }}>
        <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Preparación row (expandible) ────────────────────────────────────────────
function PrepRow({ item, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center' }}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowUnit}>
            {item.unit || '—'}{item.yield_quantity ? `  ·  Rinde: ${item.yield_quantity}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onEdit(item)} style={{ padding: 4, marginLeft: spacing.sm }}>
          <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16} color={colors.textMuted} style={{ marginLeft: spacing.sm }}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.expandedBox}>
          {item.items?.length > 0 ? item.items.map(ri => (
            <View key={ri.id} style={styles.recipeItem}>
              <Ionicons name="flask-outline" size={13} color={colors.textMuted} />
              <Text style={styles.recipeItemText}>{ri.ingredient?.name ?? `ID ${ri.ingredient_id}`}</Text>
              <Text style={styles.recipeItemQty}>{ri.quantity} {ri.unit_recipe || ri.ingredient?.unit || ''}</Text>
            </View>
          )) : (
            <Text style={styles.sinDatos}>Sin ingredientes asignados</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Receta row (expandible) ──────────────────────────────────────────────────
function RecetaRow({ product, items, ingredients, preparations, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  if (!product) return null;

  const nombre = (id, tipo) => {
    if (tipo === 'ingredient') return ingredients.find(i => i.id === id)?.name ?? `Ingrediente #${id}`;
    return preparations.find(p => p.id === id)?.name ?? `Preparación #${id}`;
  };
  const unit = (id, tipo) => {
    if (tipo === 'ingredient') return ingredients.find(i => i.id === id)?.unit ?? '';
    return preparations.find(p => p.id === id)?.unit ?? '';
  };

  const confirmarBorrar = () => {
    Alert.alert(
      'Borrar receta',
      `¿Eliminar la receta de "${product.name}"? Puedes crearla de nuevo después.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => onDelete(product.id) },
      ]
    );
  };

  return (
    <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center' }}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 22, marginRight: spacing.sm }}>{product.emoji || '📦'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{product.name}</Text>
          <Text style={styles.rowUnit}>{items.length} {items.length === 1 ? 'componente' : 'componentes'}</Text>
        </View>
        <TouchableOpacity onPress={() => onEdit(product, items)} style={{ padding: 4, marginRight: spacing.xs }}>
          <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmarBorrar} style={{ padding: 4, marginRight: spacing.xs }}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.expandedBox}>
          {items.map(r => (
            <View key={r.id} style={styles.recipeItem}>
              <Ionicons
                name={r.item_type === 'ingredient' ? 'flask-outline' : 'beaker-outline'}
                size={13} color={colors.textMuted}
              />
              <Text style={styles.recipeItemText}>{nombre(r.item_id, r.item_type)}</Text>
              <Text style={styles.recipeItemQty}>{r.quantity} {unit(r.item_id, r.item_type)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Movimiento row ───────────────────────────────────────────────────────────
function MovRow({ item }) {
  const esEntrada = item.type === 'entrada';
  const fecha = item.createdAt
    ? new Date(item.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  return (
    <View style={styles.row}>
      <View style={[styles.movIcon, { backgroundColor: esEntrada ? '#dcfce7' : '#fee2e2' }]}>
        <Ionicons
          name={esEntrada ? 'add-circle-outline' : 'remove-circle-outline'}
          size={20} color={esEntrada ? '#16a34a' : '#dc2626'}
        />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.rowName}>{item.ingredient?.name ?? '—'}</Text>
        <Text style={styles.rowUnit}>{item.reason || item.notes || (esEntrada ? 'Entrada' : 'Salida')}</Text>
        <Text style={[styles.rowUnit, { marginTop: 2 }]}>{fecha}</Text>
      </View>
      <Text style={[styles.stock, { color: esEntrada ? '#16a34a' : '#dc2626', fontSize: font.md }]}>
        {esEntrada ? '+' : '−'}{item.quantity} {item.ingredient?.unit ?? ''}
      </Text>
    </View>
  );
}

// ─── Premium gate ─────────────────────────────────────────────────────────────
function PremiumGate() {
  return (
    <View style={styles.premiumWrap}>
      <Ionicons name="layers-outline" size={52} color={colors.textMuted} />
      <Text style={styles.premiumTitle}>Función Premium</Text>
      <Text style={styles.premiumSubtitle}>
        El control de inventario está disponible en el plan Premium.
        Actívalo desde la app de escritorio Zenit POS.
      </Text>
    </View>
  );
}

// ─── Selector de insumo reutilizable ─────────────────────────────────────────
function IngSelector({ ingredients, preparations, selected, onSelect, includePreps = false }) {
  const [busq, setBusq] = useState('');
  const todos = includePreps
    ? [
        ...ingredients.map(i => ({ ...i, _tipo: 'ingredient', _label: i.name, _sub: i.unit })),
        ...preparations.map(p => ({ ...p, _tipo: 'preparation', _label: p.name, _sub: p.unit })),
      ]
    : ingredients.map(i => ({ ...i, _tipo: 'ingredient', _label: i.name, _sub: i.unit }));

  const sugs = busq.length > 0
    ? todos.filter(i => i._label.toLowerCase().includes(busq.toLowerCase())).slice(0, 8)
    : [];

  if (selected) {
    return (
      <View style={styles.ingSelecRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ingSelecNombre}>{selected._label}</Text>
          <Text style={styles.ingSelecStock}>{selected._sub}</Text>
        </View>
        <TouchableOpacity onPress={() => onSelect(null)}>
          <Ionicons name="close-circle" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View>
      <TextInput
        style={styles.input}
        value={busq}
        onChangeText={setBusq}
        placeholder={includePreps ? 'Buscar insumo o preparación...' : 'Buscar insumo...'}
        placeholderTextColor={colors.textMuted}
      />
      {sugs.length > 0 && (
        <View style={styles.sugerenciasBox}>
          {sugs.map(i => (
            <TouchableOpacity
              key={`${i._tipo}-${i.id}`}
              style={styles.sugerenciaItem}
              onPress={() => { onSelect(i); setBusq(''); }}
            >
              <Text style={styles.sugNombre}>{i._label}</Text>
              <Text style={styles.sugStock}>{i._tipo === 'ingredient' ? 'Insumo' : 'Preparación'} · {i._sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────
export default function InventarioScreen() {
  const { user } = useAuth();
  const isPremium = user?.plan === 'premium' || user?.plan === 'trial';

  const [tab, setTab]                   = useState('insumos');
  const [ingredients, setIngredients]   = useState([]);
  const [preparations, setPreparations] = useState([]);
  const [allRecipes, setAllRecipes]     = useState([]);
  const [products, setProducts]         = useState([]);
  const [movements, setMovements]       = useState([]);
  const [busqueda, setBusqueda]         = useState('');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefresh]        = useState(false);
  const sseRef                          = useRef(null);
  const sseRetryRef                     = useRef(null);

  // ── Modal movimiento ──
  const [modalMov, setModalMov]         = useState(false);
  const [tipoMov, setTipoMov]           = useState('entrada');
  const [ingSelec, setIngSelec]         = useState(null);
  const [cantidad, setCantidad]         = useState('');
  const [motivo, setMotivo]             = useState('merma');
  const [notasMov, setNotasMov]         = useState('');
  const [saving, setSaving]             = useState(false);

  // ── Modal insumo (crear / editar) ──
  const [modalIng, setModalIng]         = useState(false);
  const [ingEditando, setIngEditando]   = useState(null); // null = crear, objeto = editar
  const [ingNombre, setIngNombre]       = useState('');
  const [ingUnidad, setIngUnidad]       = useState('kg');
  const [ingMinStock, setIngMinStock]   = useState('');
  const [ingCosto, setIngCosto]         = useState('');

  // ── Modal nueva/editar preparación ──
  const [modalPrep, setModalPrep]       = useState(false);
  const [prepEditandoId, setPrepEditandoId] = useState(null); // null = nueva
  const [prepNombre, setPrepNombre]     = useState('');
  const [prepUnidad, setPrepUnidad]     = useState('porcion');
  const [prepRinde, setPrepRinde]       = useState('1');
  const [prepItems, setPrepItems]       = useState([]); // [{ing, qty, unit}]

  // ── Modal nueva/editar receta ──
  const [modalReceta, setModalReceta]   = useState(false);
  const [recetaProd, setRecetaProd]     = useState(null);
  const [recetaItems, setRecetaItems]   = useState([]); // [{ing, qty}]

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const [ings, preps, recipes, prods, movs] = await Promise.allSettled([
        api.getIngredients(),
        api.getPreparations(),
        api.getAllRecipes(),
        api.getProducts(),
        api.getMovements({ limit: 100 }),
      ]);
      if (ings.status === 'fulfilled')    setIngredients(ings.value   || []);
      if (preps.status === 'fulfilled')   setPreparations(preps.value || []);
      if (recipes.status === 'fulfilled') setAllRecipes(recipes.value || []);
      if (prods.status === 'fulfilled')   setProducts(prods.value     || []);
      if (movs.status === 'fulfilled')    setMovements(movs.value     || []);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
      const interval = setInterval(() => load(true), 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isPremium) return;
      const url = api.getInventoryEventsUrl?.();
      if (!url) return;

      const connect = () => {
        if (sseRef.current) {
          try { sseRef.current.close(); } catch {}
          sseRef.current = null;
        }
        const es = new EventSource(url);
        sseRef.current = es;
        es.onmessage = () => load(true);
        es.onerror = () => {
          try { es.close(); } catch {}
          sseRef.current = null;
          if (sseRetryRef.current) clearTimeout(sseRetryRef.current);
          sseRetryRef.current = setTimeout(connect, 10000);
        };
      };

      connect();
      return () => {
        if (sseRetryRef.current) clearTimeout(sseRetryRef.current);
        if (sseRef.current) {
          try { sseRef.current.close(); } catch {}
          sseRef.current = null;
        }
      };
    }, [isPremium, load])
  );

  // ── Abrir editar insumo ───────────────────────────────────────────────────
  const abrirEditarInsumo = (item) => {
    setIngEditando(item);
    setIngNombre(item.name);
    setIngUnidad(item.unit || 'kg');
    setIngMinStock(item.min_stock != null ? String(item.min_stock) : '');
    setIngCosto(item.cost_per_unit != null ? String(item.cost_per_unit) : '');
    setModalIng(true);
  };

  const abrirNuevoInsumo = () => {
    setIngEditando(null);
    setIngNombre('');
    setIngUnidad('kg');
    setIngMinStock('');
    setIngCosto('');
    setModalIng(true);
  };

  // ── Guardar insumo ────────────────────────────────────────────────────────
  const guardarInsumo = async () => {
    if (!ingNombre.trim()) { Alert.alert('Error', 'Escribe el nombre del insumo'); return; }
    if (!ingUnidad.trim()) { Alert.alert('Error', 'Escribe la unidad'); return; }
    setSaving(true);
    try {
      const data = {
        name: ingNombre.trim(),
        unit: ingUnidad.trim(),
        min_stock: ingMinStock ? parseFloat(ingMinStock) : undefined,
        cost_per_unit: ingCosto ? parseFloat(ingCosto) : undefined,
      };
      if (ingEditando) {
        await api.updateIngredient(ingEditando.id, data);
      } else {
        await api.createIngredient(data);
      }
      await load(true);
      setModalIng(false);
      Alert.alert(ingEditando ? '✓ Insumo actualizado' : '✓ Insumo creado', ingNombre.trim());
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar el insumo.');
    } finally {
      setSaving(false);
    }
  };

  // ── Abrir editar preparación ──────────────────────────────────────────────
  const abrirEditarPreparacion = (item) => {
    setPrepEditandoId(item.id);
    setPrepNombre(item.name);
    setPrepUnidad(item.unit || 'porcion');
    setPrepRinde(item.yield_quantity != null ? String(item.yield_quantity) : '1');
    setPrepItems(
      (item.items || []).map(ri => ({
        ing: ri.ingredient
          ? { ...ri.ingredient, _tipo: 'ingredient', _label: ri.ingredient.name, _sub: ri.ingredient.unit }
          : null,
        qty: parseFloat(ri.quantity) || 0,
        unit: ri.unit_recipe || ri.ingredient?.unit || null,
      })).filter(i => i.ing)
    );
    setModalPrep(true);
  };

  const abrirNuevaPreparacion = () => {
    setPrepEditandoId(null);
    setPrepNombre('');
    setPrepUnidad('porcion');
    setPrepRinde('1');
    setPrepItems([]);
    setModalPrep(true);
  };

  // ── Abrir editar receta ───────────────────────────────────────────────────
  const abrirEditarReceta = (product, items) => {
    setRecetaProd(product);
    setRecetaItems(
      items.map(r => {
        let ing = null;
        if (r.item_type === 'ingredient') {
          const found = ingredients.find(i => i.id === r.item_id);
          if (found) ing = { ...found, _tipo: 'ingredient', _label: found.name, _sub: found.unit };
        } else {
          const found = preparations.find(p => p.id === r.item_id);
          if (found) ing = { ...found, _tipo: 'preparation', _label: found.name, _sub: found.unit };
        }
        return { ing, qty: parseFloat(r.quantity) || 0 };
      }).filter(i => i.ing)
    );
    setModalReceta(true);
  };

  // ── Guardar movimiento ────────────────────────────────────────────────────
  const guardarMovimiento = async () => {
    if (!ingSelec) { Alert.alert('Error', 'Selecciona un insumo'); return; }
    const qty = parseFloat(cantidad);
    if (!qty || qty <= 0) { Alert.alert('Error', 'Escribe una cantidad válida'); return; }
    setSaving(true);
    try {
      await api.createMovement({
        ingredient_id: ingSelec.id,
        type: tipoMov,
        quantity: qty,
        reason: tipoMov === 'salida' ? motivo : undefined,
        notes: notasMov.trim() || undefined,
      });
      await load(true);
      setModalMov(false);
      Alert.alert(
        tipoMov === 'entrada' ? '✓ Entrada registrada' : '✓ Salida registrada',
        `${tipoMov === 'entrada' ? '+' : '−'}${qty} ${ingSelec.unit ?? ''} de ${ingSelec.name}`
      );
    } catch {
      Alert.alert('Error', 'No se pudo registrar el movimiento. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  // ── Guardar preparación ───────────────────────────────────────────────────
  const guardarPreparacion = async () => {
    if (!prepNombre.trim()) { Alert.alert('Error', 'Escribe el nombre de la preparación'); return; }
    setSaving(true);
    try {
      let prepId;
      if (prepEditandoId) {
        await api.updatePreparation(prepEditandoId, {
          name: prepNombre.trim(),
          unit: prepUnidad.trim() || 'porcion',
          yield_quantity: parseFloat(prepRinde) || 1,
        });
        prepId = prepEditandoId;
      } else {
        const nueva = await api.createPreparation({
          name: prepNombre.trim(),
          unit: prepUnidad.trim() || 'porcion',
          yield_quantity: parseFloat(prepRinde) || 1,
        });
        prepId = nueva.id;
      }
      const itemsValidos = prepItems.filter(it => it.ing && it.qty > 0);
      if (itemsValidos.length > 0) {
        await api.savePreparationRecipe(prepId, itemsValidos.map(it => ({
          ingredient_id: it.ing.id,
          quantity: it.qty,
          unit_recipe: it.unit || it.ing?.unit || null,
        })));
      }
      await load(true);
      setModalPrep(false);
      Alert.alert(prepEditandoId ? '✓ Preparación actualizada' : '✓ Preparación creada', prepNombre.trim());
    } catch(e) {
      Alert.alert('Error', e.message || 'No se pudo guardar la preparación.');
    } finally {
      setSaving(false);
    }
  };

  // ── Borrar receta ─────────────────────────────────────────────────────────
  const borrarReceta = async (productId) => {
    try {
      await api.deleteProductRecipe(productId);
      await load(true);
    } catch(e) {
      Alert.alert('Error', e.message || 'No se pudo borrar la receta.');
    }
  };

  // ── Guardar receta ────────────────────────────────────────────────────────
  const guardarReceta = async () => {
    if (!recetaProd) { Alert.alert('Error', 'Selecciona un producto'); return; }
    const itemsValidos = recetaItems.filter(it => it.ing && it.qty > 0);
    if (itemsValidos.length === 0) { Alert.alert('Error', 'Agrega al menos un ingrediente o preparación'); return; }
    setSaving(true);
    try {
      await api.saveProductRecipe(recetaProd.id, itemsValidos.map(it => ({
        item_type: it.ing._tipo,
        item_id: it.ing.id,
        quantity: it.qty,
      })));
      await load(true);
      setModalReceta(false);
      Alert.alert('✓ Receta guardada', recetaProd.name);
    } catch(e) {
      Alert.alert('Error', e.message || 'No se pudo guardar la receta.');
    } finally {
      setSaving(false);
    }
  };

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.pageTitle}>Inventario</Text>
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const q = busqueda.toLowerCase();
  const stockBajo = ingredients.filter(i => i.stock !== null && i.min_stock !== null && i.stock <= i.min_stock);
  const filtInsumos = ingredients.filter(i => !q || i.name.toLowerCase().includes(q));
  const filtPreps   = preparations.filter(p => !q || p.name.toLowerCase().includes(q));
  const filtMovs    = movements.filter(m => !q || m.ingredient?.name?.toLowerCase().includes(q));

  const recetasPorProd = {};
  for (const r of allRecipes) {
    if (!recetasPorProd[r.product_id]) recetasPorProd[r.product_id] = [];
    recetasPorProd[r.product_id].push(r);
  }
  const recetasData = Object.entries(recetasPorProd)
    .map(([pid, items]) => {
      const prod = products.find(p => p.id === parseInt(pid));
      const product = prod || { id: parseInt(pid), name: `Producto #${pid}`, emoji: '📦' };
      return { product, items };
    })
    .filter(r => !q || r.product.name.toLowerCase().includes(q));

  const TABS = [
    { key: 'insumos',       label: 'Insumos',    icon: 'layers-outline' },
    { key: 'preparaciones', label: 'Preps',      icon: 'beaker-outline' },
    { key: 'recetas',       label: 'Recetas',    icon: 'book-outline' },
    { key: 'historial',     label: 'Historial',  icon: 'time-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Inventario</Text>
        <View style={styles.headerActions}>
          {tab === 'insumos' && <>
            <TouchableOpacity style={styles.btnAdd} onPress={abrirNuevoInsumo}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.btnAddText}>Nuevo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnEntrada} onPress={() => { setTipoMov('entrada'); setIngSelec(null); setCantidad(''); setNotasMov(''); setMotivo('merma'); setModalMov(true); }}>
              <Ionicons name="add-circle-outline" size={15} color="#16a34a" />
              <Text style={styles.btnEntradaText}>Entrada</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSalida} onPress={() => { setTipoMov('salida'); setIngSelec(null); setCantidad(''); setNotasMov(''); setMotivo('merma'); setModalMov(true); }}>
              <Ionicons name="remove-circle-outline" size={15} color="#dc2626" />
              <Text style={styles.btnSalidaText}>Salida</Text>
            </TouchableOpacity>
          </>}
          {tab === 'preparaciones' && (
            <TouchableOpacity style={styles.btnAdd} onPress={abrirNuevaPreparacion}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.btnAddText}>Nueva</Text>
            </TouchableOpacity>
          )}
          {tab === 'recetas' && (
            <TouchableOpacity style={styles.btnAdd} onPress={() => { setRecetaProd(null); setRecetaItems([]); setModalReceta(true); }}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.btnAddText}>Nueva</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stock bajo */}
      {stockBajo.length > 0 && tab === 'insumos' && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning-outline" size={18} color={colors.danger} />
          <Text style={styles.alertBannerText}>{stockBajo.length} {stockBajo.length === 1 ? 'insumo' : 'insumos'} con stock bajo</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => { setTab(t.key); setBusqueda(''); }}
          >
            <Ionicons name={t.icon} size={14} color={tab === t.key ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Búsqueda */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={tab === 'insumos' ? 'Buscar insumo...' : tab === 'preparaciones' ? 'Buscar preparación...' : tab === 'recetas' ? 'Buscar producto...' : 'Buscar...'}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Contenido */}
      {tab === 'insumos' && (
        <FlatList data={filtInsumos} keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <IngredientRow item={item} onEdit={abrirEditarInsumo} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay insumos registrados</Text>}
        />
      )}
      {tab === 'preparaciones' && (
        <FlatList data={filtPreps} keyExtractor={p => String(p.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <PrepRow item={item} onEdit={abrirEditarPreparacion} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay preparaciones registradas</Text>}
        />
      )}
      {tab === 'recetas' && (
        <FlatList data={recetasData} keyExtractor={r => String(r.product?.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => (
            <RecetaRow product={item.product} items={item.items} ingredients={ingredients} preparations={preparations} onDelete={borrarReceta} onEdit={abrirEditarReceta} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No hay recetas asignadas</Text>}
        />
      )}
      {tab === 'historial' && (
        <FlatList data={filtMovs} keyExtractor={m => String(m.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <MovRow item={item} />}
          ListEmptyComponent={<Text style={styles.empty}>No hay movimientos registrados</Text>}
        />
      )}

      {/* ── Modal movimiento ── */}
      <Modal visible={modalMov} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTabs}>
                  <TouchableOpacity style={[styles.modalTab, tipoMov === 'entrada' && styles.modalTabEntrada]} onPress={() => setTipoMov('entrada')}>
                    <Text style={[styles.modalTabText, tipoMov === 'entrada' && styles.modalTabTextEntrada]}>+ Entrada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalTab, tipoMov === 'salida' && styles.modalTabSalida]} onPress={() => setTipoMov('salida')}>
                    <Text style={[styles.modalTabText, tipoMov === 'salida' && styles.modalTabTextSalida]}>− Salida</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setModalMov(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Insumo</Text>
                <IngSelector ingredients={ingredients} preparations={[]} selected={ingSelec} onSelect={setIngSelec} />
                <Text style={[styles.label, { marginTop: spacing.md }]}>Cantidad{ingSelec?.unit ? ` (${ingSelec.unit})` : ''}</Text>
                <TextInput style={styles.input} value={cantidad} onChangeText={setCantidad} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
                {tipoMov === 'salida' && <>
                  <Text style={[styles.label, { marginTop: spacing.md }]}>Motivo</Text>
                  <View style={styles.motivosRow}>
                    {MOTIVOS.map(m => (
                      <TouchableOpacity key={m.key} style={[styles.motivoChip, motivo === m.key && styles.motivoChipActivo]} onPress={() => setMotivo(m.key)}>
                        <Text style={[styles.motivoText, motivo === m.key && styles.motivoTextActivo]}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}
                <Text style={[styles.label, { marginTop: spacing.md }]}>Notas (opcional)</Text>
                <TextInput style={[styles.input, { height: 68, textAlignVertical: 'top', paddingTop: spacing.sm }]} value={notasMov} onChangeText={setNotasMov} placeholder="Observaciones..." placeholderTextColor={colors.textMuted} multiline />
                <TouchableOpacity style={[styles.btnGuardar, tipoMov === 'salida' && styles.btnGuardarSalida, saving && { opacity: 0.6 }]} onPress={guardarMovimiento} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnGuardarText}>{tipoMov === 'entrada' ? 'Registrar Entrada' : 'Registrar Salida'}</Text>}
                </TouchableOpacity>
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal insumo (crear / editar) ── */}
      <Modal visible={modalIng} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{ingEditando ? 'Editar Insumo' : 'Nuevo Insumo'}</Text>
                <TouchableOpacity onPress={() => setModalIng(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Nombre *</Text>
                <TextInput
                  style={styles.input}
                  value={ingNombre}
                  onChangeText={setIngNombre}
                  placeholder="Ej: Sal, Harina, Aceite"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={[styles.label, { marginTop: spacing.md }]}>Unidad *</Text>
                <View style={styles.motivosRow}>
                  {['kg', 'g', 'l', 'ml', 'porción', 'unidad', 'pieza', 'lata', 'caja'].map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.motivoChip, ingUnidad === u && styles.motivoChipActivo]}
                      onPress={() => setIngUnidad(u)}
                    >
                      <Text style={[styles.motivoText, ingUnidad === u && styles.motivoTextActivo]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, { marginTop: spacing.sm }]}
                  value={ingUnidad}
                  onChangeText={setIngUnidad}
                  placeholder="O escribe la unidad"
                  placeholderTextColor={colors.textMuted}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Stock mínimo</Text>
                    <TextInput
                      style={styles.input}
                      value={ingMinStock}
                      onChangeText={setIngMinStock}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Costo por unidad</Text>
                    <TextInput
                      style={styles.input}
                      value={ingCosto}
                      onChangeText={setIngCosto}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <TouchableOpacity style={[styles.btnGuardar, saving && { opacity: 0.6 }, { marginTop: spacing.lg }]} onPress={guardarInsumo} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnGuardarText}>{ingEditando ? 'Actualizar Insumo' : 'Crear Insumo'}</Text>}
                </TouchableOpacity>
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal nueva preparación ── */}
      <Modal visible={modalPrep} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{prepEditandoId ? 'Editar Preparación' : 'Nueva Preparación'}</Text>
                <TouchableOpacity onPress={() => setModalPrep(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Nombre *</Text>
                <TextInput style={styles.input} value={prepNombre} onChangeText={setPrepNombre} placeholder="Ej: Salsa roja" placeholderTextColor={colors.textMuted} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Unidad</Text>
                    <TextInput style={styles.input} value={prepUnidad} onChangeText={setPrepUnidad} placeholder="porcion" placeholderTextColor={colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Rinde</Text>
                    <TextInput style={styles.input} value={prepRinde} onChangeText={setPrepRinde} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
                  </View>
                </View>

                <Text style={[styles.label, { marginTop: spacing.md }]}>Ingredientes</Text>
                {prepItems.map((it, idx) => (
                  <View key={idx} style={styles.recetaLineaRow}>
                    <View style={{ flex: 1 }}>
                      <IngSelector ingredients={ingredients} preparations={[]} selected={it.ing} onSelect={ing => {
                        const copy = [...prepItems];
                        copy[idx] = { ...copy[idx], ing, unit: ing?.unit || copy[idx]?.unit || null };
                        setPrepItems(copy);
                      }} />
                    </View>
                    <TextInput
                      style={[styles.input, { width: 70, marginLeft: spacing.xs }]}
                      value={String(it.qty || '')}
                      onChangeText={v => { const copy = [...prepItems]; copy[idx] = { ...copy[idx], qty: parseFloat(v) || 0 }; setPrepItems(copy); }}
                      placeholder="Cant."
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                    {it.ing ? (
                      <View style={{ flexDirection: 'column', marginLeft: spacing.xs }}>
                        {unidadesInsumo(it.ing).map(u => (
                          <TouchableOpacity
                            key={u}
                            onPress={() => { const copy = [...prepItems]; copy[idx] = { ...copy[idx], unit: u }; setPrepItems(copy); }}
                            style={[styles.unitChip, it.unit === u && styles.unitChipActive]}
                          >
                            <Text style={[styles.unitChipText, it.unit === u && styles.unitChipTextActive]}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    <TouchableOpacity onPress={() => setPrepItems(prepItems.filter((_, i) => i !== idx))} style={{ padding: spacing.xs }}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.btnAddLinea} onPress={() => setPrepItems([...prepItems, { ing: null, qty: 0, unit: null }])}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.btnAddLineaText}>Agregar ingrediente</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.btnGuardar, saving && { opacity: 0.6 }, { marginTop: spacing.lg }]} onPress={guardarPreparacion} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnGuardarText}>{prepEditandoId ? 'Actualizar Preparación' : 'Guardar Preparación'}</Text>}
                </TouchableOpacity>
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal nueva receta ── */}
      <Modal visible={modalReceta} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{recetaProd && recetaItems.length > 0 ? 'Editar Receta' : 'Nueva Receta'}</Text>
                <TouchableOpacity onPress={() => setModalReceta(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Producto *</Text>
                {recetaProd ? (
                  <View style={styles.ingSelecRow}>
                    <Text style={{ fontSize: 20, marginRight: spacing.xs }}>{recetaProd.emoji || '📦'}</Text>
                    <Text style={[styles.ingSelecNombre, { flex: 1 }]}>{recetaProd.name}</Text>
                    <TouchableOpacity onPress={() => setRecetaProd(null)}>
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ProductSelector products={products} onSelect={setRecetaProd} />
                )}

                <Text style={[styles.label, { marginTop: spacing.md }]}>Ingredientes / Preparaciones</Text>
                {recetaItems.map((it, idx) => (
                  <View key={idx} style={styles.recetaLineaRow}>
                    <View style={{ flex: 1 }}>
                      <IngSelector ingredients={ingredients} preparations={preparations} selected={it.ing} includePreps onSelect={ing => {
                        const copy = [...recetaItems]; copy[idx] = { ...copy[idx], ing }; setRecetaItems(copy);
                      }} />
                    </View>
                    <TextInput
                      style={[styles.input, { width: 70, marginLeft: spacing.xs }]}
                      value={String(it.qty || '')}
                      onChangeText={v => { const copy = [...recetaItems]; copy[idx] = { ...copy[idx], qty: parseFloat(v) || 0 }; setRecetaItems(copy); }}
                      placeholder="Cant."
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity onPress={() => setRecetaItems(recetaItems.filter((_, i) => i !== idx))} style={{ padding: spacing.xs }}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.btnAddLinea} onPress={() => setRecetaItems([...recetaItems, { ing: null, qty: 0 }])}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.btnAddLineaText}>Agregar componente</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.btnGuardar, saving && { opacity: 0.6 }, { marginTop: spacing.lg }]} onPress={guardarReceta} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnGuardarText}>Guardar Receta</Text>}
                </TouchableOpacity>
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Selector de producto ─────────────────────────────────────────────────────
function ProductSelector({ products, onSelect }) {
  const [busq, setBusq] = useState('');
  const sugs = busq.length > 0
    ? products.filter(p => p.name.toLowerCase().includes(busq.toLowerCase())).slice(0, 8)
    : [];
  return (
    <View>
      <TextInput
        style={styles.input}
        value={busq}
        onChangeText={setBusq}
        placeholder="Buscar producto..."
        placeholderTextColor={colors.textMuted}
      />
      {sugs.length > 0 && (
        <View style={styles.sugerenciasBox}>
          {sugs.map(p => (
            <TouchableOpacity key={p.id} style={styles.sugerenciaItem} onPress={() => { onSelect(p); setBusq(''); }}>
              <Text style={styles.sugNombre}>{p.emoji ? `${p.emoji} ` : ''}{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe:                { flex: 1, backgroundColor: colors.background },
  centered:            { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  pageTitle:           { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  headerActions:       { flexDirection: 'row', gap: spacing.sm },
  btnEntrada:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnEntradaText:      { fontSize: font.sm - 1, fontWeight: '700', color: '#16a34a' },
  btnSalida:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnSalidaText:       { fontSize: font.sm - 1, fontWeight: '700', color: '#dc2626' },
  btnAdd:              { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnAddText:          { fontSize: font.sm - 1, fontWeight: '700', color: colors.primary },
  alertBanner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.danger + '15', borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.sm + 2, gap: spacing.sm },
  alertBannerText:     { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
  tabBar:              { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 3, gap: 2 },
  tabItem:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: spacing.sm - 1, borderRadius: radius.md },
  tabItemActive:       { backgroundColor: colors.primary },
  tabText:             { fontSize: font.sm - 3, fontWeight: '600', color: colors.textMuted },
  tabTextActive:       { color: '#fff' },
  searchWrap:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, gap: spacing.xs },
  searchInput:         { flex: 1, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary },
  listContent:         { padding: spacing.lg, paddingTop: 0 },
  row:                 { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  rowName:             { fontSize: font.sm, fontWeight: '700', color: colors.textPrimary },
  rowUnit:             { fontSize: font.sm - 2, color: colors.textMuted },
  stockWrap:           { alignItems: 'flex-end' },
  stock:               { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  alertBadge:          { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  alertText:           { fontSize: font.sm - 2, color: colors.danger, fontWeight: '600' },
  expandedBox:         { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.border },
  recipeItem:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  recipeItemText:      { flex: 1, fontSize: font.sm - 1, color: colors.textSecondary },
  recipeItemQty:       { fontSize: font.sm - 1, fontWeight: '700', color: colors.textPrimary },
  sinDatos:            { fontSize: font.sm - 1, color: colors.textMuted, fontStyle: 'italic' },
  movIcon:             { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  empty:               { color: colors.textMuted, fontSize: font.md, textAlign: 'center', marginTop: spacing.xxl },
  premiumWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:        { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:     { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  overlay:             { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalBox:            { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHeader:         { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
  modalTitle:          { flex: 1, fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  modalTabs:           { flex: 1, flexDirection: 'row', gap: spacing.sm },
  modalTab:            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  modalTabEntrada:     { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  modalTabSalida:      { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  modalTabText:        { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  modalTabTextEntrada: { color: '#16a34a' },
  modalTabTextSalida:  { color: '#dc2626' },
  closeBtn:            { padding: spacing.xs },
  modalBody:           { padding: spacing.lg },
  label:               { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input:               { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.md, color: colors.textPrimary },
  ingSelecRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  ingSelecNombre:      { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  ingSelecStock:       { fontSize: font.sm - 1, color: colors.textSecondary, marginTop: 2 },
  sugerenciasBox:      { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.xs, overflow: 'hidden' },
  sugerenciaItem:      { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  sugNombre:           { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  sugStock:            { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  motivosRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  motivoChip:          { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  motivoChipActivo:    { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  motivoText:          { fontSize: font.sm - 1, color: colors.textSecondary, fontWeight: '600' },
  motivoTextActivo:    { color: '#dc2626' },
  btnGuardar:          { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnGuardarSalida:    { backgroundColor: colors.danger },
  btnGuardarText:      { color: '#fff', fontWeight: '800', fontSize: font.md },
  recetaLineaRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.xs },
  btnAddLinea:         { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '08', marginTop: spacing.xs },
  btnAddLineaText:     { fontSize: font.sm, color: colors.primary, fontWeight: '600' },
  unitChip:            { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 4, alignItems: 'center' },
  unitChipActive:      { backgroundColor: colors.primary, borderColor: colors.primary },
  unitChipText:        { fontSize: font.sm - 2, color: colors.textSecondary, fontWeight: '700' },
  unitChipTextActive:  { color: '#fff' },
});
