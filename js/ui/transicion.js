// Gestiona la pantalla de carga con desvanecido antes de cambiar de vista.
export function crearTransicion(el) {
  const texto = el.querySelector('#trans-texto');

  // Permite esperar un tiempo determinado.
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  let activa = false;

  return {
    get activa() {
      return activa;
    },

    // Muestra la pantalla de carga y ejecuta una acción al finalizar.
    async mostrar(mensaje, { duracionMs = 900, alTerminar } = {}) {
      if (activa) return;

      activa = true;
      texto.textContent = mensaje;
      el.hidden = false;

      void el.offsetWidth; // Reinicia la transición CSS.

      el.classList.add('visible');

      await esperar(duracionMs);

      try {
        alTerminar?.();
      } finally {
        // Oculta la pantalla de carga mediante un desvanecido.
        el.classList.remove('visible');

        await esperar(250);

        el.hidden = true;
        activa = false;
      }
    },
  };
}