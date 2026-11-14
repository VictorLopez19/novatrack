
// Configuración única: URLs, clave de la API, endpoints, mapeo de comandos y botones.
// AVISO: la API Key queda visible en el código fuente publicado (riesgo asumido).
// Si cambias las URLs, actualiza también connect-src en la meta CSP de index.html.

// Define la configuración general de la aplicación y evita modificar sus propiedades.
export const CONFIG = Object.freeze({
  // Direcciones base para las conexiones con la API y el WebSocket.
  apiBaseUrl: 'https://drivecore.duckdns.org',
  wsBaseUrl: 'wss://drivecore.duckdns.org',

  // Clave enviada en el encabezado X-API-Key de las operaciones protegidas.
  apiKey: 'KNhXjdS9plM9pNS6cl86Ka4VdxoiZI472HYxnK9E0nE',

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
  }),

  // MONITOREO. Las fechas «sin zona» (sin Z ni ±hh:mm) no se convierten salvo que sinZona sea 'utc'.
  monitoreo: Object.freeze({
    limiteHistorial: 10,
    debounceSyncMs: 300,         // agrupa ráfagas de eventos en una sola consulta REST
    ventanaOmitirSyncMs: 1500,   // no repite una sincronización recién completada
    maxClavesDedup: 60,
    fechas: Object.freeze({ zonaMostrar: 'America/Mexico_City', sinZona: 'tal-cual' }), // 'tal-cual' | 'utc'
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
    estado: (id) => `/vehiculos/${id}/estado`,       // MONITOREO: último estado (EstadoSalida o null)
    historial: (id) => `/vehiculos/${id}/historial`, // MONITOREO: máx. 10 movimientos individuales, recientes primero

    ia: (id) => `/vehiculos/${id}/ia/ejecutar`,
    iaCampo: 'instruccion', // nombre del campo de IAEntrada: confírmalo en /docs
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
    GARRA_IZQUIERDA: ['GIRAR_GARRA_IZQUIERDA', 'GARRA_IZQUIERDA', 'GIRO_GARRA_IZQUIERDA', 'GIRAR_GARRA_IZQ', 'ABRIR_GARRA'],
    GARRA_DERECHA: ['GIRAR_GARRA_DERECHA', 'GARRA_DERECHA', 'GIRO_GARRA_DERECHA', 'GIRAR_GARRA_DER', 'CERRAR_GARRA'],
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
        izquierda: 'GARRA_IZQUIERDA',
        derecha: 'GARRA_DERECHA'
      }),
    }),
  }),

  // tipo: 'comando' (catálogo) | 'demo' (abre el panel DEMO) | 'pendiente' (sin soporte en la API actual)
  // Define los botones disponibles en la interfaz y sus características visuales.
  botones: Object.freeze([
    // Botones de funciones pendientes de integración.
    { fila: 1, tipo: 'voz', etiqueta: 'Voz', icono: 'bi-mic-fill', tono: 'morado' },
    { fila: 1, tipo: 'gesto', etiqueta: 'Gestos', icono: 'bi-hand-index-thumb-fill', tono: 'morado' },
    { fila: 1, tipo: 'giro', etiqueta: 'Giroscopio', icono: 'bi-phone-fill', tono: 'morado' },
    { fila: 1, tipo: 'vr', etiqueta: 'VR', icono: 'bi-badge-vr-fill', tono: 'morado' },

    // Botones asociados a comandos disponibles en el catálogo.
    { fila: 2, tipo: 'comando', clave: 'SONIDO', etiqueta: 'Sonido', icono: 'bi-volume-up-fill', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'VELOCIDAD', etiqueta: 'Velocidad', icono: 'bi-speedometer2', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'ENCENDIDO', etiqueta: 'Encendido', icono: 'bi-power', tono: 'azul' },
    { fila: 2, tipo: 'comando', clave: 'LUCES', etiqueta: 'Luces', icono: 'bi-lightbulb-fill', tono: 'azul' },

    // Botón para abrir el panel de demostraciones.
    { fila: 2, tipo: 'demo', etiqueta: 'Demo', icono: 'bi-play-fill', tono: 'naranja' },
  ]),


  voz: Object.freeze({
    idioma: 'es-MX',
    depurar: true,
    autoDetenerMs: 0, // 0 = sin auto-detención
    movimientos: ['AVANZAR', 'RETROCEDER', 'IZQUIERDA', 'DERECHA', 'BRAZO_SUBIR', 'BRAZO_BAJAR', 'GIRAR_GARRA_IZQUIERDA', 'GIRAR_GARRA_DERECHA'],
    urgentes: ['detente', 'detener', 'deten', 'alto', 'stop', 'frena', 'frenar', 'basta', 'parate'],
    relleno: ['por', 'favor', 'porfa', 'ahora', 'ya', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'hacia', 'a', 'al', 'de', 'del', 'en', 'que', 'poco', 'nova', 'track', 'robot', 'excavadora', 'oye', 'eh', 'mm', 'mmm', 'ah', 'uh', 'em', 'pues', 'bueno', 'hola', 'gracias', 'ok'],
    negaciones: ['no', 'nunca', 'tampoco', 'jamas', 'sin'],
    neutras: ['gira', 'girar', 'giro', 'voltea', 'voltear', 'mueve', 'muevete', 'mover', 've', 'ir', 'ponte', 'pon'],
    palabras: {
      DETENER: ['detente', 'detener', 'deten', 'alto', 'stop', 'para', 'parar', 'frena', 'frenar', 'basta', 'parate', 'paro'],
      AVANZAR: ['avanza', 'avanzar', 'adelante', 'frente', 'recto', 'sigue'],
      RETROCEDER: ['retrocede', 'retroceder', 'atras', 'reversa', 'regresa', 'regresar'],
      IZQUIERDA: ['izquierda', 'izquierdo'],
      DERECHA: ['derecha', 'derecho'],
      BRAZO_SUBIR: ['sube', 'subir', 'levanta', 'levantar', 'arriba', 'brazo'],
      BRAZO_BAJAR: ['baja', 'bajar', 'abajo', 'brazo'],
      GARRA_IZQUIERDA: ['garra izquierda', 'pala izquierda', 'gira garra izquierda', 'gira pala izquierda'],
      GARRA_DERECHA: ['garra derecha', 'pala derecha', 'gira garra derecha', 'gira pala derecha'],
      SONIDO: ['sonido', 'claxon', 'bocina', 'pita', 'pitar'],
      VELOCIDAD: ['velocidad', 'rapido', 'lento', 'acelera'],
      ENCENDIDO: ['enciende', 'encender', 'apaga', 'apagar', 'encendido', 'prende', 'prender'],
      LUCES: ['luces', 'luz', 'focos', 'enciende', 'prende', 'apaga', 'apagar'],
    },
  }),

  gestos: Object.freeze({
    libUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
    wasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    modeloUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    espejo: true,         // true si la cámara frontal entrega la imagen sin espejo (lo normal)
    cuadroMs: 50,         // ~20 lecturas por segundo
    framesMov: 5,         // lecturas seguidas iguales antes de mover (≈ 0.25 s)
    framesParada: 2,      // y antes de detener
    framesUnico: 8,       // acciones de un solo disparo (≈ 0.4 s)
    sinManoMs: 400,       // sin mano o pose rara por este tiempo: detiene
    requiereArmado: true, // primero palma abierta o mano fuera de cuadro
    largoMin: 0.5,        // largo mínimo del índice respecto de la palma
    zonaNeutra: 0.18,     // puño: radio central de la imagen que equivale a «quieto»
    umbralOk: 0.3,        // distancia pulgar–índice (respecto de la palma) para la señal OK
    unicos: ['ENCENDIDO', 'VELOCIDAD', 'SONIDO', 'LUCES'],
    mapa: {               // izquierda y derecha son las del usuario
      indice: { arriba: 'AVANZAR', abajo: 'RETROCEDER', izquierda: 'IZQUIERDA', derecha: 'DERECHA' },
      dosDedos: { arriba: 'BRAZO_SUBIR', abajo: 'BRAZO_BAJAR', izquierda: 'GARRA_IZQUIERDA', derecha: 'GARRA_DERECHA' },
      cuernitos: 'ENCENDIDO', puno: 'VELOCIDAD', tres: 'SONIDO', ok: 'LUCES',
    },
  }),

  giroscopio: Object.freeze({
    umbral: 18,             // grados de inclinación para empezar a mover
    liberacion: 12,         // por debajo de estos grados se suelta la orden (histéresis)
    filtro: 0.2,            // suavizado de las lecturas (0 a 1; menor = más suave)
    calibracionMs: 3000,    // tiempo con el teléfono quieto al calibrar
    sinSensorMs: 2000,      // sin lecturas en este tiempo: se asume que no hay giroscopio
    umbralSacudida: 25,     // aceleración (m/s²) que activa la parada de emergencia
    sacudidaPausaMs: 1800,  // tiempo mínimo entre dos paradas de emergencia
    invertirAdelante: false, // pon true si adelante/atrás sale al revés
    invertirLateral: false,  // pon true si izquierda/derecha sale al revés
    rangoVisual: 30,        // grados que recorre el punto del indicador
  }),

  // Modo VR (realidad mixta con WebXR): el usuario queda dentro de una cabina de excavadora virtual y ve el
  // mundo real por los cristales. Palanca izquierda = chasis, derecha = brazo y garra; panel de botones en el tablero.
  vr: Object.freeze({
    threeUrl: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
    origen: 'WEB_VR',
    profundidad: 0.004,     // m que hay que hundir un botón (medido desde la piel del dedo) para presionarlo
    pinzaCierra: 0.02,      // m entre pulgar e índice para tomar una palanca
    pinzaAbre: 0.035,       // m para soltarla (histéresis)
    alturaOjos: 1.2,        // m de los ojos al piso si el visor no da el piso real (persona sentada)
    pluma: true,            // muestra la pluma, el brazo y la cuchara por el parabrisas (se animan con los comandos)
    mostrarManos: true,     // dibuja el esqueleto de las manos (en el Quest se ven las reales; útil en el emulador)
    depurar: true,          // registra en la consola cada acción ([VR] …) para diagnosticar
  }),
});
