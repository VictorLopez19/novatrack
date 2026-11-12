// Carga, inicia y cancela DEMO. La secuencia y su temporización las ejecuta el backend;
// aquí solo se refleja el estado a partir de los eventos WSS (también los de las órdenes
// de IA, que llegan con modo "ia" y no se pueden cancelar).
import { textoSeguro } from '../core/utilidades.js';

const LIBRE = Object.freeze({ estado: 'libre' });
const SIN_EVENTOS_IA_MS = 30000;

export class ServicioDemo {
  #api; #store; #haySesion; #alFaltarSesion; #tIA = null;

  constructor({ api, store, haySesion, alFaltarSesion }) {
    this.#api = api; this.#store = store;
    this.#haySesion = haySesion; this.#alFaltarSesion = alFaltarSesion;
  }

  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }

  async cargar(idVehiculo, { silencioso = false } = {}) {
    try {
      const demos = (await this.#api.listarDemos(idVehiculo)).filter((d) => d.activo);
      if (this.#store.get('vehiculoId') === idVehiculo) this.#store.set('demos', demos);
      return true;
    } catch (e) {
      if (!silencioso) this.#msg(`No se pudieron cargar las DEMO: ${e.message}`, 'error');
      return false;
    }
  }

  async iniciar(idDemo) {
    const idVeh = this.#store.get('vehiculoId');
    if (this.#store.get('demo').estado !== 'libre') { this.#msg('Ya hay una DEMO en curso.', 'warn'); return; }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return; }
    this.#store.set('demo', { estado: 'iniciando', idDemo });
    try {
      const r = await this.#api.iniciarDemo(idVeh, idDemo);
      this.#msg(`DEMO «${textoSeguro(r.nombre_demo, 60)}» aceptada (${Number(r.total_movimientos) || 0} movimientos).`, 'ok');
      if (this.#store.get('ws') !== 'en_linea') this.#msg('Sin WSS no se puede seguir el avance de la DEMO.', 'warn');
    } catch (e) {
      const corriendo = e.status === 409 && /ejecuci[oó]n/i.test(e.detalle);
      this.#store.set('demo', corriendo ? { estado: 'ejecutando', idDemo } : LIBRE);
      this.#msg(e.message, 'error');
    }
  }

  async cancelar() {
    if (this.#store.get('demo').modo === 'ia') { this.#msg('Una orden de IA no se puede cancelar.', 'warn'); return; }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return; }
    const idVeh = this.#store.get('vehiculoId');
    try {
      await this.#api.cancelarDemo(idVeh);
      this.#msg('Cancelación de DEMO solicitada.', 'ok');
    } catch (e) {
      if (e.status === 404) this.#store.set('demo', LIBRE); // no había DEMO en ejecución
      this.#msg(e.message, 'error');
    }
  }

  reiniciar() { clearTimeout(this.#tIA); this.#store.set('demo', LIBRE); }

  // ---- Órdenes de IA ----
  /** Bloquea los controles mientras la IA responde; se libera con demo_fin o por falta de eventos. */
  iniciarIA() {
    this.#store.set('demo', { estado: 'iniciando', modo: 'ia' });
    this.#vigilarIA();
  }
  abortarIA() { clearTimeout(this.#tIA); this.#store.set('demo', LIBRE); }

  /** Una orden de IA no se puede cancelar: si dejan de llegar eventos, se libera el bloqueo. */
  #vigilarIA() {
    clearTimeout(this.#tIA);
    this.#tIA = setTimeout(() => {
      if (this.#store.get('demo').modo !== 'ia') return;
      this.#store.set('demo', LIBRE);
      this.#msg('Dejaron de llegar eventos de la orden de IA: controles liberados.', 'warn');
    }, SIN_EVENTOS_IA_MS);
  }

  /** Eventos WSS demo_* del vehículo actual (DEMO u orden de IA). */
  procesarEvento(ev) {
    const idDemo = Number.isInteger(ev.id_demo) ? ev.id_demo : undefined;
    const modo = ev.modo === 'ia' ? 'ia' : undefined;
    const ia = modo === 'ia';
    const fin = (texto, tipo) => { clearTimeout(this.#tIA); this.#store.set('demo', LIBRE); this.#msg(texto, tipo); };

    switch (ev.evento) {
      case 'demo_inicio':
        this.#store.set('demo', { estado: 'ejecutando', modo, idDemo, nombre: textoSeguro(ev.nombre_demo, 60), orden: 0, total: Number(ev.total_movimientos) || 0 });
        if (ia) this.#vigilarIA();
        this.#msg(ia ? 'La IA empezó a ejecutar la orden.' : 'DEMO iniciada (evento WSS).', 'info'); break;
      case 'demo_movimiento':
        this.#store.set('demo', { ...this.#store.get('demo'), estado: 'ejecutando', modo, idDemo, orden: Number(ev.orden) || 0, total: Number(ev.total_movimientos) || 0, comando: textoSeguro(ev.comando, 40) });
        if (ia) this.#vigilarIA();
        break;
      case 'demo_fin': fin(ia ? 'Orden de IA finalizada.' : 'DEMO finalizada.', 'ok'); break;
      case 'demo_cancelada': fin(ia ? 'Orden de IA interrumpida.' : 'DEMO cancelada.', 'warn'); break;
      case 'demo_error': fin(textoSeguro(ev.mensaje, 100) || (ia ? 'La orden de IA terminó con error.' : 'La DEMO terminó con error.'), 'error'); break;
      default: break;
    }
  }
}
