#!/usr/bin/env node
// ============================================================================
// scripts/smoke-solo-estilo.js — los DIENTES del guardián del rediseño.
//
// `revisar:estilo` dice "solo cambió la presentación". Esa frase no vale nada si
// el guardián no se da cuenta cuando SÍ cambia algo. Aquí se le meten a
// propósito los defectos que un rediseño puede colar sin querer, y cada uno
// tiene que tumbarlo:
//   · quitar un onPress
//   · cambiar a qué función llama un botón
//   · borrar un `disabled`
//   · tocar una llamada a la API o un hook
// Y lo contrario: un cambio que SOLO es estilo (color, envoltorio, texto,
// reacomodo) tiene que pasar, o el guardián estorba y alguien lo apaga.
//
// Se prueba sobre dos cosas: un componente de ejemplo, y el Resumen REAL (su
// versión del commit base contra la de hoy), con sus mutaciones aplicadas al
// archivo de hoy en memoria.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { compararFuentes } = require('./revisar-solo-estilo');

let fallos = 0;
let total = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ✅ ' + msg);
  else { fallos++; console.log('  ❌ ' + msg); }
}

/** Aplica un reemplazo y exige que de verdad cambie algo (§44.1: una mutación
 *  que no se aplica pasa en verde y parece que la prueba no sirve). */
function mutar(fuente, de, a) {
  if (!fuente.includes(de)) throw new Error(`La mutación no se aplicó: no está "${de.slice(0, 60)}"`);
  const r = fuente.replace(de, a);
  if (r === fuente) throw new Error('La mutación no cambió nada');
  return r;
}

// ─── 1. Ejemplo sintético ────────────────────────────────────────────────────
const BASE = `
import { api } from '../api/client';
import { registrarVenta } from '../offline/ventasOffline';
export default function Pantalla() {
  const [n, setN] = useState(0);
  const guardar = () => { api.guardar(n); registrarVenta(n); };
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ color: 'red' }}>Hola</Text>
      <TouchableOpacity onPress={guardar} disabled={n === 0}><Text>Guardar</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setN(n + 1)}><Text>Sumar</Text></TouchableOpacity>
    </View>
  );
}`;

console.log('\n── El guardián del rediseño, con dientes ──\n');
console.log('Ejemplo:');
const soloEstilo = BASE
  .replace("{ padding: 12 }", "{ padding: 18, backgroundColor: '#fff' }")
  .replace("{ color: 'red' }", "{ color: '#111827', fontWeight: '500' }")
  .replace('<Text>Guardar</Text>', '<Tarjeta><Icono nombre="mas" /><Text>Guardar venta</Text></Tarjeta>');
ok(compararFuentes(BASE, soloEstilo).length === 0, 'un cambio SOLO de estilo pasa');

const casos = [
  ['quitar un onPress', 'onPress={() => setN(n + 1)}', ''],
  ['cambiar a qué función llama un botón', 'onPress={guardar}', 'onPress={() => setN(0)}'],
  ['borrar un disabled', ' disabled={n === 0}', ''],
  ['cambiar una llamada a la API', 'api.guardar(n)', 'api.guardar(n + 1)'],
  ['cambiar lo que se manda a src/offline', 'registrarVenta(n)', 'registrarVenta(0)'],
  ['cambiar un hook', 'useState(0)', 'useState(1)'],
  ['cambiar una función de lógica', 'const guardar = () => { api.guardar(n); registrarVenta(n); };',
    'const guardar = () => { registrarVenta(n); api.guardar(n); };'],
];
for (const [nombre, de, a] of casos) {
  ok(compararFuentes(BASE, mutar(BASE, de, a)).length > 0, `atrapa: ${nombre}`);
}

// ─── 2. El Resumen real ──────────────────────────────────────────────────────
const RAIZ = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'estilo-base.json'), 'utf8'));
const ARCHIVO = 'src/screens/main/DashboardScreen.js';
let viejo = null;
try {
  viejo = execFileSync('git', ['show', `${cfg.base}:${ARCHIVO}`], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch { /* sin git o sin la base: se salta */ }

if (!viejo) {
  console.log('\n⚠️  No se encontró el Resumen del commit base: parte 2 saltada.');
} else {
  console.log('\nResumen real (base contra hoy):');
  const hoy = fs.readFileSync(path.join(RAIZ, ARCHIVO), 'utf8');
  ok(compararFuentes(viejo, hoy).length === 0, 'el rediseño del Resumen solo cambió presentación');
  const reales = [
    ['quitar el onPress de una alerta', 'onPress={() => setAuditDetalle(log)}', ''],
    ['que una alerta abra otra cosa', 'onPress={() => setAuditDetalle(log)}', 'onPress={() => setAuditDetalle(null)}'],
    ['que tirar para refrescar no recargue', 'onRefresh={() => load(true)}', 'onRefresh={() => {}}'],
    ['que cambiar de sucursal no recargue', 'load(false, id); }}', '}}'],
    ['que el modal no se pueda cerrar', 'onRequestClose={() => setAuditDetalle(null)}', ''],
    ['pedir menos auditoría', 'api.getAuditLogs({ limit: 10 })', 'api.getAuditLogs({ limit: 3 })'],
  ];
  for (const [nombre, de, a] of reales) {
    ok(compararFuentes(viejo, mutar(hoy, de, a)).length > 0, `atrapa: ${nombre}`);
  }
}

console.log(`\n${fallos ? '❌' : '✅'} ${total - fallos}/${total}\n`);
process.exit(fallos ? 1 : 0);
