// Panel del modo gestos: vista de la cámara (en espejo), puntos de la mano y orden en efecto.
// Todo el texto se escribe con textContent.
const ETIQUETAS = {
  AVANZAR: ['bi-arrow-up-circle-fill', 'Avanzar'],
  RETROCEDER: ['bi-arrow-down-circle-fill', 'Retroceder'],
  IZQUIERDA: ['bi-arrow-left-circle-fill', 'Izquierda'],
  DERECHA: ['bi-arrow-right-circle-fill', 'Derecha'],
  BRAZO_SUBIR: ['bi-arrow-bar-up', 'Brazo arriba'],
  BRAZO_BAJAR: ['bi-arrow-bar-down', 'Brazo abajo'],
  GARRA_ABRIR: ['bi-arrows-angle-expand', 'Abrir garra'],
  GARRA_CERRAR: ['bi-arrows-angle-contract', 'Cerrar garra'],
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

  const pintarChip = ([icono, texto], tono) => {
    chipIcono.className = `bi ${icono}`; chipTexto.textContent = texto;
    chip.dataset.tono = tono;
  };

  servicio.emisor.on('estado', (e) => {
    panel.dataset.estado = e;
    estado.textContent = e === 'cargando' ? 'Cargando detector…' : e === 'activo' ? 'Cámara activa' : 'Inactivo';
    if (e !== 'activo') {
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      pintarChip(SIN_ORDEN, 'neutro'); aviso.textContent = '';
      armado = false;
    }
  });

  servicio.emisor.on('puntos', (m) => {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    if (!m) return;
    ctx.fillStyle = armado ? '#3ee58a' : '#ffbf3c';
    for (const p of m) {
      ctx.beginPath(); ctx.arc(p.x * lienzo.width, p.y * lienzo.height, 2.5, 0, Math.PI * 2); ctx.fill();
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
