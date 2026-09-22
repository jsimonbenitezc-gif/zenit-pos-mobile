// ============================================================================
// utils/promos.js — LA PROMO ES UN PRODUCTO (PLAN_OFERTAS_V1, Bloque 3)
//
// "Martes 2x1 en tacos": la cajera toca la promo, elige dos tacos y entra al
// carrito como UN renglón. En el servidor se guarda un OrderItem por taco, con
// su parte del precio (§3.1 del plan): cocina, inventario, rentabilidad,
// impuesto y corte de caja ven productos normales.
//
// 🔴 LA PARTE 1 (hasta "FIN DE LA PARTE 1") ES LA TERCERA COPIA de
// `utils/ventanas.js` y de la PARTE 1 de `utils/promos.js` del backend (la
// segunda vive en `pos/modulo-promos.js` del desktop). Una venta de la cola
// offline sube como DIFERIDA y el servidor respeta el precio que se cobró aquí:
// si esta copia se desvía un centavo, el ticket dice un número y el servidor
// reparte otro. Si cambias una, cambia las tres:
// `npm run smoke:promos-gemelas` carga las tres y compara miles de casos.
//
// La PARTE 2 es solo del celular: el carrito, la cola offline, la mesa, el
// ticket y la pantalla. No calcula dinero por su cuenta: todo pasa por la
// PARTE 1.
// ============================================================================
import { deltaDeModificadores, claveCarrito } from './modificadores';

// ── utils/ventanas.js ──

export const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'HH:MM' → minutos desde medianoche. null si no tiene ese formato. */
export function minutosDeHora(texto) {
    const m = RE_HORA.exec(String(texto || '').trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * ¿Qué ventana está viva en el día `dow` al minuto `minutos`?
 * Devuelve 'hoy' (la ventana del propio día), 'ayer' (la de ayer, que cruzó la
 * medianoche y aún no cierra) o null. Saber CUÁL importa: la promo del viernes
 * de 22:00 a 02:00 que se evalúa el sábado a la 1:30 es la del VIERNES, y es la
 * fecha del viernes la que cuenta para "entre fechas".
 */
export function ventanaViva(semana, dow, minutos) {
    if (!Array.isArray(semana) || semana.length !== 7) return null;

    const hoy = semana[dow];
    if (hoy && !hoy.cerrado) {
        const abre = minutosDeHora(hoy.abre);
        const cierra = minutosDeHora(hoy.cierra);
        if (abre !== null && cierra !== null) {
            if (abre === cierra) return 'hoy';                              // 24 h
            if (cierra > abre) { if (minutos >= abre && minutos < cierra) return 'hoy'; }
            else if (minutos >= abre) return 'hoy';                        // cruza: la parte de hoy
        }
    }

    const ayer = semana[(dow + 6) % 7];
    if (ayer && !ayer.cerrado) {
        const abre = minutosDeHora(ayer.abre);
        const cierra = minutosDeHora(ayer.cierra);
        if (abre !== null && cierra !== null && cierra < abre && minutos < cierra) return 'ayer';
    }

    return null;
}

// ── utils/promos.js, PARTE 1 ──

export const TIPOS = ['precio_fijo', 'regalar_mas_barato'];
const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Una promo de más de 20 productos no es una promo, es un error de captura.
export const MAX_PRODUCTOS_PROMO = 20;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _centavos = (n) => Math.round((Number(n) || 0) * 100);

// ── El calendario ────────────────────────────────────────────────────────────
//
//   null                                  → siempre
//   { dias: [2],                          → 0 = domingo … 6 = sábado
//     desde: '18:00', hasta: '20:00',     → opcional; si hasta < desde, cruza la medianoche
//     fecha_inicio: '2026-10-01',         → opcional, fechas LOCALES del negocio
//     fecha_fin: '2026-10-31' }             (la fecha fin cuenta entera)

/**
 * Valida lo que llega del dueño. `{ ok, calendario }` (null = siempre) o
 * `{ ok: false, error }`. Un calendario basura se RECHAZA: caer a "siempre" en
 * silencio dejaría el 2x1 del martes cobrándose el miércoles.
 */
export function normalizarCalendario(valor) {
    if (valor === null || valor === undefined || valor === '') return { ok: true, calendario: null };
    let c = valor;
    if (typeof c === 'string') {
        try { c = JSON.parse(c); } catch { return { ok: false, error: 'El calendario no tiene un formato válido' }; }
    }
    if (c === null) return { ok: true, calendario: null };
    if (typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'El calendario no tiene un formato válido' };

    const out = {};
    if (c.dias !== undefined && c.dias !== null) {
        if (!Array.isArray(c.dias) || c.dias.length === 0) {
            return { ok: false, error: 'Elige al menos un día de la semana' };
        }
        const dias = [];
        for (const d of c.dias) {
            const n = Number(d);
            if (!Number.isInteger(n) || n < 0 || n > 6) return { ok: false, error: 'Los días van de 0 (domingo) a 6 (sábado)' };
            if (!dias.includes(n)) dias.push(n);
        }
        // Los siete días es lo mismo que no filtrar por día.
        if (dias.length < 7) out.dias = dias.sort((a, b) => a - b);
    }

    const tieneDesde = c.desde !== undefined && c.desde !== null && c.desde !== '';
    const tieneHasta = c.hasta !== undefined && c.hasta !== null && c.hasta !== '';
    if (tieneDesde !== tieneHasta) return { ok: false, error: 'El horario necesita hora de inicio y de fin' };
    if (tieneDesde) {
        if (minutosDeHora(c.desde) === null || minutosDeHora(c.hasta) === null) {
            return { ok: false, error: 'Las horas van en formato HH:MM (por ejemplo 18:00)' };
        }
        out.desde = String(c.desde).trim();
        out.hasta = String(c.hasta).trim();
    }

    for (const k of ['fecha_inicio', 'fecha_fin']) {
        if (c[k] === undefined || c[k] === null || c[k] === '') continue;
        const f = String(c[k]).trim().slice(0, 10);
        if (!RE_FECHA.test(f)) return { ok: false, error: 'Las fechas van en formato AAAA-MM-DD' };
        out[k] = f;
    }
    if (out.fecha_inicio && out.fecha_fin && out.fecha_inicio > out.fecha_fin) {
        return { ok: false, error: 'La fecha de inicio es posterior a la de fin' };
    }

    return { ok: true, calendario: Object.keys(out).length ? out : null };
}

/** Lee un calendario ya guardado (TEXT o objeto) sin lanzar nunca. */
export function leerCalendario(valor) {
    const r = normalizarCalendario(valor);
    return r.ok ? r.calendario : null;
}

/**
 * ¿El calendario está vigente en este momento LOCAL?
 * `local` = { dow, minutos, fecha: 'YYYY-MM-DD', fechaAyer: 'YYYY-MM-DD' }.
 *
 * Se arma una semana con las ventanas del calendario y se le pregunta a
 * `ventanaViva`, la misma de los horarios (§37). Si la ventana viva es la de
 * AYER (un happy hour que cruzó la medianoche), la fecha que cuenta para
 * "entre fechas" es la de ayer: el 31 de octubre de 22:00 a 02:00 sigue siendo
 * del 31 a la 1 de la mañana del 1 de noviembre.
 */
export function calendarioVigente(calendario, local) {
    const c = leerCalendario(calendario);
    if (!c) return true;
    if (!local) return false;

    const ventanaDelDia = c.desde ? { abre: c.desde, cierra: c.hasta } : { abre: '00:00', cierra: '00:00' };
    const semana = Array.from({ length: 7 }, (_, d) =>
        (!c.dias || c.dias.includes(d)) ? ventanaDelDia : { cerrado: true }
    );

    const cual = ventanaViva(semana, local.dow, local.minutos);
    if (!cual) return false;

    const fechaRef = cual === 'ayer' ? local.fechaAyer : local.fecha;
    if (c.fecha_inicio && fechaRef < c.fecha_inicio) return false;
    if (c.fecha_fin && fechaRef > c.fecha_fin) return false;
    return true;
}

/**
 * Las partes locales que necesita el calendario, a partir de una hora local
 * ya conocida (año, mes 1-12, día, hora, minuto). Los clientes la llaman con
 * el reloj del equipo, que ya es la hora del negocio.
 */
export function localDesdePartes({ year, month, day, hour, minute }) {
    const pad = (n) => String(n).padStart(2, '0');
    const hoy = new Date(Date.UTC(year, month - 1, day));
    const ayer = new Date(Date.UTC(year, month - 1, day - 1));
    const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return { dow: hoy.getUTCDay(), minutos: hour * 60 + minute, fecha: iso(hoy), fechaAyer: iso(ayer) };
}

// ── El precio y el reparto ───────────────────────────────────────────────────

/** Tipo de cobro con su default: lo viejo (combos de precio fijo) es 'precio_fijo'. */
export function tipoDePromo(promo) {
    return promo && TIPOS.includes(promo.tipo) ? promo.tipo : 'precio_fijo';
}

/**
 * Lo que cuesta la promo con estos productos, ANTES de extras.
 * `precios` = precio de lista de cada producto elegido.
 *   precio fijo            → P
 *   regalar el más barato  → suma − los (lleva − paga) más baratos
 */
export function precioPromo(promo, precios) {
    const lista = (precios || []).map(p => Math.max(0, r2(p)));
    if (tipoDePromo(promo) === 'precio_fijo') return Math.max(0, r2(promo.price));

    const lleva = lista.length;
    const paga = Math.max(0, Math.min(lleva, parseInt(promo.paga, 10) || 0));
    const gratis = lleva - paga;
    const ordenados = [...lista].sort((a, b) => a - b);
    const suma = lista.reduce((s, p) => s + _centavos(p), 0);
    const regalado = ordenados.slice(0, gratis).reduce((s, p) => s + _centavos(p), 0);
    return (suma - regalado) / 100;
}

/**
 * Reparte `precio` entre los productos en proporción a su precio de lista.
 * Devuelve las partes en el MISMO orden que `precios`. A centavos, con el
 * residuo del redondeo en el más caro (el primero, si hay empate): la suma de
 * las partes es exactamente `precio`.
 */
export function repartir(precio, precios) {
    const n = (precios || []).length;
    if (n === 0) return [];
    const total = _centavos(Math.max(0, r2(precio)));
    const lista = precios.map(p => Math.max(0, _centavos(p)));
    const suma = lista.reduce((s, c) => s + c, 0);

    // Sin precios de lista (todo a $0): partes iguales.
    const partes = lista.map(c => suma > 0 ? Math.round(total * c / suma) : Math.floor(total / n));
    let masCaro = 0;
    for (let i = 1; i < n; i++) if (lista[i] > lista[masCaro]) masCaro = i;
    partes[masCaro] += total - partes.reduce((s, c) => s + c, 0);
    return partes.map(c => c / 100);
}

/**
 * Los renglones de una promo vendida. `elegidos` = [{ precio, delta }] con el
 * precio de lista de cada producto y la suma de sus extras.
 * Devuelve { precio, renglones: [{ parte, unit_price }], total, ahorro }.
 */
export function armarPromo(promo, elegidos, precioForzado = null) {
    const precios = elegidos.map(e => e.precio);
    const precio = precioForzado !== null && precioForzado !== undefined
        ? Math.max(0, r2(precioForzado))
        : precioPromo(promo, precios);
    const partes = repartir(precio, precios);
    const renglones = elegidos.map((e, i) => ({
        parte: partes[i],
        unit_price: r2(partes[i] + (Number(e.delta) || 0)),
    }));
    const total = renglones.reduce((s, r) => s + _centavos(r.unit_price), 0) / 100;
    const lista = precios.reduce((s, p) => s + _centavos(p), 0) / 100;
    return { precio, renglones, total, ahorro: r2(lista - precio) };
}

// ── Qué se puede elegir ──────────────────────────────────────────────────────
//
// Un "hueco" (slot) de la promo es "N de [estos productos]" o "N de [esta
// categoría]". Un combo viejo —producto fijo con cantidad— es un hueco de un
// solo producto. La elección cabe si cada producto elegido se puede sentar en
// un hueco y cada hueco queda exactamente lleno.

/** ¿Este producto entra en este hueco? `producto` = { id, category_id }. */
export function cabeEnHueco(hueco, producto) {
    if (!hueco || !producto) return false;
    const ids = Array.isArray(hueco.product_ids) ? hueco.product_ids.map(Number) : [];
    if (ids.length) return ids.includes(Number(producto.id));
    if (hueco.category_id !== null && hueco.category_id !== undefined) {
        return Number(hueco.category_id) === Number(producto.category_id);
    }
    return false;
}

/** Cuántos productos lleva la promo en total (suma de los huecos). */
export function productosQueLleva(huecos) {
    return (huecos || []).reduce((s, h) => s + Math.max(0, parseInt(h.quantity, 10) || 0), 0);
}

/**
 * ¿La elección cabe en la promo? Asignación con vuelta atrás: dos huecos de la
 * misma categoría ("1 de Tacos + 1 de Tacos o Quesadillas") no se pueden llenar
 * a lo primero que caiga. Con 20 productos como máximo sobra.
 */
export function eleccionCabe(huecos, productos) {
    const total = productosQueLleva(huecos);
    if (!Array.isArray(productos) || productos.length !== total || total === 0) return false;
    const libres = huecos.map(h => Math.max(0, parseInt(h.quantity, 10) || 0));

    const sentar = (i) => {
        if (i === productos.length) return libres.every(n => n === 0);
        for (let h = 0; h < huecos.length; h++) {
            if (libres[h] > 0 && cabeEnHueco(huecos[h], productos[i])) {
                libres[h]--;
                if (sentar(i + 1)) return true;
                libres[h]++;
            }
        }
        return false;
    };
    return sentar(0);
}

// ════════════════════════ FIN DE LA PARTE 1 ═════════════════════════════════
// Lo de abajo es solo del celular.

const _cPromo = (n) => Math.round((Number(n) || 0) * 100);

/**
 * Las partes locales del instante `fecha` con el reloj del EQUIPO. El reloj del
 * teléfono ya es la hora del negocio (mismo criterio que los horarios, §37.6):
 * usar `getUTC…` correría el martes a las 6 p. m. del lunes.
 */
export function localDelEquipo(fecha = new Date()) {
  const d = new Date(fecha);
  return localDesdePartes({
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(),
  });
}

/**
 * Un combo tal como llega de GET /offers/combos (o de la caché offline), como
 * lo usa la venta. La forma nueva viene en `slots`; un combo de antes sin
 * `slots` tiene sus productos fijos en `items` (huecos de un solo producto).
 */
export function promoDeCatalogo(combo) {
  if (!combo) return null;
  let huecos = Array.isArray(combo.slots) ? combo.slots : [];
  if (huecos.length === 0) {
    huecos = (combo.items || []).map((it) => ({
      quantity: it.quantity || 1, product_ids: [it.product_id], category_id: null,
    }));
  }
  huecos = huecos.map((h) => ({
    quantity: Math.max(1, parseInt(h.quantity, 10) || 1),
    product_ids: Array.isArray(h.product_ids) ? h.product_ids.map(Number).filter(Number.isInteger) : [],
    category_id: h.category_id !== undefined && h.category_id !== null && h.category_id !== ''
      ? Number(h.category_id) : null,
  })).filter((h) => h.product_ids.length || h.category_id !== null);
  return {
    id: combo.id,
    name: combo.name || 'Promo',
    tipo: tipoDePromo(combo),
    price: parseFloat(combo.price) || 0,
    paga: combo.paga !== null && combo.paga !== undefined ? parseInt(combo.paga, 10) : null,
    lleva: productosQueLleva(huecos),
    calendario: leerCalendario(combo.calendario),
    active: combo.active !== false,
    huecos,
  };
}

/** Un 2x1 que lleva 1 y cobra 1 no es una promo: el servidor lo rechazaría. */
export function promoBienConfigurada(promo) {
  if (!promo || !Array.isArray(promo.huecos) || promo.huecos.length === 0) return false;
  if (promo.tipo === 'regalar_mas_barato') return promo.paga >= 1 && promo.paga < promo.lleva;
  return true;
}

/** ¿Agotado? `stock` NULL es "sin control" (§19.38), NO cero. */
export function estaAgotado(producto) {
  if (!producto) return true;
  const s = producto.stock;
  return s !== null && s !== undefined && s !== '' && Number(s) <= 0;
}

/**
 * Los productos que se pueden elegir para un hueco. Uno agotado o inactivo no
 * aparece (trampa 8): ofrecerlo es prometer algo que la cocina no tiene.
 * `productos` = [{ id, name, price, category_id, stock, active }].
 */
export function productosDelHueco(hueco, productos) {
  return (productos || []).filter((p) =>
    p && p.active !== false && !estaAgotado(p) && cabeEnHueco(hueco, { id: p.id, category_id: p.category_id }));
}

export function promoSePuedeVender(promo, productos) {
  return promoBienConfigurada(promo) && promo.huecos.every((h) => productosDelHueco(h, productos).length > 0);
}

/**
 * Las promos que la caja enseña AHORA: activas, bien armadas, con algo que
 * elegir y dentro de su calendario. Fuera de horario la promo NO EXISTE en la
 * pantalla — así nadie la cobra por error el miércoles. Sin Premium, ninguna
 * (Ofertas es Premium, §8; el modo sin cuenta es Free).
 */
export function promosActivasAhora(promos, productos, { fecha = new Date(), premium = true } = {}) {
  if (!premium) return [];
  const local = localDelEquipo(fecha);
  return (promos || []).filter((p) =>
    p && p.active && promoSePuedeVender(p, productos) && calendarioVigente(p.calendario, local));
}

/** ¿El descuento vale ahora por su calendario ("10% los lunes", §3.3)? */
export function descuentoVigenteLocal(descuento, fecha = new Date()) {
  if (!descuento || descuento.active === false) return false;
  return calendarioVigente(descuento.calendario, localDelEquipo(fecha));
}

// ── El renglón del carrito ──────────────────────────────────────────────────

/**
 * Arma el renglón de carrito de una promo vendida.
 * `elegidos` = [{ product_id, nombre, emoji, precio (de lista), modificadores, nota }].
 *
 * `precio` es lo que cobra el renglón ENTERO (partes + extras): todo lo que ya
 * sumaba `carrito[i].precio` —impuesto, pagos, total— sigue sin enterarse.
 * Los EXTRAS se cobran completos: el taco de la promo es gratis, su queso no.
 */
export function armarRenglonPromo(promo, elegidos, { grupo, uid } = {}) {
  if (!grupo) throw new Error('armarRenglonPromo necesita el uuid del grupo');
  const armada = armarPromo(promo, elegidos.map((e) => ({
    precio: e.precio, delta: deltaDeModificadores(e.modificadores),
  })));
  return {
    uid: uid || `promo_${grupo}`,
    tipo: 'promo',
    promo_id: promo.id,
    // uuid de ESTA promo vendida: dos 2x1 iguales son dos grupos, o quitar uno
    // se llevaría el otro.
    promo_group: grupo,
    nombre: promo.name,
    precio: armada.total,
    precio_promo: armada.precio,
    ahorro: armada.ahorro,
    productos: elegidos.map((e, i) => ({
      product_id: e.product_id,
      nombre: e.nombre,
      emoji: e.emoji || null,
      precio_lista: r2(e.precio),
      parte: armada.renglones[i].parte,
      precio: armada.renglones[i].unit_price,
      modificadores: e.modificadores || [],
      nota: e.nota || '',
    })),
  };
}

/**
 * Un renglón del carrito como lo espera POST /orders (y la cola offline).
 * Lo suelto sale como siempre (precio BASE, sin extras: el servidor suma los
 * extras por su cuenta, §32). La promo sale como
 * `{ promo_id, promo_group, promo_name, promo_price, productos }`:
 *   - online el servidor ignora `promo_price` y `list_price` y aplica su regla;
 *   - en la cola offline (DIFERIDA, §26) con esos dos el servidor saca EXACTAMENTE
 *     las mismas partes que se cobraron aquí.
 * `promo_price` es la suma de las PARTES, sin extras.
 */
export function renglonParaVenta(item) {
  if (item && item.tipo === 'promo') {
    return {
      promo_id: item.promo_id,
      promo_group: item.promo_group,
      promo_name: item.nombre,
      promo_price: item.productos.reduce((s, p) => s + _cPromo(p.parte), 0) / 100,
      productos: item.productos.map((p) => ({
        product_id: p.product_id,
        ...(p.modificadores && p.modificadores.length ? { modifiers: p.modificadores } : {}),
        ...(p.nota ? { notes: p.nota } : {}),
        list_price: p.precio_lista,
      })),
    };
  }
  const base = item.precio_base != null ? item.precio_base : item.precio;
  return {
    product_id: item.product_id,
    quantity: 1,
    unit_price: base,
    base_unit_price: base,
    modifiers: item.modificadores && item.modificadores.length ? item.modificadores : undefined,
    notes: item.nota || undefined,
  };
}

/**
 * Los renglones de un cuerpo de venta, APLANADOS como los guardaría el
 * servidor: una promo se vuelve un renglón por producto con su parte. Es lo que
 * usan el ticket y la lista de Pedidos de una venta que todavía no sube.
 * El reparto es el del servidor en una diferida: `promo_price` forzado sobre los
 * `list_price`, así que el papel dice lo mismo que dirá el reporte.
 */
export function aplanarRenglonesVenta(bodyItems) {
  const out = [];
  for (const it of bodyItems || []) {
    if (!it) continue;
    if (!it.promo_id && !Array.isArray(it.productos)) { out.push(it); continue; }
    const productos = it.productos || [];
    const armada = armarPromo(
      { tipo: 'precio_fijo', price: 0 },
      productos.map((p) => ({ precio: parseFloat(p.list_price) || 0, delta: deltaDeModificadores(p.modifiers) })),
      parseFloat(it.promo_price) || 0,
    );
    productos.forEach((p, i) => out.push({
      product_id: p.product_id,
      quantity: 1,
      unit_price: armada.renglones[i].unit_price,
      base_unit_price: armada.renglones[i].parte,
      subtotal: armada.renglones[i].unit_price,
      list_price: parseFloat(p.list_price) || 0,
      modifiers: p.modifiers,
      notes: p.notes,
      promo_id: it.promo_id,
      promo_group: it.promo_group,
      promo_name: it.promo_name || 'Promo',
    }));
  }
  return out;
}

/** Los nombres de los productos del carrito, en el MISMO orden que aplanarRenglonesVenta. */
export function nombresAplanados(carrito) {
  const out = [];
  for (const i of carrito || []) {
    if (i && i.tipo === 'promo') for (const p of i.productos) out.push({ name: p.nombre, modificadores: p.modificadores });
    else if (i) out.push({ name: i.nombre, modificadores: i.modificadores });
  }
  return out;
}

// ── La mesa ─────────────────────────────────────────────────────────────────

/**
 * La clave de un renglón del carrito de MESA (trampa 2). Una promo lleva su
 * grupo: sin él, el taco de la promo se fundiría con un taco suelto y heredaría
 * su precio — exactamente el error que el §32 ya vivió con los extras.
 */
export function claveCarritoMesa(entrada) {
  if (entrada && entrada.tipo === 'promo') return `promo:${entrada.renglon.promo_group}`;
  return claveCarrito(entrada.producto.id, entrada.modificadores);
}

/** Un renglón del carrito de mesa como lo espera POST /orders/:id/items. */
export function renglonParaMesa(entrada) {
  if (entrada && entrada.tipo === 'promo') return renglonParaVenta(entrada.renglon);
  return {
    product_id: entrada.producto.id,
    quantity: entrada.qty,
    ...(entrada.modificadores && entrada.modificadores.length ? { modifiers: entrada.modificadores } : {}),
  };
}

/** Lo que suma el carrito de mesa (una promo cuenta una vez, con sus extras). */
export function totalCarritoMesa(carrito) {
  return Object.values(carrito || {}).reduce((s, e) => {
    if (e.tipo === 'promo') return s + _cPromo(e.renglon.precio);
    const precio = e.precio != null ? e.precio : e.producto.price;
    return s + _cPromo(parseFloat(precio) * e.qty);
  }, 0) / 100;
}

/**
 * La cuenta de una mesa partida en UNIDADES asignables para dividirla (§31, §44.2).
 * Cuatro refrescos iguales son cuatro unidades; una PROMO es UNA sola unidad
 * (trampa 5) que va entera a un pago: cada taco lleva su parte del precio y
 * dividirlo cuadraría, pero dos amigos acabarían peleándose por un taco de
 * $14.58. `item_ids` son los ids reales que cubre cada unidad.
 */
export function unidadesDeCuenta(items) {
  const out = [];
  const grupos = new Map();
  for (const it of items || []) {
    const sub = parseFloat(it.subtotal);
    const monto = Number.isFinite(sub) && sub > 0
      ? sub
      : (parseFloat(it.unit_price) || 0) * (parseFloat(it.quantity) || 0);
    if (it.promo_group) {
      let u = grupos.get(it.promo_group);
      if (!u) {
        u = {
          id: `promo:${it.promo_group}`, item_ids: [], nombre: it.promo_name || 'Promo',
          subtotal: 0, pieza: 1, de: 1, promo: true,
        };
        grupos.set(it.promo_group, u);
        out.push(u);
      }
      u.item_ids.push(it.id);
      u.subtotal = (_cPromo(u.subtotal) + _cPromo(monto)) / 100;
      continue;
    }
    const cant = parseInt(it.quantity, 10);
    // Una cantidad fraccionaria o rara se trata como un solo bloque: partir
    // "0.75 kg de queso" en unidades no significaría nada.
    const piezas = Number.isFinite(cant) && cant > 1 ? cant : 1;
    for (let k = 0; k < piezas; k++) {
      out.push({
        id: `${it.id}#${k}`, item_ids: [it.id],
        nombre: it.product ? it.product.name : (it.name || 'Producto'),
        subtotal: monto / piezas, pieza: k + 1, de: piezas, promo: false,
      });
    }
  }
  return out;
}

// ── Ticket, cuenta e historial ──────────────────────────────────────────────

/** Los campos de promo de un renglón, venga del carrito, de la cola o del servidor. */
export function camposPromoDeRenglon(it) {
  const primero = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');
  return {
    grupo: primero(it.promo_group) || null,
    nombre: primero(it.promo_name) || 'Promo',
    subtotal: parseFloat(primero(it.subtotal, it.precio, it.unit_price)) || 0,
    parte: parseFloat(primero(it.precio_base, it.base_unit_price, it.parte, it.unit_price)) || 0,
    lista: parseFloat(primero(it.precio_lista, it.list_price)) || 0,
  };
}

/**
 * Junta los renglones de cada promo para enseñarlos como UNO (ticket, cuenta de
 * la mesa, historial). Lo que no es promo pasa tal cual y en su orden.
 * Devuelve [{ promo: null, item }] y [{ promo: { grupo, nombre, total, ahorro }, items }].
 */
export function agruparRenglones(items) {
  const out = [];
  const grupos = new Map();
  for (const it of items || []) {
    if (!it) continue;
    const c = camposPromoDeRenglon(it);
    if (!c.grupo) { out.push({ promo: null, item: it }); continue; }
    let g = grupos.get(c.grupo);
    if (!g) {
      g = { promo: { grupo: c.grupo, nombre: c.nombre, total: 0, ahorro: 0 }, items: [] };
      grupos.set(c.grupo, g);
      out.push(g);
    }
    g.items.push(it);
    g.promo.total = (_cPromo(g.promo.total) + _cPromo(c.subtotal)) / 100;
    g.promo.ahorro = (_cPromo(g.promo.ahorro) + _cPromo(c.lista) - _cPromo(c.parte)) / 100;
  }
  for (const g of out) if (g.promo && g.promo.ahorro < 0) g.promo.ahorro = 0;
  return out;
}

/** Lo que el cliente se ahorró en promos ("Ahorraste $X" al pie del ticket). */
export function ahorroDePromos(items) {
  return agruparRenglones(items).reduce((s, g) => s + (g.promo ? _cPromo(g.promo.ahorro) : 0), 0) / 100;
}

// ── Juntar ofertas (§3.4) ───────────────────────────────────────────────────

/**
 * Sobre qué se calcula un descuento de la cuenta. Apagado el interruptor —el de
 * fábrica— la promo no lleva descuento: una promo de $35 y un refresco de $20
 * con un 10% descuentan $2, no $5.50. Es la MISMA base del servidor
 * (`baseDescuento` de routes/orders.js): si no, cada venta con descuento se
 * rechazaría (online) o se auditaría como sospechosa (offline).
 */
export function baseDescuentoDe(carrito, acumulables) {
  const suma = (carrito || []).reduce((s, i) => s + _cPromo(i && i.precio), 0);
  if (acumulables === true) return suma / 100;
  const promos = (carrito || []).filter((i) => i && i.tipo === 'promo').reduce((s, i) => s + _cPromo(i.precio), 0);
  return Math.max(0, suma - promos) / 100;
}

/** `settings.ofertas_acumulables` del negocio. Cualquier duda cae a APAGADO. */
export function ofertasAcumulablesDe(settings) {
  return Boolean(settings) && (settings.ofertas_acumulables === true || settings.ofertas_acumulables === 'true');
}

/** El monto de un descuento configurado sobre esa base, topado a ella. */
export function montoDescuento(descuento, base) {
  const b = Math.max(0, Number(base) || 0);
  const monto = descuento.type === 'percentage'
    ? parseFloat((b * parseFloat(descuento.value) / 100).toFixed(2))
    : parseFloat(descuento.value) || 0;
  return Math.min(Math.max(0, monto), b);
}

// ── La sugerencia: "¿Convertir a 2x1?" ──────────────────────────────────────

function _precioListaDe(it) {
  return parseFloat(it.precio_base != null ? it.precio_base : it.precio) || 0;
}

/**
 * Si en el carrito hay productos SUELTOS que llenan una promo activa, la
 * sugerencia con más ahorro. NUNCA convierte sola (§1 del plan: cambiar un
 * cobro sin que la cajera lo vea termina en reclamo): solo sugiere.
 * Devuelve { promo, indices, ahorro } o null.
 */
export function sugerirPromo(carrito, activas, productos) {
  const catDe = (id) => {
    const p = (productos || []).find((x) => x.id === id);
    return p ? p.category_id : null;
  };
  const sueltos = (carrito || []).map((it, idx) => ({ it, idx })).filter((x) => x.it && x.it.tipo !== 'promo');
  const cabe = (x) => ({ id: x.it.product_id, category_id: catDe(x.it.product_id) });
  let mejor = null;
  for (const promo of activas || []) {
    // Los caros primero: en un 2x1 se regala el más barato, así que la pareja
    // más cara es la que más le ahorra al cliente.
    const cand = sueltos
      .filter((x) => promo.huecos.some((h) => cabeEnHueco(h, cabe(x))))
      .sort((a, b) => _precioListaDe(b.it) - _precioListaDe(a.it))
      .slice(0, 12);
    if (cand.length < promo.lleva) continue;
    const elegidos = [];
    const buscar = (desde) => {
      if (elegidos.length === promo.lleva) return eleccionCabe(promo.huecos, elegidos.map(cabe));
      for (let i = desde; i < cand.length; i++) {
        elegidos.push(cand[i]);
        if (buscar(i + 1)) return true;
        elegidos.pop();
      }
      return false;
    };
    if (!buscar(0)) continue;
    const listas = elegidos.map((x) => _precioListaDe(x.it));
    const suma = listas.reduce((s, p) => s + _cPromo(p), 0);
    const ahorro = (suma - _cPromo(precioPromo(promo, listas))) / 100;
    if (ahorro > 0.004 && (!mejor || ahorro > mejor.ahorro)) {
      mejor = { promo, indices: elegidos.map((x) => x.idx), ahorro };
    }
  }
  return mejor;
}

/** El carrito con esos productos sueltos convertidos en la promo. */
export function convertirEnPromo(carrito, sugerencia, { grupo } = {}) {
  const quitar = new Set(sugerencia.indices);
  const elegidos = sugerencia.indices.map((i) => carrito[i]).map((it) => ({
    product_id: it.product_id, nombre: it.nombre, emoji: it.emoji,
    precio: _precioListaDe(it), modificadores: it.modificadores || [], nota: it.nota || '',
  }));
  const nuevo = carrito.filter((_, i) => !quitar.has(i));
  nuevo.push(armarRenglonPromo(sugerencia.promo, elegidos, { grupo }));
  return nuevo;
}

// ── La hoja de elección ─────────────────────────────────────────────────────

/** El primer hueco que todavía no está lleno, o -1 si ya están todos. */
export function huecoPendiente(promo, elegidos) {
  return promo.huecos.findIndex((h, i) => (elegidos || []).filter((x) => x.hueco === i).length < h.quantity);
}

/**
 * El producto que la hoja puede poner SOLA: si al hueco pendiente solo le cabe
 * UN producto a la venta y no tiene extras que preguntar, no hay nada que
 * elegir. Un combo de productos fijos ("1 pizza + 2 cocas") hacía tocar tres
 * botones que no tenían alternativa (visto en el emulador). Con extras sí se
 * pregunta: quien decide el queso es el cliente.
 * `tieneExtras(id)` → boolean. Devuelve el producto o null.
 */
export function eleccionAutomatica(promo, elegidos, productos, tieneExtras) {
  if (!promo) return null;
  const h = huecoPendiente(promo, elegidos);
  if (h === -1) return null;
  const opciones = productosDelHueco(promo.huecos[h], productos);
  if (opciones.length !== 1) return null;
  return tieneExtras && tieneExtras(opciones[0].id) ? null : opciones[0];
}

// ── Textos para la pantalla ─────────────────────────────────────────────────

const _DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function textoCalendario(calendario) {
  const c = leerCalendario(calendario);
  if (!c) return 'Siempre';
  const partes = [];
  if (c.dias) partes.push(c.dias.map((d) => _DIAS[d]).join(', '));
  if (c.desde) partes.push(`${c.desde}–${c.hasta}`);
  if (c.fecha_inicio && c.fecha_fin) partes.push(`del ${c.fecha_inicio} al ${c.fecha_fin}`);
  else if (c.fecha_inicio) partes.push(`desde el ${c.fecha_inicio}`);
  else if (c.fecha_fin) partes.push(`hasta el ${c.fecha_fin}`);
  return partes.join(' · ') || 'Siempre';
}

export function nombreDeHueco(hueco, productos, categorias) {
  if (hueco.product_ids && hueco.product_ids.length) {
    const nombres = hueco.product_ids.map((id) => {
      const p = (productos || []).find((x) => x.id === id);
      return p ? p.name : `producto ${id}`;
    });
    return nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')}…` : nombres.join(' o ');
  }
  const cat = (categorias || []).find((c) => c.id === hueco.category_id);
  return cat ? cat.name : 'la categoría';
}

export function textoHuecos(promo, productos, categorias) {
  return (promo.huecos || []).map((h) => `${h.quantity} de ${nombreDeHueco(h, productos, categorias)}`).join(' + ');
}

export function textoCobro(promo, currency = '$') {
  if (promo.tipo === 'regalar_mas_barato') return `Lleva ${promo.lleva}, paga ${promo.paga}`;
  return `${currency}${(parseFloat(promo.price) || 0).toFixed(2)}`;
}

/**
 * La vista previa de Ofertas, con productos REALES: "Pastor $25 + Arrachera
 * $35 → cobras $35". Para cada hueco toma productos distintos (así se ve qué se
 * regala). `ambar` avisa lo que el dueño tiene que ver antes de guardar: que no
 * haya nada que elegir, que un 2x1 no regale nada, o que la promo cueste MÁS
 * que los sueltos (trampa 7: se permite —el dueño manda—, pero que lo vea).
 * Devuelve { texto, ambar, cobra, suma }.
 */
export function vistaPreviaPromo(promo, productos, categorias, currency = '$') {
  if (!promo.huecos || !promo.huecos.length) return { texto: 'Agrega qué lleva la promo.', ambar: false };
  const muestra = [];
  for (const h of promo.huecos) {
    const elegibles = productosDelHueco(h, productos).slice()
      .sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    if (!elegibles.length) {
      return { texto: `Ningún producto a la venta entra en "${nombreDeHueco(h, productos, categorias)}": así no se va a poder vender.`, ambar: true };
    }
    for (let i = 0; i < h.quantity; i++) muestra.push(elegibles[i % elegibles.length]);
  }
  if (promo.tipo === 'regalar_mas_barato' && !promoBienConfigurada(promo)) {
    return { texto: `Esta promo lleva ${promo.lleva}: tiene que cobrar menos que eso (en un 2x1 se cobra 1).`, ambar: true };
  }
  const precios = muestra.map((p) => parseFloat(p.price) || 0);
  const cobra = precioPromo(promo, precios);
  const suma = precios.reduce((s, p) => s + _cPromo(p), 0) / 100;
  const detalle = muestra.map((p) => `${p.name} ${currency}${(parseFloat(p.price) || 0).toFixed(2)}`).join(' + ');
  let texto = `Ejemplo: ${detalle} → cobras ${currency}${cobra.toFixed(2)}`;
  let ambar = false;
  if (cobra > suma + 0.004) {
    ambar = true;
    texto += `\nEsta promo cuesta MÁS que los productos sueltos (${currency}${suma.toFixed(2)}).`;
  } else if (suma - cobra > 0.004) {
    texto += ` · el cliente ahorra ${currency}${(suma - cobra).toFixed(2)}`;
  }
  return { texto, ambar, cobra, suma };
}

/**
 * Lo que el editor de calendario de Ofertas tiene, validado con la PARTE 1.
 * `form` = { siempre, dias: [0..6], desde, hasta, fecha_inicio, fecha_fin }.
 */
export function calendarioDeFormulario(form) {
  if (!form || form.siempre) return { ok: true, calendario: null };
  const bruto = { dias: form.dias || [] };
  if (form.desde || form.hasta) { bruto.desde = form.desde; bruto.hasta = form.hasta; }
  if (form.fecha_inicio) bruto.fecha_inicio = form.fecha_inicio;
  if (form.fecha_fin) bruto.fecha_fin = form.fecha_fin;
  return normalizarCalendario(bruto);
}

/** El editor de calendario lleno desde un calendario guardado. */
export function formularioDeCalendario(calendario) {
  const c = leerCalendario(calendario);
  return {
    siempre: !c,
    dias: c && c.dias ? [...c.dias] : [0, 1, 2, 3, 4, 5, 6],
    desde: (c && c.desde) || '',
    hasta: (c && c.hasta) || '',
    fecha_inicio: (c && c.fecha_inicio) || '',
    fecha_fin: (c && c.fecha_fin) || '',
  };
}

// ── El formulario de Ofertas → Nueva promo ──────────────────────────────────
//
// form = { id, nombre, tipo, paga, precio, huecos: [{ quantity, que }], calendario }
// `que` es 'c:<categoría>' o 'p:<producto>'; `calendario` es el del editor.

/** Las plantillas llenan todo lo de abajo; el dueño solo corrige lo que cambie. */
export function plantillaPromo(cual, form) {
  const que = form && form.huecos && form.huecos[0] ? form.huecos[0].que : null;
  if (cual === 'combo') {
    return { ...form, tipo: 'precio_fijo', huecos: [{ quantity: 1, que }, { quantity: 1, que: null }] };
  }
  const lleva = cual === '3x2' ? 3 : 2;
  return { ...form, tipo: 'regalar_mas_barato', paga: lleva - 1, huecos: [{ quantity: lleva, que }] };
}

/** Lo que el formulario dice, como promo plana (la misma forma que usa la venta). */
export function promoDeFormulario(form) {
  const huecos = (form.huecos || []).map((h) => {
    const que = String(h.que || '');
    const id = parseInt(que.slice(2), 10);
    const quantity = Math.max(1, Math.min(20, parseInt(h.quantity, 10) || 1));
    if (!Number.isInteger(id)) return null;
    return que.startsWith('c:')
      ? { quantity, product_ids: [], category_id: id }
      : { quantity, product_ids: [id], category_id: null };
  }).filter(Boolean);
  const regalar = form.tipo === 'regalar_mas_barato';
  return {
    id: form.id || null,
    name: String(form.nombre || '').trim(),
    tipo: regalar ? 'regalar_mas_barato' : 'precio_fijo',
    price: regalar ? 0 : (parseFloat(form.precio) || 0),
    paga: regalar ? (parseInt(form.paga, 10) || 0) : null,
    lleva: productosQueLleva(huecos),
    huecos,
    calendario: null,
    active: true,
  };
}

/**
 * Valida el formulario ANTES de mandarlo, con los mismos criterios del
 * servidor. Devuelve { ok, error } o { ok, cuerpo, items } listos para
 * POST/PUT /offers/combos y POST /offers/combos/:id/items.
 */
export function validarFormularioPromo(form) {
  const promo = promoDeFormulario(form);
  if (!promo.name) return { ok: false, error: 'Ponle nombre a la promo: es lo que verá la cajera en el botón.' };
  if (!promo.huecos.length) return { ok: false, error: 'Di qué lleva la promo.' };
  if (promo.lleva > MAX_PRODUCTOS_PROMO) return { ok: false, error: `Una promo lleva como máximo ${MAX_PRODUCTOS_PROMO} productos.` };
  if (promo.tipo === 'precio_fijo' && !(promo.price > 0)) return { ok: false, error: 'Escribe cuánto se cobra la promo.' };
  if (promo.tipo === 'regalar_mas_barato' && !promoBienConfigurada(promo)) {
    return { ok: false, error: `Esta promo lleva ${promo.lleva}: tiene que cobrar menos que eso (en un 2x1 se cobra 1).` };
  }
  const cal = calendarioDeFormulario(form.calendario);
  if (!cal.ok) return { ok: false, error: cal.error };
  return {
    ok: true,
    promo: { ...promo, calendario: cal.calendario },
    cuerpo: {
      name: promo.name, tipo: promo.tipo, calendario: cal.calendario,
      ...(promo.tipo === 'precio_fijo' ? { price: promo.price } : { paga: promo.paga }),
    },
    items: promo.huecos.map((h) => (h.category_id !== null
      ? { category_id: h.category_id, quantity: h.quantity }
      : { product_id: h.product_ids[0], quantity: h.quantity })),
  };
}

/** El formulario lleno desde una promo guardada (para editarla). */
export function formularioDePromo(promo) {
  return {
    id: promo.id,
    nombre: promo.name,
    tipo: promo.tipo,
    paga: promo.paga || 1,
    precio: promo.tipo === 'precio_fijo' ? String(promo.price) : '',
    huecos: promo.huecos.map((h) => ({
      quantity: h.quantity,
      que: h.category_id !== null ? `c:${h.category_id}` : `p:${h.product_ids[0]}`,
    })),
    calendario: formularioDeCalendario(promo.calendario),
  };
}

/**
 * Guarda la promo en el servidor. Pide conexión (trampa 9): los ids son del
 * backend. `cliente` es el cliente HTTP (se pasa para poder probarlo).
 *
 * Al EDITAR el orden importa: el servidor revisa "cobra menos de lo que lleva"
 * contra lo que YA tiene guardado. De 3x2 a 2x1 tiene que ir primero la regla;
 * de 2x1 a 3x2, primero los productos. Se intenta uno y, si rebota, el otro.
 * Al CREAR, si los productos fallan, la promo recién creada se borra: una promo
 * sin productos no se puede vender y confunde en la lista.
 */
export async function guardarPromoEnServidor(cliente, validado, id = null) {
  const { cuerpo, items } = validado;
  if (id) {
    try {
      await cliente.updateCombo(id, cuerpo);
      await cliente.setComboItems(id, items);
    } catch {
      await cliente.setComboItems(id, items);
      await cliente.updateCombo(id, cuerpo);
    }
    return id;
  }
  const creado = await cliente.createCombo(cuerpo);
  try {
    await cliente.setComboItems(creado.id, items);
  } catch (e) {
    await cliente.deleteCombo(creado.id).catch(() => {});
    throw e;
  }
  return creado.id;
}
