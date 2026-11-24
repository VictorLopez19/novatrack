// Notificaciones con SweetAlert2 (toast). Solo las usa la sección de Administración.
// SweetAlert2 interpreta `title` como HTML: el texto remoto se escapa antes de mostrarlo.

const ICONOS = { ok: 'success', error: 'error', warn: 'warning', info: 'info' };
const GLIFOS = { ok: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function notificar(texto, tipo = 'ok') {
    const Swal = globalThis.Swal;
    if (!Swal || !texto) return;
    const clave = ICONOS[tipo] ? tipo : 'info';
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: ICONOS[clave],
        iconHtml: `<i class="bi ${GLIFOS[clave]}" aria-hidden="true"></i>`,
        title: escapar(String(texto).slice(0, 220)),
        showConfirmButton: false,
        timer: tipo === 'error' ? 6000 : 3500,
        timerProgressBar: true,
        customClass: { popup: `ax-toast ax-toast-${clave}`, icon: 'ax-toast-ico' },
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        },
    });
}
