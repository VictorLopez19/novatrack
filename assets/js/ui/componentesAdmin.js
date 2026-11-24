// Componentes reutilizables de las vistas de Administración y Propietario.
// Todo el contenido remoto se inserta como texto (nunca como HTML).

export function el(tag, clase = '', texto = '') {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto) e.textContent = texto;
    return e;
}

export function icono(clase) {
    const i = el('i', `bi ${clase}`);
    i.setAttribute('aria-hidden', 'true');
    return i;
}

/** Fila vacía de una lista. */
export function vacio(texto, ic = 'bi-inbox') {
    const li = el('li', 'ax-vacio');
    li.append(icono(ic), el('span', '', texto));
    return li;
}

/** Botón cuadrado con icono. */
export function botonIcono(ic, etiqueta, alClick, tono = '') {
    const b = el('button', `ax-ico-btn${tono ? ` ax-ico-${tono}` : ''}`);
    b.type = 'button';
    b.title = etiqueta;
    b.setAttribute('aria-label', etiqueta);
    b.append(icono(ic));
    b.addEventListener('click', alClick);
    return b;
}

/**
 * Interruptor tipo toggle. `alCambiar(nuevoValor)` devuelve una promesa con true/false:
 * si es false (o lanza), el interruptor vuelve a su posición anterior.
 */
export function crearToggle({ activo, etiquetas = ['Activo', 'Inactivo'], nombre = '', alCambiar }) {
    const label = el('label', 'ax-toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = Boolean(activo);
    if (nombre) input.setAttribute('aria-label', nombre);
    const texto = el('span', 'ax-toggle-txt', activo ? etiquetas[0] : etiquetas[1]);
    label.append(input, el('span', 'ax-toggle-pista'), texto);

    input.addEventListener('change', async () => {
        const nuevo = input.checked;
        input.disabled = true;
        let ok = false;
        try { ok = (await alCambiar(nuevo)) !== false; } catch { ok = false; }
        input.disabled = false;
        if (ok) texto.textContent = nuevo ? etiquetas[0] : etiquetas[1];
        else input.checked = !nuevo;
    });
    return label;
}

/**
 * Fila de lista: icono, título, datos secundarios, etiquetas, interruptor y botones.
 * @param {{icono:string,titulo:string,meta?:string[],etiquetas?:Array<[string,string]>,
 *          inactiva?:boolean,toggle?:object,acciones?:Array<{icono:string,etiqueta:string,alClick:Function,tono?:string}>}} o
 */
export function crearFila(o) {
    const li = el('li', 'ax-fila');
    if (o.inactiva) li.dataset.inactiva = 'true';

    const ico = el('span', 'ax-fila-ico');
    ico.append(icono(o.icono));

    const txt = el('div', 'ax-fila-txt');
    txt.append(el('strong', '', o.titulo));
    const meta = (o.meta ?? []).filter(Boolean);
    if (meta.length) txt.append(el('small', '', meta.join(' · ')));
    if (o.etiquetas?.length) {
        const tags = el('div', 'ax-etiquetas');
        for (const [t, tono] of o.etiquetas) {
            const s = el('span', 'ax-tag', t);
            s.dataset.tono = tono;
            tags.append(s);
        }
        txt.append(tags);
    }

    const acc = el('div', 'ax-fila-acc');
    if (o.toggle) acc.append(crearToggle({ ...o.toggle, nombre: o.toggle.nombre ?? `Cambiar estado de ${o.titulo}` }));
    for (const a of o.acciones ?? []) acc.append(botonIcono(a.icono, a.etiqueta, a.alClick, a.tono));

    li.append(ico, txt, acc);
    return li;
}

/** Rellena un <select> conservando la selección anterior cuando sigue existiendo. */
export function llenarSelect(select, datos, valor, etiqueta, textoVacio) {
    const anterior = select.value;
    select.replaceChildren();
    if (!datos.length) {
        const o = el('option', '', textoVacio);
        o.value = '';
        select.append(o);
        return;
    }
    for (const d of datos) {
        const o = el('option', '', etiqueta(d));
        o.value = String(valor(d));
        select.append(o);
    }
    if (datos.some((d) => String(valor(d)) === anterior)) select.value = anterior;
}

/** Lista ordenable de pasos de una demo (sube, baja y quita). `alCambiar` se llama tras cada cambio. */
export function pintarPasos(lista, pasos, nombreDe, alCambiar) {
    lista.replaceChildren();
    pasos.forEach((paso, i) => {
        const li = el('li', 'ax-paso');
        li.append(el('span', 'ax-paso-n', String(i + 1)));
        const txt = el('div', 'ax-fila-txt');
        txt.append(el('strong', '', nombreDe(paso)), el('small', '', `${paso.duracion_ms} ms · pausa ${paso.pausa_ms} ms`));
        const mover = (d) => () => { [pasos[i + d], pasos[i]] = [pasos[i], pasos[i + d]]; alCambiar(); };
        const acc = el('div', 'ax-fila-acc');
        const arriba = botonIcono('bi-arrow-up', `Subir el paso ${i + 1}`, mover(-1));
        const abajo = botonIcono('bi-arrow-down', `Bajar el paso ${i + 1}`, mover(1));
        arriba.disabled = i === 0;
        abajo.disabled = i === pasos.length - 1;
        acc.append(arriba, abajo, botonIcono('bi-trash3', `Quitar el paso ${i + 1}`, () => { pasos.splice(i, 1); alCambiar(); }, 'peligro'));
        li.append(txt, acc);
        lista.append(li);
    });
    if (!pasos.length) lista.append(vacio('Aún no hay pasos. Agrega el primero.', 'bi-list-ol'));
}

// ---------- PIN pendientes ----------
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Un solo reloj actualiza todas las cuentas regresivas de la página.
setInterval(() => {
    for (const e of document.querySelectorAll('[data-vence]')) {
        const resta = Math.max(0, Math.round((Number(e.dataset.vence) - Date.now()) / 1000));
        e.textContent = resta ? `Vence en ${mmss(resta)}` : 'Vencido';
        e.closest('.ax-pin-fila')?.toggleAttribute('data-vencido', resta === 0);
    }
}, 1000);

/**
 * Lista los PIN pendientes. Cada fila muestra el PIN, la unidad, el invitado, el tiempo que le queda
 * y botones para copiarlo y eliminarlo. `pin` llega nulo si la API se reinició (solo conserva el hash).
 */
export function pintarPines(lista, pines, { alCopiar, alEliminar }) {
    lista.replaceChildren(...(pines.length ? pines.map((p) => {
        const li = el('li', 'ax-pin-fila');
        const num = el('strong', 'ax-pin-codigo', p.pin ?? '•••••');
        if (!p.pin) num.title = 'La API se reinició: el PIN ya no se puede mostrar, pero sigue siendo válido.';
        const txt = el('div', 'ax-fila-txt');
        txt.append(el('strong', '', p.unidad ?? `Unidad ${p.id_vehiculo}`),
            el('small', '', p.identificador_invitado || 'Invitado'));
        const tiempo = el('span', 'ax-tag', '');
        tiempo.dataset.tono = 'amarillo';
        tiempo.dataset.vence = String(Date.now() + p.vence_en_s * 1000);
        tiempo.textContent = `Vence en ${mmss(p.vence_en_s)}`;
        const ses = el('span', 'ax-tag', `Sesión de ${p.duracion_min ?? '—'} min`);
        ses.dataset.tono = 'azul';
        const tags = el('div', 'ax-etiquetas');
        tags.append(tiempo, ses);
        txt.append(tags);
        const acc = el('div', 'ax-fila-acc');
        if (p.pin) acc.append(botonIcono('bi-clipboard', `Copiar el PIN ${p.pin}`, () => alCopiar(p.pin)));
        acc.append(botonIcono('bi-trash3', `Eliminar el PIN de ${p.identificador_invitado || 'Invitado'}`, () => alEliminar(p), 'peligro'));
        li.append(num, txt, acc);
        return li;
    }) : [vacio('No hay PIN pendientes. Genera uno y aparecerá aquí.', 'bi-key')]));
}

/** Copia un texto al portapapeles; devuelve true si lo logró. */
export async function copiarTexto(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

// ---------- Bitácora (línea de tiempo) ----------
// tipo → [tono, ícono, título]. Incluye los tipos del panel de administración y las acciones de auditoría del dueño.
const TIPOS_BITACORA = {
    creada: ['azul', 'bi-key-fill', 'PIN generado'],
    permiso: ['verde', 'bi-shield-check', 'Permiso concedido'],
    revocado: ['amarillo', 'bi-shield-x', 'Permiso revocado'],
    cerrada: ['rojo', 'bi-x-octagon-fill', 'Sesión cerrada'],
    acceso: ['gris', 'bi-box-arrow-in-right', 'Acceso'],
    config: ['morado', 'bi-sliders', 'Configuración'],
    detener: ['rojo', 'bi-sign-stop-fill', 'Parada de emergencia'],
    pin: ['azul', 'bi-key-fill', 'PIN'],
    bloqueo: ['rojo', 'bi-lock-fill', 'PIN bloqueado'],
    GENERAR_PIN_INVITADO: ['azul', 'bi-key-fill', 'PIN generado'],
    ACTIVAR_SESION_PIN: ['verde', 'bi-person-check-fill', 'Sesión iniciada'],
    AUTORIZAR_INVITADO: ['verde', 'bi-shield-check', 'Permiso concedido'],
    REVOCAR_INVITADO: ['amarillo', 'bi-shield-x', 'Permiso revocado'],
    CERRAR_INVITADO: ['rojo', 'bi-x-octagon-fill', 'Sesión cerrada'],
    FINALIZAR_SESION: ['gris', 'bi-flag-fill', 'Sesión finalizada'],
    ELIMINAR_PIN_INVITADO: ['rojo', 'bi-trash3-fill', 'PIN eliminado'],
};

/** Pinta la bitácora agrupada por día. Cada entrada: { fecha: Date, tipo, texto, pin?, invitado? }. */
export function pintarLineaTiempo(ol, entradas, textoVacio) {
    if (!entradas.length) { ol.replaceChildren(vacio(textoVacio, 'bi-journal-text')); return; }
    const hoy = new Date().toDateString();
    const ayer = new Date(Date.now() - 864e5).toDateString();
    let dia = null;
    const nodos = [];
    for (const e of entradas) {
        const valida = e.fecha instanceof Date && !Number.isNaN(e.fecha.getTime());
        const clave = valida ? e.fecha.toDateString() : 'sin-fecha';
        if (clave !== dia) {
            dia = clave;
            nodos.push(el('li', 'ax-dia', !valida ? 'Sin fecha' : clave === hoy ? 'Hoy' : clave === ayer ? 'Ayer'
                : e.fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })));
        }
        const [tono, ic, titulo] = TIPOS_BITACORA[e.tipo] ?? ['gris', 'bi-circle-fill', e.tipo || 'Evento'];
        const li = el('li', 'ax-ev');
        li.dataset.tono = tono;
        const ico = el('span', 'ax-ev-ico');
        ico.append(icono(ic));
        const cuerpo = el('div', 'ax-ev-cuerpo');
        const cab = el('div', 'ax-ev-cab');
        cab.append(el('strong', '', titulo), el('time', 'ev-hora', valida ? e.fecha.toLocaleTimeString('es-MX', { hour12: false }) : '—'));
        cuerpo.append(cab);
        if (e.texto) cuerpo.append(el('p', 'ax-ev-txt', e.texto));
        if (e.pin || e.invitado) {
            const chips = el('div', 'ax-etiquetas');
            if (e.pin) { const s = el('span', 'ax-tag', `PIN ${e.pin}`); s.dataset.tono = tono; chips.append(s); }
            if (e.invitado) { const s = el('span', 'ax-tag', e.invitado); s.dataset.tono = 'gris'; chips.append(s); }
            cuerpo.append(chips);
        }
        li.append(ico, cuerpo);
        nodos.push(li);
    }
    ol.replaceChildren(...nodos);
}
