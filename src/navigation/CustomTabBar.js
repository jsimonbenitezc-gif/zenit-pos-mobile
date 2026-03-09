import { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, TouchableOpacity, StyleSheet, Animated,
  PanResponder, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';

// ─── Catálogo completo de pantallas ───────────────────────────────────────────

export const ALL_SCREENS = [
  { name: 'NuevaVenta',  label: 'Venta',      icon: 'cart-outline',      active: 'cart',       ownerOnly: false },
  { name: 'Pedidos',     label: 'Pedidos',    icon: 'receipt-outline',   active: 'receipt',    ownerOnly: false },
  { name: 'Mesas',       label: 'Mesas',      icon: 'grid-outline',      active: 'grid',       ownerOnly: false },
  { name: 'Productos',   label: 'Productos',  icon: 'cube-outline',      active: 'cube',       ownerOnly: false },
  { name: 'Clientes',    label: 'Clientes',   icon: 'people-outline',    active: 'people',     ownerOnly: false },
  { name: 'Turno',       label: 'Turno',      icon: 'time-outline',      active: 'time',       ownerOnly: false },
  { name: 'Inventario',  label: 'Inventario', icon: 'layers-outline',    active: 'layers',     ownerOnly: true  },
  { name: 'Ofertas',     label: 'Ofertas',    icon: 'pricetag-outline',  active: 'pricetag',   ownerOnly: true  },
  { name: 'Dashboard',   label: 'Resumen',    icon: 'bar-chart-outline', active: 'bar-chart',  ownerOnly: true  },
  { name: 'Ajustes',     label: 'Ajustes',    icon: 'settings-outline',  active: 'settings',   ownerOnly: false },
];

const DEFAULT_SLOTS = ['NuevaVenta', 'Pedidos', 'Mesas', 'Clientes', 'Ajustes'];
const STORE_KEY = 'zenit_tab_slots_v2';

// ─── CustomTabBar ─────────────────────────────────────────────────────────────

export default function CustomTabBar({ state, navigation }) {
  const { isOwner } = useAuth();
  const insets = useSafeAreaInsets();

  const [slots, setSlots]               = useState(DEFAULT_SLOTS);
  const [showMore, setShowMore]         = useState(false);
  const [configuringIdx, setConfiguring] = useState(null);

  // panelY: 0 = abierto, 500 = cerrado (fuera de pantalla)
  const panelY = useRef(new Animated.Value(500)).current;

  const availableScreens = ALL_SCREENS.filter(s => !s.ownerOnly || isOwner);

  // ── Persistencia ────────────────────────────────────────────────────────────

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then(saved => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) setSlots(parsed);
      } catch {}
    });
  }, []);

  function saveSlots(newSlots) {
    setSlots(newSlots);
    SecureStore.setItemAsync(STORE_KEY, JSON.stringify(newSlots));
  }

  // ── Abrir / cerrar panel ────────────────────────────────────────────────────

  function openMore() {
    setShowMore(true);
    Animated.spring(panelY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }

  function closeMore() {
    Animated.timing(panelY, {
      toValue: 500,
      duration: 280,
      useNativeDriver: true,
    }).start(() => setShowMore(false));
  }

  // ── PanResponder: swipe abajo en el panel para cerrar ───────────────────────
  // onMoveShouldSetPanResponder → solo captura arrastre, no taps (ítems del grid siguen funcionando)

  const panelPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      panelY.setOffset(panelY._value);
      panelY.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) panelY.setValue(g.dy);
    },
    onPanResponderRelease: (_, g) => {
      panelY.flattenOffset();
      if (g.dy > 55 || g.vy > 0.6) {
        closeMore();
      } else {
        Animated.spring(panelY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  // ── Navegación ──────────────────────────────────────────────────────────────

  function navigateTo(screenName) {
    navigation.navigate(screenName);
    closeMore();
  }

  function assignToSlot(screenName) {
    const newSlots = [...slots];
    newSlots[configuringIdx] = screenName;
    saveSlots(newSlots);
    setConfiguring(null);
  }

  const currentRoute = state.routes[state.index]?.name;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Barra principal ── */}
      <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>

        {/* Handle — toca para abrir panel */}
        <TouchableOpacity
          style={styles.handleWrap}
          onPress={openMore}
          activeOpacity={0.6}
          hitSlop={{ top: 6, bottom: 4, left: 60, right: 60 }}
        >
          <View style={styles.handleBar} />
        </TouchableOpacity>

        {/* 5 tabs */}
        <View style={styles.tabs}>
          {slots.map((screenName, idx) => {
            const screen = availableScreens.find(s => s.name === screenName);
            if (!screen) return null;
            const isActive = currentRoute === screenName;
            return (
              <Pressable
                key={idx}
                style={styles.tab}
                onPress={() => navigateTo(screenName)}
                onLongPress={() => setConfiguring(idx)}
                delayLongPress={450}
              >
                <View style={styles.iconWrap}>
                  {/* Resplandor radial: dos círculos concéntricos */}
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
            );
          })}
        </View>
      </View>

      {/* ── Panel "ver todo" ── */}
      {showMore && (
        <Modal visible transparent animationType="none" onRequestClose={closeMore}>
          {/* Fondo oscuro — toca para cerrar */}
          <TouchableWithoutFeedback onPress={closeMore}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>

          {/* Panel con swipe-down para cerrar (funciona en todo el panel) */}
          <Animated.View
            style={[
              styles.morePanel,
              { paddingBottom: insets.bottom || spacing.sm },
              { transform: [{ translateY: panelY }] },
            ]}
            {...panelPan.panHandlers}
          >
            <View style={styles.panelHandleWrap}>
              <View style={styles.handleBar} />
            </View>

            <Text style={styles.moreTitle}>Todas las secciones</Text>
            <Text style={styles.moreTip}>Desliza hacia abajo para cerrar · Mantén un ícono para cambiarlo</Text>

            <View style={styles.moreGrid}>
              {availableScreens.map(screen => {
                const isActive = currentRoute === screen.name;
                return (
                  <Pressable key={screen.name} style={styles.moreItem} onPress={() => navigateTo(screen.name)}>
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
          </Animated.View>
        </Modal>
      )}

      {/* ── Modal configurar slot (mantener presionado) ── */}
      {configuringIdx !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfiguring(null)}>
          <TouchableWithoutFeedback onPress={() => setConfiguring(null)}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <View style={[styles.configPanel, { paddingBottom: insets.bottom || spacing.sm }]}>
            <View style={styles.panelHandleWrap}>
              <View style={styles.handleBar} />
            </View>
            <Text style={styles.moreTitle}>Posición {(configuringIdx ?? 0) + 1} — Elige una sección</Text>
            <View style={styles.moreGrid}>
              {availableScreens.map(screen => {
                const isCurrent = slots[configuringIdx] === screen.name;
                return (
                  <Pressable key={screen.name} style={styles.moreItem} onPress={() => assignToSlot(screen.name)}>
                    <View style={[styles.moreIconWrap, isCurrent && styles.moreIconWrapActive]}>
                      {isCurrent && <View style={styles.moreGlowOuter} />}
                      {isCurrent && <View style={styles.moreGlowInner} />}
                      <Ionicons
                        name={isCurrent ? screen.active : screen.icon}
                        size={26}
                        color={isCurrent ? colors.primary : colors.textSecondary}
                      />
                      {isCurrent && (
                        <View style={styles.checkBadge}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.moreItemLabel, isCurrent && styles.moreItemLabelActive]}>
                      {screen.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  tabs: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  morePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  panelHandleWrap: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
    marginBottom: spacing.lg,
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
  configPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  checkBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
