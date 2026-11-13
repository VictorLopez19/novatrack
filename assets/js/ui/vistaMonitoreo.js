// Vista MONITOREO: pinta la tarjeta del último movimiento, la tabla de 10 filas y los avisos.
// Todo con textContent/createElement (sin innerHTML con datos remotos). La tabla se actualiza por diferencias.
import { formatearFecha, textoZona } from '../dominio/fechas.js';
import { formatoMovimiento } from '../core/utilidades.js';

const ORIGEN = {
  rest: ['bi-database-check', 'Estado guardado · REST', 'azul'],
  wss: ['bi-broadcast', 'En vivo · WSS', 'verde'],
  demo: ['bi-collection-play-fill', 'Paso de DEMO · no va al historial', 'naranja'],
  ia: ['bi-robot', 'Orden de IA · no va al historial', 'morado'],
};

const ACTIVIDAD = {
  demo_inicio: 'iniciada',
  demo_movimiento: 'en curso',
  demo_fin: 'finalizada',
  demo_cancelada: 'cancelada',
  demo_error: 'terminó con error',
};

export function iniciarVistaMonitoreo({ servicio, principal, limite = 10 }) {
  const $ = (id) => document.getElementById(id);
  const s = servicio.store;
  let claveCard = null;

  $('mon-zona').textContent = textoZona();

  // ---------- Nombre y avisos ----------
  const pintarNombre = () => {
    $('mon-veh-nombre').textContent = s.get('vehiculoNombre') || (principal.get('vehiculoId') ? `Vehículo #${principal.get('vehiculoId')}` : 'Sin vehículo');
  };

  const pintarAviso = () => {
    const ws = principal.get('ws');
    const avisos = [];

    if (ws === 'desconectado') avisos.push('WSS desconectado: no hay actualizaciones en vivo. Se resincronizará por REST al reconectar.');
    else if (ws !== 'en_linea') avisos.push('WSS conectando o reconectando: las actualizaciones en vivo están en pausa.');
    if (principal.get('api') === 'no_disponible') avisos.push('La API de AWS no responde: los datos pueden estar desactualizados.');

    $('mon-aviso').hidden = avisos.length === 0;
    $('mon-aviso').textContent = avisos.join(' ');
  };

  // ---------- Tarjeta del último movimiento ----------
  // Cada confirmación se muestra como etiqueta corta; la explicación completa queda en el title (y para lectores de pantalla).
  const traza = (id, estado, icono, texto, detalle) => {
    const li = $(id);
    li.dataset.estado = estado;
    li.title = detalle;
    li.setAttribute('aria-label', detalle);
    li.querySelector('i').className = `bi ${icono}`;
    li.querySelector('span').textContent = texto;
  };

  function pintarTrazas(d) {
    if (!d) {
      traza('traza-wss', 'na', 'bi-dash-circle', 'WSS · sin datos', 'Publicación por WSS: sin datos');
      traza('traza-rds', 'na', 'bi-dash-circle', 'RDS · sin datos', 'Persistencia en RDS: sin datos');
    } else {
      if (d.tipo === 'rest') traza('traza-wss', 'na', 'bi-dash-circle', 'WSS · no aplica', 'Publicación por WSS: no aplica (valor leído por REST)');
      else traza('traza-wss', 'ok', 'bi-check-circle-fill', 'WSS · recibido', 'Publicado por WSS y recibido en esta pestaña');

      if (d.persistencia === 'confirmado_rest') traza('traza-rds', 'ok', 'bi-check-circle-fill', 'RDS · confirmado', 'Confirmado en RDS mediante consulta REST');
      else if (d.persistencia === 'por_confirmar') traza('traza-rds', 'warn', 'bi-hourglass-split', 'RDS · por confirmar', 'Persistencia en RDS por confirmar (sincronizando por REST)');
      else traza('traza-rds', 'na', 'bi-dash-circle', 'RDS · no aplica', 'Historial: no aplica (los pasos de DEMO/IA no se guardan)');
    }

    if (d?.conectado === true) {
      traza('traza-fisico', 'na', 'bi-cpu', 'Vehículo · reportado conectado', 'Ejecución física sin confirmar · el servidor reporta el vehículo como conectado (bandera, no telemetría)');
    } else {
      traza('traza-fisico', 'na', 'bi-cpu', 'Vehículo · sin confirmar', 'Ejecución física sin confirmar: el navegador no puede verla');
    }
  }

  function pintarUltimo(u) {
    const card = $('mon-card');
    const d = u.dato;

    card.dataset.estado = u.estado;
    card.setAttribute('aria-busy', String(u.estado === 'cargando'));
    card.dataset.tono = d ? ORIGEN[d.tipo][2] : 'gris';

    const badge = $('mon-origen');
    badge.hidden = !d;
    if (d) {
      badge.querySelector('i').className = `bi ${ORIGEN[d.tipo][0]}`;
      badge.querySelector('span').textContent = ORIGEN[d.tipo][1];
    }

    const textos = {
      cargando: 'Cargando…',
      vacio: 'Sin movimientos registrados',
      error: 'No se pudo cargar',
    };
    $('mon-movimiento').textContent = d ? (d.comando ? formatoMovimiento(d.comando) : `Código ${d.codigo}`) : textos[u.estado];

    let detalle = '';
    if (d?.codigo !== null && d?.codigo !== undefined) detalle = `Código ${d.codigo}`;
    if (d?.paso) detalle += `${detalle ? ' · ' : ''}Paso ${d.paso.orden} de ${d.paso.total}`;
    $('mon-codigo').textContent = detalle;

    const f = d ? formatearFecha(d.fechaRaw) : null;
    $('mon-fecha').textContent = f?.fecha ?? '—';
    $('mon-hora').textContent = f?.hora ?? '—';
    $('mon-origen-valor').textContent = d?.origen ?? '—';
    $('mon-recibido').textContent = d ? `${d.tipo === 'rest' ? 'Consultado' : 'Recibido'} a las ${d.recibido}` : '';
    $('mon-recibido').title = d ? 'Hora según el reloj del navegador' : '';

    const nota = [];
    if (d && !f) nota.push(d.tipo === 'demo' || d.tipo === 'ia' ? 'El evento no incluye fecha del servidor.' : 'El servidor no entregó una fecha válida.');
    if (u.mensaje) nota.push(u.mensaje);
    $('mon-card-msg').hidden = nota.length === 0;
    $('mon-card-msg').textContent = nota.join(' ');
    $('mon-reintentar-ultimo').hidden = u.estado !== 'error';

    pintarTrazas(d);

    // Destello al cambiar el movimiento (se desactiva con prefers-reduced-motion desde CSS).
    const clave = d ? `${d.tipo}|${d.comando}|${d.codigo}|${d.fechaRaw}|${d.recibido}` : null;
    if (clave && claveCard && clave !== claveCard) {
      card.classList.remove('actualizado');
      void card.offsetWidth;
      card.classList.add('actualizado');
    }
    claveCard = clave;
  }

  // ---------- Actividad de DEMO / IA ----------
  function pintarActividad(a) {
    const el = $('mon-actividad');
    el.hidden = !a;
    if (!a) return;

    el.dataset.activa = String(a.activa);
    const quien = a.modo === 'ia' ? 'Orden de IA' : `DEMO${a.nombre ? ` «${a.nombre}»` : ''}`;
    let txt = `${quien} ${ACTIVIDAD[a.evento]}`;
    if (a.evento === 'demo_movimiento' && a.orden) txt += ` · paso ${a.orden}${a.total ? `/${a.total}` : ''}${a.comando ? ` · ${formatoMovimiento(a.comando)}` : ''}`;
    if (a.evento === 'demo_inicio' && a.total) txt += ` · ${a.total} pasos`;
    if (a.evento === 'demo_error' && a.mensaje) txt += ` · ${a.mensaje}`;

    $('mon-actividad-texto').textContent = txt;
    $('mon-actividad-hora').textContent = a.recibido;
  }

  // ---------- Tabla (actualización por diferencias, clave = id_historial) ----------
  function crearFila(f) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(f.id);

    const n = document.createElement('th');
    n.scope = 'row';
    n.className = 'col-n';

    // Solo el nombre del movimiento, sin código (BRAZO_SUBIR → Brazo subir).
    const mov = document.createElement('td');
    const nombre = document.createElement('strong');
    nombre.textContent = f.comando ? formatoMovimiento(f.comando) : '—';
    mov.append(nombre);

    const fh = formatearFecha(f.fechaRaw);
    const fecha = document.createElement('td');
    fecha.textContent = fh?.fecha ?? '—';
    const hora = document.createElement('td');
    hora.textContent = fh?.hora ?? '—';

    tr.append(n, mov, fecha, hora);
    return tr;
  }

  function mensajeFila(tbody, texto) {
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    tr.dataset.vacio = '';
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'fila-vacia';
    td.textContent = texto;
    tr.append(td);
    tbody.append(tr);
  }

  function pintarFilas(tbody, filas) {
    tbody.querySelector('tr[data-vacio]')?.remove();

    const actuales = new Map([...tbody.querySelectorAll('tr[data-id]')].map((tr) => [tr.dataset.id, tr]));
    const ids = new Set(filas.map((f) => String(f.id)));
    for (const [id, tr] of actuales) if (!ids.has(id)) tr.remove();

    filas.slice(0, limite).forEach((f, i) => {
      let tr = actuales.get(String(f.id));
      if (!tr) {
        tr = crearFila(f);
        if (actuales.size) tr.classList.add('fila-nueva');
      }
      if (tbody.children[i] !== tr) tbody.insertBefore(tr, tbody.children[i] ?? null);

      const n = tr.firstElementChild;
      if (n.textContent !== String(i + 1)) n.textContent = String(i + 1);
    });
  }

  function pintarHistorial(h) {
    const tbody = $('mon-tbody');
    const estado = $('mon-hist-estado');

    $('mon-tabla-wrap').setAttribute('aria-busy', String(h.estado === 'cargando' || h.sincronizando));
    $('mon-tabla-wrap').dataset.estado = h.estado;

    if (h.estado === 'cargando') {
      mensajeFila(tbody, 'Cargando movimientos…');
      estado.textContent = 'Cargando…';
    } else if (h.estado === 'vacio') {
      mensajeFila(tbody, 'Sin registros');
      estado.textContent = 'Sin registros';
    } else {
      pintarFilas(tbody, h.filas);
      if (h.estado === 'error') estado.textContent = `Error: ${h.mensaje}. Se muestran los últimos datos obtenidos.`;
      else estado.textContent = `${h.filas.length} de ${limite} movimientos${h.sincronizando ? ' · sincronizando…' : ''}${h.ultima ? ` · REST a las ${h.ultima}` : ''}`;
    }

    if (h.estado === 'error' && !h.filas.length) mensajeFila(tbody, 'No se pudo cargar el historial');
    if (h.descartadas > 0) estado.textContent += ` · ${h.descartadas} fila(s) con formato inválido omitidas`;
  }

  // ---------- Enlaces ----------
  s.on('ultimo', pintarUltimo);
  s.on('historial', pintarHistorial);
  s.on('actividad', pintarActividad);
  s.on('vehiculoNombre', pintarNombre);
  principal.on('vehiculoId', pintarNombre);
  principal.on('ws', pintarAviso);
  principal.on('api', pintarAviso);

  $('mon-actualizar').addEventListener('click', () => servicio.sincronizar());
  $('mon-reintentar-ultimo').addEventListener('click', () => servicio.sincronizar({ historial: false }));

  pintarNombre();
  pintarAviso();
  pintarUltimo(s.get('ultimo'));
  pintarHistorial(s.get('historial'));
  pintarActividad(null);
}
