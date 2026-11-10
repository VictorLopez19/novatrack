// Al girar el celular a horizontal, el primer toque activa la pantalla completa.
// Los navegadores exigen un gesto del usuario para entrar; al volver a vertical se sale.
export function iniciarPantallaCompleta({ aviso } = {}) {
  const horizontal = matchMedia('(orientation: landscape)');
  const tactil = matchMedia('(pointer: coarse)');
  const raiz = document.documentElement;
  let armado = false;

  const puede = () => Boolean(document.fullscreenEnabled && raiz.requestFullscreen);

  function desarmar() {
    armado = false;
    document.removeEventListener('pointerup', entrar, true);
  }
  function entrar() {
    desarmar();
    if (document.fullscreenElement) return;
    raiz.requestFullscreen().catch(() => { /* el navegador la rechazó */ });
  }
  function armar(conAviso) {
    if (armado || !puede() || !tactil.matches || !horizontal.matches || document.fullscreenElement) return;
    armado = true;
    document.addEventListener('pointerup', entrar, true);
    if (conAviso) aviso?.('Toca la pantalla para activar pantalla completa.');
  }

  horizontal.addEventListener('change', (e) => {
    if (e.matches) { armar(true); return; }
    desarmar();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  armar(false); // ya en horizontal al abrir: el primer toque (p. ej. en la pantalla de entrada) la activa
}