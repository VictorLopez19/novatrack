// Punto de entrada: crea los servicios, conecta la UI y coordina la carga del vehículo.

import { CONFIG } from './config.js';
import { crearEmisor, crearStore, horaLocal, textoSeguro } from './core/utilidades.js';
import { sesion } from './core/sesion.js';
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
import { crearTransicion } from './ui/transicion.js';
import { iniciarTemporizador } from './ui/temporizadorSesion.js';
import { mostrarSplash } from './ui/splash.js';
import { iniciarPantallaCompleta } from './ui/pantallaCompleta.js';
import { ServicioVoz, vozSoportada } from './servicios/servicioVoz.js';
import { iniciarPanelVoz } from './ui/panelVoz.js';
import { ServicioGestos, gestosSoportados } from './servicios/servicioGestos.js';
import { iniciarPanelGestos } from './ui/panelGestos.js';

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
});

// Centraliza la publicación de mensajes en la interfaz.
const msg = (texto, tipo = 'info') => store.set('mensaje', {
  texto,
  tipo,
  id: Date.now() + Math.random(),
});

// Configura los avisos relacionados con la expiración de la sesión.
sesion.vigilar({
  avisar: () => msg('La clave vence en 2 minutos. Vuelve a escribirla en Ajustes.', 'warn'),
  expirar: () => msg('La clave expiró. Escríbela de nuevo en Ajustes para enviar comandos.', 'warn'),
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
let ws;
let conectividad;

// Configura los clientes HTTP, la API del vehículo y el servicio WebSocket.
try {
  const http = new ClienteHttp({
    baseUrl: CONFIG.apiBaseUrl,
    timeoutMs: CONFIG.tiempos.httpMs,
    obtenerClave: sesion.obtenerClave,
    alRespuesta: (s, r) => conectividad?.alRespuestaHttp(s, r),
  });

  api = new VehiculoApi(http, CONFIG.endpoints, CONFIG.tiempos);

  ws = new ServicioWebSocket({
    urlPara: (id) => `${CONFIG.wsBaseUrl}${CONFIG.endpoints.ws(id)}`,
    tiempos: CONFIG.tiempos,
  });
} catch (e) {
  msg(e.message, 'error');
  throw e;
}

// Configura los elementos relacionados con la sesión requerida.
const transicion = crearTransicion($('transicion'));
const haySesion = () => Boolean(sesion.obtenerClave());

// Abre los ajustes mediante la pantalla de transición.
function irAAjustes() {
  if (store.get('modo') === 'gesto') gestos.desactivar('Sesión requerida: modo gestos desactivado.', 'warn');
  if (store.get('modo') === 'voz') voz.desactivar('Sesión requerida: modo voz desactivado.', 'warn');

  if (transicion.activa || $('dlg-ajustes').open) return;

  document.querySelectorAll('dialog[open]').forEach((d) => d.close());

  transicion.mostrar('Ingresando a la configuración ...', {
    alTerminar: () => ajustes.abrir(),
  });
}

// Inicializa el temporizador de expiración de la sesión.
iniciarTemporizador($('temp-sesion'));

// Crea el catálogo y los servicios encargados de ejecutar comandos y demos.
const catalogo = new CatalogoComandos(CONFIG.comandos);
const emisorBotones = crearEmisor();

const demo = new ServicioDemo({
  api,
  store,
  haySesion,
  alFaltarSesion: irAAjustes,
});

const comandos = new ServicioComandos({
  api,
  catalogo,
  store,
  cancelarDemo: () => demo.cancelar(),
  emisor: emisorBotones,
  haySesion,
  alFaltarSesion: irAAjustes,
});

conectividad = new ServicioConectividad({
  api,
  store,
  tiempos: CONFIG.tiempos,
});

const voz = new ServicioVoz({
  api, store, comandos, demo, haySesion, alFaltarSesion: irAAjustes, config: CONFIG.voz,
});

const gestos = new ServicioGestos({
  store, comandos, haySesion, alFaltarSesion: irAAjustes, config: CONFIG.gestos
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

const ETIQUETA_MODO = { manual: 'Manual', voz: 'Voz', gesto: 'Gestos' };
store.on('modo', (m) => {
  document.documentElement.classList.toggle('modo-voz', m === 'voz');
  document.documentElement.classList.toggle('modo-gesto', m === 'gesto');
  $('modo-etiqueta').textContent = ETIQUETA_MODO[m] ?? 'Manual';
  for (const j of Object.values(joysticks)) j.deshabilitar(m !== 'manual');
});

iniciarPanelVoz({ panel: $('panel-voz'), servicio: voz, store });
iniciarPanelGestos({ panel: $('panel-gestos'), servicio: gestos });

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
});

// Configura el diálogo de ajustes y las acciones para guardar o limpiar la selección.
const ajustes = new Ajustes({
  dialogo: $('dlg-ajustes'),
  store,

  alGuardar: (id) => {
    sesion.guardarVehiculoId(id);

    if (id !== store.get('vehiculoId')) cargarVehiculo(id);
  },

  alLimpiar: () => {
    sesion.olvidarVehiculo();

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
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
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

// ---------- Ajustes al iniciar ----------

// Controla si el usuario ya abrió los ajustes.
let ajustesVisto = false;

$('dlg-ajustes').addEventListener('close', () => {
  ajustesVisto = true;
});

// Comprueba si los servicios necesarios están disponibles.
const serviciosListos = () =>
  store.get('api') === 'disponible' &&
  store.get('ws') === 'en_linea' &&
  store.get('datosListos');

// Abre los ajustes cuando los servicios estén listos.
function abrirAjustesCuandoListo() {
  const hayClave = () => Boolean(sesion.obtenerClave());

  if (hayClave()) {
    ajustesVisto = true;
    return;
  }

  const abrir = () => {
    if (!ajustesVisto && !hayClave() && !$('dlg-ajustes').open) {
      ajustes.abrir();
    }

    ajustesVisto = true;
  };

  if (serviciosListos()) {
    abrir();
    return;
  }

  msg('Conectando con los servicios… Ajustes se abrirá cuando estén listos.', 'info');

  const aviso = setTimeout(() => {
    if (!serviciosListos()) {
      msg('Los servicios siguen sin responder. Revisa «Información».', 'warn');
    }
  }, 15000);

  const offs = [];

  const revisar = () => {
    if (!serviciosListos()) return;

    clearTimeout(aviso);
    offs.forEach((f) => f());

    abrir();
  };

  for (const k of ['api', 'ws', 'datosListos']) {
    offs.push(store.on(k, revisar));
  }
}

// Inicializa los servicios y carga el vehículo seleccionado.
async function iniciar() {
  conectividad.iniciar();

  const id = sesion.obtenerVehiculoId(CONFIG.vehiculoPorDefecto);

  store.set('vehiculoId', id);

  mostrarSplash($('splash')).then(abrirAjustesCuandoListo);

  cargarVehiculos();
  cargarVehiculo(id);
}

// Inicializa el aviso de giro y pone en marcha la aplicación.
iniciarAvisoGiro();
iniciarPantallaCompleta({ aviso: (t) => msg(t, 'info') });
iniciar();