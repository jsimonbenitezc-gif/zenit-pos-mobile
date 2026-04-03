import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TouchableOpacity, StyleSheet, Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';
import { SCREEN_PERM_MAP } from './screenPerms';

export const ALL_SCREENS = [
  { name: 'NuevaVenta', label: 'Venta', icon: 'cart-outline', active: 'cart', ownerOnly: false },
  { name: 'Pedidos', label: 'Pedidos', icon: 'receipt-outline', active: 'receipt', ownerOnly: false },
  { name: 'Mesas', label: 'Mesas', icon: 'grid-outline', active: 'grid', ownerOnly: false },
  { name: 'Productos', label: 'Productos', icon: 'cube-outline', active: 'cube', ownerOnly: false },
  { name: 'Clientes', label: 'Clientes', icon: 'people-outline', active: 'people', ownerOnly: false },
  { name: 'Turno', label: 'Turno', icon: 'time-outline', active: 'time', ownerOnly: false },
  { name: 'Inventario', label: 'Inventario', icon: 'layers-outline', active: 'layers', ownerOnly: true },
  { name: 'Ofertas', label: 'Ofertas', icon: 'pricetag-outline', active: 'pricetag', ownerOnly: true },
  { name: 'Dashboard', label: 'Resumen', icon: 'bar-chart-outline', active: 'bar-chart', ownerOnly: true },
  { name: 'Ajustes', label: 'Ajustes', icon: 'settings-outline', active: 'settings', ownerOnly: false },
];

const DEFAULT_SLOTS = ['NuevaVenta', 'Pedidos', 'Mesas', 'Clientes', 'Ajustes'];
const STORE_KEY = 'zenit_tab_slots_v2';

function moveItem(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function CustomTabBar({ state, navigation }) {
  const { isOwner, rolActivo, settings, permisosRolesEfectivos, cambiarPerfil } = useAuth();
  const insets = useSafeAreaInsets();

  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [expanded, setExpanded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [tabsWidth, setTabsWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [draggedName, setDraggedName] = useState(null);

  const availableScreens = useMemo(() => {
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
  }, [isOwner, rolActivo, permisosRolesEfectivos]);

  const BAR_HEIGHT = 64 + (insets.bottom || spacing.sm);
  const sheetY = useRef(new Animated.Value(360)).current;
  const sheetYRef = useRef(360);
  const sheetClosedRef = useRef(360);
  const dragDx = useRef(new Animated.Value(0)).current;

  const dragMetaRef = useRef({
    active: false,
    startIdx: 0,
    currentIdx: 0,
    original: [],
    draggedName: null,
  });

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
    // Paso 1: slots preferidos disponibles
    for (const name of slots) {
      if (available.includes(name) && !used.has(name)) {
        result.push(name);
        used.add(name);
      }
    }
    // Paso 2: rellenar con disponibles no usados
    for (const name of available) {
      if (result.length >= 5) break;
      if (!used.has(name)) {
        result.push(name);
        used.add(name);
      }
    }
    return result;
  }, [slots, availableScreens]);

  useEffect(() => {
    const id = sheetY.addListener(({ value }) => {
      sheetYRef.current = value;
    });
    return () => sheetY.removeListener(id);
  }, [sheetY]);

  function saveSlots(newSlots) {
    setSlots(newSlots);
    SecureStore.setItemAsync(STORE_KEY, JSON.stringify(newSlots));
  }

  function animateOpen() {
    Animated.spring(sheetY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }

  function animateClose(onEnd) {
    Animated.timing(sheetY, {
      toValue: sheetClosedRef.current,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onEnd?.());
  }

  function openMore() {
    setExpanded(true);
    setSelectedSlot(null);
    sheetY.setValue(sheetClosedRef.current);
    requestAnimationFrame(() => animateOpen());
  }

  function closeMore() {
    setSelectedSlot(null);
    animateClose(() => setExpanded(false));
  }

  function navigateTo(screenName) {
    navigation.navigate(screenName);
    closeMore();
  }

  function assignToSlot(screenName) {
    if (selectedSlot === null) return;
    const newSlots = [...slots];
    newSlots[selectedSlot] = screenName;
    saveSlots(newSlots);
    setSelectedSlot(null);
  }

  function startDrag(idx) {
    const original = [...slots];
    const dragged = original[idx];
    dragMetaRef.current = {
      active: true,
      startIdx: idx,
      currentIdx: idx,
      original,
      draggedName: dragged,
    };
    setDragging(true);
    setDraggedName(dragged);
    dragDx.setValue(0);
  }

  function endDrag() {
    const meta = dragMetaRef.current;
    if (!meta.active) return;
    const finalSlots = moveItem(meta.original, meta.startIdx, meta.currentIdx);
    saveSlots(finalSlots);
    dragMetaRef.current = {
      active: false,
      startIdx: 0,
      currentIdx: 0,
      original: [],
      draggedName: null,
    };
    setDragging(false);
    setDraggedName(null);
    dragDx.setValue(0);
  }

  const currentRoute = state.routes[state.index]?.name;
  const overlayOpacity = sheetY.interpolate({
    inputRange: [0, 420],
    outputRange: [0.5, 0],
    extrapolate: 'clamp',
  });

  const openPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      setExpanded(true);
      setSelectedSlot(null);
      sheetY.setValue(sheetClosedRef.current);
    },
    onPanResponderMove: (_, g) => {
      const nextY = Math.max(0, Math.min(sheetClosedRef.current, sheetClosedRef.current + g.dy));
      sheetY.setValue(nextY);
    },
    onPanResponderRelease: (_, g) => {
      const shouldOpen = g.dy < -46 || g.vy < -0.7 || sheetYRef.current < sheetClosedRef.current * 0.6;
      if (shouldOpen) animateOpen();
      else animateClose(() => setExpanded(false));
    },
    onPanResponderTerminate: () => {
      if (sheetYRef.current < sheetClosedRef.current * 0.8) animateOpen();
      else setExpanded(false);
    },
  })).current;

  const panelPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) =>
      g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onMoveShouldSetPanResponder: (_, g) =>
      g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      sheetY.stopAnimation((value) => {
        sheetY.setValue(Math.max(0, Math.min(sheetClosedRef.current, value)));
      });
    },
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) sheetY.setValue(Math.min(sheetClosedRef.current, g.dy));
      else sheetY.setValue(Math.max(0, g.dy * 0.12));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 70 || g.vy > 0.9) closeMore();
      else animateOpen();
    },
    onPanResponderTerminate: () => animateOpen(),
  })).current;

  const reorderPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => dragMetaRef.current.active,
    onMoveShouldSetPanResponder: () => dragMetaRef.current.active,
    onPanResponderMove: (_, g) => {
      const meta = dragMetaRef.current;
      if (!meta.active || tabsWidth <= 0) return;

      const cell = tabsWidth / 5;
      const target = Math.max(0, Math.min(4, Math.round(meta.startIdx + g.dx / cell)));
      if (target !== meta.currentIdx) {
        meta.currentIdx = target;
        setSlots(moveItem(meta.original, meta.startIdx, target));
      }

      const snappedDx = (target - meta.startIdx) * cell;
      dragDx.setValue(g.dx - snappedDx);
    },
    onPanResponderRelease: () => endDrag(),
    onPanResponderTerminate: () => endDrag(),
  })).current;

  return (
    <View style={styles.root}>
      {expanded && (
        <Pressable style={[styles.overlay, { bottom: BAR_HEIGHT }]} onPress={closeMore}>
          <Animated.View style={[styles.overlayTint, { opacity: overlayOpacity }]} />
        </Pressable>
      )}

      {expanded && (
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h <= 0) return;
            const closed = Math.max(220, Math.round(h + 12));
            sheetClosedRef.current = closed;
          }}
          style={[
            styles.morePanel,
            { paddingBottom: insets.bottom || spacing.sm },
            { bottom: BAR_HEIGHT - 2 },
            { transform: [{ translateY: sheetY }] },
          ]}
          {...panelPan.panHandlers}
        >
          <View style={styles.panelHandleWrap}>
            <View style={styles.handleBar} />
          </View>

          <Text style={styles.moreTitle}>Funciones</Text>
          <Text style={styles.moreTip}>
            {selectedSlot === null
              ? 'Paso 1: toca una posición rápida · Paso 2: toca una función'
              : `Asignando posición ${selectedSlot + 1}: elige una función`}
          </Text>

          <View style={styles.quickRow}>
            {effectiveSlots.map((screenName, idx) => {
              const screen = availableScreens.find(s => s.name === screenName);
              if (!screen) return null;
              const picked = selectedSlot === idx;
              return (
                <Pressable
                  key={`quick_${idx}`}
                  style={[styles.quickItem, picked && styles.quickItemPicked]}
                  onPress={() => setSelectedSlot(idx)}
                >
                  <Text style={[styles.quickIndex, picked && styles.quickIndexPicked]}>
                    {idx + 1}
                  </Text>
                  <Text style={[styles.quickLabel, picked && styles.quickLabelPicked]} numberOfLines={1}>
                    {screen.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.moreGrid}>
            {availableScreens.map(screen => {
              const isActive = currentRoute === screen.name;
              return (
                <Pressable
                  key={screen.name}
                  style={styles.moreItem}
                  onPress={() => {
                    if (selectedSlot !== null) assignToSlot(screen.name);
                    else navigateTo(screen.name);
                  }}
                >
                  <View style={[styles.moreIconWrap, isActive && styles.moreIconWrapActive]}>
                    {isActive && <View style={styles.moreGlowOuter} />}
                    {isActive && <View style={styles.moreGlowInner} />}
                    <Ionicons
                      name={isActive ? screen.active : screen.icon}
                      size={26}
                      color={isActive ? colors.primary : colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.moreItemLabel, isActive && styles.moreItemLabelActive]}>
                    {screen.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Cambiar perfil — visible si hay puestos activos */}
          {Object.values(permisosRolesEfectivos || {}).some(p => p?.enabled) && (
            <Pressable
              style={styles.cambiarPerfilBtn}
              onPress={() => { closeMore(); cambiarPerfil(); }}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.cambiarPerfilText}>
                {rolActivo && rolActivo !== 'dueno'
                  ? `Activo: ${permisosRolesEfectivos?.[rolActivo]?.nombre || permisosRolesEfectivos?.[rolActivo]?._label || rolActivo} · Cambiar perfil`
                  : 'Cambiar perfil'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </Animated.View>
      )}

      <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>
        <View {...openPan.panHandlers}>
          <TouchableOpacity
            style={styles.handleWrap}
            onPress={openMore}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 4, left: 60, right: 60 }}
          >
            <View style={styles.pullNotch}>
              <View style={styles.pullNotchLine} />
            </View>
          </TouchableOpacity>
        </View>

        <View
          style={styles.tabs}
          onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
          {...(dragging ? reorderPan.panHandlers : {})}
        >
          {effectiveSlots.map((screenName, idx) => {
            const screen = availableScreens.find(s => s.name === screenName);
            if (!screen) return null;
            const isActive = currentRoute === screenName;
            const isDragging = dragging && draggedName === screenName;
            return (
              <Animated.View
                key={idx}
                style={[
                  styles.tabWrap,
                  expanded && styles.tabWrapDimmed,
                  isDragging && {
                    zIndex: 3,
                    transform: [{ translateX: dragDx }],
                  },
                ]}
              >
                <Pressable
                  style={styles.tab}
                  onPress={() => !dragging && navigateTo(screenName)}
                  onLongPress={() => startDrag(idx)}
                  delayLongPress={260}
                  onPressOut={() => {
                    if (dragging && draggedName === screenName) endDrag();
                  }}
                >
                  <View style={styles.iconWrap}>
                    {isActive && <View style={styles.glowOuter} />}
                    {isActive && <View style={styles.glowInner} />}
                    <Ionicons
                      name={isActive ? screen.active : screen.icon}
                      size={26}
                      color={isActive ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                    {screen.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'visible',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTint: {
    flex: 1,
    backgroundColor: '#000',
  },
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 4,
  },
  pullNotch: {
    width: 74,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    marginBottom: 4,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pullNotchLine: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  tabs: {
    flexDirection: 'row',
  },
  tabWrap: {
    flex: 1,
  },
  tabWrapDimmed: {
    opacity: 0.3,
  },
  tab: {
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    gap: 2,
  },
  iconWrap: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: 48,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary + '14',
  },
  glowInner: {
    position: 'absolute',
    width: 30,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary + '30',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  morePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    zIndex: 6,
  },
  panelHandleWrap: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  moreTitle: {
    fontSize: font.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  moreTip: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  quickIndex: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
  },
  quickIndexPicked: {
    color: colors.primary,
  },
  quickItemPicked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  quickLabelPicked: {
    color: colors.primary,
  },
  moreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  moreItem: {
    width: 72,
    alignItems: 'center',
    gap: spacing.xs,
  },
  moreIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreIconWrapActive: {
    borderColor: colors.primary + '44',
  },
  moreGlowOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '14',
  },
  moreGlowInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary + '2a',
  },
  moreItemLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  moreItemLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  cambiarPerfilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cambiarPerfilText: {
    flex: 1,
    fontSize: font.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});


