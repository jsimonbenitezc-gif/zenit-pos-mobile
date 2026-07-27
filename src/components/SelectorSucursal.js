import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, font } from '../theme';

/**
 * Tabs para MIRAR otra sucursal + aviso de solo-lectura.
 *
 * Ver otra sucursal nunca cambia dónde registra el equipo: eso lo decide la sucursal
 * del dispositivo (CLAUDE.md §24). El aviso amarillo lo repite en cada pantalla para
 * que nadie crea que está vendiendo en la sucursal que está mirando.
 *
 * No dibuja nada si el negocio tiene una sola sucursal: el local único no debe ver
 * un control que no le sirve.
 *
 * @param {number|null} value       sucursal que se está viendo (null = todas)
 * @param {function}    onChange    recibe el id nuevo (o null)
 */
export default function SelectorSucursal({ value, onChange }) {
  const { sucursalId } = useAuth();
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    api.getBranches()
      .then(bs => { if (Array.isArray(bs) && bs.length > 1) setBranches(bs); })
      .catch(() => {});
  }, []);

  if (branches.length <= 1) return null;

  // La sucursal del equipo primero, luego las demás, "Todas" al final
  const ordenadas = [...branches].sort((a, b) => {
    if (a.id === sucursalId) return -1;
    if (b.id === sucursalId) return 1;
    return 0;
  });

  const mirandoOtra = value !== sucursalId;
  const nombreVista = value === null
    ? 'todas las sucursales'
    : (branches.find(b => b.id === value)?.name || 'otra sucursal');
  const nombreEquipo = branches.find(b => b.id === sucursalId)?.name;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {ordenadas.map(b => (
          <TouchableOpacity
            key={b.id}
            style={[styles.tab, value === b.id && styles.tabActive]}
            onPress={() => onChange(b.id)}
          >
            <Text style={[styles.tabText, value === b.id && styles.tabTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.tab, value === null && styles.tabActive]}
          onPress={() => onChange(null)}
        >
          <Text style={[styles.tabText, value === null && styles.tabTextActive]}>Todas</Text>
        </TouchableOpacity>
      </ScrollView>

      {mirandoOtra && (
        <View style={styles.aviso}>
          <Ionicons name="eye-outline" size={14} color="#92400e" />
          <Text style={styles.avisoText}>
            {`Estás viendo ${nombreVista} — solo lectura. `}
            {nombreEquipo
              ? `Los registros de este equipo van a ${nombreEquipo}.`
              : 'Este equipo no tiene sucursal asignada.'}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll:  { marginBottom: spacing.xs, flexGrow: 0 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText:       { fontSize: font.sm, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: '#fff' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm + 2,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius.md,
  },
  avisoText: { flex: 1, fontSize: font.sm, color: '#92400e', lineHeight: 18 },
});
