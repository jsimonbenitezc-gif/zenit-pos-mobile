// ─── AVISOS PROPIOS: aviso() y toast() (PLAN_SEGURIDAD_V1, sesión 2) ──────────
//
//   aviso('Eliminar puesto', '¿Seguro?', [
//     { text: 'Cancelar', style: 'cancel' },
//     { text: 'Eliminar', style: 'destructive', onPress: () => … },
//   ]);
//   toast('PIN guardado');
//
// `aviso` tiene la MISMA firma que `Alert.alert(título, mensaje, botones,
// opciones)`: así los 200+ avisos nativos (los "genéricos de Android") se
// cambiaron de forma mecánica, sin tocar qué hace cada botón. El desktop hace
// lo mismo con `alertaZenit`/`confirmarZenit`. `npm run revisar` prohíbe
// `Alert.alert` nuevo fuera de este archivo.
//
// Se dibuja en `<AvisosZenit />`, montado UNA vez en App.js. El aviso es un
// <Modal>: en Android cada Modal es una ventana aparte y la última que se abre
// queda encima, así que el aviso sale por encima de la hoja de cobro, de mesas,
// etc. (muchos avisos se lanzan con una de esas abierta). El toast NO es Modal
// (un Modal se come los toques mientras se ve): va sobre la navegación.
//
// Si el anfitrión no está montado (no debería pasar), cae al Alert nativo: un
// aviso feo es mejor que uno que no sale.
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import Icono from './Icono';
import { zc, radios, espacios, letra, sombra } from '../../theme';

let oyente = null;       // el anfitrión montado: recibe la cola nueva
let cola = [];           // avisos pendientes; se ve el primero
let siguienteId = 1;
let oyenteToast = null;

function avisar() { if (oyente) oyente(cola.slice()); }

/** Igual que Alert.alert(título, mensaje, botones, { cancelable, onDismiss }). */
export function aviso(titulo, mensaje, botones, opciones) {
  if (!oyente) {
    Alert.alert(titulo, mensaje, botones, opciones);
    return;
  }
  const lista = Array.isArray(botones) && botones.length ? botones : [{ text: 'Aceptar' }];
  cola.push({
    id: siguienteId++,
    titulo: titulo == null ? '' : String(titulo),
    mensaje: mensaje == null ? '' : String(mensaje),
    botones: lista,
    opciones: opciones || {},
  });
  avisar();
}

/** Confirmación que se va sola ("✓ PIN guardado"). tipo: 'ok' | 'error' */
export function toast(texto, { tipo = 'ok' } = {}) {
  if (oyenteToast) oyenteToast({ texto: String(texto), tipo, id: siguienteId++ });
}

/** Quita el aviso de la cola ANTES de correr su botón: si el botón abre otro aviso, ese sale después. */
function cerrar(id, accion) {
  if (!cola.length || cola[0].id !== id) return; // doble toque: ya se cerró
  cola = cola.slice(1);
  avisar();
  if (typeof accion === 'function') accion();
}

export function AvisosZenit() {
  const [pendientes, setPendientes] = useState([]);
  const [tostada, setTostada] = useState(null);
  const opacidad = useRef(new Animated.Value(0)).current;
  const reloj = useRef(null);

  useEffect(() => {
    oyente = setPendientes;
    oyenteToast = setTostada;
    if (cola.length) setPendientes(cola.slice());
    return () => {
      if (oyente === setPendientes) oyente = null;
      if (oyenteToast === setTostada) oyenteToast = null;
    };
  }, []);

  useEffect(() => {
    if (!tostada) return;
    clearTimeout(reloj.current);
    opacidad.setValue(0);
    Animated.timing(opacidad, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    reloj.current = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0, duration: 220, useNativeDriver: true })
        .start(() => setTostada((t) => (t && t.id === tostada.id ? null : t)));
    }, 2200);
    return () => clearTimeout(reloj.current);
  }, [tostada?.id]);

  const actual = pendientes[0];

  // Atrás de Android: como el nativo, solo cierra si se pidió `cancelable`; y
  // si hay un botón de cancelar, ese es el que se toca.
  function alVolver() {
    if (!actual) return;
    const cancelar = actual.botones.find((b) => b.style === 'cancel');
    if (cancelar) return cerrar(actual.id, cancelar.onPress);
    if (actual.botones.length === 1) return cerrar(actual.id, actual.botones[0].onPress);
    if (actual.opciones.cancelable) cerrar(actual.id, actual.opciones.onDismiss);
  }

  const enColumna = actual && (actual.botones.length > 2 ||
    actual.botones.some((b) => String(b.text || '').length > 14));

  return (
    <>
      <Modal visible={!!actual} transparent animationType="fade" onRequestClose={alVolver} statusBarTranslucent>
        <View style={s.velo}>
          {actual ? (
            <View style={s.caja}>
              {actual.titulo ? <Text style={s.titulo}>{actual.titulo}</Text> : null}
              {actual.mensaje ? (
                <ScrollView style={s.mensajeCaja} contentContainerStyle={{ flexGrow: 0 }}>
                  <Text style={s.mensaje}>{actual.mensaje}</Text>
                </ScrollView>
              ) : null}
              <View style={[s.botones, enColumna && s.botonesColumna]}>
                {actual.botones.map((b, i) => {
                  const st = b.style === 'destructive' ? 'peligro'
                    : b.style === 'cancel' ? 'cancelar'
                    : (actual.botones.length > 1 && i < actual.botones.length - 1 ? 'secundario' : 'principal');
                  return (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.8}
                      onPress={() => cerrar(actual.id, b.onPress)}
                      style={[s.boton, !enColumna && { flex: 1 }, s['b_' + st]]}
                    >
                      <Text style={[s.botonTxt, s['t_' + st]]} numberOfLines={2}>{b.text || 'Aceptar'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      {tostada ? (
        <Animated.View pointerEvents="none" style={[s.toastCapa, { opacity: opacidad }]}>
          <View style={[s.toast, tostada.tipo === 'error' && { backgroundColor: zc.rojo }]}>
            <Icono nombre={tostada.tipo === 'error' ? 'alerta' : 'palomita'} size={16} color="#fff" />
            <Text style={s.toastTxt} numberOfLines={2}>{tostada.texto}</Text>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', padding: 24 },
  caja: { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: espacios.dentro + 4, maxHeight: '85%' },
  titulo: { ...letra.titulo, color: zc.tinta, marginBottom: 6 },
  mensajeCaja: { flexGrow: 0 },
  mensaje: { ...letra.texto, color: zc.gris, lineHeight: 21 },
  botones: { flexDirection: 'row', gap: 8, marginTop: 18 },
  botonesColumna: { flexDirection: 'column-reverse' },
  boton: { borderRadius: radios.boton, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  botonTxt: { ...letra.seccion, textAlign: 'center' },
  b_principal: { backgroundColor: zc.azul },
  t_principal: { color: '#fff' },
  b_secundario: { backgroundColor: zc.azulSuave },
  t_secundario: { color: zc.azul },
  b_cancelar: { backgroundColor: zc.fondo },
  t_cancelar: { color: zc.tinta },
  b_peligro: { backgroundColor: zc.rojo },
  t_peligro: { color: '#fff' },

  toastCapa: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center', paddingHorizontal: 24 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 420,
    backgroundColor: zc.noche, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18, ...sombra,
  },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '500', flexShrink: 1 },
});
