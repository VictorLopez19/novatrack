
// Joystick circular con Pointer Events (mouse, touch, lápiz) y teclado.
// Emite solo cambios de dirección; al soltar, cancelar o perder el puntero llama a alSoltar().

// Direcciones disponibles para el movimiento del joystick.
const DIRS = ['arriba', 'abajo', 'izquierda', 'derecha'];

// Iconos asociados a cada dirección.
const ICONO = {
  arriba: 'bi-chevron-up',
  abajo: 'bi-chevron-down',
  izquierda: 'bi-chevron-left',
  derecha: 'bi-chevron-right'
};

// Relación entre las teclas de dirección y los movimientos.
const TECLAS = {
  ArrowUp: 'arriba',
  ArrowDown: 'abajo',
  ArrowLeft: 'izquierda',
  ArrowRight: 'derecha'
};

// Porcentaje del radio que se utiliza como zona neutra.
const ZONA_NEUTRA = 0.35; // fracción del radio máximo

// Controla el joystick y sus eventos de interacción.
export class Joystick {
  #raiz;
  #knob;
  #flechas = {};
  #cb;
  #pid = null;
  #dir = null;
  #tecla = null;

  // Inicializa el joystick, sus elementos visuales y sus eventos.
  constructor(raiz, { nombre, alDireccion, alSoltar }) {
    this.#raiz = raiz;
    this.#cb = { alDireccion, alSoltar };

    // Configura las propiedades de accesibilidad del joystick.
    raiz.classList.add('joystick');
    raiz.tabIndex = 0;
    raiz.setAttribute('role', 'group');
    raiz.setAttribute(
      'aria-label',
      `Joystick ${nombre}. Arrastra o usa las flechas del teclado; al soltar se detiene.`
    );

    // Crea las flechas que representan las direcciones disponibles.
    for (const d of DIRS) {
      const s = document.createElement('span');
      s.className = `flecha flecha-${d}`;

      const i = document.createElement('i');
      i.className = `bi ${ICONO[d]}`;
      i.setAttribute('aria-hidden', 'true');

      s.append(i);
      raiz.append(s);
      this.#flechas[d] = s;
    }

    // Crea el aro y la pieza móvil del joystick.
    const aro = document.createElement('span');
    aro.className = 'aro';

    this.#knob = document.createElement('span');
    this.#knob.className = 'knob';

    raiz.append(aro, this.#knob);

    // Registra los eventos para controlar el movimiento del puntero.
    raiz.addEventListener('pointerdown', (e) => this.#abajo(e));

    raiz.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.#pid) {
        this.#mover(e.clientX, e.clientY);
      }
    });

    // Detecta cuándo se suelta, cancela o pierde el puntero.
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      raiz.addEventListener(t, (e) => {
        if (e.pointerId === this.#pid) this.#soltar();
      });
    }

    // Evita que aparezca el menú contextual al interactuar.
    raiz.addEventListener('contextmenu', (e) => e.preventDefault());

    // Registra los eventos de teclado y pérdida de enfoque.
    raiz.addEventListener('keydown', (e) => this.#teclaAbajo(e));
    raiz.addEventListener('keyup', (e) => {
      if (e.key === this.#tecla) this.#soltar();
    });
    raiz.addEventListener('blur', () => this.#soltar());

    // Detiene el joystick cuando la página deja de estar visible.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.#soltar();
    });
  }

  // Marca visualmente las direcciones que están disponibles.
  marcarDisponibles(mapa) {
    for (const d of DIRS) {
      this.#flechas[d].classList.toggle('nodisp', !mapa[d]);
    }
  }

  // Calcula el radio máximo de desplazamiento del control.
  #radio() {
    return this.#raiz.clientWidth / 2 - this.#knob.offsetWidth / 2;
  }

  // Inicia la interacción cuando se presiona el joystick.
  #abajo(e) {
    if (this.#pid !== null || this.#tecla !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    this.#pid = e.pointerId;

    // Captura el puntero para mantener el control durante el arrastre.
    try {
      this.#raiz.setPointerCapture(e.pointerId);
    } catch {
      /* puntero ya inválido */
    }

    this.#raiz.classList.add('activo');
    this.#mover(e.clientX, e.clientY);
  }

  // Calcula la posición del control y determina la dirección seleccionada.
  #mover(x, y) {
    const r = this.#raiz.getBoundingClientRect();

    // Calcula la distancia del puntero respecto al centro del joystick.
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);

    const max = this.#radio();
    const dist = Math.hypot(dx, dy);
    const k = dist > max ? max / dist : 1;

    // Limita el desplazamiento del control al radio máximo permitido.
    this.#knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;

    let dir = null;

    // Determina la dirección cuando se supera la zona neutra.
    if (dist / max >= ZONA_NEUTRA) {
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const cerca = Math.abs(Math.abs(dx) - Math.abs(dy)) < dist * 0.15; // histéresis en diagonales

      // Conserva la dirección anterior cuando el movimiento está cerca de una diagonal.
      if (cerca && this.#dir) {
        dir = this.#dir;
      } else {
        dir = horizontal
          ? (dx > 0 ? 'derecha' : 'izquierda')
          : (dy > 0 ? 'abajo' : 'arriba');
      }
    }

    this.#fijar(dir);
  }

  // Actualiza la dirección activa y notifica el cambio correspondiente.
  #fijar(dir) {
    if (dir === this.#dir) return;

    this.#dir = dir;

    // Actualiza el resaltado visual de las flechas.
    for (const d of DIRS) {
      this.#flechas[d].classList.toggle('on', d === dir);
    }

    if (dir) {
      this.#cb.alDireccion(dir);
    } else {
      this.#cb.alSoltar(); // regreso a la zona neutra = detener
    }
  }

  // Procesa las pulsaciones de las teclas de dirección.
  #teclaAbajo(e) {
    const dir = TECLAS[e.key];

    if (!dir || e.repeat || this.#pid !== null) return;

    e.preventDefault();
    this.#tecla = e.key;
    this.#raiz.classList.add('activo');

    // Calcula la posición del control según la tecla presionada.
    const m = this.#radio() * 0.8;

    const v = {
      arriba: [0, -m],
      abajo: [0, m],
      izquierda: [-m, 0],
      derecha: [m, 0]
    }[dir];

    this.#knob.style.transform = `translate(${v[0]}px, ${v[1]}px)`;
    this.#fijar(dir);
  }

  // Finaliza la interacción y restablece el joystick a su posición inicial.
  #soltar() {
    if (this.#pid === null && this.#tecla === null) return;

    // Libera la captura del puntero cuando corresponde.
    if (this.#pid !== null) {
      try {
        this.#raiz.releasePointerCapture(this.#pid);
      } catch {
        /* ya liberado */
      }
    }

    // Restablece las variables y la posición del control.
    this.#pid = null;
    this.#tecla = null;
    this.#dir = null;
    this.#knob.style.transform = '';

    this.#raiz.classList.remove('activo');

    // Quita el resaltado de todas las direcciones.
    for (const d of DIRS) {
      this.#flechas[d].classList.remove('on');
    }

    this.#cb.alSoltar(); // siempre solicita DETENER al soltar
  }
}