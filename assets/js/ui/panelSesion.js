// Muestra el PIN y el permiso de la sesión en «Información», en el encabezado y en el modal de permiso.
// El modal se puede cerrar para ver el control completo: el PIN del encabezado lo vuelve a abrir.

// estado → [icono, texto del chip, nivel, nota]
function describir(s, ws) {
    if (s.estado === 'administrador') {
        return ['bi-shield-check', 'Control de admin habilitado', 'ok', 'La cuenta de administrador puede controlar todas las unidades.'];
    }
    if (s.estado === 'propietario') {
        return ['bi-person-check', 'Dueño autenticado', 'ok', 'Puedes administrar demos e invitados de tus carritos.'];
    }
    if (s.estado === 'canjeando') {
        return ['bi-arrow-repeat', 'Validando PIN', 'warn', 'Comprobando el PIN con la API.'];
    }
    if (s.estado === 'requiere_pin') {
        return ['bi-key-fill', 'Ingresa tu PIN', 'warn', s.mensaje || 'Solicita un PIN temporal al administrador para iniciar el control.'];
    }
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

// Título del modal según el estado de la sesión.
function titulo(s) {
    if (s.estado === 'administrador') return 'Control de administrador';
    if (s.estado === 'propietario') return 'Acceso de propietario';
    if (s.estado === 'canjeando') return 'Validando PIN';
    if (s.estado === 'requiere_pin') return 'Iniciar sesión de control';
    if (s.estado === 'activa') return s.autorizada ? 'Sesión autorizada' : 'Esperando autorización';
    if (s.estado === 'cerrada') return 'Sesión cerrada';
    if (s.estado === 'error') return 'Sin sesión';
    return 'Sesión de control';
}

export function iniciarPanelSesion(store, ids, servicio) {
    const $ = (id) => document.getElementById(id);

    const dlg = $(ids.dialogo);
    const cerrar = $(ids.cerrar);
    const copiar = $(ids.copiar);
    const cab = $(ids.cabPin);
    const form = $(ids.form);
    const entrada = $(ids.entrada);
    const error = $(ids.error);
    const probar = ids.probar ? $(ids.probar) : null;

    // Iconos decorativos: pueden no estar en el HTML y el aviso debe seguir funcionando.
    const iconoModal = ids.modalIcono ? $(ids.modalIcono) : null;
    const iconoChip = $(ids.chip).querySelector('i');
    const textoChip = $(ids.chip).querySelector('span');

    // El usuario cerró el aviso: se recuerda para no volver a interrumpirlo
    // mientras no cambie el PIN ni el permiso de la sesión.
    let descartado = '';
    const huella = (s) => `${s.pin ?? '-'}|${s.estado}|${s.autorizada}`;

    // El aviso no debe taparse con la pantalla de entrada: espera a que termine.
    let avisosActivos = false;

    const abrir = () => {
        if (avisosActivos && !dlg.open) dlg.showModal();
    };

    // Cerrarlo con el botón o con Escape cuenta como descartarlo.
    dlg.addEventListener('close', () => {
        descartado = huella(store.get('sesion'));
    });
    cerrar.addEventListener('click', () => dlg.close());

    // Prueba sin PIN: solo unidades de exhibición; la API decide y devuelve el motivo si no se puede.
    probar?.addEventListener('click', async () => {
        error.hidden = true;
        probar.disabled = true;
        try {
            await servicio.probar();
        } catch (e) {
            error.textContent = e.message;
            error.hidden = false;
        } finally {
            probar.disabled = false;
        }
    });

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        error.hidden = true;
        entrada.value = entrada.value.replace(/\D/g, '').slice(0, 5);
        if (!/^\d{5}$/.test(entrada.value)) {
            error.textContent = 'El PIN debe tener cinco dígitos.';
            error.hidden = false;
            entrada.focus();
            return;
        }
        const boton = form.querySelector('button[type="submit"]');
        boton.disabled = true;
        try {
            await servicio.canjear(entrada.value);
            entrada.value = '';
        } catch (e) {
            error.textContent = e.message;
            error.hidden = false;
            entrada.select();
        } finally {
            boton.disabled = false;
        }
    });

    // El PIN del encabezado reabre el aviso cuando el usuario quiere consultarlo.
    cab.addEventListener('click', () => {
        if (['propietario', 'administrador'].includes(store.get('rol'))) return;
        descartado = '';
        avisosActivos = true;  // lo pide el usuario: ya no hay nada que esperar
        abrir();
    });

    copiar.addEventListener('click', async () => {
        const pin = store.get('sesion').pin;
        if (!pin) return;

        const etiqueta = copiar.querySelector('span');
        try {
            await navigator.clipboard.writeText(pin);
            etiqueta.textContent = '¡Copiado!';
        } catch {
            etiqueta.textContent = 'Selecciona el PIN'; // sin permiso del portapapeles
        }
        setTimeout(() => { etiqueta.textContent = 'Copiar'; }, 1800);
    });

    const refrescar = () => {
        const rol = store.get('rol');
        const s = ['propietario', 'administrador'].includes(rol)
            ? { estado: rol, pin: null, autorizada: true }
            : store.get('sesion');
        const [icono, texto, nivel, nota] = describir(s, store.get('sesionWs'));
        const pin = s.pin ?? '·····';

        // Diálogo «Información»
        $(ids.pin).textContent = pin;
        $(ids.chip).className = `chip chip-${nivel}`;
        if (iconoChip) iconoChip.className = `bi ${icono}`;
        if (textoChip) textoChip.textContent = texto;
        $(ids.nota).textContent = nota;

        // Encabezado: PIN visible junto al estado de conexión
        cab.textContent = s.estado === 'propietario' ? 'Propietario' : (s.pin ? `PIN ${s.pin}` : 'PIN …');
        if (s.estado === 'administrador') cab.textContent = 'Admin general';
        cab.dataset.nivel = nivel;
        cab.title = `${texto} · pulsa para ver los detalles`;

        // Modal del permiso
        dlg.dataset.nivel = nivel;
        if (iconoModal) iconoModal.className = `bi ${icono}`;
        $(ids.modalTitulo).textContent = titulo(s);
        $(ids.modalPin).textContent = pin;
        $(ids.modalTexto).textContent = nota;
        copiar.disabled = !s.pin;
        form.hidden = s.estado === 'activa' || s.estado === 'canjeando'
            || s.estado === 'propietario' || s.estado === 'administrador';
        if (s.estado === 'canjeando') form.querySelector('button[type="submit"]').disabled = true;
        else form.querySelector('button[type="submit"]').disabled = false;
        if (probar) probar.disabled = s.estado === 'canjeando';
        error.hidden = !s.mensaje;
        if (s.mensaje) error.textContent = s.mensaje;
        const datosPin = $(ids.modalPin).closest('.permiso-pin');
        datosPin.hidden = !s.pin;

        // Con permiso no hay nada que avisar; sin él se abre, salvo que el usuario
        // ya lo hubiera cerrado para este mismo estado.
        const listo = (s.autorizada && s.estado === 'activa')
            || s.estado === 'propietario' || s.estado === 'administrador';
        if (listo) {
            descartado = '';
            if (dlg.open) dlg.close();
        } else if (descartado !== huella(s)) {
            abrir();
        }
    };

    store.on('sesion', refrescar);
    store.on('sesionWs', refrescar);
    store.on('rol', refrescar);
    refrescar();

    return {
        /** Permite que el aviso se abra; se llama al terminar la pantalla de entrada. */
        mostrarAviso() {
            avisosActivos = true;
            refrescar();
        },
    };
}
