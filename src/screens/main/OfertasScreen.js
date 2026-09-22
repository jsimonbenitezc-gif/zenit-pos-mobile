import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, Alert, TouchableOpacity, TextInput, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { colors, spacing, radius, font } from '../../theme';
import LogoTitle from '../../components/LogoTitle';
import EditorCalendario from '../../components/EditorCalendario';
import { formatMoney } from '../../utils/money';
import { friendlyError } from '../../utils/errors';
import {
  promoDeCatalogo, promosActivasAhora, textoHuecos, textoCobro, textoCalendario,
  plantillaPromo, promoDeFormulario, validarFormularioPromo, formularioDePromo,
  vistaPreviaPromo, guardarPromoEnServidor, calendarioDeFormulario, formularioDeCalendario,
  ofertasAcumulablesDe,
} from '../../utils/promos';

// ============================================================================
// OFERTAS (Premium): las PROMOS ("Martes 2x1 tacos", PLAN_OFERTAS_V1) y los
// DESCUENTOS de la cuenta. Hasta el Bloque 3 el celular solo tenía descuentos:
// los combos se podían crear en el desktop y no se veían aquí.
//
// Crear o cambiar una promo PIDE CONEXIÓN (trampa 9): los ids son del backend,
// igual que los modificadores. Venderla no: la venta usa la caché.
// ============================================================================

const TIPO_LABEL = { percentage: 'Porcentaje', fixed: 'Monto fijo' };

function DiscountCard({ discount, currency, onEdit }) {
  const isPercent = discount.type === 'percentage';
  return (
    <TouchableOpacity
      style={[styles.card, !discount.active && styles.cardInactive]}
      onPress={() => onEdit(discount)}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{discount.name}</Text>
        <View style={styles.valueBadge}>
          <Text style={styles.valueText}>
            {isPercent ? `${discount.value}%` : formatMoney(parseFloat(discount.value), currency)}
          </Text>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.cardTipo}>{TIPO_LABEL[discount.type] || discount.type}</Text>
        {discount.calendario ? <Text style={styles.cardTipo}>· {textoCalendario(discount.calendario)}</Text> : null}
        {discount.requires_pin && (
          <View style={styles.pinBadge}>
            <Ionicons name="key-outline" size={11} color="#7c3aed" />
            <Text style={styles.pinBadgeText}>PIN</Text>
          </View>
        )}
        {!discount.active && (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveText}>Inactivo</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PromoCard({ promo, activa, productos, categorias, currency, onEdit }) {
  return (
    <TouchableOpacity style={[styles.card, styles.cardPromo]} onPress={() => onEdit(promo)} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>🎁 {promo.name}</Text>
        <View style={[styles.estadoBadge, activa ? styles.estadoActiva : styles.estadoEspera]}>
          <Text style={[styles.estadoTexto, { color: activa ? colors.success : colors.textMuted }]}>
            {activa ? 'Activa ahora' : 'Fuera de horario'}
          </Text>
        </View>
      </View>
      <Text style={styles.promoLinea}>{textoHuecos(promo, productos, categorias)} · {textoCobro(promo, currency)}</Text>
      <Text style={styles.promoCal}>{textoCalendario(promo.calendario)}</Text>
    </TouchableOpacity>
  );
}

function PremiumGate() {
  const navigation = useNavigation();
  return (
    <View style={styles.premiumWrap}>
      <Ionicons name="pricetag-outline" size={52} color={colors.textMuted} />
      <Text style={styles.premiumTitle}>Función Premium</Text>
      <Text style={styles.premiumSubtitle}>
        Las promos y los descuentos están disponibles en el plan Premium.
        Revisa el estado de tu plan en Ajustes.
      </Text>
      <TouchableOpacity
        style={styles.premiumBtn}
        onPress={() => navigation.navigate('Ajustes')}
      >
        <Text style={styles.premiumBtnText}>Ver mi plan</Text>
      </TouchableOpacity>
    </View>
  );
}

// Estados iniciales vacíos de los formularios
const FORM_EMPTY = { nombre: '', tipo: 'percentage', valor: '', active: true, requires_pin: false, calendario: formularioDeCalendario(null) };
const PROMO_EMPTY = plantillaPromo('2x1', { nombre: '', precio: '', huecos: [], calendario: formularioDeCalendario(null) });

export default function OfertasScreen() {
  const { user, settings, isPremium, refreshSettings } = useAuth();
  const { online } = useNetwork();
  const isOwner = user?.role === 'owner';
  const currency = settings?.currency_symbol || '$';

  const [tab, setTab]             = useState('promos');
  const [discounts, setDiscounts] = useState([]);
  const [promos, setPromos]       = useState([]);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);

  // Modal crear/editar descuento
  const [modal, setModal]         = useState(false);
  const [editando, setEditando]   = useState(null); // null = crear, objeto = editar
  const [form, setForm]           = useState(FORM_EMPTY);
  const [saving, setSaving]       = useState(false);

  // Modal crear/editar promo
  const [modalPromo, setModalPromo] = useState(false);
  const [formPromo, setFormPromo]   = useState(PROMO_EMPTY);
  const [plantilla, setPlantilla]   = useState('2x1');
  const [pickerHueco, setPickerHueco] = useState(null); // índice del hueco que se está eligiendo

  // Juntar ofertas (§3.4). Se lee de los ajustes del negocio.
  const [acumulables, setAcumulables] = useState(ofertasAcumulablesDe(settings));
  useEffect(() => { setAcumulables(ofertasAcumulablesDe(settings)); }, [settings]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isPremium) { setLoading(false); return; }
    if (isRefresh) setRefresh(true);
    try {
      const [ds, combos, grouped] = await Promise.all([
        api.getDiscounts(),
        api.getCombos(),
        api.getProductsGrouped(),
      ]);
      setDiscounts(ds || []);
      // Una promo quitada es un borrado SUAVE (active=false): no se enseña.
      setPromos((combos || []).filter(c => c.active !== false).map(promoDeCatalogo).filter(Boolean));
      setCategorias((grouped || []).map(g => ({ id: g.id, name: g.name })));
      setProductos((grouped || []).flatMap(g => (g.products || []).map(p => ({ ...p, category_id: g.id }))));
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las ofertas. Revisa tu conexión.');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [isPremium]);

  useEffect(() => { load(); }, [load]);

  function sinConexion(accion) {
    if (online) return false;
    Alert.alert('Sin conexión', `${accion} necesita conexión con tu cuenta Zenit. Vender las promos que ya existen, no.`);
    return true;
  }

  // ── Descuentos ────────────────────────────────────────────────────────────

  function abrirCrear() {
    setEditando(null);
    setForm(FORM_EMPTY);
    setModal(true);
  }

  function abrirEditar(d) {
    if (!isOwner) return;
    setEditando(d);
    setForm({
      nombre: d.name,
      tipo: d.type,
      valor: String(d.value),
      active: d.active,
      requires_pin: !!d.requires_pin,
      calendario: formularioDeCalendario(d.calendario),
    });
    setModal(true);
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { Alert.alert('Error', 'Escribe un nombre'); return; }
    const v = parseFloat(form.valor);
    if (!v || v <= 0) { Alert.alert('Error', 'Valor inválido'); return; }
    if (form.tipo === 'percentage' && (v < 1 || v > 100)) {
      Alert.alert('Error', 'El porcentaje debe estar entre 1 y 100');
      return;
    }
    // "10% los lunes" (§3.3): el mismo calendario que las promos.
    const cal = calendarioDeFormulario(form.calendario);
    if (!cal.ok) { Alert.alert('Revisa el calendario', cal.error); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.nombre.trim(),
        type: form.tipo,
        value: v,
        applies_to: 'all',
        active: form.active,
        requires_pin: form.requires_pin,
        calendario: cal.calendario,
      };
      if (editando) {
        await api.updateDiscount(editando.id, payload);
      } else {
        await api.createDiscount(payload);
      }
      setModal(false);
      await load(true);
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo guardar el descuento.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarBorrar = (d) => {
    Alert.alert(
      'Eliminar descuento',
      `¿Eliminar "${d.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => borrar(d.id) },
      ]
    );
  };

  const borrar = async (id) => {
    try {
      await api.deleteDiscount(id);
      await load(true);
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo eliminar el descuento.');
    }
  };

  // ── Promos ────────────────────────────────────────────────────────────────

  function abrirCrearPromo() {
    if (sinConexion('Crear una promo')) return;
    setPlantilla('2x1');
    setFormPromo(PROMO_EMPTY);
    setModalPromo(true);
  }

  function abrirEditarPromo(p) {
    if (!isOwner) return;
    if (sinConexion('Cambiar una promo')) return;
    setPlantilla(null);
    setFormPromo(formularioDePromo(p));
    setModalPromo(true);
  }

  function elegirPlantilla(cual) {
    setPlantilla(cual);
    setFormPromo(f => plantillaPromo(cual, f));
  }

  function cambiarHueco(i, cambios) {
    setFormPromo(f => ({ ...f, huecos: f.huecos.map((h, j) => (j === i ? { ...h, ...cambios } : h)) }));
  }

  async function guardarPromo() {
    if (sinConexion('Guardar una promo')) return;
    const v = validarFormularioPromo(formPromo);
    if (!v.ok) { Alert.alert('Revisa la promo', v.error); return; }
    setSaving(true);
    try {
      await guardarPromoEnServidor(api, v, formPromo.id || null);
      setModalPromo(false);
      await load(true);
      Alert.alert('¡Promo guardada!', 'Ya aparece en Nueva Venta y en Mesas en su día y su hora.');
    } catch (e) {
      Alert.alert('No se pudo guardar la promo', friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmarQuitarPromo() {
    if (!formPromo.id) return;
    if (sinConexion('Quitar una promo')) return;
    // Borrado SUAVE (trampa 6): los tickets ya cobrados no cambian, porque el
    // nombre y el precio van congelados en cada venta.
    Alert.alert('¿Quitar la promo?', `"${formPromo.nombre}" dejará de aparecer en la venta. Los tickets ya cobrados no cambian.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive', onPress: async () => {
          try {
            await api.deleteCombo(formPromo.id);
            setModalPromo(false);
            await load(true);
          } catch (e) {
            Alert.alert('No se pudo quitar la promo', friendlyError(e));
          }
        },
      },
    ]);
  }

  /** El interruptor de juntar ofertas (§3.4). Es del DUEÑO: al resto el servidor le dice 403. */
  async function cambiarAcumulables(valor) {
    if (sinConexion('Cambiar esto')) return;
    const antes = acumulables;
    setAcumulables(valor);
    try {
      await api.updateSettings({ ofertas_acumulables: valor === true });
      await refreshSettings?.();
    } catch (e) {
      setAcumulables(antes);
      Alert.alert('No se pudo guardar', friendlyError(e));
    }
  }

  if (!isPremium) return (
    <SafeAreaView style={styles.safe}>
      <LogoTitle title="Ofertas" titleStyle={styles.title} />
      <PremiumGate />
    </SafeAreaView>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const activasAhora = new Set(promosActivasAhora(promos, productos).map(p => p.id));
  const promoForm = promoDeFormulario(formPromo);
  const vista = vistaPreviaPromo(promoForm, productos, categorias, currency);
  const nombreDeQue = (que) => {
    if (!que) return 'Elige…';
    const id = parseInt(String(que).slice(2), 10);
    if (String(que).startsWith('c:')) {
      const c = categorias.find(x => x.id === id);
      return c ? `${c.name} (cualquiera)` : 'Categoría';
    }
    const p = productos.find(x => x.id === id);
    return p ? p.name : 'Producto';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <LogoTitle title="Ofertas" titleStyle={styles.title} />
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={12} color="#f59e0b" />
          <Text style={styles.premiumBadgeText}>Premium</Text>
        </View>
        {isOwner && (
          <TouchableOpacity style={styles.btnAdd} onPress={tab === 'promos' ? abrirCrearPromo : abrirCrear}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.btnAddText}>{tab === 'promos' ? 'Nueva promo' : 'Nuevo'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabs}>
        {[{ k: 'promos', t: 'Promos' }, { k: 'descuentos', t: 'Descuentos' }].map(x => (
          <TouchableOpacity key={x.k} style={[styles.tab, tab === x.k && styles.tabActiva]} onPress={() => setTab(x.k)}>
            <Text style={[styles.tabTexto, tab === x.k && { color: '#fff' }]}>{x.t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'promos' ? (
        <FlatList
          data={promos}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListHeaderComponent={isOwner ? (
            <View style={styles.acumulablesBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>¿Los descuentos también se aplican a los productos que ya están en promoción?</Text>
                <Text style={styles.switchSub}>
                  {acumulables ? 'Sí: el descuento se calcula sobre toda la cuenta.' : 'No: el descuento solo toca lo que no está en promo.'}
                </Text>
              </View>
              <Switch value={acumulables} onValueChange={cambiarAcumulables} trackColor={{ true: '#7c3aed' }} />
            </View>
          ) : null}
          renderItem={({ item }) => (
            <PromoCard
              promo={item} activa={activasAhora.has(item.id)} productos={productos}
              categorias={categorias} currency={currency} onEdit={abrirEditarPromo}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="gift-outline" size={48} color={colors.textMuted} />
              <Text style={styles.empty}>No hay promos creadas</Text>
              {isOwner && <Text style={styles.emptyHint}>Toca "Nueva promo": un 2x1 se arma en segundos</Text>}
            </View>
          }
        />
      ) : (
        <FlatList
          data={discounts}
          keyExtractor={d => String(d.id)}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item }) => <DiscountCard discount={item} currency={currency} onEdit={abrirEditar} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
              <Text style={styles.empty}>No hay descuentos creados</Text>
              {isOwner && <Text style={styles.emptyHint}>Toca "Nuevo" para agregar uno</Text>}
            </View>
          }
        />
      )}

      {/* ── Modal crear / editar PROMO (§3.5 del plan) ── */}
      <Modal visible={modalPromo} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalPromo(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{formPromo.id ? 'Editar promo' : 'Nueva promo'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              {formPromo.id ? (
                <TouchableOpacity onPress={confirmarQuitarPromo}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setModalPromo(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Las plantillas llenan todo lo de abajo */}
            <View style={styles.tipoRow}>
              {['2x1', '3x2', 'combo'].map(p => (
                <TouchableOpacity key={p} style={[styles.tipoBtn, plantilla === p && styles.tipoBtnActive]} onPress={() => elegirPlantilla(p)}>
                  <Text style={[styles.tipoText, plantilla === p && styles.tipoTextActive]}>{p === 'combo' ? 'Combo' : p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={formPromo.nombre}
              onChangeText={v => setFormPromo(f => ({ ...f, nombre: v }))}
              placeholder="Ej: Martes 2x1 tacos"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>¿Qué lleva?</Text>
            {formPromo.huecos.map((h, i) => (
              <View key={i} style={styles.huecoRow}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => cambiarHueco(i, { quantity: Math.max(1, (parseInt(h.quantity, 10) || 1) - 1) })}>
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.qtyTxt}>{h.quantity}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => cambiarHueco(i, { quantity: Math.min(20, (parseInt(h.quantity, 10) || 1) + 1) })}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.de}>de</Text>
                <TouchableOpacity style={styles.queBtn} onPress={() => setPickerHueco(i)}>
                  <Text style={styles.queTexto} numberOfLines={1}>{nombreDeQue(h.que)}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
                {formPromo.huecos.length > 1 && (
                  <TouchableOpacity onPress={() => setFormPromo(f => ({ ...f, huecos: f.huecos.filter((_, j) => j !== i) }))}>
                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={() => setFormPromo(f => ({ ...f, huecos: [...f.huecos, { quantity: 1, que: null }] }))}>
              <Text style={styles.agregarOtro}>+ agregar otro</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: spacing.md }]}>¿Cuánto se cobra?</Text>
            <TouchableOpacity style={styles.radioRow} onPress={() => setFormPromo(f => ({ ...f, tipo: 'regalar_mas_barato', paga: f.paga || 1 }))}>
              <Ionicons name={formPromo.tipo === 'regalar_mas_barato' ? 'radio-button-on' : 'radio-button-off'} size={18} color={colors.primary} />
              <Text style={styles.radioTexto}>Se regala el más barato</Text>
            </TouchableOpacity>
            {formPromo.tipo === 'regalar_mas_barato' && (
              <View style={styles.pagaRow}>
                <Text style={styles.radioSub}>Se cobran</Text>
                <TextInput
                  style={[styles.input, { width: 60, textAlign: 'center' }]}
                  value={String(formPromo.paga ?? '')}
                  onChangeText={v => setFormPromo(f => ({ ...f, paga: v.replace(/[^\d]/g, '') }))}
                  keyboardType="number-pad"
                />
                {/* Lo que la promo lleva según los renglones, aunque falte elegir qué entra
                    en alguno: antes decía "de 0" hasta que se elegía (visto en el emulador). */}
                <Text style={styles.radioSub}>de {formPromo.huecos.reduce((s, h) => s + (parseInt(h.quantity, 10) || 0), 0)}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.radioRow} onPress={() => setFormPromo(f => ({ ...f, tipo: 'precio_fijo' }))}>
              <Ionicons name={formPromo.tipo === 'precio_fijo' ? 'radio-button-on' : 'radio-button-off'} size={18} color={colors.primary} />
              <Text style={styles.radioTexto}>Precio fijo</Text>
            </TouchableOpacity>
            {formPromo.tipo === 'precio_fijo' && (
              <TextInput
                style={[styles.input, { marginLeft: 26 }]}
                value={formPromo.precio}
                onChangeText={v => setFormPromo(f => ({ ...f, precio: v.replace(/[^\d.]/g, '') }))}
                placeholder={`${currency}40.00`}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            )}

            <Text style={[styles.label, { marginTop: spacing.md }]}>¿Cuándo?</Text>
            <EditorCalendario valor={formPromo.calendario} onChange={cal => setFormPromo(f => ({ ...f, calendario: cal }))} />

            {/* La VISTA PREVIA con productos reales: el dueño ve lo que va a
                cobrar antes de guardar. En ámbar lo que tiene que revisar. */}
            <View style={[styles.vista, vista.ambar && styles.vistaAmbar]}>
              <Text style={[styles.vistaTexto, vista.ambar && { color: '#92400e' }]}>{vista.texto}</Text>
            </View>

            <TouchableOpacity style={[styles.btnGuardar, saving && { opacity: 0.6 }]} onPress={guardarPromo} disabled={saving}>
              <Text style={styles.btnGuardarText}>{saving ? 'Guardando...' : formPromo.id ? 'Guardar cambios' : 'Crear promo'}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Qué entra en un hueco: una categoría entera o un producto */}
          <Modal visible={pickerHueco !== null} transparent animationType="fade" onRequestClose={() => setPickerHueco(null)}>
            <View style={styles.overlay}>
              <View style={[styles.modalBox, { maxHeight: '75%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>¿Qué entra aquí?</Text>
                  <TouchableOpacity onPress={() => setPickerHueco(null)}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
                  <Text style={styles.label}>Una categoría (cualquiera de sus productos)</Text>
                  {categorias.map(c => (
                    <TouchableOpacity key={`c${c.id}`} style={styles.pickItem} onPress={() => { cambiarHueco(pickerHueco, { que: `c:${c.id}` }); setPickerHueco(null); }}>
                      <Text style={styles.pickTexto}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={[styles.label, { marginTop: spacing.md }]}>Un producto</Text>
                  {productos.map(p => (
                    <TouchableOpacity key={`p${p.id}`} style={styles.pickItem} onPress={() => { cambiarHueco(pickerHueco, { que: `p:${p.id}` }); setPickerHueco(null); }}>
                      <Text style={styles.pickTexto}>{p.name} — {formatMoney(parseFloat(p.price) || 0, currency)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </Modal>

      {/* Modal crear / editar DESCUENTO */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editando ? 'Editar descuento' : 'Nuevo descuento'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {editando && (
                  <TouchableOpacity onPress={() => { setModal(false); confirmarBorrar(editando); }}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={form.nombre}
                onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
                placeholder="Ej: 10% en todo"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>Tipo</Text>
              <View style={styles.tipoRow}>
                <TouchableOpacity
                  style={[styles.tipoBtn, form.tipo === 'percentage' && styles.tipoBtnActive]}
                  onPress={() => setForm(f => ({ ...f, tipo: 'percentage' }))}
                >
                  <Text style={[styles.tipoText, form.tipo === 'percentage' && styles.tipoTextActive]}>% Porcentaje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBtn, form.tipo === 'fixed' && styles.tipoBtnActive]}
                  onPress={() => setForm(f => ({ ...f, tipo: 'fixed' }))}
                >
                  <Text style={[styles.tipoText, form.tipo === 'fixed' && styles.tipoTextActive]}>Monto</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: spacing.md }]}>Valor</Text>
              <TextInput
                style={styles.input}
                value={form.valor}
                onChangeText={v => setForm(f => ({ ...f, valor: v }))}
                placeholder={form.tipo === 'percentage' ? 'Ej: 10' : `${currency}50`}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.label, { marginTop: spacing.md }]}>¿Cuándo?</Text>
              <EditorCalendario valor={form.calendario} onChange={cal => setForm(f => ({ ...f, calendario: cal }))} />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Activo</Text>
                  <Text style={styles.switchSub}>Si está inactivo, no aparece en Nueva Venta</Text>
                </View>
                <Switch
                  value={form.active}
                  onValueChange={v => setForm(f => ({ ...f, active: v }))}
                  trackColor={{ true: colors.primary }}
                />
              </View>

              <View style={[styles.switchRow, { marginTop: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Requiere PIN</Text>
                  <Text style={styles.switchSub}>Pide PIN al cajero antes de aplicarlo</Text>
                </View>
                <Switch
                  value={form.requires_pin}
                  onValueChange={v => setForm(f => ({ ...f, requires_pin: v }))}
                  trackColor={{ true: '#7c3aed' }}
                />
              </View>

              <TouchableOpacity
                style={[styles.btnGuardar, saving && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={saving}
              >
                <Text style={styles.btnGuardarText}>{saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear descuento'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },
  centered:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  title:             { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary, padding: spacing.lg, paddingBottom: spacing.sm },
  premiumBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f59e0b22', borderWidth: 1, borderColor: '#f59e0b44', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2, gap: 3 },
  premiumBadgeText:  { fontSize: font.sm - 2, fontWeight: '700', color: '#f59e0b' },
  tabs:              { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  tab:               { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  tabActiva:         { backgroundColor: colors.primary, borderColor: colors.primary },
  tabTexto:          { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary },
  card:              { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardPromo:         { borderColor: '#c4b5fd' },
  cardInactive:      { opacity: 0.5 },
  cardTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardName:          { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  valueBadge:        { backgroundColor: colors.primary + '20', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  valueText:         { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  cardMeta:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTipo:          { fontSize: font.sm - 1, color: colors.textMuted },
  estadoBadge:       { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  estadoActiva:      { backgroundColor: colors.success + '20' },
  estadoEspera:      { backgroundColor: colors.border },
  estadoTexto:       { fontSize: font.sm - 2, fontWeight: '700' },
  promoLinea:        { fontSize: font.sm, color: '#5b21b6', fontWeight: '600' },
  promoCal:          { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  acumulablesBox:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  pinBadge:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ede9fe', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  pinBadgeText:      { fontSize: font.sm - 2, color: '#7c3aed', fontWeight: '700' },
  inactiveBadge:     { backgroundColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  inactiveText:      { fontSize: font.sm - 2, color: colors.textMuted, fontWeight: '600' },
  premiumWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  premiumTitle:      { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  premiumSubtitle:   { fontSize: font.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  premiumBtn:        { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: radius.md, marginTop: spacing.sm },
  premiumBtnText:    { color: '#fff', fontSize: font.md, fontWeight: '700' },
  emptyWrap:         { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty:             { color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  emptyHint:         { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  btnAdd:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40', borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  btnAddText:        { fontSize: font.sm - 1, fontWeight: '700', color: colors.primary },
  overlay:           { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalBox:          { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
  modalTitle:        { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  modalBody:         { padding: spacing.lg, paddingBottom: spacing.xxl },
  label:             { fontSize: font.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  input:             { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.md, color: colors.textPrimary },
  tipoRow:           { flexDirection: 'row', gap: spacing.sm },
  tipoBtn:           { flex: 1, paddingVertical: spacing.sm - 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tipoBtnActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoText:          { fontSize: font.sm, fontWeight: '600', color: colors.textMuted },
  tipoTextActive:    { color: '#fff' },
  huecoRow:          { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  qtyBtn:            { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  qtyTxt:            { minWidth: 20, textAlign: 'center', fontSize: font.md, fontWeight: '800', color: colors.textPrimary },
  de:                { fontSize: font.sm, color: colors.textMuted },
  queBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, backgroundColor: colors.background },
  queTexto:          { flex: 1, fontSize: font.sm, color: colors.textPrimary },
  agregarOtro:       { fontSize: font.sm, fontWeight: '700', color: colors.primary },
  radioRow:          { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  radioTexto:        { fontSize: font.md, color: colors.textPrimary },
  radioSub:          { fontSize: font.sm, color: colors.textSecondary },
  pagaRow:           { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 26, marginBottom: spacing.xs },
  vista:             { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#c4b5fd' },
  vistaAmbar:        { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  vistaTexto:        { fontSize: font.sm, color: '#5b21b6', lineHeight: 20 },
  pickItem:          { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickTexto:         { fontSize: font.md, color: colors.textPrimary },
  switchRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md },
  switchLabel:       { fontSize: font.sm, fontWeight: '600', color: colors.textPrimary },
  switchSub:         { fontSize: font.sm - 2, color: colors.textMuted, marginTop: 2 },
  btnGuardar:        { marginTop: spacing.lg, backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnGuardarText:    { color: '#fff', fontWeight: '800', fontSize: font.md },
});
