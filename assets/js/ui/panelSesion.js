// Muestra el PIN y el permiso de la sesión en «Información» y el aviso de CONTROL cuando falta el permiso.

// estado → [icono, texto del chip, nivel, nota]
function describir(s, ws) {
    if (s.estado === 'cerrada') {
        return ['bi-x-octagon-fill', 'Sesión cerrada', 'err', 'El administrador cerró esta sesión. La página se recargará.'];
    }
    if (s.estado === 'error') {
        return ['bi-cloud-slash-fill', 'Sin sesión', 'err', `No se pudo crear la sesión; se reintentará. ${s.mensaje ?? ''}`.trim()];
    }
    if (s.estado !== 'activa') {
        return ['bi-hourglass-split', 'Creando sesión…', 'warn', 'Generando el PIN de esta sesión.'];
    }
    if (ws !== 'en_linea') {
        return ['bi-arrow-repeat', s.autorizada ? 'Autorizada (reconectando)' : 'Reconectando…', 'warn',
            'Sin conexión en tiempo real con la sesión: si tarda demasiado, la sesión expira y se genera otro PIN.'];
    }
    if (s.autorizada) {
        return ['bi-shield-check', 'Con permiso', 'ok', 'El administrador autorizó esta sesión para controlar el vehículo.'];
    }
    return ['bi-shield-lock-fill', 'Esperando permiso', 'warn', 'Comparte este PIN con el administrador para que autorice el control.'];
}

export function iniciarPanelSesion(store, ids) {
    const $ = (id) => document.getElementById(id);

    const refrescar = () => {
        const s = store.get('sesion');
        const [icono, texto, nivel, nota] = describir(s, store.get('sesionWs'));
        const pin = s.pin ?? '·····';

        // Diálogo «Información»
        $(ids.pin).textContent = pin;
        const chip = $(ids.chip);
        chip.className = `chip chip-${nivel}`;
        chip.querySelector('i').className = `bi ${icono}`;
        chip.querySelector('span').textContent = texto;
        $(ids.nota).textContent = nota;

        // Aviso en CONTROL (solo cuando no hay permiso)
        const aviso = $(ids.aviso);
        aviso.hidden = s.autorizada && s.estado === 'activa';
        aviso.dataset.nivel = nivel;
        $(ids.avisoPin).textContent = pin;
        $(ids.avisoTitulo).textContent = s.estado === 'activa' ? 'Esperando autorización' : texto;

        // Con la sesión activa basta el título y el PIN; la nota solo se muestra si hay algo que explicar
        // (la sesión se está creando, la API no responde o el administrador cerró la sesión).
        const avisoTexto = $(ids.avisoTexto);
        avisoTexto.textContent = s.estado === 'activa' ? '' : nota;
        avisoTexto.hidden = !avisoTexto.textContent;

        // Encabezado: PIN visible junto al estado de conexión
        const cab = $(ids.cabPin);
        cab.textContent = s.pin ? `PIN ${s.pin}` : 'PIN …';
        cab.dataset.nivel = nivel;
        cab.title = texto;
    };

    store.on('sesion', refrescar);
    store.on('sesionWs', refrescar);
    refrescar();
}
