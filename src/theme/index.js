// ─── Nombres VIEJOS ──────────────────────────────────────────────────────────
// Los siguen usando las pantallas que todavía no se rediseñan (PLAN_REDISENO_V1).
// No se borran: se irán quitando cuando nadie los use.
export const colors = {
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  background: '#eef1f5',
  surface: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 20,
};

export const font = {
  sm: 13, md: 15, lg: 17, xl: 20, xxl: 24,
};

// ─── DISEÑO A · "Gemelo del escritorio" (PLAN_REDISENO_V1 §1) ────────────────
// La referencia es diseno/carcasa-movil-v1.html. Las pantallas rediseñadas usan
// SOLO estos tokens (y las piezas de src/components/ui/): ningún color a mano.
export const zc = {
  noche: '#111827',       // cabecera, barra de cobrar, chip activo
  noche2: '#1f2933',      // final del degradado de la cabecera
  fondo: '#eef1f5',       // el mismo del desktop
  tarjeta: '#ffffff',
  linea: '#edf0f4',       // divisores dentro de una tarjeta; casi invisibles
  tinta: '#111827',       // texto principal
  gris: '#6b7280',        // etiquetas
  grisSuave: '#9aa3b2',   // datos secundarios
  flecha: '#c0c6d0',      // chevrons de las filas
  azul: '#2563eb',        // acción principal, número importante
  azulSuave: '#e8f0ff',
  barraSuave: '#93b4f7',  // barritas de "lo más vendido"
  pistaSuave: '#eef2f8',  // el fondo de esas barritas
  rejilla: '#f1f3f7',     // guías de las gráficas

  // Sobre la cabecera oscura
  enNoche: '#ffffff',
  enNocheGris: '#9ca3af',
  enNocheSuave: '#d1d5db',
  vidrio: 'rgba(255,255,255,0.10)',

  // Avisos: ámbar (atención) y rojo (peligro). Nada más usa estos colores.
  ambar: '#d97706',
  ambarSuave: '#fff4e0',
  ambarTexto: '#b45309',
  rojo: '#dc2626',
  rojoSuave: '#fdecec',
  verde: '#059669',
  verdeSuave: '#e7f7ef',
  subeFondo: 'rgba(16,185,129,0.16)',
  subeTexto: '#34d399',
  bajaFondo: 'rgba(239,68,68,0.16)',
  bajaTexto: '#fca5a5',
};

// El color vive en los cuadritos de los iconos: un tono por grupo, pastel con
// el icono en su tono fuerte. Nada de franjas laterales ni tarjetas de color.
export const tonos = {
  azul:  { fondo: '#e8f0ff', icono: '#2563eb' },
  verde: { fondo: '#e7f7ef', icono: '#059669' },
  lila:  { fondo: '#f1ecff', icono: '#7c3aed' },
  ambar: { fondo: '#fff4e0', icono: '#d97706' },
  rosa:  { fondo: '#fde8ef', icono: '#be185d' },
  gris:  { fondo: '#eef1f5', icono: '#4b5563' },
  rojo:  { fondo: '#fdecec', icono: '#dc2626' },
};

export const radios = {
  tarjeta: 16, boton: 12, chip: 999, cuadrito: 10,
};

export const espacios = {
  borde: 14,      // borde de la pantalla
  dentro: 16,     // relleno dentro de una tarjeta
};

// Pesos: solo 400 / 500 / 700. La negrita es para números y títulos.
export const letra = {
  titulo:   { fontSize: 19, fontWeight: '500' },
  grande:   { fontSize: 36, fontWeight: '700', letterSpacing: -0.5 },
  valor:    { fontSize: 22, fontWeight: '700' },
  seccion:  { fontSize: 15, fontWeight: '500' },
  texto:    { fontSize: 14, fontWeight: '400' },
  etiqueta: { fontSize: 13, fontWeight: '400' },
  chica:    { fontSize: 12, fontWeight: '400' },
  minima:   { fontSize: 11, fontWeight: '400' }, // nunca por debajo de 11
};

// Sombra suave de la tarjeta. En Android `shadow*` no hace nada: ahí manda
// `elevation`, que se ve más dura; el 3 se eligió mirando el emulador.
export const sombra = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 18,
  elevation: 3,
};
