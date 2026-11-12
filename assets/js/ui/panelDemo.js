// Diálogo DEMO en carrusel: se desliza entre cartas; un toque + confirmación inicia; en la activa, cancela.

// Detecta si el usuario tiene activada la preferencia de movimiento reducido.
const REDUCIR = matchMedia('(prefers-reduced-motion: reduce)');

// Controla el diálogo de DEMOs, su carrusel y las acciones de inicio y cancelación.
export class PanelDemo {
  #dlg;
  #lista;
  #est;
  #prev;
  #next;
  #puntos;
  #cont;
  #store;
  #demo;
  #confirmando = null;
  #tConf = null;
  #raf = 0;

  // Inicializa el panel y registra los eventos de interacción.
  constructor({ dialogo, store, servicioDemo }) {
    this.#store = store;
    this.#demo = servicioDemo;
    this.#dlg = dialogo;

    // Obtiene los elementos del diálogo.
    const q = (s) => dialogo.querySelector(s);

    this.#lista = q('#lista-demos');
    this.#est = q('#demo-estado');
    this.#prev = q('#demo-prev');
    this.#next = q('#demo-next');
    this.#puntos = q('#demo-puntos');
    this.#cont = q('#demo-contador');

    // Gestiona las acciones de iniciar y cancelar una DEMO.
    this.#lista.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-accion]');
      if (!b) return;

      const id = Number(b.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;

      // Cancela la DEMO activa.
      if (b.dataset.accion === 'cancelar') {
        this.#demo.cancelar();
        return;
      }

      if (this.#confirmando === id) {
        // Segundo toque: confirma e inicia la DEMO.
        this.#limpiarConfirmacion();
        this.#demo.iniciar(id);
      } else {
        // Primer toque: solicita confirmación antes de iniciar.
        this.#confirmando = id;
        clearTimeout(this.#tConf);

        this.#tConf = setTimeout(() => {
          this.#confirmando = null;
          this.#pintar();
        }, 3000);

        this.#pintar();
      }
    });

    // Actualiza la navegación cuando cambia la posición del carrusel.
    this.#lista.addEventListener('scroll', () => {
      cancelAnimationFrame(this.#raf);
      this.#raf = requestAnimationFrame(() => this.#nav());
    }, { passive: true });

    // Registra los controles para avanzar y retroceder entre las DEMOs.
    this.#prev.addEventListener('click', () => this.#ir(this.#indice() - 1));
    this.#next.addEventListener('click', () => this.#ir(this.#indice() + 1));

    // Registra los botones para recargar las DEMOs y cerrar el diálogo.
    q('#btn-demo-recargar').addEventListener('click', () =>
      this.#demo.cargar(this.#store.get('vehiculoId'))
    );

    q('#btn-demo-cerrar').addEventListener('click', () =>
      this.#dlg.close()
    );

    // Limpia la confirmación y actualiza el panel al cerrar el diálogo.
    dialogo.addEventListener('close', () => {
      this.#limpiarConfirmacion();
      this.#pintar();
    });

    // Actualiza el panel cuando cambian las DEMOs o su estado.
    store.on('demos', () => this.#pintar());
    store.on('demo', () => this.#pintar());

    this.#pintar();
  }

  // Abre el diálogo y posiciona el carrusel en la DEMO activa, si existe.
  abrir() {
    this.#limpiarConfirmacion();
    this.#pintar();
    this.#dlg.showModal();

    const d = this.#store.get('demo');
    const i = this.#store.get('demos').findIndex(
      (x) => x.id_demo === d.idDemo
    );

    if (d.estado !== 'libre' && i >= 0) {
      this.#ir(i, 'auto'); // abrir sobre la DEMO activa
    } else {
      this.#nav();
    }
  }

  // Cancela el temporizador y restablece la confirmación pendiente.
  #limpiarConfirmacion() {
    clearTimeout(this.#tConf);
    this.#confirmando = null;
  }

  // Obtiene el índice de la tarjeta que se encuentra más cerca del centro.
  #indice() {
    const lis = [...this.#lista.children];
    const centro = this.#lista.scrollLeft + this.#lista.clientWidth / 2;

    let mejor = 0;
    let dist = Infinity;

    lis.forEach((li, i) => {
      const d = Math.abs(li.offsetLeft + li.offsetWidth / 2 - centro);

      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });

    return mejor;
  }

  // Desplaza el carrusel hasta la tarjeta indicada.
  #ir(i, modo) {
    const lis = this.#lista.children;
    if (!lis.length) return;

    const destino = lis[Math.max(0, Math.min(lis.length - 1, i))];

    destino.scrollIntoView({
      behavior: REDUCIR.matches ? 'auto' : (modo ?? 'smooth'),
      inline: 'center',
      block: 'nearest'
    });
  }

  // Actualiza los controles de navegación y los indicadores del carrusel.
  #nav() {
    const n = this.#store.get('demos').length;
    const i = n ? this.#indice() : 0;

    this.#prev.disabled = i <= 0;
    this.#next.disabled = i >= n - 1;
    this.#cont.textContent = n > 1 ? `${i + 1} / ${n}` : '';

    // Genera y actualiza los puntos cuando hay entre 2 y 8 DEMOs.
    if (n > 1 && n <= 8) {
      if (this.#puntos.children.length !== n) {
        this.#puntos.replaceChildren(
          ...Array.from({ length: n }, () => {
            const p = document.createElement('span');
            p.className = 'punto-d';
            return p;
          })
        );
      }

      [...this.#puntos.children].forEach((p, k) =>
        p.classList.toggle('on', k === i)
      );
    } else {
      this.#puntos.replaceChildren();
    }
  }

  // Actualiza las tarjetas y el estado general del panel.
  #pintar() {
    const demos = this.#store.get('demos');
    const d = this.#store.get('demo');
    const ocupado = d.estado !== 'libre';
    const pos = this.#lista.scrollLeft; // conservar el deslizamiento al repintar

    // Muestra un mensaje cuando no existen DEMOs disponibles.
    if (!demos.length) {
      const vacio = document.createElement('li');
      vacio.className = 'demo-vacio';
      vacio.textContent = 'No hay DEMO activas para este vehículo.';
      this.#lista.replaceChildren(vacio);
    } else {
      // Genera las tarjetas correspondientes a las DEMOs disponibles.
      this.#lista.replaceChildren(
        ...demos.map((x) => this.#tarjeta(x, d, ocupado))
      );
    }

    // Conserva la posición del carrusel después de actualizar las tarjetas.
    this.#lista.scrollLeft = pos;

    this.#pintarEstado(d);
    this.#nav();
  }

  // Muestra el estado actual y el progreso de la DEMO.
  #pintarEstado(d) {
    const el = this.#est;
    el.replaceChildren();
    el.dataset.estado = d.estado;

    // Muestra un mensaje cuando no hay ninguna DEMO en ejecución.
    if (d.estado === 'libre') {
      el.textContent = 'Sin DEMO en ejecución';
      return;
    }

    // Construye la fila principal del indicador de estado.
    const fila = document.createElement('div');
    fila.className = 'de-fila';

    const izq = document.createElement('span');
    izq.className = 'de-izq';

    const punto = document.createElement('span');
    punto.className = 'de-punto';
    punto.setAttribute('aria-hidden', 'true');

    izq.append(punto);

    // Muestra el estado mientras la DEMO está iniciando.
    if (d.estado === 'iniciando') {
      izq.append(document.createTextNode('Iniciando…'));
      fila.append(izq);
      el.append(fila);
      return;
    }

    // Construye el indicador del paso actual y el total de pasos.
    const paso = document.createElement('div');
    paso.className = 'de-paso';

    const num = document.createElement('b');
    num.textContent = String(d.orden ?? 0);
    paso.append(num);

    if (d.total) {
      const t = document.createElement('small');
      t.textContent = `/ ${d.total}`;
      paso.append(t);
    }

    izq.append(paso);
    fila.append(izq);

    // Agrega el nombre del comando que se está ejecutando.
    if (d.comando) {
      const cmd = document.createElement('span');
      cmd.className = 'demo-cmd';
      cmd.textContent = d.comando;
      fila.append(cmd);
    }

    el.append(fila);
  }

  // Construye una tarjeta individual para cada DEMO disponible.
  #tarjeta(x, d, ocupado) {
    const activa = ocupado && d.idDemo === x.id_demo;
    const confirmando = !ocupado && this.#confirmando === x.id_demo;

    const li = document.createElement('li');
    li.className = `demo-card${activa ? ' activa' : ''}`;

    // Crea el icono representativo de la DEMO.
    const ico = document.createElement('div');
    ico.className = 'demo-icono';

    const ii = document.createElement('i');
    ii.className = 'fa-solid fa-gamepad';
    ii.setAttribute('aria-hidden', 'true');

    ico.append(ii);

    // Crea y agrega el nombre de la DEMO.
    const nombre = document.createElement('strong');
    nombre.className = 'demo-nombre';
    nombre.textContent = x.nombre;

    li.append(ico, nombre);

    // Muestra la barra de progreso cuando la DEMO está activa.
    if (activa) {
      const prog = document.createElement('div');
      prog.className = 'demo-prog';

      const barra = document.createElement('div');
      barra.className = 'demo-prog-bar';

      barra.style.width = d.total
        ? `${Math.min(100, Math.round((d.orden / d.total) * 100))}%`
        : '8%';

      prog.append(barra);
      li.append(prog);
    }

    // Crea el botón de acción de la tarjeta.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = String(x.id_demo);

    const icono = document.createElement('i');
    icono.setAttribute('aria-hidden', 'true');

    const txt = document.createElement('span');

    // Configura el botón según el estado de la DEMO.
    if (activa) {
      btn.dataset.accion = 'cancelar';
      btn.className = 'demo-btn demo-btn-cancelar';

      //icono.className = 'bi bi-stop-fill';
      txt.textContent = 'Cancelar DEMO';

      btn.setAttribute('aria-label', `Cancelar DEMO ${x.nombre}`);
    } else {
      btn.dataset.accion = 'iniciar';
      btn.className = `demo-btn${confirmando ? ' confirmar' : ''}`;
      btn.disabled = ocupado;

      //icono.className = `bi ${confirmando ? 'bi-check-lg' : 'bi-play-fill'}`;
      txt.textContent = confirmando
        ? 'Toca otra vez para iniciar'
        : 'Iniciar';

      btn.setAttribute(
        'aria-label',
        confirmando
          ? `Confirmar inicio de ${x.nombre}`
          : `Iniciar DEMO ${x.nombre}`
      );
    }

    // Agrega el contenido del botón y lo incorpora a la tarjeta.
    btn.append(icono, txt);
    li.append(btn);

    return li;
  }
}