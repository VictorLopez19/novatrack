// Muestra el aviso de orientación vertical.
// Permite girar la pantalla o mantenerla en vertical.
// iOS no permite forzar la rotación: ahí se pide girar a mano.
const CLASE = 'mantener-vertical';

export function iniciarAvisoGiro() {
  // Obtiene los elementos del aviso de orientación.
  const girar = document.getElementById('btn-girar');
  const mantener = document.getElementById('btn-vertical');
  const ayuda = document.getElementById('giro-ayuda');

  // Intenta activar la pantalla completa y cambiar la orientación a horizontal.
  girar.addEventListener('click', async () => {
    ayuda.textContent = '';

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      await screen.orientation.lock('landscape');
    } catch {
      // Informa cuando el navegador no permite cambiar la orientación.
      ayuda.textContent = 'Tu navegador no permite girar la pantalla desde aquí. Gira el teléfono y desactiva el bloqueo de rotación.';
    }
  });

  // Permite mantener la pantalla en vertical y cerrar el aviso.
  mantener.addEventListener('click', () => {
    ayuda.textContent = '';
    document.documentElement.classList.add(CLASE);

    try {
      screen.orientation.unlock?.();
    } catch {
      /* sin soporte */
    }
  });

  // Al pasar a horizontal se olvida la elección: si vuelve a vertical, el aviso reaparece.
  matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
    if (!e.matches) {
      document.documentElement.classList.remove(CLASE);
    }
  });
}
