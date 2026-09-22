import React from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput, Platform, StyleSheet } from 'react-native';
import { colors, zc, radios, letra, sombra } from '../../../theme';
import { Icono } from '../../../components/ui';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const ROL_LABEL = { owner: 'Dueño', cashier: 'Cajero', waiter: 'Mesero', delivery: 'Repartidor' };
export const PLAN_LABEL = { free: 'Gratuito', premium: 'Premium', trial: 'Prueba' };
// Premium en verde: comunica "activo y en orden" (el ámbar se leía como advertencia)
export const PLAN_COLOR = { free: colors.textMuted, premium: colors.success, trial: colors.primary };
// MISMA LISTA que el <select id="adj-moneda"> del desktop (pos/index.html).
// Son dos repos y no se puede compartir el módulo, así que si agregas una
// moneda aquí, agrégala allá también: una que solo exista en un lado deja el
// campo del OTRO en blanco. Comprobado en un navegador real, no supuesto: a un
// <select> al que se le asigna un valor sin <option> se le queda
// selectedIndex = -1 y su .value pasa a ser "".
//
// '$' va PRIMERA a propósito. Es la convención en México y es el default de
// toda la app (el valor al que caen los `|| '$'` de currency_symbol). Estaba
// 'MX$' primera, que es demasiado fácil de tocar sin querer: el negocio acaba
// viendo "MX$170.00" en el ticket, en el corte y en el resumen.
export const MONEDAS = ['$', 'MX$', 'US$', '€', 'Q', 'S/', '₡'];

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
// Diseño A (PLAN_REDISENO_V1, Bloque 1): tarjetas blancas que flotan, etiquetas
// finas en gris y negrita solo donde hay un título. Las usan todas las secciones
// de Ajustes, así que cambiarlas aquí las cambia en todas a la vez.

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
        <Text style={[styles.menuLabel, danger && { color: zc.rojo }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {rightText
        ? <Text style={styles.menuRight}>{rightText}</Text>
        : <Icono nombre="derecha" size={16} color={zc.flecha} />
      }
    </TouchableOpacity>
  );
}

export function SwitchRow({ label, sub, value, onChange, last }) {
  return (
    <View style={[styles.menuItem, !last && styles.menuItemBorder]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#d9dee6', true: zc.azul }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  );
}

// La etiqueta va ARRIBA del campo: al lado, con 90 px fijos, un texto largo se
// cortaba ("hetumal" en vez de "Chetumal" en la mitad de Ciudad/Estado).
export function FieldRow({ label, value, onChangeText, placeholder, keyboardType, last }) {
  return (
    <View style={[styles.fieldRow, !last && styles.menuItemBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ''}
        placeholderTextColor={zc.grisSuave}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontWeight: '500', color: zc.gris, marginBottom: 8, marginTop: 14, marginLeft: 4 },
  section:      { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, marginBottom: 8, ...sombra },

  menuItem:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: zc.linea },
  menuLabel:      { ...letra.texto, fontSize: 15, color: zc.tinta },
  menuSub:        { fontSize: 12.5, color: zc.grisSuave, marginTop: 2, lineHeight: 17 },
  menuRight:      { fontSize: 14, color: zc.gris },

  fieldRow:    { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  fieldLabel:  { fontSize: 12.5, color: zc.gris },
  fieldInput:  { fontSize: 15, color: zc.tinta, paddingVertical: Platform.OS === 'ios' ? 4 : 2, paddingHorizontal: 0 },
});
