// Consola de propietario: mantiene todas las operaciones limitadas a sus vehículos.
import { el, icono, crearFila, pintarPasos as pintarListaPasos, vacio, pintarPines, copiarTexto, pintarLineaTiempo } from './componentesAdmin.js';
import { crearTarjetaSesion, crearConfirmador, normalizarSesion, duracion } from './tarjetaSesion.js';
import { notificar } from './notificaciones.js';

const CLAVE_SESION_PROPIETARIO = 'control.propietario.sesion';

function leerSesionGuardada() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION_PROPIETARIO) ?? 'null'); }
  catch { return null; }
}

function guardarSesion(token, vence) {
  try { sessionStorage.setItem(CLAVE_SESION_PROPIETARIO, JSON.stringify({ token, vence })); }
  catch { /* el inicio de sesión sigue disponible si el navegador bloquea el almacenamiento */ }
}

function borrarSesionGuardada() {
  try { sessionStorage.removeItem(CLAVE_SESION_PROPIETARIO); } catch { /* nothing to clear */ }
}

export function iniciarVistaPropietario({ http, principal, alToken, alUsarCarrito, puente }) {
  const $ = (id) => document.getElementById(id);
  const loginAdmin = $('admin-login');
  const panel = $('prop-panel');
  const selector = $('prop-vehiculo');
  let token = '';
  let usuario = null;
  let carritos = [];
  let comandos = [];
  let pasos = [];
  let demos = [];

  const request = (metodo, ruta, cuerpo, query) => http.solicitar(metodo, ruta, {
    autorizacion: token,
    cuerpo,
    query,
  });
  const idCarrito = () => Number(selector.value) || 0;
  const mensaje = (texto, error = false) => notificar(texto, error ? 'error' : 'ok');

  async function cargarCarritos() {
    carritos = await request('GET', '/me/vehiculos');
    selector.replaceChildren();
    for (const v of carritos) {
      const option = document.createElement('option');
      option.value = String(v.id_vehiculo);
      option.textContent = `${v.nombre} · ${v.estado_comercial}`;
      selector.append(option);
    }
    const unidadActual = String(principal.get('vehiculoId') ?? '');
    if (carritos.some((v) => String(v.id_vehiculo) === unidadActual)) selector.value = unidadActual;
    const propios = carritos.map((v) => ({ id: v.id_vehiculo, nombre: v.nombre, activo: v.activo }));
    principal.set('vehiculos', propios);
    if (!carritos.length) {
      notificar('Esta cuenta aún no tiene carritos asignados. Contacta al administrador general.', 'warn');
      $('prop-pin-form').hidden = true;
      $('prop-demo-form').hidden = true;
      return;
    }
    $('prop-pin-form').hidden = false;
    $('prop-demo-form').hidden = false;
    await cargarDatosCarrito();
  }

  let firmaPines = '';
  async function cargarPines(forzar = false) {
    if (!idCarrito() || panel.hidden) return;
    try {
      const pines = await request('GET', `/me/vehiculos/${idCarrito()}/pines`);
      const firma = JSON.stringify([idCarrito(), pines.map((p) => [p.id_sesion, p.pin])]);
      if (!forzar && firma === firmaPines) return;
      firmaPines = firma;
      pintarPines($('prop-pines'), pines, {
        alCopiar: async (pin) => notificar(await copiarTexto(pin) ? `PIN ${pin} copiado.` : 'No se pudo copiar el PIN.', 'info'),
        alEliminar: async (p) => {
          try {
            await request('DELETE', `/me/vehiculos/${idCarrito()}/pines/${p.id_sesion}`);
            await cargarPines(true);
            mensaje(`PIN de ${p.identificador_invitado || 'Invitado'} eliminado.`);
          } catch (e) { mensaje(e.message, true); await cargarPines(true); }
        },
      });
    } catch { /* el siguiente ciclo vuelve a intentar */ }
  }
  setInterval(() => { if (document.visibilityState === 'visible') void cargarPines(); }, 5000);

  // ---------- Sesiones activas (mismo diseño que Administración) ----------
  const confirmador = crearConfirmador();
  const listaSes = $('prop-lista');
  const buscarSes = $('prop-buscar');
  const filtroSes = $('prop-filtro');
  const autoSes = $('prop-auto');
  let sesiones = [];
  let firmaSesiones = '';
  let recibidoEn = Date.now();

  function pintarSesiones() {
    const activo = document.activeElement?.closest?.('#prop-lista button[data-accion]');
    const foco = activo ? { pin: activo.dataset.pin, accion: activo.dataset.accion } : null;
    const q = buscarSes.value;
    const f = filtroSes.value;
    const visibles = sesiones.filter((s) => (!q || s.pin.includes(q))
      && (f === 'todas' || (f === 'pendientes' && !s.autorizada) || (f === 'autorizadas' && s.autorizada)));
    if (!visibles.length) {
      const vacioLi = el('li', 'adm-vacio');
      vacioLi.append(icono(sesiones.length ? 'bi-search' : 'bi-people'),
        el('span', '', sesiones.length ? 'Ninguna sesión coincide con el filtro.' : 'No hay sesiones activas en este momento.'));
      listaSes.replaceChildren(vacioLi);
    } else {
      listaSes.replaceChildren(...visibles.map((s) => crearTarjetaSesion(s, { confirmador })));
    }
    if (foco) listaSes.querySelector(`button[data-pin="${foco.pin}"][data-accion="${foco.accion}"]`)?.focus({ preventScroll: true });
  }

  async function cargarSesiones(forzar = false) {
    if (!idCarrito() || panel.hidden) return;
    const estado = await request('GET', `/me/vehiculos/${idCarrito()}/sesiones`);
    sesiones = (estado.sesiones ?? []).map(normalizarSesion);
    recibidoEn = Date.now();

    const r = estado.resumen ?? { total: sesiones.length, conectadas: 0, autorizadas: 0, pendientes: 0 };
    $('prop-n-total').textContent = r.total;
    $('prop-n-conectadas').textContent = r.conectadas;
    $('prop-n-autorizadas').textContent = r.autorizadas;
    $('prop-n-pendientes').textContent = r.pendientes;
    if (typeof estado.auto_autorizar === 'boolean' && document.activeElement !== autoSes) autoSes.checked = estado.auto_autorizar;

    const firma = JSON.stringify([idCarrito(), sesiones.map((s) => [s.pin, s.autorizada, s.conectada, s.cierreEnS !== null, s.comandos, s.ultimoComando])]);
    if (forzar || firma !== firmaSesiones) { firmaSesiones = firma; pintarSesiones(); }
    // Sin repintar: se actualizan las bases de los contadores que avanzan solos.
    for (const li of listaSes.querySelectorAll('.adm-sesion')) {
      const s = sesiones.find((x) => x.pin === li.dataset.pin);
      if (!s) continue;
      const e = li.querySelector('[data-edad]'); if (e) e.dataset.edad = String(s.edadS);
      const cierre = li.querySelector('[data-cierre]'); if (cierre && s.cierreEnS !== null) cierre.dataset.cierre = String(s.cierreEnS);
    }

    pintarLineaTiempo($('prop-bitacora'), (estado.bitacora ?? []).slice(0, 60).map((b) => ({
      fecha: new Date(b.timestamp), tipo: b.tipo, texto: b.texto, invitado: b.identificador_invitado })), 'Sin eventos registrados.');
  }

  // Los contadores de edad y de cierre avanzan cada segundo sin consultar a la API.
  setInterval(() => {
    const seg = (Date.now() - recibidoEn) / 1000;
    for (const e of listaSes.querySelectorAll('[data-edad]')) e.textContent = duracion(Number(e.dataset.edad) + seg);
    for (const e of listaSes.querySelectorAll('[data-cierre]')) {
      e.textContent = `Sin conexión · se cierra en ${Math.max(0, Math.round(Number(e.dataset.cierre) - seg))} s`;
    }
  }, 1000);
  setInterval(() => { if (document.visibilityState === 'visible') cargarSesiones().catch(() => {}); }, 3000);

  async function accionSesiones(ruta, cuerpo, exito) {
    if (!idCarrito()) { notificar('Selecciona primero un carrito.', 'warn'); return; }
    try {
      await request('POST', `/me/vehiculos/${idCarrito()}${ruta}`, cuerpo);
      await cargarSesiones(true);
      mensaje(exito);
    } catch (e) { mensaje(e.message, true); }
  }

  listaSes.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const { pin, accion } = boton.dataset;
    if (accion === 'permiso') {
      const autorizar = boton.dataset.autorizar === 'true';
      accionSesiones(`/sesiones/${pin}/permiso`, { autorizada: autorizar },
        autorizar ? `Sesión ${pin} autorizada.` : `Permiso de la sesión ${pin} revocado.`);
    } else if (accion === 'cerrar') {
      confirmador.confirmar(boton, `cerrar:${pin}`, () => accionSesiones(`/sesiones/${pin}/cerrar`, undefined, `Sesión ${pin} cerrada.`));
    }
  });
  buscarSes.addEventListener('input', () => {
    buscarSes.value = buscarSes.value.replace(/\D/g, '').slice(0, 5);
    pintarSesiones();
  });
  filtroSes.addEventListener('change', pintarSesiones);

  // ---------- Acciones generales del carrito ----------
  autoSes.addEventListener('change', async () => {
    const valor = autoSes.checked;
    if (!idCarrito()) { autoSes.checked = !valor; notificar('Selecciona primero un carrito.', 'warn'); return; }
    try {
      await request('POST', `/me/vehiculos/${idCarrito()}/sesiones/configuracion`, { auto_autorizar: valor });
      mensaje(valor ? 'Las sesiones nuevas de este carrito se autorizarán solas.' : 'Las sesiones nuevas esperarán tu permiso.');
    } catch (e) { autoSes.checked = !valor; mensaje(e.message, true); }
  });
  $('prop-todas-si').addEventListener('click', () => accionSesiones('/sesiones/permiso-todas', { autorizada: true }, 'Todas las sesiones fueron autorizadas.'));
  $('prop-todas-no').addEventListener('click', (e) => confirmador.confirmar(e.currentTarget, 'todas-no',
    () => accionSesiones('/sesiones/permiso-todas', { autorizada: false }, 'Se revocó el permiso de todas las sesiones.')));
  $('prop-detener').addEventListener('click', (e) => confirmador.confirmar(e.currentTarget, 'detener',
    () => accionSesiones('/detener', undefined, 'Parada de emergencia enviada al carrito.')));

  function pintarPasos() {
    pintarListaPasos($('prop-pasos'), pasos, (p) => comandos.find((c) => c.id_comando === p.id_comando)?.nombre ?? `Comando ${p.id_comando}`, pintarPasos);
    const ms = pasos.reduce((n, p) => n + p.duracion_ms + p.pausa_ms, 0);
    $('prop-demo-total').textContent = `Duración total: ${(ms / 1000).toFixed(1)} s · máximo 300 s`;
  }

  async function cargarDemos() {
    demos = await request('GET', '/me/demos', undefined, { id_vehiculo: idCarrito() });
    $('prop-demos').replaceChildren(...(demos.length ? demos.map((d) => crearFila({
      icono: 'bi-collection-play', titulo: d.nombre, meta: [d.tipo === 'EMPRESA' ? 'De empresa' : 'Privada', `${d.pasos.length} pasos`],
      acciones: [
        { icono: 'bi-pencil-square', etiqueta: `Editar la demo ${d.nombre}`, alClick: () => {
          $('prop-demo-id').value = d.id_demo;
          $('prop-demo-nombre').value = d.nombre;
          $('prop-demo-descripcion').value = d.descripcion ?? '';
          pasos = d.pasos.map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms }));
          pintarPasos();
          // Abre el desplegable del editor (cierra los demás) y lleva la vista hasta el formulario.
          const editor = $('prop-demo-form').closest('details');
          if (editor) editor.open = true;
          requestAnimationFrame(() => {
            $('prop-demo-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
            $('prop-demo-nombre').focus({ preventScroll: true });
          });
        } },
        { icono: 'bi-joystick', etiqueta: `Usar ${d.nombre} en Control`, alClick: () => { alUsarCarrito(idCarrito()); window.location.hash = '#control'; } },
      ],
    })) : [vacio('Este carrito todavía no tiene demos.', 'bi-collection-play')]));
    pintarPasos();
  }

  async function cargarDatosCarrito() {
    if (!idCarrito()) return;
    try {
      comandos = await http.get(`/vehiculos/${idCarrito()}/comandos`);
      const select = $('prop-paso-comando'); select.replaceChildren();
      for (const c of comandos.filter((x) => x.activo && x.codigo !== 13)) {
        const option = document.createElement('option'); option.value = String(c.id_comando); option.textContent = c.nombre; select.append(option);
      }
      await Promise.all([cargarSesiones(), cargarDemos(), cargarPines(true)]);
    } catch (e) { mensaje(e.message, true); }
  }

  // Acceso unificado: vistaAdmin llama a esta función cuando el usuario escribe un correo.
  async function iniciarSesion(correo, contrasena) {
    const r = await http.solicitar('POST', '/auth/login', { cuerpo: { correo, contrasena } });
    token = r.token; usuario = r.usuario;
    guardarSesion(token, Date.now() + r.vence_en_s * 1000);
    alToken(token, usuario);
    $('prop-nombre').textContent = `${usuario.nombre} ${usuario.apellidos ?? ''} · Dueño de carrito`;
    loginAdmin.hidden = true; panel.hidden = false;
    await cargarCarritos();
    notificar(`Bienvenido, ${usuario.nombre}.`, 'ok');
  }
  if (puente) puente.entrarPropietario = iniciarSesion;

  $('prop-salir').addEventListener('click', async () => {
    try { if (token) await request('POST', '/auth/logout'); } catch { /* se borra el token local aunque la API haya cerrado la sesión */ }
    borrarSesionGuardada();
    token = ''; usuario = null; carritos = []; demos = []; pasos = []; alToken('', null);
    panel.hidden = true; loginAdmin.hidden = false;
  });

  selector.addEventListener('change', () => { void cargarDatosCarrito(); });
  $('prop-usar-carrito').addEventListener('click', () => {
    if (!idCarrito()) return;
    alUsarCarrito(idCarrito());
    mensaje('Carrito seleccionado para Control y Monitoreo.');
  });
  $('prop-pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const minutos = Number($('prop-duracion').value);
    if (!Number.isInteger(minutos) || minutos < 1 || minutos > 60) { notificar('La duración de la sesión debe ser de 1 a 60 minutos.', 'warn'); return; }
    try {
      const r = await request('POST', `/me/vehiculos/${idCarrito()}/pines`, {
        identificador_invitado: $('prop-invitado').value.trim() || 'Invitado',
        duracion_min: minutos,
      });
      await Promise.all([cargarPines(true), cargarSesiones()]);
      mensaje(`PIN ${r.pin} generado para ${$('prop-invitado').value.trim() || 'el invitado'}. Sesión de ${minutos} min; el PIN vence en ${Math.ceil(r.vigencia_s / 60)} min.`);
    } catch (error) { mensaje(error.message, true); }
  });
  $('prop-paso-agregar').addEventListener('click', () => {
    const id_comando = Number($('prop-paso-comando').value);
    const duracion_ms = Number($('prop-paso-duracion').value);
    const pausa_ms = Number($('prop-paso-pausa').value);
    if (!id_comando || !Number.isInteger(duracion_ms) || duracion_ms < 1 || duracion_ms > 60000 || !Number.isInteger(pausa_ms) || pausa_ms < 0 || pausa_ms > 60000) {
      return notificar('Revisa el comando, duración y pausa del paso.', 'warn');
    }
    if (pasos.reduce((n, p) => n + p.duracion_ms + p.pausa_ms, 0) + duracion_ms + pausa_ms > 300000) return notificar('La demo no puede superar cinco minutos.', 'warn');
    pasos.push({ id_comando, duracion_ms, pausa_ms }); pintarPasos();
  });
  $('prop-demo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pasos.length) return notificar('Agrega por lo menos un paso.', 'warn');
    const id = $('prop-demo-id').value;
    const body = { id_vehiculo: idCarrito(), nombre: $('prop-demo-nombre').value.trim(),
      descripcion: $('prop-demo-descripcion').value.trim() || null, pasos };
    try {
      await request(id ? 'PUT' : 'POST', id ? `/me/demos/${id}` : '/me/demos', body);
      $('prop-demo-form').reset(); $('prop-demo-id').value = ''; pasos = []; pintarPasos(); await cargarDemos(); mensaje('Demo guardada.');
    } catch (error) { mensaje(error.message, true); }
  });
  $('prop-demo-nueva').addEventListener('click', () => { $('prop-demo-form').reset(); $('prop-demo-id').value = ''; pasos = []; pintarPasos(); });
  $('prop-demo-baja').addEventListener('click', async () => {
    const id = $('prop-demo-id').value; if (!id) return notificar('Selecciona una demo con el botón de editar primero.', 'warn');
    try { await request('DELETE', `/me/demos/${id}`); $('prop-demo-nueva').click(); await cargarDemos(); mensaje('Demo inactivada.'); }
    catch (error) { mensaje(error.message, true); }
  });

  principal.on('rol', (rol) => {
    if (rol !== 'propietario') {
      panel.hidden = true;
    }
  });

  async function restaurarSesion() {
    const guardada = leerSesionGuardada();
    if (!guardada || typeof guardada.token !== 'string' || !guardada.token
        || !Number.isFinite(guardada.vence) || guardada.vence <= Date.now()) {
      borrarSesionGuardada();
      return;
    }
    token = guardada.token;
    try {
      usuario = await http.solicitar('GET', '/me', { autorizacion: token });
      guardarSesion(token, guardada.vence);
      alToken(token, usuario);
      $('prop-nombre').textContent = `${usuario.nombre} ${usuario.apellidos ?? ''} · Dueño de carrito`;
      loginAdmin.hidden = true; panel.hidden = false;
      await cargarCarritos();
    } catch {
      borrarSesionGuardada(); token = ''; usuario = null; alToken('', null);
      panel.hidden = true; loginAdmin.hidden = false;
    }
  }

  void restaurarSesion();
}
