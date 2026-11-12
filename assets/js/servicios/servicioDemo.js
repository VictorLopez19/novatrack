// Carga, inicia y cancela DEMO.
// La secuencia y su temporización las ejecuta el backend;
// aquí solo se refleja el estado a partir de los eventos WSS.
import { textoSeguro } from '../core/utilidades.js';

// Estado inicial de una DEMO.
const LIBRE = Object.freeze({ estado: 'libre' });

export class ServicioDemo {
  #api; #store; #haySesion; #alFaltarSesion;
  constructor({ api, store, haySesion, alFaltarSesion }) {
    this.#api = api; this.#store = store;
    this.#haySesion = haySesion; this.#alFaltarSesion = alFaltarSesion;
  }

  // Muestra mensajes en la interfaz.
  #msg(texto, tipo = 'info') {
    this.#store.set('mensaje', {
      texto,
      tipo,
      id: Date.now() + Math.random()
    });
  }

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

  // Solicita al backend el inicio de una DEMO.
  async iniciar(idDemo) {
    const idVeh = this.#store.get('vehiculoId');

    if (this.#store.get('demo').estado !== 'libre') {
      this.#msg('Ya hay una DEMO en curso.', 'warn');
      return;
    }

    if (!this.#haySesion()) { this.#alFaltarSesion(); return; }

    this.#store.set('demo', { estado: 'iniciando', idDemo });

    try {
      const r = await this.#api.iniciarDemo(idVeh, idDemo);

      this.#msg(
        `DEMO ${textoSeguro(r.nombre_demo, 60)} aceptada (${Number(r.total_movimientos) || 0} movimientos).`,
        'ok'
      );

      // Advierte si no hay conexión WSS para recibir los eventos de avance.
      if (this.#store.get('ws') !== 'en_linea') {
        this.#msg('Sin WSS no se puede seguir el avance de la DEMO.', 'warn');
      }
    } catch (e) {
      const corriendo = e.status === 409 && /ejecuci[oó]n/i.test(e.detalle);

      this.#store.set(
        'demo',
        corriendo ? { estado: 'ejecutando', idDemo } : LIBRE
      );

      this.#msg(e.message, 'error');
    }
  }

  // Solicita la cancelación de la DEMO activa.
  async cancelar() {
    if (!this.#haySesion()) { this.#alFaltarSesion(); return; }
    const idVeh = this.#store.get('vehiculoId');

    try {
      await this.#api.cancelarDemo(idVeh);
      this.#msg('Cancelación de DEMO solicitada.', 'ok');
    } catch (e) {
      // Si el backend responde 404, no hay una DEMO en ejecución.
      if (e.status === 404) this.#store.set('demo', LIBRE);

      this.#msg(e.message, 'error');
    }
  }

  // Restablece el estado de la DEMO.
  reiniciar() {
    this.#store.set('demo', LIBRE);
  }

  /** Procesa los eventos WSS de tipo demo_* del vehículo actual. */
  procesarEvento(ev) {
    const idDemo = Number.isInteger(ev.id_demo)
      ? ev.id_demo
      : undefined;

    switch (ev.evento) {
      case 'demo_inicio':
        this.#store.set('demo', {
          estado: 'ejecutando',
          idDemo,
          nombre: textoSeguro(ev.nombre_demo, 60),
          orden: 0,
          total: Number(ev.total_movimientos) || 0
        });
        this.#msg('DEMO iniciada (evento WSS).', 'info');
        break;

      case 'demo_movimiento':
        this.#store.set('demo', {
          ...this.#store.get('demo'),
          estado: 'ejecutando',
          idDemo,
          orden: Number(ev.orden) || 0,
          total: Number(ev.total_movimientos) || 0,
          comando: textoSeguro(ev.comando, 40).replace(/_/g, ' ')
        });
        break;

      case 'demo_fin':
        this.#store.set('demo', LIBRE);
        this.#msg('DEMO finalizada.', 'ok');
        break;

      case 'demo_cancelada':
        this.#store.set('demo', LIBRE);
        this.#msg('DEMO cancelada.', 'warn');
        break;

      case 'demo_error':
        this.#store.set('demo', LIBRE);
        this.#msg(
          textoSeguro(ev.mensaje, 100) || 'La DEMO terminó con error.',
          'error'
        );
        break;

      default:
        break;
    }
  }
}
