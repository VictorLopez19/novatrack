// Pruebas de la lógica de los mandos VR (sin navegador ni visor): node tests/controlVR.test.mjs
import assert from 'node:assert/strict';
import {
  BOTONES, CUERPO, PANTALLA, TAPA, PALANCA, MAPA_PALANCAS,
  DetectorPulsacion, DetectorPinza, DireccionPalanca, inclinacionDesdeMano,
} from '../assets/js/dominio/controlVR.js';

let ok = 0;
const prueba = (n, f) => { f(); ok += 1; console.log('✔', n); };
const boton = (id) => BOTONES.find((b) => b.id === id);
const punta = (b, z, id = 'mano0') => ({ id, x: b.x, y: b.y, z });
const arriba = TAPA.alto + 0.02;   // dedo sobre el botón
const hundido = TAPA.alto - 0.006; // dedo hundiendo la tapa

// ---------- Panel de botones ----------
prueba('los botones no se enciman, caben en el panel y no tapan la pantalla', () => {
  for (const a of BOTONES) {
    assert.ok(Math.abs(a.x) + a.r <= CUERPO.ancho / 2, `${a.id} sale por el lado`);
    assert.ok(Math.abs(a.y) + a.r <= CUERPO.alto / 2, `${a.id} sale por arriba/abajo`);
    const tapaPantalla = Math.abs(a.x) - a.r < PANTALLA.ancho / 2 && Math.abs(a.y - PANTALLA.y) - a.r < PANTALLA.alto / 2;
    assert.ok(!tapaPantalla, `${a.id} tapa la pantalla`);
    for (const b of BOTONES) {
      if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.008, `${a.id} y ${b.id} muy juntos`);
    }
  }
});

prueba('ya no hay botones de movimiento: se manejan con las palancas', () => {
  assert.ok(!BOTONES.some((b) => b.tipo === 'mov'));
  const claves = Object.values(MAPA_PALANCAS).flatMap((m) => Object.values(m));
  for (const k of ['AVANZAR', 'RETROCEDER', 'IZQUIERDA', 'DERECHA', 'BRAZO_SUBIR', 'BRAZO_BAJAR', 'GARRA_IZQUIERDA', 'GARRA_DERECHA']) {
    assert.ok(claves.includes(k), `${k} no tiene palanca`);
  }
});

prueba('acercarse por arriba y hundir pulsa; subir suelta', () => {
  const d = new DetectorPulsacion();
  const lu = boton('LUCES');
  assert.equal(d.actualizar([punta(lu, arriba)]).pulsar.length, 0);
  assert.deepEqual(d.actualizar([punta(lu, hundido)]).pulsar, [lu]);
  assert.equal(d.actualizar([punta(lu, hundido)]).pulsar.length, 0, 'no repite mientras se mantiene');
  assert.deepEqual(d.actualizar([punta(lu, arriba)]).soltar, [lu]);
});

prueba('entrar por el lado o por detrás no pulsa', () => {
  const d = new DetectorPulsacion();
  const det = boton('DETENER');
  assert.equal(d.actualizar([punta(det, hundido)]).pulsar.length, 0);
  assert.equal(d.actualizar([punta(det, -0.01)]).pulsar.length, 0);
});

prueba('si la mano desaparece se suelta lo presionado', () => {
  const d = new DetectorPulsacion();
  const lu = boton('LUCES');
  d.actualizar([punta(lu, arriba)]);
  d.actualizar([punta(lu, hundido)]);
  assert.deepEqual(d.actualizar([]).soltar, [lu]);
});

prueba('pinza con histéresis', () => {
  const p = new DetectorPinza({ cierra: 0.02, abre: 0.035 });
  assert.equal(p.actualizar(0.05), false);
  assert.equal(p.actualizar(0.015), true);
  assert.equal(p.actualizar(0.03), true, 'sigue cerrada entre los umbrales');
  assert.equal(p.actualizar(0.04), false);
  assert.equal(p.actualizar(NaN), false);
});

// ---------- Palancas ----------
const L = PALANCA.largo;
prueba('la mano al frente inclina hacia adelante; atrás, hacia atrás; a la izquierda, a la izquierda', () => {
  assert.ok(inclinacionDesdeMano(0, L, -0.06).rx < 0);
  assert.ok(inclinacionDesdeMano(0, L, 0.06).rx > 0);
  assert.ok(inclinacionDesdeMano(-0.06, L, 0).rz > 0);
  assert.ok(inclinacionDesdeMano(0.06, L, 0).rz < 0);
});

prueba('la inclinación nunca pasa del máximo', () => {
  const { rx, rz } = inclinacionDesdeMano(-1, 0.01, -1);
  assert.equal(rx, -PALANCA.maxAngulo);
  assert.equal(rz, PALANCA.maxAngulo);
});

prueba('zona muerta: un temblor cerca del centro no mueve', () => {
  const d = new DireccionPalanca();
  assert.equal(d.actualizar(0.05, -0.04), null);
});

prueba('dirección dominante y un solo eje a la vez', () => {
  const d = new DireccionPalanca();
  assert.equal(d.actualizar(-0.3, 0.1), 'adelante');
  const d2 = new DireccionPalanca();
  assert.equal(d2.actualizar(0.1, -0.3), 'derecha');
});

prueba('histéresis: al regresar un poco no se suelta, al volver al centro sí', () => {
  const d = new DireccionPalanca();
  assert.equal(d.actualizar(-0.2, 0), 'adelante');
  assert.equal(d.actualizar(-PALANCA.zonaMuerta + 0.02, 0), 'adelante');
  assert.equal(d.actualizar(-0.03, 0), null);
});

prueba('mapa de la palanca derecha como en una excavadora: atrás sube el brazo', () => {
  assert.equal(MAPA_PALANCAS.der.atras, 'BRAZO_SUBIR');
  assert.equal(MAPA_PALANCAS.izq.adelante, 'AVANZAR');
});

console.log(`\n${ok} pruebas de los mandos VR OK`);
