// Ajustes: vehículo (tarjetas) y sesión (API Key en sessionStorage, nunca en el código).
// Guardar, Limpiar datos y Cerrar validan, informan en el chat y cierran el modal.
import { sesion } from '../core/sesion.js';

const MAX_CLAVE = 200;

export class Ajustes {
  #dlg;
  #lista;
  #clave;
  #ver;
  #falt;
  #store;
  #alGuardar;
  #alLimpiar;
  #sel = null;

  // Inicializa los elementos del diálogo y registra los eventos de la interfaz.
  constructor({ dialogo, store, alGuardar, alLimpiar }) {
    this.#store = store;
    this.#alGuardar = alGuardar;
    this.#alLimpiar = alLimpiar;
    this.#dlg = dialogo;

    const q = (s) => dialogo.querySelector(s);

    this.#lista = q('#lista-vehiculos');
    this.#clave = q('#inp-clave');
    this.#ver = q('#btn-ver-clave');
    this.#falt = q('#lista-faltantes');

    // Permite seleccionar un vehículo desde su tarjeta.
    this.#lista.addEventListener('click', (e) => {
      const b = e.target.closest('button[role="radio"]');

      if (b && !b.disabled) {
        this.#elegir(Number(b.dataset.id), true);
      }
    });

    // Permite navegar entre vehículos mediante el teclado.
    this.#lista.addEventListener('keydown', (e) => this.#teclado(e));

    // Alterna la visibilidad de la clave de acceso.
    this.#ver.addEventListener('click', () => {
      const oculta = this.#clave.type === 'password';

      this.#clave.type = oculta ? 'text' : 'password';
      this.#ver.setAttribute(
        'aria-label',
        oculta ? 'Ocultar clave' : 'Mostrar clave'
      );
      this.#ver.firstElementChild.className =
        `bi ${oculta ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`;
    });

    // Registra las acciones principales del diálogo.
    q('#btn-guardar').addEventListener('click', () => this.#guardar());
    q('#btn-limpiar').addEventListener('click', () => this.#limpiar());
    q('#btn-cerrar-ajustes').addEventListener('click', () => this.#cerrar());

    // Actualiza la interfaz cuando cambian los datos del estado.
    for (const k of ['vehiculos', 'faltantes', 'api']) {
      store.on(k, () => this.#pintar());
    }
  }

  // Abre el diálogo y prepara los datos actuales.
  abrir() {
    this.#sel = this.#store.get('vehiculoId');
    this.#clave.value = '';
    this.#clave.type = 'password';
    this.#ver.firstElementChild.className = 'bi bi-eye-fill';

    this.#pintarClave();
    this.#pintar();

    if (!this.#dlg.open) this.#dlg.showModal();
  }

  // Muestra mensajes de información, advertencia o error.
  #msg(texto, tipo) {
    this.#store.set('mensaje', {
      texto,
      tipo,
      id: Date.now() + Math.random()
    });
  }

  // Indica si existe una clave guardada en la sesión.
  #pintarClave() {
    const min = sesion.minutosRestantes();
    this.#clave.placeholder = min ? `La sesión vence en ${min} min` : 'Ingresa la clave de acceso';
  }

  // Obtiene la lista de vehículos o utiliza el vehículo actual como alternativa.
  #opciones() {
    const lista = this.#store.get('vehiculos');

    if (lista.length) return lista;

    const id = this.#store.get('vehiculoId'); // sin lista: al menos el vehículo actual

    return id
      ? [{ id, nombre: `Vehículo #${id}`, activo: true }]
      : [];
  }

  // Construye y actualiza las tarjetas de vehículos y los comandos faltantes.
  #pintar() {
    const lista = this.#opciones();
    const hayLista = this.#store.get('vehiculos').length > 0;
    const nodos = [];

    // Muestra un mensaje cuando todavía no hay vehículos disponibles.
    if (!hayLista) {
      const p = document.createElement('p');
      p.className = 'vehiculos-vacio';

      p.textContent = this.#store.get('api') === 'no_disponible'
        ? 'No se pudo cargar la lista de vehículos. Revisa la API.'
        : 'Cargando vehículos…';

      nodos.push(p);
    }

    // Determina qué tarjeta tendrá el foco inicial.
    const tabId = lista.some((v) => v.id === this.#sel && v.activo)
      ? this.#sel
      : lista.find((v) => v.activo)?.id;

    // Genera una tarjeta por cada vehículo disponible.
    for (const v of lista) {
      const sel = v.id === this.#sel;
      const b = document.createElement('button');

      b.type = 'button';
      b.className = `veh-op${sel ? ' sel' : ''}`;
      b.dataset.id = String(v.id);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(sel));
      b.tabIndex = v.id === tabId ? 0 : -1;
      b.disabled = !v.activo;

      // Agrega el icono del vehículo.
      const ico = document.createElement('span');
      ico.className = 'veh-ico';
      const img = document.createElement('img');
      img.src = './img/excavadora.svg'; img.alt = ''; img.className = 'veh-img';
      ico.append(img);

      // Agrega el nombre y el identificador del vehículo.
      const txt = document.createElement('span');
      txt.className = 'veh-txt';

      const n = document.createElement('strong');
      n.textContent = v.nombre;

      const s = document.createElement('small');
      s.textContent = `#${v.id}${v.activo ? '' : ' · Inactivo'}`;

      txt.append(n, s);

      // Agrega el indicador visual de selección.
      const ok = document.createElement('i');
      ok.className = 'bi bi-check-circle-fill veh-check';
      ok.setAttribute('aria-hidden', 'true');

      b.append(ico, txt, ok);
      nodos.push(b);
    }

    this.#lista.replaceChildren(...nodos);

    // Muestra los comandos que no tienen equivalencia en el catálogo.
    const f = this.#store.get('faltantes');

    this.#falt.textContent = f.length
      ? `Sin equivalente en el catálogo: ${f.join(', ')}`
      : '';
  }

  // Selecciona un vehículo y, si corresponde, coloca el foco en su tarjeta.
  #elegir(id, enfocar) {
    if (!Number.isInteger(id) || id <= 0) return;

    this.#sel = id;
    this.#pintar();

    if (enfocar) {
      this.#lista.querySelector('[aria-checked="true"]')?.focus();
    }
  }

  // Gestiona la navegación entre tarjetas mediante las flechas del teclado.
  #teclado(e) {
    const paso = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1
    }[e.key];

    if (!paso) return;

    const activos = this.#opciones().filter((v) => v.activo);

    if (!activos.length) return;

    e.preventDefault();

    const i = activos.findIndex((v) => v.id === this.#sel);

    this.#elegir(
      activos[(i + paso + activos.length) % activos.length].id,
      true
    );
  }

  // Valida y guarda el vehículo seleccionado y la clave de acceso.
  #guardar() {
    const lista = this.#store.get('vehiculos');
    const id = this.#sel;
    const clave = this.#clave.value.trim();
    let guardado = false;

    // Valida que el vehículo seleccionado sea válido y esté activo.
    if (!Number.isInteger(id) || id <= 0) {
      this.#msg('Selecciona un vehículo para guardar.', 'error');
    } else if (
      lista.length &&
      !lista.some((v) => v.id === id && v.activo)
    ) {
      this.#msg('El vehículo elegido no existe o está inactivo.', 'error');
    } else {
      this.#alGuardar(id);
      guardado = true;
    }

    // Valida y guarda la clave de acceso cuando se proporciona.
    if (clave) {
      if (clave.length > MAX_CLAVE || /\s/.test(clave)) {
        this.#msg(
          'La clave no puede tener espacios ni más de 200 caracteres.',
          'error'
        );
      } else {
        sesion.guardarClave(clave);
        guardado = true;
      }
    }

    if (guardado) this.#msg('Ajustes guardados.', 'ok');

    if (!sesion.obtenerClave()) {
      this.#msg('Sin clave: podrás consultar, pero no enviar comandos.', 'warn');
    }

    this.#dlg.close();
  }

  // Elimina la clave de acceso y restablece el vehículo guardado.
  #limpiar() {
    sesion.borrarClave();
    this.#alLimpiar(); // olvida el vehículo guardado y vuelve al predeterminado

    if (sesion.obtenerClave()) {
      this.#msg('No se pudo borrar la clave de esta pestaña.', 'error');
    } else {
      this.#msg('Datos borrados: clave y vehículo guardado.', 'ok');
    }

    this.#dlg.close();
  }

  // Cierra el diálogo y advierte si no hay una clave guardada.
  #cerrar() {
    if (!sesion.obtenerClave()) {
      this.#msg('Sin clave guardada: solo podrás consultar.', 'warn');
    }

    this.#dlg.close();
  }
}
