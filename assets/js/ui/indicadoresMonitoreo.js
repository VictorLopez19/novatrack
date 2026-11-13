// Tres indicadores independientes de MONITOREO (WSS, API AWS, RDS). Usa los mismos estados del store y las clases .chip del proyecto.
const WS = {
  en_linea: ['bi-broadcast', 'En línea', 'ok'],
  conectando: ['bi-arrow-repeat', 'Conectando', 'warn'],
  reconectando: ['bi-arrow-repeat', 'Reconectando', 'warn'],
  desconectado: ['bi-x-circle-fill', 'Desconectado', 'err'],
};
const API = {
  disponible: ['bi-cloud-check-fill', 'Disponible', 'ok'],
  comprobando: ['bi-hourglass-split', 'Comprobando', 'warn'],
  no_disponible: ['bi-cloud-slash-fill', 'No disponible', 'err'],
};
const RDS = {
  disponible: ['bi-database-check', 'Disponible', 'ok'],
  no_disponible: ['bi-database-x', 'No disponible', 'err'],
  sin_verificar: ['bi-database-dash', 'Sin verificar', 'neutro'],
};

function pintar(el, [icono, texto, nivel]) {
  el.className = `chip chip-${nivel}`;
  el.querySelector('i').className = `bi ${icono}`;
  el.querySelector('span').textContent = texto;
}

export function iniciarIndicadoresMonitoreo(store, ids) {
  const $ = (id) => document.getElementById(id);
  const ws = () => (store.get('ws') === 'conectando' && store.get('wsIntento') > 0 ? 'reconectando' : store.get('ws'));

  const refrescar = () => {
    pintar($(ids.ws), WS[ws()]);
    pintar($(ids.api), API[store.get('api')]);
    pintar($(ids.rds), RDS[store.get('rds')]);
  };

  for (const k of ['ws', 'wsIntento', 'api', 'rds']) store.on(k, refrescar);
  refrescar();
}
