// Muestra la pantalla de entrada y permite saltarla con un toque, un clic o el teclado.
export function mostrarSplash(el, { duracionMs = 2200, salidaMs = 500, saltoMs = 160 } = {}) {
  return new Promise((resolve) => {
    let cerrado = false;
    let t = null;

    // Quita los eventos de cierre para no responder dos veces.
    const quitarEventos = () => {
      el.removeEventListener('pointerdown', alPuntero);
      el.removeEventListener('click', alPuntero);
      document.removeEventListener('keydown', alTecla);
    };

    /**
     * Cierra la pantalla de entrada. Si la salta el usuario, la salida se acorta
     * para que la respuesta al toque se sienta inmediata.
     */
    const cerrar = (porElUsuario = false) => {
      if (cerrado) return;

      cerrado = true;
      clearTimeout(t);
      quitarEventos();

      if (porElUsuario) el.classList.add('rapido');
      el.classList.add('salir');

      setTimeout(() => {
        el.hidden = true;
        resolve();
      }, porElUsuario ? saltoMs : salidaMs);
    };

    // Un toque o un clic en cualquier parte de la pantalla la salta.
    // `pointerdown` responde al instante; `click` queda como respaldo.
    const alPuntero = () => cerrar(true);

    // Detecta las teclas permitidas para saltarla.
    const alTecla = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        cerrar(true);
      }
    };

    // Registra los eventos de cierre.
    el.addEventListener('pointerdown', alPuntero);
    el.addEventListener('click', alPuntero);
    document.addEventListener('keydown', alTecla);

    // Programa el cierre automático.
    t = setTimeout(() => cerrar(false), duracionMs);
  });
}
