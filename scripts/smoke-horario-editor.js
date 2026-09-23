#!/usr/bin/env node
// ============================================================================
// scripts/smoke-horario-editor.js — el editor de horario sin teclado
//
//     npm run smoke:horario
//
// Las horas se eligen tocando y el horario de un día se puede copiar a los
// demás. Aquí se comprueba lo que no se ve a simple vista: que copiar NO abra
// un día cerrado, que no toque el día de origen, que la etiqueta "9:00 a.m."
// no se equivoque con la medianoche y el mediodía, y que un minuto raro
// guardado antes (09:10) no desaparezca del selector.
// ============================================================================
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const archivo = path.join(__dirname, '..', 'src', 'utils', 'horarioEditor.js');
const { code } = babel.transformSync(fs.readFileSync(archivo, 'utf8'), {
  babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { etiquetaHora, HORAS, minutosPara, partesHora, copiarHorario } = mod.exports;

let fallos = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ✓ ' + msg);
  else { fallos++; console.log('  ✗ ' + msg); }
}

console.log('\nEtiquetas de hora');
ok(etiquetaHora('09:00') === '9:00 a.m.', '09:00 → 9:00 a.m.');
ok(etiquetaHora('00:30') === '12:30 a.m.', 'medianoche → 12:30 a.m.');
ok(etiquetaHora('12:00') === '12:00 p.m.', 'mediodía → 12:00 p.m.');
ok(etiquetaHora('23:45') === '11:45 p.m.', '23:45 → 11:45 p.m.');
ok(etiquetaHora('') === '—', 'vacío → guion, no "undefined"');
ok(HORAS.length === 24 && HORAS[0].texto === '12 a.m.' && HORAS[13].texto === '1 p.m.', 'las 24 horas del selector');

console.log('\nMinutos');
ok(minutosPara('09:00').join() === '00,15,30,45', 'los cuatro de siempre');
ok(minutosPara('09:10').includes('10'), 'un minuto guardado a mano (09:10) sigue elegible');
ok(partesHora('7:05').h === '07' && partesHora('7:05').m === '05', '"7:05" se separa en 07 y 05');
ok(partesHora('basura').h === '09', 'basura cae a 09:00, no revienta');

console.log('\nCopiar a los demás días');
const semana = [
  { cerrado: true, abre: '10:00', cierra: '14:00' },        // domingo cerrado
  { cerrado: false, abre: '08:00', cierra: '22:00' },       // lunes, el que se copia
  { cerrado: false, abre: '09:00', cierra: '18:00' },
  { cerrado: false, abre: '09:00', cierra: '18:00' },
  { cerrado: false, abre: '09:00', cierra: '18:00' },
  { cerrado: false, abre: '09:00', cierra: '18:00' },
  { cerrado: false, abre: '09:00', cierra: '18:00' },
];
const r = copiarHorario(semana, 1);
ok(r.semana.slice(2).every(d => d.abre === '08:00' && d.cierra === '22:00'), 'martes a sábado reciben 8–22');
ok(r.semana[0].cerrado === true, 'el domingo cerrado SIGUE cerrado');
ok(r.semana[0].abre === '08:00', '…pero ya trae las horas nuevas para cuando lo abras');
ok(r.cambiados === 5, 'cuenta 5 días abiertos cambiados');
ok(semana[2].abre === '09:00', 'no modifica la semana original');
ok(copiarHorario(semana, 0).cambiados === 0, 'copiar desde un día cerrado no hace nada');

console.log(`\n${total - fallos}/${total} comprobaciones`);
process.exit(fallos ? 1 : 0);
