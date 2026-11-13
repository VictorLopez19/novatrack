// Orquesta MONITOREO: comparte el WSS único de la app (no abre otro), escucha una sola vez y reconcilia por REST.
// - WSS = disparador en vivo.  REST = fuente de verdad (carga inicial, reconexión, confirmación).
// - Sin sondeo continuo del historial. Si la vista no está activa, solo se mantiene el último dato en memoria.
import { crearStore, textoSeguro, horaLocal } from '../core/utilidades.js';
import { validarEventoDemo, validarEventoMovimiento } from '../core/validaciones.js';
import { ServicioUltimoMovimiento, ULTIMO_INICIAL } from './servicioUltimoMovimiento.js';
import { ServicioHistorial, HISTORIAL_INICIAL } from './servicioHistorial.js';

const TERMINALES = new Set(['demo_fin', 'demo_cancelada', 'demo_error']);

export class ServicioMonitoreo {
  store = crearStore({
    vehiculoNombre: '', ultimo: ULTIMO_INICIAL, historial: HISTORIAL_INICIAL, actividad: null, activo: false,
  });

  #ws; #principal; #cfg; #apiVeh; #ultimo; #historial;
  #iniciado = false;
  #activo = false;
  #tSync = null;
  #pendHist = false;
  #pendForzar = false;
  #ultimaSyncMs = 0;
  #wsPrevio = null;
  #genNombre = 0;

  constructor({ api, apiVehiculo, ws, store, config }) {
    this.#ws = ws; this.#principal = store; this.#cfg = config; this.#apiVeh = apiVehiculo;
    const idVehiculo = () => store.get('vehiculoId');
    this.#ultimo = new ServicioUltimoMovimiento({ api, store: this.store, idVehiculo, maxClaves: config.maxClavesDedup });
    this.#historial = new ServicioHistorial({ api, store: this.store, idVehiculo });
  }

  #id() { return this.#principal.get('vehiculoId'); }

  /** Registra los listeners UNA sola vez (la navegación no vuelve a llamar a este método). */
  iniciar() {
    if (this.#iniciado) return;
    this.#iniciado = true;

    this.#ws.emisor.on('evento', (ev) => this.#alEvento(ev));
    this.#ws.emisor.on('estado', ({ estado }) => this.#alEstadoWs(estado));
    this.#principal.on('vehiculoId', () => this.#alCambiarVehiculo());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.#programarSync({ forzar: false });
    });
  }

  /** Al entrar a la vista siempre se consulta REST (recupera lo ocurrido mientras no se miraba). */
  entrar() {
    this.#activo = true;
    this.store.set('activo', true);
    this.sincronizar();
    this.#cargarNombre();
  }

  salir() {
    this.#activo = false;
    this.store.set('activo', false);
    clearTimeout(this.#tSync);
    this.#ultimo.cancelar();
    this.#historial.cancelar();
  }

  /** Sincronización manual o de entrada: estado + historial por REST. */
  async sincronizar({ historial = true } = {}) {
    if (!this.#id()) return;

    const tareas = [this.#ultimo.cargar()];
    if (historial) tareas.push(this.#historial.cargar());

    const [u, h] = await Promise.all(tareas);
    if (u === 'ok' && (!historial || h === 'ok')) this.#ultimaSyncMs = Date.now();
    if (u === 'reintentar') this.#programarSync({ forzar: true, historial });
  }

  // Agrupa varias causas (evento, reconexión, visibilidad) en una sola sincronización.
  #programarSync({ forzar = false, historial = true } = {}) {
    if (!this.#activo) return;

    this.#pendHist ||= historial;
    this.#pendForzar ||= forzar;
    clearTimeout(this.#tSync);

    this.#tSync = setTimeout(() => {
      const hist = this.#pendHist;
      const forzada = this.#pendForzar;
      this.#pendHist = false;
      this.#pendForzar = false;

      // Evita repetir una sincronización recién completada (p. ej., carga inicial + primer WSS).
      if (!forzada && Date.now() - this.#ultimaSyncMs < this.#cfg.ventanaOmitirSyncMs) return;
      this.sincronizar({ historial: hist });
    }, this.#cfg.debounceSyncMs);
  }

  // Recuperación tras reconexión: los eventos perdidos se recuperan consultando REST.
  #alEstadoWs(estado) {
    const antes = this.#wsPrevio;
    this.#wsPrevio = estado;
    if (estado === 'en_linea' && antes !== 'en_linea') this.#programarSync({ forzar: false });
  }

  #alCambiarVehiculo() {
    clearTimeout(this.#tSync);
    this.#ultimo.reiniciar();
    this.#historial.reiniciar();
    this.store.set('actividad', null);
    this.store.set('vehiculoNombre', '');
    this.#ultimaSyncMs = 0;

    if (this.#activo && this.#id()) {
      this.sincronizar();
      this.#cargarNombre();
    }
  }

  async #cargarNombre() {
    const id = this.#id();
    if (!id) return;

    const gen = ++this.#genNombre;
    try {
      const v = await this.#apiVeh.obtenerVehiculo(id);
      if (gen === this.#genNombre && id === this.#id()) this.store.set('vehiculoNombre', textoSeguro(v.nombre, 80));
    } catch { /* el nombre es informativo: se muestra «Vehículo #id» */ }
  }

  #alEvento(ev) {
    const id = this.#id();
    if (!id || ev?.id_vehiculo !== id) return; // otros vehículos se ignoran

    if (ev.evento === 'movimiento') {
      const v = validarEventoMovimiento(ev, id);
      if (!v) return;
      this.#ultimo.aplicarMovimiento(v);
      // Se sincroniza siempre (idempotente): confirma persistencia en RDS y recupera filas, incluso ante duplicados.
      this.#programarSync({ forzar: true });
      return;
    }

    if (ev.evento === 'estado_inicial') {
      this.#programarSync({ forzar: false });
      return;
    }

    const d = validarEventoDemo(ev, id);
    if (!d) return;

    this.#registrarActividad(d);
    if (d.evento === 'demo_movimiento') this.#ultimo.aplicarPasoDemo(d);
    // Fin/cancelación: el estado pudo cambiar (p. ej., DETENER). El historial NO cambia con una DEMO.
    if (TERMINALES.has(d.evento)) this.#programarSync({ forzar: true, historial: false });
  }

  #registrarActividad(d) {
    const previo = this.store.get('actividad');
    this.store.set('actividad', {
      evento: d.evento,
      modo: d.modo,
      nombre: d.nombre ?? previo?.nombre ?? null,
      orden: d.orden ?? (d.evento === 'demo_inicio' ? 0 : previo?.orden ?? null),
      total: d.total ?? previo?.total ?? null,
      comando: d.comando,
      mensaje: d.mensaje,
      recibido: horaLocal(),
      activa: !TERMINALES.has(d.evento),
    });
  }
}
