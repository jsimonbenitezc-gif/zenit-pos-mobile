// ============================================================================
// utils/pagos.js — Pagos divididos (BLOQUE 10)
//
// Espejo EXACTO de `utils/pagos.js` del backend (y de `modulo-pagos.js` del
// desktop). El servidor revalida el reparto de toda venta y RECHAZA (400) el que
// no cuadre, así que si esta copia se desviara el cajero armaría una división
// que el backend le rebota.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares.
//
// LA REGLA DE ORO: LOS PAGOS REPARTEN EL TOTAL, NO LO AUMENTAN.
//   • `suma(pagos.amount) === total`. Un pago no agrega dinero a la venta.
//   • La PROPINA de cada pago va aparte de su monto: lo que el cliente entrega
//     en ese pago es `amount + tip_amount`. El invariante del BLOQUE 9 (la
//     propina fuera del total) y el del BLOQUE 8 (total = subtotal + impuesto)
//     quedan intactos.
//   • Con varios métodos el pedido se guarda como 'multiple' y el desglose real
//     vive en los pagos. Con uno solo, se guarda ese método de siempre.
//
// POR QUÉ IMPORTA: antes, una venta de $500 pagada $300 en efectivo y $200 con
// tarjeta se registraba entera por un solo método, así que el corte de caja le
// exigía al cajero $200 que nunca estuvieron en el cajón.
// ============================================================================

export const PAGO_METODOS = ['efectivo', 'tarjeta', 'transferencia'];
export const PAGO_TOLERANCIA = 0.01;   // un centavo de redondeo al dividir
export const PAGO_MAX = 20;            // se divide entre comensales, no multitudes

function redondear(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Método de un pago; cae a 'efectivo' si no es uno de los tres válidos. */
export function metodoDePago(valor) {
    const candidato = typeof valor === 'string' ? valor.toLowerCase().trim() : '';
    return PAGO_METODOS.includes(candidato) ? candidato : 'efectivo';
}

/** 'multiple' cuando hay más de un método distinto; si no, ese método. */
export function metodoResumen(pagos) {
    if (!Array.isArray(pagos) || pagos.length === 0) return null;
    const distintos = [...new Set(pagos.map(p => metodoDePago(p.method)))];
    return distintos.length === 1 ? distintos[0] : 'multiple';
}

/**
 * ¿Cuánto falta por cubrir? Es lo que la pantalla de cobro pinta en vivo
 * mientras el cajero teclea. Positivo = falta; negativo = se pasó.
 */
export function faltantePago(pagos, total) {
    const suma = (pagos || []).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    return redondear((parseFloat(total) || 0) - suma);
}

/** ¿La división cuadra con la cuenta? (con el mismo centavo de tolerancia). */
export function pagosCuadran(pagos, total) {
    return Math.abs(faltantePago(pagos, total)) <= PAGO_TOLERANCIA + 1e-9;
}

/**
 * Valida el reparto antes de mandarlo, con el MISMO mensaje que daría el
 * backend, para que el cajero lea lo mismo venga de donde venga el rechazo.
 */
export function validarPagos(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        return { ok: false, error: 'No se recibió ningún pago.' };
    }
    if (pagos.length > PAGO_MAX) {
        return { ok: false, error: `Una venta admite como máximo ${PAGO_MAX} pagos.` };
    }
    for (const p of pagos) {
        const monto = parseFloat(p && p.amount);
        if (!Number.isFinite(monto) || monto <= 0) {
            return { ok: false, error: 'Cada pago debe tener un monto mayor a cero.' };
        }
    }
    const suma = redondear(pagos.reduce((a, p) => a + redondear(parseFloat(p.amount)), 0));
    const objetivo = redondear(parseFloat(total) || 0);
    if (Math.abs(suma - objetivo) > PAGO_TOLERANCIA + 1e-9) {
        return {
            ok: false,
            error: `Los pagos suman ${suma.toFixed(2)} y la cuenta es ${objetivo.toFixed(2)}. `
                 + `Ajusta los montos para que cuadren.`,
        };
    }
    return { ok: true };
}

/**
 * Divide una cuenta en N partes IGUALES, repartiendo los centavos sobrantes.
 * Los primeros comensales pagan el centavo de más — es lo que hace cualquiera
 * al dividir a mano, y garantiza que la suma dé exactamente el total.
 */
export function dividirEnPartes(total, partes) {
    const n = Math.max(1, parseInt(partes) || 1);
    const centavos = Math.round((parseFloat(total) || 0) * 100);
    const base = Math.floor(centavos / n);
    const resto = centavos - base * n;
    const montos = [];
    for (let i = 0; i < n; i++) {
        montos.push(redondear((base + (i < resto ? 1 : 0)) / 100));
    }
    return montos;
}

function montoItem(i) {
    if (i == null) return 0;
    const sub = parseFloat(i.subtotal);
    if (Number.isFinite(sub) && sub > 0) return sub;
    const precio = parseFloat(i.unit_price != null ? i.unit_price : i.precio) || 0;
    const cant = parseFloat(i.quantity != null ? i.quantity : i.cantidad) || 0;
    return precio * cant;
}

/**
 * Cuánto suma un grupo de items (para dividir la cuenta POR ITEMS).
 *
 * ⚠️ Se reparte sobre el TOTAL de la cuenta, no sobre la suma cruda de los
 * items: el total ya trae el impuesto y ya tiene restados los descuentos. Si se
 * sumaran los precios de lista, cada comensal pagaría de más o de menos y la
 * división nunca cuadraría con lo que hay que cobrar.
 */
export function montoDeItems(items, idsGrupo, totalCuenta) {
    const todos = items || [];
    const bruto = todos.reduce((a, i) => a + montoItem(i), 0);
    if (bruto <= 0) return 0;

    const grupo = todos.filter(i => idsGrupo.includes(i && i.id));
    const brutoGrupo = grupo.reduce((a, i) => a + montoItem(i), 0);
    return redondear((parseFloat(totalCuenta) || 0) * (brutoGrupo / bruto));
}

/**
 * Ajusta el ÚLTIMO pago para que la suma dé exactamente el total.
 *
 * Al dividir por items las proporciones dejan centavos sueltos. En vez de
 * rechazar una división legítima, se le carga el resto al último grupo, igual
 * que hace el backend con el pago más grande.
 */
export function cuadrarUltimoPago(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) return pagos;
    const falta = faltantePago(pagos, total);
    if (falta === 0) return pagos;
    const ultimo = pagos[pagos.length - 1];
    ultimo.amount = redondear((parseFloat(ultimo.amount) || 0) + falta);
    return pagos;
}

/** Etiqueta legible del método, para pintar el ticket y el historial. */
export function etiquetaMetodo(metodo) {
    switch (metodoDePago(metodo)) {
        case 'tarjeta': return 'Tarjeta';
        case 'transferencia': return 'Transferencia';
        default: return 'Efectivo';
    }
}

/**
 * Pagos de un pedido tal como los devuelve el backend. Un pedido sin pagos es
 * uno de un solo método (todos los anteriores al bloque) y devuelve [].
 */
export function pagosDePedido(pedido) {
    if (!pedido) return [];
    return Array.isArray(pedido.payments) ? pedido.payments : [];
}

/**
 * Reparto de un pedido por método. Sin pagos, el total entra entero por su
 * método — exactamente como antes del bloque.
 */
export function repartoDePedido(pedido) {
    const r = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    const pagos = pagosDePedido(pedido);
    if (pagos.length > 0) {
        for (const p of pagos) r[metodoDePago(p.method)] += parseFloat(p.amount) || 0;
    } else if (pedido) {
        r[metodoDePago(pedido.payment_method)] += parseFloat(pedido.total) || 0;
    }
    r.efectivo = redondear(r.efectivo);
    r.tarjeta = redondear(r.tarjeta);
    r.transferencia = redondear(r.transferencia);
    return r;
}
