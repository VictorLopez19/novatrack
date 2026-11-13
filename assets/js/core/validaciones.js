// Validación de lo que llega por REST y WSS. El JSON remoto no es confiable: todo se revisa y se acota.
import { ErrorApi } from '../api/clienteHttp.js';
import { esEnteroPositivo, esObjeto, textoSeguro } from './utilidades.js';

const EVENTOS_DEMO = new Set(['demo_inicio', 'demo_movimiento', 'demo_fin', 'demo_cancelada', 'demo_error']);

const textoONull = (v, max) => (typeof v === 'string' && v.trim() ? textoSeguro(v.trim(), max) : null);
const enteroONull = (v) => (Number.isInteger(v) ? v : null);

// GET /vehiculos/{id}/estado -> objeto, o null cuando el vehículo aún no tiene estado.
export function validarEstado(r) {
  if (r === null) return null;

  if (!esObjeto(r) || !esEnteroPositivo(r.id_vehiculo) || typeof r.conectado !== 'boolean') {
    throw new ErrorApi('formato', 'Estado del vehículo con formato inesperado.');
  }

  return {
    idVehiculo: r.id_vehiculo,
    vehiculo: textoONull(r.vehiculo, 80),
    comando: textoONull(r.comando, 60),
    codigo: enteroONull(r.codigo),
    conectado: r.conectado,
    fechaRaw: typeof r.fecha_actualizacion === 'string' ? r.fecha_actualizacion : null,
  };
}

// GET /vehiculos/{id}/historial -> filas válidas, más reciente primero, máximo `limite`.
// Orden: id_historial descendente (identificador real); no se confía en el orden de llegada.
export function validarHistorial(lista, idVehiculo, limite = 10) {
  if (!Array.isArray(lista)) throw new ErrorApi('formato', 'Historial con formato inesperado.');

  const filas = [];
  let descartadas = 0;

  for (const r of lista) {
    const valida = esObjeto(r)
      && esEnteroPositivo(r.id_historial)
      && r.id_vehiculo === idVehiculo
      && typeof r.origen === 'string';

    if (!valida) { descartadas += 1; continue; }

    filas.push({
      id: r.id_historial,
      comando: textoONull(r.comando, 60),
      codigo: enteroONull(r.codigo),
      fechaRaw: typeof r.fecha_hora === 'string' ? r.fecha_hora : null,
      origen: textoSeguro(r.origen, 30),
    });
  }

  filas.sort((a, b) => b.id - a.id);

  const unicas = [];
  const vistos = new Set();
  for (const f of filas) {
    if (vistos.has(f.id)) continue; // misma fila repetida: se ignora
    vistos.add(f.id);
    unicas.push(f);
  }

  return { filas: unicas.slice(0, limite), descartadas };
}

// Evento WSS `movimiento` del vehículo activo; devuelve el dato normalizado o null si no es válido.
export function validarEventoMovimiento(ev, idVehiculo) {
  if (!esObjeto(ev) || ev.evento !== 'movimiento') return null;
  if (ev.id_vehiculo !== idVehiculo || typeof ev.timestamp !== 'string') return null;

  const comando = textoONull(ev.comando, 60);
  const codigo = enteroONull(ev.codigo);
  if (comando === null && codigo === null) return null; // nada que mostrar

  return {
    idVehiculo: ev.id_vehiculo,
    comando,
    codigo,
    origen: typeof ev.origen === 'string' ? textoSeguro(ev.origen, 30) : null,
    timestamp: ev.timestamp,
  };
}

// Eventos WSS demo_* (DEMO u orden de IA) del vehículo activo.
export function validarEventoDemo(ev, idVehiculo) {
  if (!esObjeto(ev) || !EVENTOS_DEMO.has(ev.evento) || ev.id_vehiculo !== idVehiculo) return null;

  return {
    evento: ev.evento,
    modo: ev.modo === 'ia' ? 'ia' : 'demo',
    nombre: textoONull(ev.nombre_demo, 60),
    orden: enteroONull(ev.orden),
    total: enteroONull(ev.total_movimientos),
    comando: textoONull(ev.comando, 60),
    codigo: enteroONull(ev.codigo),
    mensaje: textoONull(ev.mensaje, 100),
    timestamp: typeof ev.timestamp === 'string' ? ev.timestamp : null,
  };
}
