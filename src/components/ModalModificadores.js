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
import { Icono } from './ui';
import { colors, spacing, radius, font, zc, radios, sombra } from '../theme';
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
              <Icono nombre="close" size={24} color={zc.gris} />
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
                        <Icono
                          nombre={marcada ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={marcada ? zc.azul : zc.grisSuave}
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
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: zc.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: spacing.xl,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  titulo: { flex: 1, fontSize: 19, fontWeight: '500', color: zc.tinta },
  grupo: { marginBottom: 16 },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  grupoTitulo: { flex: 1, fontSize: 15, fontWeight: '500', color: zc.tinta },
  badgeObligatorio: {
    fontSize: 12, color: zc.ambarTexto,
    backgroundColor: zc.ambarSuave, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  pista: { fontSize: 12.5, color: zc.grisSuave },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    backgroundColor: zc.tarjeta, borderWidth: 1.5, borderColor: 'transparent', borderRadius: radios.boton,
    marginBottom: 6, ...sombra, elevation: 1,
  },
  opcionActiva: { borderColor: zc.azul, backgroundColor: zc.azulSuave },
  opcionNombre: { flex: 1, fontSize: 15, color: zc.tinta },
  delta: { fontSize: 14, fontWeight: '700', color: zc.verde },
  deltaNegativo: { color: zc.gris },
  aviso: { color: zc.ambarTexto, fontSize: 13, marginBottom: spacing.sm },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: zc.linea, paddingTop: 14,
  },
  precioLabel: { fontSize: 12.5, color: zc.gris },
  precioValor: { fontSize: 22, fontWeight: '700', color: zc.tinta },
  btnAgregar: {
    backgroundColor: zc.azul, borderRadius: radios.boton,
    paddingHorizontal: spacing.xl, paddingVertical: 13,
  },
  btnDeshabilitado: { backgroundColor: zc.grisSuave },
  btnAgregarTexto: { color: '#fff', fontSize: 16, fontWeight: '500' },
});
