import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  PanResponder, Modal, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';

// ─── Catálogo de todas las pantallas disponibles ──────────────────────────────

export const ALL_SCREENS = [
  { name: 'NuevaVenta',  label: 'Venta',     icon: 'cart-outline',       active: 'cart',        ownerOnly: false },
  { name: 'Pedidos',     label: 'Pedidos',   icon: 'receipt-outline',    active: 'receipt',     ownerOnly: false },
  { name: 'Productos',   label: 'Productos', icon: 'cube-outline',       active: 'cube',        ownerOnly: false },
  { name: 'Clientes',    label: 'Clientes',  icon: 'people-outline',     active: 'people',      ownerOnly: false },
  { name: 'Ajustes',     label: 'Ajustes',   icon: 'settings-outline',   active: 'settings',    ownerOnly: false },
  { name: 'Dashboard',   label: 'Resumen',   icon: 'bar-chart-outline',  active: 'bar-chart',   ownerOnly: true  },
];

const DEFAULT_SLOTS = ['NuevaVenta', 'Pedidos', 'Productos', 'Clientes', 'Ajustes'];
const STORE_KEY = 'zenit_tab_slots';

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CustomTabBar({ state, navigation }) {
  const { isOwner } = useAuth();
  const insets = useSafeAreaInsets();

  const [slots, setSlots]               = useState(DEFAULT_SLOTS);
  const [showMore, setShowMore]         = useState(false);
  const [configuringIdx, setConfiguring] = useState(null); // índice del slot en edición

  const moreAnim = useRef(new Animated.Value(300)).current;

  const availableScreens = ALL_SCREENS.filter(s => !s.ownerOnly || isOwner);

  // Cargar slots guardados
  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY).then(saved => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) setSlots(parsed);
      } catch {}
    });
  }, []);

  // Animar el panel "más"
  useEffect(() => {
    Animated.spring(moreAnim, {
      toValue: showMore ? 0 : 300,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [showMore]);

  function navigateTo(screenName) {
    navigation.navigate(screenName);
    setShowMore(false);
  }

  function assignToSlot(screenName) {
    const newSlots = [...slots];
    newSlots[configuringIdx] = screenName;
    setSlots(newSlots);
    setConfiguring(null);
    SecureStore.setItemAsync(STORE_KEY, JSON.stringify(newSlots));
  }

  // PanResponder en el handle — detecta deslizar hacia arriba
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      if (g.dy < -25) setShowMore(true);
    },
  })).current;

  const currentRoute = state.routes[state.index]?.name;

  return (
    <>
      {/* ── Barra principal ── */}
      <View style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}>
        {/* Handle deslizable */}
        <View style={styles.handleWrap} {...panResponder.panHandlers}>
          <TouchableOpacity onPress={() => setShowMore(true)} hitSlop={{ top: 12, bottom: 12, left: 80, right: 80 }}>
            <View style={styles.handleBar} />
          </TouchableOpacity>
        </View>

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
                android_ripple={{ color: colors.primary + '22', borderless: true }}
              >
                <Ionicons
                  name={isActive ? screen.active : screen.icon}
                  size={26}
                  color={isActive ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                  {screen.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Panel "ver todo" ── */}
      <Modal visible={showMore} transparent animationType="fade" onRequestClose={() => setShowMore(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMore(false)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.morePanel, { paddingBottom: insets.bottom || spacing.sm, transform: [{ translateY: moreAnim }] }]}>
          <TouchableOpacity onPress={() => setShowMore(false)} hitSlop={{ top: 16, bottom: 16, left: 80, right: 80 }}>
            <View style={styles.moreDragHandle} />
          </TouchableOpacity>
          <Text style={styles.moreTitle}>Todas las secciones</Text>
          <View style={styles.moreGrid}>
            {availableScreens.map(screen => {
              const isActive = currentRoute === screen.name;
              return (
                <TouchableOpacity key={screen.name} style={styles.moreItem} onPress={() => navigateTo(screen.name)}>
                  <View style={[styles.moreIconWrap, isActive && styles.moreIconWrapActive]}>
                    <Ionicons name={isActive ? screen.active : screen.icon} size={28} color={isActive ? '#fff' : colors.textSecondary} />
                  </View>
                  <Text style={[styles.moreItemLabel, isActive && styles.moreItemLabelActive]}>{screen.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.moreTip}>Mantén presionado un ícono de abajo para personalizarlo</Text>
        </Animated.View>
      </Modal>

      {/* ── Modal configurar slot ── */}
      <Modal visible={configuringIdx !== null} transparent animationType="fade" onRequestClose={() => setConfiguring(null)}>
        <TouchableWithoutFeedback onPress={() => setConfiguring(null)}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <View style={[styles.configPanel, { paddingBottom: insets.bottom || spacing.sm }]}>
          <View style={styles.moreDragHandle} />
          <Text style={styles.moreTitle}>
            Cambiar posición {configuringIdx !== null ? configuringIdx + 1 : ''}
          </Text>
          <View style={styles.moreGrid}>
            {availableScreens.map(screen => {
              const isCurrent = slots[configuringIdx] === screen.name;
              return (
                <TouchableOpacity key={screen.name} style={styles.moreItem} onPress={() => assignToSlot(screen.name)}>
                  <View style={[styles.moreIconWrap, isCurrent && styles.moreIconWrapActive]}>
                    <Ionicons name={isCurrent ? screen.active : screen.icon} size={28} color={isCurrent ? '#fff' : colors.textSecondary} />
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
    </>
  );
}

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
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  morePanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  moreDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
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
    width: 80,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  moreItemLabel: {
    fontSize: font.sm - 1,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  moreItemLabelActive: {
    color: colors.primary,
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
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
