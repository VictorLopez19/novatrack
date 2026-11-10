// Muestra la pantalla de entrada y permite cerrarla mediante tiempo, clic o teclado.
export function mostrarSplash(el, { duracionMs = 2200 } = {}) {
  return new Promise((resolve) => {
    let cerrado = false;
    let t = null;

    // Cierra la pantalla de entrada y limpia los eventos.
    const cerrar = () => {
      if (cerrado) return;

      cerrado = true;
      clearTimeout(t);

      el.removeEventListener('click', cerrar);
      document.removeEventListener('keydown', alTecla);

      el.classList.add('salir');

      setTimeout(() => {
        el.hidden = true;
        resolve();
      }, 500);
    };

    // Detecta las teclas permitidas para cerrar la pantalla.
    const alTecla = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        cerrar();
      }
    };

    // Registra los eventos de cierre.
    el.addEventListener('click', cerrar);
    document.addEventListener('keydown', alTecla);

    // Programa el cierre automático.
    t = setTimeout(cerrar, duracionMs);
  });
}