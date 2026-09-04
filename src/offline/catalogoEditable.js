// ============================================================================
// src/offline/catalogoEditable.js — dar de alta el menú, con cuenta o sin ella.
//
// La pantalla de Productos hace lo mismo en los dos modos: crear, editar y
// borrar productos y categorías. Lo único que cambia es DÓNDE se guardan, y esa
// decisión vive aquí y no repartida por la pantalla — el mismo criterio que
// `ventasOffline.js` usa para la venta.
//
// Con cuenta: el backend, igual que siempre.
// Sin cuenta (BLOQUE 18): las tablas `local_*` del propio aparato.
// ============================================================================
import { api } from '../api/client';
import {
  esModoLocal,
  listarProductosLocales, listarCategoriasLocales,
  guardarProductoLocal, borrarProductoLocal, obtenerProductoLocal,
  guardarCategoriaLocal, borrarCategoriaLocal, obtenerCategoriaLocal,
} from './local';

/** Todo el catálogo editable: { productos, categorias }. */
export async function cargarCatalogoEditable() {
  if (await esModoLocal()) {
    const [productos, categorias] = await Promise.all([
      listarProductosLocales(), listarCategoriasLocales(),
    ]);
    return { productos, categorias };
  }
  const [productos, categorias] = await Promise.all([api.getProducts(), api.getCategories()]);
  return { productos, categorias };
}

export async function crearProducto(body) {
  if (await esModoLocal()) {
    const id = await guardarProductoLocal(body);
    return await obtenerProductoLocal(id);
  }
  return await api.createProduct(body);
}

export async function actualizarProducto(id, body) {
  if (await esModoLocal()) {
    await guardarProductoLocal({ ...body, id });
    return await obtenerProductoLocal(id);
  }
  return await api.updateProduct(id, body);
}

export async function borrarProducto(id) {
  if (await esModoLocal()) return await borrarProductoLocal(id);
  return await api.deleteProduct(id);
}

export async function crearCategoria(body) {
  if (await esModoLocal()) {
    const id = await guardarCategoriaLocal(body);
    return await obtenerCategoriaLocal(id);
  }
  return await api.createCategory(body);
}

export async function actualizarCategoria(id, body) {
  if (await esModoLocal()) {
    await guardarCategoriaLocal({ ...body, id });
    return await obtenerCategoriaLocal(id);
  }
  return await api.updateCategory(id, body);
}

export async function borrarCategoria(id) {
  if (await esModoLocal()) return await borrarCategoriaLocal(id);
  return await api.deleteCategory(id);
}

/**
 * Engancha grupos de modificadores a un producto. En modo local NO hace nada: la
 * biblioteca de modificadores se configura con cuenta (§32), y la pantalla ni
 * siquiera ofrece esa sección. Se devuelve sin error en vez de lanzar, para que
 * el guardado del producto no dependa de una función que aquí no aplica.
 */
export async function fijarModificadoresDeProducto(id, grupos) {
  if (await esModoLocal()) return;
  return await api.setProductModifiers(id, grupos);
}
