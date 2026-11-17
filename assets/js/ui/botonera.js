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
  #alGiro;
  #giroOk;
  #alVr;
  #vrOk;
  #btns = new Map();

  #largoMs;

  // Inicializa la botonera, registra eventos y actualiza su estado.
  constructor(contenedor, { botones, servicio, store, emisor, alDemo, alVoz, vozOk, alGestos, gestosOk, alGiro, giroOk, alVr, vrOk = () => false, largoMs = 650 }) {
    this.#cont = contenedor;
    this.#cfg = botones;
    this.#largoMs = largoMs;
    this.#servicio = servicio;
    this.#store = store;
    this.#alDemo = alDemo;
    this.#alVoz = alVoz;
    this.#vozOk = vozOk;
    this.#alGestos = alGestos;
    this.#gestosOk = gestosOk;
    this.#alGiro = alGiro;
    this.#giroOk = giroOk;
    this.#alVr = alVr;
    this.#vrOk = vrOk; // función: el soporte de WebXR se conoce después de cargar

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

      // Botones con dos órdenes: un toque envía `clave` y mantenerlo pulsado envía `claveLarga`.
      if (b.claveLarga) {
        this.#conPulsacionLarga(b, btn);
        this.#btns.set(b, btn);
        continue;
      }

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
        } else if (b.tipo === 'giro') {
          this.#alGiro();
        } else if (b.tipo === 'vr') {
          this.#alVr();
        }

      });

      this.#btns.set(b, btn);
    }
  }

  /**
   * Un toque envía `clave` (encender) y mantener pulsado envía `claveLarga` (apagar).
   * Funciona con dedo, ratón y teclado: al mantener Enter o Espacio el navegador
   * repite el evento `keydown`, y esa repetición se interpreta como pulsación larga.
   */
  #conPulsacionLarga(b, btn) {
    let temporizador = null;
    let largaEnviada = false;

    // La animación del aro dura lo mismo que la espera real.
    btn.style.setProperty('--largo', `${this.#largoMs}ms`);

    // Las dos órdenes comparten dueño: es un único control físico, no dos.
    const enviar = (clave) => this.#servicio.enviar(clave, `btn:${b.clave}`, 'WEB_BOTON');

    const iniciar = () => {
      if (temporizador !== null || btn.disabled) return;

      largaEnviada = false;
      btn.dataset.manteniendo = '1';

      temporizador = setTimeout(() => {
        temporizador = null;
        largaEnviada = true;
        delete btn.dataset.manteniendo;
        enviar(b.claveLarga);
      }, this.#largoMs);
    };

    // Al soltar antes de tiempo se envía la orden corta; si ya salió la larga, no se repite.
    const terminar = (enviarCorta = true) => {
      if (temporizador !== null) {
        clearTimeout(temporizador);
        temporizador = null;
        delete btn.dataset.manteniendo;
        if (enviarCorta && !largaEnviada) enviar(b.clave);
        return;
      }
      delete btn.dataset.manteniendo;
    };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();  // evita el click sintético y la selección de texto
      iniciar();
    });
    btn.addEventListener('pointerup', () => terminar());
    btn.addEventListener('pointerleave', () => terminar(false));   // el dedo salió del botón: se cancela
    btn.addEventListener('pointercancel', () => terminar(false));

    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();  // sin esto el navegador generaría un click
      iniciar();           // las repeticiones no reinician nada: el temporizador ya corre
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') terminar();
    });
    btn.addEventListener('blur', () => terminar(false));
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
      } else if (b.tipo === 'giro') {
        ok = hayVeh && libre && this.#giroOk;

        if (!this.#giroOk)
          motivo = 'Tu dispositivo no tiene giroscopio';
      } else if (b.tipo === 'vr') {
        ok = hayVeh && libre && this.#vrOk();

        if (!this.#vrOk())
          motivo = 'Tu dispositivo no permite realidad mixta (WebXR)';
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
      btn.title = motivo || b.ayuda || b.etiqueta;
      // Los botones con dos órdenes explican el toque y la pulsación larga.
      if (ok && b.ayuda) btn.setAttribute('aria-label', `${b.etiqueta}. ${b.ayuda}`);
    }
  }

  // Actualiza el estado visual del botón según el evento recibido.
  #marcar(clave, estado) {
    for (const [b, btn] of this.#btns) {
      // El botón de encendido también refleja el estado de su orden larga (apagar).
      if (b.clave !== clave && b.claveLarga !== clave) continue;

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
