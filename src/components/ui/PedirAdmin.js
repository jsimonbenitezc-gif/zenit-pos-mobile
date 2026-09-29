// ─── PEDIR LA CONTRASEÑA DEL ADMINISTRADOR (PLAN_SEGURIDAD_V1, sesión 1) ──────
//
//   const { pedirAdmin, modalAdmin } = usePedirAdmin();
//   if (!(await pedirAdmin('Para ver los puestos y sus PINs.'))) return;
//   …y `{modalAdmin}` se pinta una vez en la pantalla.
//
// `pedirAdmin` resuelve true si se puede seguir: la contraseña es correcta, hay
// una reciente (5 min, utils/candadoAdmin.js) o el celular está en modo local
// (no hay cuenta, no hay contraseña que pedir). Resuelve false si se cancela.
// La validación es la de siempre, `verificarPasswordAdmin` (servidor, y sin red
// el verificador local, §40).
import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { adminVigente, marcarAdmin } from '../../utils/candadoAdmin';
import { zc, radios, espacios, letra } from '../../theme';

export function usePedirAdmin() {
  const { verificarPasswordAdmin, rolActivo, modoLocal } = useAuth();
  const [visible, setVisible] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const resolver = useRef(null);

  function pedirAdmin(texto, { siempre = false } = {}) {
    if (modoLocal) return Promise.resolve(true);
    if (!siempre && adminVigente(rolActivo)) return Promise.resolve(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setMensaje(texto || '');
      setPassword('');
      setError('');
      setVisible(true);
    });
  }

  function terminar(ok) {
    setVisible(false);
    const r = resolver.current;
    resolver.current = null;
    if (r) r(ok);
  }

  async function confirmar() {
    if (!password || verificando) return;
    setVerificando(true);
    setError('');
    try {
      await verificarPasswordAdmin(password);
      marcarAdmin(rolActivo);
      terminar(true);
    } catch (e) {
      setError(e?.message || 'Contraseña incorrecta.');
      setPassword('');
    } finally {
      setVerificando(false);
    }
  }

  const modalAdmin = (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => terminar(false)}>
      <KeyboardAvoidingView style={s.velo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.caja}>
          <Text style={s.titulo}>Contraseña de administrador</Text>
          {mensaje ? <Text style={s.texto}>{mensaje}</Text> : null}
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
            placeholderTextColor={zc.grisSuave}
            secureTextEntry
            autoFocus
            onSubmitEditing={confirmar}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={s.botones}>
            <TouchableOpacity style={[s.boton, s.botonGris]} onPress={() => terminar(false)} disabled={verificando}>
              <Text style={s.botonGrisTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.boton, s.botonAzul, verificando && { opacity: 0.7 }]} onPress={confirmar} disabled={verificando}>
              {verificando ? <ActivityIndicator color="#fff" /> : <Text style={s.botonAzulTxt}>Confirmar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return { pedirAdmin, modalAdmin };
}

const s = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', padding: 24 },
  caja: { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: espacios.dentro + 4 },
  titulo: { ...letra.titulo, color: zc.tinta, marginBottom: 6 },
  texto: { ...letra.texto, color: zc.gris, marginBottom: 14 },
  input: {
    borderWidth: 1, borderColor: zc.linea, backgroundColor: zc.fondo, borderRadius: radios.boton,
    paddingHorizontal: 14, paddingVertical: 12, ...letra.texto, color: zc.tinta,
  },
  error: { ...letra.etiqueta, color: zc.rojo, marginTop: 8 },
  botones: { flexDirection: 'row', gap: 8, marginTop: 18 },
  boton: { flex: 1, borderRadius: radios.boton, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  botonGris: { backgroundColor: zc.fondo },
  botonGrisTxt: { ...letra.seccion, color: zc.tinta },
  botonAzul: { backgroundColor: zc.azul },
  botonAzulTxt: { ...letra.seccion, color: '#fff' },
});
