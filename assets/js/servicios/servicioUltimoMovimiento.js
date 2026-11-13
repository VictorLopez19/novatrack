// Último movimiento/estado del vehículo.
// Fuentes: REST (GET /estado, persistido), WSS `movimiento` (en vivo) y WSS demo_movimiento (no es historial).
// Regla anti-obsolescencia: una respuesta REST que salió ANTES de un evento WSS nunca lo sobrescribe.
import { compararFechas } from '../dominio/fechas.js';
import { horaLocal } from '../core/utilidades.js';

export const ULTIMO_INICIAL = Object.freeze({ estado: 'cargando', dato: null, mensaje: '' });

export class ServicioUltimoMovimiento {
  #api; #store; #id; #max;
  #ctl = null;
  #gen = 0;
  #seq = 0;             // sube con cada actualización originada por WSS
  #claves = new Set();  // deduplicación de eventos (el evento no trae id único)

  constructor({ api, store, idVehiculo, maxClaves = 60 }) {
    this.#api = api; this.#store = store; this.#id = idVehiculo; this.#max = maxClaves;
  }

  cancelar() { this.#ctl?.abort(); this.#ctl = null; this.#gen += 1; }

  reiniciar() {
    this.cancelar();
    this.#seq = 0;
    this.#claves.clear();
    this.#store.set('ultimo', ULTIMO_INICIAL);
  }

  /** @returns {'ok'|'obsoleta'|'reintentar'|'error'} */
  async cargar() {
    const id = this.#id();
    if (!id) return 'obsoleta';

    this.#ctl?.abort();
    const ctl = new AbortController();
    this.#ctl = ctl;
    const gen = ++this.#gen;
    const seqInicio = this.#seq;

    const previo = this.#store.get('ultimo');
    if (!previo.dato) this.#store.set('ultimo', ULTIMO_INICIAL);

    try {
      const e = await this.#api.obtenerEstado(id, { senal: ctl.signal });
      if (gen !== this.#gen || id !== this.#id()) return 'obsoleta';

      // Llegó un evento WSS mientras se consultaba: la respuesta puede ser anterior. Se descarta y se repite.
      if (this.#seq !== seqInicio) return 'reintentar';

      if (!e || (e.comando === null && e.codigo === null)) {
        this.#store.set('ultimo', { estado: 'vacio', dato: null, mensaje: '' });
        return 'ok';
      }

      const actual = this.#store.get('ultimo').dato;
      const mismo = actual && actual.comando === e.comando && actual.codigo === e.codigo;

      // Nunca retroceder: si el dato mostrado es más nuevo (comparable), se conserva.
      if (actual && !mismo && compararFechas(e.fechaRaw, actual.fechaRaw) === -1) {
        this.#store.set('ultimo', { estado: 'listo', dato: actual, mensaje: '' });
        return 'ok';
      }

      const dato = (mismo && actual.tipo === 'wss')
        ? { ...actual, persistencia: 'confirmado_rest', conectado: e.conectado }
        : {
          comando: e.comando, codigo: e.codigo, origen: null, fechaRaw: e.fechaRaw, tipo: 'rest',
          recibido: horaLocal(), conectado: e.conectado, persistencia: 'confirmado_rest', paso: null,
        };

      this.#store.set('ultimo', { estado: 'listo', dato, mensaje: '' });
      return 'ok';
    } catch (err) {
      if (ctl.signal.aborted || gen !== this.#gen) return 'obsoleta';

      const conservado = this.#store.get('ultimo').dato;
      this.#store.set('ultimo', conservado
        ? { estado: 'listo', dato: conservado, mensaje: `No se pudo confirmar por REST: ${err.message}` }
        : { estado: 'error', dato: null, mensaje: err.message });
      return 'error';
    }
  }

  /** Evento WSS `movimiento` ya validado. @returns {'aplicado'|'duplicado'|'obsoleto'} */
  aplicarMovimiento(v) {
    const clave = [v.idVehiculo, v.codigo, v.comando, v.origen, v.timestamp].join('|');
    if (this.#claves.has(clave)) return 'duplicado';

    this.#claves.add(clave);
    if (this.#claves.size > this.#max) this.#claves.delete(this.#claves.values().next().value);

    const actual = this.#store.get('ultimo').dato;
    if (actual && compararFechas(v.timestamp, actual.fechaRaw) === -1) return 'obsoleto';

    this.#seq += 1;
    this.#store.set('ultimo', {
      estado: 'listo', mensaje: '',
      dato: {
        comando: v.comando, codigo: v.codigo, origen: v.origen, fechaRaw: v.timestamp, tipo: 'wss',
        recibido: horaLocal(), conectado: actual?.conectado ?? null, persistencia: 'por_confirmar', paso: null,
      },
    });
    return 'aplicado';
  }

  /** Paso de DEMO u orden de IA: refleja el estado en vivo, pero NO es una fila del historial. */
  aplicarPasoDemo(v) {
    if (v.comando === null && v.codigo === null) return;

    this.#seq += 1;
    this.#store.set('ultimo', {
      estado: 'listo', mensaje: '',
      dato: {
        comando: v.comando, codigo: v.codigo, origen: null, fechaRaw: v.timestamp, tipo: v.modo,
        recibido: horaLocal(), conectado: this.#store.get('ultimo').dato?.conectado ?? null,
        persistencia: 'no_aplica', paso: v.orden && v.total ? { orden: v.orden, total: v.total } : null,
      },
    });
  }
}
