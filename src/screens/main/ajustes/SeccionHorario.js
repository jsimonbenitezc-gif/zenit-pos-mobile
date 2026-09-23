import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, Pressable,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../api/client';
import { zc, radios, sombra } from '../../../theme';
import { Icono } from '../../../components/ui';
import { SectionTitle, SectionCard, MenuItem, SwitchRow } from './shared';
import { friendlyError } from '../../../utils/errors';
import {
  configHorario, normalizarHorario, resumenHorario, horarioPorDefecto,
  HORARIO_DIAS,
} from '../../../utils/horarios';
import {
  etiquetaHora, HORAS, minutosPara, partesHora, copiarHorario,
} from '../../../utils/horarioEditor';

/**
 * Horario del negocio (BLOQUE 14).
 *
 * ⚠️ ESTO NO CONFIGURA NINGÚN BLOQUEO. Definir un horario no impide vender,
 * cobrar ni abrir turno a ninguna hora — un POS que se niega a vender hace más
 * daño que el riesgo que evita. Lo que hace es marcar en la auditoría (y avisar
 * al dueño) las acciones SENSIBLES que ocurran fuera de él: cancelaciones,
 * devoluciones, descuentos, ajustes de inventario y movimientos de caja.
 *
 * La única acción que el horario restringe es aprobar una pantalla de cocina, y
 * tampoco la prohíbe: fuera de horario la sube al dueño.
 *
 * Es un ajuste de la CUENTA y lo decide el dueño (el backend responde 403 al
 * resto): que lo cambiara un empleado sería dejarle apagar la alarma que vigila
 * sus propias acciones. Por eso la sección solo se monta con `isOwner`.
 *
 * Las horas se ELIGEN tocando (hoja de horas y minutos), nunca con el teclado:
 * escribir "09:00" con los dos puntos era la parte pesada del editor viejo.
 */
export function SeccionHorario({ settings, onSaved, styles }) {
  const actual = configHorario(settings);

  const [modal, setModal]         = useState(false);
  const [semana, setSemana]       = useState(actual || horarioPorDefecto());
  const [guardando, setGuardando] = useState(false);
  // Qué hora se está eligiendo: { i, campo: 'abre'|'cierra' } o null.
  const [selector, setSelector]   = useState(null);
  // El último día que se tocó: debajo de él aparece "Copiar a los demás días".
  const [ultimo, setUltimo]       = useState(null);
  const [copiado, setCopiado]     = useState(null);

  const resumen = actual
    ? resumenHorario(actual)
    : 'Sin definir · no se marca ninguna acción';

  function abrir() {
    setSemana(actual ? JSON.parse(JSON.stringify(actual)) : horarioPorDefecto());
    setUltimo(null);
    setCopiado(null);
    setModal(true);
  }

  /** Interruptor de la tarjeta. Apagarlo quita el horario y con él las señales. */
  async function alternar(valor) {
    if (valor) { abrir(); return; }
    setGuardando(true);
    try {
      await api.updateSettings({ horario_operacion: null });
      await onSaved?.();
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  function cambiarDia(indice, campo, valor) {
    setSemana(prev => {
      const copia = prev.map(d => ({ ...d }));
      const dia = copia[indice];
      if (campo === 'cerrado') {
        // Marcar cerrado NO borra las horas: desmarcarlo las recupera tal cual,
        // que es lo que espera quien cierra un día por temporada.
        dia.cerrado = valor;
        if (!dia.abre)   dia.abre   = '09:00';
        if (!dia.cierra) dia.cierra = '18:00';
      } else {
        dia[campo] = valor;
      }
      return copia;
    });
    setCopiado(null);
    if (campo !== 'cerrado' || !valor) setUltimo(indice);
  }

  function copiarALosDemas(indice) {
    const r = copiarHorario(semana, indice);
    setSemana(r.semana);
    setUltimo(null);
    setCopiado(
      `Listo: ${etiquetaHora(semana[indice].abre)} a ${etiquetaHora(semana[indice].cierra)} en los demás días.` +
      (semana.some((d, i) => i !== indice && d.cerrado) ? ' Los días cerrados siguen cerrados.' : '')
    );
  }

  function elegirHora(valor) {
    if (!selector) return;
    cambiarDia(selector.i, selector.campo, valor);
  }

  async function guardar() {
    const r = normalizarHorario(semana);
    if (!r.ok) { Alert.alert('Horario inválido', r.error); return; }
    if (!r.horario) {
      // Los siete días cerrados no son un horario: es no tenerlo. Se dice en vez
      // de guardarlo en silencio, porque el dueño creería que configuró algo y
      // esperaría unas alertas que nunca van a llegar.
      Alert.alert(
        'Sin horario',
        'Marcaste los siete días como cerrados, así que no hay horario que aplicar. ' +
        'Deja abierto al menos un día, o apaga el horario del negocio.'
      );
      return;
    }

    setGuardando(true);
    try {
      await api.updateSettings({ horario_operacion: r.horario });
      await onSaved?.();
      setModal(false);
    } catch (e) {
      Alert.alert('No se pudo guardar', friendlyError(e));
    } finally {
      setGuardando(false);
    }
  }

  // Lunes primero: así piensa la semana un negocio. El índice guardado no cambia (0 = domingo).
  const ORDEN = [1, 2, 3, 4, 5, 6, 0];
  const horaEnSelector = selector ? semana[selector.i]?.[selector.campo] : null;

  return (
    <>
      <SectionTitle label="Horario del negocio" />
      <SectionCard>
        <SwitchRow
          label="Definir horario de operación"
          sub="Nunca bloquea la caja: sirve para detectar lo raro (una cancelación a las 3 a.m.)"
          value={!!actual}
          onChange={alternar}
        />
        <MenuItem label="Días y horas" sub={resumen} onPress={abrir} last />
      </SectionCard>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: zc.fondo }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Horario del negocio</Text>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Icono nombre="cerrar" size={24} color={zc.gris} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
            <View style={local.tarjeta}>
              {ORDEN.map((i, pos) => {
                const dia = semana[i];
                return (
                  <View key={i} style={[local.fila, pos > 0 && local.filaLinea]}>
                    <View style={local.filaArriba}>
                      <Text style={local.dia}>{HORARIO_DIAS[i][0].toUpperCase() + HORARIO_DIAS[i].slice(1)}</Text>
                      <TouchableOpacity
                        style={[local.estado, dia.cerrado ? local.estadoCerrado : local.estadoAbierto]}
                        onPress={() => cambiarDia(i, 'cerrado', !dia.cerrado)}
                      >
                        <Text style={[local.estadoTxt, { color: dia.cerrado ? zc.gris : zc.verde }]}>
                          {dia.cerrado ? 'Cerrado' : 'Abierto'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {!dia.cerrado && (
                      <View style={local.horas}>
                        <TouchableOpacity style={local.hora} onPress={() => setSelector({ i, campo: 'abre' })}>
                          <Text style={local.horaEtq}>Abre</Text>
                          <Text style={local.horaTxt}>{etiquetaHora(dia.abre)}</Text>
                        </TouchableOpacity>
                        <Icono nombre="derecha" size={16} color={zc.flecha} />
                        <TouchableOpacity style={local.hora} onPress={() => setSelector({ i, campo: 'cierra' })}>
                          <Text style={local.horaEtq}>Cierra</Text>
                          <Text style={local.horaTxt}>{etiquetaHora(dia.cierra)}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {ultimo === i && !dia.cerrado && (
                      <TouchableOpacity style={local.copiar} onPress={() => copiarALosDemas(i)}>
                        <Icono nombre="documento" size={15} color={zc.azul} />
                        <Text style={local.copiarTxt}>Copiar este horario a los demás días</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            {copiado ? <Text style={local.copiado}>{copiado}</Text> : null}

            <Text style={local.ayuda}>
              ¿Cierras después de medianoche? Pon la hora real de cierre (6 p.m. → 2 a.m.): la madrugada
              cuenta como parte del día anterior. Para abrir 24 horas, pon la misma hora en los dos.
            </Text>

            <View style={local.aviso}>
              <Text style={local.avisoTexto}>
                El horario <Text style={{ fontWeight: '700' }}>nunca bloquea la caja</Text>: se puede
                vender, cobrar y abrir turno a cualquier hora. Lo que hace es marcar en el historial
                —y avisarte— cuando una cancelación, una devolución, un descuento, un ajuste de
                inventario o un movimiento de caja ocurren fuera de él. Lo único que restringe es
                autorizar una pantalla de cocina: fuera de horario solo puedes hacerlo tú.
              </Text>
            </View>

            <TouchableOpacity
              style={[local.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
            >
              {guardando
                ? <ActivityIndicator color="#fff" />
                : <Text style={local.btnGuardarText}>Guardar horario</Text>}
            </TouchableOpacity>
          </ScrollView>

          {/* Hoja para elegir la hora: se toca la hora y luego los minutos. */}
          <Modal visible={!!selector} transparent animationType="fade" onRequestClose={() => setSelector(null)}>
            <Pressable style={local.velo} onPress={() => setSelector(null)}>
              <Pressable style={local.hoja} onPress={() => {}}>
                {selector && (() => {
                  const { h, m } = partesHora(horaEnSelector);
                  return (
                    <>
                      <Text style={local.hojaTitulo}>
                        {selector.campo === 'abre' ? 'Abre' : 'Cierra'} el {HORARIO_DIAS[selector.i]} · {etiquetaHora(horaEnSelector)}
                      </Text>
                      <Text style={local.hojaEtq}>Hora</Text>
                      <View style={local.rejilla}>
                        {HORAS.map(o => (
                          <TouchableOpacity
                            key={o.valor}
                            style={[local.celda, o.valor === h && local.celdaOn]}
                            onPress={() => elegirHora(`${o.valor}:${m}`)}
                          >
                            <Text style={[local.celdaTxt, o.valor === h && local.celdaTxtOn]}>{o.texto}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={local.hojaEtq}>Minutos</Text>
                      <View style={local.rejilla}>
                        {minutosPara(horaEnSelector).map(mm => (
                          <TouchableOpacity
                            key={mm}
                            style={[local.celda, local.celdaMin, mm === m && local.celdaOn]}
                            onPress={() => elegirHora(`${h}:${mm}`)}
                          >
                            <Text style={[local.celdaTxt, mm === m && local.celdaTxtOn]}>:{mm}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity style={local.listo} onPress={() => setSelector(null)}>
                        <Text style={local.listoTxt}>Listo</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </Pressable>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const local = {
  tarjeta: { backgroundColor: zc.tarjeta, borderRadius: radios.tarjeta, paddingHorizontal: 16, ...sombra },
  fila: { paddingVertical: 12 },
  filaLinea: { borderTopWidth: 1, borderTopColor: zc.linea },
  filaArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dia: { fontSize: 15, fontWeight: '500', color: zc.tinta },
  estado: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radios.chip },
  estadoAbierto: { backgroundColor: zc.verdeSuave },
  estadoCerrado: { backgroundColor: zc.fondo },
  estadoTxt: { fontSize: 13, fontWeight: '500' },
  horas: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  hora: { flex: 1, backgroundColor: zc.fondo, borderRadius: radios.boton, paddingVertical: 8, paddingHorizontal: 12 },
  horaEtq: { fontSize: 11, color: zc.gris },
  horaTxt: { fontSize: 16, fontWeight: '700', color: zc.tinta, marginTop: 1 },
  copiar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: zc.azulSuave, borderRadius: radios.chip, paddingHorizontal: 12, paddingVertical: 7 },
  copiarTxt: { fontSize: 13, color: zc.azul, fontWeight: '500' },
  copiado: { fontSize: 13, color: zc.verde, marginTop: 10, lineHeight: 18 },
  ayuda: { fontSize: 13, color: zc.gris, marginTop: 14, lineHeight: 19 },
  aviso: { marginTop: 12, padding: 14, borderRadius: radios.tarjeta, backgroundColor: zc.verdeSuave },
  avisoTexto: { fontSize: 13, color: zc.gris, lineHeight: 19 },
  btnGuardar: { backgroundColor: zc.azul, borderRadius: radios.boton, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  btnGuardarText: { color: '#fff', fontWeight: '500', fontSize: 15 },

  velo: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: zc.tarjeta, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  hojaTitulo: { fontSize: 17, fontWeight: '500', color: zc.tinta, marginBottom: 6 },
  hojaEtq: { fontSize: 12, color: zc.gris, marginTop: 10, marginBottom: 6 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  celda: { width: '23.5%', paddingVertical: 9, borderRadius: radios.boton, backgroundColor: zc.fondo, alignItems: 'center' },
  celdaMin: { width: '18.5%' },
  celdaOn: { backgroundColor: zc.noche },
  celdaTxt: { fontSize: 13.5, color: zc.tinta },
  celdaTxtOn: { color: '#fff', fontWeight: '500' },
  listo: { marginTop: 16, backgroundColor: zc.azul, borderRadius: radios.boton, paddingVertical: 13, alignItems: 'center' },
  listoTxt: { color: '#fff', fontSize: 15, fontWeight: '500' },
};
