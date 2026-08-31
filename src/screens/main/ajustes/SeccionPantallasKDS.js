import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ScrollView,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { SectionTitle, SectionCard, MenuItem } from './shared';
import { friendlyError } from '../../../utils/errors';

/**
 * Pantallas de cocina (BLOQUE 13).
 *
 * Sustituye al QR que ERA la credencial. Antes, el código que se le enseñaba a
 * una tablet llevaba dentro un pase de 12 h: quien lo fotografiara veía la
 * cocina medio día y no había forma de cortarle el acceso — solo esperar a que
 * venciera. Ahora:
 *
 *   • El QR lleva un código de un solo uso que caduca en 10 minutos y cuyo
 *     único efecto es dejar la pantalla en "pendiente".
 *   • Aprobarla pide el PIN del puesto y queda registrado quién lo hizo.
 *   • Revocarla corta el acceso al instante, no cuando venza nada.
 *
 * El QR se dibuja EN EL DISPOSITIVO (react-native-qrcode-svg). Nunca con un
 * servicio externo: eso mandaría el código a los registros de un tercero.
 */

const ESTADO_ETIQUETA = {
  pendiente: 'Esperando aprobación',
  activo:    'Activa',
  revocado:  'Sin acceso',
};

const ESTADO_COLOR = {
  pendiente: colors.warning || '#d97706',
  activo:    colors.success,
  revocado:  colors.textMuted,
};

function haceCuanto(iso) {
  if (!iso) return 'nunca';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1)   return 'ahora mismo';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-MX');
}

export function SeccionPantallasKDS({ sucursalId, rolActivo, nombreActivo, styles }) {
  const [dispositivos, setDispositivos] = useState([]);
  const [modal, setModal]       = useState(false);
  const [cargando, setCargando] = useState(false);

  // Emparejamiento
  const [codigo, setCodigo]     = useState(null);
  const [urlQR, setUrlQR]       = useState(null);
  const [errorQR, setErrorQR]   = useState(null);

  // Aprobar / revocar
  const [accion, setAccion]     = useState(null); // { tipo:'aprobar'|'revocar', dispositivo }
  const [nombre, setNombre]     = useState('');
  const [pin, setPin]           = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [guardando, setGuardando]     = useState(false);

  const intervalo = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.getDispositivosKds();
      setDispositivos(r?.data || []);
    } catch {
      // Sin conexión se conserva lo último que se vio: es una lista informativa.
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras el modal está abierto se refresca solo: el dueño acaba de enseñarle
  // el QR a la tablet y la pantalla nueva tiene que aparecer sin que él haga nada.
  useEffect(() => {
    if (!modal) {
      if (intervalo.current) clearInterval(intervalo.current);
      return;
    }
    intervalo.current = setInterval(cargar, 4000);
    return () => clearInterval(intervalo.current);
  }, [modal, cargar]);

  const pendientes = dispositivos.filter(d => d.estado === 'pendiente');
  const activas    = dispositivos.filter(d => d.estado === 'activo');

  const resumen = pendientes.length
    ? `${pendientes.length} esperando aprobación`
    : activas.length
      ? `${activas.length} pantalla${activas.length !== 1 ? 's' : ''} activa${activas.length !== 1 ? 's' : ''}`
      : 'Ninguna pantalla emparejada';

  async function abrirModal() {
    setModal(true);
    setCargando(true);
    await cargar();
    setCargando(false);
  }

  async function generarCodigo() {
    setCodigo(null);
    setUrlQR(null);
    setErrorQR(null);
    try {
      const r = await api.crearCodigoKds(sucursalId ?? null);
      setCodigo(r.codigo);
      setUrlQR(r.url);
    } catch (e) {
      setErrorQR(friendlyError(e) || 'No se pudo generar el código');
    }
  }

  function abrirAccion(tipo, dispositivo) {
    setAccion({ tipo, dispositivo });
    setNombre(dispositivo.nombre || '');
    setPin('');
    setErrorAccion('');
  }

  async function confirmarAccion() {
    if (!accion) return;
    setGuardando(true);
    setErrorAccion('');
    try {
      // El PIN va SIEMPRE que el cajero lo teclee: el backend decide si hace
      // falta (un puesto sin PIN configurado solo confirma, §19.19). Mandarlo
      // vacío como si nada sería el error que dejó cancelar-pedido muerto un mes.
      const datos = {
        role: rolActivo || null,
        pin: pin || undefined,
        employee_name: nombreActivo || '',
      };
      if (accion.tipo === 'aprobar') {
        await api.aprobarDispositivoKds(accion.dispositivo.id, {
          ...datos,
          nombre: nombre.trim() || accion.dispositivo.nombre || null,
        });
      } else {
        await api.revocarDispositivoKds(accion.dispositivo.id, datos);
      }
      setAccion(null);
      await cargar();
    } catch (e) {
      setErrorAccion(friendlyError(e) || 'No se pudo completar la acción');
    } finally {
      setGuardando(false);
    }
  }

  function quitarDeLaLista(dispositivo) {
    Alert.alert(
      'Quitar de la lista',
      'El registro desaparece de aquí. La pantalla seguirá sin acceso.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.eliminarDispositivoKds(dispositivo.id);
              await cargar();
            } catch (e) {
              Alert.alert('No se pudo quitar', friendlyError(e));
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <SectionTitle label="Pantallas de cocina" />
      <SectionCard>
        <MenuItem
          label="Pantallas de cocina"
          sub={resumen}
          onPress={abrirModal}
          rightText={pendientes.length ? `${pendientes.length} ●` : undefined}
          last
        />
      </SectionCard>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pantallas de cocina</Text>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Ionicons name="close" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            {cargando ? <ActivityIndicator color={colors.primary} /> : null}

            {/* Emparejar una pantalla nueva */}
            {urlQR ? (
              <View style={local.qrCaja}>
                <Text style={local.qrTitulo}>Escanea con la pantalla de cocina</Text>
                <View style={local.qrMarco}>
                  <QRCode value={urlQR} size={190} backgroundColor="#fff" />
                </View>
                <Text style={local.qrCodigo}>{codigo}</Text>
                <Text style={local.qrAyuda}>
                  Dura 10 minutos y sirve una sola vez. Cuando la pantalla lo escanee
                  aparecerá abajo esperando tu aprobación.
                </Text>
                <TouchableOpacity onPress={() => { setUrlQR(null); setCodigo(null); }}>
                  <Text style={local.qrCerrar}>Listo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={local.btnPrimario} onPress={generarCodigo}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={local.btnPrimarioText}>  Agregar pantalla</Text>
              </TouchableOpacity>
            )}
            {errorQR ? <Text style={local.error}>{errorQR}</Text> : null}

            {/* Lista */}
            {dispositivos.length === 0 && !cargando ? (
              <Text style={local.vacio}>
                Todavía no hay ninguna pantalla emparejada. Agrega una y escanea el código
                desde la tablet de la cocina.
              </Text>
            ) : null}

            {dispositivos.map(d => (
              <View key={d.id} style={local.fila}>
                <View style={{ flex: 1 }}>
                  <Text style={local.filaNombre}>{d.nombre || `Pantalla ${d.id}`}</Text>
                  <Text style={[local.filaEstado, { color: ESTADO_COLOR[d.estado] || colors.textMuted }]}>
                    {ESTADO_ETIQUETA[d.estado] || d.estado}
                    {d.branch_name ? ` · ${d.branch_name}` : ''}
                  </Text>
                  {d.estado === 'activo' ? (
                    <Text style={local.filaSub}>
                      Última conexión {haceCuanto(d.ultimo_acceso)}
                      {d.aprobado_por_nombre ? ` · autorizó ${d.aprobado_por_nombre}` : ''}
                    </Text>
                  ) : null}
                  {d.estado === 'revocado' && d.revocado_por_nombre ? (
                    <Text style={local.filaSub}>Revocó {d.revocado_por_nombre}</Text>
                  ) : null}
                  {d.estado === 'pendiente' && d.ip_registro ? (
                    <Text style={local.filaSub}>Desde {d.ip_registro}</Text>
                  ) : null}
                </View>

                <View style={{ gap: 6 }}>
                  {d.estado === 'pendiente' ? (
                    <>
                      <TouchableOpacity style={local.btnMini} onPress={() => abrirAccion('aprobar', d)}>
                        <Text style={local.btnMiniText}>Aprobar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={local.btnMiniGris} onPress={() => abrirAccion('revocar', d)}>
                        <Text style={local.btnMiniGrisText}>Rechazar</Text>
                      </TouchableOpacity>
                    </>
                  ) : d.estado === 'activo' ? (
                    <TouchableOpacity style={local.btnMiniRojo} onPress={() => abrirAccion('revocar', d)}>
                      <Text style={local.btnMiniRojoText}>Revocar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={local.btnMiniGris} onPress={() => quitarDeLaLista(d)}>
                      <Text style={local.btnMiniGrisText}>Quitar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            <View style={local.aviso}>
              <Text style={local.avisoTexto}>
                Una pantalla aprobada solo puede ver la cola de cocina: no llega a clientes,
                inventario ni ventas. No caduca nunca, y si pierdes la tablet, revocarla le
                corta el acceso de inmediato.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Aprobar / revocar: pide el PIN del puesto */}
      <Modal visible={!!accion} transparent animationType="fade" onRequestClose={() => setAccion(null)}>
        <KeyboardAvoidingView style={local.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={local.dialogo}>
            <Text style={local.dialogoTitulo}>
              {accion?.tipo === 'aprobar' ? 'Aprobar pantalla' : 'Retirar el acceso'}
            </Text>
            <Text style={local.dialogoSub}>
              {accion?.tipo === 'aprobar'
                ? 'Esta pantalla podrá ver la cola de cocina hasta que la revoques.'
                : 'La pantalla deja de ver los pedidos de inmediato.'}
            </Text>

            {accion?.tipo === 'aprobar' ? (
              <TextInput
                style={local.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre (ej. Cocina caliente)"
                placeholderTextColor={colors.textMuted}
              />
            ) : null}

            <TextInput
              style={local.input}
              value={pin}
              onChangeText={setPin}
              placeholder="PIN de tu puesto"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
            />
            {errorAccion ? <Text style={local.error}>{errorAccion}</Text> : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity style={local.btnSecundario} onPress={() => setAccion(null)}>
                <Text style={local.btnSecundarioText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[local.btnPrimario, { flex: 1, marginTop: 0 }, guardando && { opacity: 0.6 }]}
                onPress={confirmarAccion}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={local.btnPrimarioText}>
                      {accion?.tipo === 'aprobar' ? 'Aprobar' : 'Revocar'}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const local = {
  btnPrimario:     { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: spacing.sm },
  btnPrimarioText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  btnSecundario:     { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  btnSecundarioText: { color: colors.textSecondary, fontWeight: '600' },

  fila:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  filaNombre: { fontSize: font.md, fontWeight: '700', color: colors.textPrimary },
  filaEstado: { fontSize: font.sm, fontWeight: '600', marginTop: 2 },
  filaSub:    { fontSize: font.sm - 1, color: colors.textMuted, marginTop: 2 },

  btnMini:      { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  btnMiniText:  { color: '#fff', fontWeight: '700', fontSize: font.sm },
  btnMiniRojo:     { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  btnMiniRojoText: { color: colors.danger, fontWeight: '700', fontSize: font.sm },
  btnMiniGris:     { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  btnMiniGrisText: { color: colors.textMuted, fontWeight: '600', fontSize: font.sm },

  qrCaja:   { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, marginBottom: spacing.lg },
  qrTitulo: { fontSize: font.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  qrMarco:  { backgroundColor: '#fff', padding: spacing.md, borderRadius: 10 },
  qrCodigo: { fontSize: 22, fontWeight: '800', letterSpacing: 4, color: colors.primary, marginTop: spacing.md },
  qrAyuda:  { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  qrCerrar: { color: colors.primary, fontWeight: '700', marginTop: spacing.md },

  vacio: { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  error: { color: colors.danger, fontSize: font.sm, marginTop: spacing.sm },

  aviso:      { backgroundColor: colors.surfaceAlt || colors.surface, borderRadius: 10, padding: spacing.lg, marginTop: spacing.xl },
  avisoTexto: { fontSize: font.sm, color: colors.textSecondary, lineHeight: 19 },

  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: spacing.xl },
  dialogo:  { backgroundColor: colors.surface, borderRadius: 14, padding: spacing.xl },
  dialogoTitulo: { fontSize: font.lg, fontWeight: '800', color: colors.textPrimary },
  dialogoSub:    { fontSize: font.sm, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: font.md, color: colors.textPrimary, marginTop: spacing.sm },
};
