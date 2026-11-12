// Único punto de envío de comandos (joysticks y botones).
// Aplica validación común, prioridad al último movimiento y control exclusivo.

export class ServicioComandos {
  #api; #catalogo; #store; #cancelarDemo; #emisor; #haySesion; #alFaltarSesion;

  #enVuelo = null;          // Movimiento que se está enviando.
  #pendiente = null;        // Último movimiento solicitado mientras hay uno en curso.
  #claveActual = null;      // Última clave solicitada.
  #duenio = null;           // Control que tiene el mando: 'joy:chasis', 'btn:LUCES'…
  #ultimoAceptado = null;
  #stopEnVuelo = null;
  #stopDuranteVuelo = false;

  // Inicializa las dependencias del servicio.
  constructor({ api, catalogo, store, cancelarDemo, emisor, haySesion, alFaltarSesion }) {
    this.#api = api; this.#catalogo = catalogo; this.#store = store;
    this.#cancelarDemo = cancelarDemo; this.#emisor = emisor;
    this.#haySesion = haySesion; this.#alFaltarSesion = alFaltarSesion;
  }
  // Comprueba si el comando existe en el catálogo.
  puedeEnviar(clave) {
    return this.#catalogo.resolver(clave) !== null;
  }

  // Muestra mensajes en la interfaz.
  #msg(texto, tipo = 'info') {
    this.#store.set('mensaje', {
      texto,
      tipo,
      id: Date.now() + Math.random()
    });
  }

  // Notifica el estado de un comando.
  #estado(clave, estado) {
    this.#emisor.emit('estado', { clave, estado });
  }

  /** Solicita un movimiento. Devuelve false si se rechaza localmente. */
  enviar(clave, duenio, origen) {
    const vehiculo = this.#store.get('vehiculoId');
    const cmd = this.#catalogo.resolver(clave);

    if (!vehiculo) {
      this.#msg('Selecciona un vehículo en Ajustes.', 'error');
      return false;
    }

    if (!this.#haySesion()) { this.#alFaltarSesion(); return false; }

    const modo = this.#store.get('modo');
    if (modo !== 'manual' && !String(duenio).includes(modo)) {
      const nombre = { voz: 'voz', gesto: 'gestos', giro: 'giroscopio' }[modo] ?? modo;
      this.#msg(`Modo ${nombre} activo: los demás controles están deshabilitados.`, 'warn'); return false;
    }

    if (!cmd) {
      this.#msg(`El comando ${clave} no existe en el catálogo.`, 'error');
      this.#estado(clave, 'error');
      return false;
    }

    // Impide enviar movimientos mientras hay una demostración activa.
    if (this.#store.get('demo').estado !== 'libre') {
      this.#msg('Hay una DEMO en curso. Cancélala o pulsa DETENER.', 'warn');
      return false;
    }

    // Evita que dos controles diferentes manejen el vehículo al mismo tiempo.
    if (this.#duenio && this.#duenio !== duenio) {
      this.#msg('Otro control está en uso. Suéltalo primero.', 'warn');
      return false;
    }

    // Evita enviar nuevamente el mismo comando desde el mismo control.
    if (clave === this.#claveActual && this.#duenio === duenio) return true;

    this.#claveActual = clave;
    this.#duenio = duenio;

    const item = { clave, cmd, origen };

    // Si hay un movimiento en curso, conserva únicamente el último solicitado.
    if (this.#enVuelo) {
      this.#pendiente = item;
      return true;
    }

    this.#enVuelo = this.#correr(item).finally(() => {
      this.#enVuelo = null;
    });

    return true;
  }

  // Procesa los movimientos pendientes y actualiza sus estados.
  async #correr(primero) {
    let item = primero;

    while (item) {
      if (this.#stopEnVuelo) await this.#stopEnVuelo;

      // Descarta el movimiento si fue reemplazado o detenido.
      if (this.#claveActual !== item.clave) break;

      this.#estado(item.clave, 'enviando');

      try {
        await this.#api.registrarMovimiento(
          this.#store.get('vehiculoId'),
          item.cmd.id_comando,
          "WEB APP"
          //item.origen
        );

        this.#ultimoAceptado = item.clave;
        this.#estado(item.clave, 'aceptado');
        this.#msg(
          `El servidor aceptó ${item.cmd.nombre.toLowerCase().replaceAll('_', ' ')}`,
          'ok'
        );
      } catch (e) {
        this.#estado(item.clave, 'error');
        this.#msg(e.message, 'error');
      }

      // Recupera el último movimiento solicitado.
      item = this.#pendiente;
      this.#pendiente = null;
    }

    // Libera automáticamente los controles de tipo botón.
    if (this.#duenio?.startsWith('btn:')) {
      this.#duenio = null;
      this.#claveActual = null;
    }

    // Reenvía DETENER cuando termina el movimiento que estaba en curso.
    if (this.#stopDuranteVuelo) {
      this.#stopDuranteVuelo = false;

      if (this.#stopEnVuelo) await this.#stopEnVuelo;

      await this.#enviarStop(true);
    }
  }

  /** Suelta un control. Solo actúa si `duenio` es quien controla; ignora al resto. */
  soltar(duenio) {
    if (this.#duenio !== duenio) return Promise.resolve(false);

    return this.detener();
  }

  /** DETENER tiene prioridad absoluta: descarta pendientes y cancela una DEMO activa. */
  async detener() {
    this.#pendiente = null;
    this.#claveActual = null;
    this.#duenio = null;

    const demo = this.#store.get('demo');

    if (demo.estado !== 'libre' && demo.modo === 'ia') {
      this.#msg('Una orden de IA no se puede cancelar: se envía DETENER, pero la secuencia puede continuar.', 'warn');
    } else if (demo.estado !== 'libre') { await this.#cancelarDemo(); return true; }


    if (!this.#haySesion()) { this.#alFaltarSesion(); return false; }

    // Solicita otro DETENER cuando termine el movimiento en curso.
    if (this.#enVuelo) this.#stopDuranteVuelo = true;

    return this.#enviarStop(false);
  }

  // Envía el comando DETENER y evita solicitudes simultáneas.
  #enviarStop(forzar) {
    if (this.#stopEnVuelo) return this.#stopEnVuelo;

    const cmd = this.#catalogo.resolver('DETENER');

    if (!cmd) {
      this.#msg('El catálogo no tiene el comando DETENER.', 'error');
      return Promise.resolve(false);
    }

    this.#estado('DETENER', 'enviando');

    this.#stopEnVuelo = (async () => {
      try {
        await this.#api.registrarMovimiento(
          this.#store.get('vehiculoId'),
          cmd.id_comando,
          'WEB APP'
        );

        this.#ultimoAceptado = 'DETENER';
        this.#estado('DETENER', 'aceptado');
        //this.#msg('DETENER aceptado por el servidor.', 'ok');

        return true;
      } catch (e) {
        this.#estado('DETENER', 'error');
        this.#msg(`No se pudo enviar detener: ${e.message}`, 'error');

        return false;
      }
    })().finally(() => {
      this.#stopEnVuelo = null;
    });

    return this.#stopEnVuelo;
  }

  /** Reinicia el estado interno al cambiar de vehículo. */
  reiniciar() {
    this.#pendiente = null;
    this.#claveActual = null;
    this.#duenio = null;
    this.#ultimoAceptado = null;
  }
}
