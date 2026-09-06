// ============================================================================
// ModalMigrar — "Crear cuenta y llevarme todo" (BLOQUE 18, Etapa 3)
//
// Es la pantalla más delicada del modo local, y no por el código: aquí alguien
// se juega meses de su trabajo. Tres cosas que no se negocian:
//
//   1. **Se dice ANTES qué se va a subir**, con números suyos. Nadie toca un
//      botón que dice "llevarme todo" sin saber cuánto es eso.
//   2. **Se dice que NO se borra nada.** Es verdad —lo local queda intacto— y es
//      lo que quita el miedo a intentarlo.
//   3. **Si algo falla, se dice qué falló y se ofrece reintentar.** La cuenta ya
//      existe y lo subido no se repite (`local_migracion`), así que reintentar
//      es seguro. Un "hubo un error" sin salida es lo que hace que alguien
//      desinstale la app.
//
// ⚠️ Mientras sube NO se puede cerrar (`onRequestClose` bloqueado y sin botón de
// salir): cerrar a la mitad no rompe nada —se puede reanudar— pero deja a la
// persona sin saber en qué estado quedó, que es peor que esperar.
// ============================================================================
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../../theme';
import { friendlyError } from '../../../utils/errors';

const ETAPAS = {
  ajustes: 'Configuración del negocio',
  categorias: 'Categorías',
  productos: 'Productos',
  clientes: 'Clientes',
  ventas: 'Historial de ventas',
};

export default function ModalMigrar({ visible, resumen, onCerrar, crearCuentaYMigrar }) {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [paso, setPaso] = useState(null);
  const [error, setError] = useState('');
  const [reporte, setReporte] = useState(null);

  const dinero = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function cerrar() {
    if (subiendo) return;
    setError('');
    setPaso(null);
    setReporte(null);
    onCerrar();
  }

  async function migrar() {
    setError('');
    if (!nombre.trim()) return setError('Escribe el nombre de tu negocio.');
    if (!correo.trim() || !correo.includes('@')) return setError('Escribe un correo válido.');
    if (contrasena.length < 6) return setError('La contraseña necesita al menos 6 caracteres.');

    setSubiendo(true);
    setReporte(null);
    try {
      const r = await crearCuentaYMigrar(nombre.trim(), correo.trim(), contrasena, setPaso);
      setReporte(r);
    } catch (e) {
      // Un fallo del REGISTRO (correo repetido, sin red): no se creó la cuenta y
      // no se tocó nada. Se corrige y se vuelve a intentar aquí mismo.
      setError(friendlyError(e));
    } finally {
      setSubiendo(false);
      setPaso(null);
    }
  }

  // ── Lo que se ve mientras sube ────────────────────────────────────────────
  const progreso = paso && paso.total
    ? `${ETAPAS[paso.etapa] || paso.etapa} — ${paso.hechos} de ${paso.total}`
    : 'Creando tu cuenta…';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={s.header}>
          <Text style={s.titulo}>Crear cuenta y llevarme todo</Text>
          {!subiendo && (
            <TouchableOpacity onPress={cerrar} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={s.cuerpo}>
          {/* ── YA TERMINÓ ───────────────────────────────────────────────── */}
          {reporte ? (
            <View>
              <View style={[s.caja, reporte.ok ? s.cajaOk : s.cajaAviso]}>
                <Ionicons
                  name={reporte.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={34}
                  color={reporte.ok ? colors.success || '#16a34a' : '#f59e0b'}
                />
                <Text style={s.cajaTitulo}>
                  {reporte.ok ? '¡Listo! Tu negocio ya está en tu cuenta' : 'Se subió casi todo'}
                </Text>
                <Text style={s.cajaTexto}>
                  {`Se subieron ${reporte.subido.productos} productos, ` +
                   `${reporte.subido.clientes} clientes y ${reporte.subido.ventas} ventas.`}
                </Text>
                {/* Lo que quita el miedo, y es verdad. */}
                <Text style={s.cajaTexto}>
                  Tu negocio sigue guardado en este teléfono tal como estaba. No se borró nada.
                </Text>
              </View>

              {!reporte.ok && (
                <View style={s.fallos}>
                  <Text style={s.fallosTitulo}>Esto no subió:</Text>
                  {reporte.fallos.slice(0, 8).map((f, i) => (
                    <Text key={i} style={s.falloItem}>· {f.nombre} — {f.error}</Text>
                  ))}
                  {reporte.fallos.length > 8 && (
                    <Text style={s.falloItem}>…y {reporte.fallos.length - 8} más</Text>
                  )}
                  <Text style={s.fallosNota}>
                    Puedes reintentar: lo que ya subió no se vuelve a subir, así que no se duplica nada.
                  </Text>
                  <TouchableOpacity style={s.btnSecundario} onPress={migrar} disabled={subiendo}>
                    <Text style={s.btnSecundarioText}>Reintentar lo que faltó</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={s.btnPrimario} onPress={cerrar}>
                <Text style={s.btnPrimarioText}>Entendido</Text>
              </TouchableOpacity>
            </View>

          /* ── SUBIENDO ─────────────────────────────────────────────────── */
          ) : subiendo ? (
            <View style={s.centro}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={s.progreso}>{progreso}</Text>
              <Text style={s.progresoNota}>
                No cierres la app. Si se corta, puedes retomarlo desde donde se quedó.
              </Text>
            </View>

          /* ── EL FORMULARIO ────────────────────────────────────────────── */
          ) : (
            <View>
              {!!resumen && (
                <View style={s.caja}>
                  <Text style={s.cajaTitulo}>Se sube esto</Text>
                  <Text style={s.cajaLinea}>{resumen.productos} productos en {resumen.categorias} categorías</Text>
                  <Text style={s.cajaLinea}>{resumen.clientes} clientes</Text>
                  <Text style={s.cajaLinea}>
                    {resumen.ventas} ventas · {dinero(resumen.totalVendido)} en total
                  </Text>
                  <Text style={s.cajaTexto}>
                    Tus ventas se suben con su fecha y su precio reales, así que tu historial se ve igual.
                  </Text>
                  {/* Se dice lo que NO viaja. Descubrirlo después sería peor. */}
                  <Text style={s.cajaTexto}>
                    Los cortes de caja se quedan solo en este teléfono: en tu cuenta el historial
                    empieza de nuevo, con las ventas ya dentro.
                  </Text>
                </View>
              )}

              <Text style={s.label}>Nombre de tu negocio</Text>
              <TextInput
                style={s.input} value={nombre} onChangeText={setNombre}
                placeholder="Taquería El Zenit" placeholderTextColor={colors.textMuted}
              />
              <Text style={s.label}>Tu correo</Text>
              <TextInput
                style={s.input} value={correo} onChangeText={setCorreo}
                placeholder="tucorreo@ejemplo.com" placeholderTextColor={colors.textMuted}
                autoCapitalize="none" keyboardType="email-address"
              />
              <Text style={s.label}>Contraseña</Text>
              <TextInput
                style={s.input} value={contrasena} onChangeText={setContrasena}
                placeholder="Al menos 6 caracteres" placeholderTextColor={colors.textMuted}
                secureTextEntry
              />

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity style={s.btnPrimario} onPress={migrar}>
                <Text style={s.btnPrimarioText}>Crear cuenta y subir mi negocio</Text>
              </TouchableOpacity>
              <Text style={s.nota}>
                Nada se borra de este teléfono. Si algo sale mal, tu negocio sigue aquí igual que ahora.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  titulo: { fontSize: font.lg, fontWeight: '700', color: colors.text, flex: 1 },
  cuerpo: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  caja: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, alignItems: 'flex-start',
  },
  cajaOk: { borderColor: '#16a34a', alignItems: 'center' },
  cajaAviso: { borderColor: '#f59e0b', alignItems: 'center' },
  cajaTitulo: { fontSize: font.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.xs },
  cajaLinea: { fontSize: font.md, color: colors.text, marginBottom: 2 },
  cajaTexto: { fontSize: font.sm, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 },

  label: { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: font.md, color: colors.text,
  },
  error: { color: colors.danger || '#dc2626', marginTop: spacing.md, fontSize: font.sm },
  nota: { fontSize: font.sm, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center', lineHeight: 19 },

  centro: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  progreso: { fontSize: font.md, color: colors.text, marginTop: spacing.lg, fontWeight: '600' },
  progresoNota: { fontSize: font.sm, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },

  fallos: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: '#f59e0b', marginBottom: spacing.lg,
  },
  fallosTitulo: { fontSize: font.md, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  falloItem: { fontSize: font.sm, color: colors.textMuted, marginBottom: 2 },
  fallosNota: { fontSize: font.sm, color: colors.textMuted, marginTop: spacing.md, lineHeight: 19 },

  btnPrimario: {
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  btnPrimarioText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  btnSecundario: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.md,
  },
  btnSecundarioText: { color: colors.primary, fontSize: font.md, fontWeight: '600' },
});
