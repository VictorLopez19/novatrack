// Panel del modo voz: estado de la escucha, conversación (lo que se oyó y la respuesta)
// y avance de las órdenes de IA. Todo el texto se escribe con textContent.
const ESTADOS = {
  escuchando: ['bi-mic-fill', 'Escuchando…'],
  procesando: ['bi-hourglass-split', 'Enviando a la IA…'],
  inactivo: ['bi-mic-mute-fill', 'Inactivo'],
};

export function iniciarPanelVoz({ panel, servicio, store }) {
  const q = (s) => panel.querySelector(s);
  const icono = q('#voz-icono'); const estado = q('#voz-estado');
  const texto = q('#voz-texto'); const resultado = q('#voz-resultado');
  const ia = q('#voz-ia'); const barra = q('#voz-ia-barra'); const prog = q('#voz-ia-prog'); const paso = q('#voz-ia-paso');
  let iaActiva = false; // una orden de IA se está ejecutando en el backend

  const pintar = (e) => {
    const [clase, etiqueta] = ESTADOS[e] ?? ESTADOS.inactivo;
    icono.className = `bi ${clase} voz-mic`;
    estado.textContent = etiqueta;
    panel.dataset.estado = e;
  };
  const limpiar = () => {
    texto.hidden = true; texto.textContent = '';
    resultado.hidden = true; resultado.textContent = ''; delete resultado.dataset.tipo;
    ia.hidden = true;
  };

  servicio.emisor.on('estado', (e) => {
    if (e === 'inactivo') { limpiar(); iaActiva = false; pintar(e); return; }
    if (!iaActiva) pintar(e);
  });
  servicio.emisor.on('parcial', (t) => {
    texto.hidden = false; texto.classList.add('parcial'); texto.textContent = `«${t}»`;
  });
  servicio.emisor.on('resultado', ({ texto: t, clave, aviso, via, ok }) => {
    texto.hidden = false; texto.classList.remove('parcial'); texto.textContent = `«${t}»`;
    resultado.hidden = false;
    resultado.dataset.tipo = ok ? 'ok' : 'warn';
    resultado.textContent = clave ? `Directo → ${clave}`
      : (via === 'ia' ? `IA · ${aviso}` : (aviso || 'No entendí el comando.'));
  });

  store.on('demo', (d) => {
    if (d.modo === 'ia' && d.estado !== 'libre') {
      iaActiva = true;
      icono.className = 'bi bi-robot voz-mic'; panel.dataset.estado = 'ia';
      ia.hidden = false;
      if (d.estado === 'iniciando' || !d.total) {
        estado.textContent = 'La IA está interpretando…';
        barra.classList.add('indeterminada'); prog.style.width = '';
        paso.textContent = 'Preparando la secuencia';
      } else {
        estado.textContent = 'Ejecutando orden de IA';
        barra.classList.remove('indeterminada');
        prog.style.width = `${Math.min(100, Math.round((d.orden / d.total) * 100))}%`;
        paso.textContent = `Paso ${d.orden}/${d.total}${d.comando ? ` · ${d.comando}` : ''}`;
      }
    } else if (iaActiva) {
      iaActiva = false;
      ia.hidden = true; barra.classList.remove('indeterminada');
      pintar(servicio.activo ? 'escuchando' : 'inactivo');
    }
  });

  q('#btn-voz-salir').addEventListener('click', () => servicio.desactivar());
}
