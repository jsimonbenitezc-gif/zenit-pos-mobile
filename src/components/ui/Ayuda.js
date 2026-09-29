// ─── AYUDA (?) (PLAN_AYUDA_V1, IDEA 10) ───────────────────────────────────────
//
//   <Ayuda id="preparaciones" />            junto a un título claro
//   <Ayuda id="turno" enNoche />            sobre la cabecera azul noche
//
// Un circulito gris; al tocarlo sale una burbuja con 2–3 líneas. Los textos
// viven en `src/ayuda/textos.js` (copiado en el desktop, `smoke:ayuda`).
//
// La burbuja es un <Modal> centrado: así nunca queda debajo de la barra
// flotante de abajo (§69) ni del teclado (se esconde al abrirla), y sale encima
// aunque el (?) esté dentro de otra hoja (Nueva preparación). Se cierra tocando
// en cualquier lado o con Atrás. Nunca se abre sola.
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, Keyboard, StyleSheet } from 'react-native';
import { TEXTOS_AYUDA } from '../../ayuda/textos';
import { zc, radios, espacios, letra, sombra } from '../../theme';

/** '**así**' → negritas. */
function ConNegritas({ children, style }) {
  const partes = String(children || '').split(/\*\*(.+?)\*\*/g);
  return (
    <Text style={style}>
      {partes.map((p, i) => (i % 2 ? <Text key={i} style={s.negrita}>{p}</Text> : p))}
    </Text>
  );
}

export default function Ayuda({ id, enNoche, style }) {
  const [abierta, setAbierta] = useState(false);
  const t = TEXTOS_AYUDA[id];
  if (!t) return null; // una llave mal escrita no rompe la pantalla (smoke:ayuda la caza)

  const color = enNoche ? zc.enNocheGris : zc.grisSuave;
  return (
    <>
      <TouchableOpacity
        onPress={() => { Keyboard.dismiss(); setAbierta(true); }}
        hitSlop={10}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={'Ayuda: ' + t.titulo}
        style={[s.circulo, { borderColor: color }, style]}
      >
        <Text style={[s.signo, { color }]}>?</Text>
      </TouchableOpacity>
      <Modal visible={abierta} transparent animationType="fade" onRequestClose={() => setAbierta(false)} statusBarTranslucent>
        <Pressable style={s.velo} onPress={() => setAbierta(false)} accessibilityLabel="Cerrar ayuda">
          <View style={s.burbuja}>
            <View style={s.cabeza}>
              <View style={[s.circulo, s.circuloGrande]}>
                <Text style={[s.signo, { color: zc.azul, fontSize: 13 }]}>?</Text>
              </View>
              <Text style={s.titulo} numberOfLines={2}>{t.titulo}</Text>
            </View>
            <ConNegritas style={s.texto}>{t.texto}</ConNegritas>
            {t.ejemplo ? <ConNegritas style={s.ejemplo}>{t.ejemplo}</ConNegritas> : null}
            <Text style={s.pista}>Toca para cerrar</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  circulo: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  signo: { fontSize: 11, fontWeight: '700', lineHeight: 13, includeFontPadding: false },
  velo: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  burbuja: {
    backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, padding: espacios.dentro + 2,
    width: '100%', maxWidth: 380, ...sombra,
  },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  circuloGrande: { width: 22, height: 22, borderRadius: 11, borderColor: zc.azul },
  titulo: { ...letra.seccion, color: zc.tinta, flex: 1 },
  texto: { ...letra.texto, color: zc.tinta, lineHeight: 21 },
  ejemplo: { ...letra.texto, color: zc.gris, lineHeight: 21, marginTop: 8 },
  negrita: { fontWeight: '700' },
  pista: { fontSize: 11.5, color: zc.grisSuave, marginTop: 12, textAlign: 'right' },
});
