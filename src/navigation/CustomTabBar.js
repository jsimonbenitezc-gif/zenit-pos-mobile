import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  PanResponder, Modal, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';

// ─── Catálogo completo de pantallas ───────────────────────────────────────────

export const ALL_SCREENS = [
  { name: 'NuevaVenta',  label: 'Venta',      icon: 'cart-outline',            active: 'cart',            ownerOnly: false },
  { name: 'Pedidos',     label: 'Pedidos',    icon: 'receipt-outline',         active: 'receipt',         ownerOnly: false },
  { name: 'Mesas',       label: 'Mesas',      icon: 'grid-outline',            active: 'grid',            ownerOnly: false },
  { name: 'Productos',   label: 'Productos',  icon: 'cube-outline',            active: 'cube',            ownerOnly: false },
  { name: 'Clientes',    label: 'Clientes',   icon: 'people-outline',          active: 'people',          ownerOnly: false },
  { name: 'Turno',       label: 'Turno',      icon: 'time-outline',            active: 'time',            ownerOnly: false },
  { name: 'Inventario',  label: 'Inventario', icon: 'layers-outline',          active: 'layers',          ownerOnly: true  },
  { name: 'Ofertas',     label: 'Ofertas',    icon: 'pricetag-outline',        active: 'pricetag',        ownerOnly: true  },
  { name: 'Dashboard',   label: 'Resumen',    icon: 'bar-chart-outline',       active: 'bar-chart',       ownerOnly: true  },
  { name: 'Ajustes',     label: 'Ajustes',    icon: 'settings-outline',        active: 'settings',        ownerOnly: false },
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

  // Animación del panel "más" (posición Y, inicia fuera de pantalla abajo)
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
    Animated.spring(panelY, { toValue: 0, useNativeDriver: true, bounciness: 3 }).start();
  }

  function closeMore() {
    Animated.timing(panelY, { toValue: 500, duration: 220, useNativeDriver: true }).start(() => setShowMore(false));
  }

  // PanResponder en el HANDLE de la barra inferior → swipe hacia arriba abre el panel
  const handlePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, g) => {
      if (g.dy < -20 || (Math.abs(g.dy) < 10 && Math.abs(g.dx) < 10)) {
        openMore();
      }
    },
  })).current;

  // PanResponder en el handle del PANEL → swipe hacia abajo cierra el panel
  const panelDragY = useRef(new Animated.Value(0)).current;
  const panelPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) panelDragY.setValue(g.dy);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 70 || g.vy > 0.8) {
        panelDragY.setValue(0);
        closeMore();
      } else {
        Animated.spring(panelDragY, { toValue: 0, useNativeDriver: true }).start();
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
        {/* Handle deslizable — swipe arriba para abrir panel */}
        <View style={styles.handleWrap} {...handlePan.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        {/* 5 tabs */}
        <View style={styles.tabs}>
          {slots.map((screenName, idx) => {
            const screen = availableScreens.find(s => s.name === screenName);
            if (!screen) return null;
            const isActive = currentRoute === screenName;
            return (
              <TouchableOpacity
                key={idx}
                style={styles.tab}
                onPress={() => navigateTo(screenName)}
                onLongPress={() => setConfiguring(idx)}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                <View style={styles.iconWrap}>
                  {isActive && <View style={styles.glow} />}
                  <Ionicons
                    name={isActive ? screen.active : screen.icon}
                    size={26}
                    color={isActive ? colors.primary : colors.textMuted}
                  />
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                  {screen.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Panel "ver todo" ── */}
      {showMore && (
        <Modal visible transparent animationType="fade" onRequestClose={closeMore}>
          <TouchableWithoutFeedback onPress={closeMore}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              styles.morePanel,
              { paddingBottom: insets.bottom || spacing.sm },
              { transform: [{ translateY: Animated.add(panelY, panelDragY) }] },
            ]}
          >
            {/* Handle del panel para cerrar con swipe */}
            <View style={styles.panelHandleWrap} {...panelPan.panHandlers}>
              <View style={styles.handleBar} />
            </View>

            <Text style={styles.moreTitle}>Todas las secciones</Text>
            <View style={styles.moreGrid}>
              {availableScreens.map(screen => {
                const isActive = currentRoute === screen.name;
                return (
                  <TouchableOpacity key={screen.name} style={styles.moreItem} onPress={() => navigateTo(screen.name)}>
                    <View style={[styles.moreIconWrap, isActive && styles.moreIconWrapActive]}>
                      {isActive && <View style={styles.moreGlow} />}
                      <Ionicons name={isActive ? screen.active : screen.icon} size={26} color={isActive ? colors.primary : colors.textSecondary} />
                    </View>
                    <Text style={[styles.moreItemLabel, isActive && styles.moreItemLabelActive]}>{screen.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.moreTip}>Mantén presionado un ícono para cambiarlo de lugar</Text>
          </Animated.View>
        </Modal>
      )}

      {/* ── Modal configurar slot ── */}
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
                  <TouchableOpacity key={screen.name} style={styles.moreItem} onPress={() => assignToSlot(screen.name)}>
                    <View style={[styles.moreIconWrap, isCurrent && styles.moreIconWrapActive]}>
                      {isCurrent && <View style={styles.moreGlow} />}
                      <Ionicons name={isCurrent ? screen.active : screen.icon} size={26} color={isCurrent ? colors.primary : colors.textSecondary} />
                      {isCurrent && (
                        <View style={styles.checkBadge}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.moreItemLabel, isCurrent && styles.moreItemLabelActive]}>{screen.label}</Text>
                  </TouchableOpacity>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    // área amplia para el gesto
    paddingHorizontal: spacing.xxl,
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
  glow: {
    position: 'absolute',
    width: 48,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '25',
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
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  moreTitle: {
    fontSize: font.md,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
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
    overflow: 'visible',
  },
  moreIconWrapActive: {
    borderColor: colors.primary + '44',
  },
  moreGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '18',
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
  moreTip: {
    fontSize: font.sm - 2,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
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
