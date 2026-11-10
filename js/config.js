
// Configuración única: URLs, endpoints, mapeo de comandos y botones. Sin secretos.
// Si cambias las URLs, actualiza también connect-src en la meta CSP de index.html.

// Define la configuración general de la aplicación y evita modificar sus propiedades.
export const CONFIG = Object.freeze({
  // Direcciones base para las conexiones con la API y el WebSocket.
  apiBaseUrl: 'https://drivecore.duckdns.org',
  wsBaseUrl: 'wss://drivecore.duckdns.org',

  // Identificador del vehículo seleccionado por defecto.
  vehiculoPorDefecto: 1,

  // Créditos y año de identificación del proyecto.
  creditos: Object.freeze({
    alumno: 'López Cruz Victor Manuel',
    anio: 2026
  }),

  // Tiempos de espera e intervalos utilizados por los servicios.
  tiempos: Object.freeze({
    httpMs: 8000,
    saludMs: 5000,
    intervaloSaludMs: 15000,
    pingMs: 20000,
    pongMs: 8000,
    reconexionMaxMs: 15000,
    mensajeMs: 2000,
    claveMs: 15 * 60 * 1000,
  }),

  // Rutas del backend FastAPI (api_vehiculo_iot). Ajusta aquí si cambian.
  endpoints: Object.freeze({
    salud: '/',
    dbListo: '/vehiculos', // el backend no expone diagnóstico de RDS: RDS queda «Sin verificar»
    vehiculos: '/vehiculos',
    vehiculo: (id) => `/vehiculos/${id}`,
    comandos: (id) => `/vehiculos/${id}/comandos`,
    demos: (id) => `/vehiculos/${id}/demos`,
    movimiento: (id) => `/vehiculos/${id}/movimientos`,
    iniciarDemo: (idDemo) => `/control-demo/${idDemo}/iniciar`, // ?id_vehiculo=
    cancelarDemo: '/control-demo/cancelar',                      // ?id_vehiculo=
    ws: (id) => `/ws/vehiculos/${id}`,
  }),

  // Clave lógica -> nombres posibles en el catálogo (se normaliza: sin acentos, MAYÚSCULAS, "_").
  // Relaciona las acciones de la interfaz con los nombres de comandos del backend.
  comandos: Object.freeze({
    DETENER: ['DETENER', 'STOP', 'PARAR'],
    AVANZAR: ['AVANZAR', 'ADELANTE'],
    RETROCEDER: ['RETROCEDER', 'ATRAS'],
    IZQUIERDA: ['IZQUIERDA', 'GIRAR_IZQUIERDA', 'GIRO_IZQUIERDA'],
    DERECHA: ['DERECHA', 'GIRAR_DERECHA', 'GIRO_DERECHA'],
    BRAZO_SUBIR: ['SUBIR_BRAZO', 'BRAZO_SUBIR', 'BRAZO_ARRIBA'],
    BRAZO_BAJAR: ['BAJAR_BRAZO', 'BRAZO_BAJAR', 'BRAZO_ABAJO'],
    GARRA_ABRIR: ['GIRAR_GARRA_IZQUIERDA'],
    GARRA_CERRAR: ['GIRAR_GARRA_DERECHA'],
    SONIDO: ['SONIDO', 'CLAXON', 'BOCINA'],
    VELOCIDAD: ['VELOCIDAD', 'CAMBIAR_VELOCIDAD'],
    ENCENDIDO: ['ENCENDIDO', 'ENCENDER', 'APAGAR'],
    LUCES: ['LUCES', 'LUZ', 'ENCENDER_LUCES'],
  }),

  // Dirección del joystick -> clave lógica. `origen` (≤30 car.) queda en el historial del backend.
  // Define la configuración de los joysticks y sus acciones correspondientes.
  joysticks: Object.freeze({
    // Configuración del joystick encargado del movimiento del chasis.
    chasis: Object.freeze({
      nombre: 'Chasis',
      origen: 'WEB_JOYSTICK_CHASIS',
      mapa: Object.freeze({
        arriba: 'AVANZAR',
        abajo: 'RETROCEDER',
        izquierda: 'IZQUIERDA',
        derecha: 'DERECHA'
      }),
    }),

    // Configuración del joystick encargado del brazo y la garra.
    brazo: Object.freeze({
      nombre: 'Brazo y garra',
      origen: 'WEB_JOYSTICK_BRAZO',
      mapa: Object.freeze({
        arriba: 'BRAZO_SUBIR',
        abajo: 'BRAZO_BAJAR',
        izquierda: 'GARRA_ABRIR',
        derecha: 'GARRA_CERRAR'
      }),
    }),
  }),

  // tipo: 'comando' (catálogo) | 'demo' (abre el panel DEMO) | 'pendiente' (sin soporte en la API actual)
  // Define los botones disponibles en la interfaz y sus características visuales.
  botones: Object.freeze([
    // Botones de funciones pendientes de integración.
    { fila: 1, tipo: 'pendiente', etiqueta: 'Voz', icono: 'bi-mic-fill', tono: 'morado' },
    { fila: 1, tipo: 'pendiente', etiqueta: 'Cámara', icono: 'bi-camera-fill', tono: 'morado' },
    { fila: 1, tipo: 'pendiente', etiqueta: 'Giroscopio', icono: 'bi-phone-fill', tono: 'morado' },

    // Botones asociados a comandos disponibles en el catálogo.
    { fila: 2, tipo: 'comando', clave: 'SONIDO', etiqueta: 'Sonido', icono: 'bi-volume-up-fill', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'VELOCIDAD', etiqueta: 'Velocidad', icono: 'bi-speedometer2', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'ENCENDIDO', etiqueta: 'Encendido', icono: 'bi-power', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'LUCES', etiqueta: 'Luces', icono: 'bi-lightbulb-fill', tono: 'azul' },

    // Botón para abrir el panel de demostraciones.
    { fila: 2, tipo: 'demo', etiqueta: 'Demo', icono: 'bi-play-fill', tono: 'naranja' },
  ]),
});
