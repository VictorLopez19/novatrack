// Panel de tres indicadores (WSS, API AWS, RDS) y estado de conexión del encabezado.

// Estados e iconos correspondientes a la conexión WebSocket.
const WS = {
  en_linea: ['bi-broadcast', 'WSS (Online)', 'ok'],
  conectando: ['bi-arrow-repeat', 'WSS (Conectando)', 'warn'],
  reconectando: ['bi-arrow-repeat', 'WSS (Reconectando)', 'warn'],
  desconectado: ['bi-x-circle-fill', 'WSS (Desconectado)', 'err'],
};

// Estados e iconos correspondientes a la API de AWS.
const API = {
  disponible: ['bi-cloud-check-fill', 'AWS (Online)', 'ok'],
  comprobando: ['bi-hourglass-split', 'AWS (Comprobando)', 'warn'],
  no_disponible: ['bi-cloud-slash-fill', 'AWS (API no disponible)', 'err'],
};

// Estados e iconos correspondientes a la base de datos RDS.
const RDS = {
  disponible: ['bi-database-check', 'RDS (Online)', 'ok'],
  no_disponible: ['bi-database-x', 'RDS (No disponible)', 'err'],
  sin_verificar: ['bi-database-dash', 'RDS (Sin verificar)', 'neutro'],
};

// Textos que se muestran en el encabezado según el estado de conexión.
const CABECERA = {
  en_linea: 'Conectado',
  conectando: 'Conectando…',
  reconectando: 'Reconectando…',
  desconectado: 'Desconectado'
};

// Tipos de eventos y sus respectivos iconos, títulos y colores.
const TIPOS = {
  movimiento: ['bi-arrows-move', 'Movimiento', 'azul'],
  estado_inicial: ['bi-info-circle-fill', 'Estado inicial', 'gris'],
  demo_inicio: ['bi-play-circle-fill', 'DEMO iniciada', 'naranja'],
  demo_movimiento: ['bi-collection-play-fill', 'Paso de DEMO', 'naranja'],
  demo_fin: ['bi-check-circle-fill', 'DEMO finalizada', 'verde'],
  demo_cancelada: ['bi-slash-circle-fill', 'DEMO cancelada', 'amarillo'],
  demo_error: ['bi-x-octagon-fill', 'Error en DEMO', 'rojo'],
};

// Comprueba que un valor no sea nulo, indefinido ni una cadena vacía.
const hay = (v) => v !== null && v !== undefined && v !== '';

// Actualiza visualmente el último evento recibido.
function pintarEvento(el, e) {
  el.replaceChildren();
  if (!e) { el.classList.add('vacio'); delete el.dataset.tono; el.textContent = 'Sin eventos todavía'; return; }
  el.classList.remove('vacio');
  const [icono, titulo, tono] = TIPOS[e.evento] ?? ['bi-broadcast', e.evento, 'gris'];
  el.dataset.tono = tono;

  const cab = document.createElement('div'); cab.className = 'ev-cab';
  const badge = document.createElement('span'); badge.className = 'ev-badge';
  const i = document.createElement('i'); i.className = `bi ${icono}`; i.setAttribute('aria-hidden', 'true');
  badge.append(i, document.createTextNode(e.comando ? `${titulo} · ${e.comando}` : titulo));
  const hora = document.createElement('time'); hora.className = 'ev-hora'; hora.textContent = `Recibido ${e.hora}`;
  cab.append(badge, hora);
  el.append(cab);
}

// Actualiza el icono, el texto y el estilo de un indicador.
function pintar(el, [icono, texto, nivel]) {
  el.className = `chip chip-${nivel}`;
  el.querySelector('i').className = `bi ${icono}`;
  el.querySelector('span').textContent = texto;
}

// Inicializa los indicadores y registra los cambios del estado de la aplicación.
export function iniciarIndicadores(store, ids) {
  // Obtiene elementos del documento mediante sus identificadores.
  const $ = (id) => document.getElementById(id);

  // Determina si WebSocket está reconectando o conectando por primera vez.
  const ws = () => (
    store.get('ws') === 'conectando' && store.get('wsIntento') > 0
      ? 'reconectando'
      : store.get('ws')
  );

  // Actualiza los indicadores y los puntos de estado del encabezado.
  const refrescar = () => {
    pintar($(ids.chipWs), WS[ws()]);
    pintar($(ids.chipApi), API[store.get('api')]);
    pintar($(ids.chipRds), RDS[store.get('rds')]);

    const e = ws();

    // Actualiza el texto y el punto de conexión del encabezado.
    $(ids.cabTexto).textContent = CABECERA[e];
    $(ids.cabPunto).className = `punto punto-${WS[e][2]}`;

    // Determina el nivel de estado general según los tres indicadores.
    const niveles = [
      WS[e][2],
      API[store.get('api')][2],
      RDS[store.get('rds')][2]
    ];

    const peor = niveles.includes('err')
      ? 'err'
      : niveles.includes('warn')
        ? 'warn'
        : 'ok';

    $(ids.infoPunto).className = `punto punto-${peor}`;
  };

  // Registra los cambios de conexión, API y base de datos.
  for (const k of ['ws', 'wsIntento', 'api', 'rds']) {
    store.on(k, refrescar);
  }

  // Actualiza la información del último evento recibido.
  store.on('ultimoEvento', (e) =>
    pintarEvento($(ids.ultimoEvento), e)
  );

  // Actualiza el indicador y el texto del estado del vehículo.
  store.on('vehiculoFlag', (f) => {
    const el = $(ids.vehiculoEstado);

    el.dataset.estado = f;
    el.title = f === 'reportado'
      ? 'El servidor reporta el vehículo como conectado'
      : 'Conexión física del vehículo sin confirmar';

    $(ids.vehiculoTexto).textContent = f === 'reportado'
      ? 'Vehículo reportado como conectado por el servidor'
      : 'Vehículo físico sin confirmar';
  });

  // Realiza la primera actualización de los indicadores.
  refrescar();
}