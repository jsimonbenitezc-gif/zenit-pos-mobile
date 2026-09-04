// ============================================================================
// src/offline/respaldo.js — sacar el negocio local del teléfono.
//
// POR QUÉ ES OBLIGATORIO: un negocio sin cuenta está a un teléfono roto de
// perderlo todo, y no hay copia en ninguna parte. "Es riesgo del usuario" es
// cierto y no protege de nada: la reseña de una estrella no dice "fue mi culpa",
// dice "Zenit me borró seis meses de ventas". Un aviso SIN un botón que haga
// algo es solo angustia; con botón es una función.
//
// ⚠️ Este archivo es el que arma el formato del respaldo, y **es el MISMO que
// usará la Etapa 3** para subir el negocio a una cuenta nueva. Se escribe una
// vez y sirve para las dos cosas. Si cambias la forma del archivo, súbele la
// `version`: el importador tendrá que saber qué está leyendo.
// ============================================================================
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  listarProductosLocales, listarCategoriasLocales, listarClientesLocales,
  listarPedidosLocales, historialTurnosLocales, leerAjustesLocales,
} from './local';

export const VERSION_RESPALDO = 1;

/**
 * Arma el respaldo completo del negocio local.
 *
 * Cada fila viaja con su `uuid`: es lo único que sobrevive al viaje a una cuenta
 * (BLOQUE 18, trampa 1). Sin él, al migrar habría que volver a teclear el menú.
 */
export async function armarRespaldo() {
  const [ajustes, categorias, productos, clientes, pedidos, turnos] = await Promise.all([
    leerAjustesLocales(),
    listarCategoriasLocales(),
    listarProductosLocales(),
    listarClientesLocales(),
    listarPedidosLocales(100000),   // todo el historial: es un respaldo, no una vista
    historialTurnosLocales(100000),
  ]);
  return {
    zenit_respaldo: VERSION_RESPALDO,
    generado_en: new Date().toISOString(),
    negocio: ajustes?.business_name || 'Mi negocio',
    ajustes,
    categorias,
    productos,
    clientes,
    pedidos,
    turnos,
    resumen: {
      productos: productos.length,
      clientes: clientes.length,
      ventas: pedidos.length,
      turnos: turnos.length,
      total_vendido: pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0),
    },
  };
}

function _nombreArchivo(negocio) {
  const limpio = String(negocio || 'zenit')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sin acentos: el nombre viaja por WhatsApp
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'zenit';
  const f = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `zenit-${limpio}-${f.getFullYear()}${dos(f.getMonth() + 1)}${dos(f.getDate())}.json`;
}

/**
 * Genera el archivo y abre el menú de compartir de Android para que el usuario
 * lo mande a su WhatsApp, su Drive o donde quiera.
 *
 * @returns {Promise<{ ok: boolean, motivo?: string, resumen?: object }>}
 *   NO lanza: un fallo al respaldar no puede tumbar la pantalla desde la que se
 *   pidió, y el usuario siempre puede reintentar.
 */
export async function exportarRespaldo() {
  try {
    const datos = await armarRespaldo();
    const archivo = new File(Paths.cache, _nombreArchivo(datos.negocio));
    // Se sobrescribe el del día: un respaldo por día basta y evita llenar la
    // caché del teléfono con copias casi idénticas.
    archivo.create({ overwrite: true });
    archivo.write(JSON.stringify(datos, null, 2));

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, motivo: 'sin_compartir', resumen: datos.resumen };
    }
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Guardar el respaldo de tu negocio',
      UTI: 'public.json',
    });
    return { ok: true, resumen: datos.resumen };
  } catch (e) {
    console.warn('[respaldo] exportarRespaldo:', e?.message);
    return { ok: false, motivo: 'error', error: e?.message };
  }
}
