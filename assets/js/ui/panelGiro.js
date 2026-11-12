// Panel del modo giroscopio: nivel de burbuja, orden en efecto, calibración y emergencia.
const ETIQUETAS = {
  AVANZAR: ['bi-arrow-up-circle-fill', 'Avanzar'],
  RETROCEDER: ['bi-arrow-down-circle-fill', 'Retroceder'],
  IZQUIERDA: ['bi-arrow-left-circle-fill', 'Izquierda'],
  DERECHA: ['bi-arrow-right-circle-fill', 'Derecha'],
};
const SIN_ORDEN = ['bi-hourglass-split', 'Sin orden'];
const ESTADOS = {
  calibrando: ['Calibrando…', 'Mantén el teléfono quieto y nivelado.'],
  activo: ['Activo', ''],
  emergencia: ['EMERGENCIA', 'Parada de emergencia: pulsa Reactivar.'],
  sin_calibrar: ['Sin calibrar', 'Calibración insuficiente. Pulsa Recalibrar.'],
  inactivo: ['Inactivo', ''],
};

export function iniciarPanelGiro({ panel, servicio, config }) {
  const q = (s) => panel.querySelector(s);
  const estado = q('#giro-estado'); const punto = q('#giro-punto');
  const prog = q('#giro-prog'); const barra = q('#giro-prog-barra');
  const chip = q('#giro-chip'); const chipIcono = chip.querySelector('i'); const chipTexto = chip.querySelector('span');
  const aviso = q('#giro-aviso'); const datos = q('#giro-datos');
  const bCal = q('#btn-giro-calibrar'); const bRea = q('#btn-giro-reactivar');
  const RANGO = config.rangoVisual; // grados que recorre el punto hasta el borde
  const MAX = 40;                   // % del diámetro que recorre el punto desde el centro
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  // Aros del nivel: el punteado marca la zona de liberación y el naranja el umbral de arranque
  const anillo = (grados) => `${((1 - Math.min(1, grados / RANGO) * (MAX / 50)) / 2) * 100}%`;
  q('.giro-zona.lib').style.inset = anillo(config.liberacion);
  q('.giro-zona.umb').style.inset = anillo(config.umbral);

  const pintarChip = ([icono, texto], tono) => {
    chipIcono.className = `bi ${icono}`; chipTexto.textContent = texto; chip.dataset.tono = tono;
  };
  const mover = (x, y) => {
    punto.style.left = `${50 + clamp(x / RANGO) * MAX}%`;
    punto.style.top = `${50 + clamp(y / RANGO) * MAX}%`;
  };

  servicio.emisor.on('estado', (e) => {
    const [titulo, texto] = ESTADOS[e] ?? ESTADOS.inactivo;
    panel.dataset.estado = e; estado.textContent = titulo; aviso.textContent = texto;
    prog.hidden = e !== 'calibrando'; bRea.hidden = e !== 'emergencia'; bCal.disabled = e === 'calibrando';
    if (e !== 'activo') { mover(0, 0); pintarChip(SIN_ORDEN, e === 'emergencia' ? 'parada' : 'neutro'); }
    if (e === 'calibrando') barra.style.width = '0%';
    if (e === 'inactivo') datos.textContent = '';
  });
  servicio.emisor.on('progreso', (p) => { barra.style.width = `${Math.round(p * 100)}%`; });
  servicio.emisor.on('lectura', ({ adelante, lateral, aceleracion, clave, armado }) => {
    mover(lateral, adelante); // adelante es negativo: el punto sube al inclinar hacia adelante
    const etiqueta = clave ? ETIQUETAS[clave] : null;
    pintarChip(etiqueta ?? SIN_ORDEN, etiqueta ? 'mov' : 'neutro');
    aviso.textContent = armado ? '' : 'Nivela el teléfono para empezar.';
    datos.textContent = `Adelante/atrás ${adelante.toFixed(0)}° · Izq./der. ${lateral.toFixed(0)}° · Aceleración ${aceleracion.toFixed(1)}`;
  });

  bCal.addEventListener('click', () => servicio.calibrar());
  bRea.addEventListener('click', () => servicio.reactivar());
  q('#btn-giro-salir').addEventListener('click', () => servicio.desactivar());
}