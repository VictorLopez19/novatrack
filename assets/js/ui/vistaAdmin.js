// Vista ADMINISTRACIÓN: inicio de sesión del administrador y gestión de las sesiones de control.
// Todo el contenido remoto se inserta como texto (nunca como HTML).

import { el, icono, crearFila, llenarSelect, pintarPasos, vacio, pintarPines, copiarTexto, pintarLineaTiempo } from './componentesAdmin.js';
import { notificar } from './notificaciones.js';

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

/** 75 → «1 min 15 s»; 3900 → «1 h 5 min». */
export function duracion(seg) {
    const s = Math.max(0, Math.floor(seg));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
    return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

const hora = (d) => (Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-MX', { hour12: false }));

export function iniciarVistaAdmin({ servicio, principal, pinPropio, puente = {} }) {
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
    const pinForm = $('adm-pin-form');

    const api = (metodo, ruta, cuerpo) => servicio.comercial(metodo, ruta, cuerpo);
    const fallo = (e) => notificar(String(e?.message ?? e).slice(0, 180), 'error');
    const datos = { modelos: [], unidades: [], clientes: [] };
    const nombreCliente = (c) => `${c.nombre} ${c.apellidos ?? ''}`.trim();
    const nombreUnidad = (u) => `${u.nombre}${u.modelo_comercial ? ` · ${u.modelo_comercial}` : ''}`;
    const lista_ = (r) => (Array.isArray(r) ? r : (r?.items ?? []));
    const texto = (id) => $(id).value.trim();
    const opcional = (id) => texto(id) || null;

    // Hace el cambio, vuelve a cargar los datos y avisa con un toast. Devuelve true si salió bien.
    const accion = async (trabajo, exito, despues = () => recargarComercial()) => {
        try {
            await trabajo();
            await despues();
            notificar(exito, 'ok');
            return true;
        } catch (e) { fallo(e); return false; }
    };

    // ---------- Indicadores ----------
    const pintarDashboard = (d) => {
        if (!d) return;
        for (const [id, k] of Object.entries({
            'adm-m-modelos': 'modelos', 'adm-m-unidades': 'unidades',
            'adm-m-vendidas': 'vendidas_asignadas', 'adm-m-prueba': 'disponibles_prueba',
            'adm-m-clientes': 'clientes', 'adm-m-demos': 'demos', 'adm-m-conectadas': 'conectadas',
        })) $(id).textContent = String(d[k]);

        // Barra de distribución de las unidades activas
        const total = Math.max(0, Number(d.unidades) || 0);
        const vendidas = Math.min(Number(d.vendidas_asignadas) || 0, total);
        const prueba = Math.min(Number(d.disponibles_prueba) || 0, total - vendidas);
        const cifras = { vendidas, prueba, resto: total - vendidas - prueba };
        const nombres = { vendidas: 'Vendidas / asignadas', prueba: 'Para prueba', resto: 'Otras' };
        for (const [seg, n] of Object.entries(cifras)) {
            $('adm-barra-inv').querySelector(`[data-seg="${seg}"]`).style.width = total ? `${(n / total) * 100}%` : '0%';
            document.querySelector(`.ax-leyenda [data-seg="${seg}"]`).textContent = `${nombres[seg]} · ${n}`;
        }
        $('adm-barra-inv').setAttribute('aria-label', `Unidades activas: ${cifras.vendidas} vendidas, ${cifras.prueba} para prueba, ${cifras.resto} otras`);
    };
    est.on('comercial', pintarDashboard);

    // ---------- Selectores alimentados por consultas (se muestra el nombre, no el ID) ----------
    const pintarSelectores = () => {
        const modelos = datos.modelos.filter((m) => m.activo);
        const unidades = datos.unidades.filter((u) => u.activo);
        const modeloOpt = (m) => m.nombre;
        llenarSelect($('adm-unidad-modelo'), modelos, (m) => m.id_modelo, modeloOpt, 'Sin modelos activos');
        llenarSelect($('adm-catalogo-modelo'), modelos, (m) => m.id_modelo, modeloOpt, 'Sin modelos activos');
        llenarSelect($('adm-comandos-unidad'), unidades, (u) => u.id_vehiculo, nombreUnidad, 'Sin unidades activas');
        llenarSelect($('adm-demo-unidad'), unidades, (u) => u.id_vehiculo, nombreUnidad, 'Sin unidades activas');
        llenarSelect($('adm-asignacion-unidad'), unidades.filter((u) => u.estado_comercial !== 'INACTIVO'),
            (u) => u.id_vehiculo, (u) => `${nombreUnidad(u)}${u.propietario ? ` (de ${u.propietario})` : ''}`, 'Sin unidades activas');
        llenarSelect($('adm-asignacion-cliente'), datos.clientes.filter((c) => c.activo),
            (c) => c.id_usuario, (c) => `${nombreCliente(c)} · ${c.correo}`, 'Sin clientes activos');
        llenarSelect($('adm-pin-vehiculo'), unidades.filter((u) => u.estado_comercial === 'EXHIBICION'),
            (u) => u.id_vehiculo, nombreUnidad, 'Sin unidades de exhibición');
    };

    // ---------- Modo del formulario (nuevo / editando) ----------
    const modo = (id, editando, etiqueta) => {
        const b = $(`adm-${id}-modo`);
        b.textContent = editando ? `Editando ${etiqueta}` : `Nuevo ${etiqueta}`;
        b.dataset.editando = String(editando);
        $(`adm-${id}-cancelar`).hidden = !editando;
    };
    const llevarAlFormulario = (id) => {
        const f = $(id);
        f.scrollIntoView({ behavior: 'smooth', block: 'center' });
        f.querySelector('input:not([type="hidden"]):not(:disabled)')?.focus({ preventScroll: true });
    };

    // ---------- Modelos ----------
    const reiniciarModelo = () => { $('adm-modelo-form').reset(); $('adm-modelo-id').value = ''; modo('modelo', false, 'modelo'); };
    const cambiarModelo = (m, activo) => accion(() => api('PUT', `/admin/modelos/${m.id_modelo}`, {
        nombre: m.nombre, descripcion: m.descripcion ?? null, fabricante: m.fabricante ?? null,
        microcontrolador: m.microcontrolador ?? null, imagen_url: m.imagen_url ?? null, activo,
    }), `Modelo «${m.nombre}» ${activo ? 'activado' : 'desactivado'}.`);
    const pintarModelos = () => {
        $('adm-badge-modelos').textContent = String(datos.modelos.length);
        $('adm-modelos-lista').replaceChildren(...(datos.modelos.length ? datos.modelos.map((m) => crearFila({
            icono: 'bi-box-seam', titulo: m.nombre, meta: [m.fabricante, m.microcontrolador], inactiva: !m.activo,
            toggle: { activo: m.activo, alCambiar: (v) => cambiarModelo(m, v) },
            acciones: [{ icono: 'bi-pencil-square', etiqueta: `Editar el modelo ${m.nombre}`, alClick: () => {
                $('adm-modelo-id').value = m.id_modelo; $('adm-modelo-nombre').value = m.nombre;
                $('adm-modelo-descripcion').value = m.descripcion ?? ''; $('adm-modelo-fabricante').value = m.fabricante ?? '';
                $('adm-modelo-micro').value = m.microcontrolador ?? '';
                modo('modelo', true, 'modelo'); llevarAlFormulario('adm-modelo-form');
            } }],
        })) : [vacio('Aún no hay modelos registrados.', 'bi-box-seam')]));
    };
    $('adm-modelo-cancelar').addEventListener('click', reiniciarModelo);
    $('adm-modelo-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('adm-modelo-id').value;
        const previo = id ? datos.modelos.find((m) => String(m.id_modelo) === id) : null;
        const cuerpo = { nombre: texto('adm-modelo-nombre'), descripcion: opcional('adm-modelo-descripcion'),
            fabricante: opcional('adm-modelo-fabricante'), microcontrolador: opcional('adm-modelo-micro'),
            imagen_url: previo?.imagen_url ?? null };
        if (id) cuerpo.activo = previo?.activo ?? true;
        const ok = await accion(() => api(id ? 'PUT' : 'POST', id ? `/admin/modelos/${id}` : '/admin/modelos', cuerpo),
            `Modelo «${cuerpo.nombre}» ${id ? 'actualizado' : 'creado'}.`);
        if (ok) reiniciarModelo();
    });

    // ---------- Unidades ----------
    const estadoUnidad = $('adm-unidad-estado');
    estadoUnidad.replaceChildren(...[['DISPONIBLE', 'Disponible'], ['EXHIBICION', 'Exhibición'], ['VENDIDO', 'Vendido']].map(([v, t]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = t; o.hidden = v === 'VENDIDO'; return o;
    }));
    const reiniciarUnidad = () => {
        $('adm-unidad-form').reset(); $('adm-unidad-id').value = '';
        $('adm-unidad-modelo').disabled = false; estadoUnidad.disabled = false; estadoUnidad.value = 'DISPONIBLE';
        modo('unidad', false, 'unidad');
    };
    const cambiarUnidad = (u, activo) => accion(() => (activo
        ? api('PUT', `/admin/unidades/${u.id_vehiculo}`, { nombre: u.nombre, numero_serie: u.numero_serie, descripcion: u.descripcion ?? null,
            estado_comercial: u.estado_comercial === 'INACTIVO' ? 'DISPONIBLE' : u.estado_comercial, activo: true })
        : api('DELETE', `/admin/unidades/${u.id_vehiculo}`)),
    `Unidad «${u.nombre}» ${activo ? 'activada' : 'desactivada'}.`);
    const TONO_ESTADO = { DISPONIBLE: 'azul', EXHIBICION: 'morado', VENDIDO: 'verde', INACTIVO: 'gris' };
    const pintarUnidades = () => {
        $('adm-badge-unidades').textContent = String(datos.unidades.length);
        $('adm-unidades-lista').replaceChildren(...(datos.unidades.length ? datos.unidades.map((u) => crearFila({
            icono: 'bi-truck', titulo: u.nombre, meta: [u.modelo_comercial, `Serie ${u.numero_serie}`, u.propietario && `Dueño: ${u.propietario}`],
            etiquetas: [[u.estado_comercial, TONO_ESTADO[u.estado_comercial] ?? 'gris'], ...(u.conectado ? [['Reportada conectada', 'verde']] : [])],
            inactiva: !u.activo,
            toggle: { activo: u.activo, alCambiar: (v) => cambiarUnidad(u, v) },
            acciones: [{ icono: 'bi-pencil-square', etiqueta: `Editar la unidad ${u.nombre}`, alClick: () => {
                const sel = $('adm-unidad-modelo');
                if (![...sel.options].some((o) => o.value === String(u.id_modelo))) {
                    const o = document.createElement('option'); o.value = String(u.id_modelo); o.textContent = u.modelo_comercial ?? 'Modelo'; sel.append(o);
                }
                $('adm-unidad-id').value = u.id_vehiculo; sel.value = String(u.id_modelo); sel.disabled = true;
                $('adm-unidad-nombre').value = u.nombre; $('adm-unidad-serie').value = u.numero_serie;
                $('adm-unidad-descripcion').value = u.descripcion ?? '';
                estadoUnidad.value = u.estado_comercial === 'INACTIVO' ? 'DISPONIBLE' : u.estado_comercial;
                estadoUnidad.disabled = u.id_propietario != null; // una unidad asignada conserva VENDIDO
                modo('unidad', true, 'unidad'); llevarAlFormulario('adm-unidad-form');
            } }],
        })) : [vacio('Aún no hay unidades registradas.', 'bi-truck')]));
    };
    $('adm-unidad-cancelar').addEventListener('click', reiniciarUnidad);
    $('adm-unidad-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('adm-unidad-id').value;
        const previo = id ? datos.unidades.find((u) => String(u.id_vehiculo) === id) : null;
        if (!id && !$('adm-unidad-modelo').value) return notificar('Elige un modelo comercial activo.', 'warn');
        const base = { nombre: texto('adm-unidad-nombre'), numero_serie: texto('adm-unidad-serie'),
            descripcion: opcional('adm-unidad-descripcion'), estado_comercial: estadoUnidad.value };
        const cuerpo = id ? { ...base, activo: previo?.activo ?? true } : { ...base, id_modelo: Number($('adm-unidad-modelo').value) };
        const ok = await accion(() => api(id ? 'PUT' : 'POST', id ? `/admin/unidades/${id}` : '/admin/unidades', cuerpo),
            `Unidad «${base.nombre}» ${id ? 'actualizada' : 'creada'}.`);
        if (ok) reiniciarUnidad();
    });

    // ---------- Clientes ----------
    const reiniciarCliente = () => {
        $('adm-cliente-form').reset(); $('adm-cliente-id').value = ''; $('adm-cliente-pass-grupo').hidden = false;
        modo('cliente', false, 'cliente');
    };
    const cuerpoCliente = (c, activo) => ({ nombre: c.nombre, apellidos: c.apellidos ?? null, correo: c.correo, telefono: c.telefono ?? null, activo });
    const pintarClientes = () => {
        $('adm-badge-clientes').textContent = String(datos.clientes.length);
        $('adm-clientes-lista').replaceChildren(...(datos.clientes.length ? datos.clientes.map((c) => crearFila({
            icono: 'bi-person-circle', titulo: nombreCliente(c), meta: [c.correo, c.telefono], inactiva: !c.activo,
            toggle: { activo: c.activo, alCambiar: (v) => accion(() => api('PUT', `/admin/clientes/${c.id_usuario}`, cuerpoCliente(c, v)),
                `Cliente «${nombreCliente(c)}» ${v ? 'activado' : 'desactivado'}.`) },
            acciones: [{ icono: 'bi-pencil-square', etiqueta: `Editar al cliente ${nombreCliente(c)}`, alClick: () => {
                $('adm-cliente-id').value = c.id_usuario; $('adm-cliente-nombre').value = c.nombre;
                $('adm-cliente-apellidos').value = c.apellidos ?? ''; $('adm-cliente-correo').value = c.correo;
                $('adm-cliente-telefono').value = c.telefono ?? ''; $('adm-cliente-password').value = '';
                $('adm-cliente-pass-grupo').hidden = true;
                modo('cliente', true, 'cliente'); llevarAlFormulario('adm-cliente-form');
            } }],
        })) : [vacio('Aún no hay clientes registrados.', 'bi-people')]));
    };
    $('adm-cliente-cancelar').addEventListener('click', reiniciarCliente);
    $('adm-cliente-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const id = $('adm-cliente-id').value;
        const pass = $('adm-cliente-password').value;
        if (!id && pass.length < 10) return notificar('La contraseña inicial requiere al menos 10 caracteres.', 'warn');
        const previo = id ? datos.clientes.find((c) => String(c.id_usuario) === id) : null;
        const base = { nombre: texto('adm-cliente-nombre'), apellidos: opcional('adm-cliente-apellidos'),
            correo: texto('adm-cliente-correo'), telefono: opcional('adm-cliente-telefono') };
        const ok = await accion(() => (id
            ? api('PUT', `/admin/clientes/${id}`, { ...base, activo: previo?.activo ?? true })
            : api('POST', '/admin/clientes', { ...base, contrasena: pass })),
        `Cliente «${base.nombre}» ${id ? 'actualizado' : 'creado'}.`);
        if (ok) reiniciarCliente();
    });

    // ---------- Asignación ----------
    $('adm-asignacion-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const unidad = Number($('adm-asignacion-unidad').value);
        const cliente = Number($('adm-asignacion-cliente').value);
        if (!unidad || !cliente) return notificar('Elige una unidad y un cliente.', 'warn');
        const u = datos.unidades.find((x) => x.id_vehiculo === unidad);
        const c = datos.clientes.find((x) => x.id_usuario === cliente);
        const ok = await accion(() => api('POST', `/admin/unidades/${unidad}/asignaciones`, { id_usuario: cliente, observaciones: opcional('adm-asignacion-nota') }),
            `Unidad «${u?.nombre ?? unidad}» asignada a ${c ? nombreCliente(c) : cliente}.`);
        if (ok) $('adm-asignacion-nota').value = '';
    });

    // ---------- Movimientos por modelo y por unidad (interruptores) ----------
    let pasosAdminDemo = [];
    let comandosAdminDemo = [];
    const vacioLista = (ul, t) => ul.replaceChildren(vacio(t, 'bi-toggles'));
    const refrescarGestor = () => Promise.all([pintarComandosModelo(), pintarComandosUnidad(), pintarComandosDemo()]);

    const pintarComandosModelo = async () => {
        const idModelo = Number($('adm-catalogo-modelo').value);
        const ul = $('adm-catalogo-lista');
        if (!idModelo) return vacioLista(ul, 'Elige un modelo.');
        try {
            const comandos = await api('GET', `/admin/modelos/${idModelo}/comandos`);
            ul.replaceChildren(...(comandos.length ? comandos.map((c) => crearFila({
                icono: 'bi-arrows-move', titulo: c.nombre, meta: [`Código ${c.codigo}`], inactiva: !c.habilitado,
                toggle: { activo: c.habilitado, etiquetas: ['Habilitado', 'Deshabilitado'], alCambiar: (v) => accion(
                    () => api('PUT', `/admin/modelos/${idModelo}/comandos/${c.id_catalogo_comando}`, { habilitado: v }),
                    `Movimiento «${c.nombre}» ${v ? 'habilitado' : 'deshabilitado'} para el modelo y sus unidades.`, refrescarGestor) },
            })) : [vacio('Este modelo aún no tiene movimientos.', 'bi-toggles')]));
        } catch (e) { fallo(e); }
    };
    const pintarComandosUnidad = async () => {
        const idUnidad = Number($('adm-comandos-unidad').value);
        const ul = $('adm-comandos-unidad-lista');
        if (!idUnidad) return vacioLista(ul, 'Elige una unidad.');
        try {
            const comandos = await api('GET', `/vehiculos/${idUnidad}/comandos`);
            ul.replaceChildren(...(comandos.length ? comandos.map((c) => crearFila({
                icono: 'bi-arrows-move', titulo: c.nombre, meta: [`Código ${c.codigo}`], inactiva: !c.activo,
                toggle: { activo: c.activo, alCambiar: (v) => accion(
                    () => api('PUT', `/admin/unidades/${idUnidad}/comandos/${c.id_comando}`, { activo: v }),
                    `Movimiento «${c.nombre}» ${v ? 'activado' : 'desactivado'} en la unidad.`, refrescarGestor) },
            })) : [vacio('La unidad no tiene movimientos.', 'bi-toggles')]));
        } catch (e) { fallo(e); }
    };
    const pintarComandosDemo = async () => {
        const idUnidad = Number($('adm-demo-unidad').value);
        comandosAdminDemo = [];
        if (!idUnidad) { llenarSelect($('adm-demo-comando'), [], () => '', () => '', 'Elige una unidad'); return; }
        try {
            comandosAdminDemo = (await api('GET', `/vehiculos/${idUnidad}/comandos`)).filter((c) => c.activo);
            llenarSelect($('adm-demo-comando'), comandosAdminDemo, (c) => c.id_comando, (c) => c.nombre, 'Sin movimientos activos');
        } catch (e) { fallo(e); }
    };
    $('adm-catalogo-modelo').addEventListener('change', () => void pintarComandosModelo());
    $('adm-comandos-unidad').addEventListener('change', () => void pintarComandosUnidad());
    $('adm-demo-unidad').addEventListener('change', () => void pintarComandosDemo());
    $('adm-catalogo-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const idModelo = Number($('adm-catalogo-modelo').value);
        if (!idModelo) return notificar('Selecciona un modelo activo.', 'warn');
        const f = ev.currentTarget;
        const nombre = texto('adm-catalogo-nombre');
        const ok = await accion(() => api('POST', `/admin/modelos/${idModelo}/comandos`, {
            nombre, codigo: Number($('adm-catalogo-codigo').value), descripcion: opcional('adm-catalogo-descripcion') }),
        `Movimiento «${nombre}» agregado al modelo y sincronizado con sus unidades.`, refrescarGestor);
        if (ok) f.reset();
    });

    // ---------- Demos de empresa ----------
    const repintarPasosDemo = () => {
        pintarPasos($('adm-demo-pasos'), pasosAdminDemo,
            (p) => comandosAdminDemo.find((c) => c.id_comando === p.id_comando)?.nombre ?? `Movimiento ${p.id_comando}`, repintarPasosDemo);
        const total = pasosAdminDemo.reduce((n, p) => n + p.duracion_ms + p.pausa_ms, 0);
        $('adm-demo-total').textContent = `Duración total: ${(total / 1000).toFixed(1)} s · máximo 300 s`;
    };
    repintarPasosDemo();
    $('adm-demo-agregar-paso').addEventListener('click', () => {
        const id_comando = Number($('adm-demo-comando').value);
        const duracion_ms = Number($('adm-demo-duracion').value);
        const pausa_ms = Number($('adm-demo-pausa').value);
        if (!id_comando || !Number.isInteger(duracion_ms) || duracion_ms < 1 || duracion_ms > 60000
            || !Number.isInteger(pausa_ms) || pausa_ms < 0 || pausa_ms > 60000) {
            return notificar('Selecciona un movimiento activo y revisa duración y pausa.', 'warn');
        }
        if (pasosAdminDemo.length >= 50) return notificar('La demo admite hasta 50 pasos.', 'warn');
        const total = pasosAdminDemo.reduce((n, p) => n + p.duracion_ms + p.pausa_ms, 0) + duracion_ms + pausa_ms;
        if (total > 300000) return notificar('La demo no puede superar cinco minutos.', 'warn');
        pasosAdminDemo.push({ id_comando, duracion_ms, pausa_ms });
        repintarPasosDemo();
    });
    $('adm-demo-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const idUnidad = Number($('adm-demo-unidad').value);
        if (!idUnidad) return notificar('Selecciona una unidad activa.', 'warn');
        if (!pasosAdminDemo.length) return notificar('Agrega por lo menos un movimiento a la demo.', 'warn');
        const f = ev.currentTarget;
        try {
            const demo = await api('POST', `/admin/unidades/${idUnidad}/demos`, {
                nombre: texto('adm-demo-nombre'), descripcion: opcional('adm-demo-descripcion'), pasos: pasosAdminDemo });
            f.reset(); pasosAdminDemo = []; repintarPasosDemo(); await pintarComandosDemo();
            notificar(`Demo «${demo.nombre}» creada con ${demo.pasos.length} movimientos.`, 'ok');
            try { await servicio.cargarDashboard(); } catch { /* métricas sin actualizar */ }
        } catch (e) { fallo(e); }
    });

    // ---------- Carga general ----------
    const recargarComercial = async () => {
        try {
            const [modelos, unidades, clientes] = await Promise.all([
                api('GET', '/admin/modelos?incluir_inactivos=true'), api('GET', '/admin/unidades'),
                api('GET', '/admin/clientes?pagina=1&limite=100'),
            ]);
            datos.modelos = lista_(modelos); datos.unidades = lista_(unidades); datos.clientes = lista_(clientes);
        } catch (e) { fallo(e); return; }
        pintarModelos(); pintarUnidades(); pintarClientes(); pintarSelectores();
        await refrescarGestor();
        try { await servicio.cargarDashboard(); } catch { /* las métricas se conservan */ }
    };
    est.on('autenticado', (autenticado) => {
        if (!autenticado) { est.set('comercial', null); return; }
        void recargarComercial();
    });
    if (est.get('autenticado')) void recargarComercial();

    // ---------- PIN de exhibición: se pueden generar tantos como hagan falta ----------
    let firmaPines = '';
    const cargarPines = async (forzar = false) => {
        if (!est.get('autenticado')) return;
        try {
            const pines = await api('GET', '/admin/pines');
            const firma = JSON.stringify(pines.map((p) => [p.id_sesion, p.pin]));
            $('adm-badge-pines').textContent = String(pines.length);
            if (!forzar && firma === firmaPines) return; // sin cambios: no se repinta (el tiempo corre solo)
            firmaPines = firma;
            pintarPines($('adm-pines-lista'), pines, {
                alCopiar: async (pin) => notificar(await copiarTexto(pin) ? `PIN ${pin} copiado.` : 'No se pudo copiar el PIN.', 'info'),
                alEliminar: async (p) => {
                    try {
                        await api('DELETE', `/admin/pines/${p.id_sesion}`);
                        await cargarPines(true);
                        notificar(`PIN de ${p.identificador_invitado || 'Invitado'} eliminado.`, 'ok');
                    } catch (e) { fallo(e); await cargarPines(true); }
                },
            });
        } catch { /* el siguiente ciclo vuelve a intentar */ }
    };
    est.on('autenticado', (a) => { if (a) void cargarPines(true); else firmaPines = ''; });
    if (est.get('autenticado')) void cargarPines(true);
    setInterval(() => { if (document.visibilityState === 'visible') void cargarPines(); }, 5000);

    pinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idVehiculo = Number($('adm-pin-vehiculo').value);
        if (!Number.isInteger(idVehiculo) || idVehiculo < 1) { notificar('Elige una unidad de exhibición.', 'warn'); return; }
        const minutos = Number($('adm-pin-duracion').value);
        if (!Number.isInteger(minutos) || minutos < 1 || minutos > 60) { notificar('La duración de la sesión debe ser de 1 a 60 minutos.', 'warn'); return; }
        const boton = $('adm-pin-generar');
        boton.disabled = true;
        try {
            const r = await servicio.generarPin(idVehiculo, texto('adm-pin-invitado') || 'Invitado', minutos);
            if (r) await cargarPines(true);
        } finally {
            boton.disabled = false;
        }
    });

    // Botones que piden una segunda pulsación para confirmar: clave → instante de vencimiento.
    const confirmaciones = new Map();

    // ---------- Inicio de sesión ----------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;

        if (!usuario.value.trim() || !clave.value) {
            error.textContent = 'Escribe tu usuario o correo y la contraseña.';
            error.hidden = false;
            return;
        }

        entrar.disabled = true;
        try {
            const identificador = usuario.value.trim();
            // Un correo es una cuenta de cliente (dueño de carrito); cualquier otro texto es el usuario admin.
            if (identificador.includes('@')) {
                if (!puente.entrarPropietario) throw new Error('El acceso de propietario no está disponible.');
                await puente.entrarPropietario(identificador, clave.value);
            } else {
                await servicio.login(identificador, clave.value);
            }
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
        const propietario = principal.get('rol') === 'propietario';
        login.hidden = a || propietario;
        panel.hidden = !a;
        $('adm-usuario-et').textContent = a ? `Conectado como ${est.get('usuario')}` : '';
        if (!a) {
            confirmaciones.clear();
            if (principal.get('vista') === 'admin') usuario.focus({ preventScroll: true });
        }
    });
    principal.on('rol', (rol) => {
        const autenticado = est.get('autenticado');
        const propietario = rol === 'propietario';
        login.hidden = autenticado || propietario;
        if (propietario) panel.hidden = true;
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
        pintarLineaTiempo($('adm-bitacora'), datos.bitacora.slice(0, 40).map((b) => ({
            fecha: b.fecha, tipo: b.tipo, pin: b.pin, texto: b.texto })), 'Sin actividad registrada.');
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
    login.hidden = est.get('autenticado') || principal.get('rol') === 'propietario';
    panel.hidden = !est.get('autenticado');
    $('adm-usuario-et').textContent = est.get('autenticado') ? `Conectado como ${est.get('usuario')}` : '';
    pintarWs(est.get('ws'));
}
