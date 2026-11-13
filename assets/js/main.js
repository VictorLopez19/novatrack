// Punto de entrada: crea los servicios, conecta la UI y coordina la carga del vehículo.

import { CONFIG } from './config.js';
import { crearEmisor, crearStore, horaLocal, textoSeguro } from './core/utilidades.js';
import { preferencias } from './core/preferencias.js';
import { ClienteHttp } from './api/clienteHttp.js';
import { VehiculoApi } from './api/vehiculoApi.js';
import { CatalogoComandos } from './dominio/catalogo.js';
import { ServicioComandos } from './servicios/servicioComandos.js';
import { ServicioDemo } from './servicios/servicioDemo.js';
import { ServicioWebSocket } from './servicios/servicioWebSocket.js';
import { ServicioConectividad } from './servicios/servicioConectividad.js';
import { Joystick } from './ui/joystick.js';
import { Botonera } from './ui/botonera.js';
import { PanelDemo } from './ui/panelDemo.js';
import { Ajustes } from './ui/ajustes.js';
import { iniciarIndicadores } from './ui/indicadores.js';
import { iniciarMensajes } from './ui/mensajes.js';
import { iniciarAvisoGiro } from './ui/avisoGiro.js';
import { mostrarSplash } from './ui/splash.js';
import { iniciarPantallaCompleta } from './ui/pantallaCompleta.js';
import { ServicioVoz, vozSoportada } from './servicios/servicioVoz.js';
import { iniciarPanelVoz } from './ui/panelVoz.js';
import { ServicioGestos, gestosSoportados } from './servicios/servicioGestos.js';
import { iniciarPanelGestos } from './ui/panelGestos.js';
import { ServicioGiroscopio, giroscopioSoportado } from './servicios/servicioGiroscopio.js';
import { iniciarPanelGiro } from './ui/panelGiro.js';
import { crearTransicion } from './ui/transicion.js';
import { MonitoreoApi } from './api/monitoreoApi.js';
import { ServicioMonitoreo } from './servicios/servicioMonitoreo.js';
import { iniciarVistaMonitoreo } from './ui/vistaMonitoreo.js';
import { iniciarIndicadoresMonitoreo } from './ui/indicadoresMonitoreo.js';
import { iniciarNavegacion } from './vistas/navegacion.js';

// Obtiene elementos del DOM por su identificador.
const $ = (id) => document.getElementById(id);

// Crea el estado global compartido entre los servicios y la interfaz.
const store = crearStore({
  vehiculoId: null,
  vehiculoNombre: '',
  vehiculos: [],
  demos: [],
  demo: { estado: 'libre' },
  ws: 'desconectado',
  wsIntento: 0,
  api: 'comprobando',
  rds: 'sin_verificar',
  mensaje: { texto: '', tipo: 'info', id: 0 },
  faltantes: [],
  vehiculoFlag: 'sin_confirmar',
  ultimoEvento: null,
  datosListos: false,
  modo: 'manual',
  vista: 'control',
});

// Centraliza la publicación de mensajes en la interfaz.
const msg = (texto, tipo = 'info') => store.set('mensaje', {
  texto,
  tipo,
  id: Date.now() + Math.random(),
});

// Inicializa los créditos, mensajes e indicadores de conexión.
$('pie-creditos').textContent = `Desarrollado por ${CONFIG.creditos.alumno} · ${CONFIG.creditos.anio}`;

iniciarMensajes(store, $('mensajes'), CONFIG.tiempos.mensajeMs);

iniciarIndicadores(store, {
  chipWs: 'chip-ws',
  chipApi: 'chip-api',
  chipRds: 'chip-rds',
  cabTexto: 'ws-texto',
  cabPunto: 'ws-punto',
  ultimoEvento: 'ultimo-evento',
  vehiculoEstado: 'vehiculo-estado',
  vehiculoTexto: 'vehiculo-estado-texto',
  infoPunto: 'info-punto',
});

// Declara las referencias a los servicios principales.
let api;
let monitoreoApi;
let ws;
let conectividad;

// Configura los clientes HTTP, la API del vehículo y el servicio WebSocket.
try {
  const http = new ClienteHttp({
    baseUrl: CONFIG.apiBaseUrl,
    timeoutMs: CONFIG.tiempos.httpMs,
    obtenerClave: () => CONFIG.apiKey,
    alRespuesta: (s, r) => conectividad?.alRespuestaHttp(s, r),
  });

  api = new VehiculoApi(http, CONFIG.endpoints, CONFIG.tiempos);
  monitoreoApi = new MonitoreoApi(http, CONFIG.endpoints, CONFIG.monitoreo.limiteHistorial);

  ws = new ServicioWebSocket({
    urlPara: (id) => `${CONFIG.wsBaseUrl}${CONFIG.endpoints.ws(id)}`,
    tiempos: CONFIG.tiempos,
  });
} catch (e) {
  msg(e.message, 'error');
  throw e;
}

// Crea el catálogo y los servicios encargados de ejecutar comandos y demos.
const catalogo = new CatalogoComandos(CONFIG.comandos);
const emisorBotones = crearEmisor();

const demo = new ServicioDemo({
  api,
  store,
});

const comandos = new ServicioComandos({
  api,
  catalogo,
  store,
  cancelarDemo: () => demo.cancelar(),
  emisor: emisorBotones,
});

conectividad = new ServicioConectividad({
  api,
  store,
  tiempos: CONFIG.tiempos,
});

const voz = new ServicioVoz({
  api, store, comandos, demo, config: CONFIG.voz,
});

const gestos = new ServicioGestos({
  store, comandos, config: CONFIG.gestos
});

const giro = new ServicioGiroscopio({
  store, comandos, config: CONFIG.giroscopio
});

// ---------- Joysticks ----------

// Crea los joysticks definidos en la configuración.
const joysticks = {};

for (const [id, cfg] of Object.entries(CONFIG.joysticks)) {
  const duenio = `joy:${id}`;

  joysticks[id] = new Joystick($(`joy-${id}`), {
    nombre: cfg.nombre,

    // Valida y envía el comando correspondiente a la dirección seleccionada.
    alDireccion: (dir) => {
      const clave = cfg.mapa[dir];

      if (!clave || !comandos.puedeEnviar(clave)) {
        msg(`«${cfg.nombre}»: dirección sin comando en el catálogo.`, 'warn');
        comandos.soltar(duenio);
        return;
      }

      comandos.enviar(clave, duenio, cfg.origen);
    },

    // Libera el control cuando se suelta el joystick.
    alSoltar: () => comandos.soltar(duenio),
  });
}

// Actualiza las direcciones disponibles según los comandos registrados.
const marcarJoysticks = () => {
  for (const [id, cfg] of Object.entries(CONFIG.joysticks)) {
    joysticks[id].marcarDisponibles(
      Object.fromEntries(
        Object.entries(cfg.mapa).map(([d, k]) => [
          d,
          comandos.puedeEnviar(k),
        ])
      )
    );
  }
};

const ETIQUETA_MODO = { manual: 'Manual', voz: 'Voz', gesto: 'Gestos', giro: 'Giroscopio' };
store.on('modo', (m) => {
  document.documentElement.classList.toggle('modo-voz', m === 'voz');
  document.documentElement.classList.toggle('modo-gesto', m === 'gesto');
  document.documentElement.classList.toggle('modo-giro', m === 'giro');
  $('modo-etiqueta').textContent = ETIQUETA_MODO[m] ?? 'Manual';
  for (const j of Object.values(joysticks)) j.deshabilitar(m !== 'manual');
});

iniciarPanelVoz({ panel: $('panel-voz'), servicio: voz, store });
iniciarPanelGestos({ panel: $('panel-gestos'), servicio: gestos });
iniciarPanelGiro({ panel: $('panel-giro'), servicio: giro, config: CONFIG.giroscopio });

// ---------- UI ----------

// Inicializa el panel de demos y la botonera de movimientos.
const panelDemo = new PanelDemo({
  dialogo: $('dlg-demo'),
  store,
  servicioDemo: demo,
});

const botonera = new Botonera($('botonera'), {
  botones: CONFIG.botones,
  servicio: comandos,
  store,
  emisor: emisorBotones,
  alDemo: () => panelDemo.abrir(),
  alVoz: () => voz.activar(),
  vozOk: vozSoportada,
  alGestos: () => gestos.activar($('gesto-video')),
  gestosOk: gestosSoportados,
  alGiro: () => giro.activar(), 
  giroOk: giroscopioSoportado,
});

// Configura el diálogo de ajustes y las acciones para guardar o limpiar la selección.
const ajustes = new Ajustes({
  dialogo: $('dlg-ajustes'),
  store,

  alGuardar: (id) => {
    preferencias.guardarVehiculoId(id);

    if (id !== store.get('vehiculoId')) cargarVehiculo(id);
  },

  alLimpiar: () => {
    preferencias.olvidarVehiculo();

    if (store.get('vehiculoId') !== CONFIG.vehiculoPorDefecto) {
      cargarVehiculo(CONFIG.vehiculoPorDefecto);
    }
  },
});

// Asigna los eventos de apertura de ajustes, detención e información.
$('btn-ajustes').addEventListener('click', () => ajustes.abrir());
$('btn-detener').addEventListener('click', () => comandos.detener());

$('btn-info').addEventListener('click', () => $('dlg-info').showModal());
$('btn-cerrar-info').addEventListener('click', () => $('dlg-info').close());

// Detiene los movimientos al presionar Escape cuando no hay diálogos abiertos.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && store.get('vista') === 'control' && !document.querySelector('dialog[open]')) {
    comandos.detener();
  }
});

// Permite activar o salir del modo de pantalla completa.
$('btn-pantalla').addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen?.().catch(() =>
      msg('Tu navegador no permite pantalla completa.', 'warn')
    );
  }
});

// ---------- WebSocket ----------

// Actualiza el estado y el número de intentos de conexión.
ws.emisor.on('estado', ({ estado, intento }) => {
  store.set('wsIntento', intento);
  store.set('ws', estado);
});

// Muestra los rechazos recibidos desde el servidor WebSocket.
ws.emisor.on('rechazado', (motivo) =>
  msg(`WSS rechazado: ${textoSeguro(motivo, 80)}`, 'error')
);

// Procesa los eventos recibidos del vehículo.
ws.emisor.on('evento', (ev) => {
  if (ev.id_vehiculo !== store.get('vehiculoId')) return;

  // Actualiza el estado inicial del vehículo o procesa los eventos de las demos.
  if (ev.evento === 'estado_inicial') {
    store.set('vehiculoFlag', ev.conectado === true ? 'reportado' : 'sin_confirmar');
  } else if (ev.evento.startsWith('demo_')) {
    demo.procesarEvento(ev);
  }

  // Registra la información del último evento recibido, excepto los mensajes pong.
  if (ev.evento !== 'pong') {
    store.set('ultimoEvento', {
      evento: textoSeguro(ev.evento, 30),
      comando: ev.comando ? textoSeguro(ev.comando, 40) : null,
      hora: horaLocal(),
    });
  }
});

// Intenta restablecer la conexión WebSocket cuando vuelve la conexión a Internet.
window.addEventListener('online', () => ws.reconectarYa());

// ---------- Monitoreo y navegación ----------

// Reutiliza el WSS único: el servicio solo agrega un suscriptor a los eventos existentes.
const monitoreo = new ServicioMonitoreo({
  api: monitoreoApi,
  apiVehiculo: api,
  ws,
  store,
  config: CONFIG.monitoreo,
});

iniciarVistaMonitoreo({ servicio: monitoreo, principal: store, limite: CONFIG.monitoreo.limiteHistorial });
iniciarIndicadoresMonitoreo(store, { ws: 'mon-chip-ws', api: 'mon-chip-api', rds: 'mon-chip-rds' });
monitoreo.iniciar();

iniciarNavegacion({
  store,
  transicion: crearTransicion($('transicion')),
  vistas: { control: $('vista-control'), monitoreo: $('vista-monitoreo') },
  enlaces: { control: $('nav-control'), monitoreo: $('nav-monitoreo') },
  alSalir: {
    // Al dejar CONTROL nada debe seguir mandando comandos: se apagan voz, gestos y giroscopio y se sueltan los joysticks.
    control: () => {
      if (store.get('modo') === 'gesto') gestos.desactivar('Cambiaste de sección: modo gestos desactivado.', 'warn');
      if (store.get('modo') === 'voz') voz.desactivar('Cambiaste de sección: modo voz desactivado.', 'warn');
      if (store.get('modo') === 'giro') giro.desactivar('Cambiaste de sección: modo giroscopio desactivado.', 'warn');
      for (const j of Object.values(joysticks)) j.deshabilitar(true);
    },
    monitoreo: () => monitoreo.salir(),
  },
  alEntrar: {
    control: () => {
      for (const j of Object.values(joysticks)) j.deshabilitar(store.get('modo') !== 'manual');
    },
    monitoreo: () => monitoreo.entrar(),
  },
});

// ---------- Carga del vehículo ----------

// Controla las cargas para invalidar solicitudes anteriores.
let token = 0;
let cargas = 0;

// Obtiene la lista de vehículos disponibles.
async function cargarVehiculos() {
  try {
    store.set('vehiculos', await api.listarVehiculos());
  } catch {
    // El proceso se reintenta automáticamente.
  }
}

// Carga por REST el vehículo, su catálogo y las DEMO.
async function cargarDatos(id, { silencioso = false } = {}) {
  const mio = token;
  cargas += 1;

  try {
    const [veh, cmds, demos] = await Promise.allSettled([
      api.obtenerVehiculo(id),
      api.listarComandos(id),
      demo.cargar(id, { silencioso }),
    ]);

    if (mio !== token) return false;

    // Actualiza la información del vehículo.
    if (veh.status === 'fulfilled') {
      $('veh-nombre').textContent = veh.value.nombre;

      if (!veh.value.activo && !silencioso) {
        msg('El vehículo está inactivo: no aceptará movimientos.', 'warn');
      }
    } else {
      $('veh-nombre').textContent = `Vehículo #${id}`;

      if (!silencioso) {
        msg(veh.reason.message, 'error');
      }
    }

    // Carga el catálogo de comandos y comprueba los comandos faltantes.
    if (cmds.status === 'fulfilled') {
      catalogo.cargar(cmds.value);

      const claves = new Set([
        ...Object.values(CONFIG.joysticks).flatMap((j) => Object.values(j.mapa)),
        ...CONFIG.botones
          .filter((b) => b.tipo === 'comando')
          .map((b) => b.clave),
        'DETENER',
      ]);

      store.set('faltantes', catalogo.faltantes([...claves]));
    } else if (!silencioso) {
      msg(`No se pudo cargar el catálogo: ${cmds.reason.message}`, 'error');
    }

    marcarJoysticks();
    botonera.actualizar();

    const ok =
      veh.status === 'fulfilled' &&
      cmds.status === 'fulfilled' &&
      demos.value === true;

    if (ok && !store.get('datosListos') && silencioso) {
      msg('Conexión restablecida: botones y DEMO cargados.', 'ok');
    }

    store.set('datosListos', ok);

    return ok;
  } finally {
    cargas -= 1;
  }
}

// Cambia el vehículo activo y carga sus datos.
async function cargarVehiculo(id) {
  token += 1;

  store.set('datosListos', false);

  comandos.reiniciar();
  demo.reiniciar();

  store.set('vehiculoId', id);
  store.set('vehiculoFlag', 'sin_confirmar');
  store.set('demos', []);

  catalogo.cargar([]);

  ws.conectar(id);

  await cargarDatos(id);
}

// Reintenta la carga cuando faltan datos y la API responde.
function reintentarSiFalta() {
  if (cargas > 0 || store.get('api') === 'no_disponible') return;

  if (!store.get('vehiculos').length) {
    cargarVehiculos();
  }

  const id = store.get('vehiculoId');

  if (!store.get('datosListos') && id) {
    cargarDatos(id, { silencioso: true });
  }
}

// Reintenta la carga cuando la API vuelve a estar disponible.
store.on('api', (e) => {
  if (e === 'disponible') reintentarSiFalta();
});

// Reintenta la carga cuando el WebSocket vuelve a estar en línea.
ws.emisor.on('estado', ({ estado }) => {
  if (estado === 'en_linea') reintentarSiFalta();
});

// Programa los reintentos automáticos.
setInterval(reintentarSiFalta, 10000);

// ---------- Arranque ----------

// Comprueba si los servicios necesarios están disponibles.
const serviciosListos = () =>
  store.get('api') === 'disponible' &&
  store.get('ws') === 'en_linea' &&
  store.get('datosListos');

// Avisa si los servicios tardan demasiado en responder tras el splash.
function avisarSiNoResponde() {
  if (serviciosListos()) return;

  msg('Conectando con los servicios…', 'info');

  setTimeout(() => {
    if (!serviciosListos()) {
      msg('Los servicios siguen sin responder. Revisa «Información».', 'warn');
    }
  }, 15000);
}

// Inicializa los servicios y carga el vehículo seleccionado.
async function iniciar() {
  conectividad.iniciar();

  const id = preferencias.obtenerVehiculoId(CONFIG.vehiculoPorDefecto);

  store.set('vehiculoId', id);

  mostrarSplash($('splash')).then(avisarSiNoResponde);

  cargarVehiculos();
  cargarVehiculo(id);
}

// Inicializa el aviso de giro y pone en marcha la aplicación.
iniciarAvisoGiro();
iniciarPantallaCompleta({ aviso: (t) => msg(t, 'info') });
iniciar();