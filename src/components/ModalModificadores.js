// ============================================================================
// ModalModificadores — selector de extras de un producto (BLOQUE 11)
//
// Lo comparten la venta de mostrador y las mesas: si cada pantalla tuviera el
// suyo, un cambio en las reglas (el tope del grupo, el aviso de obligatorio)
// solo llegaría a una de las dos.
//
// Si el producto no ofrece extras, la pantalla NO debe abrir este modal: llama
// directo a su callback. Un negocio sin modificadores no puede ver un paso de
// más al vender.
// ============================================================================
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../theme';
import { formatMoney } from '../utils/money';
import {
  gruposDeProducto, precioConModificadores, gruposIncompletos,
} from '../utils/modificadores';

export default function ModalModificadores({
  visible,
  producto,          // { id, name, price }
  catalogo,          // lo que devuelve GET /api/modifiers (o la caché offline)
  seleccionPrevia,   // para EDITAR un renglón ya en el carrito
  currency = '$',
  onCancel,
  onConfirm,         // (seleccionCongelada) => void
}) {
  const grupos = useMemo(
    () => (producto ? gruposDeProducto(catalogo, producto.id) : []),
    [catalogo, producto]
  );

  // { [groupId]: [optionId, ...] }
  const [seleccion, setSeleccion] = useState({});

  useEffect(() => {
    if (!visible) return;
    const inicial = {};
    for (const m of seleccionPrevia || []) {
      if (!m?.group_id || !m?.option_id) continue;
      if (!inicial[m.group_id]) inicial[m.group_id] = [];
      inicial[m.group_id].push(m.option_id);
    }
    setSeleccion(inicial);
  }, [visible, seleccionPrevia]);

  /**
   * Con `max_select: 1` elegir otra REEMPLAZA la anterior (es un "tamaño", no
   * una lista); con varias, se topa en el máximo. El backend rechaza pasarse
   * del tope, así que atajarlo aquí evita que el cajero arme una venta que le
   * van a rebotar.
   */
  function alternar(grupo, opcionId) {
    setSeleccion((prev) => {
      const actuales = prev[grupo.id] || [];
      if (actuales.includes(opcionId)) {
        return { ...prev, [grupo.id]: actuales.filter((id) => id !== opcionId) };
      }
      if (grupo.max_select === 1) {
        return { ...prev, [grupo.id]: [opcionId] };
      }
      if (grupo.max_select && actuales.length >= grupo.max_select) {
        return prev; // ya está en el tope: no se agrega y no se avisa con un popup
      }
      return { ...prev, [grupo.id]: [...actuales, opcionId] };
    });
  }

  /** La selección en la forma CONGELADA que se guarda con el renglón. */
  const seleccionCongelada = useMemo(() => {
    const out = [];
    for (const grupo of grupos) {
      const elegidas = seleccion[grupo.id] || [];
      for (const opcion of grupo.options || []) {
        if (!elegidas.includes(opcion.id)) continue;
        out.push({
          option_id: opcion.id,
          group_id: grupo.id,
          group: grupo.name,
          name: opcion.name,
          price_delta: parseFloat(opcion.price_delta) || 0,
        });
      }
    }
    return out;
  }, [grupos, seleccion]);

  const precio = producto ? precioConModificadores(producto.price, seleccionCongelada) : 0;
  const faltan = gruposIncompletos(grupos, seleccion);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.titulo} numberOfLines={1}>{producto?.name || 'Producto'}</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380 }}>
            {grupos.map((grupo) => {
              const elegidas = seleccion[grupo.id] || [];
              const obligatorio = (grupo.min_select || 0) > 0;
              return (
                <View key={grupo.id} style={styles.grupo}>
                  <View style={styles.grupoHeader}>
                    <Text style={styles.grupoTitulo}>{grupo.name}</Text>
                    {obligatorio ? (
                      <Text style={styles.badgeObligatorio}>Obligatorio</Text>
                    ) : grupo.max_select ? (
                      <Text style={styles.pista}>Hasta {grupo.max_select}</Text>
                    ) : null}
                  </View>

                  {(grupo.options || []).map((opcion) => {
                    const marcada = elegidas.includes(opcion.id);
                    const delta = parseFloat(opcion.price_delta) || 0;
                    return (
                      <TouchableOpacity
                        key={opcion.id}
                        style={[styles.opcion, marcada && styles.opcionActiva]}
                        onPress={() => alternar(grupo, opcion.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={marcada ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={marcada ? colors.primary : colors.textMuted}
                        />
                        <Text style={styles.opcionNombre} numberOfLines={1}>{opcion.name}</Text>
                        {delta !== 0 && (
                          <Text style={[styles.delta, delta < 0 && styles.deltaNegativo]}>
                            {delta > 0 ? '+' : '−'}{formatMoney(Math.abs(delta), currency)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          {faltan.length > 0 && (
            <Text style={styles.aviso}>
              Falta elegir: {faltan.map((g) => g.name).join(', ')}
            </Text>
          )}

          <View style={styles.footer}>
            <View>
              <Text style={styles.precioLabel}>Precio</Text>
              <Text style={styles.precioValor}>{formatMoney(precio, currency)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.btnAgregar, faltan.length > 0 && styles.btnDeshabilitado]}
              disabled={faltan.length > 0}
              onPress={() => onConfirm(seleccionCongelada)}
            >
              <Text style={styles.btnAgregarTexto}>Agregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  titulo: { flex: 1, fontSize: font.lg, fontWeight: '700', color: colors.textPrimary },
  grupo: { marginBottom: spacing.lg },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  grupoTitulo: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  badgeObligatorio: {
    fontSize: 11, fontWeight: '700', color: '#b45309',
    backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  pista: { fontSize: 12, color: colors.textMuted },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  opcionActiva: { borderColor: colors.primary, backgroundColor: '#eef2ff' },
  opcionNombre: { flex: 1, fontSize: 15, color: colors.textPrimary },
  delta: { fontSize: 14, fontWeight: '700', color: colors.success },
  deltaNegativo: { color: colors.textMuted },
  aviso: { color: '#b45309', fontSize: 13, marginBottom: spacing.sm },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  precioLabel: { fontSize: 12, color: colors.textMuted },
  precioValor: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  btnAgregar: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  btnDeshabilitado: { backgroundColor: colors.textMuted },
  btnAgregarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
