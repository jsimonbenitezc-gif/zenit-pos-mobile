# PLAN — Soporte Offline en Mobile · FASE 1: Vender sin internet

> Documento de diseño + estado de implementación.
> Autor: sesión Claude · Fecha: 2026-07-14
> Estado: **FASE 1 IMPLEMENTADA** (código listo; pendiente `expo install` de versiones, build EAS y prueba en dispositivo)
>
> Archivos creados/modificados: `src/offline/db.js`, `src/offline/ventasOffline.js`,
> `src/context/NetworkContext.js`, `src/components/OfflineIndicator.js`, `App.js`,
> `src/screens/main/NuevaVentaScreen.js`, `package.json`, `app.json`.
>
> Desviación respecto al diseño: **online mantiene envío directo** (feedback inmediato;
> un error real del servidor se muestra), y solo se cae a la cola si la red falla al enviar
> o si ya estaba offline. Así no se enmascaran rechazos reales del backend. La "venta
> instantánea también online" queda como mejora futura.

---

## 1. Objetivo

Que un negocio que usa **la tablet (app mobile) como caja principal** pueda **seguir vendiendo aunque se caiga el internet**. Hoy mobile es solo-conectado: sin red, `api.createOrder` falla y la venta no se registra.

**Filosofía:** cero fricción. Un corte de internet **no debe detener la caja**. Igual que ya funciona en el desktop.

---

## 2. Alcance de la Fase 1 (qué SÍ y qué NO)

### ✅ SÍ entra en Fase 1
- **Vender offline**: armar carrito, cobrar y **registrar la venta localmente** aunque no haya red.
- **Catálogo disponible offline**: productos, precios, categorías (cacheados localmente mientras hay conexión).
- **Cola de ventas pendientes** + **sincronización automática** al reconectar.
- **Indicador visual** de estado (online / sin conexión / N ventas por subir).
- **Venta instantánea** (guardar local primero, sincronizar en segundo plano) — mismo patrón que el desktop.

### ❌ NO entra en Fase 1 (queda para fases posteriores)
- Inventario / recetas / insumos offline.
- Alta y edición de productos/clientes offline (solo **lectura cacheada** de clientes para elegirlos; crear cliente nuevo = requiere conexión).
- Turnos, estadísticas, ofertas/combos, sucursales offline.
- KDS offline.
- Mesas offline (el flujo de mesas mantiene su propia complejidad; ver §7).

> Regla: si una pantalla no es la de **venta**, offline puede seguir mostrando "requiere conexión" sin romper nada. El foco es **la caja**.

---

## 3. Principio clave: el backend YA es idempotente

`POST /api/orders` **deduplica por `client_uuid`** (índice único parcial + short-circuit; ver CLAUDE.md §7 y §19.13/§19.14). Esto es lo que hace **segura** la sincronización offline:

- Cada venta lleva un `client_uuid` (uuid v4) generado en el dispositivo.
- Si al reconectar se reintenta subir la misma venta (por timeout, doble envío, etc.), el backend **la reconoce y no la duplica** ni descuenta stock dos veces.

**No hay que tocar el backend en la Fase 1.** El desktop ya usa exactamente este mecanismo.

---

## 4. Dependencias nuevas (mobile)

| Paquete | Uso | Nota |
|---|---|---|
| `expo-sqlite` | BD local (catálogo cacheado + cola de ventas) | Espejo del `db.js` del desktop. Compatible con SDK 54. Requiere entrada en `app.json` plugins. |
| `@react-native-community/netinfo` | Detección de conectividad (evento online/offline) para el indicador y para disparar el sync al reconectar | `npx expo install @react-native-community/netinfo`. Requiere plugin. |
| `expo-crypto` | uuid v4 para `client_uuid` | **Ya está instalado.** Usar `Crypto.randomUUID()`. |

> ⚠️ Recordatorio EAS (CLAUDE.md §20): cada módulo nativo necesita entrada en `app.json → plugins`, correr `npx expo-doctor` antes del build, y **commit + push antes de `eas build`** (EAS construye desde git). `expo-sqlite` y `netinfo` son nativos → sin su plugin, crash "NativeModule not found".

---

## 5. Arquitectura

### 5.1 Detección de conectividad
Dos niveles (como el desktop):
1. **Estado para la UI** (`NetInfo`): bandera `online` en un contexto/estado global → pinta el indicador.
2. **Comportamiento real** (`try/catch`): la capa de datos **intenta** el backend; si falla la red, cae al camino local. No se confía ciegamente en la bandera (la red puede "estar" pero el backend no responder — cold start de Render, etc.).

### 5.2 Base de datos local (`expo-sqlite`)
Tablas mínimas de la Fase 1:

```
catalogo_categorias   (id, nombre, emoji, imagen, orden)
catalogo_productos     (id, categoria_id, nombre, precio, stock, emoji, imagen, activo)
catalogo_clientes      (id, nombre, telefono, en_fidelidad, puntos)   -- solo lectura para elegir
ventas_pendientes      (client_uuid PK, payload_json, estado, creada_en, intentos, ultimo_error)
```

- `catalogo_*`: **caché** que se refresca cada vez que hay conexión (al abrir la app y al reconectar). Permite armar ventas offline.
- `ventas_pendientes`: la **cola**. `payload_json` es exactamente el `orderBody` que se manda a `POST /api/orders` (con su `client_uuid`). `estado` ∈ `pendiente | subida | error`.

### 5.3 Capa de datos (espejo de `modulo-wrappers.js` del desktop)
Un módulo nuevo `src/offline/ventasOffline.js` (o similar) con el patrón:

```
crearVenta(orderBody):
    orderBody.client_uuid = Crypto.randomUUID()
    guardarEnColaLocal(orderBody, estado='pendiente')   // ← venta cerrada AL INSTANTE
    dispararSyncEnSegundoPlano()                          // no bloquea la UI
    return ok
```

Y para el catálogo:

```
obtenerCatalogo():
    try:  data = api.getProductsGrouped(); guardarCacheLocal(data); return data
    catch (sin red): return leerCacheLocal()
```

> **Venta instantánea**: guardar local y cerrar la venta sin esperar al backend, esté online u offline. Online, el sync corre enseguida; offline, queda en cola. Igual que el desktop (`crearPedidoWrapper`).

### 5.4 Motor de sincronización (espejo de `subirPedidosPendientes`)
```
sincronizarVentasPendientes():
    if (!online) return
    for venta in ventas_pendientes where estado='pendiente':
        try:
            api.createOrder(venta.payload_json)   // backend deduplica por client_uuid
            marcar estado='subida'
        catch (red):   dejar 'pendiente', reintentar luego
        catch (4xx que NO sea de red):  marcar 'error' + guardar ultimo_error (revisar manual)
```

Disparadores del sync:
- Al **reconectar** (evento de `NetInfo`).
- Al **abrir la app** (si hay pendientes).
- Tras **crear una venta** estando online (subida inmediata).
- Reintento periódico ligero mientras haya pendientes (p. ej. cada 30–60 s).

### 5.5 Sesión y plan offline
- La app debe **arrancar y operar sin poder refrescar el token** (red caída). Hoy mobile ya no borra la sesión ante fallos de red (solo ante 401/403 explícito del refresh — ver CLAUDE.md §19.17). ✔️ Reusar eso.
- El **plan premium** no afecta la **venta básica** (venta está en el plan free), así que para la Fase 1 no necesitamos plan offline. La venta funciona sin premium.

---

## 6. Cambios concretos por archivo (mobile)

| Archivo | Cambio |
|---|---|
| `app.json` | Agregar plugins de `expo-sqlite` y `netinfo`. |
| `src/offline/db.js` (NUEVO) | Init de `expo-sqlite`, creación de tablas, helpers CRUD de caché y cola. |
| `src/offline/ventasOffline.js` (NUEVO) | `crearVenta`, `sincronizarVentasPendientes`, cache de catálogo, disparadores. |
| `src/context/NetworkContext.js` (NUEVO) | Estado `online` global vía `NetInfo` + conteo de pendientes. |
| `src/api/client.js` | Sin cambios de contrato; se sigue usando `createOrder`/`getProductsGrouped`. (El fallback vive en la capa offline, no en el cliente.) |
| `src/screens/main/NuevaVentaScreen.js` | (1) cargar catálogo vía `obtenerCatalogo()` (con fallback caché); (2) sustituir `await api.createOrder(orderBody)` por `crearVenta(orderBody)` (guardar local + sync bg); (3) no bloquear la venta si no hay red. |
| Header / Dashboard | Indicador "Sin conexión · N ventas por subir". |
| `App.js` | Montar `NetworkProvider` + init de la BD local al arranque. |

---

## 7. Casos borde y decisiones (para revisar juntos)

1. **Stock offline**: sin red no podemos validar stock contra el servidor. Propuesta: **permitir la venta igual** (no bloquear la caja) y dejar que el backend recalcule stock al sincronizar. El stock mostrado offline es el del último caché (informativo). *Igual que el desktop, que descuenta stock local y reconcilia al subir.*
2. **Descuentos con PIN offline**: hoy el backend confía en `discount_amount` del cliente y NO re-valida el PIN para ventas del desktop (deuda conocida, CLAUDE.md §19.15). En mobile offline seguiríamos el mismo criterio: validación de PIN **local** (si se implementa) y el monto viaja en el payload. Decidir si en Fase 1 permitimos descuentos offline o los diferimos.
3. **Puntos de fidelidad offline**: se procesan en la **transacción del backend**. Offline no podemos garantizar saldo de puntos. Propuesta Fase 1: **deshabilitar ganar/canjear puntos cuando no hay red** (la venta se registra sin puntos), o encolar y dejar que el backend los procese al subir (más riesgo de saldo inconsistente). Recomiendo **deshabilitar offline** por simplicidad y consistencia.
4. **Clientes**: elegir un cliente ya existente offline = OK (lista cacheada). **Crear** cliente nuevo offline = fuera de Fase 1 (permitir venta anónima o con info temporal).
5. **Mesas**: el flujo de mesas (pedidos abiertos, transferencias) es más complejo y estado-ful. **Fuera de Fase 1**: offline solo cubrimos venta directa (mostrador / para llevar / domicilio simple). Mesas queda "requiere conexión".
6. **Multi-dispositivo**: si dos dispositivos venden offline en paralelo, cada uno tiene su cola; al reconectar ambos suben con `client_uuid` distintos → sin colisión. Los folios/IDs definitivos los asigna el backend. ✔️
7. **Sucursal**: la venta offline lleva el `branch_id` cacheado del dispositivo. ✔️
8. **Errores no-de-red al subir** (ej. producto borrado en el servidor): marcar la venta como `error` y avisar al usuario para revisión manual, sin perder el registro local.

---

## 8. Plan de trabajo (orden sugerido)

1. **Infra local**: instalar `expo-sqlite` + `netinfo`, plugins en `app.json`, `src/offline/db.js` con tablas y helpers. Verificar en APK (expo-doctor + build) que los módulos nativos linkean.
2. **NetworkContext**: bandera `online` + conteo de pendientes + indicador en el header.
3. **Caché de catálogo**: `obtenerCatalogo()` con refresco online → SQLite y fallback offline. Conectar `NuevaVentaScreen` para leer de ahí.
4. **Cola de ventas + venta instantánea**: `crearVenta()` guardando local; cambiar el submit de `NuevaVentaScreen`.
5. **Motor de sync**: `sincronizarVentasPendientes()` + disparadores (reconexión, arranque, post-venta, reintento periódico).
6. **Casos borde**: aplicar decisiones de §7 (stock, puntos, descuentos, clientes).
7. **Pruebas** (§9).
8. **Build EAS** de prueba (`preview`) y validación en dispositivo real con avión activado.

Estimación gruesa: es un proyecto **mediano** (varios días de trabajo enfocado), pero acotado y de bajo riesgo porque el backend ya es idempotente y el desktop es el plano.

---

## 9. Pruebas / verificación

- **Venta offline**: modo avión → vender → la venta se cierra al instante y aparece en cola.
- **Sync al reconectar**: quitar avión → la venta sube sola; verificar en el backend que aparece **una sola vez** (idempotencia).
- **Doble intento**: forzar reintento → no se duplica.
- **Catálogo offline**: abrir con red (cachea), cerrar, modo avión, reabrir → productos y precios disponibles.
- **App reiniciada con pendientes**: cerrar app con ventas en cola → reabrir → suben.
- **Multi-dispositivo**: dos dispositivos venden offline → reconectan → ambas ventas presentes, sin colisión.
- **Sin regresiones online**: con red, la venta funciona igual que hoy.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Módulo nativo (sqlite/netinfo) no linkea en APK | expo-doctor + build de prueba temprano (paso 1); nunca probar solo en Expo Go |
| Inconsistencia de stock/puntos offline | No bloquear venta por stock; deshabilitar puntos offline; reconciliar en backend |
| Ventas atascadas en `error` | Estado visible + aviso al usuario; no se pierden, se revisan |
| Complejidad creciente (scope creep) | Mantener el foco SOLO en vender; el resto sigue "requiere conexión" |

---

## 11. Fases futuras (fuera de este documento)
- Fase 2: inventario/insumos offline (lectura + movimientos encolados).
- Fase 3: clientes (alta offline), turnos offline.
- Fase 4: mesas offline, ofertas/combos, estadísticas locales.

Cada una repite el mismo patrón (caché + cola + sync idempotente) sobre su dominio.
