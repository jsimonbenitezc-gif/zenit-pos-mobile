// ============================================================================
// components/HojaPromo.js — "Elige 2 de Tacos · 1 de 2" (PLAN_OFERTAS_V1 §3.5)
//
// La hoja que se abre al tocar una promo en la venta o en la mesa. Enseña solo
// los productos que ENTRAN en el hueco pendiente y no están agotados (trampa
// 8), pregunta los extras de cada uno igual que un producto suelto (§32) y, al
// completar, entrega la elección: la pantalla arma UN renglón con ella.
//
// Los extras del producto regalado SE COBRAN, y se dice aquí, que es donde el
// cliente reclama.
// ============================================================================
import { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import IconoProducto from './IconoProducto';
import ModalModificadores from './ModalModificadores';
import { colors, spacing, radius, font } from '../theme';
import { formatMoney } from '../utils/money';
import { productoTieneModificadores, resumenModificadores, deltaDeModificadores } from '../utils/modificadores';
import {
  productosDelHueco, huecoPendiente, nombreDeHueco, eleccionCabe, armarPromo, eleccionAutomatica,
} from '../utils/promos';

export default function HojaPromo({
  visible,
  promo,            // promo plana (promoDeCatalogo)
  productos,        // [{ id, name, price, category_id, stock, emoji, active }]
  categorias,       // [{ id, name }]
  catalogoMods,
  currency = '$',
  onCancel,
  onConfirm,        // (elegidos: [{ product_id, nombre, emoji, precio, modificadores }]) => void
}) {
  const [elegidos, setElegidos] = useState([]);
  const [modsDe, setModsDe] = useState(null); // producto esperando sus extras

  useEffect(() => { if (visible) { setElegidos([]); setModsDe(null); } }, [visible, promo]);

  // Lo que no tiene alternativa se pone solo (ver eleccionAutomatica). Se hace
  // de uno en uno: cada vez que cambia la elección se mira el siguiente hueco.
  useEffect(() => {
    if (!visible || !promo || modsDe) return;
    const auto = eleccionAutomatica(promo, elegidos, productos, (id) => productoTieneModificadores(catalogoMods, id));
    if (!auto) return;
    const h = huecoPendiente(promo, elegidos);
    setElegidos((prev) => [...prev, {
      hueco: h, product_id: auto.id, nombre: auto.name, emoji: auto.emoji,
      precio: parseFloat(auto.price) || 0, modificadores: [],
    }]);
  }, [visible, promo, elegidos, productos, catalogoMods, modsDe]);

  if (!promo) return null;
  const h = huecoPendiente(promo, elegidos);
  const catDe = (id) => (productos || []).find((p) => p.id === id)?.category_id ?? null;
  const completa = h === -1 && eleccionCabe(promo.huecos, elegidos.map((e) => ({ id: e.product_id, category_id: catDe(e.product_id) })));
  const armada = completa
    ? armarPromo(promo, elegidos.map((e) => ({ precio: e.precio, delta: deltaDeModificadores(e.modificadores) })))
    : null;
  const opciones = h === -1 ? [] : productosDelHueco(promo.huecos[h], productos);

  function agregar(producto, modificadores) {
    setElegidos((prev) => [...prev, {
      hueco: h, product_id: producto.id, nombre: producto.name, emoji: producto.emoji,
      precio: parseFloat(producto.price) || 0, modificadores: modificadores || [],
    }]);
  }

  function tocar(producto) {
    if (productoTieneModificadores(catalogoMods, producto.id)) { setModsDe(producto); return; }
    agregar(producto, []);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{promo.name}</Text>
            <Text style={styles.paso}>
              {h === -1
                ? `Listo: ${promo.lleva} de ${promo.lleva}`
                : `Elige ${promo.huecos[h].quantity} de ${nombreDeHueco(promo.huecos[h], productos, categorias)} · ${elegidos.length + 1} de ${promo.lleva}`}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancel}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {elegidos.length > 0 && (
          <View style={styles.elegidos}>
            {elegidos.map((e, i) => (
              <View key={i} style={styles.elegido}>
                <Text style={styles.elegidoTexto} numberOfLines={1}>
                  {e.nombre}
                  {resumenModificadores(e.modificadores) ? ` · ${resumenModificadores(e.modificadores)}` : ''}
                </Text>
                <TouchableOpacity onPress={() => setElegidos((prev) => prev.filter((_, j) => j !== i))}>
                  <Ionicons name="close-circle" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.grid}>
          {opciones.map((p) => (
            <TouchableOpacity key={p.id} style={styles.prod} onPress={() => tocar(p)}>
              <IconoProducto valor={p.emoji || 'svg:shopping-bag'} imagen={p.image} size={26} color={colors.textSecondary} />
              <Text style={styles.prodNombre} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.prodPrecio}>{formatMoney(parseFloat(p.price) || 0, currency)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.pie}>
          <Text style={styles.aviso}>Los extras de los productos de la promo se cobran aparte.</Text>
          {armada && (
            <Text style={styles.resumen}>
              Cobras {formatMoney(armada.total, currency)}
              {armada.ahorro > 0 ? ` · el cliente ahorra ${formatMoney(armada.ahorro, currency)}` : ''}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, !completa && { opacity: 0.4 }]}
            disabled={!completa}
            onPress={() => onConfirm(elegidos.map(({ hueco, ...resto }) => resto))}
          >
            <Text style={styles.btnTexto}>Agregar la promo</Text>
          </TouchableOpacity>
        </View>

        <ModalModificadores
          visible={modsDe !== null}
          producto={modsDe}
          catalogo={catalogoMods}
          currency={currency}
          onCancel={() => setModsDe(null)}
          onConfirm={(seleccion) => { agregar(modsDe, seleccion); setModsDe(null); }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo:       { fontSize: font.xl, fontWeight: '800', color: colors.textPrimary },
  paso:         { fontSize: font.sm, color: '#7c3aed', fontWeight: '700', marginTop: 2 },
  elegidos:     { padding: spacing.md, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#f5f3ff' },
  elegido:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  elegidoTexto: { flex: 1, fontSize: font.sm, fontWeight: '600', color: '#5b21b6' },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md },
  prod:         { width: '31%', alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  prodNombre:   { fontSize: font.sm - 1, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginTop: 4 },
  prodPrecio:   { fontSize: font.sm - 1, fontWeight: '700', color: colors.primary },
  pie:          { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: spacing.xs },
  aviso:        { fontSize: font.sm - 2, color: colors.textMuted, textAlign: 'center' },
  resumen:      { fontSize: font.md, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  btn:          { backgroundColor: '#7c3aed', borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  btnTexto:     { color: '#fff', fontSize: font.md, fontWeight: '800' },
});
