import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, PanResponder, BackHandler, Easing, LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { zc } from '../theme';
import { Icono } from '../components/ui';
import { SCREEN_PERM_MAP } from './screenPerms';

// `local`: la pantalla existe también en el MODO LOCAL, el negocio sin cuenta
// (BLOQUE 18). La Etapa 1 cubre vender, el catálogo propio y el historial; el
// resto necesita el servidor y es justamente el gancho para crear una cuenta.
// Mesas queda fuera a propósito (decidido el 2026-09-04, ver el plan V5).
export const ALL_SCREENS = [
  { name: 'NuevaVenta', label: 'Venta', icon: 'cart-outline', active: 'cart', ownerOnly: false, local: true },
  { name: 'Pedidos', label: 'Pedidos', icon: 'receipt-outline', active: 'receipt', ownerOnly: false, local: true },
  { name: 'Mesas', label: 'Mesas', icon: 'grid-outline', active: 'grid', ownerOnly: false },
  { name: 'Productos', label: 'Productos', icon: 'cube-outline', active: 'cube', ownerOnly: false, local: true },
  { name: 'Clientes', label: 'Clientes', icon: 'people-outline', active: 'people', ownerOnly: false, local: true },
  { name: 'Turno', label: 'Turno', icon: 'time-outline', active: 'time', ownerOnly: false, local: true },
  { name: 'Inventario', label: 'Inventario', icon: 'layers-outline', active: 'layers', ownerOnly: true },
  { name: 'Ofertas', label: 'Ofertas', icon: 'pricetag-outline', active: 'pricetag', ownerOnly: true },
  // Solo el dueño: son los márgenes del negocio (BLOQUE 12).
  { name: 'Rentabilidad', label: 'Rentabilidad', icon: 'trending-up-outline', active: 'trending-up', ownerOnly: true },
  { name: 'Dashboard', label: 'Resumen', icon: 'bar-chart-outline', active: 'bar-chart', ownerOnly: true },
  { name: 'Ajustes', label: 'Ajustes', icon: 'settings-outline', active: 'settings', ownerOnly: false, local: true },
];

/**
 * Las pantallas que puede ver este usuario. UN SOLO LUGAR decide esto, y lo usan
 * tanto la barra de abajo como el navegador: si se separaran, la barra ofrecería
 * una pestaña que el navegador no tiene registrada y tocarla no haría nada.
 */
export function pantallasDisponibles({ isOwner, rolActivo, permisosRolesEfectivos, modoLocal }) {
  // En modo local no hay cuenta ni puestos: manda la lista blanca y nada más.
  if (modoLocal) return ALL_SCREENS.filter(s => s.local);

  let lista = ALL_SCREENS.filter(s => !s.ownerOnly || isOwner);
  if (rolActivo && rolActivo !== 'dueno') {
    const permisos = permisosRolesEfectivos?.[rolActivo] || {};
    lista = lista.filter(s => {
      if (s.name === 'Ajustes') return true; // siempre visible (impresora/KDS/cambiar perfil)
      const key = SCREEN_PERM_MAP[s.name];
      if (!key) return true;
      return permisos[key] !== false;
    });
  }
  return lista;
}

// Los 5 lugares de la barra. La clave y la forma (arreglo de 5 nombres) son las
// de siempre: el orden que el usuario ya tenía guardado se respeta tal cual.
const DEFAULT_SLOTS = ['NuevaVenta', 'Pedidos', 'Mesas', 'Clientes', 'Ajustes'];
const STORE_KEY = 'zenit_tab_slots_v2';

const ALTO_BARRA = 60;   // la pastilla cerrada
const HUECO = 8;         // aire entre la pantalla y la pastilla

/**
 * Intercambia dos pestañas "por choque" (PLAN_PULIDO_V1, sesión C): la que
 * arrastras cae ENCIMA de otra y cambian de lugar. Si una estaba en "Más", la
 * otra se va a "Más". Devuelve siempre 5 nombres (lo que se guarda).
 */
function intercambiar(visibles, guardados, a, b) {
  const nuevos = [...visibles];
  const ia = nuevos.indexOf(a);
  const ib = nuevos.indexOf(b);
  if (ia < 0 && ib < 0) return null;
  if (ia >= 0 && ib >= 0) { nuevos[ia] = b; nuevos[ib] = a; }
  else if (ia >= 0) nuevos[ia] = b;
  else nuevos[ib] = a;
  // Un puesto con menos pantallas ve menos de 5: se completa con lo que ya
  // estaba guardado para no perder el orden del dueño en el mismo teléfono.
  for (const n of [...guardados, ...DEFAULT_SLOTS, ...ALL_SCREENS.map(s => s.name)]) {
    if (nuevos.length >= 5) break;
    if (!nuevos.includes(n)) nuevos.push(n);
  }
  return nuevos.slice(0, 5);
}

export default function CustomTabBar({ state, navigation }) {
  const { isOwner, rolActivo, permisosRolesEfectivos, cambiarPerfil, modoLocal } = useAuth();
  const insets = useSafeAreaInsets();

  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [abierto, setAbierto] = useState(false);      // "Más" abierto (la barra creció)
  const [desplegado, setDesplegado] = useState(false); // la capa ocupa toda la pantalla
  const [editando, setEditando] = useState(false);
  const [arrastrada, setArrastrada] = useState(null);
  const [blanco, setBlanco] = useState(null);
  const [anchoFila, setAnchoFila] = useState(0);
  const [altoCajon, setAltoCajon] = useState(0);

  const crecer = useRef(new Animated.Value(0)).current;     // 0 cerrada → 1 abierta
  const indicX = useRef(new Animated.Value(0)).current;
  const tiembla = useRef(new Animated.Value(0)).current;
  const fantasma = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const indicListo = useRef(false);

  const refsItems = useRef({});
  const rects = useRef({});
  const origenCapa = useRef({ x: 0, y: 0 });
  const refCapa = useRef(null);
  const arrastre = useRef({});      // { nombre, activo, concedido }
  const blancoRef = useRef(null);
  const acciones = useRef({});

  const availableScreens = useMemo(
    () => pantallasDisponibles({ isOwner, rolActivo, permisosRolesEfectivos, modoLocal }),
    [isOwner, rolActivo, permisosRolesEfectivos, modoLocal]
  );

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then(saved => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) setSlots(parsed);
      } catch {}
    });
  }, []);

  // Slots efectivos:
  // 1. Tomar los slots guardados que estén disponibles (en orden de preferencia)
  // 2. Completar hasta 5 con pantallas disponibles no usadas aún
  // 3. Si hay menos de 5 disponibles, mostrar solo las que hay (sin repetir)
  const effectiveSlots = useMemo(() => {
    const available = availableScreens.map(s => s.name);
    if (available.length === 0) return [];
    const result = [];
    const used = new Set();
    for (const name of slots) {
      if (available.includes(name) && !used.has(name)) {
        result.push(name);
        used.add(name);
      }
    }
    for (const name of available) {
      if (result.length >= 5) break;
      if (!used.has(name)) {
        result.push(name);
        used.add(name);
      }
    }
    return result;
  }, [slots, availableScreens]);

  const extras = availableScreens.filter(s => !effectiveSlots.includes(s.name));
  const hayPerfiles = Object.values(permisosRolesEfectivos || {}).some(p => p?.enabled);
  const conMas = extras.length > 0 || hayPerfiles;
  const columnas = effectiveSlots.length + (conMas ? 1 : 0);
  const celda = columnas > 0 ? anchoFila / columnas : 0;

  const currentRoute = state.routes[state.index]?.name;
  const idxActiva = effectiveSlots.indexOf(currentRoute);
  const idxIndicador = idxActiva >= 0 ? idxActiva : (conMas ? columnas - 1 : -1);

  // El indicador se desliza a la pestaña activa (o a "Más" si la pantalla vive ahí).
  useEffect(() => {
    if (celda <= 0 || idxIndicador < 0) return;
    const x = idxIndicador * celda;
    if (!indicListo.current) { indicX.setValue(x); indicListo.current = true; return; }
    Animated.spring(indicX, { toValue: x, useNativeDriver: true, tension: 170, friction: 18 }).start();
  }, [idxIndicador, celda, indicX]);

  // Modo editar: todas tiemblan.
  useEffect(() => {
    if (!editando) { tiembla.stopAnimation(); tiembla.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(tiembla, { toValue: 1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(tiembla, { toValue: -1, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(tiembla, { toValue: 0, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [editando, tiembla]);

  // Atrás de Android: primero sale de editar, luego cierra "Más".
  useEffect(() => {
    if (!abierto) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editando) setEditando(false);
      else cerrar();
      return true;
    });
    return () => sub.remove();
  });

  function saveSlots(newSlots) {
    setSlots(newSlots);
    SecureStore.setItemAsync(STORE_KEY, JSON.stringify(newSlots))
      .catch(e => console.warn('[barra] no se pudo guardar el orden:', e?.message));
  }

  function medir(nombre) {
    const r = refsItems.current[nombre];
    if (!r?.measure) return;
    r.measure((x, y, w, h, px, py) => { rects.current[nombre] = { x: px, y: py, w, h }; });
  }

  function medirTodo() {
    Object.keys(refsItems.current).forEach(medir);
    refCapa.current?.measure((x, y, w, h, px, py) => {
      origenCapa.current = { x: px, y: py };
      // La capa acaba de crecer a pantalla completa: si hay una pestaña levantada
      // y el dedo aún no se mueve, el fantasma se recoloca bajo el dedo.
      const a = arrastre.current;
      if (a.activo && !a.concedido) ponerFantasmaEn(a.nombre);
    });
  }

  function ponerFantasmaEn(nombre) {
    const r = rects.current[nombre];
    if (r) fantasma.setValue({ x: r.x + r.w / 2 - origenCapa.current.x, y: r.y + r.h / 2 - origenCapa.current.y });
  }

  function abrir() {
    setDesplegado(true);
    setAbierto(true);
    Animated.timing(crecer, {
      toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start(() => medirTodo());
  }

  function cerrar() {
    setAbierto(false);
    setEditando(false);
    Animated.timing(crecer, {
      toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: false,
    }).start(({ finished }) => { if (finished) setDesplegado(false); });
  }

  function navegar(nombre) {
    if (editando || arrastre.current.activo) return;
    navigation.navigate(nombre);
    if (abierto) cerrar();
  }

  function tocarMas() {
    if (abierto) cerrar();
    else abrir();
  }

  function presionLarga(nombre) {
    if (editando) return;
    setEditando(true);
    if (!abierto) abrir();
    arrastre.current = { nombre, activo: true, concedido: false };
    empezarArrastre(nombre);
  }

  function presionInicio(nombre) {
    if (editando) arrastre.current = { nombre, activo: false, concedido: false };
  }

  // Se soltó el dedo sin moverlo: no hubo arrastre (la barra sigue en modo editar).
  function presionFin() {
    const a = arrastre.current;
    if (a.concedido) return;
    if (a.activo) terminarArrastre(false);
    arrastre.current = {};
  }

  function empezarArrastre(nombre) {
    ponerFantasmaEn(nombre);
    setArrastrada(nombre);
    medirTodo();
  }

  function moverArrastre(px, py) {
    const a = arrastre.current;
    fantasma.setValue({ x: px - origenCapa.current.x, y: py - origenCapa.current.y });
    let encima = null;
    for (const [nombre, r] of Object.entries(rects.current)) {
      if (nombre === a.nombre || !availableScreens.some(s => s.name === nombre)) continue;
      if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      // Entre dos de "Más" no hay nada que cambiar: una de las dos va en la barra.
      if (!effectiveSlots.includes(nombre) && !effectiveSlots.includes(a.nombre)) continue;
      encima = nombre;
      break;
    }
    if (encima !== blancoRef.current) { blancoRef.current = encima; setBlanco(encima); }
  }

  function terminarArrastre(soltado) {
    const a = arrastre.current;
    const destino = blancoRef.current;
    if (soltado && a.nombre && destino) {
      const nuevos = intercambiar(effectiveSlots, slots, a.nombre, destino);
      if (nuevos) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        saveSlots(nuevos);
      }
    }
    arrastre.current = {};
    blancoRef.current = null;
    setBlanco(null);
    setArrastrada(null);
  }

  acciones.current = { moverArrastre, terminarArrastre, empezarArrastre };

  // Mientras editas, el arrastre le quita el dedo a la pestaña en cuanto se mueve.
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => {
      const a = arrastre.current;
      if (!a.nombre) return false;
      if (a.activo || Math.hypot(g.dx, g.dy) > 6) { a.concedido = true; return true; }
      return false;
    },
    onPanResponderGrant: (e) => {
      const a = arrastre.current;
      if (!a.activo) { a.activo = true; acciones.current.empezarArrastre(a.nombre); }
      acciones.current.moverArrastre(e.nativeEvent.pageX, e.nativeEvent.pageY);
    },
    onPanResponderMove: (e) => acciones.current.moverArrastre(e.nativeEvent.pageX, e.nativeEvent.pageY),
    onPanResponderRelease: () => acciones.current.terminarArrastre(true),
    onPanResponderTerminate: () => acciones.current.terminarArrastre(false),
    onPanResponderTerminationRequest: () => false,
  })).current;

  const giroA = tiembla.interpolate({ inputRange: [-1, 1], outputRange: ['-2.5deg', '2.5deg'] });
  const giroB = tiembla.interpolate({ inputRange: [-1, 1], outputRange: ['2.5deg', '-2.5deg'] });
  const abajo = Math.max(insets.bottom, HUECO);
  const altoTotal = ALTO_BARRA + abajo + HUECO;
  const pantallaArrastrada = arrastrada && availableScreens.find(s => s.name === arrastrada);

  function pintarPestana(screen, idx, enCajon) {
    const activa = currentRoute === screen.name;
    return (
      <Pressable
        key={screen.name}
        // Sin borrar en null: React llama al ref viejo con null en cada pintado, y
        // borrar ahí dejaba sin medidas el arrastre. Las que ya no existen las
        // descarta moverArrastre (solo acepta pantallas disponibles).
        ref={r => { if (r) refsItems.current[screen.name] = r; }}
        onLayout={() => medir(screen.name)}
        style={enCajon ? styles.celdaCajon : styles.pestana}
        onPress={() => navegar(screen.name)}
        onLongPress={() => presionLarga(screen.name)}
        delayLongPress={380}
        onPressIn={() => presionInicio(screen.name)}
        onPressOut={presionFin}
        accessibilityRole="button"
        accessibilityLabel={screen.label}
      >
        <Animated.View
          style={[
            styles.pestanaDentro,
            enCajon && activa && styles.activaCajon,
            editando && styles.editable,
            blanco === screen.name && styles.blanco,
            arrastrada === screen.name && styles.origen,
            editando && { transform: [{ rotate: idx % 2 ? giroB : giroA }] },
          ]}
        >
          <Icono nombre={screen.icon} size={22} color={activa ? zc.enNoche : (enCajon ? zc.enNocheSuave : zc.enNocheGris)} />
          <Text
            style={[styles.etiqueta, enCajon && styles.etiquetaCajon, activa && styles.etiquetaActiva]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {screen.label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  }

  const nombrePuesto = rolActivo && rolActivo !== 'dueno'
    ? (permisosRolesEfectivos?.[rolActivo]?.nombre || permisosRolesEfectivos?.[rolActivo]?._label || rolActivo)
    : null;

  return (
    <>
      {/* Ocupa el lugar de la barra: las pantallas terminan justo arriba. */}
      <View style={[styles.hueco, { height: altoTotal }]} />

      <View
        ref={refCapa}
        onLayout={medirTodo}
        style={[styles.capa, desplegado ? styles.capaCompleta : { height: altoTotal }]}
        pointerEvents="box-none"
      >
        <Animated.View
          pointerEvents={abierto ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, styles.velo, { opacity: crecer }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />
        </Animated.View>

        <View style={[styles.pastilla, { bottom: abajo }]} {...pan.panHandlers}>
          <Animated.View
            style={[styles.cajon, { height: crecer.interpolate({ inputRange: [0, 1], outputRange: [0, altoCajon] }) }]}
          >
            <View style={styles.cajonDentro} onLayout={e => setAltoCajon(e.nativeEvent.layout.height)}>
              <View style={styles.cajonCabeza}>
                <Text style={styles.cajonTitulo}>{editando ? 'Arrastra una encima de otra' : 'Más pantallas'}</Text>
                {editando ? (
                  <Pressable style={styles.listo} onPress={cerrar} hitSlop={8}>
                    <Text style={styles.listoTexto}>Listo</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.cajonPista}>Mantén presionada para mover</Text>
                )}
              </View>

              {extras.length > 0 && (
                <View style={styles.rejilla}>
                  {extras.map((s, i) => pintarPestana(s, i, true))}
                </View>
              )}

              {hayPerfiles && !editando && (
                <Pressable style={styles.perfil} onPress={() => { cerrar(); cambiarPerfil(); }}>
                  <Icono nombre="intercambio" size={18} color={zc.enNocheGris} />
                  <Text style={styles.perfilTexto} numberOfLines={1}>
                    {nombrePuesto ? `Activo: ${nombrePuesto} · Cambiar perfil` : 'Cambiar perfil'}
                  </Text>
                  <Icono nombre="derecha" size={14} color={zc.enNocheGris} />
                </Pressable>
              )}
            </View>
          </Animated.View>

          <View style={styles.fila} onLayout={e => setAnchoFila(e.nativeEvent.layout.width)}>
            {idxIndicador >= 0 && celda > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[styles.indicador, { width: celda, transform: [{ translateX: indicX }] }]}
              />
            )}
            {effectiveSlots.map((nombre, idx) => {
              const screen = availableScreens.find(s => s.name === nombre);
              return screen ? pintarPestana(screen, idx, false) : null;
            })}
            {conMas && (
              <Pressable
                style={[styles.pestana, editando && styles.masApagado]}
                onPress={tocarMas}
                accessibilityRole="button"
                accessibilityLabel={abierto ? 'Cerrar' : 'Más pantallas'}
              >
                <View style={styles.pestanaDentro}>
                  <Icono
                    nombre={abierto ? 'abajo' : 'puntos'}
                    size={22}
                    color={idxActiva < 0 && !abierto ? zc.enNoche : zc.enNocheGris}
                  />
                  <Text style={[styles.etiqueta, idxActiva < 0 && !abierto && styles.etiquetaActiva]}>
                    {abierto ? 'Cerrar' : 'Más'}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {pantallaArrastrada && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fantasma,
              { transform: [{ translateX: fantasma.x }, { translateY: fantasma.y }, { translateX: -34 }, { translateY: -78 }, { scale: 1.12 }] },
            ]}
          >
            <Icono nombre={pantallaArrastrada.icon} size={22} color={zc.tinta} />
            <Text style={styles.fantasmaTexto} numberOfLines={1}>{pantallaArrastrada.label}</Text>
          </Animated.View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hueco: {
    backgroundColor: zc.fondo,
  },
  capa: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  capaCompleta: {
    top: 0,
  },
  velo: {
    backgroundColor: zc.velo,
  },
  pastilla: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: zc.noche,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: zc.noche,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cajon: {
    overflow: 'hidden',
  },
  cajonDentro: {
    paddingTop: 16,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  cajonCabeza: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    minHeight: 30,
  },
  cajonTitulo: {
    fontSize: 12,
    fontWeight: '700',
    color: zc.enNocheGris,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cajonPista: {
    fontSize: 11,
    color: zc.enNocheGris,
  },
  listo: {
    backgroundColor: zc.azul,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  listoTexto: {
    color: zc.enNoche,
    fontSize: 13,
    fontWeight: '700',
  },
  rejilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  celdaCajon: {
    width: '25%',
    padding: 2,
  },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginHorizontal: 4,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: zc.vidrio,
  },
  perfilTexto: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: zc.enNocheSuave,
  },
  fila: {
    flexDirection: 'row',
    height: ALTO_BARRA,
    marginHorizontal: 6,
  },
  indicador: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    borderRadius: 20,
    backgroundColor: zc.vidrio,
  },
  pestana: {
    flex: 1,
    justifyContent: 'center',
  },
  pestanaDentro: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 14,
  },
  activaCajon: {
    backgroundColor: zc.vidrio,
  },
  editable: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: zc.vidrioBorde,
    marginHorizontal: 2,
  },
  blanco: {
    backgroundColor: zc.azulVidrio,
    borderColor: zc.azul,
    borderStyle: 'solid',
  },
  origen: {
    opacity: 0.25,
  },
  masApagado: {
    opacity: 0.35,
  },
  etiqueta: {
    fontSize: 10,
    fontWeight: '600',
    color: zc.enNocheGris,
  },
  etiquetaCajon: {
    fontSize: 11,
    color: zc.enNocheSuave,
  },
  etiquetaActiva: {
    color: zc.enNoche,
    fontWeight: '700',
  },
  fantasma: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 68,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: zc.tarjeta,
    shadowColor: zc.noche,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  fantasmaTexto: {
    fontSize: 10,
    fontWeight: '700',
    color: zc.tinta,
  },
});
