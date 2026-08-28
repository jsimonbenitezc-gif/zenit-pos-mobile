// ============================================================================
// GestionModificadores — configurar la biblioteca (BLOQUE 11)
//
// Dos piezas, las dos solo para el DUEÑO (el backend responde 403 al resto):
//
//   • <SelectorGruposProducto>       — qué grupos usa ESTE producto. Va dentro
//     del formulario de edición del producto.
//   • <ModalBibliotecaModificadores> — crear/editar los grupos y sus opciones.
//
// La biblioteca es del NEGOCIO: "Extras" se configura una vez y se engancha a
// los 30 tacos que lo usan. Configurarla requiere conexión (los ids son los del
// backend); USARLA funciona sin internet.
// ============================================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, spacing, radius, font } from '../theme';
import { friendlyError } from '../utils/errors';

// ─── Qué grupos usa un producto ─────────────────────────────────────────────

export function SelectorGruposProducto({ productId, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [activos, setActivos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [catalogo, enlaces] = await Promise.all([
          api.getModifiers(),
          api.getProductModifiers(productId),
        ]);
        if (!vivo) return;
        setGrupos(catalogo.groups || []);
        setActivos((enlaces || []).map((e) => e.group_id));
      } catch {
        if (vivo) setGrupos([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [productId]);

  function alternar(groupId) {
    setActivos((prev) => {
      const next = prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId];
      // El padre guarda la lista junto con el resto del producto: así el dueño
      // toca "Guardar" una sola vez.
      onCambio?.(next);
      return next;
    });
  }

  if (cargando) return <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />;
  if (grupos.length === 0) {
    return (
      <Text style={styles.vacio}>
        Todavía no hay grupos de modificadores. Créalos desde el botón "Modificadores" de la pantalla de Productos.
      </Text>
    );
  }

  return (
    <View>
      {grupos.map((g) => {
        const marcado = activos.includes(g.id);
        return (
          <TouchableOpacity key={g.id} style={styles.fila} onPress={() => alternar(g.id)} activeOpacity={0.7}>
            <Ionicons
              name={marcado ? 'checkbox' : 'square-outline'}
              size={20}
              color={marcado ? colors.primary : colors.textMuted}
            />
            <Text style={styles.filaNombre}>{g.name}</Text>
            <Text style={styles.filaPista}>{(g.options || []).length} opciones</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── La biblioteca completa ─────────────────────────────────────────────────

export function ModalBibliotecaModificadores({ visible, onClose }) {
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Borradores de las opciones nuevas, por grupo: { [groupId]: {nombre, delta} }
  const [nuevas, setNuevas] = useState({});

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const catalogo = await api.getModifiers();
      setGrupos(catalogo.groups || []);
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { if (visible) cargar(); }, [visible, cargar]);

  async function crearGrupo() {
    try {
      await api.createModifierGroup({ name: 'Nuevo grupo', min_select: 0, max_select: 1 });
      cargar();
    } catch (e) { Alert.alert('Error', friendlyError(e)); }
  }

  async function guardarGrupo(grupo, cambios) {
    try {
      await api.updateModifierGroup(grupo.id, { ...cambios });
      cargar();
    } catch (e) { Alert.alert('Error', friendlyError(e)); }
  }

  function borrarGrupo(grupo) {
    Alert.alert(
      '¿Eliminar el grupo?',
      `Se quitará "${grupo.name}" de todos los productos que lo usan. Los tickets ya cobrados no cambian.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try { await api.deleteModifierGroup(grupo.id); cargar(); }
            catch (e) { Alert.alert('Error', friendlyError(e)); }
          },
        },
      ]
    );
  }

  async function crearOpcion(grupo) {
    const borrador = nuevas[grupo.id] || {};
    if (!borrador.nombre?.trim()) { Alert.alert('Falta el nombre', 'La opción necesita un nombre.'); return; }
    try {
      await api.createModifierOption(grupo.id, {
        name: borrador.nombre.trim(),
        price_delta: borrador.delta === '' || borrador.delta == null ? 0 : parseFloat(borrador.delta),
      });
      setNuevas((prev) => ({ ...prev, [grupo.id]: { nombre: '', delta: '' } }));
      cargar();
    } catch (e) { Alert.alert('Error', friendlyError(e)); }
  }

  function borrarOpcion(opcion) {
    Alert.alert(
      '¿Eliminar la opción?',
      `"${opcion.name}" dejará de poder elegirse. Los tickets ya cobrados no cambian.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try { await api.deleteModifierOption(opcion.id); cargar(); }
            catch (e) { Alert.alert('Error', friendlyError(e)); }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.pantalla}>
        <View style={styles.cabecera}>
          <Text style={styles.tituloPantalla}>Modificadores</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.ayuda}>
          Un grupo se configura una vez y se engancha a todos los productos que lo usan.
        </Text>

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            {grupos.length === 0 && (
              <Text style={styles.vacio}>
                Todavía no hay grupos. Crea uno ("Extras", "Tamaño") y engánchalo a tus productos.
              </Text>
            )}

            {grupos.map((g) => (
              <GrupoEditable
                key={g.id}
                grupo={g}
                borrador={nuevas[g.id] || { nombre: '', delta: '' }}
                onBorrador={(b) => setNuevas((prev) => ({ ...prev, [g.id]: b }))}
                onGuardar={(cambios) => guardarGrupo(g, cambios)}
                onBorrar={() => borrarGrupo(g)}
                onCrearOpcion={() => crearOpcion(g)}
                onBorrarOpcion={borrarOpcion}
              />
            ))}

            <TouchableOpacity style={styles.btnNuevo} onPress={crearGrupo}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.btnNuevoTexto}>Nuevo grupo</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function GrupoEditable({ grupo, borrador, onBorrador, onGuardar, onBorrar, onCrearOpcion, onBorrarOpcion }) {
  const [nombre, setNombre] = useState(grupo.name);
  // Vacío = sin límite. Es un caso normal ("Extras").
  const [max, setMax] = useState(grupo.max_select === null ? '' : String(grupo.max_select));
  const [obligatorio, setObligatorio] = useState((grupo.min_select || 0) > 0);

  useEffect(() => {
    setNombre(grupo.name);
    setMax(grupo.max_select === null ? '' : String(grupo.max_select));
    setObligatorio((grupo.min_select || 0) > 0);
  }, [grupo]);

  return (
    <View style={styles.tarjeta}>
      <View style={styles.tarjetaFila}>
        <TextInput style={[styles.input, { flex: 1, fontWeight: '700' }]} value={nombre} onChangeText={setNombre} />
        <TouchableOpacity
          style={styles.btnIcono}
          onPress={() => onGuardar({
            name: nombre.trim(),
            max_select: max === '' ? null : parseInt(max),
            min_select: obligatorio ? 1 : 0,
          })}
        >
          <Ionicons name="checkmark" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnIcono} onPress={onBorrar}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tarjetaFila, { marginTop: spacing.xs }]}>
        <Text style={styles.etiqueta}>Máximo</Text>
        <TextInput
          style={[styles.input, { width: 64, textAlign: 'center' }]}
          value={max}
          onChangeText={setMax}
          keyboardType="number-pad"
          placeholder="∞"
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity
          style={styles.check}
          onPress={() => setObligatorio((v) => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={obligatorio ? 'checkbox' : 'square-outline'}
            size={18}
            color={obligatorio ? colors.primary : colors.textMuted}
          />
          <Text style={styles.etiqueta}>Obligatorio</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        {(grupo.options || []).map((o) => (
          <View key={o.id} style={styles.opcionFila}>
            <Text style={styles.opcionNombre} numberOfLines={1}>{o.name}</Text>
            <Text style={styles.opcionDelta}>
              {parseFloat(o.price_delta) === 0
                ? '—'
                : `${parseFloat(o.price_delta) > 0 ? '+' : '−'}$${Math.abs(parseFloat(o.price_delta)).toFixed(2)}`}
            </Text>
            <TouchableOpacity style={styles.btnIcono} onPress={() => onBorrarOpcion(o)}>
              <Ionicons name="close" size={16} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.opcionFila}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Nueva opción"
            placeholderTextColor={colors.textMuted}
            value={borrador.nombre}
            onChangeText={(t) => onBorrador({ ...borrador, nombre: t })}
          />
          <TextInput
            style={[styles.input, { width: 84, textAlign: 'right' }]}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            value={borrador.delta}
            onChangeText={(t) => onBorrador({ ...borrador, delta: t })}
          />
          <TouchableOpacity style={styles.btnIcono} onPress={onCrearOpcion}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tituloPantalla: { fontSize: font.xl, fontWeight: '700', color: colors.textPrimary },
  ayuda: { color: colors.textSecondary, fontSize: font.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  vacio: { color: colors.textMuted, fontSize: font.sm, paddingVertical: spacing.md },
  tarjeta: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  tarjetaFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    fontSize: font.md, color: colors.textPrimary, backgroundColor: colors.surface,
  },
  etiqueta: { fontSize: font.sm, color: colors.textSecondary },
  check: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.md },
  btnIcono: { padding: spacing.sm },
  opcionFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  opcionNombre: { flex: 1, fontSize: font.md, color: colors.textPrimary },
  opcionDelta: { fontSize: font.sm, fontWeight: '700', color: colors.success },
  btnNuevo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md,
  },
  btnNuevoTexto: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  filaNombre: { flex: 1, fontSize: font.md, color: colors.textPrimary },
  filaPista: { fontSize: font.sm, color: colors.textMuted },
});
