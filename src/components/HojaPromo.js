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
import { Icono, IconoEnCuadro } from './ui';
import IconoProducto from './IconoProducto';
import ModalModificadores from './ModalModificadores';
import { colors, spacing, radius, font, zc, tonos, radios, sombra } from '../theme';
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
      <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
        <View style={styles.header}>
          <IconoEnCuadro nombre="regalo" tono="lila" size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{promo.name}</Text>
            <Text style={styles.paso}>
              {h === -1
                ? `Listo: ${promo.lleva} de ${promo.lleva}`
                : `Elige ${promo.huecos[h].quantity} de ${nombreDeHueco(promo.huecos[h], productos, categorias)} · ${elegidos.length + 1} de ${promo.lleva}`}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancel}>
            <Icono nombre="close" size={24} color={zc.gris} />
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
                  <Icono nombre="close-circle" size={18} color={zc.rojo} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.grid}>
          {opciones.map((p) => (
            <TouchableOpacity key={p.id} style={styles.prod} onPress={() => tocar(p)}>
              <IconoProducto valor={p.emoji || 'svg:shopping-bag'} imagen={p.image} size={40} color={zc.gris} />
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

const caja = { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, ...sombra };

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: zc.linea },
  titulo:       { fontSize: 19, fontWeight: '500', color: zc.tinta },
  paso:         { fontSize: 13.5, color: tonos.lila.icono, marginTop: 2 },
  elegidos:     { margin: 14, marginBottom: 0, padding: 12, gap: 6, borderRadius: radios.tarjeta, backgroundColor: tonos.lila.fondo },
  elegido:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  elegidoTexto: { flex: 1, fontSize: 14, color: zc.tinta },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  prod:         { width: '31%', alignItems: 'center', padding: 10, ...caja },
  prodNombre:   { fontSize: 13, fontWeight: '500', color: zc.tinta, textAlign: 'center', marginTop: 6 },
  prodPrecio:   { fontSize: 13.5, fontWeight: '700', color: zc.azul, marginTop: 2 },
  pie:          { padding: 16, backgroundColor: zc.tarjeta, borderTopLeftRadius: 18, borderTopRightRadius: 18, ...sombra, elevation: 10, gap: 8 },
  aviso:        { fontSize: 12.5, color: zc.grisSuave, textAlign: 'center' },
  resumen:      { fontSize: 15, fontWeight: '500', color: zc.tinta, textAlign: 'center' },
  btn:          { backgroundColor: tonos.lila.icono, borderRadius: radios.boton, padding: 14, alignItems: 'center' },
  btnTexto:     { color: '#fff', fontSize: 15.5, fontWeight: '500' },
});
