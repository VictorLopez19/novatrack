// Mensajes tipo chat (esquina inferior derecha). textContent evita inyección DOM.

// Iconos correspondientes a los diferentes tipos de mensajes.
const ICONOS = {
  ok: 'bi-check-circle-fill',
  warn: 'bi-exclamation-triangle-fill',
  error: 'bi-x-octagon-fill',
  info: 'bi-chat-dots-fill',
};

// Número máximo de mensajes visibles simultáneamente.
const MAX = 2;

// Inicializa el sistema de notificaciones tipo chat.
export function iniciarMensajes(store, contenedor, duracionMs) {

  // Elimina un mensaje mediante una transición de salida.
  const quitar = (b) => {
    clearTimeout(b._t);
    b.classList.add('saliendo');
    setTimeout(() => b.remove(), 250);
  };

  // Programa la eliminación automática de un mensaje.
  const programar = (b) => {
    clearTimeout(b._t);
    b._t = setTimeout(() => quitar(b), duracionMs);
  };

  // Escucha los mensajes emitidos por el almacén de estado.
  store.on('mensaje', (m) => {
    if (!m.texto) return;

    // Determina el tipo de mensaje y obtiene el último elemento mostrado.
    const tipo = ICONOS[m.tipo] ? m.tipo : 'info';
    const ultimo = contenedor.lastElementChild;

    // Mismo mensaje seguido: contador en vez de repetir burbujas.
    if (
      ultimo &&
      ultimo.dataset.texto === m.texto &&
      !ultimo.classList.contains('saliendo')
    ) {
      const n = Number(ultimo.dataset.n) + 1;
      ultimo.dataset.n = String(n);
      ultimo.querySelector('.chat-n').textContent = `×${n}`;

      // Reinicia el tiempo de visualización del mensaje.
      programar(ultimo);
      return;
    }

    // Crea la burbuja del nuevo mensaje.
    const b = document.createElement('div');
    b.className = `chat-burbuja chat-${tipo}`;
    b.dataset.texto = m.texto;
    b.dataset.n = '1';

    // Agrega el icono correspondiente al tipo de mensaje.
    const i = document.createElement('i');
    i.className = `bi ${ICONOS[tipo]}`;
    i.setAttribute('aria-hidden', 'true');

    // Crea el elemento que contiene el texto del mensaje.
    const t = document.createElement('span');
    t.className = 'chat-texto';
    t.textContent = m.texto;

    // Crea el contador de mensajes repetidos.
    const n = document.createElement('span');
    n.className = 'chat-n';

    // Obtiene y muestra la hora actual.
    const h = document.createElement('small');
    h.className = 'chat-hora';
    h.textContent = new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Agrega todos los elementos a la burbuja.
    b.append(i, t, n, h);

    // Elimina las burbujas que ya estaban en proceso de salida.
    contenedor.querySelectorAll('.saliendo').forEach((elemento) => {
      elemento.remove();
    });

    // Inserta el nuevo mensaje en el contenedor.
    contenedor.append(b);

    // Mantiene el límite máximo de mensajes visibles.
    if (contenedor.children.length > MAX) {
      quitar(contenedor.firstElementChild);
    }

    // Programa la eliminación automática de la nueva notificación.
    programar(b);
  });
}
