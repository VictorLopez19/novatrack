
// Configuración única: URLs, endpoints, mapeo de comandos y botones.
// Aquí ya no hay secretos: el control se autoriza con la sesión de PIN que el
// administrador aprueba, y la API Key vive solo dentro del servidor.
// Si cambias las URLs, actualiza también connect-src en la meta CSP de index.html.

// Define la configuración general de la aplicación y evita modificar sus propiedades.
export const CONFIG = Object.freeze({
  // Direcciones base para las conexiones con la API y el WebSocket.
  apiBaseUrl: 'https://drivecore.duckdns.org',
  wsBaseUrl: 'wss://drivecore.duckdns.org',

  // Identificador del vehículo seleccionado por defecto.
  vehiculoPorDefecto: 1,

  // Créditos y año de identificación del proyecto, con los perfiles del autor.
  creditos: Object.freeze({
    alumno: 'López Cruz Victor Manuel',
    anio: 2026,

    // Enlaces del pie de página. La «ó» del perfil de LinkedIn va codificada (%C3%B3).
    redes: Object.freeze([
      Object.freeze({
        nombre: 'LinkedIn',
        icono: 'bi-linkedin',
        url: 'https://www.linkedin.com/in/victor-manuel-l%C3%B3pez-cruz-34bb39349',
      }),
      Object.freeze({
        nombre: 'GitHub',
        icono: 'bi-github',
        url: 'https://github.com/VictorLopez19',
      }),
    ]),
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
    largoMs: 1000,   // pulsación mantenida que dispara `claveLarga` (apagar)
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

    // SESIONES: una por cada carga de la página (PIN de 5 dígitos que autoriza el administrador).
    sesiones: '/sesiones',
    sesionCerrar: (token) => `/sesiones/${encodeURIComponent(token)}/cerrar`, // navigator.sendBeacon al salir
    wsSesion: (token) => `/ws/sesiones/${encodeURIComponent(token)}`,

    // ADMINISTRACIÓN (Authorization: Bearer). Las credenciales solo se validan en el servidor.
    adminLogin: '/admin/login',
    adminLogout: '/admin/logout',
    adminSesiones: '/admin/sesiones',
    adminPermiso: (pin) => `/admin/sesiones/${pin}/permiso`,
    adminPermisoTodas: '/admin/sesiones/permiso',
    adminCerrar: (pin) => `/admin/sesiones/${pin}/cerrar`,
    adminConfiguracion: '/admin/configuracion',
    adminDetener: (id) => `/admin/vehiculos/${id}/detener`,
    wsAdmin: '/ws/admin',
  }),

  // Sesión de control y panel de administración.
  sesion: Object.freeze({
    recargaMs: 1800,          // espera antes de recargar cuando el administrador cierra la sesión
    reintentoMaxMs: 30000,    // tope del reintento al crear la sesión si la API no responde
    claveAdmin: 'novatrack.admin', // sessionStorage: el login del admin dura lo que la pestaña
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
    // Encender y apagar son comandos distintos del catálogo (antes eran uno solo).
    ENCENDER: ['ENCENDER', 'ENCENDIDO', 'PRENDER', 'ARRANCAR'],
    APAGAR: ['APAGAR', 'APAGADO'],
    LUCES: ['LUZ', 'LUCES', 'ENCENDER_LUCES'],
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
  // `claveLarga`: comando alterno que se envía al mantener pulsado el botón (ver tiempos.largoMs).
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
    // Toque: enciende. Mantener pulsado: apaga.
    {
      fila: 2, tipo: 'comando', clave: 'ENCENDER', claveLarga: 'APAGAR',
      etiqueta: 'Encendido', icono: 'bi-power', tono: 'azul',
      ayuda: 'Toca para encender; mantén pulsado para apagar',
    },
    { fila: 2, tipo: 'comando', clave: 'LUCES', etiqueta: 'Luces', icono: 'bi-lightbulb-fill', tono: 'azul' },

    // Botón para abrir el panel de demostraciones.
    { fila: 2, tipo: 'demo', etiqueta: 'Demo', icono: 'bi-play-fill', tono: 'naranja' },
  ]),


  voz: Object.freeze({
    idioma: 'es-MX',
    depurar: true,
    autoDetenerMs: 0, // 0 = sin auto-detención
    // Claves lógicas que se tratan como movimiento sostenido (las demás son de un solo disparo).
    movimientos: ['AVANZAR', 'RETROCEDER', 'IZQUIERDA', 'DERECHA', 'BRAZO_SUBIR', 'BRAZO_BAJAR', 'GARRA_IZQUIERDA', 'GARRA_DERECHA'],
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
      // Encender y apagar son comandos distintos: «enciende» y «apaga» ya no son ambiguos.
      // Las luces conservan «enciende»/«apaga» como frases («enciende las luces»).
      ENCENDER: ['enciende', 'encender', 'encendido', 'prende', 'prender', 'arranca', 'arrancar'],
      APAGAR: ['apaga', 'apagar', 'apagado'],
      LUCES: ['luces', 'luz', 'focos', 'enciende las luces', 'prende las luces',
              'apaga las luces', 'enciende la luz', 'apaga la luz'],
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
    unicos: ['ENCENDER', 'APAGAR', 'VELOCIDAD', 'SONIDO', 'LUCES'],
    framesSostenido: 22,  // mantener el gesto este tiempo más (≈1.1 s) dispara la acción alterna
    sostenidos: { ENCENDER: 'APAGAR' }, // igual que el botón: un toque enciende, mantenerlo apaga
    mapa: {               // izquierda y derecha son las del usuario
      indice: { arriba: 'AVANZAR', abajo: 'RETROCEDER', izquierda: 'IZQUIERDA', derecha: 'DERECHA' },
      dosDedos: { arriba: 'BRAZO_SUBIR', abajo: 'BRAZO_BAJAR', izquierda: 'GARRA_IZQUIERDA', derecha: 'GARRA_DERECHA' },
      cuernitos: 'ENCENDER', puno: 'VELOCIDAD', tres: 'SONIDO', ok: 'LUCES',
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
    largoMs: 650,           // tiempo hundido que convierte el botón de encendido en apagado
    pinzaCierra: 0.02,      // m entre pulgar e índice para tomar una palanca
    pinzaAbre: 0.035,       // m para soltarla (histéresis)
    alturaOjos: 1.2,        // m de los ojos al piso de la cabina: siempre se siente sentado, aunque estés de pie
    pluma: true,            // muestra la pluma, el brazo y la cuchara por el parabrisas (se animan con los comandos)
    mostrarManos: true,     // dibuja el esqueleto de las manos (en el Quest se ven las reales; útil en el emulador)
    depurar: true,          // registra en la consola cada acción ([VR] …) para diagnosticar
  }),
});
