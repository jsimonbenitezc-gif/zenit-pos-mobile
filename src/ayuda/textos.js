// ─── TEXTOS DE LAS BURBUJAS DE AYUDA (?) (PLAN_AYUDA_V1, IDEA 10) ─────────────
//
// ⚠️ ESTE ARCHIVO ESTÁ COPIADO en el desktop: `pos/ayuda-textos.js`. Si cambias
// un texto aquí, cámbialo allá también: `npm run smoke:ayuda` (en los dos repos)
// compara los dos y falla si dicen cosas distintas. Así el celular y la caja
// nunca explican la misma pantalla de dos maneras.
//
// Cada texto describe una regla que el código YA cumple. La `§` del comentario
// es esa regla (docs/secciones/): si la regla cambia, el texto cambia con ella.
// `**así**` = negritas. `ejemplo` es la segunda línea, en gris ("Ej.:" cuando lo es).
//
// La pantalla solo dice la llave: <Ayuda id="preparaciones" />.

export const TEXTOS_AYUDA = {
  // §34
  preparaciones: {
    titulo: 'Preparaciones',
    texto: 'Aquí creas lo que tú preparas con tus insumos y luego usas en tus platillos. Así el inventario descuenta bien cada ingrediente.',
    ejemplo: 'Ej.: tu **salsa verde**, hecha con tomate, chile y cebolla.',
  },
  // §34 (fraccionDeTanda)
  rinde: {
    titulo: 'Rinde',
    texto: 'Cuánto sale de una tanda.',
    ejemplo: 'Ej.: con 1 kg de tomate salen **20 porciones** de salsa: cada porción gasta 50 g.',
  },
  // §56.3
  recetas: {
    titulo: 'Recetas',
    texto: 'Qué insumos lleva cada producto. Sin receta, se cuenta el producto entero.',
    ejemplo: 'Ej.: al vender una **hamburguesa** se descuentan su pan, su carne y su queso.',
  },
  // §32
  modificadores: {
    titulo: 'Extras',
    texto: 'Opciones que el cliente elige al pedir. Arma el grupo una vez y úsalo en varios productos.',
    ejemplo: 'Ej.: "sin cebolla", "extra queso +$10".',
  },
  // §60–§62
  promos: {
    titulo: 'Promos',
    texto: 'Promos que se prenden solas en su día y hora. Aparecen en Nueva venta solo cuando valen.',
    ejemplo: 'Ej.: **martes 2x1 en tacos**.',
  },
  // §59
  descuentos: {
    titulo: 'Descuentos',
    texto: 'Un % o monto que se aplica a toda la cuenta. Si tiene PIN, solo quien lo sabe puede darlo.',
    ejemplo: 'Ej.: 10% a clientes frecuentes.',
  },
  // §71
  puestos: {
    titulo: 'Mi equipo',
    texto: 'Cada puesto ve solo sus pantallas. Ponle PIN para que nadie entre en un puesto que no es el suyo.',
    ejemplo: 'Ej.: el **mesero** ve Mesas y Nueva venta, pero no Ajustes.',
  },
  // §37 (señal, nunca candado)
  horario: {
    titulo: 'Horario',
    texto: 'Tus horas de trabajo. **Nunca bloquea nada**: vender y cobrar funcionan a cualquier hora.',
    ejemplo: 'Solo **te avisa** si alguien cancela, devuelve o da un descuento fuera de horario.',
  },
  // §29
  impuesto: {
    titulo: 'Impuestos',
    texto: '**Incluido**: tu precio de $100 ya trae el IVA. **Agregado**: al precio de $100 se le suma el IVA al cobrar.',
    ejemplo: 'Si no cobras impuesto, déjalo apagado.',
  },
  // §30
  propinas: {
    titulo: 'Propinas',
    texto: 'Al cobrar se ofrece dejar propina. La propina **no es venta**: no paga impuesto.',
    ejemplo: 'Solo la propina en efectivo entra en tu caja.',
  },
  // §24
  sucursal: {
    titulo: 'Sucursal de este equipo',
    texto: 'En qué sucursal vende ESTE equipo. Cada celular o PC tiene la suya.',
    ejemplo: 'Cambiarla pide la contraseña del administrador.',
  },
  // §28
  turno: {
    titulo: 'Turno / caja',
    texto: 'Abre la caja con el efectivo con que empiezas. Al cerrarla, cuenta lo que hay.',
    ejemplo: 'Zenit te dice cuánto **debería** haber.',
  },
};
