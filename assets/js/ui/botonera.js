// Botones secundarios. Todos reutilizan ServicioComandos;
// el estado visual llega por eventos.

export class Botonera {
  #cont;
  #cfg;
  #servicio;
  #store;
  #alDemo;
  #alVoz;
  #vozOk;
  #alGestos;
  #gestosOk;
  #btns = new Map();

  // Inicializa la botonera, registra eventos y actualiza su estado.
  constructor(contenedor, { botones, servicio, store, emisor, alDemo, alVoz, vozOk, alGestos, gestosOk }) {
    this.#cont = contenedor;
    this.#cfg = botones;
    this.#servicio = servicio;
    this.#store = store;
    this.#alDemo = alDemo;
    this.#alVoz = alVoz;
    this.#vozOk = vozOk;
    this.#alGestos = alGestos;
    this.#gestosOk = gestosOk;

    this.#render();

    // Escucha los cambios de estado de los comandos.
    emisor.on('estado', ({ clave, estado }) => this.#marcar(clave, estado));

    // Actualiza los botones cuando cambia la DEMO o el vehículo seleccionado.
    store.on('demo', () => this.actualizar());
    store.on('vehiculoId', () => this.actualizar());

    this.actualizar();
  }

  // Construye las filas, los botones y sus eventos.
  #render() {
    const filas = new Map();

    for (const b of this.#cfg) {
      // Crea una fila cuando todavía no existe.
      if (!filas.has(b.fila)) {
        const f = document.createElement('div');
        f.className = 'fila-botones';
        filas.set(b.fila, f);
        this.#cont.append(f);
      }

      const item = document.createElement('div');
      item.className = 'item-ctl';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-ctl tono-${b.tono}`;
      btn.setAttribute('aria-label', b.etiqueta);

      // Agrega el icono correspondiente al botón.
      const i = document.createElement('i');
      i.className = `bi ${b.icono}`;
      i.setAttribute('aria-hidden', 'true');
      btn.append(i);

      // Agrega la etiqueta visible del botón.
      const et = document.createElement('span');
      et.textContent = b.etiqueta;

      item.append(btn, et);
      filas.get(b.fila).append(item);

      // Ejecuta la acción correspondiente al tipo de botón.
      btn.addEventListener('click', () => {

        if (b.tipo === 'demo') {
          this.#alDemo();
        } else if (b.tipo === 'comando') {
          this.#servicio.enviar(
            b.clave,
            `btn:${b.clave}`,
            'WEB_BOTON'
          );
        } else if (b.tipo === 'voz') {
          this.#alVoz();
        } else if (b.tipo === 'gesto') {
          this.#alGestos();
        }

      });

      this.#btns.set(b, btn);
    }
  }

  // Habilita o deshabilita los botones según el estado del vehículo y la DEMO.
  actualizar() {
    const libre = this.#store.get('demo').estado === 'libre';
    const hayVeh = Boolean(this.#store.get('vehiculoId'));

    for (const [b, btn] of this.#btns) {
      let ok;
      let motivo = '';

      if (b.tipo === 'pendiente') {
        ok = false;
        motivo = 'No disponible en la API actual';
      } else if (b.tipo === 'voz') {
        ok = hayVeh && libre && this.#vozOk;
        if (!this.#vozOk)
          motivo = 'Tu navegador no soporta el reconocimiento de voz';
      } else if (b.tipo === 'gesto') {
        ok = hayVeh && libre && this.#gestosOk;
        if (!this.#gestosOk)
          motivo = 'Tu navegador no permite usar la cámara';
      } else if (b.tipo === 'demo') {
        ok = hayVeh;
      } else if (!this.#servicio.puedeEnviar(b.clave)) {
        ok = false;
        motivo = 'No existe en el catálogo del vehículo';
      } else if (!libre) {
        ok = false;
        motivo = 'Hay una DEMO en curso';
      } else {
        ok = true;
      }

      btn.disabled = !ok;
      btn.title = motivo || b.etiqueta;
    }
  }

  // Actualiza el estado visual del botón según el evento recibido.
  #marcar(clave, estado) {
    for (const [b, btn] of this.#btns) {
      if (b.clave !== clave) continue;

      btn.dataset.estado = estado;
      btn.setAttribute('aria-busy', String(estado === 'enviando'));

      // Retira el indicador visual después de un breve intervalo.
      if (estado === 'aceptado' || estado === 'error') {
        setTimeout(() => {
          if (btn.dataset.estado === estado) {
            delete btn.dataset.estado;
          }
        }, 900);
      }
    }
  }
}
