// Tarjeta de sesión de invitado y confirmación por doble pulsación (panel del dueño de carrito).
// Mismo diseño que la tarjeta del administrador; solo cambia el origen de los datos.

import { el } from './componentesAdmin.js';

const CONFIRMAR_MS = 3000;

/** 75 → «1 min 15 s»; 3900 → «1 h 5 min». */
export function duracion(seg) {
    const s = Math.max(0, Math.floor(seg));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
    return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** Pasa una sesión de la API (snake_case) al formato que usa la tarjeta. */
export function normalizarSesion(s) {
    return {
        pin: String(s.pin),
        idVehiculo: s.id_vehiculo ?? null,
        dispositivo: s.dispositivo || 'Dispositivo',
        ip: s.ip || '',
        autorizada: s.autorizada === true,
        conectada: s.conectada === true,
        cierreEnS: Number.isInteger(s.cierre_en_s) ? s.cierre_en_s : null,
        edadS: Number(s.edad_s) || 0,
        comandos: Number(s.comandos ?? 0) || 0,
        ultimoComando: s.ultimo_comando ?? null,
    };
}

/** Primera pulsación pide confirmar; la segunda (antes de CONFIRMAR_MS) ejecuta. */
export function crearConfirmador() {
    const pendientes = new Map();
    const restaurar = (boton) => {
        const span = boton.querySelector('span');
        if (span && boton.dataset.original !== undefined) span.textContent = boton.dataset.original;
    };
    return {
        pendiente: (id) => (pendientes.get(id) ?? 0) > Date.now(),
        confirmar(boton, id, accion) {
            if ((pendientes.get(id) ?? 0) > Date.now()) {
                pendientes.delete(id);
                boton.classList.remove('confirmar');
                restaurar(boton);
                accion();
                return;
            }
            pendientes.set(id, Date.now() + CONFIRMAR_MS);
            boton.classList.add('confirmar');
            const span = boton.querySelector('span');
            boton.dataset.original ??= span?.textContent ?? '';
            if (span) span.textContent = '¿Confirmar?';
            setTimeout(() => {
                if ((pendientes.get(id) ?? 0) <= Date.now()) {
                    pendientes.delete(id);
                    boton.classList.remove('confirmar');
                    restaurar(boton);
                }
            }, CONFIRMAR_MS + 50);
        },
    };
}

export function crearTarjetaSesion(s, { confirmador }) {
    const li = el('li', 'adm-sesion');
    li.dataset.pin = s.pin;
    li.dataset.autorizada = String(s.autorizada);
    li.dataset.conectada = String(s.conectada);

    const cab = el('div', 'adm-s-cab');
    const pin = el('strong', 'adm-pin', s.pin);
    pin.setAttribute('aria-label', `PIN ${s.pin.split('').join(' ')}`);
    const chip = el('span', `chip ${s.autorizada ? 'chip-ok' : 'chip-warn'} adm-chip`);
    chip.append(el('span', '', s.autorizada ? 'Con permiso' : 'Pendiente'));
    cab.append(pin, chip);

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
    fila('Último', s.ultimoComando ? String(s.ultimoComando) : '—');

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
    if (confirmador.pendiente(`cerrar:${s.pin}`)) {
        cerrar.classList.add('confirmar');
        cerrar.dataset.original = 'Cerrar sesión';
        cerrar.querySelector('span').textContent = '¿Confirmar?';
    }

    acciones.append(permiso, cerrar);
    li.append(cab, datos, acciones);
    return li;
}
