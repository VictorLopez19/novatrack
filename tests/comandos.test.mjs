// Pruebas del catálogo y del encendido/apagado en los distintos modos (sin red ni navegador):
//   node tests/comandos.test.mjs
import assert from 'node:assert/strict';
import { CONFIG } from '../assets/js/config.js';
import { crearEmisor, crearStore } from '../assets/js/core/utilidades.js';
import { CatalogoComandos } from '../assets/js/dominio/catalogo.js';
import { ServicioComandos } from '../assets/js/servicios/servicioComandos.js';
import { interpretarDirecto } from '../assets/js/dominio/voz.js';
import { FiltroGestos } from '../assets/js/dominio/gestos.js';
import { BOTONES } from '../assets/js/dominio/controlVR.js';
import { Botonera } from '../assets/js/ui/botonera.js';

let ok = 0;
const prueba = async (n, f) => { await f(); ok += 1; console.log('✔', n); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Catálogo real del vehículo 1 (tabla `comandos`): los ids cambiaron al separar encender y apagar.
const CATALOGO = [
  { id_comando: 1, nombre: 'AVANZAR', codigo: 1, activo: 1 },
  { id_comando: 2, nombre: 'RETROCEDER', codigo: 2, activo: 1 },
  { id_comando: 3, nombre: 'GIRAR_IZQUIERDA', codigo: 3, activo: 1 },
  { id_comando: 4, nombre: 'GIRAR_DERECHA', codigo: 4, activo: 1 },
  { id_comando: 5, nombre: 'SUBIR_BRAZO', codigo: 5, activo: 1 },
  { id_comando: 6, nombre: 'BAJAR_BRAZO', codigo: 6, activo: 1 },
  { id_comando: 7, nombre: 'GIRAR_GARRA_IZQUIERDA', codigo: 7, activo: 1 },
  { id_comando: 8, nombre: 'GIRAR_GARRA_DERECHA', codigo: 8, activo: 1 },
  { id_comando: 9, nombre: 'SONIDO', codigo: 9, activo: 1 },
  { id_comando: 10, nombre: 'VELOCIDAD', codigo: 10, activo: 1 },
  { id_comando: 11, nombre: 'LUZ', codigo: 11, activo: 1 },
  { id_comando: 12, nombre: 'ENCENDER', codigo: 12, activo: 1 },
  { id_comando: 13, nombre: 'APAGAR', codigo: 13, activo: 1 },
  { id_comando: 14, nombre: 'DETENER', codigo: 0, activo: 1 },
];

// ---------------------------- CATÁLOGO ----------------------------
await prueba('cada clave lógica resuelve al comando y al id correctos', () => {
  const cat = new CatalogoComandos(CONFIG.comandos);
  cat.cargar(CATALOGO);

  const esperado = {
    AVANZAR: 1, RETROCEDER: 2, IZQUIERDA: 3, DERECHA: 4,
    BRAZO_SUBIR: 5, BRAZO_BAJAR: 6, GARRA_IZQUIERDA: 7, GARRA_DERECHA: 8,
    SONIDO: 9, VELOCIDAD: 10, LUCES: 11, ENCENDER: 12, APAGAR: 13, DETENER: 14,
  };

  for (const [clave, id] of Object.entries(esperado)) {
    const cmd = cat.resolver(clave);
    assert.ok(cmd, `${clave} no se resuelve en el catálogo`);
    assert.equal(cmd.id_comando, id, `${clave} resolvió al id ${cmd.id_comando} y no al ${id}`);
  }
});

await prueba('no falta ninguna clave que usen los controles', () => {
  const cat = new CatalogoComandos(CONFIG.comandos);
  cat.cargar(CATALOGO);

  const usadas = new Set([
    ...Object.values(CONFIG.joysticks).flatMap((j) => Object.values(j.mapa)),
    ...CONFIG.botones.filter((b) => b.clave).flatMap((b) => [b.clave, b.claveLarga].filter(Boolean)),
    ...Object.keys(CONFIG.voz.palabras),
    ...CONFIG.gestos.unicos,
    ...Object.values(CONFIG.gestos.mapa).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ...BOTONES.filter((b) => b.clave).flatMap((b) => [b.clave, b.claveLarga].filter(Boolean)),
  ]);

  assert.deepEqual(cat.faltantes([...usadas]), [], 'hay claves sin comando en el catálogo');
});

await prueba('DETENER se resuelve por código 0 aunque cambie su id', () => {
  const cat = new CatalogoComandos(CONFIG.comandos);
  cat.cargar(CATALOGO.map((c) => (c.nombre === 'DETENER' ? { ...c, id_comando: 99 } : c)));
  assert.equal(cat.resolver('DETENER').id_comando, 99);
});

// ------------------------------ VOZ ------------------------------
await prueba('la voz distingue encender, apagar y las luces', () => {
  const dicho = (t) => interpretarDirecto(t, CONFIG.voz);

  assert.deepEqual(dicho('enciende'), { tipo: 'directo', clave: 'ENCENDER' });
  assert.deepEqual(dicho('prende la excavadora'), { tipo: 'directo', clave: 'ENCENDER' });
  assert.deepEqual(dicho('apaga'), { tipo: 'directo', clave: 'APAGAR' });
  assert.deepEqual(dicho('apaga la excavadora'), { tipo: 'directo', clave: 'APAGAR' });

  // Las luces siguen teniendo sus propias frases y no se confunden con el encendido.
  assert.deepEqual(dicho('luces'), { tipo: 'directo', clave: 'LUCES' });
  assert.deepEqual(dicho('enciende las luces'), { tipo: 'directo', clave: 'LUCES' });
  assert.deepEqual(dicho('apaga las luces'), { tipo: 'directo', clave: 'LUCES' });
});

await prueba('la voz no rompió los demás comandos', () => {
  const dicho = (t) => interpretarDirecto(t, CONFIG.voz);
  assert.deepEqual(dicho('avanza'), { tipo: 'directo', clave: 'AVANZAR' });
  assert.deepEqual(dicho('alto'), { tipo: 'directo', clave: 'DETENER' });
  assert.deepEqual(dicho('garra izquierda'), { tipo: 'directo', clave: 'GARRA_IZQUIERDA' });
  assert.equal(dicho('haz un baile').tipo, 'ia');
});

await prueba('los movimientos sostenidos de voz usan las claves del catálogo', () => {
  const cat = new CatalogoComandos(CONFIG.comandos);
  cat.cargar(CATALOGO);
  for (const clave of CONFIG.voz.movimientos) {
    assert.ok(cat.resolver(clave), `${clave} de voz.movimientos no existe como clave lógica`);
  }
});

// ----------------------------- GESTOS -----------------------------
await prueba('cuernitos enciende; mantenerlo apaga una sola vez', () => {
  const cfg = CONFIG.gestos;
  const filtro = new FiltroGestos(cfg);

  // Primero hay que «armar» mostrando la palma (DETENER).
  for (let i = 0; i < cfg.framesParada; i += 1) filtro.actualizar(null, 1000 + i * 50);

  const acciones = [];
  const total = cfg.framesUnico + cfg.framesSostenido + 4;
  for (let i = 0; i < total; i += 1) {
    const a = filtro.actualizar('ENCENDER', 5000 + i * 50);
    if (a) acciones.push(a);
  }

  assert.deepEqual(acciones.map((a) => a.clave), ['ENCENDER', 'APAGAR'],
    'el gesto mantenido debe encender y luego apagar');
  assert.equal(acciones[1].sostenido, true);
});

await prueba('un gesto distinto reinicia la pulsación mantenida', () => {
  const cfg = CONFIG.gestos;
  const filtro = new FiltroGestos(cfg);
  for (let i = 0; i < cfg.framesParada; i += 1) filtro.actualizar(null, i * 50);

  const correr = (clave, veces, t0) => {
    const r = [];
    for (let i = 0; i < veces; i += 1) {
      const a = filtro.actualizar(clave, t0 + i * 50);
      if (a) r.push(a.clave);
    }
    return r;
  };

  assert.deepEqual(correr('ENCENDER', cfg.framesUnico, 1000), ['ENCENDER'], 'toque corto: solo enciende');
  assert.deepEqual(correr('SONIDO', cfg.framesUnico, 5000), ['SONIDO']);
  assert.deepEqual(correr('ENCENDER', cfg.framesUnico, 9000), ['ENCENDER'], 'vuelve a poder encender');
});

// ------------------------------- VR -------------------------------
await prueba('el botón de encendido de la cabina VR tiene las dos órdenes', () => {
  const b = BOTONES.find((x) => x.id === 'ENCENDIDO');
  assert.equal(b.clave, 'ENCENDER');
  assert.equal(b.claveLarga, 'APAGAR');
  assert.ok(CONFIG.vr.largoMs > 0, 'falta vr.largoMs');
});

// --------------------------- BOTONERA ---------------------------
// DOM mínimo: solo lo que usa Botonera.
class Nodo {
  constructor(tag = 'div') {
    this.tag = tag;
    this.hijos = [];
    this.dataset = {};
    this.className = '';
    this.title = '';
    this.disabled = false;
    this.atributos = {};
    this.oyentes = {};
    this.style = { setProperty() { } };
  }
  append(...n) { this.hijos.push(...n); }
  setAttribute(k, v) { this.atributos[k] = v; }
  addEventListener(tipo, fn) { (this.oyentes[tipo] ??= []).push(fn); }
  disparar(tipo, ev = {}) {
    for (const fn of [...(this.oyentes[tipo] ?? [])]) fn({ preventDefault() { }, ...ev });
  }
}
globalThis.document = { createElement: (tag) => new Nodo(tag) };

function montar({ largoMs = 60 } = {}) {
  const enviados = [];
  const cat = new CatalogoComandos(CONFIG.comandos);
  cat.cargar(CATALOGO);

  const store = crearStore({ vehiculoId: 1, modo: 'manual', demo: { estado: 'libre' }, mensaje: null });
  const emisor = crearEmisor();
  const servicio = new ServicioComandos({
    api: {
      registrarMovimiento: async (idVehiculo, idComando, origen) => {
        enviados.push({ idVehiculo, idComando, origen });
        return { comando: 'ok' };
      },
    },
    catalogo: cat, store, cancelarDemo: async () => { }, emisor,
  });

  const cont = new Nodo();
  const botonera = new Botonera(cont, {
    botones: CONFIG.botones, servicio, store, emisor,
    alDemo() { }, alVoz() { }, vozOk: true, alGestos() { }, gestosOk: true,
    alGiro() { }, giroOk: true, alVr() { }, vrOk: () => true, largoMs,
  });

  // Localiza el botón de encendido por su etiqueta.
  const indice = CONFIG.botones.findIndex((b) => b.claveLarga);
  const items = cont.hijos.flatMap((fila) => fila.hijos);
  const btn = items.map((it) => it.hijos[0])
    .find((b) => b.atributos['aria-label']?.startsWith('Encendido'));

  return { enviados, btn, botonera, servicio, indice };
}

await prueba('la botonera define el encendido con pulsación larga', () => {
  const b = CONFIG.botones.find((x) => x.claveLarga);
  assert.ok(b, 'ningún botón tiene claveLarga');
  assert.equal(b.clave, 'ENCENDER');
  assert.equal(b.claveLarga, 'APAGAR');
});

await prueba('un toque en el botón envía ENCENDER (id 12)', async () => {
  const { enviados, btn } = montar();
  assert.ok(btn, 'no se encontró el botón de encendido');

  btn.disparar('pointerdown');
  btn.disparar('pointerup');
  await esperar(30);

  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].idComando, 12, 'debe enviar el id de ENCENDER');
});

await prueba('mantener pulsado el botón envía APAGAR (id 13) y no ENCENDER', async () => {
  const { enviados, btn } = montar();

  btn.disparar('pointerdown');
  await esperar(120);          // se cumple el tiempo de la pulsación larga
  btn.disparar('pointerup');
  await esperar(30);

  assert.equal(enviados.length, 1, 'no debe enviar las dos órdenes');
  assert.equal(enviados[0].idComando, 13, 'debe enviar el id de APAGAR');
});

await prueba('sacar el dedo del botón antes de tiempo no envía nada', async () => {
  const { enviados, btn } = montar();

  btn.disparar('pointerdown');
  btn.disparar('pointerleave');
  await esperar(120);

  assert.deepEqual(enviados, []);
});

await prueba('el teclado también enciende y apaga', async () => {
  const { enviados, btn } = montar();

  btn.disparar('keydown', { key: 'Enter' });
  btn.disparar('keyup', { key: 'Enter' });
  await esperar(30);
  assert.equal(enviados.at(-1).idComando, 12, 'Enter corto enciende');

  btn.disparar('keydown', { key: ' ' });
  btn.disparar('keydown', { key: ' ', repeat: true });
  await esperar(120);
  btn.disparar('keyup', { key: ' ' });
  await esperar(30);
  assert.equal(enviados.at(-1).idComando, 13, 'Espacio mantenido apaga');
  assert.equal(enviados.length, 2);
});

console.log(`\n${ok} pruebas de comandos OK`);
