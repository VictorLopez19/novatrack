// Panel del modo gestos: vista de la cámara (en espejo), puntos de la mano y orden en efecto.
// Todo el texto se escribe con textContent.
const ETIQUETAS = {
  AVANZAR: ['bi-arrow-up-circle-fill', 'Avanzar'],
  RETROCEDER: ['bi-arrow-down-circle-fill', 'Retroceder'],
  IZQUIERDA: ['bi-arrow-left-circle-fill', 'Izquierda'],
  DERECHA: ['bi-arrow-right-circle-fill', 'Derecha'],
  BRAZO_SUBIR: ['bi-arrow-bar-up', 'Brazo arriba'],
  BRAZO_BAJAR: ['bi-arrow-bar-down', 'Brazo abajo'],
  GARRA_IZQUIERDA: ['bi-arrows-angle-expand', 'Garra izquierda'],
  GARRA_DERECHA: ['bi-arrows-angle-contract', 'Garra derecha'],
  ENCENDIDO: ['bi-power', 'Encendido'],
  VELOCIDAD: ['bi-speedometer2', 'Velocidad'],
  SONIDO: ['bi-volume-up-fill', 'Sonido'],
  LUCES: ['bi-lightbulb-fill', 'Luces'],
  DETENER: ['bi-stop-circle-fill', 'Detener'],
};


const SIN_ORDEN = ['bi-hourglass-split', 'Sin orden'];

export function iniciarPanelGestos({ panel, servicio }) {
  const q = (s) => panel.querySelector(s);
  const estado = q('#gesto-estado'); const aviso = q('#gesto-aviso');
  const chip = q('#gesto-chip'); const chipIcono = chip.querySelector('i'); const chipTexto = chip.querySelector('span');
  const lienzo = q('#gesto-lienzo'); const ctx = lienzo.getContext('2d');
  lienzo.width = 160; lienzo.height = 120;
  let armado = false;

  // Estado del modo: mientras se descargan el detector de manos y se abre la cámara se muestra «Cargando…».
  const ESTADOS = { cargando: 'Cargando cámara…', activo: 'Activo', inactivo: 'Inactivo' };
  servicio.emisor.on('estado', (e) => {
    estado.textContent = ESTADOS[e] ?? '';
    panel.dataset.estado = e;
    if (e !== 'activo') { aviso.textContent = ''; pintarChip(SIN_ORDEN, 'neutro'); }
  });

  const pintarChip = ([icono, texto], tono) => {
    chipIcono.className = `bi ${icono}`; chipTexto.textContent = texto;
    chip.dataset.tono = tono;
  };


  servicio.emisor.on('puntos', (m) => {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    if (!m || m.length !== 21) return;

    const conexiones = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17]
    ];

    const tono = armado ? '#3ee58a' : '#ffbf3c';

    // Unir cada punto con su articulación correspondiente
    ctx.strokeStyle = tono;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    for (const [a, b] of conexiones) {
      ctx.beginPath();
      ctx.moveTo(m[a].x * lienzo.width, m[a].y * lienzo.height);
      ctx.lineTo(m[b].x * lienzo.width, m[b].y * lienzo.height);
      ctx.stroke();
    }

    // Dibujar las articulaciones encima de las líneas
    for (const p of m) {
      ctx.beginPath();
      ctx.arc(
        p.x * lienzo.width,
        p.y * lienzo.height,
        3,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = tono;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });


  servicio.emisor.on('lectura', ({ clave, mano, armado: a, actual }) => {
    armado = a;
    const etiqueta = actual ? ETIQUETAS[actual] : null;
    pintarChip(etiqueta ?? SIN_ORDEN, !etiqueta ? 'neutro' : actual === 'DETENER' ? 'parada' : 'mov');
    if (!a) aviso.textContent = 'Muestra la palma abierta (o quita la mano) para empezar.';
    else if (!mano) aviso.textContent = 'No veo tu mano.';
    else if (!clave) aviso.textContent = 'Pose no reconocida: apunta con el índice.';
    else aviso.textContent = `Detectado: ${ETIQUETAS[clave]?.[1] ?? clave}`;
  });

  q('#btn-gesto-salir').addEventListener('click', () => servicio.desactivar());
}
