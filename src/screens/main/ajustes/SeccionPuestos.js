import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { PERMISOS_LABELS } from './shared';
import { friendlyError } from '../../../utils/errors';

export function SeccionPuestos({
  permisosRoles,
  setPermisosRoles,
  sucursalId,
  branches,
  fullPermisosRef,
  refreshSettings,
  styles,
}) {
  // ── Own state ───────────────────────────────────────────────────────
  const [savingPuestos, setSavingPuestos]       = useState(false);
  const [nuevoPuestoNombre, setNuevoPuestoNombre] = useState('');
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [pinInputs, setPinInputs]               = useState({});   // { [rol]: string }
  const [puestosExpanded, setPuestosExpanded]   = useState({});   // { [rol]: boolean }

  // ── Helpers ─────────────────────────────────────────────────────────

  function _buildFullPermisos(newRoles) {
    const full = { ...fullPermisosRef.current };
    if (sucursalId) {
      // Guardar solo en la llave de esta sucursal
      full[`__b_${sucursalId}`] = newRoles;
    } else {
      // Guardar globalmente, preservando keys __b_*
      const branchKeys = Object.keys(full).filter(k => k.startsWith('__b_'));
      const preserved = {};
      branchKeys.forEach(k => { preserved[k] = full[k]; });
      return { ...newRoles, ...preserved };
    }
    return full;
  }

  async function setPermiso(rol, clave, valor) {
    setPermisosRoles(prev => {
      const newPermisos = { ...prev, [rol]: { ...prev[rol], [clave]: valor } };
      api.updateSettings({ permisos_roles: _buildFullPermisos(newPermisos) }).catch(() => {});
      return newPermisos;
    });
  }

  async function guardarPuestos() {
    if (!permisosRoles) return;
    setSavingPuestos(true);
    try {
      await api.updateSettings({ permisos_roles: _buildFullPermisos(permisosRoles) });
      Alert.alert('Guardado', 'Permisos de puestos actualizados.');
    } catch (e) {
      Alert.alert('Error', friendlyError(e));
    } finally {
      setSavingPuestos(false);
    }
  }

  async function guardarPinPuesto(rol, pinInput) {
    const pin = pinInput.trim();
    if (!pin || pin.length < 4) { Alert.alert('PIN muy corto', 'El PIN debe tener al menos 4 dígitos.'); return false; }
    if (!/^\d+$/.test(pin)) { Alert.alert('Solo números', 'El PIN solo puede contener números.'); return false; }
    try {
      const { hash } = await api.hashProfilePin(pin);
      setPermisosRoles(prev => {
        const next = { ...prev, [rol]: { ...prev[rol], pin: hash, pin_bcrypt: hash, pin_set: true } };
        api.updateSettings({ permisos_roles: _buildFullPermisos(next) }).catch(() => {});
        return next;
      });
      return true;
    } catch {
      Alert.alert('Error', 'No se pudo guardar el PIN. Verifica tu conexión.');
      return false;
    }
  }

  function quitarPinPuesto(rol) {
    Alert.alert('Quitar PIN', '¿Seguro que quieres quitar el PIN de este puesto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => {
        setPermisosRoles(prev => {
          const p = { ...prev[rol] };
          delete p.pin;
          p.pin_set = false;
          const next = { ...prev, [rol]: p };
          api.updateSettings({ permisos_roles: _buildFullPermisos(next) }).catch(() => {});
          return next;
        });
      }},
    ]);
  }

  function eliminarPuesto(rol) {
    Alert.alert('Eliminar puesto', '¿Seguro que quieres eliminar este puesto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        setPermisosRoles(prev => {
          const next = { ...prev };
          delete next[rol];
          api.updateSettings({ permisos_roles: _buildFullPermisos(next) }).catch(() => {});
          return next;
        });
      }},
    ]);
  }

  function crearNuevoPuesto() {
    const nombre = nuevoPuestoNombre.trim();
    if (!nombre) { Alert.alert('Falta el nombre', 'Escribe un nombre para el puesto.'); return; }
    const key = 'custom_' + nombre.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    const nuevoPuesto = {
      enabled: false, _custom: true, _label: nombre,
      ver_dashboard: false, ver_nueva_venta: true, ver_pedidos: true,
      ver_turno: true, ver_mesas: true, ver_productos: false,
      ver_clientes: true, ver_ofertas: false, ver_inventario: false, ver_ajustes: false,
    };
    setPermisosRoles(prev => {
      const next = { ...prev, [key]: nuevoPuesto };
      api.updateSettings({ permisos_roles: _buildFullPermisos(next) }).catch(() => {});
      return next;
    });
    setNuevoPuestoNombre('');
    setMostrarFormNuevo(false);
  }

  // ── JSX ─────────────────────────────────────────────────────────────

  if (!permisosRoles) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>Administrar Puestos</Text>
      <Text style={styles.sectionSub}>
        El Dueño siempre tiene acceso completo. Activa y configura los otros puestos.
        {sucursalId ? ` Configurando: ${branches.find(b => b.id === sucursalId)?.name || `Sucursal ${sucursalId}`}` : ' (Configuración global)'}
      </Text>

      {(() => {
        const builtin = [
          { rol: 'cajero', label: 'Cajero', custom: false },
          { rol: 'encargado', label: 'Encargado', custom: false },
        ];
        const custom = Object.keys(permisosRoles)
          .filter(k => permisosRoles[k]?._custom === true)
          .map(k => ({ rol: k, label: permisosRoles[k]._label || k, custom: true }));
        return [...builtin, ...custom];
      })().map(({ rol, label, custom }) => {
        const perms = permisosRoles[rol];
        if (!perms) return null;
        const isOpen = !!puestosExpanded[rol];
        const toggleOpen = () => setPuestosExpanded(prev => ({ ...prev, [rol]: !prev[rol] }));
        return (
          <View key={rol} style={styles.puestoCard}>
            {/* Encabezado colapsable */}
            <TouchableOpacity style={styles.puestoHeader} onPress={toggleOpen} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                {custom ? (
                  <TextInput
                    style={styles.puestoLabelInput}
                    value={perms._label || label}
                    onChangeText={v => setPermiso(rol, '_label', v)}
                    placeholder="Nombre del puesto"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                    onFocus={() => setPuestosExpanded(prev => ({ ...prev, [rol]: true }))}
                  />
                ) : (
                  <Text style={styles.puestoLabel}>{label}</Text>
                )}
                {perms.nombre ? (
                  <Text style={styles.puestoSub}>{perms.nombre}</Text>
                ) : (
                  <Text style={styles.puestoSub}>
                    {perms.enabled ? 'Activo · sin nombre' : 'Desactivado'}
                  </Text>
                )}
              </View>
              {custom && (
                <TouchableOpacity
                  onPress={() => eliminarPuesto(rol)}
                  style={{ padding: spacing.xs, marginRight: spacing.xs }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
              <Switch
                value={perms.enabled}
                onValueChange={v => {
                  setPermiso(rol, 'enabled', v);
                  if (v) setPuestosExpanded(prev => ({ ...prev, [rol]: true }));
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? (perms.enabled ? '#fff' : '#f4f3f4') : undefined}
              />
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
                style={{ marginLeft: spacing.xs }}
              />
            </TouchableOpacity>

            {/* Contenido expandible */}
            {isOpen && (
              <>
                {/* Nombre de la persona */}
                <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
                  <Text style={styles.permisosTitle}>Nombre de la persona</Text>
                  <TextInput
                    style={styles.nombreInput}
                    value={perms.nombre || ''}
                    onChangeText={v => setPermiso(rol, 'nombre', v)}
                    placeholder="Ej: María, Juan..."
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                  />
                  <Text style={{ fontSize: font.sm - 1, color: colors.textMuted, marginTop: 4 }}>
                    Se usa para identificar el turno y la selección de perfil.
                  </Text>
                </View>

                {/* Permisos de pantallas */}
                <View style={styles.permisosWrap}>
                  <Text style={styles.permisosTitle}>Pantallas visibles</Text>
                  {Object.entries(PERMISOS_LABELS).map(([clave, nombre], idx, arr) => (
                    <View
                      key={clave}
                      style={[styles.permisoRow, idx < arr.length - 1 && styles.permisoRowBorder]}
                    >
                      <Text style={styles.permisoNombre}>{nombre}</Text>
                      <Switch
                        value={!!perms[clave]}
                        onValueChange={v => setPermiso(rol, clave, v)}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor={Platform.OS === 'android' ? (perms[clave] ? '#fff' : '#f4f3f4') : undefined}
                      />
                    </View>
                  ))}
                </View>

                {/* PIN de acceso */}
                <View style={styles.pinSection}>
                  <Text style={styles.permisosTitle}>PIN de acceso</Text>
                  {perms.pin_set
                    ? <Text style={styles.pinStatus}>✓ PIN configurado</Text>
                    : <Text style={[styles.pinStatus, { color: colors.textMuted }]}>Sin PIN — cualquiera puede seleccionar este perfil.</Text>
                  }
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <TextInput
                      style={[styles.nombreInput, { flex: 1, marginTop: 0 }]}
                      value={pinInputs[rol] || ''}
                      onChangeText={v => setPinInputs(prev => ({ ...prev, [rol]: v }))}
                      placeholder={perms.pin_set ? 'Nuevo PIN para reemplazar' : '4–8 dígitos'}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={8}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={styles.btnPinGuardar}
                      onPress={async () => {
                        const ok = await guardarPinPuesto(rol, pinInputs[rol] || '');
                        if (ok) setPinInputs(prev => ({ ...prev, [rol]: '' }));
                      }}
                    >
                      <Text style={styles.btnPinGuardarText}>{perms.pin_set ? 'Cambiar' : 'Guardar'}</Text>
                    </TouchableOpacity>
                  </View>
                  {perms.pin_set && (
                    <TouchableOpacity style={styles.btnQuitarPin} onPress={() => quitarPinPuesto(rol)}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.btnQuitarPinText}>Quitar PIN</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        );
      })}

      {/* Agregar puesto */}
      {mostrarFormNuevo ? (
        <View style={styles.formNuevoPuesto}>
          <Text style={styles.formNuevoTitle}>Nuevo puesto</Text>
          <TextInput
            style={styles.nombreInput}
            value={nuevoPuestoNombre}
            onChangeText={setNuevoPuestoNombre}
            placeholder="Ej: Cocinero, Mesero, Bartender..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={crearNuevoPuesto}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <TouchableOpacity style={[styles.btnSave, { flex: 1, marginBottom: 0 }]} onPress={crearNuevoPuesto}>
              <Text style={styles.btnSaveText}>Crear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSave, { flex: 1, marginBottom: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setMostrarFormNuevo(false); setNuevoPuestoNombre(''); }}
            >
              <Text style={[styles.btnSaveText, { color: colors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.btnNuevoPuesto} onPress={() => setMostrarFormNuevo(true)}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.btnNuevoPuestoText}>Nuevo puesto</Text>
        </TouchableOpacity>
      )}
    </>
  );
}
