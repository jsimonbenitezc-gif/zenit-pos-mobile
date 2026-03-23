import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  Switch, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { SectionTitle, SectionCard, MenuItem } from './shared';
import { friendlyError } from '../../../utils/errors';

export function SeccionSucursales({
  isOwner,
  isPremium,
  branches,
  setBranches,
  sucursalId,
  setSucursalId,
  onRefresh,
  styles,
}) {
  // ── Own state ───────────────────────────────────────────────────────────
  const [savingSucursal, setSavingSucursal] = useState(false);
  const [modalSucursal, setModalSucursal]           = useState(false);
  const [modalNuevaSucursal, setModalNuevaSucursal] = useState(false);
  const [modalEditarSucursal, setModalEditarSucursal] = useState(false);
  const [nuevaSucursalNombre, setNuevaSucursalNombre] = useState('');
  const [nuevaSucursalDir, setNuevaSucursalDir]     = useState('');
  const [nuevaSucursalTel, setNuevaSucursalTel]     = useState('');
  const [cloneOfertas, setCloneOfertas]             = useState(true);
  const [cloneIngredientes, setCloneIngredientes]   = useState(false);
  const [guardandoSucursal, setGuardandoSucursal]   = useState(false);
  const [editBranch, setEditBranch]                 = useState(null);
  const [editNombre, setEditNombre]                 = useState('');
  const [editDir, setEditDir]                       = useState('');
  const [editTel, setEditTel]                       = useState('');
  const [guardandoEditar, setGuardandoEditar]       = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────
  const sucursalActual = branches.find(b => b.id === sucursalId);

  // ── Functions ───────────────────────────────────────────────────────────
  async function seleccionarSucursal(id) {
    setSucursalId(id);
    setModalSucursal(false);
    setSavingSucursal(true);
    try {
      await api.updateSettings({ sucursal_id: id });
      await onRefresh();
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setSavingSucursal(false);
    }
  }

  function abrirNuevaSucursal() {
    setNuevaSucursalNombre('');
    setNuevaSucursalDir('');
    setNuevaSucursalTel('');
    setCloneOfertas(true);
    setCloneIngredientes(false);
    setModalNuevaSucursal(true);
  }

  async function guardarNuevaSucursal() {
    if (!nuevaSucursalNombre.trim()) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para la sucursal.');
      return;
    }
    setGuardandoSucursal(true);
    try {
      const clone_options = [
        cloneOfertas      && 'offers',
        cloneIngredientes && 'ingredients',
      ].filter(Boolean);
      const created = await api.createBranch({
        name:         nuevaSucursalNombre.trim(),
        address:      nuevaSucursalDir.trim() || undefined,
        phone:        nuevaSucursalTel.trim() || undefined,
        clone_options,
      });
      setBranches(prev => [...prev, created]);
      setModalNuevaSucursal(false);
      await onRefresh();
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setGuardandoSucursal(false);
    }
  }

  function abrirEditarSucursal(b) {
    setEditBranch(b);
    setEditNombre(b.name || '');
    setEditDir(b.address || '');
    setEditTel(b.phone || '');
    setModalEditarSucursal(true);
  }

  async function guardarEditarSucursal() {
    if (!editNombre.trim()) {
      Alert.alert('Nombre requerido', 'Escribe un nombre para la sucursal.');
      return;
    }
    setGuardandoEditar(true);
    try {
      const updated = await api.updateBranch(editBranch.id, {
        name:    editNombre.trim(),
        address: editDir.trim() || undefined,
        phone:   editTel.trim() || undefined,
      });
      setBranches(prev => prev.map(b => b.id === editBranch.id ? { ...b, ...updated } : b));
      setModalEditarSucursal(false);
      await onRefresh();
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setGuardandoEditar(false);
    }
  }

  async function eliminarSucursal(branch) {
    Alert.alert('Eliminar sucursal', `\u00bfEliminar "${branch.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.deleteBranch(branch.id);
          setBranches(prev => prev.filter(b => b.id !== branch.id));
          if (sucursalId === branch.id) {
            setSucursalId(null);
            try { await api.updateSettings({ sucursal_id: null }); } catch {}
          }
          await onRefresh();
        } catch (e) { Alert.alert('Error', friendlyError(e)); }
      }},
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!isOwner) return null;

  return (
    <>
      {/* ── Inline section ──────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs }}>
        <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Sucursal</Text>
        {!isPremium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="lock-closed" size={10} color="#b45309" />
            <Text style={styles.premiumBadgeText}> Premium</Text>
          </View>
        )}
      </View>
      <SectionCard>
        {isPremium ? (
          <>
            <MenuItem
              label="Sucursal de este dispositivo"
              sub={savingSucursal ? 'Guardando...' : (sucursalActual?.name || 'Sin sucursal asignada')}
              onPress={() => setModalSucursal(true)}
            />
            {branches.length === 0 ? (
              <Text style={styles.emptySmall}>A\u00fan no hay sucursales creadas</Text>
            ) : (
              branches.map(b => (
                <View key={b.id} style={[styles.menuItem, styles.menuItemBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{b.name}</Text>
                    {b.address ? <Text style={styles.menuSub}>{b.address}</Text> : null}
                    {b.phone   ? <Text style={styles.menuSub}>{b.phone}</Text>   : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <TouchableOpacity onPress={() => abrirEditarSucursal(b)} style={styles.btnIconSmall}>
                      <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => eliminarSucursal(b)} style={styles.btnIconSmall}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              style={[styles.menuItem, branches.length > 0 && styles.menuItemBorder]}
              onPress={abrirNuevaSucursal}
            >
              <Text style={[styles.menuLabel, { color: colors.primary }]}>+ Nueva sucursal</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.menuItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Gesti\u00f3n de sucursales</Text>
              <Text style={styles.menuSub}>Disponible en el plan Premium</Text>
            </View>
          </View>
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: Nueva sucursal
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalNuevaSucursal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva sucursal</Text>
              <TouchableOpacity onPress={() => setModalNuevaSucursal(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalNombre}
                onChangeText={setNuevaSucursalNombre}
                placeholder="Ej: Sucursal Centro"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Direcci\u00f3n (opcional)</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalDir}
                onChangeText={setNuevaSucursalDir}
                placeholder="Ej: Av. Principal 123"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Tel\u00e9fono (opcional)</Text>
              <TextInput
                style={styles.input}
                value={nuevaSucursalTel}
                onChangeText={setNuevaSucursalTel}
                placeholder="Ej: 55 1234 5678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <Text style={[styles.label, { marginTop: spacing.lg }]}>\u00bfQu\u00e9 datos copiar a esta sucursal?</Text>
              <Text style={[styles.menuSub, { marginBottom: spacing.sm }]}>
                Productos, categor\u00edas y clientes se comparten autom\u00e1ticamente entre todas las sucursales.
              </Text>
              <TouchableOpacity style={styles.checkRow} onPress={() => setCloneOfertas(v => !v)}>
                <View style={[styles.checkbox, cloneOfertas && styles.checkboxOn]}>
                  {cloneOfertas && <Text style={styles.checkboxCheck}>{'\u2713'}</Text>}
                </View>
                <Text style={styles.checkLabel}>Ofertas (descuentos y combos)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.checkRow} onPress={() => setCloneIngredientes(v => !v)}>
                <View style={[styles.checkbox, cloneIngredientes && styles.checkboxOn]}>
                  {cloneIngredientes && <Text style={styles.checkboxCheck}>{'\u2713'}</Text>}
                </View>
                <Text style={styles.checkLabel}>Ingredientes (sin stock)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSave, { marginTop: spacing.xl }, guardandoSucursal && { opacity: 0.7 }]}
                onPress={guardarNuevaSucursal}
                disabled={guardandoSucursal}
              >
                {guardandoSucursal
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Crear sucursal</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: Editar sucursal
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalEditarSucursal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar sucursal</Text>
              <TouchableOpacity onPress={() => setModalEditarSucursal(false)}>
                <Text style={styles.linkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={editNombre}
                onChangeText={setEditNombre}
                placeholder="Nombre de la sucursal"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Direcci\u00f3n (opcional)</Text>
              <TextInput
                style={styles.input}
                value={editDir}
                onChangeText={setEditDir}
                placeholder="Ej: Av. Principal 123"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { marginTop: spacing.md }]}>Tel\u00e9fono (opcional)</Text>
              <TextInput
                style={styles.input}
                value={editTel}
                onChangeText={setEditTel}
                placeholder="Ej: 55 1234 5678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <TouchableOpacity
                style={[styles.btnSave, { marginTop: spacing.xl }, guardandoEditar && { opacity: 0.7 }]}
                onPress={guardarEditarSucursal}
                disabled={guardandoEditar}
              >
                {guardandoEditar
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnSaveText}>Guardar cambios</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: Selector de sucursal
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={modalSucursal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar sucursal</Text>
            <TouchableOpacity onPress={() => setModalSucursal(false)}>
              <Text style={styles.linkText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            <Text style={[styles.menuSub, { marginBottom: spacing.lg }]}>
              Elige la sucursal que corresponde a este dispositivo.
            </Text>
            {/* Sin sucursal */}
            <TouchableOpacity
              style={[styles.deviceRow, !sucursalId && { borderColor: colors.primary }]}
              onPress={() => seleccionarSucursal(null)}
            >
              <Text style={[styles.menuLabel, !sucursalId && { color: colors.primary }]}>
                Sin sucursal asignada
              </Text>
              {!sucursalId && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
            </TouchableOpacity>
            {branches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.deviceRow, sucursalId === b.id && { borderColor: colors.primary }]}
                onPress={() => seleccionarSucursal(b.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, sucursalId === b.id && { color: colors.primary }]}>
                    {b.name}
                  </Text>
                  {b.address ? <Text style={styles.menuSub}>{b.address}</Text> : null}
                </View>
                {sucursalId === b.id && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
