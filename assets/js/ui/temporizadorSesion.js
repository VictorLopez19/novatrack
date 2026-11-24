// Temporizador de la sesión de invitado: muestra arriba al centro cuánto tiempo le queda.
// La hora de vencimiento (`venceEn`, ms) la fija ServicioSesion al canjear el PIN y la afina el WSS.

const pad = (n) => String(n).padStart(2, '0');

export function iniciarTemporizadorSesion(store, caja) {
    const texto = caja.querySelector('.st-tiempo');
    const barra = caja.querySelector('.st-barra > span');
    let hasta = 0;
    let total = 0;
    let reloj = 0;

    const detener = () => { clearInterval(reloj); reloj = 0; };

    const pintar = () => {
        const resta = Math.max(0, Math.round((hasta - Date.now()) / 1000));
        const h = Math.floor(resta / 3600);
        const m = Math.floor((resta % 3600) / 60);
        texto.textContent = h ? `${h}:${pad(m)}:${pad(resta % 60)}` : `${pad(m)}:${pad(resta % 60)}`;
        caja.dataset.nivel = resta <= 60 ? 'err' : resta <= 120 ? 'warn' : 'ok';
        barra.style.width = `${total > 0 ? Math.min(100, (resta * 1000 / total) * 100) : 0}%`;
        caja.setAttribute('aria-label', `Tiempo restante de la sesión: ${Math.floor(resta / 60)} minutos y ${resta % 60} segundos`);
        if (resta <= 0) detener();
    };

    const evaluar = () => {
        const s = store.get('sesion');
        const propio = ['administrador', 'propietario'].includes(store.get('rol'));
        const visible = s?.estado === 'activa' && Number.isFinite(s.venceEn) && !propio;
        caja.hidden = !visible;
        if (!visible) { detener(); return; }
        if (hasta !== s.venceEn) {
            hasta = s.venceEn;
            total = Number.isFinite(s.duracionS) ? s.duracionS * 1000 : Math.max(0, hasta - Date.now());
        }
        pintar();
        if (!reloj) reloj = setInterval(pintar, 1000);
    };

    store.on('sesion', evaluar);
    store.on('rol', evaluar);
    evaluar();
}
