import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  StyleSheet, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SvgIcon, { SVG_ICON_LABELS, SVG_ICON_CATEGORIES } from './SvgIcon';
import IconoProducto from './IconoProducto';
import { Icono, Segmentado } from './ui';
import { useAuth } from '../context/AuthContext';
import { gruposParaTipo, buscarIconos, iconoDeValor, iconoPorId, valorDeIcono } from '../iconos';
import { ARCHIVOS } from '../iconos/archivos';
import { zc, radios, espacios, letra, sombra } from '../theme';

// El selector de iconos de producto y categoría (PLAN_REDISENO_V1 §3.3).
// Pestaña "De color": los iconos de Fluent Emoji por tipo de negocio (los del negocio
// PRIMERO) con buscador en español. Pestaña "De línea": los `svg:` de siempre, que hay
// negocios usando. Elegir un icono de color guarda su EMOJI (o `svg:z-<id>` si es propio):
// nada se migra y las apps viejas lo siguen viendo.

export default function IconPicker({ value, onSelect, visible, onClose }) {
  const { settings } = useAuth();
  const [tab, setTab] = useState(value?.startsWith('svg:') && !value.startsWith('svg:z-') ? 'linea' : 'color');
  const [busqueda, setBusqueda] = useState('');

  const tipo = settings?.business_tipo || '';
  const grupos = useMemo(() => gruposParaTipo(tipo), [tipo]);
  const hallados = useMemo(() => buscarIconos(busqueda), [busqueda]);
  const actual = iconoDeValor(value);

  // Al cerrar, por donde sea, el buscador vuelve vacío: si no, reabre con lo de la vez pasada.
  const cerrar = () => { setBusqueda(''); onClose(); };
  const elegir = (val) => { onSelect(val); cerrar(); };

  const celda = (icono) => {
    const val = valorDeIcono(icono);
    const selected = value && actual && actual.id === icono.id;
    return (
      <TouchableOpacity
        key={icono.id}
        style={[styles.iconBtn, selected && styles.iconBtnSelected]}
        onPress={() => elegir(val)}
        accessibilityLabel={icono.nombre}
      >
        <Image source={ARCHIVOS[icono.id]} style={styles.iconImg} resizeMode="contain" />
      </TouchableOpacity>
    );
  };

  const etiqueta = actual ? actual.nombre
    : value?.startsWith('svg:') ? (SVG_ICON_LABELS[value.slice(4)] || value.slice(4))
    : (value || 'Sin icono');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.cab}>
          <View style={styles.cabFila}>
            <View style={styles.preview}>
              <IconoProducto valor={value || 'svg:package'} size={30} color={zc.tinta} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Elige un icono</Text>
              <Text style={styles.previewLabel} numberOfLines={1}>{etiqueta}</Text>
            </View>
            <TouchableOpacity onPress={cerrar} style={styles.cerrar} accessibilityLabel="Cerrar">
              <Icono nombre="cerrar" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <Segmentado
            oscuro
            style={{ marginTop: 14 }}
            valor={tab}
            onCambio={setTab}
            opciones={[{ valor: 'color', texto: 'De color' }, { valor: 'linea', texto: 'De línea' }]}
          />

          {tab === 'color' ? (
            <View style={styles.searchWrap}>
              <Icono nombre="buscar" size={17} color={zc.grisSuave} />
              <TextInput
                style={styles.search}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Busca: taco, cerveza, pastel..."
                placeholderTextColor={zc.grisSuave}
                autoCorrect={false}
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda('')} accessibilityLabel="Borrar búsqueda">
                  <Icono nombre="cerrar" size={16} color={zc.grisSuave} />
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
          {tab === 'color' && busqueda.trim() ? (
            <View style={styles.tarjeta}>
              <Text style={styles.catLabel}>
                {hallados.length ? `${hallados.length} encontrado${hallados.length === 1 ? '' : 's'}` : 'No hay ningún icono con ese nombre'}
              </Text>
              <View style={styles.iconRow}>{hallados.map(celda)}</View>
            </View>
          ) : tab === 'color' ? (
            grupos.map(g => (
              <View key={g.id} style={styles.tarjeta}>
                <Text style={styles.catLabel}>{g.nombre}</Text>
                <View style={styles.iconRow}>{g.iconos.map(id => celda(iconoPorId(id)))}</View>
              </View>
            ))
          ) : (
            Object.entries(SVG_ICON_CATEGORIES).map(([catName, icons]) => (
              <View key={catName} style={styles.tarjeta}>
                <Text style={styles.catLabel}>{catName}</Text>
                <View style={styles.iconRow}>
                  {icons.map(name => {
                    const val = `svg:${name}`;
                    const selected = value === val;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.iconBtn, selected && styles.iconBtnSelected]}
                        onPress={() => elegir(val)}
                      >
                        <SvgIcon name={name} size={24} color={selected ? zc.azul : zc.gris} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: zc.fondo },
  cab: { backgroundColor: zc.noche, paddingHorizontal: espacios.borde + 2, paddingTop: 10, paddingBottom: 16 },
  cabFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: {
    width: 46, height: 46, borderRadius: radios.boton, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { ...letra.titulo, color: zc.enNoche },
  previewLabel: { ...letra.etiqueta, color: zc.enNocheGris, marginTop: 2 },
  cerrar: { width: 36, height: 36, borderRadius: 18, backgroundColor: zc.vidrio, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: radios.boton, paddingHorizontal: 12, marginTop: 12 },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: zc.tinta },
  grid: { padding: espacios.borde, paddingBottom: 40, gap: 12 },
  tarjeta: { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: 12, ...sombra },
  catLabel: { ...letra.etiqueta, color: zc.gris, marginBottom: 8, marginLeft: 2 },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconBtn: {
    width: 52, height: 52, borderRadius: radios.cuadrito,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: zc.fondo, borderWidth: 1.5, borderColor: 'transparent',
  },
  iconBtnSelected: { borderColor: zc.azul, backgroundColor: zc.azulSuave },
  iconImg: { width: 36, height: 36 },
});
