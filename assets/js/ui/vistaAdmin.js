// Vista ADMINISTRACIÓN: inicio de sesión del administrador y gestión de las sesiones de control.
// Todo el contenido remoto se inserta como texto (nunca como HTML).

const CONFIRMAR_MS = 3500;

const WS = {
    en_linea: ['bi-broadcast', 'En vivo', 'ok'],
    conectando: ['bi-arrow-repeat', 'Conectando…', 'warn'],
    desconectado: ['bi-x-circle-fill', 'Sin tiempo real', 'err'],
};

const TONO_BITACORA = {
    creada: 'azul', permiso: 'verde', revocado: 'amarillo', cerrada: 'rojo',
    acceso: 'gris', config: 'morado', detener: 'rojo',
};

// Crea un elemento con clase y texto opcional.
function el(tag, clase = '', texto = '') {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto) e.textContent = texto;
    return e;
}

function icono(clase) {
    const i = el('i', `bi ${clase}`);
    i.setAttribute('aria-hidden', 'true');
    return i;
}

/** 75 → «1 min 15 s»; 3900 → «1 h 5 min». */
export function duracion(seg) {
    const s = Math.max(0, Math.floor(seg));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
    return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

const hora = (d) => (Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-MX', { hour12: false }));

export function iniciarVistaAdmin({ servicio, principal, pinPropio }) {
    const $ = (id) => document.getElementById(id);
    const est = servicio.estado;

    const login = $('admin-login');
    const panel = $('admin-panel');
    const form = $('adm-form');
    const usuario = $('adm-usuario');
    const clave = $('adm-clave');
    const error = $('adm-error');
    const entrar = $('adm-entrar');
    const lista = $('adm-lista');
    const buscar = $('adm-buscar');
    const filtro = $('adm-filtro');
    const auto = $('adm-auto');

    // Botones que piden una segunda pulsación para confirmar: clave → instante de vencimiento.
    const confirmaciones = new Map();

    // ---------- Inicio de sesión ----------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        if (!usuario.value.trim() || !clave.value) {
            error.textContent = 'Escribe el usuario y la contraseña.';
            error.hidden = false;
            return;
        }

        entrar.disabled = true;
        try {
            await servicio.login(usuario.value.trim(), clave.value);
            clave.value = '';
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            clave.select();
        } finally {
            entrar.disabled = false;
        }
    });

    $('adm-ver').addEventListener('click', (e) => {
        const ver = clave.type === 'password';
        clave.type = ver ? 'text' : 'password';
        e.currentTarget.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
        e.currentTarget.querySelector('i').className = `bi ${ver ? 'bi-eye-slash' : 'bi-eye'}`;
    });

    $('adm-salir').addEventListener('click', () => servicio.logout());

    est.on('autenticado', (a) => {
        login.hidden = a;
        panel.hidden = !a;
        $('adm-usuario-et').textContent = a ? `Conectado como ${est.get('usuario')}` : '';
        if (!a) {
            confirmaciones.clear();
            if (principal.get('vista') === 'admin') usuario.focus({ preventScroll: true });
        }
    });

    // ---------- Acciones generales ----------
    auto.addEventListener('change', () => {
        servicio.configurar(auto.checked).then((ok) => {
            if (!ok) auto.checked = !auto.checked;
        });
    });

    $('adm-todas-si').addEventListener('click', () => servicio.permisoTodas(true));
    $('adm-todas-no').addEventListener('click', (e) => confirmar(e.currentTarget, 'todas-no', () => servicio.permisoTodas(false)));
    $('adm-detener').addEventListener('click', (e) => {
        const id = principal.get('vehiculoId');
        if (!id) return;
        confirmar(e.currentTarget, 'detener', () => servicio.detener(id));
    });

    // Primera pulsación: pide confirmación; segunda (antes de CONFIRMAR_MS): ejecuta.
    function confirmar(boton, id, accion) {
        const vence = confirmaciones.get(id);

        if (vence && vence > Date.now()) {
            confirmaciones.delete(id);
            boton.classList.remove('confirmar');
            restaurarTexto(boton);
            accion();
            return;
        }

        confirmaciones.set(id, Date.now() + CONFIRMAR_MS);
        boton.classList.add('confirmar');
        boton.dataset.original ??= boton.querySelector('span')?.textContent ?? '';
        const span = boton.querySelector('span');
        if (span) span.textContent = '¿Confirmar?';

        setTimeout(() => {
            if ((confirmaciones.get(id) ?? 0) <= Date.now()) {
                confirmaciones.delete(id);
                boton.classList.remove('confirmar');
                restaurarTexto(boton);
            }
        }, CONFIRMAR_MS + 50);
    }

    function restaurarTexto(boton) {
        const span = boton.querySelector('span');
        if (span && boton.dataset.original !== undefined) span.textContent = boton.dataset.original;
    }

    // ---------- Lista de sesiones ----------
    lista.addEventListener('click', (e) => {
        const boton = e.target.closest('button[data-accion]');
        if (!boton || est.get('ocupado')) return;

        const { pin, accion } = boton.dataset;

        if (accion === 'permiso') servicio.permiso(pin, boton.dataset.autorizar === 'true');
        else if (accion === 'cerrar') confirmar(boton, `cerrar:${pin}`, () => servicio.cerrar(pin));
    });

    buscar.addEventListener('input', () => {
        buscar.value = buscar.value.replace(/\D/g, '').slice(0, 5);
        pintarLista();
    });
    filtro.addEventListener('change', pintarLista);

    function tarjeta(s) {
        const li = el('li', 'adm-sesion');
        li.dataset.pin = s.pin;
        li.dataset.autorizada = String(s.autorizada);
        li.dataset.conectada = String(s.conectada);

        // Cabecera: PIN, marca de esta pestaña y permiso
        const cab = el('div', 'adm-s-cab');
        const pin = el('strong', 'adm-pin', s.pin);
        pin.setAttribute('aria-label', `PIN ${s.pin.split('').join(' ')}`);
        cab.append(pin);
        if (s.pin === pinPropio()) cab.append(el('span', 'adm-tu', 'Esta pestaña'));

        const chip = el('span', `chip ${s.autorizada ? 'chip-ok' : 'chip-warn'} adm-chip`);
        chip.append(el('span', '', s.autorizada ? 'Con permiso' : 'Pendiente'));
        cab.append(chip);

        // Datos
        const datos = el('dl', 'adm-s-datos');
        const fila = (dt, dd) => {
            const d = el('div');
            d.append(el('dt', '', dt), dd instanceof Node ? dd : el('dd', '', dd));
            datos.append(d);
        };

        const conexion = el('dd', 'adm-conexion');
        conexion.append(el('span', `punto ${s.conectada ? 'punto-ok' : 'punto-warn'}`));
        const txtCon = el('span', '', s.conectada ? 'En línea' : 'Sin conexión');
        if (!s.conectada && s.cierreEnS !== null) {
            txtCon.dataset.cierre = String(s.cierreEnS);
            txtCon.textContent = `Sin conexión · se cierra en ${s.cierreEnS} s`;
        }
        conexion.append(txtCon);

        const edad = el('dd', '', duracion(s.edadS));
        edad.dataset.edad = String(s.edadS);

        fila('Dispositivo', s.dispositivo);
        fila('Conexión', conexion);
        fila('Activa desde hace', edad);
        fila('IP', s.ip || '—');
        fila('Comandos', String(s.comandos));
        fila('Último', s.ultimoComando ? `${s.ultimoComando}${s.idVehiculo ? ` · veh. ${s.idVehiculo}` : ''}` : '—');

        // Acciones
        const acciones = el('div', 'adm-s-acciones');
        const permiso = el('button', `btn-d adm-btn ${s.autorizada ? 'adm-revocar' : 'adm-autorizar'}`);
        permiso.type = 'button';
        permiso.dataset.accion = 'permiso';
        permiso.dataset.pin = s.pin;
        permiso.dataset.autorizar = String(!s.autorizada);
        permiso.append(el('span', '', s.autorizada ? 'Revocar' : 'Autorizar'));
        permiso.setAttribute('aria-label', `${s.autorizada ? 'Revocar permiso de' : 'Autorizar'} la sesión ${s.pin}`);

        const cerrar = el('button', 'btn-d btn-d-peligro adm-btn');
        cerrar.type = 'button';
        cerrar.dataset.accion = 'cerrar';
        cerrar.dataset.pin = s.pin;
        cerrar.append(el('span', '', 'Cerrar sesión'));
        cerrar.setAttribute('aria-label', `Cerrar la sesión ${s.pin}`);

        // Conserva el estado «¿Confirmar?» si la lista se repinta mientras se espera la segunda pulsación.
        if ((confirmaciones.get(`cerrar:${s.pin}`) ?? 0) > Date.now()) {
            cerrar.classList.add('confirmar');
            cerrar.dataset.original = 'Cerrar sesión';
            cerrar.querySelector('span').textContent = '¿Confirmar?';
        }

        acciones.append(permiso, cerrar);
        li.append(cab, datos, acciones);
        return li;
    }

    function pintarLista() {
        const datos = est.get('datos');
        if (!datos) return;

        // Recuerda el botón enfocado para devolverle el foco tras repintar.
        const activo = document.activeElement?.closest?.('#adm-lista button[data-accion]');
        const foco = activo ? { pin: activo.dataset.pin, accion: activo.dataset.accion } : null;

        const q = buscar.value;
        const f = filtro.value;
        const visibles = datos.sesiones.filter((s) =>
            (!q || s.pin.includes(q)) &&
            (f === 'todas' || (f === 'pendientes' && !s.autorizada) || (f === 'autorizadas' && s.autorizada)));

        if (!visibles.length) {
            const vacio = el('li', 'adm-vacio');
            vacio.append(icono(datos.sesiones.length ? 'bi-search' : 'bi-people'),
                el('span', '', datos.sesiones.length ? 'Ninguna sesión coincide con el filtro.' : 'No hay sesiones activas en este momento.'));
            lista.replaceChildren(vacio);
        } else {
            lista.replaceChildren(...visibles.map(tarjeta));
        }

        if (foco) {
            lista.querySelector(`button[data-pin="${foco.pin}"][data-accion="${foco.accion}"]`)?.focus({ preventScroll: true });
        }
    }

    function pintarBitacora(datos) {
        const ol = $('adm-bitacora');
        if (!datos.bitacora.length) {
            ol.replaceChildren(el('li', 'adm-vacio', 'Sin actividad registrada.'));
            return;
        }

        ol.replaceChildren(...datos.bitacora.slice(0, 40).map((b) => {
            const li = el('li', 'adm-log-item');
            li.dataset.tono = TONO_BITACORA[b.tipo] ?? 'gris';
            const t = el('time', 'ev-hora', hora(b.fecha));
            li.append(t);
            if (b.pin) li.append(el('span', 'adm-log-pin', b.pin));
            li.append(el('span', 'adm-log-txt', b.texto));
            return li;
        }));
    }

    est.on('datos', (datos) => {
        if (!datos) {
            lista.replaceChildren();
            return;
        }

        $('adm-n-total').textContent = datos.resumen.total;
        $('adm-n-conectadas').textContent = datos.resumen.conectadas;
        $('adm-n-autorizadas').textContent = datos.resumen.autorizadas;
        $('adm-n-pendientes').textContent = datos.resumen.pendientes;

        auto.checked = datos.autoAutorizar;

        const aviso = $('adm-aviso');
        aviso.hidden = datos.obligatorias;
        aviso.textContent = datos.obligatorias ? '' :
            'El servidor tiene SESIONES_OBLIGATORIAS=false: los clientes que no envían sesión pueden mover el vehículo sin permiso.';

        pintarLista();
        pintarBitacora(datos);
    });

    // Estado del WSS de administración
    function pintarWs(e) {
        const [ic, txt, nivel] = WS[e] ?? WS.desconectado;
        const chip = $('adm-chip-ws');
        chip.className = `chip chip-${nivel}`;
        chip.querySelector('i').className = `bi ${ic}`;
        chip.querySelector('span').textContent = txt;
    }
    est.on('ws', pintarWs);

    est.on('ocupado', (o) => panel.setAttribute('aria-busy', String(o)));

    // Nombre del vehículo que detiene el botón de emergencia
    const etiquetaDetener = () => {
        const nombre = principal.get('vehiculoNombre');
        $('adm-detener').title = nombre ? `Detener «${nombre}»` : 'Detener el vehículo seleccionado';
    };
    principal.on('vehiculoNombre', etiquetaDetener);
    etiquetaDetener();

    // Contadores en vivo (duración y cuenta regresiva de cierre) sin repintar la lista.
    setInterval(() => {
        if (principal.get('vista') !== 'admin' || !est.get('datos')) return;
        const pasado = (performance.now() - est.get('recibido')) / 1000;

        for (const dd of lista.querySelectorAll('[data-edad]')) {
            dd.textContent = duracion(Number(dd.dataset.edad) + pasado);
        }
        for (const sp of lista.querySelectorAll('[data-cierre]')) {
            const r = Math.max(0, Math.round(Number(sp.dataset.cierre) - pasado));
            sp.textContent = r > 0 ? `Sin conexión · se cierra en ${r} s` : 'Sin conexión · cerrándose…';
        }
    }, 1000);

    // Estado inicial de la vista
    login.hidden = est.get('autenticado');
    panel.hidden = !est.get('autenticado');
    $('adm-usuario-et').textContent = est.get('autenticado') ? `Conectado como ${est.get('usuario')}` : '';
    pintarWs(est.get('ws'));
}
