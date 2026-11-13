// Pruebas de la lógica del control VR (sin navegador ni visor): node tests/controlVR.test.mjs
import assert from 'node:assert/strict';
import { BOTONES, CUERPO, ASA, TAPA, DetectorPulsacion, DetectorPinza, cercaDelAsa } from '../assets/js/dominio/controlVR.js';

let ok = 0;
const prueba = (n, f) => { f(); ok += 1; console.log('✔', n); };
const boton = (id) => BOTONES.find((b) => b.id === id);
const punta = (b, z, id = 'mano0') => ({ id, x: b.x, y: b.y, z });
const arriba = TAPA.alto + 0.02;   // dedo sobre el botón
const hundido = TAPA.alto - 0.007; // dedo hundiendo la tapa

prueba('los botones no se encimen y caben en el cuerpo', () => {
  for (const a of BOTONES) {
    assert.ok(Math.abs(a.x) + a.r <= CUERPO.ancho / 2, `${a.id} sale por el lado`);
    assert.ok(Math.abs(a.y) + a.r <= CUERPO.alto / 2, `${a.id} sale por arriba/abajo`);
    for (const b of BOTONES) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.008, `${a.id} y ${b.id} muy juntos`);
    }
  }
});

prueba('acercarse por arriba y hundir pulsa; subir suelta', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  assert.equal(d.actualizar([punta(av, arriba)]).pulsar.length, 0);
  assert.deepEqual(d.actualizar([punta(av, hundido)]).pulsar, [av]);
  assert.equal(d.actualizar([punta(av, hundido)]).pulsar.length, 0, 'no repite mientras se mantiene');
  assert.deepEqual(d.actualizar([punta(av, arriba)]).soltar, [av]);
});

prueba('entrar por el lado o por detrás no pulsa', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  assert.equal(d.actualizar([punta(av, hundido)]).pulsar.length, 0);
  assert.equal(d.actualizar([punta(av, -0.01)]).pulsar.length, 0);
});

prueba('histéresis: un temblor pequeño no suelta el botón', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  d.actualizar([punta(av, arriba)]);
  d.actualizar([punta(av, hundido)]);
  const r = d.actualizar([punta(av, TAPA.alto - 0.0045)]);
  assert.equal(r.soltar.length, 0);
});

prueba('si la mano desaparece se suelta lo presionado', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  d.actualizar([punta(av, arriba)]);
  d.actualizar([punta(av, hundido)]);
  assert.deepEqual(d.actualizar([]).soltar, [av]);
});

prueba('deslizar el dedo fuera del botón lo suelta', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  d.actualizar([punta(av, arriba)]);
  d.actualizar([punta(av, hundido)]);
  assert.deepEqual(d.actualizar([{ id: 'mano0', x: av.x + 0.05, y: av.y, z: hundido }]).soltar, [av]);
});

prueba('dos manos en botones distintos se reportan por separado', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR'); const lu = boton('LUCES');
  d.actualizar([punta(av, arriba, 'mano0'), punta(lu, arriba, 'mano1')]);
  const r = d.actualizar([punta(av, hundido, 'mano0'), punta(lu, hundido, 'mano1')]);
  assert.equal(r.pulsar.length, 2);
});

prueba('el hundimiento visual nunca pasa del recorrido de la tapa', () => {
  const d = new DetectorPulsacion();
  const av = boton('AVANZAR');
  d.actualizar([punta(av, arriba)]);
  const r = d.actualizar([punta(av, -0.005)]);
  assert.equal(r.hundimiento.get('AVANZAR'), TAPA.recorrido);
});

prueba('pinza con histéresis', () => {
  const p = new DetectorPinza({ cierra: 0.02, abre: 0.035 });
  assert.equal(p.actualizar(0.05), false);
  assert.equal(p.actualizar(0.015), true);
  assert.equal(p.actualizar(0.03), true, 'sigue cerrada entre los umbrales');
  assert.equal(p.actualizar(0.04), false);
  assert.equal(p.actualizar(NaN), false);
});

prueba('cerca del asa sí; en medio del control no', () => {
  assert.equal(cercaDelAsa(0, ASA.y, CUERPO.grosor / 2), true);
  assert.equal(cercaDelAsa(ASA.largo / 2 + 0.02, ASA.y, CUERPO.grosor / 2), true);
  assert.equal(cercaDelAsa(0, 0, CUERPO.grosor / 2), false);
});

console.log(`\n${ok} pruebas del control VR OK`);
