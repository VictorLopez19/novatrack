// Últimos 10 movimientos individuales. Fuente de verdad: REST (GET /historial). El WSS solo dispara la sincronización.
// Una sola consulta efectiva a la vez: una nueva cancela la anterior y las respuestas viejas se descartan.
import { horaLocal } from '../core/utilidades.js';

export const HISTORIAL_INICIAL = Object.freeze({
  estado: 'cargando', filas: [], mensaje: '', sincronizando: false, descartadas: 0, ultima: null,
});

export class ServicioHistorial {
  #api; #store; #id;
  #ctl = null;
  #gen = 0;
  #timer = null;

  constructor({ api, store, idVehiculo }) {
    this.#api = api; this.#store = store; this.#id = idVehiculo;
  }

  cancelar() {
    clearTimeout(this.#timer);
    this.#ctl?.abort();
    this.#ctl = null;
    this.#gen += 1;
  }

  reiniciar() {
    this.cancelar();
    this.#store.set('historial', HISTORIAL_INICIAL);
  }

  /** Sincronización diferida (agrupa ráfagas de eventos en una sola consulta). */
  programar(ms) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.cargar(), ms);
  }

  /** @returns {'ok'|'obsoleta'|'error'} */
  async cargar() {
    const id = this.#id();
    if (!id) return 'obsoleta';

    clearTimeout(this.#timer);
    this.#ctl?.abort();
    const ctl = new AbortController();
    this.#ctl = ctl;
    const gen = ++this.#gen;

    const previo = this.#store.get('historial');
    this.#store.set('historial', {
      ...previo, mensaje: '', sincronizando: true,
      estado: previo.filas.length || previo.estado === 'vacio' ? previo.estado : 'cargando',
    });

    try {
      const { filas, descartadas } = await this.#api.consultarHistorial(id, { senal: ctl.signal });
      if (gen !== this.#gen || id !== this.#id()) return 'obsoleta';

      this.#store.set('historial', {
        estado: filas.length ? 'listo' : 'vacio', filas, mensaje: '', sincronizando: false, descartadas, ultima: horaLocal(),
      });
      return 'ok';
    } catch (err) {
      if (ctl.signal.aborted || gen !== this.#gen) return 'obsoleta';

      this.#store.set('historial', { ...this.#store.get('historial'), estado: 'error', mensaje: err.message, sincronizando: false });
      return 'error';
    }
  }
}
