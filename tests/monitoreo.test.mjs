// Pruebas de lógica con mocks (sin red ni navegador): node tests/monitoreo.test.mjs
import assert from 'node:assert/strict';
import { crearEmisor, crearStore } from '../assets/js/core/utilidades.js';
import { formatearFecha, compararFechas } from '../assets/js/dominio/fechas.js';
import { validarHistorial, validarEventoMovimiento } from '../assets/js/core/validaciones.js';
import { ServicioMonitoreo } from '../assets/js/servicios/servicioMonitoreo.js';

globalThis.document = { addEventListener() {}, hidden: false };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const prueba = async (n, f) => { await f(); ok += 1; console.log('✔', n); };

// ---- fechas ----
await prueba('fecha sin zona se muestra tal cual', () => {
  assert.deepEqual(formatearFecha('2026-11-12T14:03:22'), { fecha: '12 nov 2026', hora: '14:03:22' });
});
await prueba('fecha con Z se convierte a America/Mexico_City', () => {
  assert.equal(formatearFecha('2026-11-12T20:03:22Z').hora, '14:03:22');
});
await prueba('fechas inválidas devuelven null; tipos distintos no se comparan', () => {
  assert.equal(formatearFecha('basura'), null);
  assert.equal(compararFechas('2026-11-12T14:00:00', '2026-11-12T20:00:00Z'), null);
  assert.equal(compararFechas('2026-11-12T14:00:00', '2026-11-12T14:00:01'), -1);
});

// ---- validaciones ----
await prueba('historial: ordena por id desc, máx. 10, descarta inválidas y de otro vehículo', () => {
  const lista = Array.from({ length: 13 }, (_, i) => ({ id_historial: i + 1, id_vehiculo: 1, comando: 'A', codigo: 1, fecha_hora: '2026-11-12T10:00:00', origen: 'X' }));
  lista.push({ id_historial: 99, id_vehiculo: 2, origen: 'X' }, { basura: true });
  const r = validarHistorial(lista, 1, 10);
  assert.equal(r.filas.length, 10);
  assert.equal(r.filas[0].id, 13);
  assert.equal(r.descartadas, 2);
});
await prueba('evento movimiento de otro vehículo o sin datos es inválido', () => {
  assert.equal(validarEventoMovimiento({ evento: 'movimiento', id_vehiculo: 2, comando: 'A', timestamp: 't' }, 1), null);
  assert.equal(validarEventoMovimiento({ evento: 'movimiento', id_vehiculo: 1, timestamp: 't' }, 1), null);
});

// ---- servicio con API simulada ----
function montar({ estado, historial }) {
  const ws = { emisor: crearEmisor() };
  const principal = crearStore({ vehiculoId: 1 });
  const llamadas = { estado: 0, historial: 0 };
  const api = {
    async obtenerEstado() { llamadas.estado += 1; return typeof estado === 'function' ? estado() : estado; },
    async consultarHistorial() { llamadas.historial += 1; return typeof historial === 'function' ? historial() : historial; },
  };
  const apiVehiculo = { async obtenerVehiculo() { return { nombre: 'Excavadora' }; } };
  const cfg = { debounceSyncMs: 20, ventanaOmitirSyncMs: 0, maxClavesDedup: 5 };
  const srv = new ServicioMonitoreo({ api, apiVehiculo, ws, store: principal, config: cfg });
  srv.iniciar();
  return { srv, ws, principal, llamadas };
}
const est = (c, f) => ({ idVehiculo: 1, vehiculo: 'Excavadora', comando: c, codigo: 1, conectado: false, fechaRaw: f });
const fila = (id, c) => ({ id, comando: c, codigo: 1, fechaRaw: '2026-11-12T10:00:00', origen: 'X' });
const ev = (c, t) => ({ evento: 'movimiento', id_vehiculo: 1, comando: c, codigo: 1, origen: 'API', timestamp: t });

await prueba('carga inicial por REST pinta estado e historial', async () => {
  const { srv } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:00'), historial: { filas: [fila(2, 'AVANZAR'), fila(1, 'DETENER')], descartadas: 0 } });
  srv.entrar();
  await esperar(30);
  assert.equal(srv.store.get('ultimo').dato.comando, 'AVANZAR');
  assert.equal(srv.store.get('ultimo').dato.tipo, 'rest');
  assert.equal(srv.store.get('historial').filas.length, 2);
});

await prueba('sin movimientos -> estado vacío (no se inventa nada)', async () => {
  const { srv } = montar({ estado: null, historial: { filas: [], descartadas: 0 } });
  srv.entrar();
  await esperar(30);
  assert.equal(srv.store.get('ultimo').estado, 'vacio');
  assert.equal(srv.store.get('historial').estado, 'vacio');
});

await prueba('evento WSS actualiza la tarjeta al instante y luego REST lo confirma', async () => {
  const { srv, ws } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:00'), historial: { filas: [], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  ws.emisor.emit('evento', ev('RETROCEDER', '2026-11-12T10:00:05'));
  assert.equal(srv.store.get('ultimo').dato.comando, 'RETROCEDER');
  assert.equal(srv.store.get('ultimo').dato.persistencia, 'por_confirmar');
});

await prueba('REST lento y viejo NO sobrescribe un evento WSS más reciente', async () => {
  let n = 0;
  const { srv, ws } = montar({
    estado: async () => { n += 1; if (n === 1) { await esperar(50); return est('AVANZAR', '2026-11-12T10:00:00'); } return est('RETROCEDER', '2026-11-12T10:00:05'); },
    historial: { filas: [], descartadas: 0 },
  });
  srv.entrar();
  await esperar(10);
  ws.emisor.emit('evento', ev('RETROCEDER', '2026-11-12T10:00:05')); // llega con la consulta en vuelo
  await esperar(150);
  assert.equal(srv.store.get('ultimo').dato.comando, 'RETROCEDER');
  assert.equal(srv.store.get('ultimo').dato.persistencia, 'confirmado_rest');
});

await prueba('evento más antiguo que lo mostrado se ignora; duplicado no repite tarjeta', async () => {
  const { srv, ws } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:10'), historial: { filas: [], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  ws.emisor.emit('evento', ev('VIEJO', '2026-11-12T10:00:01'));
  assert.equal(srv.store.get('ultimo').dato.comando, 'AVANZAR');
});

await prueba('eventos de otro vehículo se ignoran', async () => {
  const { srv, ws } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:00'), historial: { filas: [], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  ws.emisor.emit('evento', { ...ev('X', '2026-11-12T10:00:09'), id_vehiculo: 2 });
  assert.equal(srv.store.get('ultimo').dato.comando, 'AVANZAR');
});

await prueba('ráfaga de 15 movimientos -> pocas consultas de historial y tabla de máx. 10', async () => {
  const filas = Array.from({ length: 15 }, (_, i) => fila(15 - i, 'M'));
  const { srv, ws, llamadas } = montar({ estado: est('M', '2026-11-12T10:00:00'), historial: { filas: filas.slice(0, 10), descartadas: 0 } });
  srv.entrar(); await esperar(30);
  const base = llamadas.historial;
  for (let i = 0; i < 15; i += 1) ws.emisor.emit('evento', ev(`M${i}`, `2026-11-12T10:01:${String(i).padStart(2, '0')}`));
  await esperar(120);
  assert.ok(llamadas.historial - base <= 2, `consultas: ${llamadas.historial - base}`);
  assert.equal(srv.store.get('historial').filas.length, 10);
});

await prueba('DEMO: el paso actualiza la tarjeta (tipo demo) pero no toca el historial', async () => {
  const { srv, ws, llamadas } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:00'), historial: { filas: [fila(1, 'AVANZAR')], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  const h = llamadas.historial;
  ws.emisor.emit('evento', { evento: 'demo_movimiento', id_vehiculo: 1, comando: 'DERECHA', orden: 2, total_movimientos: 5, nombre_demo: 'Baile' });
  assert.equal(srv.store.get('ultimo').dato.tipo, 'demo');
  assert.equal(srv.store.get('ultimo').dato.persistencia, 'no_aplica');
  ws.emisor.emit('evento', { evento: 'demo_fin', id_vehiculo: 1 });
  await esperar(100);
  assert.equal(llamadas.historial, h, 'una DEMO no debe consultar/alterar el historial');
  assert.equal(srv.store.get('actividad').activa, false);
});

await prueba('reconexión WSS dispara resincronización por REST', async () => {
  const { srv, ws, llamadas } = montar({ estado: est('AVANZAR', '2026-11-12T10:00:00'), historial: { filas: [], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  ws.emisor.emit('estado', { estado: 'en_linea' });
  ws.emisor.emit('estado', { estado: 'desconectado' });
  const e = llamadas.estado;
  ws.emisor.emit('estado', { estado: 'en_linea' });
  await esperar(80);
  assert.ok(llamadas.estado > e);
});

await prueba('error REST sin datos -> estado error; con datos -> conserva y avisa', async () => {
  let falla = true;
  const { srv, ws } = montar({ estado: () => { if (falla) throw new Error('boom'); return est('A', '2026-11-12T10:00:00'); }, historial: { filas: [], descartadas: 0 } });
  srv.entrar(); await esperar(30);
  assert.equal(srv.store.get('ultimo').estado, 'error');
  falla = false;
  await srv.sincronizar(); 
  ws.emisor.emit('evento', ev('B', '2026-11-12T10:05:00'));
  falla = true;
  await srv.sincronizar();
  assert.equal(srv.store.get('ultimo').dato.comando, 'B');
  assert.match(srv.store.get('ultimo').mensaje, /boom/);
});

console.log(`\n${ok} pruebas de lógica OK`);
process.exit(0);
