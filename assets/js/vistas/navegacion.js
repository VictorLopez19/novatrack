// Navegación CONTROL ⇄ MONITOREO dentro de la misma página (hash #/control · #/monitoreo).
// Funciona en GitHub Pages sin servidor. El WSS y los servicios son únicos: aquí solo se alterna la vista.
const RUTAS = { control: '#/control', monitoreo: '#/monitoreo' };
const TEXTOS = { control: 'Abriendo control ...', monitoreo: 'Abriendo monitoreo ...' };

const desdeHash = () => (location.hash === RUTAS.monitoreo ? 'monitoreo' : 'control');

export function iniciarNavegacion({ store, transicion, vistas, enlaces, alSalir = {}, alEntrar = {} }) {
  let actual = null;

  function aplicar(destino) {
    const inicial = actual === null;
    if (actual) alSalir[actual]?.();

    for (const [nombre, el] of Object.entries(vistas)) el.hidden = nombre !== destino;
    for (const [nombre, a] of Object.entries(enlaces)) {
      if (nombre === destino) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }

    document.documentElement.classList.toggle('vista-monitoreo', destino === 'monitoreo');
    actual = destino;
    store.set('vista', destino);
    window.scrollTo(0, 0);
    alEntrar[destino]?.();
    if (!inicial) vistas[destino].focus({ preventScroll: true }); // lectores de pantalla: anuncia la nueva sección
  }

  // Lee el hash en el momento de aplicar: si cambió durante la transición, gana el último.
  function sincronizar() {
    const destino = desdeHash();
    if (destino !== actual) aplicar(destino);
  }

  window.addEventListener('hashchange', () => {
    if (desdeHash() === actual || transicion.activa) return; // la transición activa llama a sincronizar() al terminar
    transicion.mostrar(TEXTOS[desdeHash()], { duracionMs: 450, alTerminar: sincronizar });
  });

  sincronizar(); // arranque sin animación: el splash cubre la pantalla
}
