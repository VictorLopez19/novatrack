// Gestiona la conexión WSS: apertura, errores, cierre, latidos y reconexión.
// Una conexión WSS del navegador NO confirma que el vehículo físico esté conectado.
import { crearEmisor, esObjeto } from '../core/utilidades.js';

export class ServicioWebSocket {
  emisor = crearEmisor();

  #urlPara;
  #t;
  #id = null;
  #ws = null;
  #manual = true;
  #intento = 0;

  #tReintento = null;
  #tPing = null;
  #tPong = null;

  // Inicializa la URL, los tiempos y valida el uso de WSS en HTTPS.
  constructor({ urlPara, tiempos }) {
    this.#urlPara = urlPara;
    this.#t = tiempos;

    if (
      location.protocol === 'https:' &&
      !String(urlPara(1)).startsWith('wss://')
    ) {
      throw new Error('Contenido mixto bloqueado: el WebSocket debe usar WSS.');
    }
  }

  // Notifica el estado de la conexión y el número de intentos.
  #estado(e) {
    this.emisor.emit('estado', {
      estado: e,
      intento: this.#intento
    });
  }

  // Inicia la conexión con el vehículo seleccionado.
  conectar(idVehiculo) {
    this.desconectar();
    this.#id = idVehiculo;
    this.#manual = false;
    this.#intento = 0;
    this.#abrir();
  }

  // Cierra la conexión y cancela los temporizadores activos.
  desconectar() {
    this.#manual = true;
    clearTimeout(this.#tReintento);
    this.#detenerLatido();

    const ws = this.#ws;
    this.#ws = null;

    if (ws) {
      // Elimina los eventos antes de cerrar la conexión.
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;

      try {
        ws.close(1000);
      } catch {
        /* ya cerrado */
      }
    }

    this.#estado('desconectado');
  }

  /** Reintento inmediato, por ejemplo, al recuperar la conexión de red. */
  reconectarYa() {
    if (this.#manual || this.#ws?.readyState === WebSocket.OPEN) return;

    clearTimeout(this.#tReintento);
    this.#intento = 0;
    this.#abrir();
  }

  // Crea la conexión WebSocket y configura sus eventos.
  #abrir() {
    clearTimeout(this.#tReintento);
    this.#estado('conectando');

    let ws;

    try {
      ws = new WebSocket(this.#urlPara(this.#id));
    } catch {
      this.#programar();
      return;
    }

    this.#ws = ws;

    // Se ejecuta cuando la conexión se establece correctamente.
    ws.onopen = () => {
      this.#intento = 0;
      this.#estado('en_linea');
      this.#iniciarLatido();
    };

    // Recibe, valida y procesa los mensajes enviados por el servidor.
    ws.onmessage = (m) => {
      clearTimeout(this.#tPong);

      if (typeof m.data !== 'string' || m.data.length > 20000) return;

      let obj;

      try {
        obj = JSON.parse(m.data);
      } catch {
        return;
      }

      if (esObjeto(obj) && typeof obj.evento === 'string') {
        this.emisor.emit('evento', obj);
      }
    };

    ws.onerror = () => {
      /* el cierre posterior decide el estado */
    };

    // Gestiona el cierre y determina si debe realizarse una reconexión.
    ws.onclose = (e) => {
      if (this.#ws !== ws) return;

      this.#ws = null;
      this.#detenerLatido();

      if (this.#manual) return;

      // Un código 1008 indica que la conexión fue rechazada por el servidor.
      if (e.code === 1008) {
        this.#manual = true;
        this.#estado('desconectado');
        this.emisor.emit(
          'rechazado',
          e.reason || 'El vehículo no existe'
        );
        return;
      }

      this.#programar();
    };
  }

  // Programa una reconexión utilizando un retardo exponencial.
  #programar() {
    if (this.#manual) return;

    const espera =
      Math.min(this.#t.reconexionMaxMs, 1000 * 2 ** this.#intento) +
      Math.random() * 400;

    this.#intento += 1;
    this.#estado('conectando'); // reconectando (intento > 0)

    this.#tReintento = setTimeout(() => this.#abrir(), espera);
  }

  // Inicia el envío periódico de mensajes para comprobar la conexión.
  #iniciarLatido() {
    this.#detenerLatido();

    this.#tPing = setInterval(() => {
      const ws = this.#ws;

      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      try {
        ws.send('ping');
      } catch {
        /* se detectará por el temporizador */
      }

      clearTimeout(this.#tPong);

      // Si no se recibe respuesta, considera la conexión como semiabierta.
      this.#tPong = setTimeout(() => {
        if (this.#ws !== ws) return;

        this.#ws = null;
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;

        try {
          ws.close();
        } catch {
          /* ignorar */
        }

        this.#detenerLatido();
        this.#programar();
      }, this.#t.pongMs);
    }, this.#t.pingMs);
  }

  // Detiene los temporizadores de envío y espera de respuesta.
  #detenerLatido() {
    clearInterval(this.#tPing);
    clearTimeout(this.#tPong);
  }
}