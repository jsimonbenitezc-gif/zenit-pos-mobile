import React from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput, Platform, StyleSheet } from 'react-native';
import { colors, spacing, radius, font } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const ROL_LABEL = { owner: 'Dueño', cashier: 'Cajero', waiter: 'Mesero', delivery: 'Repartidor' };
export const PLAN_LABEL = { free: 'Gratuito', premium: 'Premium', trial: 'Prueba' };
export const PLAN_COLOR = { free: colors.textMuted, premium: '#f59e0b', trial: colors.primary };
export const MONEDAS = ['MX$', 'US$', '$', '€', 'Q', 'S/', '₡'];

export const PERMISOS_DEFAULT = {
  cajero: {
    enabled: false,
    ver_dashboard: false, ver_nueva_venta: true, ver_pedidos: true,
    ver_turno: true, ver_mesas: true, ver_productos: false,
    ver_clientes: true, ver_ofertas: false, ver_inventario: false, ver_ajustes: false,
  },
  encargado: {
    enabled: false,
    ver_dashboard: true, ver_nueva_venta: true, ver_pedidos: true,
    ver_turno: true, ver_mesas: true, ver_productos: true,
    ver_clientes: true, ver_ofertas: true, ver_inventario: true, ver_ajustes: false,
  },
};

export const PERMISOS_LABELS = {
  ver_dashboard: 'Dashboard', ver_nueva_venta: 'Nueva Venta', ver_pedidos: 'Pedidos',
  ver_turno: 'Turno / Caja', ver_mesas: 'Mesas', ver_productos: 'Productos',
  ver_clientes: 'Clientes', ver_ofertas: 'Ofertas', ver_inventario: 'Inventario', ver_ajustes: 'Ajustes',
};

// ─── Componentes pequeños ─────────────────────────────────────────────────────

export function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

export function SectionCard({ children }) {
  return <View style={styles.section}>{children}</View>;
}

export function MenuItem({ label, sub, onPress, danger, rightText, last }) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, !last && styles.menuItemBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {rightText
        ? <Text style={styles.menuRight}>{rightText}</Text>
        : <Text style={styles.menuChevron}>›</Text>
      }
    </TouchableOpacity>
  );
}

export function SwitchRow({ label, sub, value, onChange, last }) {
  return (
    <View style={[styles.menuItem, !last && styles.menuItemBorder]}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? '#fff' : '#f4f3f4') : undefined}
      />
    </View>
  );
}

export function FieldRow({ label, value, onChangeText, placeholder, keyboardType, last }) {
  return (
    <View style={[styles.fieldRow, !last && styles.menuItemBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ''}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionTitle: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.xs },
  section:      { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.sm },

  menuItem:       { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLabel:      { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  menuSub:        { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },
  menuRight:      { fontSize: font.sm, color: colors.textMuted },
  menuChevron:    { color: colors.textMuted, fontSize: 18 },
  menuDanger:     { color: colors.danger },

  switchRow:   { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  switchLabel: { fontSize: font.md, fontWeight: '600', color: colors.textPrimary },
  switchSub:   { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },

  fieldRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  fieldLabel:  { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary, width: 90 },
  fieldInput:  { flex: 1, fontSize: font.md, color: colors.textPrimary, paddingVertical: Platform.OS === 'ios' ? 4 : 0 },
});
